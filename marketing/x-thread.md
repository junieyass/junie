1/ Junie is out: a Lavalink v4 client for Node.js/TypeScript.

The short pitch: when a Lavalink node dies, your players move to a healthy
node by themselves — voice, track, position and filters intact. Nobody else
does that today. 🧵

2/ Why it exists: the recurring music-bot outage isn't "Lavalink crashed."
It's "Lavalink crashed and 40 guilds stayed wedged until someone noticed."

Auto-failover turns that into a log line. `autoFailover: false` if you'd
rather drive.

3/ Library-agnostic on purpose. The entire Discord glue is two callbacks:

sendToShard + raw packet forwarding. discord.js? Eris? Oceanic? your own
sharder? Junie doesn't care.

4/ Protocol rigor over vibes:

✓ 116 unit tests (exact payload shapes)
✓ 29-check e2e over real sockets
✓ verified against real Lavalink 4.2.2

PROTOCOL.md maps every op → code, so new Lavalink versions land fast.

5/ Developer experience: typed events, requester generics that flow through
tracks → queues → players, filter presets (nightcore/bassboost/8D), queue
persistence adapters, UnresolvedTrack lazy resolution.

One runtime dependency. ESM + CJS. MIT.

6/ The honest part: it's new, the community is small, and you might file some
of the first issues. The established wrappers earned their moats — years of
tutorials and Stack Overflow answers.

Junie's bet is engineering. If that trade sounds right: YOUR_LINK

(comparison table in the README: YOUR_LINK#how-junie-compares)
