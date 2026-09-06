**Junie — a new Lavalink v4 client for Node.js/TypeScript**

Hey! I've been building music bots for a while and kept hitting the same walls:
players wedged when a node died, queues lost on restarts, v3 leftovers in v4
wrappers. So I built Junie (MIT):

- **Library-agnostic**: the entire Discord glue is two callbacks — works with
  discord.js, Eris, Oceanic, or a hand-rolled sharder
- **Auto-failover**: when a node dies, its players migrate to the best
  remaining node (voice + track + position re-established) — no code needed
- **Session resuming** with 404 self-healing when Lavalink restarts
- Full v4 REST + WS, filters with validation + presets (nightcore/bassboost/8D…),
  queue with repeat/autoplay/pluggable persistence, `UnresolvedTrack` lazy
  resolution
- 116 unit tests + a 29-check e2e battle test over real sockets + verified
  against a real Lavalink 4.2.2 server
- One runtime dependency (`ws`), dual ESM/CJS, fully typed events and
  requester generics

npm: YOUR_LINK · GitHub: YOUR_LINK · Docs: YOUR_LINK

Honest caveats: it's new, so the community is small and you'll be filing some
of the first issues. If you want battle-tested-and-boring, the established
wrappers are a fine choice. If you want failover that actually moves players
and don't mind being early, give Junie a spin — issues get answered fast.

Happy to answer anything about the architecture (PROTOCOL.md maps every op to
code).
