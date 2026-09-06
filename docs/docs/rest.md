# REST & plugins

Junie's REST layer (`node.rest`) wraps every v4 endpoint with timeouts, retries for transient
failures, and structured errors. You normally reach it indirectly (players, search), but it's
fully public — including a generic `request` for **plugin endpoints**.

## What Junie calls for you

| Endpoint | Junie caller |
|---|---|
| `GET /v4/loadtracks?identifier=…` | `junie.search`, `node.search` |
| `PATCH /v4/sessions/{id}` | resume configuration after `ready` |
| `GET /v4/sessions/{id}/players` | `node.rest.getPlayers()` |
| `GET /v4/sessions/{id}/players/{guild}` | `node.rest.getPlayer(guildId)` |
| `PATCH /v4/sessions/{id}/players/{guild}?noReplace=…` | every player mutation |
| `DELETE /v4/sessions/{id}/players/{guild}` | `player.destroy()`, node migration |
| `GET /v4/info` · `GET /v4/stats` · `GET /version` | node introspection |

## Direct use

```ts
const node = junie.nodes.best();
const rest = node.rest;

await rest.decodeTrack('QAAA…');                       // → APITrack
await rest.decodeTracks(['QAAA…', 'QAAA…']);           // → APITrack[]
await rest.getStats();                                 // → NodeStats
await rest.getVersion();                               // → "4.0.8"
await rest.getRoutePlannerStatus();                    // → status or null
await rest.freeFailedAddresses(['1.2.3.4']);           // route planner ops
```

Every call sends `Authorization` and `Client-Name` headers, enforces a per-request timeout
(default 10 s; searches 15 s), and retries network errors and 5xx/429 responses
(`rest.retries`, default 2) with short backoffs.

## The generic `request`

For anything Junie doesn't model — plugins — speak raw REST:

```ts
// LavaLyrics: current track's lyrics
const lyrics = await node.rest.request<{ lyrics: string }>(
  'GET',
  `/v4/sessions/${node.sessionId}/players/${guildId}/track/lyrics`,
);

// LavaLyrics: subscribe to synchronized lyrics over the WebSocket
await node.rest.request('POST',
  `/v4/sessions/${node.sessionId}/players/${guildId}/lyrics/subscribe`,
  { body: {} },
);
```

`request(method, route, options)` supports `body`, `query`, `timeout`, `retries` and
`responseType`. Session-scoped 404s still trigger Junie's
[session self-healing](./nodes.md#session-loss-without-a-disconnect-404-self-healing).

## Detecting plugins

```ts
const plugins = await node.getPluginNames();
if (plugins.includes('lavasrc')) {
  // LavaSrc sources work through search prefixes:
  const result = await junie.search({ query: 'artist', source: 'spsearch' });
}
```

Search prefixes pass straight through — any `source` that isn't `youtube` / `youtubeMusic` /
`soundcloud` / `none` is used verbatim as a prefix:

```ts
junie.search({ query: 'song', source: 'spsearch' });    // spsearch:song
junie.search({ query: 'song', source: 'dzsearch' });    // dzsearch:song (Deezer)
junie.search('ymsearch:song');                          // raw prefixed queries pass through
junie.search({ query: '…', extraQueryUrlParams: { voice: 'MALE_1' } }); // e.g. flowery-tts
```

## Track user data

Attach arbitrary JSON to tracks; Lavalink echoes it back on the track in every event:

```ts
track.userData = { requesterId: '123', playlist: 'chill' };
await player.play(track);
```

## A note on volume

Two volumes exist and they multiply server-side:

| | Range | API | Use for |
|---|---|---|---|
| Player volume | 0–1000 | `player.setVolume(100)` | the user-facing "volume" |
| Filter volume | 0.0–5.0 | `player.filters.setVolume(1)` | fades / gain staging |

`100` player volume = unity gain. Going above ~250 tends to clip; combine with a limiter
(equalizer gains) rather than pushing volume.

## HTTP semantics Junie implements for you

- **Timeouts** — every request, every time (`AbortSignal`).
- **Retries** — network errors, 5xx and 429, with 300/600 ms backoffs; 4xx never retries.
- **Structured errors** — Lavalink's error body
  (`{ timestamp, status, error, message, path, trace }`) lands on `JunieRestError.lavalink`.
- **404 session self-healing** — described in [nodes](./nodes.md).
- **Keep-alive** — Node's native `fetch` pools connections per origin automatically.
