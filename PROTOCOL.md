# The Lavalink protocol, mapped to Junie

This document exists for one reason: **shipping support for new Lavalink
protocol versions faster than anyone else.** It maps every protocol surface
Junie speaks to the code that speaks it, so a protocol change has an obvious
landing zone and an obvious verification path.

---

## Verification levels

Every protocol surface below is verified at one of three levels:

| Level | What | Where |
|---|---|---|
| **V1** — unit | Fake sockets + fetch stubs, exact payload shapes | `tests/*.test.ts` (116 tests) |
| **V2** — e2e | Full cycle over real TCP/WS/HTTP against a fake server | `scripts/e2e.mjs` (29 checks) + `examples/battle-bot npm run dry` |
| **V3** — real server | Actual Lavalink 4.2.2 (Java) — REST routes, WS handshake, real encoded tracks | `scripts/real-smoke.mjs` (12 checks) |

When the protocol changes, re-run the affected level. When you add a surface,
wire it into at least V1, ideally V2, and for REST routes V3.

## Surface map

### WebSocket (`GET /v4/websocket`)

| Direction | Op / payload | Junie code | Verified |
|---|---|---|---|
| C→S headers | `Authorization`, `User-Id`, `Client-Name`, `Session-Id` (resume) | `Node#connect` (src/node/Node.ts) | V1, V2, V3 |
| S→C | `ready` `{ sessionId, resumed }` | `Node#handleReady` | V1, V2, V3 |
| S→C | `stats` | `Node#handleMessage` → strategies | V1, V2 |
| S→C | `playerUpdate` `{ guildId, state }` | `Node` → `Junie#notifyPlayerUpdate` → `Player#handlePlayerUpdate` | V1, V2 |
| S→C | `event` (TrackStart/TrackEnd/TrackStuck/TrackException/WebSocketClosed/Voice?) | `Junie#notifyEvent` → `Player#handleEvent` | V1, V2 |
| S→C | unknown op | logged at trace, ignored (`Node#handleMessage` default) | V1 |

**Forward compatibility rule:** unknown ops and unknown event types are always
ignored gracefully, and exposed raw via the `raw` event for user-side handling.
A new Lavalink op therefore never breaks Junie — it just isn't *shaped* yet.

### REST (`/v4`)

| Route | Junie code | Verified |
|---|---|---|
| `GET /version` (root) | `Rest#getVersion` + `Node#detectVersion` (auto after ready; `versionMismatch` event on major drift) | V1, V2, V3 |
| `GET /v4/info` | `Rest#getInfo` (cached per session) | V1, V3 |
| `GET /v4/loadtracks?identifier=` | `Rest#loadTracks` (15s timeout) → `SearchResult` | V1, V2, V3 |
| `GET /v4/decodetrack?encodedTrack=` | `Rest#decodeTrack` | V3 ⚠️ see note |
| `POST /v4/decodetracks` (JSON array) | `Rest#decodeTracks` | V3 |
| `PATCH /v4/sessions/{id}` `{ resuming, timeout }` | `Rest#updateSession` (after fresh ready) | V1, V2, V3 |
| `DELETE /v4/sessions/{id}` | exposed for completeness | V1 |
| `GET /v4/sessions/{id}/players` | `Rest#getPlayers` | V1 |
| `GET/PATCH/DELETE /v4/sessions/{id}/players/{gid}` | `Rest#getPlayer/updatePlayer/destroyPlayer` (the whole player control plane) | V1, V2, V3 |
| `PATCH` with `voice`, `track`, `position`, `volume`, `paused`, `filters`, `noReplace` | `Player`/`FilterManager` payload builders | V1, V2 |
| `GET /v4/stats` | `Rest#getStats` | V1 |
| `GET /v4/routeplanner/status`, `POST /v4/routeplanner/free` | `Rest#getRoutePlannerStatus/freeFailedAddresses` | V1 |
| Lavalink error body `{ timestamp, status, error, message, path }` | `JunieRestError` mapping | V1 |

> ⚠️ **decode note (verified empirically):** against Lavalink 4.2.2 the decode
> routes are `GET /v4/decodetrack` (binds both `track` and `encodedTrack`
> query names) and `POST /v4/decodetracks` with a JSON array body. There is
> **no** `/v4/decode` on 4.2.2 (404). If a future Lavalink renames these,
> `scripts/real-smoke.mjs` will fail first — that's the tripwire.

### Error & recovery semantics

| Behaviour | Junie code | Verified |
|---|---|---|
| WS close → exponential backoff + jitter reconnect | `Node#scheduleReconnect` | V1, V2 |
| Session-404 on REST → force re-handshake, rebuild players | `Rest` (isSessionRoute) → `Node#forceReconnect` → `Junie#notifyReady` → `Player#reinitialize` | V1 |
| Node death → automatic player migration to best remaining node | `Junie#notifyDisconnect` → `failoverPlayers` (`autoFailover` option, default on) | V1, V2 |
| Reconnect with `Session-Id` header → resume | `Node#connect` | V1, V2 |

## Upgrade runbook (when Lavalink ships a new version)

1. **Watch**: the [Lavalink repo releases](https://github.com/lavalink-devs/Lavalink/releases),
   `#lavalink-dev` in the Lavalink Discord, and the
   [API docs changelog](https://lavalink.dev/rest). RSS/notifications on.
2. **Diff the protocol**: new ops, events, REST routes, filter fields, header
   expectations. The docs are versioned per release.
3. **Bump the tripwires first**: `Node#expectedLavalinkMajor` if it's a major,
   then run `node scripts/real-smoke.mjs` against the new jar
   (drop it in `../lavalink-real/`). Every mismatch shows up as a FAIL with the
   real server's response body attached.
4. **Implement**: land changes in the files from the surface map above. New
   events → add to `LavalinkEvent` union (types/api.ts) + `Player#handleEvent`
   + a V1 test with the exact payload from the docs.
5. **New filters** → `FilterManager` + validation + V1 test; presets if obvious.
6. **Re-verify**: V1 (`npm test`), V2 (`node scripts/e2e.mjs`), V3
   (`node scripts/real-smoke.mjs`). Update the version numbers in this table.
7. **Release within days**: PATCH or MINOR bump, CHANGELOG entry, and a release
   note that names the exact Lavalink version supported
   ("first client with X" is free marketing when it's true).
8. **Tolerance policy**: never hard-fail on unknown/mismatched versions —
   Junie warns (`versionMismatch`), keeps working, and lets users decide.
   Breaking on version checks is how libraries strand users mid-incident.

## Known divergences / decisions

- Voice credentials are submitted **only** via REST player PATCH (the v4 way).
  The v3 WS `voiceUpdate` op is not sent — correct for all v4 servers.
- `loadType: 'track'` responses carry a **single object** in `data` (not an
  array) — Junie normalizes both shapes. Verified against 4.2.2.
- `Session-Id` resume header + REST resuming PATCH is the full resume story;
  no additional op needed.
