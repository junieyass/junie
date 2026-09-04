/**
 * Unit tests for the Junie client: init, registry, search, events, destroy.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  createTestClient,
  connectNode,
  deliverVoice,
  makeApiTrack,
  createFetchStub,
  jsonResponse,
  resetSockets,
  fakeWebSocketFactory,
  FakeWebSocket,
} from './fixtures.js';
import { Junie } from '../src/Junie.js';
import { RoundRobinStrategy } from '../src/node/strategies/index.js';
import { Track } from '../src/track/Track.js';
import { JunieErrorCode } from '../src/errors.js';
import type { APIPlayer } from '../src/types/api.js';

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 25));

describe('Junie client', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('registers and connects nodes on init', async () => {
    const { junie, socket } = createTestClient();
    expect(junie.nodes.size).toBe(1);
    expect(socket.url).toBe('ws://localhost:2333/v4/websocket');
    await connectNode(socket);
    expect(junie.nodes.get('test')!.connected).toBe(true);
    expect(junie.userId).toBe('111222333444555666');
    expect(junie.clientName).toBe('Junie/1.0.0');
  });

  it('requires a user id', () => {
    resetSockets();
    expect(
      () =>
        new Junie({
          nodes: [{ id: 'x', host: 'localhost', authorization: 'y' }],
          sendToShard: () => undefined,
          logLevel: 'silent',
          webSocketFactory: fakeWebSocketFactory,
        }).init(),
    ).toThrow(JunieErrorCode.MISSING_USER_ID);
  });

  it('rejects duplicate node ids', () => {
    const { junie } = createTestClient();
    expect(() =>
      junie.nodes.create({ id: 'test', host: 'localhost', authorization: 'y' }),
    ).toThrow(JunieErrorCode.NODE_ALREADY_EXISTS);
  });

  it('emits node lifecycle events', async () => {
    const { junie, socket } = createTestClient({ resume: { enabled: false } });
    const seen: string[] = [];
    junie.on('nodeConnect', () => seen.push('connect'));
    junie.on('nodeStats', () => seen.push('stats'));

    await connectNode(socket);
    socket.message({
      op: 'stats',
      players: 0, playingPlayers: 0, uptime: 0,
      memory: { free: 0, used: 0, allocated: 0, reservable: 0 },
      cpu: { cores: 1, systemLoad: 0, lavalinkLoad: 0 },
    });
    await flush();

    expect(seen).toEqual(['connect', 'stats']);
  });

  it('creates players through the strategy and emits playerCreate', async () => {
    const { fetch } = createFetchStub(() => jsonResponse({} as APIPlayer));
    vi.stubGlobal('fetch', fetch);
    const { junie, socket } = createTestClient();
    await connectNode(socket);

    const created: string[] = [];
    junie.on('playerCreate', (player) => created.push(player.guildId));

    const player = junie.createPlayer({ guildId: 'g1', voiceChannelId: 'vc1' });
    expect(created).toEqual(['g1']);
    expect(junie.players.get('g1')).toBe(player);
    expect(junie.getPlayer('g1')).toBe(player);
    expect(junie.requirePlayer('g1')).toBe(player);
    expect(junie.players.has('g9')).toBe(false);
    expect(() => junie.requirePlayer('g9')).toThrow(JunieErrorCode.PLAYER_NOT_FOUND);
  });

  it('returns the existing player for the same guild (idempotent create)', async () => {
    const { junie, socket } = createTestClient({ resume: { enabled: false } });
    await connectNode(socket);

    const first = junie.createPlayer({ guildId: 'g1', voiceChannelId: 'vc1', textChannelId: 't1' });
    const second = junie.createPlayer({ guildId: 'g1', voiceChannelId: 'vc2', textChannelId: 't2' });
    expect(second).toBe(first);
    expect(first.voiceChannelId).toBe('vc2');
    expect(first.textChannelId).toBe('t2');
    expect(junie.players.size).toBe(1);
  });

  it('pins players to a chosen node', async () => {
    resetSockets();
    const { fetch } = createFetchStub(() => jsonResponse({}));
    vi.stubGlobal('fetch', fetch);
    const junie = new Junie({
      nodes: [
        { id: 'a', host: 'localhost', port: 1, authorization: 'x' },
        { id: 'b', host: 'localhost', port: 2, authorization: 'x' },
      ],
      sendToShard: async () => undefined,
      logLevel: 'silent',
      webSocketFactory: fakeWebSocketFactory,
      resume: { enabled: false },
      strategy: new RoundRobinStrategy(),
    });
    junie.init('1');

    // Connect only node b.
    const socketB = FakeWebSocket.instances[1]!;
    await connectNode(socketB, { sessionId: 'sb' });

    const player = junie.createPlayer({ guildId: 'g1', voiceChannelId: 'vc', node: 'b' });
    expect(player.node.id).toBe('b');
    expect(() =>
      junie.createPlayer({ guildId: 'g2', voiceChannelId: 'vc', node: 'missing' }),
    ).toThrow(JunieErrorCode.NODE_NOT_FOUND);
  });

  it('searches with the default source and attaches requesters', async () => {
    const apiTrack = makeApiTrack('Found');
    const { fetch, calls } = createFetchStub(() =>
      jsonResponse({ loadType: 'search', playlistInfo: { name: '', selectedTrack: -1 }, data: [apiTrack] }),
    );
    vi.stubGlobal('fetch', fetch);
    const { junie, socket } = createTestClient({ resume: { enabled: false } });
    await connectNode(socket);

    const requester = { id: 'u1' };
    const result = await junie.search('hello world', requester);

    expect(result.tracks).toHaveLength(1);
    expect(result.tracks[0]!.requester).toBe(requester);
    expect(calls[0]!.url).toContain('identifier=ytsearch%3Ahello%20world');
  });

  it('searches in parallel across nodes when asked', async () => {
    const track = makeApiTrack('Parallel');
    let callCount = 0;
    const { fetch, calls } = createFetchStub(() => {
      callCount += 1;
      const body = callCount === 1
        ? { loadType: 'empty', playlistInfo: { name: '', selectedTrack: -1 }, data: {} }
        : { loadType: 'track', playlistInfo: { name: '', selectedTrack: -1 }, data: track };
      return jsonResponse(body);
    });
    vi.stubGlobal('fetch', fetch);

    resetSockets();
    const junie = new Junie({
      nodes: [
        { id: 'n1', host: 'localhost', port: 1, authorization: 'x' },
        { id: 'n2', host: 'localhost', port: 2, authorization: 'x' },
      ],
      sendToShard: async () => undefined,
      logLevel: 'silent',
      webSocketFactory: fakeWebSocketFactory,
      resume: { enabled: false },
    });
    junie.init('1');
    for (const node of junie.nodes.list()) node.connected = true;

    const result = await junie.search({ query: 'q', parallel: true });
    expect(result.tracks).toHaveLength(1);
    expect(calls.length).toBeGreaterThanOrEqual(2);
  });

  it('forwards raw packets only for the bot user', async () => {
    const { fetch } = createFetchStub(() => jsonResponse({} as APIPlayer));
    vi.stubGlobal('fetch', fetch);
    const { junie, socket } = createTestClient({ resume: { enabled: false } });
    await connectNode(socket);
    const player = junie.createPlayer({ guildId: 'g1', voiceChannelId: 'vc1' });

    // Another user's voice state is ignored.
    junie.sendRawData({
      t: 'VOICE_STATE_UPDATE',
      d: { user_id: 'not-the-bot', guild_id: 'g1', channel_id: 'vc1', session_id: 's' },
    });
    expect(player.voiceState.sessionId).toBeUndefined();

    const connecting = player.connect();
    deliverVoice(junie, 'g1', 'vc1');
    await connecting;
    expect(player.voiceState.sessionId).toBe('voice-session-1');
  });

  it('ignores unrelated raw packets', () => {
    const { junie } = createTestClient();
    expect(() => {
      junie.sendRawData({ t: 'MESSAGE_CREATE', d: { hello: 1 } });
      junie.sendRawData({ t: null, d: {} });
      junie.sendRawData({ d: { x: 1 } } as never);
    }).not.toThrow();
  });

  it('exposes utility helpers', () => {
    const { junie } = createTestClient();
    const track = junie.utils.buildTrack(makeApiTrack('Util'), { id: 'u' });
    expect(track).toBeInstanceOf(Track);
    expect(track.requester).toEqual({ id: 'u' });
    expect(junie.utils.formatDuration(65_000)).toBe('1:05');
    expect(junie.utils.formatDuration(0, true)).toBe('LIVE');
    expect(junie.utils.parseVoiceRegion('eu-central586.discord.media')).toBe('eu-central');
    expect(junie.utils.regionZone('us-east')).toBe('north-america');
  });

  it('destroy() tears down players and nodes', async () => {
    const { fetch, calls } = createFetchStub(() => jsonResponse({}));
    vi.stubGlobal('fetch', fetch);
    const { junie, socket } = createTestClient({ resume: { enabled: false } });
    await connectNode(socket);
    const player = junie.createPlayer({ guildId: 'g1', voiceChannelId: 'vc1' });
    const node = junie.nodes.get('test')!;
    await joinVoiceFor(junie, player);

    await junie.destroy();
    expect(player.lifecycle).toBe('destroyed');
    expect(node.destroyed).toBe(true);
    expect(socket.closed).toBe(true);
    expect(calls.some((call) => call.method === 'DELETE' && call.url.includes('/players/g1'))).toBe(true);

    // Idempotent.
    await junie.destroy();
  });

  async function joinVoiceFor(junie: Junie, player: ReturnType<Junie['createPlayer']>): Promise<void> {
    const connecting = player.connect();
    deliverVoice(junie, 'g1', 'vc1');
    await connecting;
  }
});
