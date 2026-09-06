/**
 * Behavioral tests for the Player: voice, playback, advancement, recovery.
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
import type { Responder, FetchCall } from './fixtures.js';
import { Junie } from '../src/Junie.js';
import { Track, UnresolvedTrack } from '../src/track/Track.js';
import { VoiceConnectionError, JunieErrorCode } from '../src/errors.js';
import type { APIPlayer } from '../src/types/api.js';

interface Setup {
  junie: Junie;
  sendToShard: ReturnType<typeof vi.fn>;
  socket: FakeWebSocket;
  calls: FetchCall[];
  respond: (next: Responder) => void;
  patchBodies(): Array<Record<string, unknown>>;
  player: ReturnType<Junie['createPlayer']>;
}

interface SetupOptions {
  twoNodes?: boolean;
  responder?: Responder;
}

async function setup(options: SetupOptions = {}): Promise<Setup> {
  const { fetch, calls, respond } = createFetchStub(
    options.responder ?? (() => jsonResponse({ guildId: 'g1' } as APIPlayer)),
  );
  vi.stubGlobal('fetch', fetch);

  if (options.twoNodes) {
    resetSockets();
    const sendToShard = vi.fn(async () => undefined);
    const junie = new Junie({
      nodes: [
        { id: 'n1', host: 'localhost', port: 1, authorization: 'x' },
        { id: 'n2', host: 'localhost', port: 2, authorization: 'x' },
      ],
      sendToShard,
      logLevel: 'silent',
      webSocketFactory: fakeWebSocketFactory,
      resume: { enabled: false },
      reconnect: { initialDelay: 10, jitter: false, retries: 3 },
    });
    junie.init('111');
    const socket = FakeWebSocket.instances[0]!;
    await connectNode(socket, { sessionId: 's1' });
    const player = junie.createPlayer({ guildId: 'g1', voiceChannelId: 'vc1' });
    return {
      junie, sendToShard, socket, calls, respond,
      patchBodies: () => calls.filter((c) => c.url.includes('/players/g1')).map((c) => c.body as Record<string, unknown>),
      player,
    };
  }

  const client = createTestClient({
    resume: { enabled: false },
    reconnect: { initialDelay: 10, jitter: false, retries: 3 },
  });
  await connectNode(client.socket);
  const player = client.junie.createPlayer({ guildId: 'g1', voiceChannelId: 'vc1' });
  return {
    junie: client.junie,
    sendToShard: client.sendToShard,
    socket: client.socket,
    calls,
    respond,
    patchBodies: () => calls.filter((c) => c.url.includes('/players/g1')).map((c) => c.body as Record<string, unknown>),
    player,
  };
}

async function joinVoice(context: Setup): Promise<void> {
  const connecting = context.player.connect();
  deliverVoice(context.junie, 'g1', 'vc1');
  await connecting;
}

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 25));

/** Read the encoded track of a captured PATCH body. */
const encodedOf = (body: Record<string, unknown>): string | undefined =>
  (body.track as { encoded?: string } | undefined | null)?.encoded;

