# Nodes & load balancing

A **node** is one Lavalink server connection: a WebSocket session for events, a REST client
for commands, a stats feed for decisions. Junie manages them all through `junie.nodes`.

## Configuring nodes

```ts
const junie = new Junie({
  nodes: [
    {
      id: 'eu-1',                       // unique, stable id
      host: 'eu.example.com',
      port: 2333,                       // default 2333
      authorization: 'secret',
      secure: false,                    // wss/https
      path: '',                         // base path if you proxy under a subpath
      regions: ['europe'],              // voice zones this node serves well
      resume: { enabled: true, timeout: 60 },     // per-node override
      reconnect: { retries: 10, initialDelay: 1000 },  // per-node override
    },
  ],
  // …
});
```

Client-wide defaults (applied to every node unless overridden per node):

```ts
{
  reconnect: { retries: 10, initialDelay: 1000, maxDelay: 60_000, multiplier: 2, jitter: true },
  resume:    { enabled: true, timeout: 60 },   // seconds
  rest:      { timeout: 10_000, retries: 2, headers: {} },
}
```

## Connection lifecycle

```
connect()  → WS dial /v4/websocket with headers:
             Authorization, User-Id, Client-Name, [Session-Id]
           ← op ready { resumed, sessionId }
           → PATCH /v4/sessions/{id} { resuming: true, timeout }   (if resuming enabled)
           → nodeConnect event (+ nodeResumed when resumed)
```

From there Lavalink pushes `stats`, `playerUpdate` and track events, which Junie routes to
players. The `raw` event exposes every payload for telemetry before dispatch.

On WebSocket close (and not a deliberate `destroy`), Junie schedules a reconnect:

```
delay = min(initialDelay × multiplier^(attempt-1), maxDelay)   ± 30% jitter
```

`nodeReconnecting` reports each attempt; after `reconnects.retries` attempts the node emits
`nodeReconnectFailed` and stops until you call `node.connect()` again.

### Session resuming

With resuming enabled (default), a disconnect doesn't kill playback: Lavalink holds voice
connections open and **buffers events** for `timeout` seconds. When Junie reconnects it sends
the old `Session-Id` header, and if the server answers `resumed: true` the buffered events
flush — local and remote state realign with zero audio interruption.

If the session could not be resumed (server restarted, timeout exceeded), `ready.resumed` is
`false` and Junie rebuilds every player that lived on that node: voice credentials are
re-sent and the current track resumes from the last known position, with volume and filters
intact. Your users hear, at worst, a tiny gap.

### Session loss *without* a disconnect (404 self-healing)

If Lavalink restarts and drops its session store while the WebSocket happens to stay up (or
reconnects with a fresh session), REST calls for the old session return **404**. Junie's REST
layer detects that, forces an immediate re-handshake, and the fresh-session rebuild described
above kicks in. You never see a stuck player.

## Load balancing

### The default: penalty strategy

Every connected node gets a penalty score; the **lowest** wins. The default provider
implements:

```
P_total = P_player + P_cpu + P_frame + P_region

P_player = playingPlayers                 — streaming load
P_cpu    = 1.05^(100 × systemLoad) − 1     — ~0 until CPU approaches saturation
P_frame  = 10 × nulled + 20 × deficit      — degraded voice frames
P_region = 0 / 250 / 1000                  — see below
```

- `P_cpu` grows exponentially: a node at 95% system load scores ≈ 130 — enough to outweigh
  a node with a hundred idle players, which is exactly the behaviour you want (idle players
  are cheap; a saturated CPU is not).
- `P_region` compares the Discord voice endpoint (`eu-central586.discord.media` → zone
  `europe`) against the node's configured `regions`: **0** same zone, **250** unknown,
  **1000** cross-zone. Nodes without configured regions are region-neutral (0).

Region hints flow from `createPlayer` — when voice credentials arrive, the selected node is
the one that's geographically close, cutting voice latency.

### Alternative strategies

```ts
import { Junie, RoundRobinStrategy, LeastPlayersStrategy, LeastLoadStrategy } from 'junie';

new Junie({
  strategy: new RoundRobinStrategy(),      // even, predictable distribution
  // strategy: new LeastPlayersStrategy(),  // fewest total players
  // strategy: new LeastLoadStrategy(),     // lowest lavalink CPU load
  // …
});
```

### Custom strategies & providers

A strategy picks a node; a provider scores one. Implement either:

```ts
import { PenaltyStrategy } from 'junie';
import type { PenaltyProvider } from 'junie';

class MyProvider implements PenaltyProvider {
  compute(node, voiceEndpoint) {
    return node.stats!.playingPlayers * 2 + myCustomMetric(node);
  }
}

const junie = new Junie({
  strategy: new PenaltyStrategy(new MyProvider()),
  // …
});
```

Or go fully custom:

```ts
import type { NodeSelectionStrategy } from 'junie';

class StickyByGuildStrategy implements NodeSelectionStrategy {
  select(nodes, context) {
    // your routing logic; throw NO_HEALTHY_NODES when nothing is healthy
  }
}
```

## Parallel search fan-out

When one node's upstream is rate-limited, `/v4/loadtracks` returns *empty results* (not
errors). Fan-out sidesteps that:

```ts
const result = await junie.search({ query: 'song', parallel: true });
// or globally: new JunieOptions({ searchParallel: true, … })
```

The request goes to **every connected node**; the first non-empty result wins, the rest
settle quietly. With one node connected, fan-out is a plain search.

## Node introspection

```ts
const node = junie.nodes.get('eu-1')!;

node.stats            // latest stats op (players, cpu, memory, frameStats)
node.penalty()        // current penalty score (region-neutral)
node.penalty(endpoint) // …for a specific voice endpoint
node.isHealthy        // connected + stats are fresh (< 2 min)
await node.getInfo()  // { version, plugins, enabledSources } — cached per session
await node.getPluginNames();
await node.rest.getVersion();   // raw Lavalink version string
```

Stats also stream to your code:

```ts
junie.on('nodeStats', (node, stats) => {
  metrics.gauge(`lavalink.${node.id}.players`, stats.players);
  metrics.gauge(`lavalink.${node.id}.cpu`, stats.cpu.systemLoad);
});
```

## Custom transports

Route Lavalink WebSockets through a proxy or instrument them:

```ts
import type { WebSocketFactory } from 'junie';

const webSocketFactory: WebSocketFactory = (url, headers) => {
  return new ProxyWebSocket(url, { headers, agent: myProxyAgent });
};

new Junie({ webSocketFactory, /* … */ });
```

The factory receives the URL and the fully-formed handshake headers; return anything that
satisfies the small `WebSocketLike` interface (`on/once/close`).

## Runtime management

```ts
junie.nodes.create({ id: 'us-2', host: '…', authorization: '…' }); // register + connect
junie.nodes.destroy('eu-1');   // deliberate teardown + removal
junie.nodes.list();            // all nodes
junie.nodes.connected();       // connected nodes
```

Removing a node does **not** migrate its players (their REST calls will fail and trigger the
404 self-healing if the node is gone, or you can migrate them explicitly with
`player.setNode(...)`).
