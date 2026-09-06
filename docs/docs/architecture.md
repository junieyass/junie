# Architecture

Junie is an **event-driven orchestrator** sitting between three worlds: the Discord gateway
(via your shards), your application, and one or more Lavalink nodes. This page explains how the
pieces fit together, how data flows, and — most importantly — which failure modes Junie's
design explicitly defends against.

## The dual control loop

Playing audio in a guild requires two synchronized control loops:

**1. Discord gateway signalling loop.** To join a voice channel, the bot sends gateway **op 4**
(voice state update request) through its shard. Discord answers asynchronously with two
dispatches:

- `VOICE_STATE_UPDATE` → provides `session_id` and the channel placement
- `VOICE_SERVER_UPDATE` → provides the voice `token` and the regional `endpoint`

**2. Lavalink audio control loop.** Junie assembles the four mandatory credentials
(`token`, `endpoint`, `sessionId`, `channelId`) and forwards them via REST:

```
PATCH /v4/sessions/{sessionId}/players/{guildId}
{ "voice": { "token": "…", "endpoint": "eu-central586.discord.media",
             "sessionId": "…", "channelId": "…" } }
```

Lavalink then connects to Discord's voice server directly (WebRTC/UDP) and streams Opus frames.
**Your process never touches audio data.** The `channelId` field is required by Lavalink v4.2+
and is what makes the payload DAVE (E2EE voice) ready — the encryption itself is negotiated
between Lavalink and Discord; nothing extra is needed from the client.

## Component map

```
src/
├── Junie.ts                  The client. Owns the registries, routes everything.
├── node/
│   ├── Node.ts               One Lavalink connection: WS lifecycle, resume, stats
│   ├── NodeManager.ts        Registry, strategy-driven selection, fan-out search
│   ├── Rest.ts               REST transport: timeouts, retries, 404 session handling
│   └── strategies/           Penalty (default), RoundRobin, LeastPlayers, LeastLoad
├── player/
│   ├── Player.ts             Per-guild state machine: voice, playback, recovery
│   ├── PlayerManager.ts      Guild registry, node assignment
│   └── FilterManager.ts      Fluent filter builder (validation, presets)
├── queue/
│   ├── Queue.ts              Upcoming + current + bounded history, persistence
│   └── QueueStore.ts         Persistence interface + in-memory default
├── track/
│   ├── Track.ts              Decoded track + UnresolvedTrack (lazy resolution)
│   └── SearchResult.ts       Normalized search outcome + identifier building
├── types/                    Raw protocol types, options, typed event maps
└── utils/                    Typed emitter, logger, helpers, voice-region mapping
```

### Who talks to whom

- **Node → Junie (NodeHost):** nodes never touch players directly. They report
  `notifyReady / notifyStats / notifyPlayerUpdate / notifyEvent / notifyDisconnect / …` and the
  client routes by `guildId`. This keeps the transport layer trivially testable and lets
  players change nodes without dangling listeners.
- **Player → Junie (bridges):** players mirror their events up to the client
  (`forwardPlayerEvent`) so users can subscribe at either level.
- **Junie → your app:** typed events on `junie`, plus `sendToShard` calls when a player joins
  or leaves voice.

## Event routing

```
Lavalink WS message
  → Node.handleMessage (parse + emit 'raw' for telemetry)
  → op 'ready'    → session established → resume PATCH → Node#connect/#resumed
  → op 'stats'    → node.stats (drives load balancing)
  → op 'playerUpdate' → Junie → player.handlePlayerUpdate (position/ping/connected)
  → op 'event'    → Junie → player.handleEvent
                       TrackStart  → playing = true, trackStart event
                       TrackEnd    → history, repeat handling, auto-advance
                       TrackException → trackError event (skip on loadFailed)
                       TrackStuck  → trackStuck event + auto-skip
                       WebSocketClosed → playerVoiceClosed + optional voice rejoin
```

Queue advancement is **serialized per player** through an internal promise chain, so rapid
event bursts (e.g. buffered events flushing after a resume) cannot interleave two advances.

## Resilience design

Junie's reliability story is a set of explicit counter-measures to well-known Lavalink client
failure modes:

### 1. Zombie players (deterministic force-cleanup)

*Failure:* `player.destroy()` sets state to *destroying*, then awaits `DELETE
/v4/sessions/{id}/players/{guild}`. If the node is unreachable, execution hangs *before* local
cleanup — the player is stuck forever, and the manager refuses to create a new one.