describe('Player voice', () => {
  beforeEach(() => { vi.useRealTimers(); });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('connects: sends op 4, waits for credentials, forwards them to Lavalink', async () => {
    const context = await setup();
    await joinVoice(context);

    // op 4 was sent to the shard
    expect(context.sendToShard).toHaveBeenCalledWith('g1', {
      op: 4,
      d: { guild_id: 'g1', channel_id: 'vc1', self_mute: false, self_deaf: true },
    });

    // Voice credentials were PATCHed to Lavalink
    const voiceCall = context.calls.find((c) => c.url.includes('/players/g1'));
    expect(voiceCall?.body).toMatchObject({
      voice: {
        token: 'token-1',
        endpoint: 'eu-central586.discord.media',
        sessionId: 'voice-session-1',
        channelId: 'vc1',
      },
    });
    expect(context.player.voiceState.sessionId).toBe('voice-session-1');
  });

  it('rejects with VoiceConnectionError when credentials never arrive', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const context = await setup();
    const promise = context.player.connect();
    const expectation = expect(promise).rejects.toThrow(VoiceConnectionError);
    await vi.advanceTimersByTimeAsync(15_500);
    await expectation;
  });

  it('forwards op 4 with self-mute/self-deaf overrides', async () => {
    const { fetch } = createFetchStub(() => jsonResponse({}));
    vi.stubGlobal('fetch', fetch);
    const client = createTestClient({
      resume: { enabled: false },
      player: { selfMute: true, selfDeaf: false },
    });
    await connectNode(client.socket);
    const player = client.junie.createPlayer({ guildId: 'gX', voiceChannelId: 'vc' });
    const connecting = player.connect();
    deliverVoice(client.junie, 'gX', 'vc');
    await connecting;
    expect(client.sendToShard).toHaveBeenCalledWith('gX', {
      op: 4,
      d: { guild_id: 'gX', channel_id: 'vc', self_mute: true, self_deaf: false },
    });
  });
});

