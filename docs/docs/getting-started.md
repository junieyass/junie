# Getting started with Junie

This guide takes you from zero to a music bot that survives node restarts. It assumes a
Discord bot written in TypeScript (the JavaScript is identical minus the types) and a Lavalink
v4 server you control.

## 1. Run a Lavalink v4 server

The fastest path is Docker:

```bash
docker run -d --name lavalink -p 2333:2333 \
  ghcr.io/lavalink-devs/lavalink:4 --port 2333 --password youshallnotpass
```

If you prefer a config file, here is a minimal, complete `application.yml`:

```yaml
server:
  port: 2333
  password: youshallnotpass

lavalink:
  plugins: []          # add LavaSrc, LavaLyrics, ... here later
  server:
    opusEncodingQuality: "0"   # negligible CPU, best quality trade-off
    trackStuckThresholdMs: 10000
    useSeekGhosting: true
    playerUpdateInterval: 5    # seconds between playerUpdate ops

logging:
  file:
    max-history: 30
```

**Important:** disable your Discord library's own voice handling if it tries to connect to
voice on its own (most libraries don't unless you call their voice methods). Two clients
fighting over one voice token is the classic infinite-reconnect loop — see
[troubleshooting](./troubleshooting.md#bot-joins-and-immediately-gets-kicked--loops).

## 2. Install Junie

```bash
npm install junie
```

Requirements: Node.js **18.17 or newer** (native `fetch`). Junie ships CommonJS and ESM builds;
both work out of the box.

## 3. Create the client

```ts
import { Junie } from 'junie';

const junie = new Junie({
  nodes: [
    {
      id: 'main',
      host: 'localhost',
      port: 2333,                      // default 2333
      authorization: 'youshallnotpass',
      secure: false,                   // true for wss/https
      regions: ['europe'],             // optional: improves node placement
    },
  ],
  sendToShard: (guildId, payload) => {
    // Junie asks you to forward a Discord gateway op 4 (voice state update).
    const guild = client.guilds.cache.get(guildId);
    if (guild) guild.shard.send(payload);
  },
});
```

`sendToShard` is the *only* integration point Junie needs to make your bot join and leave voice
channels. Everything else is bookkeeping you already have.

### Clustering and sharding

Junie is per-process. Give each process its own `Junie` instance with the node list it should
use; route `sendToShard` to the shard that owns the guild (discord.js does this for you via
`guild.shard`). The client is deliberately stateless across processes — nodes hold the audio
state, your store holds the queues.

## 4. Connect when your bot is ready

```ts
client.once('ready', () => {
  junie.init(client.user.id);
});
```

`init` dials every node's WebSocket (`/v4/websocket`) with the required headers
(`Authorization`, `User-Id`, `Client-Name`), stores the session id from the `ready` op, and —
by default — configures [session resuming](./nodes.md#session-resuming) so playback survives
disconnects. On reconnects, Junie re-sends `Session-Id` automatically.

## 5. Forward raw voice packets

Discord sends your shard two dispatches when the bot joins voice: `VOICE_STATE_UPDATE` (session
id) and `VOICE_SERVER_UPDATE` (token + endpoint). Lavalink needs both to connect to Discord's
voice servers. Junie reassembles them — you just forward raw packets:

```ts
client.on('raw', (packet) => junie.sendRawData(packet));
```

Any library that exposes raw dispatches works. For a hand-rolled sharder, forward
`{ t: 'VOICE_STATE_UPDATE', d: {...} }` and `{ t: 'VOICE_SERVER_UPDATE', d: {...} }` verbatim.

## 6. Play your first track

```ts
const player = junie.createPlayer({
  guildId: interaction.guildId,
  voiceChannelId: interaction.member.voice.channelId,
  textChannelId: interaction.channelId, // remember where to reply
});

await player.connect();                 // joins voice; waits for credentials

const result = await junie.search('never gonna give you up', interaction.user);
if (result.isEmpty) {
  await interaction.reply('Nothing found. 😢');
  return;
}

player.queue.add(result.tracks);        // add one or many
await player.play();                    // starts the first queued track
```

What `play()` does: takes the next queued track, PATCHes it to Lavalink
(`PATCH /v4/sessions/{id}/players/{guildId}`), and the server confirms with a `TrackStartEvent`
— which Junie turns into the `trackStart` event:

```ts
junie.on('trackStart', (player, track) => {
  const channel = client.channels.cache.get(player.textChannelId!);
  void channel?.send(`🎶 Now playing **${track.title}** — ${track.author}`);
});
```

When the queue runs dry Junie emits `queueEnd` — the natural place to enable
[autoplay](./queue-and-autoplay.md#autoplay), destroy the player, or tell the channel.

## 7. Wire up the essentials

A minimal but *production-shaped* event setup:

```ts
junie.on('trackError', (player, track, exception) => {
  logger.warn({ guild: player.guildId, track: track?.title, exception });
});

junie.on('queueEnd', (player) => {
  player.setAutoplay(true); // keep the music going; see queue-and-autoplay.md
});

junie.on('nodeReconnectFailed', (node) => {
  logger.error(`Node ${node.id} gave up reconnecting — check the server!`);
});

process.on('SIGTERM', () => {
  void junie.destroy(); // graceful: players out, nodes down, listeners off
});
```

## Where to go next

- [Players](./players.md) — the full playback API (skip, seek, pause, volume, migration, …)
- [Queue & autoplay](./queue-and-autoplay.md) — repeat, shuffle, persistence
- [Filters](./filters.md) — nightcore in one line
- [Nodes & load balancing](./nodes.md) — running more than one Lavalink
- [Examples](../examples/discordjs) — a complete, runnable discord.js bot
