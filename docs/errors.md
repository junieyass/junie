# Errors

Junie's error hierarchy is small, documented, and stable. Everything thrown derives from
`JunieError`, which carries a machine-readable `code` and a JSON-safe `context` object.

```ts
import { JunieError, JunieRestError, VoiceConnectionError, TrackLoadError } from 'junie';

try {
  await player.play();
} catch (error) {
  if (error instanceof JunieRestError) {
    log.error({ status: error.status, path: error.path }, 'lavalink REST failure');
  } else if (error instanceof JunieError) {
    log.error({ code: error.code, context: error.context }, 'junie error');
  }
}
```

## The hierarchy

```
JunieError                     base: .code · .context
├── JunieRestError             REST failures — .method · .path · .status · .body · .lavalink
├── VoiceConnectionError       voice credentials didn't arrive in time
└── TrackLoadError             (unresolved) track couldn't be loaded
```

## Code catalogue

| Code | Meaning | Typical cause & fix |
|---|---|---|
| `MISSING_USER_ID` | `init()` ran without a user id | pass `userId` in options or `junie.init(client.user.id)` after login |
| `NODE_CONNECTION_FAILED` | node dial failed / node destroyed / target node not connected | check host/port/password; for `setNode`, bring the target online first |
| `NODE_ALREADY_EXISTS` | duplicate node id | ids must be unique |
| `NODE_NOT_FOUND` | unknown node id | check the id in `createPlayer({ node })` / `setNode` |
| `NO_HEALTHY_NODES` | selection ran with zero connected nodes | wait for `nodeConnect`, or run more nodes |
| `REST_REQUEST_FAILED` | REST error (network, timeout, 4xx/5xx) | inspect `JunieRestError` fields; transient failures already retried |
| `PLAYER_ALREADY_EXISTS`* | — | (reserved; `createPlayer` is idempotent and returns the existing player) |
| `PLAYER_NOT_FOUND` | `requirePlayer` on an unknown guild | create the player first |
| `PLAYER_DESTROYED` | method called on a destroyed player | create a new player |
| `VOICE_CONNECTION_TIMEOUT` | `connect()` timed out | raw voice packets not forwarded — see below |
| `TRACK_LOAD_FAILED` | nothing playable for a query | tell the user; bad entries auto-skip |
| `TRACK_NOT_SEEKABLE` | `seek()` on a live stream | check `track.isSeekable` first |
| `INVALID_FILTER_VALUE` | filter out of range | see [filters](./filters.md#validation) |
| `INVALID_ARGUMENT` | bad input (queue add, repeat mode, …) | check the argument types |

## `JunieRestError` in detail

```ts
try {
  await node.rest.getPlayer(guildId);
} catch (error) {
  if (error instanceof JunieRestError) {
    error.method;     // 'GET'
    error.path;       // '/v4/sessions/…/players/…'
    error.status;     // 404 (0 for network-level failures)
    error.body;       // raw response text (first 2000 chars)
    error.lavalink;   // { timestamp, status, error, message, path, trace? } — if Lavalink sent one
  }
}
```

Status-specific guidance:

- **0** — network/timeout: the request never completed. Node down? DNS? Junie already retried.
- **401** — wrong `authorization`.
- **404** on session routes — Lavalink lost the session (restart). Junie self-heals; the error
  surfaces only if the heal also fails.
- **5xx** — Lavalink is struggling; check its logs. Already retried twice.

## `VoiceConnectionTimeout`

`player.connect()` waited `voiceConnectionTimeout` ms (default 15 s) for Discord's
`VOICE_STATE_UPDATE` + `VOICE_SERVER_UPDATE` and never got both. Checklist:

1. Are raw packets forwarded? `client.on('raw', p => junie.sendRawData(p))` — the number one
   cause. See [troubleshooting](./troubleshooting.md#voiceconnectiontimeout).
2. Is the bot actually in the channel (check `session_id` arrived)? Permissions to *view /
   connect* to the channel?
3. Is `sendToShard` delivering op 4 to the *right shard*?

## Errors that are events instead

Some failures are not thrown because no promise is pending — they're emitted:

| Situation | Event |
|---|---|
| track throws while playing/loading | `trackError` |
| track stuck | `trackStuck` |
| node socket errors | `nodeError` |
| voice WebSocket closed | `playerVoiceClosed` |
| autoplay resolver fails | `queueEnd` (with a logged warning) |

Auto-skip behaviour for failed loads is `skipOnError: true` by default — your bot keeps
playing through broken entries.

## Do / don't

```ts
// ✅ DO: catch specific, degrade gracefully
try {
  await player.play(track);
} catch (error) {
  if (error instanceof TrackLoadError) await reply('Could not play that one — skipping.');
}

// ✅ DO: log node errors, alert on reconnect failures
junie.on('nodeError', (node, error) => log.warn({ node: node.id }, error.message));

// ❌ DON'T: retry loops around destroy()
await player.destroy();            // already timeout-bounded and idempotent
await player.destroy();            // no-op, not an error

// ❌ DON'T: ignore PLAYER_DESTROYED in long-lived code
const player = junie.createPlayer({ … });
// … much later, the player may be gone:
junie.getPlayer(guildId)?.pause();  // optional chaining beats try/catch here
```