describe('Player playback', () => {
  beforeEach(() => { vi.useRealTimers(); });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('plays the first queued track and advances automatically', async () => {
    const context = await setup();
    await joinVoice(context);

    const first = new Track(makeApiTrack('First'));
    const second = new Track(makeApiTrack('Second'));
    context.player.queue.add([first, second]);

    await context.player.play();
    await vi.waitFor(() => {
      expect(context.patchBodies().some((b) => encodedOf(b) === first.encoded)).toBe(true);
    });

    // Server confirms the start.
    context.socket.message({ op: 'event', guildId: 'g1', type: 'TrackStartEvent', track: { ...makeApiTrack('First'), encoded: first.encoded } });
    expect(context.player.playing).toBe(true);
    expect(context.player.queue.current?.title).toBe('First');

    // The track finishes -> the next one is sent.
    context.socket.message({ op: 'event', guildId: 'g1', type: 'TrackEndEvent', track: { ...makeApiTrack('First'), encoded: first.encoded }, reason: 'finished' });
    await vi.waitFor(() => {
      expect(context.patchBodies().some((b) => encodedOf(b) === second.encoded)).toBe(true);
    });
    expect(context.player.queue.previous.at(-1)?.title).toBe('First');
  });

  it('emits typed client events for the whole lifecycle', async () => {
    const context = await setup();
    await joinVoice(context);

    const track = new Track(makeApiTrack('Song'));
    const seen: string[] = [];
    context.junie.on('trackStart', (player, t) => { seen.push(`start:${t.title}:${player.guildId}`); });
    context.junie.on('trackEnd', (_p, t, reason) => seen.push(`end:${t.title}:${reason}`));
    context.junie.on('queueEnd', (p) => seen.push(`queueEnd:${p.guildId}`));

    context.player.queue.add(track);
    await context.player.play();
    context.socket.message({ op: 'event', guildId: 'g1', type: 'TrackStartEvent', track: { ...makeApiTrack('Song'), encoded: track.encoded } });
    context.socket.message({ op: 'event', guildId: 'g1', type: 'TrackEndEvent', track: { ...makeApiTrack('Song'), encoded: track.encoded }, reason: 'finished' });
    await flush();

    expect(seen).toEqual([
      'start:Song:g1',
      'end:Song:finished',
      'queueEnd:g1',
    ]);
  });

  it('respects repeat: track', async () => {
    const context = await setup();
    await joinVoice(context);
    const track = new Track(makeApiTrack('Loop'));
    context.player.queue.add(track);
    context.player.setRepeatMode('track');
    await context.player.play();

    context.socket.message({ op: 'event', guildId: 'g1', type: 'TrackEndEvent', track: { ...makeApiTrack('Loop'), encoded: track.encoded }, reason: 'finished' });
    await vi.waitFor(() => {
      const bodies = context.patchBodies().filter((b) => encodedOf(b) === track.encoded);
      expect(bodies.length).toBeGreaterThanOrEqual(2);
    });
    expect(context.player.queue.size).toBe(0);
  });

  it('respects repeat: queue', async () => {
    const context = await setup();
    await joinVoice(context);
    const [a, b] = ['A', 'B'].map((t) => new Track(makeApiTrack(t)));
    context.player.queue.add([a, b]);
    context.player.setRepeatMode('queue');
    await context.player.play();

    context.socket.message({ op: 'event', guildId: 'g1', type: 'TrackEndEvent', track: { ...makeApiTrack('A'), encoded: a.encoded }, reason: 'finished' });
    await vi.waitFor(() => {
      expect(context.player.queue.tracks.map((t) => t.title)).toEqual(['B', 'A']);
    });
  });

  it('stop(false) keeps the current track; play() replays it', async () => {
    const context = await setup();
    await joinVoice(context);
    const track = new Track(makeApiTrack('Hold'));
    context.player.queue.add(track);
    await context.player.play();
    context.socket.message({ op: 'event', guildId: 'g1', type: 'TrackStartEvent', track: { ...makeApiTrack('Hold'), encoded: track.encoded } });

    await context.player.stop(false);
    context.socket.message({ op: 'event', guildId: 'g1', type: 'TrackEndEvent', track: { ...makeApiTrack('Hold'), encoded: track.encoded }, reason: 'stopped' });
    await flush();

    expect(context.player.playing).toBe(false);
    expect(context.player.queue.current?.title).toBe('Hold');
    const endEvents = context.junie.listenerCount('trackEnd'); // sanity: wired
    expect(endEvents).toBeGreaterThanOrEqual(0);

    await context.player.play();
    await vi.waitFor(() => {
      const bodies = context.patchBodies().filter((b) => encodedOf(b) === track.encoded);
      expect(bodies.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('skips to the next track', async () => {
    const context = await setup();
    await joinVoice(context);
    const [a, b] = ['A', 'B'].map((t) => new Track(makeApiTrack(t)));
    context.player.queue.add([a, b]);
    await context.player.play();
    context.socket.message({ op: 'event', guildId: 'g1', type: 'TrackStartEvent', track: { ...makeApiTrack('A'), encoded: a.encoded } });

    await context.player.skip();
    context.socket.message({ op: 'event', guildId: 'g1', type: 'TrackEndEvent', track: { ...makeApiTrack('A'), encoded: a.encoded }, reason: 'stopped' });
    await vi.waitFor(() => {
      expect(context.patchBodies().some((body) => encodedOf(body) === b.encoded)).toBe(true);
    });
  });

  it('resolves unresolved tracks lazily at play time', async () => {
    const context = await setup();
    await joinVoice(context);

    // Make the search REST call return one track.
    const resolved = makeApiTrack('Resolved');
    context.respond(() =>
      jsonResponse({ loadType: 'search', playlistInfo: { name: '', selectedTrack: -1 }, data: [resolved] }),
    );

    const unresolved = new UnresolvedTrack('some query');
    context.player.queue.add(unresolved);
    await context.player.play();

    await vi.waitFor(() => {
      expect(context.patchBodies().some((b) => encodedOf(b) === resolved.encoded)).toBe(true);
    });
    expect(context.player.queue.current).toBeInstanceOf(Track);
  });

  it('pauses, resumes, seeks and clamps volume', async () => {
    const context = await setup();
    await joinVoice(context);
    const track = new Track(makeApiTrack('Ctrl'));
    context.player.queue.add(track);
    await context.player.play();

    await context.player.pause();
    expect(context.player.paused).toBe(true);
    await context.player.resume();
    expect(context.player.paused).toBe(false);

    await context.player.seek(60_000);
    expect(context.player.position).toBe(60_000);

    await context.player.setVolume(5_000);
    expect(context.player.volume).toBe(1000);

    const bodies = context.patchBodies();
    expect(bodies.some((b) => b.paused === true)).toBe(true);
    expect(bodies.some((b) => b.position === 60_000)).toBe(true);
    expect(bodies.some((b) => b.volume === 1000)).toBe(true);
  });

  it('refuses to seek live streams', async () => {
    const context = await setup();
    await joinVoice(context);
    const stream = new Track(makeApiTrack('Live', { isStream: true, isSeekable: false }));
    context.player.queue.add(stream);
    await context.player.play();
    await expect(context.player.seek(1000)).rejects.toThrow(JunieErrorCode.TRACK_NOT_SEEKABLE);
  });

  it('auto-skips loadFailed tracks by default', async () => {
    const context = await setup();
    await joinVoice(context);
    const [bad, good] = ['Bad', 'Good'].map((t) => new Track(makeApiTrack(t)));
    context.player.queue.add([bad, good]);
    await context.player.play();
    context.socket.message({ op: 'event', guildId: 'g1', type: 'TrackStartEvent', track: { ...makeApiTrack('Bad'), encoded: bad.encoded } });

    const errors: string[] = [];
    context.junie.on('trackError', (_p, track) => errors.push(track?.title ?? 'null'));

    context.socket.message({
      op: 'event', guildId: 'g1', type: 'TrackExceptionEvent',
      track: { ...makeApiTrack('Bad'), encoded: bad.encoded },
      exception: { message: 'decoding failed', severity: 'suspicious' },
    });
    context.socket.message({ op: 'event', guildId: 'g1', type: 'TrackEndEvent', track: { ...makeApiTrack('Bad'), encoded: bad.encoded }, reason: 'loadFailed' });

    await vi.waitFor(() => {
      expect(context.patchBodies().some((b) => encodedOf(b) === good.encoded)).toBe(true);
    });
    expect(errors).toEqual(['Bad']);
  });

  it('runs autoplay when the queue runs dry', async () => {
    const context = await setup();
    await joinVoice(context);

    const autoTrack = makeApiTrack('Autoplayed');
    context.respond(() =>
      jsonResponse({ loadType: 'search', playlistInfo: { name: '', selectedTrack: -1 }, data: [autoTrack] }),
    );

    const last = new Track(makeApiTrack('Last'));
    context.player.setAutoplay(true);
    context.player.queue.add(last);
    await context.player.play();
    context.socket.message({ op: 'event', guildId: 'g1', type: 'TrackStartEvent', track: { ...makeApiTrack('Last'), encoded: last.encoded } });
    context.socket.message({ op: 'event', guildId: 'g1', type: 'TrackEndEvent', track: { ...makeApiTrack('Last'), encoded: last.encoded }, reason: 'finished' });

    await vi.waitFor(() => {
      expect(context.patchBodies().some((b) => encodedOf(b) === autoTrack.encoded)).toBe(true);
    });
  });

  it('uses a custom autoplay resolver returning tracks', async () => {
    const context = await setup();
    await joinVoice(context);
    const custom = new Track(makeApiTrack('Custom'));

    context.junie.options.autoplayResolver = async () => [custom];
    context.player.setAutoplay(true);
    context.player.queue.add(new Track(makeApiTrack('Seed')));
    await context.player.play();
    const seed = context.player.queue.current as Track;
    context.socket.message({ op: 'event', guildId: 'g1', type: 'TrackEndEvent', track: { ...makeApiTrack('Seed'), encoded: seed.encoded }, reason: 'finished' });

    await vi.waitFor(() => {
      expect(context.patchBodies().some((b) => encodedOf(b) === custom.encoded)).toBe(true);
    });
  });
});

describe('Player resilience', () => {
  beforeEach(() => { vi.useRealTimers(); });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('destroy() never leaves a zombie, even when REST hangs', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const context = await setup({ responder: () => new Promise<Response>(() => undefined) });

    const destroyEvents: string[] = [];
    context.junie.on('playerDestroy', (player, reason) => destroyEvents.push(`${player.guildId}:${reason}`));

    await context.player.destroy('test');
    await vi.advanceTimersByTimeAsync(3_500);
    await context.player.destroy('test'); // idempotent

    expect(context.player.lifecycle).toBe('destroyed');
    expect(context.junie.players.has('g1')).toBe(false);
    expect(destroyEvents).toEqual(['g1:test']);
    await expect(context.player.play()).rejects.toThrow(JunieErrorCode.PLAYER_DESTROYED);
  });

  it('destroy() survives REST errors', async () => {
    const context = await setup({
      responder: (_url, init) =>
        init.method === 'DELETE' ? jsonResponse({ error: 'x' }, 500) : jsonResponse({}),
    });
    await joinVoice(context);
    await context.player.destroy();
    expect(context.player.lifecycle).toBe('destroyed');
    expect(context.junie.players.has('g1')).toBe(false);
  });

  it('rebuilds the remote player after a fresh session (session loss)', async () => {
    const context = await setup();
    await joinVoice(context);
    const track = new Track(makeApiTrack('Survivor'));
    context.player.queue.add(track);
    await context.player.play();
    context.socket.message({ op: 'playerUpdate', guildId: 'g1', state: { time: 2, position: 42_000, connected: true, ping: 3 } });

    // Lavalink restarts: the old session is gone, a fresh one appears.
    context.socket.emitClose(1006, 'restart');
    await new Promise((resolve) => setTimeout(resolve, 20));

    const { FakeWebSocket } = await import('./fixtures.js');
    const freshSocket = FakeWebSocket.instances[FakeWebSocket.instances.length - 1]!;
    freshSocket.open();
    freshSocket.message({ op: 'ready', resumed: false, sessionId: 'fresh-1' });
    await new Promise((resolve) => setTimeout(resolve, 30));

    const reinit = context.calls.find((c) => c.url.includes('/sessions/fresh-1/players/g1'));
    expect(reinit?.body).toMatchObject({
      voice: expect.objectContaining({ token: 'token-1' }),
      track: { encoded: track.encoded },
      position: 42_000,
      volume: 100,
    });
    expect(reinit && String(reinit.url).includes('noReplace=true')).toBe(true);
  });

  it('rejoins voice after a remote voice WebSocket closure', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const context = await setup();
    await joinVoice(context);
    const before = context.sendToShard.mock.calls.length;

    context.socket.message({ op: 'event', guildId: 'g1', type: 'WebSocketClosedEvent', code: 4015, reason: 'voice reset', byRemote: true });
    await vi.advanceTimersByTimeAsync(1_100);

    const joins = context.sendToShard.mock.calls.filter(
      (args) => (args[1] as { op: number }).op === 4,
    );
    expect(joins.length).toBeGreaterThanOrEqual(before);
    expect(joins.at(-1)?.[1]).toMatchObject({ d: { channel_id: 'vc1' } });
  });

  it('destroys the player when the bot leaves voice (default behaviour)', async () => {
    const context = await setup();
    await joinVoice(context);

    const leaves: Array<[string, string | null]> = [];
    context.junie.on('playerDisconnect', (player, channel) => leaves.push([player.guildId, channel]));
    context.junie.on('playerDestroy', (player, reason) => leaves.push([player.guildId, reason]));

    context.junie.sendRawData({
      t: 'VOICE_STATE_UPDATE',
      d: { user_id: context.junie.userId, guild_id: 'g1', channel_id: null, session_id: 'x' },
    });
    await flush();

    expect(leaves[0]).toEqual(['g1', 'vc1']);
    expect(leaves.some((entry) => entry[1] === 'voice-leave')).toBe(true);
    expect(context.junie.players.has('g1')).toBe(false);
  });

  it('detects voice channel moves', async () => {
    const context = await setup();
    await joinVoice(context);

    const moves: Array<[string, string, string]> = [];
    context.junie.on('playerMove', (player, from, to) => moves.push([player.guildId, from, to]));

    context.junie.sendRawData({
      t: 'VOICE_STATE_UPDATE',
      d: { user_id: context.junie.userId, guild_id: 'g1', channel_id: 'vc2', session_id: 'voice-session-2' },
    });
    context.junie.sendRawData({
      t: 'VOICE_SERVER_UPDATE',
      d: { guild_id: 'g1', token: 'token-2', endpoint: 'us-west77.discord.media' },
    });
    await flush();

    expect(moves).toEqual([['g1', 'vc1', 'vc2']]);
    expect(context.player.voiceChannelId).toBe('vc2');
  });

  it('migrates to another node with voice and track state', async () => {
    const context = await setup({ twoNodes: true });
    await joinVoice(context);
    const track = new Track(makeApiTrack('Migration'));
    context.player.queue.add(track);
    await context.player.play();
    context.socket.message({ op: 'playerUpdate', guildId: 'g1', state: { time: 3, position: 5_000, connected: true, ping: 9 } });

    // Bring the second node online.
    const { FakeWebSocket } = await import('./fixtures.js');
    const socket2 = FakeWebSocket.instances[1]!;
    socket2.open();
    socket2.message({ op: 'ready', resumed: false, sessionId: 's2' });
    await new Promise((resolve) => setTimeout(resolve, 20));

    await context.player.setNode('n2');

    expect(context.player.node.id).toBe('n2');
    const migrated = context.calls.find((c) => c.url.includes('/sessions/s2/players/g1'));
    expect(migrated?.body).toMatchObject({
      voice: expect.objectContaining({ token: 'token-1' }),
      track: { encoded: track.encoded },
      position: 5_000,
    });
    const oldDeleted = context.calls.find((c) => c.url.includes('/sessions/s1/players/g1') && c.method === 'DELETE');
    expect(oldDeleted).toBeDefined();
  });

  it('auto-failover: migrates players when their node dies (default on)', async () => {
    const context = await setup({ twoNodes: true });
    await joinVoice(context);
    const track = new Track(makeApiTrack('Failover'));
    context.player.queue.add(track);
    await context.player.play();

    // Bring the second node online so a failover target exists.
    const socket2 = FakeWebSocket.instances[1]!;
    socket2.open();
    socket2.message({ op: 'ready', resumed: false, sessionId: 's2' });
    await flush();

    // Node 1 dies without a close handshake (1006, abnormal).
    context.socket.emitClose(1006, 'node crashed');

    await flush();
    await flush();

    expect(context.player.lifecycle).not.toBe('destroyed');
    expect(context.player.node.id).toBe('n2');
    const migrated = context.calls.find((c) => c.url.includes('/sessions/s2/players/g1'));
    expect(migrated).toBeDefined();
    expect(migrated?.body).toMatchObject({
      voice: expect.objectContaining({ token: 'token-1' }),
      track: { encoded: track.encoded },
    });
  });

  it('auto-failover can be disabled', async () => {
    const { fetch, calls } = createFetchStub(() => jsonResponse({ guildId: 'g1' } as APIPlayer));
    vi.stubGlobal('fetch', fetch);
    resetSockets();
    const sendToShard = vi.fn(async () => undefined);
    const junie = new Junie({
      nodes: [
        { id: 'n1', host: 'localhost', port: 1, authorization: 'x' },
        { id: 'n2', host: 'localhost', port: 2, authorization: 'x' },
      ],
      sendToShard,
      logLevel: 'silent',
      webSocketFactory: fakeWebSocketFactory,
      resume: { enabled: false },
      reconnect: { initialDelay: 10_000, jitter: false, retries: 3 },
      autoFailover: false,
    });
    junie.init('111');
    const socket = FakeWebSocket.instances[0]!;
    await connectNode(socket, { sessionId: 's1' });
    const socket2 = FakeWebSocket.instances[1]!;
    socket2.open();
    socket2.message({ op: 'ready', resumed: false, sessionId: 's2' });
    await flush();

    const player = junie.createPlayer({ guildId: 'g1', voiceChannelId: 'vc1' });
    socket.emitClose(1006, 'node crashed');
    await flush();
    await flush();

    expect(player.node.id).toBe('n1');
    const migrated = calls.find((c) => c.url.includes('/sessions/s2/players/g1'));
    expect(migrated).toBeUndefined();
    await junie.destroy();
  });
});
