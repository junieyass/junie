/**
 * Dry-run validation — proves the install and wiring without Discord.
 *
 * `npm run dry` inside examples/battle-bot:
 *   1. imports junie from the installed package (file:../.. — same code as the tarball)
 *   2. constructs the client, queue, filters
 *   3. if the repo's fake Lavalink server is available, boots it and runs a
 *      REAL networked cycle: connect → version detect → search → player → destroy
 *   4. exits 0 on success
 */

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Junie, MemoryQueueStore, Track } from 'junie';

const here = dirname(fileURLToPath(import.meta.url));
const fakeServerPath = join(here, '..', '..', 'scripts', 'fake-lavalink.mjs');

const assert = (condition, name) => {
  if (!condition) {
    console.error(`FAIL  ${name}`);
    process.exit(1);
  }
  console.log(`PASS  ${name}`);
};

// --- offline structure checks -------------------------------------------------

const junie = new Junie({
  nodes: [
    { id: 'node-a', host: '127.0.0.1', port: 2333, authorization: 'youshallnotpass' },
    { id: 'node-b', host: '127.0.0.1', port: 2334, authorization: 'youshallnotpass' },
  ],
  sendToShard: () => undefined,
  userId: '000000000000000000',
  logLevel: 'silent',
  queue: { store: new MemoryQueueStore(), restore: true },
});

assert(junie.nodes.size === 2, 'two nodes registered');
assert(typeof junie.search === 'function', 'client exposes search');
assert(typeof junie.createPlayer === 'function', 'client exposes createPlayer');

const track = new Track({
  encoded: 'QAAAdryrun',
  info: {
    identifier: 'dry-1', isSeekable: true, author: 'Dry Run', length: 60_000,
    isStream: false, position: 0, title: 'Dry Run Track', uri: 'https://example.com/dry',
    artworkUrl: null, isrc: null, sourceName: 'youtube',
  },
  pluginInfo: {}, userData: {},
});
assert(track.title === 'Dry Run Track', 'Track constructed from raw API payload');
assert(junie.utils.formatDuration(track.length) === '1:00', 'duration formatting');

await junie.destroy();
assert(junie.players.size === 0, 'client teardown clean');

// --- networked cycle (repo checkout only) ------------------------------------

if (existsSync(fakeServerPath)) {
  const { FakeLavalink } = await import(fakeServerPath);
  const server = new FakeLavalink();
  const port = await server.start();

  const netJunie = new Junie({
    nodes: [{ id: 'dry', host: '127.0.0.1', port, authorization: 'youshallnotpass' }],
    sendToShard: (guildId, payload) => {
      if (payload.op === 4) {
        netJunie.sendRawData({
          t: 'VOICE_STATE_UPDATE',
          d: { user_id: netJunie.userId, guild_id: guildId, channel_id: payload.d.channel_id, session_id: 'dry-vs' },
        });
        netJunie.sendRawData({
          t: 'VOICE_SERVER_UPDATE',
          d: { guild_id: guildId, token: 'dry-token', endpoint: 'eu-central586.discord.media' },
        });
      }
    },
    userId: '000000000000000000',
    logLevel: 'silent',
    reconnect: { retries: 1, initialDelay: 100, jitter: false },
  });
  netJunie.init();
  const node = netJunie.nodes.get('dry');
  const waitFor = async (fn, timeoutMs = 5000) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (fn()) return true;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    return fn();
  };
  await waitFor(() => node.connected === true);
  assert(node.connected === true, 'connected to local fake node');
  await waitFor(() => node.lavalinkVersion === '4.0.8');
  assert(node.lavalinkVersion === '4.0.8', 'version detected over real HTTP');

  const result = await netJunie.search('dry run query');
  assert(result.tracks.length === 3, 'networked search returned tracks');

  const player = netJunie.createPlayer({ guildId: 'dry-guild', voiceChannelId: 'dry-vc' });
  await player.connect();
  player.queue.add(result.tracks);
  await player.play();
  player.filters.nightcore();
  assert(player.filters.payload.timescale?.speed === 1.25, 'nightcore preset applied');

  await player.destroy('dry');
  await netJunie.destroy();
  await server.stop();
  assert(true, 'networked cycle: connect → search → play → destroy');
} else {
  console.log('SKIP  networked cycle (fake server not present in published tarball)');
}

console.log('\nDRY RUN OK — install and wiring verified.');
process.exit(0);
