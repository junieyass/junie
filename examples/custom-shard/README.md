# Junie with a custom sharder

Junie is Discord-library-agnostic. This example shows the *entire* integration surface with
a hand-rolled sharder:

```ts
const junie = new Junie({
  nodes: [/* … */],
  sendToShard: (guildId, payload) => shardFor(guildId).ws.send(JSON.stringify(payload)),
});

// from your gateway dispatch handler:
if (packet.t === 'VOICE_STATE_UPDATE' || packet.t === 'VOICE_SERVER_UPDATE') {
  junie.sendRawData(packet);
}
```

Run (against a local Lavalink):

```bash
node index.mjs
```

The demo creates a player and searches — `connect()` will time out with
`VOICE_CONNECTION_TIMEOUT` because no real gateway is answering; read the log output to see
the handshake attempts, then wire the two functions above to your real sharder.