*Counter-measure:* `Player#destroy` detaches from the manager **immediately**, races the REST
call against a strict **3-second budget**, and purges local state (voice, queue, store, events)
in a `finally` block — no matter whether the REST call succeeded, failed, or timed out. The
method is also idempotent: destroying a destroyed player is a no-op.

### 2. Session loss after a Lavalink restart (404 self-healing)

*Failure:* Lavalink restarts and forgets its session store. Every REST call for the old
session returns **404**. Naive clients keep retrying into the void.

*Counter-measure:* the REST layer detects 404s *on our own session routes* and signals the
node, which forces an immediate WebSocket re-handshake (no backoff — this is not a network
failure). When the fresh session's `ready` op arrives with `resumed: false`, the client
rebuilds every player bound to that node: voice credentials are re-sent and the current track
resumes from the last known position, volume and filters included.

### 3. Reconnect storms (backoff + jitter)

*Failure:* 200 bots disconnect at once (Lavalink deploy). They all reconnect at the same
millisecond and DoS the server again.

*Counter-measure:* exponential backoff (`initialDelay × multiplier^attempt`, capped at
`maxDelay`, default 1 s → 60 s) with ±30% jitter. The `nodeReconnecting` event reports each
scheduled attempt, and `nodeReconnectFailed` fires when the budget is exhausted.

### 4. Discord voice socket closures (self-rejoining)

*Failure:* Discord closes the voice WebSocket (server migration, channel deletion). The bot
sits in a channel, "connected" locally, playing nothing.

*Counter-measure:* on `WebSocketClosedEvent` closed *by the remote*, Junie re-sends op 4 for
the current channel (bounded to 5 attempts, growing delays), resetting the counter whenever
Lavalink reports a healthy connection again.

### 5. Rate-limited searches (parallel fan-out)

*Failure:* a node's upstream (YouTube) rate-limits its IP. `/v4/loadtracks` returns *empty*
results instead of errors — the bot "finds nothing" even though other nodes are healthy.

*Counter-measure:* `junie.search({ query, parallel: true })` fans the request out to every
connected node and resolves with the first non-empty result. Enable it globally with
`searchParallel: true`.

### 6. Thundering state desync

*Failure:* a fast `stop()` + `skip()` + event burst interleaves two queue advances and
double-plays a track.

*Counter-measure:* all queue advancement funnels through a per-player serialized chain, and
`TrackEndEvent` reasons are handled according to their semantics (`replaced` never advances,
`cleanup` never advances, `stopped`/`finished`/`loadFailed` do — see
[players](./players.md#track-end-semantics)).

## Load balancing

The default `PenaltyStrategy` scores every connected node with a penalty
(**lower = better**) derived from live stats:

```
P_total = P_player + P_cpu + P_frame + P_region

P_player = playingPlayers                    (streaming load)
P_cpu    = 1.05^(100 × systemLoad) − 1        (near-zero until CPU saturates)
P_frame  = 10 × nulledFrames + 20 × deficit   (degraded voice frames)
P_region = 0 same zone · 250 unknown · 1000 cross-zone
```

`P_region` is derived by parsing the Discord voice endpoint (e.g.
`eu-central586.discord.media` → `eu-central` → zone `europe`) and comparing it with the node's
configured `regions`. Swap in your own scoring with a custom `PenaltyProvider` or a whole
custom strategy — see [nodes & load balancing](./nodes.md).

## Extensibility seams

| Seam | Interface | Swap in |
|---|---|---|
| Node selection | `NodeSelectionStrategy` | your routing policy |
| Penalty scoring | `PenaltyProvider` | custom metrics |
| Queue persistence | `QueueStore` | Redis, Postgres, files |
| Autoplay | `AutoplayResolver` | Spotify/Deezer-based related tracks |
| WebSocket transport | `webSocketFactory` | proxied or instrumented sockets |
| Logging | `logger` | pino/winston/Datadog adapters |

## Testing strategy

Junie's transport seams (`webSocketFactory`, global `fetch`) are exactly what the test suite
exploits: a fake in-memory WebSocket and a stubbed fetch drive 111 assertions over real
behaviour — handshakes, backoff timers, session-loss rebuilds, voice racing, queue semantics —
without a Lavalink server. See the `tests/` directory; the same seams let you test *your* bot
without infrastructure.
