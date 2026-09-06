# Troubleshooting

The failures below account for the vast majority of "it doesn't work" reports with Lavalink
clients. Each entry lists the symptom, the cause, and the fix.

## `VOICE_CONNECTION_TIMEOUT` from `player.connect()`

**Symptom:** `connect()` rejects after 15 s: *Timed out waiting for Discord voice
credentials*.

**Cause:** Lavalink never received both halves of the voice handshake. Almost always one of:

1. **Raw packets are not forwarded.** Junie needs `junie.sendRawData(packet)` for
   `VOICE_STATE_UPDATE` and `VOICE_SERVER_UPDATE` — from *every* shard.
2. `sendToShard` doesn't actually reach the shard that owns the guild.
3. The bot lacks **View Channel** / **Connect** permission for the target channel (Discord
   then never sends `VOICE_SERVER_UPDATE`).

**Fix:**

```ts
// discord.js v14 — on the Client, not per shard:
client.on('raw', (packet) => junie.sendRawData(packet));

// sendToShard must resolve the right shard:
sendToShard: (guildId, payload) => {
  const guild = client.guilds.cache.get(guildId);
  if (guild) guild.shard.send(payload);
},
```

## Bot joins and immediately gets kicked / loops

**Symptom:** the bot cycles between voice states, or Discord logs show repeated joins.

**Cause:** two clients are fighting over one voice token — your Discord library's *own* voice
system and Lavalink both connected. The second connection invalidates the first.

**Fix:** don't call your library's voice methods for guilds Junie manages
(`guild.voice.connect()`, `member.voice.channel.join()`, etc.). Junie owns op 4 for those
guilds. (Most libraries won't interfere unless you explicitly call those APIs.)

## `401 Unauthorized` on REST

**Symptom:** `JunieRestError` with status 401 on every REST call; WebSocket may connect fine.

**Fix:** the `authorization` in your node options must equal `server.password` in Lavalink's
`application.yml`.

## Music plays, then the bot does nothing after a Lavalink restart

**Symptom:** Lavalink restarted; players exist locally but nothing plays; REST calls return
404.

**What should happen:** Junie detects session loss (404 or a fresh `ready`), re-handshakes,
and rebuilds players — voice, track, position, volume, filters. If you disabled resuming
(`resume: { enabled: false }`), voice connections drop on every WebSocket disconnect, which is
expected Lavalink behaviour. Keep resuming on (the default) and give it a sensible timeout
(60–300 s for bots that deploy often).

**If rebuilds aren't happening:** confirm you didn't swallow `nodeConnect`-time errors, and
that `sendRawData` is still wired — rebuilds re-forward cached voice credentials, which only
works if the gateway is feeding Junie.

## Search returns nothing even though the song exists

**Symptom:** `result.isEmpty` is true; no exception.

**Cause:** the node's upstream (e.g. YouTube) is rate-limiting that node's IP. Lavalink
returns `loadType: 'empty'` — not an error.

**Fix:** use parallel fan-out so a healthy node answers first:

```ts
await junie.search({ query, parallel: true });   // or searchParallel: true globally
```

Long-term: more nodes on different IPs, or source plugins (LavaSrc) for other platforms.

## Skipped tracks still appear in history

That's intended: `skip()` ends the track with reason `stopped`, and stopped tracks are
recorded (it powers "previously played" and replay). `queue.clearHistory()` if you need a
clean slate. Repeat modes deliberately do **not** re-loop skipped tracks — only `finished`
ones.

## `seek()` throws `TRACK_NOT_SEEKABLE`

The current track is a live stream. Check `player.queue.current?.isSeekable` (or `isStream`)
before rendering a seek slider.

## Equalizer/filter throws `INVALID_FILTER_VALUE`

Ranges are enforced client-side (see [filters](./filters.md#validation)): bands 0–14, gains
−0.25–1.0, filter volume 0–5, depths 0–1, vibrato frequency ≤ 14 Hz, `lowPass.smoothing` ≥ 1.
The message names the exact field and value.

## Node gives up reconnecting

`nodeReconnectFailed` after `reconnect.retries` (default 10) attempts. That's usually ~8+
minutes of exponential backoff — if the node is still down after that, investigate the server.
Re-enable manually with `node.connect()`.

## Players survive in `junie.players` after the bot left voice

By default `destroyOnVoiceLeave: true` removes them automatically. If you disabled it, you
own teardown — listen for `playerDisconnect` and destroy when appropriate.

## Debugging toolkit

```ts
// 1. Turn up logging
const junie = new Junie({ …, logLevel: 'debug' });   // 'trace' for WS payload dumps

// 2. Watch every protocol frame
junie.on('raw', (node, payload) => console.log(node.id, payload));

// 3. Inspect live state
console.log(node.sessionId, node.connected, node.resumed, node.stats);
console.log(player.lifecycle, player.playing, player.connected, player.position);
console.log(player.voiceState);   // { token?, endpoint?, sessionId?, channelId? }

// 4. Ask Lavalink directly
await node.rest.getVersion();
await node.getInfo();   // plugins, enabled sources
```

`logLevel: 'trace'` logs every inbound WebSocket payload — the single fastest way to see
whether Lavalink is talking to you at all.
