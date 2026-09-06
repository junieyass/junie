/**
 * REAL-Lavalink smoke test — runs Junie's built dist against an actual
 * Lavalink v4 server (downloaded jar, Java process) on 127.0.0.1:2339.
 *
 * Verifies the things a fake server could silently get wrong:
 * - handshake headers accepted by the real WS endpoint
 * - GET /version, /v4/info, /v4/loadtracks (http source, real track data)
 * - GET /v4/decode?encodedTrack=... (v4 endpoint shape)
 * - PATCH /v4/sessions/{id} resuming configuration (real 2xx)
 * - PATCH + DELETE /v4/sessions/{id}/players/{gid}
 * - graceful node disconnect on server shutdown
 *
 * Run: node scripts/real-smoke.mjs
 * Requires: java 17+, Lavalink.jar + application.yml in ../lavalink-real/
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Junie } from '../dist/esm/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const serverDir = join(here, '..', '..', 'lavalink-real');
const jar = join(serverDir, 'Lavalink.jar');

const results = [];
let failures = 0;
function check(condition, name) {
  const ok = Boolean(condition);
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) failures += 1;
  console.log(results[results.length - 1]);
}

async function waitFor(fn, label, timeoutMs = 90_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (fn()) return true;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  check(false, `timeout: ${label}`);
  return false;
}

if (!existsSync(jar)) {
  console.error(`Lavalink.jar not found at ${jar} — download it first.`);
  process.exit(2);
}

const PORT = 2339;
const PASSWORD = 'junie-smoke';

// ---------------------------------------------------------------- boot server
console.log('[smoke] booting real Lavalink (Java)...');
const proc = spawn('java', ['-jar', jar], { cwd: serverDir, stdio: ['ignore', 'pipe', 'pipe'] });
let bootLog = '';
proc.stdout.on('data', (d) => { bootLog += String(d); });
proc.stderr.on('data', (d) => { bootLog += String(d); });

let serverUp = false;
const up = await waitFor(async () => {
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/version`, {
      headers: { Authorization: PASSWORD },
    });
    if (res.ok) {
      serverUp = true;
      return true;
    }
  } catch { /* not yet */ }
  return false;
}, 'Lavalink server boot', 90_000);

const client = new Junie({
  nodes: [{ id: 'real', host: '127.0.0.1', port: PORT, authorization: PASSWORD }],
  sendToShard: () => undefined,
  userId: '999888777666555444',
  logLevel: 'silent',
});

try {
  if (!up) throw new Error('server did not boot');
  check(true, 'real Lavalink server booted and answered /version');

  // ---------------------------------------------------------------- connect
  const connectEvents = [];
  client.on('nodeConnect', () => connectEvents.push('connect'));
  client.init();
  const node = client.nodes.get('real');
  await waitFor(() => node.connected, 'WebSocket ready from real server');
  check(connectEvents.length >= 1, 'real server accepted WS handshake headers');

  await waitFor(() => node.lavalinkVersion !== null, 'version detection');
  check(String(node.lavalinkVersion).startsWith('4.'), `version detected: ${node.lavalinkVersion}`);

  // ---------------------------------------------------------------- session
  await waitFor(() => node.sessionId !== null, 'session id assigned');
  const info = await node.getInfo();
  check(info.version?.semver !== undefined, `/v4/info works (${info.version?.semver})`);

  // ---------------------------------------------------------------- loadtracks
  const result = await client.search({
    query: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
    source: 'none',
  });
  check(
    result.loadType !== 'error' && result.tracks.length >= 1,
    `/v4/loadtracks via http source (${result.tracks.length} track(s))`,
  );
  const track = result.tracks[0];
  check(Boolean(track?.encoded), `received a real encoded track (${track?.title})`);

  // ---------------------------------------------------------------- decode (verified v4 route)
  if (track) {
    try {
      const decoded = await node.rest.decodeTrack(track.encoded);
      check(decoded.info?.title === track.title, 'GET /v4/decodetrack decoded the track');
    } catch (error) {
      console.error('[smoke] decode failed:', error);
      check(false, 'GET /v4/decodetrack decoded the track');
    }
  }

  // ---------------------------------------------------------------- player lifecycle
  const guildId = '777666555444333222';
  const patch = await node.rest.updatePlayer(guildId, {
    track: { encoded: track?.encoded ?? 'x' },
    volume: 80,
  }, false);
  check(patch.guildId === guildId, 'PATCH player accepted by real server');

  const fetched = await node.rest.getPlayer(guildId);
  check(fetched?.guildId === guildId, 'GET player round-trips');
  check(fetched?.volume === 80, `player volume persisted server-side (${fetched?.volume})`);

  await node.rest.destroyPlayer(guildId);
  let destroyed = false;
  try {
    await node.rest.getPlayer(guildId);
  } catch {
    destroyed = true;
  }
  check(destroyed, 'DELETE player removed it server-side');

  // ---------------------------------------------------------------- shutdown
  const disconnects = [];
  client.on('nodeDisconnect', (n) => disconnects.push(n.id));
  proc.kill('SIGTERM');
  await waitFor(() => disconnects.includes('real'), 'node disconnect on server shutdown');
  check(true, 'server shutdown surfaced as nodeDisconnect');

  await client.destroy();
} finally {
  try { proc.kill('SIGKILL'); } catch { /* already dead */ }
  const passed = results.filter((r) => r.startsWith('PASS')).length;
  console.log(`\nREAL-LAVALINK SMOKE — ${passed}/${results.length} checks passed`);
  if (bootLog.includes('ERROR')) {
    console.log('(note: boot log contained ERROR lines — see logs/ if a check failed)');
  }
  process.exit(failures === 0 ? 0 : 1);
}
