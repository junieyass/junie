**I built Junie — a Lavalink v4 client for Node.js/TypeScript with automatic player failover**

After years of music-bot breakage patterns (dead node → stuck guilds, restarts
→ lost queues, v3 leftovers in v4 wrappers), I open-sourced my fix.

**What it does differently:**

- **Auto-failover** — a node dies, its players migrate to the best remaining
  node with voice/track/position intact. Nobody else does this today.
- **Library-agnostic by design** — two callbacks (`sendToShard` + raw packet
  forwarding) wire it to any Discord library or custom sharder.
- **Protocol-verified** — 116 unit tests, a 29-check e2e suite that runs over
  real sockets against a fake Lavalink, and a smoke suite against an actual
  Lavalink 4.2.2 jar. PROTOCOL.md maps every op/route to the code that speaks
  it, so new Lavalink versions get supported fast.
- **DX-first** — typed events, requester generics flowing through tracks →
  queues → players, filter presets, pluggable queue persistence,
  `UnresolvedTrack`s that resolve right before playing.

Plus the boring essentials done properly: session resuming with 404
self-healing, penalty-based load balancing, jittered reconnect backoff,
zombie-proof player destruction, one runtime dep, dual ESM/CJS.

**Honest framing:** it's new. The established wrappers have communities,
tutorials and years of battle scars — that moat is real. Junie's bet is
engineering: if you've been burned by stuck players or lost queues, this is
the wrapper built around not doing that.

- npm: YOUR_LINK
- GitHub: YOUR_LINK
- Comparison table: YOUR_LINK#how-junie-compares

Ask me anything — including "why not just use X" (fair question, the README
answers it).
