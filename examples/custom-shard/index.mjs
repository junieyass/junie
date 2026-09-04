/**
 * Junie with a *custom* Discord sharder — no discord.js, no Eris.
 *
 * This is the minimal integration surface Junie actually needs:
 *
 *   1. `sendToShard(guildId, payload)` — forward gateway op 4 to the right shard
 *   2. `junie.sendRawData(packet)`     — forward VOICE_* dispatches from your shards
 *
 * Everything else (connection, resume, load balancing, players, queues) is Junie's job.
 *
 * Run: node index.mjs
 */

import { Junie } from 'junie';

// ---------------------------------------------------------------------------
// Pretend this is your hand-rolled sharder: it owns the gateway WebSockets.
// ---------------------------------------------------------------------------

class SimpleSharder {
  /** @type {Map<string, (payload: unknown) => void>} */
  #senders = new Map();

  /** Register a shard's send function. */
  attach(shardId, send) {
    this.#senders.set(shardId, send);
  }

  /** Deliver a gateway payload to the shard responsible for a guild. */
  send(guildId, payload) {
    const shardId = shardForGuild(guildId);
    const send = this.#senders.get(shardId);
    if (!send) throw new Error(`No shard ${shardId} is attached.`);
    send(JSON.stringify(payload));
  }
}

const sharder = new SimpleSharder();

// Your guild → shard mapping (however your sharding works).
const SHARD_COUNT = 1;
function shardForGuild(guildId) {
  return (Number(BigInt(guildId) >> 22n) % SHARD_COUNT).toString();
}

// ---------------------------------------------------------------------------
// Junie
// ---------------------------------------------------------------------------

const junie = new Junie({
  nodes: [
    { id: 'main', host: 'localhost', port: 2333, authorization: 'youshallnotpass' },
  ],
  sendToShard: (guildId, payload) => sharder.send(guildId, payload),
  logLevel: 'debug',
});

junie.init('123456789012345678');

junie.on('nodeConnect', (node) => {
  console.log(`Node ${node.id} connected (session ${node.sessionId}).`);
});
junie.on('trackStart', (player, track) => {
  console.log(`[${player.guildId}] ▶ ${track.title} — ${track.author}`);
});
junie.on('queueEnd', (player) => {
  console.log(`[${player.guildId}] queue finished.`);
});

// ---------------------------------------------------------------------------
// Playing something
// ---------------------------------------------------------------------------

async function playSomething(guildId, voiceChannelId) {
  const player = junie.createPlayer({
    guildId,
    voiceChannelId,
    textChannelId: null,
  });

  await player.connect(); // sends op 4 through `sendToShard`, waits for voice credentials

  const result = await junie.search('ytsearch:lofi hip hop radio');
  player.queue.add(result.tracks.slice(0, 5));
  await player.play();

  console.log(`Queued ${result.tracks.length} tracks. Position:`, player.position);
}

// ---------------------------------------------------------------------------
// Simulated gateway plumbing (in a real bot this is your WS client code)
// ---------------------------------------------------------------------------

// Your shard receives dispatches from Discord and forwards voice ones to Junie:
function onGatewayDispatch(packet) {
  if (packet.t === 'VOICE_STATE_UPDATE' || packet.t === 'VOICE_SERVER_UPDATE') {
    junie.sendRawData(packet);
  }
}

// Your shard sends op 4 whenever Junie asks:
sharder.attach('0', (raw) => {
  console.log('gateway <-', raw);
  // In a real bot: this.ws.send(raw). Discord would then deliver the two
  // VOICE_* dispatches, which `onGatewayDispatch` feeds back into Junie.
});

// Demo:
void playSomething('999888777666555444', '111222333444555666').catch(console.error);
// (Voice credentials never arrive in this demo, so `connect()` will time out —
// wire it to a real gateway to see the full flow.)
