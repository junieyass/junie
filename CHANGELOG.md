# Changelog

All notable changes to Junie are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to
[Semantic Versioning](https://semver.org/).

## [1.1.0] — 2026-09-06

Battle-tested release: automatic failover, protocol radar, real-server verification.

### Added

- **Automatic player failover** — when a node's WebSocket dies, every player on
  it migrates to the best remaining connected node (voice + track + position +
  volume + filters re-established in one REST round trip). On by default;
  disable with `autoFailover: false`. Manual `setNode` unchanged.
- **Lavalink version radar** — `Node#detectVersion()` (runs automatically after
  every `ready`) stores `node.lavalinkVersion` from `GET /version` and emits a
  `versionMismatch` node event when the server major differs from v4. Never
  breaks the connection — it's an early-warning signal, not a gate.
- **E2E battle test** (`scripts/e2e.mjs`, 29 checks) — drives the built dist
  against a faithful fake Lavalink v4 server (`scripts/fake-lavalink.mjs`)
  over real TCP/WebSocket/HTTP: handshake, auth rejection, resume PATCH, voice
  handshake, playback, auto-advance, node kill → failover, session resume,
  pinned + parallel search, teardown.
- **Real-server smoke suite** (`scripts/real-smoke.mjs`, 12 checks) — boots an
   actual Lavalink 4.2.2 jar (Java) and round-trips every REST route with real
  encoded tracks. Empirically verified the decode routes (`/v4/decodetrack`,
  `POST /v4/decodetracks`) and the single-object `data` shape of
  `loadType: 'track'` responses.
- **`PROTOCOL.md`** — the full protocol surface mapped to code, a three-level
  verification ladder, and an upgrade runbook for tracking new Lavalink
  releases.
- **Battle-bot example** (`examples/battle-bot`) — installable discord.js
  reference bot with `npm run dry` networked validation.
- **Publish & community kit** — CI workflow (Node 18/20/22/24 matrix + pack
  checks), issue/PR templates, dependabot, `PUBLISH.md` release runbook,
  ready-to-paste launch drafts (`marketing/`), and a zero-dependency landing
  page (`site/index.html`) for GitHub Pages.

### Fixed

- REST decode endpoints now use the routes verified against the real 4.2.2
  server (`GET /v4/decodetrack?encodedTrack=`, `POST /v4/decodetracks`).

### Tests

- 116 unit & behavioural tests (was 111): version detection, `versionMismatch`,
  auto-failover on/off, decode route shapes.

## [1.0.0] — 2026-09-04

First public release. Complete Lavalink v4 client for Node.js & TypeScript.

### Added

**Nodes & transport**
- WebSocket sessions with full handshake headers (`Authorization`, `User-Id`,
  `Client-Name`, `Session-Id`) and `ready` op handling.
- Session resuming: configured after `ready`, `Session-Id` re-sent on reconnect,
  `resumed` flag surfaced via `nodeResumed`.
- Reconnection with exponential backoff, cap and ±30% jitter; per-node overrides.
- 404 session self-healing: immediate re-handshake + automatic remote player rebuild
  (voice, track, position, volume, filters).
- REST transport with per-request timeouts, retries for network/5xx/429, structured
  `JunieRestError`s carrying Lavalink error bodies.
- Four selection strategies: penalty-based (default), round-robin, least-players,
  least-load; custom strategies and penalty providers.
- Region-aware placement from Discord voice endpoints (`regionPenalty` 0/250/1000).
- Parallel search fan-out across all healthy nodes.
- Custom WebSocket transport factory (`webSocketFactory`).

**Players**
- Full lifecycle: connect (voice-waiter with timeout), play, pause, resume, stop,
  skip, seek, volume, filters, destroy.
- Auto-advance on track end with reason-aware semantics, repeat modes
  (`off`/`track`/`queue`), bounded history.
- Autoplay with default YouTube resolver and custom `AutoplayResolver` support.
- Voice self-healing: rejoin after remote voice WebSocket closure (bounded retries);
  automatic move detection.
- Live node migration (`setNode`) without dropping playback.
- Zombie-proof deterministic force-cleanup destroy (3 s REST budget, unconditional
  local purge).
- DAVE-ready voice payloads (`channelId` always forwarded).

**Queue**
- Add/remove/move/take/shuffle (seeded)/reverse/clear operations.
- JSON serialization + pluggable `QueueStore` persistence adapters.
- `UnresolvedTrack` lazy resolution at play time.

**Filters**
- All Lavalink v4 filters with validation, defaults and merge support.
- Fluent chainable builder, single-round-trip applies, presets: nightcore,
  vaporwave, bassboost, karaoke, eightD.

**Client**
- Library-agnostic wiring (`sendToShard` + `sendRawData`).
- 20+ typed events at client, node and player levels; raw payload event.
- Requester generic (`Junie<MyUser>`) flowing through tracks, queues, players, events.
- Leveled structured logger with component namespaces.
- Dual CommonJS + ESM builds; Node ≥ 18.17; single runtime dependency (`ws`).
- 111 unit & behavioural tests; full documentation set and runnable examples.
