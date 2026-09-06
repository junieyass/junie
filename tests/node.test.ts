/**
 * Unit tests for the Node: handshake, resume, stats, routing, reconnection.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  createTestClient,
  connectNode,
  makeStats,
  makeApiTrack,
  createFetchStub,
  jsonResponse,
  textResponse,
  resetSockets,
  fakeWebSocketFactory,
  FakeWebSocket,
} from './fixtures.js';
import { Junie } from '../src/Junie.js';
import { JUNIE_VERSION } from '../src/constants.js';
import type { APIPlayer } from '../src/types/api.js';

describe('Node', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('connects with the required handshake headers', async () => {
    const { junie, socket } = createTestClient();
    expect(socket.url).toBe('ws://localhost:2333/v4/websocket');
    expect(socket.headers).toMatchObject({
      Authorization: 'youshallnotpass',
      'User-Id': '111222333444555666',
      'Client-Name': `Junie/${JUNIE_VERSION}`,
    });
    expect(socket.headers['Session-Id']).toBeUndefined();

    await connectNode(socket);
    expect(junie.nodes.get('test')!.connected).toBe(true);
    expect(junie.nodes.get('test')!.sessionId).toBe('sess-1');
  });

  it('configures session resuming after a fresh ready', async () => {
    const { fetch, calls } = createFetchStub(() => jsonResponse({}));
    vi.stubGlobal('fetch', fetch);
    const { socket } = createTestClient();

    await connectNode(socket);
    const resumeCall = calls.find((call) => call.url.includes('/v4/sessions/sess-1'));
    expect(resumeCall).toBeDefined();
    expect(resumeCall!.method).toBe('PATCH');
    expect(resumeCall!.body).toEqual({ resuming: true, timeout: 60 });
  });

  it('detects the Lavalink version after ready', async () => {
    const { fetch, calls } = createFetchStub(() => textResponse('4.0.8'));
    vi.stubGlobal('fetch', fetch);
    const { junie, socket } = createTestClient();
    await connectNode(socket);
    const node = junie.nodes.get('test')!;

    await vi.waitFor(() => expect(node.lavalinkVersion).toBe('4.0.8'));
    expect(calls.some((call) => call.url === 'http://localhost:2333/version')).toBe(true);
  });

  it('emits versionMismatch when the server major differs', async () => {
    const { fetch } = createFetchStub(() => textResponse('3.7.13'));
    vi.stubGlobal('fetch', fetch);
    const { junie, socket } = createTestClient();
    const node = junie.nodes.get('test')!;

    const mismatches: Array<{ version: string; expected: number }> = [];
    node.on('versionMismatch', (_node, info) => mismatches.push(info));

    await connectNode(socket);
    await vi.waitFor(() => expect(node.lavalinkVersion).toBe('3.7.13'));

    expect(mismatches).toEqual([{ version: '3.7.13', expected: 4 }]);
  });

  it('survives servers without a /version route', async () => {
    const { fetch } = createFetchStub(() => jsonResponse({}, 404));
    vi.stubGlobal('fetch', fetch);
    const { junie, socket } = createTestClient();
    await connectNode(socket);
    const node = junie.nodes.get('test')!;

    await expect(node.detectVersion()).resolves.toBe(null);
    expect(node.connected).toBe(true);
  });

  it('sends the previous Session-Id header when reconnecting', async () => {
    const { fetch } = createFetchStub(() => jsonResponse({}));
    vi.stubGlobal('fetch', fetch);
    const { junie, socket } = createTestClient();
    const node = junie.nodes.get('test')!;
    await connectNode(socket);
    expect(node.sessionId).toBe('sess-1');

    node.forceReconnect();
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(FakeWebSocket.instances.length).toBeGreaterThanOrEqual(2);
    const newest = FakeWebSocket.instances[FakeWebSocket.instances.length - 1]!;
    expect(newest.headers['Session-Id']).toBe('sess-1');
  });

  it('marks a session as resumed when the server says so', async () => {
    const { junie, socket } = createTestClient({ resume: { enabled: false } });
    const node = junie.nodes.get('test')!;

    await connectNode(socket, { resumed: true, sessionId: 'same-session' });
    expect(node.resumed).toBe(true);
    expect(node.sessionId).toBe('same-session');
  });

  it('tracks stats and reports freshness', async () => {
    const { junie, socket } = createTestClient({ resume: { enabled: false } });
    const node = junie.nodes.get('test')!;
    await connectNode(socket);

    const stats = makeStats({ players: 7, playingPlayers: 3 });
    socket.message(stats);
    expect(node.stats?.players).toBe(7);
    expect(node.stats?.playingPlayers).toBe(3);
    expect(node.isHealthy).toBe(true);
  });

  it('routes playerUpdate and events to the owning player', async () => {
    const { fetch } = createFetchStub(() => jsonResponse({} as APIPlayer));
    vi.stubGlobal('fetch', fetch);
    const { junie, socket } = createTestClient({ resume: { enabled: false } });
    await connectNode(socket);

    const player = junie.createPlayer({ guildId: 'g1', voiceChannelId: 'vc1' });
    const updates: unknown[] = [];
    const events: string[] = [];
    junie.on('playerUpdate', (_p, state) => updates.push(state));
    junie.on('trackStart', () => events.push('trackStart'));

    socket.message({ op: 'playerUpdate', guildId: 'g1', state: { time: 1, position: 42, connected: true, ping: 12 } });
    expect(player.position).toBe(42);
    expect(player.ping).toBe(12);
    expect(updates).toHaveLength(1);

    socket.message({ op: 'event', guildId: 'g1', type: 'TrackStartEvent', track: makeApiTrack('Song') });
    expect(events).toHaveLength(1);
  });

  it('schedules reconnects with backoff and gives up after max retries', async () => {
    vi.useFakeTimers();
    const { fetch } = createFetchStub(() => jsonResponse({}));
    vi.stubGlobal('fetch', fetch);
    const { junie, socket } = createTestClient({
      reconnect: { retries: 2, initialDelay: 100, multiplier: 2, maxDelay: 1000, jitter: false },
    });
    const node = junie.nodes.get('test')!;
    await connectNode(socket, { settle: false });

    const reconnecting = vi.fn();
    const failed = vi.fn();
    junie.on('nodeReconnecting', reconnecting);
    junie.on('nodeReconnectFailed', failed);

    socket.emitClose(1006, 'boom');
    expect(node.connected).toBe(false);
    expect(reconnecting).toHaveBeenCalledWith(node, { attempt: 1, delay: 100 });

    await vi.advanceTimersByTimeAsync(100);
    const socket2 = FakeWebSocket.instances[1]!;
    socket2.emitClose(1006, 'boom');
    expect(reconnecting).toHaveBeenCalledTimes(2);
    expect(reconnecting).toHaveBeenLastCalledWith(node, { attempt: 2, delay: 200 });

    await vi.advanceTimersByTimeAsync(200);
    const socket3 = FakeWebSocket.instances[2]!;
    socket3.emitClose(1006, 'boom');
    expect(failed).toHaveBeenCalledTimes(1);
    expect(reconnecting).toHaveBeenCalledTimes(2); // no third attempt scheduled.

    await vi.advanceTimersByTimeAsync(10_000);
    expect(node.connected).toBe(false);
  });

  it('emits node error payloads', async () => {
    const { junie, socket } = createTestClient();
    const errors: Error[] = [];
    junie.on('nodeError', (_node, error) => errors.push(error));

    socket.emitError(new Error('ECONNREFUSED'));
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toBe('ECONNREFUSED');
  });

  it('exposes search through REST with source prefixes', async () => {
    const apiTrack = makeApiTrack('Result');
    const { fetch, calls } = createFetchStub(() =>
      jsonResponse({ loadType: 'search', playlistInfo: { name: '', selectedTrack: -1 }, data: [apiTrack] }),
    );
    vi.stubGlobal('fetch', fetch);
    const { junie, socket } = createTestClient({ resume: { enabled: false } });
    await connectNode(socket);
    const node = junie.nodes.get('test')!;

    const result = await node.search({ query: 'hello', source: 'soundcloud' });
    expect(result.tracks).toHaveLength(1);
    expect(result.tracks[0]!.title).toBe('Result');
    const loadCall = calls.find((call) => call.url.includes('/loadtracks'));
    expect(loadCall!.url).toContain('identifier=scsearch%3Ahello');
  });

  it('caches node info and lists plugins', async () => {
    const { fetch, calls } = createFetchStub(() =>
      jsonResponse({
        version: { semver: '4.0.8', major: 4, minor: 0, patch: 8 },
        buildTime: 1,
        git: { commit: 'a', commitTime: 1 },
        plugins: [{ name: 'lavasrc', version: '1.0.0' }],
      }),
    );
    vi.stubGlobal('fetch', fetch);
    const { junie, socket } = createTestClient({ resume: { enabled: false } });
    await connectNode(socket);
    const node = junie.nodes.get('test')!;

    await node.getInfo();
    await node.getInfo();
    expect(calls.filter((call) => call.url.includes('/info'))).toHaveLength(1);
    expect(await node.getPluginNames()).toEqual(['lavasrc']);
  });

  it('computes its own penalty score', async () => {
    const { junie, socket } = createTestClient({ resume: { enabled: false } });
    const node = junie.nodes.get('test')!;
    await connectNode(socket);
    node.stats = makeStats({ playingPlayers: 1, systemLoad: 0, nulled: 0, deficit: 0 });

    expect(node.penalty()).toBeCloseTo(1, 5);
    expect(node.penalty('us-west1.discord.media')).toBeCloseTo(1, 5);
  });

  it('destroy() closes the socket and stops reconnecting', async () => {
    vi.useFakeTimers();
    const { fetch } = createFetchStub(() => jsonResponse({}));
    vi.stubGlobal('fetch', fetch);
    const { junie, socket } = createTestClient();
    const node = junie.nodes.get('test')!;
    await connectNode(socket, { settle: false });

    const destroyListener = vi.fn();
    junie.on('nodeDestroy', destroyListener);

    node.destroy();
    expect(node.destroyed).toBe(true);
    expect(socket.closed).toBe(true);
    expect(destroyListener).toHaveBeenCalledTimes(1);

    const socketCount = FakeWebSocket.instances.length;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(FakeWebSocket.instances.length).toBe(socketCount);
  });

  it('ignores invalid JSON messages without dying', async () => {
    const { junie, socket } = createTestClient({ resume: { enabled: false } });
    const errors: Error[] = [];
    junie.on('nodeError', (_n, error) => errors.push(error));

    await connectNode(socket);
    const listeners = socket.listeners.get('message');
    expect(listeners).toBeDefined();
    for (const listener of [...listeners!]) listener('this is not json');

    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(junie.nodes.get('test')!.connected).toBe(true);
  });
});

describe('Node fan-out search', () => {
  function createTwoNodeClient(): Junie {
    resetSockets();
    const junie = new Junie({
      nodes: [
        { id: 'n1', host: 'localhost', port: 1, authorization: 'x' },
        { id: 'n2', host: 'localhost', port: 2, authorization: 'x' },
      ],
      sendToShard: async () => undefined,
      logLevel: 'silent',
      webSocketFactory: fakeWebSocketFactory,
    });
    junie.init('1');
    return junie;
  }

  it('resolves with the first non-empty result across nodes', async () => {
    const track = makeApiTrack('B');
    let callCount = 0;
    const { fetch } = createFetchStub(() => {
      callCount += 1;
      const body = callCount === 1
        ? { loadType: 'empty', playlistInfo: { name: '', selectedTrack: -1 }, data: {} }
        : { loadType: 'search', playlistInfo: { name: '', selectedTrack: -1 }, data: [track] };
      return jsonResponse(body);
    });
    vi.stubGlobal('fetch', fetch);

    const junie = createTwoNodeClient();
    for (const node of junie.nodes.list()) node.connected = true;

    const result = await junie.nodes.fanOutSearch('query');
    expect(result.tracks).toHaveLength(1);
    expect(result.tracks[0]!.title).toBe('B');
  });

  it('falls back to the empty result when all nodes return nothing', async () => {
    const { fetch } = createFetchStub(() =>
      jsonResponse({ loadType: 'empty', playlistInfo: { name: '', selectedTrack: -1 }, data: {} }),
    );
    vi.stubGlobal('fetch', fetch);
    const junie = createTwoNodeClient();
    for (const node of junie.nodes.list()) node.connected = true;

    const result = await junie.nodes.fanOutSearch('query');
    expect(result.isEmpty).toBe(true);
  });

  it('throws when no node is connected', async () => {
    const junie = createTwoNodeClient();
    await expect(junie.nodes.fanOutSearch('query')).rejects.toThrow(/No connected Lavalink node/);
  });
});
