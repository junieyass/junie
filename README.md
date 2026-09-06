<div align="center">

# 🎵 Junie

**A production-grade, developer-first Lavalink v4 client for Node.js & TypeScript.**

*Elegant audio orchestration for Discord bots.*

[![Node.js](https://img.shields.io/badge/node-%E2%89%A518.17-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Lavalink](https://img.shields.io/badge/Lavalink-v4-FF5C00?logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdib3g9IjAgMCAxNiAxNiI+PGNpcmNsZSBjeD0iOCIgY3k9IjgiIHI9IjciIGZpbGw9IiNGRjVDMDAiLz48L3N2Zz4)](https://lavalink.dev)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Tests](https://img.shields.io/badge/tests-116%20passing-brightgreen)](#testing)

[Quick start](#quick-start) · [Documentation](./docs) · [Examples](./examples) · [API tour](#api-tour)

</div>

---

Junie wraps the [Lavalink v4](https://lavalink.dev) protocol — WebSocket sessions, REST player
control, voice credential routing, session resuming, multi-node load balancing — in a small,
type-safe, thoroughly tested library with **excellent developer experience** as its first design
goal.

Discord libraries come and go; Junie is **library-agnostic**. It talks to Lavalink and to *your*
shards through one small `sendToShard` callback, and consumes raw gateway packets through one
`sendRawData` method. Wire it to discord.js, Eris, DJS proxy bots, or a hand-rolled sharder —
Junie doesn't care.

```ts
import { Junie } from 'junie';

const junie = new Junie({
  nodes: [{ id: 'main', host: 'localhost', authorization: 'youshallnotpass' }],
  sendToShard: (guildId, payload) => client.guilds.cache.get(guildId)?.shard.send(payload),
});

junie.init(client.user.id);
client.on('raw', (packet) => junie.sendRawData(packet));

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== 'play') return;

  const player = junie.createPlayer({
    guildId: interaction.guildId,
    voiceChannelId: interaction.member.voice.channelId,
    textChannelId: interaction.channelId,
  });
  await player.connect();

  const result = await junie.search(interaction.options.getString('query'), interaction.user);
  player.queue.add(result.tracks);
  if (!player.playing) await player.play();

  await interaction.reply(`Now playing **${result.tracks[0]!.title}** 🎶`);
});
```

That's a working music command. Everything below is what makes Junie *production-grade*.

---

## Why Junie?

| | Junie |
|---|---|
| **Protocol** | Complete Lavalink v4: REST player control, WebSocket events, session resuming, DAVE-ready voice payloads (`channelId` always forwarded) |
| **Reliability** | Exponential backoff with jitter, session-404 self-healing, voice self-rejoin, **automatic player failover** — a dead node means live players migrate to the healthiest node, not wedged guilds — and **zombie-proof player destruction** |
| **Scale** | Penalty-based load balancing (players · CPU · frame loss · region), region-aware node placement, parallel search fan-out to defeat upstream rate limits |
| **DX** | Fully typed events, requester typing that flows through tracks → queues → players, fluent filter chains, one-call presets |
| **Queue** | Repeat modes, bounded history, shuffle/move/jump, autoplay, pluggable persistence (Redis/Postgres/...) with `UnresolvedTrack` lazy resolution |
| **Ops** | Leveled structured logging, raw-payload event for telemetry, per-node stats, custom WebSocket transport for proxies |

## How Junie compares

An honest, at-the-time-of-writing view of the Lavalink wrapper landscape. Respect to every
project listed — Junie exists because their ideas set the bar. Verify maintenance status
yourself before choosing; it changes fast.

| | Junie | Shoukaku | erela.js | Moonlink.js | Wavelink | Mafic / Pomice |
|---|---|---|---|---|---|---|
| Language | TS (strict) | TS | JS | TS | Python | Python |
| Lavalink v4 | Full (WS + REST) | Full | Partial | Full | v3 (v4 in v3) | v4 |
| Library-agnostic | **Any** (2 callbacks) | Connectors | discord.js | Multiple | discord.py | discord.py |
| Built-in queue + repeat | Yes | No | Yes | Yes | Yes | Partial |
| Session resuming | Yes + 404 self-heal | Yes | No | Yes | No | No |
| Live player migration | Yes | No | No | No | No | No |
| Search fan-out across nodes | Yes | No | No | No | No | No |
| Filter presets + validation | Yes | Raw | Raw | Partial | Raw | Raw |
| Queue persistence adapters | Yes | — | — | — | — | — |
| Test suite | **116 green tests** + 29-check e2e + real-server suite | Small | Minimal | Minimal | Minimal | Minimal |
| Real-Lavalink verification | **Yes** (in-repo, 4.2.2) | No | No | No | No | No |
| Runtime deps | 1 (`ws`) | 1 (`ws`) | 1 (`ws`) | 2 | several | several |

Where competitors still lead: Shoukaku and Wavelink have years of community, tutorials,
stack-overflow answers and real-world battle scars. That moat is not code — it is time and
people, and it cannot be cloned in a release. If you want the safest ecosystem bet today,
pick the wrapper your community already uses. If you want the best-engineered core and are
willing to file the first issues, Junie earns its keep.

## Feature tour

- **Node management** — connect many Lavalink nodes; automatic selection via
  [`PenaltyStrategy`](./docs/nodes.md) (default) or round-robin / least-players / least-load /
  your own. Region-aware placement from Discord voice endpoints.
- **Session resuming** — configured on connect, verified on reconnect; buffered events replay
  automatically. Fresh sessions transparently rebuild remote players (voice + track + position).
- **Players** — full lifecycle with auto-advance, repeat modes, autoplay, pause/seek/volume,
  live node migration (`player.setNode('eu-2')`), and deterministic force-cleanup on destroy.
- **Queues** — rich operations, bounded history, JSON serialization, pluggable
  [`QueueStore`](./docs/queue-and-autoplay.md) adapters, and `UnresolvedTrack`s that resolve
  right before they play (perfect for restart persistence).
- **Filters** — every Lavalink v4 filter with validation and defaults, one-round-trip applies,
  plus `nightcore()`, `vaporwave()`, `bassboost()`, `eightD()`, `karaoke()` presets.
  See [filters](./docs/filters.md).
- **Search** — sources & plugin prefixes (LavaSrc's `spsearch:` etc. work out of the box),
  requester attachment, playlist flattening, and optional parallel fan-out across all nodes.
- **Events** — 20+ typed events at client, node and player level. See the
  [event reference](./docs/events.md).
- **Errors** — a small, documented hierarchy with stable codes and Lavalink's structured error
  bodies attached. See [errors](./docs/errors.md).

## Installation

```bash
npm install junie
# you also need a Lavalink v4 server:
docker run -d -p 2333:2333 ghcr.io/lavalink-devs/lavalink:4 --port 2333 --password youshallnotpass
```

Junie targets **Node.js ≥ 18.17**, ships **CommonJS and ESM** builds, and has exactly one runtime
dependency (`ws`) — native `fetch` handles the rest.

## Quick start

> Full walkthrough (including a Lavalink config file): **[docs/getting-started.md](./docs/getting-started.md)**

1. Create the client and connect nodes when your bot is ready:

```ts
const junie = new Junie({
  nodes: [
    { id: 'eu-1', host: 'eu.example.com', authorization: 'secret', regions: ['europe'] },
    { id: 'us-1', host: 'us.example.com', authorization: 'secret', regions: ['north-america'] },
  ],
  sendToShard: (guildId, payload) => shardFor(guildId).send(payload),
});

client.once('ready', () => junie.init(client.user.id));
```

2. Forward raw Discord voice packets (discord.js shown; any library that exposes raw dispatches works):

```ts
client.on('raw', (packet) => junie.sendRawData(packet));
```

3. Play music:

```ts
const player = junie.createPlayer({ guildId, voiceChannelId, textChannelId });
await player.connect();

const { tracks } = await junie.search('never gonna give you up', interaction.user);
player.queue.add(tracks);
await player.play();
```

4. React to the queue:

```ts
junie.on('trackStart', (player, track) => {
  const channel = client.channels.cache.get(player.textChannelId!);
  channel?.send(`🎶 Now playing: **${track.title}** (${track.requester})`);
});

junie.on('queueEnd', (player) => {
  player.setAutoplay(true); // or destroy, or announce
});
```

## API tour

<details open>
<summary><strong>The client</strong> — <code>Junie</code></summary>

```ts
junie.init(userId)                    // connect all nodes (call when your bot is ready)
junie.search(query, requester)        // search; URLs, 'ytsearch:' etc. pass through
junie.createPlayer(options)           // create (or fetch) a guild player
junie.getPlayer(guildId)              // undefined-safe fetch
junie.destroyPlayer(guildId)          // graceful teardown
junie.sendRawData(packet)             // feed VOICE_* gateway packets
junie.destroy()                       // players + nodes + listeners, in order
junie.utils.buildTrack(apiTrack)      // rebuild a Track (e.g. from your database)
junie.logger.child('MyBot')           // structured, leveled logging
```

</details>

<details>
<summary><strong>The player</strong> — <code>Player</code></summary>

```ts
await player.connect()                // join voice; resolves when Lavalink is wired up
await player.play(track?)             // play a track or the next queued one
await player.play('some query')       // strings resolve lazily via search
await player.pause() / .resume()
await player.seek(90_000)             // throws on live streams — by design
await player.setVolume(150)           // 0–1000, clamped
await player.skip(2)                  // skip N tracks
await player.stop()                   // stop (advances); stop(false) keeps the track replayable
await player.setNode('us-1')          // migrate a live player between nodes
await player.destroy()                // zombie-proof, timeout-bounded teardown
player.queue / player.filters         // see below
player.playing / paused / connected / position / ping / volume
player.setTextChannel(id) / setRepeatMode('queue') / setAutoplay(true)
```

</details>

<details>
<summary><strong>The queue</strong> — <code>player.queue</code></summary>

```ts
queue.add(trackOrTracks, position?)   // Track | UnresolvedTrack | raw Lavalink tracks
queue.remove(3) / queue.removeRange(0, 5)
queue.shuffle(seed?) / queue.reverse() / queue.move(4, 0)
queue.clear() / queue.clearHistory()
queue.size / totalSize / duration / isEmpty
queue.repeatMode = 'track'            // 'off' | 'track' | 'queue'
queue.previous / queue.lastTrack      // bounded, restart-friendly history
await queue.restore()                 // hydrate from a QueueStore
```

</details>

<details>
<summary><strong>Filters</strong> — <code>player.filters</code></summary>

```ts
await player.filters
  .setVolume(1.2)
  .setTimescale({ speed: 1.2, pitch: 1.05 })
  .bassboost(0.7)
  .apply();                           // ONE PATCH — one round trip

player.filters.nightcore();           // ...vaporwave(), karaoke(), eightD()
await player.filters.clear();         // reset + apply
await player.setFilters({ volume: 2 }); // raw merge-and-apply
```

</details>

<details>
<summary><strong>Nodes & stats</strong> — <code>junie.nodes</code></summary>

```ts
junie.nodes.best({ voiceEndpoint })   // strategy selection (region-aware)
junie.nodes.get('eu-1')               // Node: .stats, .sessionId, .resumed, .penalty()
await node.getInfo()                  // version + installed plugins
await node.getPluginNames()
await junie.nodes.fanOutSearch('q')   // parallel search across all nodes
node.on('stats', (node, stats) => dashboard.update(node.id, stats));
```

</details>

## Architecture at a glance

```
            ┌───────────────┐  op 4 (voice join)   ┌──────────────────┐
            │ Discord       │ ───────────────────► │ Your bot / shards │
            │ Gateway       │ ◄────VOICE_STATE──── │ (any library)    │
            │               │      _UPDATE,        └────────┬─────────┘
            │               │      VOICE_SERVER_            │ raw packets
            │               │      UPDATE                   ▼
            └───────▲───────┘                       ┌──────────────────┐
                    │ WebRTC audio (Opus)           │      Junie       │
                    │                                │ ┌──────────────┐ │
            ┌───────┴───────┐        REST /v4       │ │ NodeManager  │ │  WSS /v4/websocket
            │   Lavalink    │ ◄──────────────────── │ │  ├ Node …    │ │ ─────────────────►
            │   node(s)     │ ─────────events────►  │ │ PlayerManager│ │
            └───────────────┘  playerUpdate,        │ │  └ Player(s) │ │
                              track events, stats   │ │   Queues     │ │
                                                    │ └──────────────┘ │
                                                    └──────────────────┘
```

Deep dive: **[docs/architecture.md](./docs/architecture.md)** — the dual control loop, event
routing, state synchronization and the failure modes Junie defends against.

## Documentation

| Guide | Contents |
|---|---|
| [Getting started](./docs/getting-started.md) | Installing, Lavalink config, wiring, first commands |
| [Architecture](./docs/architecture.md) | Components, protocol flows, resilience design |
| [Players](./docs/players.md) | Player lifecycle & complete method reference |
| [Queue & autoplay](./docs/queue-and-autoplay.md) | Queue operations, persistence, autoplay |
| [Filters](./docs/filters.md) | Every filter, every range, presets, plugin filters |
| [Nodes & load balancing](./docs/nodes.md) | Strategies, the penalty formula, resuming, failover |
| [Events](./docs/events.md) | Full typed event reference |
| [REST & plugins](./docs/rest.md) | REST API, plugin endpoints (LavaLyrics, LavaSrc, …) |
| [Errors](./docs/errors.md) | Error hierarchy, codes, recovery guidance |
| [Troubleshooting](./docs/troubleshooting.md) | Common pitfalls and their fixes |

Runnable examples: [discord.js music bot](./examples/discordjs) · [custom-shard bot](./examples/custom-shard) · [battle-bot with dry-run validation](./examples/battle-bot)

Also in the repo: **[PROTOCOL.md](./PROTOCOL.md)** — every Lavalink op and REST route mapped
 to the code that speaks it, a three-level verification ladder, and an upgrade runbook for
 new Lavalink releases; **[PUBLISH.md](./PUBLISH.md)** — the release & launch runbook; and
 **[site/index.html](./site/index.html)** — a zero-dependency landing page for GitHub Pages.

## Testing

```bash
npm test              # 116 unit & behavioural tests — no Lavalink server required
node scripts/e2e.mjs  # 29-check battle test: real sockets against a fake Lavalink v4
node scripts/real-smoke.mjs  # optional: 12 checks against a REAL Lavalink jar (needs Java)
npm run build         # dual CJS + ESM output
```

The verification ladder has three levels. **V1** (unit) covers queue semantics, filter
validation, penalty math, REST retry/timeout/404 behaviour, WebSocket reconnection with
backoff, session-loss rebuilding, voice self-healing, autoplay, node migration, auto-failover
and zombie-proof destruction with exact payload shapes. **V2** (e2e) drives the *built
artifact* through a complete lifecycle over real TCP — including node kill → player
failover → session resume. **V3** (real server) boots an actual Lavalink 4.2.2 jar and
round-trips every REST route with real encoded tracks — the level that caught the decode
route naming trap documented in [PROTOCOL.md](./PROTOCOL.md).

## Project principles

1. **Correctness under failure first.** Every network path has a timeout, every teardown has a
   `finally`, every reconnect has a backoff with jitter.
2. **Small, honest API.** No magic defaults that surprise you; no methods that quietly hit the
   network twice.
3. **Types are documentation.** The requester generic flows through the entire library, and
   listening to the wrong event shape is a compile error.
4. **Zero lock-in.** Library-agnostic voice wiring, pluggable transports, stores, strategies,
   resolvers.

## License

[MIT](./LICENSE) — © Junie Labs
