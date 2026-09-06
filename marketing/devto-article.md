# Junie: I built the Lavalink client I kept wishing existed

*A post about the failure modes of music bots, and a Node.js/TypeScript
library built around eliminating them.*

If you've run a Discord music bot at any scale, you know the real enemy
isn't features — it's the 3am page that says "music broken in 40 guilds" and
nothing else. This post is about where those outages actually come from, and
about [Junie](YOUR_LINK), the Lavalink v4 client I open-sourced to make them
boring.

## The four ways music bots die

**1. A node dies and the guilds stay wedged.** Your Lavalink host restarts.
Most clients mark the node disconnected and… that's it. Players pinned to a
dead node keep accepting commands that go nowhere. Users retype `!play` and
get silence.

Junie treats node death as a routing event: every player on the dead node is
migrated to the healthiest connected node — voice credentials, current track,
position, volume and filters re-established via one REST round trip before the
old player is destroyed. Playback continues. It's one boolean
(`autoFailover`, default on), and you can still migrate manually with
`player.setNode('eu-2')` for maintenance.

**2. Restarts eat the queue.** The bot process restarts and 200 queued songs
evaporate. Junie serializes queues through a pluggable `QueueStore`
(Redis/Postgres/whatever you implement — an in-memory adapter ships as the
reference). Restored queues use `UnresolvedTrack`s that lazily resolve
against a healthy node right before playing, because encoded tracks expire.

**3. Lavalink upgrades break clients silently.** A protocol change shows up
as weird behaviour weeks later. Junie auto-detects each node's version
(`node.lavalinkVersion`, via `GET /version`) after every ready, emits a
`versionMismatch` event when the major drifts, and never hard-fails — you get
the signal, not an outage. `PROTOCOL.md` maps every WebSocket op and REST
route to the code that speaks it, plus a three-level verification ladder.

**4. The glue rots.** Wrappers that hard-couple to one Discord library age
with it. Junie is library-agnostic by construction — the entire glue is two
functions:

```ts
const junie = new Junie({
  nodes: [{ id: 'main', host: 'localhost', authorization: 'youshallnotpass' }],
  sendToShard: (guildId, payload) => client.guilds.cache.get(guildId)?.shard.send(payload),
});
junie.init(client.user.id);
client.on('raw', (packet) => junie.sendRawData(packet));
```

discord.js, Eris, Oceanic.JS or a hand-rolled sharder — same two callbacks.

## How much can you trust it?

This is where new libraries usually hand-wave, so here's the exact ladder:

- **116 unit tests** assert exact protocol payload shapes with fake sockets
  and fetch stubs.
- A **29-check e2e battle test** drives the built artifact against a fake
  Lavalink server over *real* TCP/WebSocket/HTTP — connect, voice handshake,
  playback, auto-advance, node kill → failover, reconnect → session resume,
  teardown. You can run it yourself: `node scripts/e2e.mjs`.
- A **real-server smoke suite** boots an actual Lavalink 4.2.2 jar and
  round-trips every REST route, including decoding real tracks. This caught a
  decode-route naming trap that docs-led implementations get wrong
  (spoiler: `/v4/decode` doesn't exist on 4.2.2; PROTOCOL.md has the details).

One runtime dependency (`ws`), dual ESM/CJS builds, fully typed events,
requester generics that flow through tracks → queues → players, MIT license.

## The honest part

Shoukaku, Wavelink, erela.js, Moonlink and friends earned their communities
over years — tutorials, Stack Overflow answers, battle scars. That moat is
real and I respect it; the README's comparison table says so explicitly.
Junie's bet is that engineering rigor compounds: if you've personally been
burned by stuck players, silent protocol drift, or queue loss, this library
was designed around exactly those failures, and issues get answered fast.

- npm: `npm install junie` → YOUR_LINK
- GitHub: YOUR_LINK
- Comparison: YOUR_LINK#how-junie-compares

Try it with a two-node setup and literally unplug one node mid-song. That
demo sold every skeptic so far.
