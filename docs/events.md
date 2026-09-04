# Events

Junie's event system is fully typed. Subscribe on the **client** (recommended — one place for
everything) or per **node** / per **player**; the payloads are identical, the client-level
variants always include the originating node/player as the first argument.

```ts
junie.on('trackStart', (player, track) => { … });   // typed payload — no casting

player.on('trackStart', (player, track) => { … });  // same shape, per player
node.on('stats', (node, stats) => { … });           // per node
```

The `requester` on tracks carries whatever type you gave `junie.search(...)` — if you
instantiate `Junie<MyUser>`, `track.requester` is `MyUser | undefined` everywhere.

> Errors in listeners are *your* domain: wrap risky handlers in try/catch. Junie never throws
> from an `emit`.

## Node lifecycle

| Event | Payload | When |
|---|---|---|
| `nodeConnect` | `(node)` | a session was established (fresh **or** resumed) |
| `nodeResumed` | `(node)` | the session was resumed — buffered events are about to flush |
| `nodeDisconnect` | `(node, { code, reason })` | the WebSocket closed |
| `nodeReconnecting` | `(node, { attempt, delay })` | a reconnect attempt was scheduled |
| `nodeReconnectFailed` | `(node)` | reconnect budget exhausted |
| `nodeError` | `(node, error)` | socket/handshake/dispatch error |
| `nodeStats` | `(node, stats)` | periodic stats op (default every ~5 s) |
| `nodeDestroy` | `(node)` | deliberate teardown via `nodes.destroy` |

## Player lifecycle

| Event | Payload | When |
|---|---|---|
| `playerCreate` | `(player)` | a player was created |
| `playerDestroy` | `(player, reason)` | a player was destroyed (reason: `'manual'`, `'voice-leave'`, `'client-destroy'`, or yours) |
| `playerMove` | `(player, oldChannelId, newChannelId)` | the bot was dragged to another channel |
| `playerDisconnect` | `(player, voiceChannelId)` | the bot left voice |
| `playerVoiceClosed` | `(player, { code, reason, byRemote })` | Discord closed the voice WebSocket |
| `playerUpdate` | `(player, state)` | `playerUpdate` op — position, ping, connected |

## Track events

| Event | Payload | When |
|---|---|---|
| `trackStart` | `(player, track)` | a track began playing |
| `trackEnd` | `(player, track, reason)` | a track ended — see reasons below |
| `trackError` | `(player, track, exception)` | a track threw (decode/load) |
| `trackStuck` | `(player, track, thresholdMs)` | playback stalled past the stuck threshold |
| `queueEnd` | `(player)` | the queue ran dry (autoplay off/failed) |

`trackEnd` reasons: `finished` (natural end), `loadFailed` (couldn't load), `stopped`
(skip/stop), `replaced` (a new track took over), `cleanup` (player removed server-side).

`trackError`'s `exception` mirrors Lavalink's shape:

```ts
{ message: string, severity: 'common' | 'suspicious' | 'fault', cause?: string }
```

- `common` — transient upstream hiccup; usually fine to retry.
- `suspicious` — repeated failures for this source; consider skipping.
- `fault` — Lavalink itself is in trouble; check node logs.

## Raw payloads

| Event | Payload | When |
|---|---|---|
| `raw` | `(node, payload)` | every WebSocket message, pre-dispatch |

Use `raw` for telemetry, audit logs, or plugin-specific opcodes Junie doesn't model.

## Recipes

### A complete now-playing flow

```ts
junie
  .on('playerCreate', (player) => log.info({ guild: player.guildId }, 'player created'))
  .on('trackStart', (player, track) => {
    send(player.textChannelId, `🎶 **${track.title}** — ${track.author}`);
  })
  .on('trackEnd', (player, track, reason) => {
    if (reason === 'loadFailed') send(player.textChannelId, `⚠️ Skipped (failed to load).`);
  })
  .on('queueEnd', (player) => {
    send(player.textChannelId, 'Queue finished. 👋');
    void player.destroy('queue-finished');
  });
```

### Observability

```ts
junie.on('nodeStats', (node, s) => {
  gauges.players(node.id, s.players);
  gauges.cpu(node.id, s.cpu.systemLoad);
  if (s.frameStats && s.frameStats.deficit > 0) warn(`${node.id} has frame deficits`);
});

junie.on('playerUpdate', (player, state) => {
  if (state.ping > 200) log.warn({ guild: player.guildId, ping: state.ping }, 'voice latency');
});
```

### once handlers

```ts
junie.once('nodeConnect', (node) => {
  log.info(`First node online: ${node.id} (${node.sessionId})`);
});
```

## Listener ergonomics

- `on` / `once` / `off` return the emitter — chain subscriptions.
- `off('event')` with no listener removes **all** listeners for that event.
- `TypedEmitter` sets no listener cap — you won't hit `MaxListenersExceededWarning` at scale.
