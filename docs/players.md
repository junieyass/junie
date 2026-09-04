# Players

A `Player` ties one guild to one node, one voice channel, one queue and one filter chain, and
drives the whole playback state machine:

```
create → connect → play ⇄ pause ⇄ (events) → stop/skip → … → destroy
```

Players are obtained from `junie.createPlayer(...)` (or `junie.players.create(...)`). Creating
is idempotent per guild: a second call updates the voice/text channels and returns the
existing instance.

```ts
const player = junie.createPlayer({
  guildId: '…',
  voiceChannelId: '…',
  textChannelId: '…',   // optional bookkeeping — Junie never sends messages
  node: 'eu-1',         // optional: pin to a node (else the strategy picks one)
  volume: 100,          // 0–1000
  selfDeaf: true,       // recommended
  selfMute: false,
  repeatMode: 'off',
  autoplay: false,
});
```

## Lifecycle states

`player.lifecycle` walks through:

| State | Meaning |
|---|---|
| `idle` | created, not connected |
| `connecting` | op 4 sent, waiting for voice credentials |
| `connected` | voice credentials forwarded to Lavalink |
| `playing` / `paused` | a track is loaded server-side |
| `destroying` / `destroyed` | terminal (see [destroy](#destroy)) |

Useful live state, updated from Lavalink's `playerUpdate` ops:

```ts
player.playing      // a track is loaded
player.paused       // playback is paused
player.connected    // Lavalink reports a live voice connection
player.position     // last reported playback position (ms)
player.ping         // voice round-trip latency (ms, -1 unknown)
player.volume       // 0–1000
```

## Voice

```ts
await player.connect();
```

1. sends gateway **op 4** through your `sendToShard`,
2. waits for `VOICE_STATE_UPDATE` + `VOICE_SERVER_UPDATE` (delivered via
   `junie.sendRawData`),
3. forwards the assembled credentials to Lavalink,
4. resolves — or rejects with `VoiceConnectionError` after
   `voiceConnectionTimeout` (default 15 s) if the packets never arrived.

Rejection almost always means raw packets aren't being forwarded — check the
[troubleshooting page](./troubleshooting.md#voiceconnectiontimeout).

```ts
await player.disconnect();  // leave voice, keep the player + queue
await player.destroy();     // leave voice, tear everything down (preferred)
```

`disconnect()` is a soft leave. Note that by default (`destroyOnVoiceLeave: true`) the player
is destroyed when the bot leaves voice *anyway* — including being kicked — which is what most
bots want. Set `destroyOnVoiceLeave: false` if you keep player state around across rejoins.

Moves are handled automatically: when Discord drags your bot to another channel you get a
`playerMove` event and the credentials are re-forwarded — playback continues.

## Playback

### play

```ts
await player.play();                    // next queued track
await player.play(track);               // replace whatever is playing
await player.play('a search query');    // resolved lazily at play time
await player.play(track, { startTime: 30_000, endTime: 90_000, noReplace: false });
```

Semantics of `play()` with no argument:

- current track exists and isn't started yet (e.g. after `stop(false)`) → replays it
- otherwise → advances to the next queued track

When a playing track is replaced, it lands in the queue history.

### Control surface

```ts
await player.pause();             // also pause(false)
await player.resume();
await player.skip();              // = stop(true); skip(3) drops the next 2 as well
await player.stop();              // stop and advance to the next track
await player.stop(false);         // stop and keep the current track replayable
await player.seek(60_000);        // throws TRACK_NOT_SEEKABLE on live streams
await player.setVolume(250);      // clamped to 0–1000
await player.setTextChannel(id);  // bookkeeping
```

`stop()` vs `skip()`: they're the same call. The distinction that matters is
`stop(advance)`: with `advance: false` the auto-advance triggered by the server's
`TrackEndEvent` is suppressed exactly once, so the current track stays replayable with
`play()`.

### Track end semantics

Lavalink reports why a track ended; Junie acts on the reason:

| Reason | Junie's behaviour |
|---|---|
| `finished` | history + repeat handling + advance |
| `loadFailed` | `trackError` event, then advance (unless `skipOnError: false`) |
| `stopped` | history + advance (this *is* the skip flow) |
| `replaced` | nothing — the replacement was already queued by `play(track)` |
| `cleanup` | player was removed server-side; no advance |

### Repeat & autoplay

```ts
player.setRepeatMode('off' | 'track' | 'queue');
player.setAutoplay(true);          // continue forever; see queue-and-autoplay.md
```

Repeat rules: `track` replays the finished track; `queue` re-appends it. Both apply to
`finished` ends only — skipping a track never loops it back.

## destroy

```ts
await player.destroy('reason');
```

The reference implementation of the **deterministic force-cleanup** pattern:

1. state flips to `destroying`; the player is removed from the registry immediately
   (no new commands can arrive)
2. voice is left via op 4 (best effort)
3. `DELETE /v4/sessions/{id}/players/{guild}` is raced against a **3 s budget**
4. in `finally` — success, error, or timeout alike — local state is purged, the store
   entry dropped, `playerDestroy` emitted, listeners removed

A dead node can never wedge a guild. The call is idempotent, and every method on a destroyed
player throws `PLAYER_DESTROYED` instead of silently no-oping.

## Node migration

```ts
await player.setNode('us-1');
```

Moves a live player: the remote player is recreated on the target node (voice + track +
position + volume + filters, `noReplace`) before the old node's player is destroyed. If the
migration PATCH fails, the player stays on the old node and the error propagates.

Migration happens *automatically* in one case: after session loss (Lavalink restart), players
are rebuilt on the node's fresh session with their last known state — see
[architecture](./architecture.md#resilience-design).

## Events

Players emit the same events as the client (with the player as first argument) — see the
[event reference](./events.md). Per-player subscription:

```ts
player.on('trackStart', (p, track) => { … });
```

## Full method reference

| Method | Returns | Notes |
|---|---|---|
| `connect()` | `Promise<void>` | op 4 + wait for credentials |
| `disconnect()` | `Promise<void>` | soft leave |
| `play(track?, options?)` | `Promise<void>` | track / query / next |
| `pause(paused?)` / `resume()` | `Promise<void>` | |
| `stop(advance?)` | `Promise<void>` | |
| `skip(count?)` | `Promise<void>` | |
| `seek(ms)` | `Promise<void>` | throws on streams |
| `setVolume(v)` | `Promise<void>` | clamped 0–1000 |
| `setFilters(raw)` | `Promise<void>` | merge + apply |
| `setNode(node)` | `Promise<void>` | live migration |
| `setRepeatMode(mode)` | `this` | |
| `setAutoplay(bool)` | `this` | |
| `setTextChannel(id)` | `this` | |
| `destroy(reason?)` | `Promise<void>` | zombie-proof |
| `filters` | `FilterManager` | see [filters](./filters.md) |
| `queue` | `Queue` | see [queue](./queue-and-autoplay.md) |
