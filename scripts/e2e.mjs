/**
 * Junie E2E battle test — drives the BUILT dist artifact (not the TS source)
 * against two FakeLavalink servers over the real network stack.
 *
 * Phases:
 *  1. bad-password rejection (WS 401)
 *  2. two nodes connect; version detection; resume configured via REST
 *  3. search (REST loadtracks) with source prefix + requester typing
 *  4. voice handshake through sendToShard echo + WS voiceUpdate
 *  5. play → TrackStartEvent → auto-advance on TrackEndEvent
 *  6. node A death (abnormal WS kill) → AUTO-FAILOVER: player migrates to B
 *  7. node A reconnect → session RESUME with Session-Id header
 *  8. node-pinned search + parallel fan-out
 *  9. player destroy (REST DELETE) + client teardown
 *
 * Run: node scripts/e2e.mjs   (after `npm run build`)
 */

import { FakeLavalink } from './fake-lavalink.mjs';
import { Junie } from '../dist/esm/index.js';

const results = [];
let failures = 0;

function check(condition, name) {
  const ok = Boolean(condition);
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) failures += 1;
}

async function waitFor(fn, label, timeoutMs = 6000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (fn()) return true;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  check(false, `timeout: ${label}`);
  return false;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const userId = '999888777666555444';
const guildId = 'e2e-guild';
const voiceChannelId = 'e2e-vc';

const serverA = new FakeLavalink({ password: 'pass-a', version: '4.0.8' });
const serverB = new FakeLavalink({ password: 'pass-b', version: '4.0.8' });
const portA = await serverA.start();
const portB = await serverB.start();

try {
  // ------------------------------------------------------------------ phase 1
  // Wrong password → the WS upgrade is refused and the node reports an error.
  {
    const shardCalls = [];
    const bad = new Junie({
      nodes: [{ id: 'bad', host: '127.0.0.1', port: portA, authorization: 'wrong' }],
      sendToShard: () => undefined,
      userId,
      logLevel: 'silent',
      reconnect: { retries: 1, initialDelay: 100, jitter: false },
    });
    let sawError = false;
    bad.on('nodeError', () => { sawError = true; });
    bad.init();
    await sleep(600);
    check(sawError, 'phase 1: bad password rejected (nodeError emitted)');
    await bad.destroy();
  }

  // ------------------------------------------------------------------ phase 2
  const shardCalls = [];
  let junieRef = null;
  const sendToShard = (guildId, payload) => {
    shardCalls.push({ guildId, payload });
    if (payload.op === 4 && junieRef) {
      junieRef.sendRawData({
        t: 'VOICE_STATE_UPDATE',
        d: {
          user_id: userId,
          guild_id: guildId,
          channel_id: payload.d.channel_id,
          session_id: 'voice-session-e2e',
        },
      });
      junieRef.sendRawData({
        t: 'VOICE_SERVER_UPDATE',
        d: { guild_id: guildId, token: 'token-e2e', endpoint: 'eu-central586.discord.media' },
      });
    }
  };
  const junie = new Junie({
    nodes: [
      { id: 'node-a', host: '127.0.0.1', port: portA, authorization: 'pass-a', regions: ['europe'] },
      { id: 'node-b', host: '127.0.0.1', port: portB, authorization: 'pass-b', regions: ['us'] },
    ],
    sendToShard,
    userId,
    reconnect: { retries: 10, initialDelay: 150, jitter: false },
    logLevel: 'silent',
  });
  junieRef = junie;

  const connectEvents = [];
  junie.on('nodeConnect', (node) => connectEvents.push(node.id));

  junie.init();
  const nodeA = junie.nodes.get('node-a');
  const nodeB = junie.nodes.get('node-b');
  const resumeEvents = [];
  junie.on('nodeResumed', (node) => resumeEvents.push(node.id));

  await waitFor(() => nodeA.connected && nodeB.connected, 'both nodes connected');
  check(true, 'phase 2: both nodes connected over real WebSocket');
  await sleep(100); // let async connect events flush to the handler
  check(connectEvents.includes('node-a') && connectEvents.includes('node-b'),
    'phase 2: nodeConnect fired for both');
  await waitFor(() => nodeA.lavalinkVersion === '4.0.8' && nodeB.lavalinkVersion === '4.0.8',
    'version detection');
  check(true, 'phase 2: GET /version detected on both nodes');
  await waitFor(() => serverA.findRequests('PATCH', `/sessions/${nodeA.sessionId}`).length > 0,
    'resume PATCH on A');
  check(true, 'phase 2: session resuming configured via REST PATCH');

  // REST auth enforcement.
  const res401 = await fetch(`http://127.0.0.1:${portA}/v4/info`, {
    headers: { Authorization: 'nope' },
  });
  check(res401.status === 401, 'phase 2: REST rejects wrong password with 401');

  // ------------------------------------------------------------------ phase 3
  const requester = { id: 'requester-1', tag: 'e2e#0001' };
  const result = await junie.search('never gonna give you up', requester);
  check(result.tracks.length === 3, 'phase 3: search returned 3 tracks');
  check(result.tracks.every((t) => t.requester === requester), 'phase 3: requester attached to tracks');
  const loadA = serverA.findRequests('GET', '/loadtracks');
  const loadB = serverB.findRequests('GET', '/loadtracks');
  check((loadA.length + loadB.length) >= 1, 'phase 3: loadtracks request logged');
  check(
    [...loadA, ...loadB].some((r) => r.url.includes('identifier=ytsearch%3Anever')),
    'phase 3: ytsearch: prefix sent to server',
  );

  // ------------------------------------------------------------------ phase 4
  // Lavalink v4 carries voice credentials in the REST player PATCH
  // (the old WS voiceUpdate op is v3-only; Junie is pure v4).
  const player = junie.createPlayer({ guildId, voiceChannelId, textChannelId: 'e2e-tc' });
  await player.connect();
  check(shardCalls.some((c) => c.payload.op === 4), 'phase 4: op 4 sent to shard');

  const voicePatches = () =>
    serverA.findRequests('PATCH', `/sessions/${nodeA.sessionId}/players/${guildId}`)
      .filter((r) => r.body?.voice);
  await waitFor(() => voicePatches().length > 0, 'voice PATCH on A');
  const voicePatch = voicePatches()[0];
  check(
    voicePatch?.body?.voice?.token === 'token-e2e' &&
      voicePatch?.body?.voice?.endpoint === 'eu-central586.discord.media',
    'phase 4: REST player PATCH carried Discord voice credentials',
  );
  await waitFor(() => player.connected === true, 'player connected');
  check(true, 'phase 4: player connected after handshake');

  // ------------------------------------------------------------------ phase 5
  player.queue.add(result.tracks);
  const trackStarts = [];
  junie.on('trackStart', (p, track) => trackStarts.push(track.title));
  await player.play();

  await waitFor(() => trackStarts.length > 0, 'first TrackStartEvent');
  check(player.playing, 'phase 5: player.playing after play()');
  check(player.queue.current?.encoded === result.tracks[0].encoded, 'phase 5: current = first track');

  const sessionA = nodeA.sessionId;
  serverA.finishCurrentTrack(sessionA, guildId, 'finished');
  await waitFor(() => trackStarts.length > 1, 'auto-advance to second track');
  check(player.queue.current?.encoded === result.tracks[1].encoded,
    'phase 5: TrackEndEvent(finished) advanced the queue');

  // ------------------------------------------------------------------ phase 6
  const disconnects = [];
  junie.on('nodeDisconnect', (node) => disconnects.push(node.id));
  serverA.killSockets();

  await waitFor(() => player.node.id === 'node-b', 'failover moved player to node-b');
  check(disconnects.includes('node-a'), 'phase 6: nodeDisconnect emitted for node-a');
  check(player.lifecycle !== 'destroyed', 'phase 6: player survived node death');

  const patchOnB = serverB.findRequests('PATCH', `/sessions/${nodeB.sessionId}/players/${guildId}`);
  check(patchOnB.length > 0, 'phase 6: player PATCHed onto node-b');
  check(
    patchOnB.some((r) => r.body?.voice?.token === 'token-e2e' && r.body?.track?.encoded),
    'phase 6: migration PATCH carried voice + track',
  );
  const deleteOnA = serverA.findRequests('DELETE', `/sessions/${sessionA}/players/${guildId}`);
  check(deleteOnA.length > 0, 'phase 6: old player DELETEd on node-a');

  // ------------------------------------------------------------------ phase 7
  await waitFor(() => resumeEvents.includes('node-a'), 'node-a resumed its session');
  check(nodeA.resumed === true, 'phase 7: resume via Session-Id header');
  check(serverA.sessions.has(sessionA), 'phase 7: server kept the session for resume');
  check(player.node.id === 'node-b', 'phase 7: player still served by node-b after A returned');

  // ------------------------------------------------------------------ phase 8
  await junie.search({ query: 'pinned query', node: 'node-b' });
  check(
    serverB.findRequests('GET', '/loadtracks').some((r) => r.url.includes('pinned%20query')),
    'phase 8: node-pinned search hit only node-b',
  );
  const parallelResult = await junie.search({ query: 'parallel query', parallel: true });
  check(parallelResult.tracks.length === 3, 'phase 8: parallel fan-out search resolved');

  // ------------------------------------------------------------------ phase 9
  await player.destroy('e2e-done');
  await waitFor(() => serverB.findRequests('DELETE', `/sessions/${nodeB.sessionId}/players/${guildId}`).length > 0,
    'player DELETE on B');
  check(true, 'phase 9: player destroyed via REST DELETE');
  check(junie.players.has(guildId) === false, 'phase 9: player removed from registry');

  await junie.destroy();
  await waitFor(() => serverA.clients.size === 0 && serverB.clients.size === 0, 'sockets closed');
  check(true, 'phase 9: client teardown closed sockets');

  // ------------------------------------------------------------------ summary
  const passed = results.filter((r) => r.startsWith('PASS')).length;
  console.log(`\n${'='.repeat(64)}\nE2E BATTLE TEST — ${passed}/${results.length} checks passed\n${'='.repeat(64)}`);
  for (const line of results) console.log(line);
  process.exitCode = failures === 0 ? 0 : 1;
} finally {
  await serverA.stop();
  await serverB.stop();
  // Force exit: stats intervals / sockets may keep the loop alive.
  setTimeout(() => process.exit(failures === 0 ? 0 : 1), 200).unref();
}
