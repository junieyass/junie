# Changelog

All notable changes to Junie are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to
[Semantic Versioning](https://semver.org/).

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
