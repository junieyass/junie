# Queue & autoplay

Every player owns a `Queue` with three sections:

```ts
player.queue.current   // the currently playing track (or the last stopped one)
player.queue.tracks    // upcoming tracks (index 0 plays next)
player.queue.previous  // bounded history, oldest → newest
```

The queue accepts `Track`s, `UnresolvedTrack`s and raw Lavalink track objects — singly, in
arrays, or mixed:

```ts
player.queue.add(track);
player.queue.add([trackA, trackB]);
player.queue.add(rawLavalinkTrack);          // auto-wrapped into a Track
player.queue.add(new UnresolvedTrack('song')); // resolved lazily at play time
```

## Operations

```ts
queue.add(input, position?)   // insert; negative counts from the end (list.insert-style)
queue.remove(index)           // → removed track | null
queue.removeRange(index, n)   // → removed tracks
queue.move(from, to)          // → moved track | null
queue.take(index)             // remove & return (great for "play this next")
queue.shuffle(seed?)          // Fisher–Yates; a seed makes it reproducible
queue.reverse()
queue.clear()                 // drop upcoming (keeps current)
queue.clear(false)            // also drop current
queue.clearHistory()
queue.setTracks(tracks)       // replace the upcoming queue
```

Read-only surface:

```ts
queue.size          // upcoming count
queue.totalSize     // + current
queue.isEmpty
queue.duration      // upcoming ms (streams count 0)
queue.totalDuration // + current
queue.lastTrack     // most recently played
queue.repeatMode    // 'off' | 'track' | 'queue'
```

### Repeat modes

```ts
queue.setRepeatMode('track');   // or the queue.repeatMode setter
queue.setRepeatMode('queue');
```

Both apply to `finished` tracks only — explicit skips are never looped back. Repeat state is
persisted with the queue (see below).

### History

Finished and skipped tracks land in `queue.previous` (bounded to `historyLimit`, default 50 —
the most recent *last*). History powers "previously played" views and replay commands, and is
the seed for autoplay's duplicate filter.

## Persistence

Give Junie a `QueueStore` and every queue mutation serializes itself:

```ts
import { Junie, MemoryQueueStore } from 'junie';

const junie = new Junie({
  // …
  queue: {
    store: myStore,        // see interface below
    restore: false,       // auto-hydrate on player creation (opt-in)
    historyLimit: 50,
  },
});
```

The adapter interface is deliberately tiny — three async functions over JSON strings:

```ts
export interface QueueStore {
  get(guildId: string): Promise<string | null>;
  set(guildId: string, data: string): Promise<void>;
  delete(guildId: string): Promise<void>;
}
```

A Redis adapter, for example:

```ts
import type { QueueStore } from 'junie';

export class RedisQueueStore implements QueueStore {
  constructor(private readonly redis: Redis) {}

  async get(guildId: string) {
    return this.redis.get(`junie:queue:${guildId}`);
  }
  async set(guildId: string, data: string) {
    await this.redis.set(`junie:queue:${guildId}`, data);
  }
  async delete(guildId: string) {
    await this.redis.del(`junie:queue:${guildId}`);
  }
}
```

Serialization includes the current track, upcoming tracks, history and repeat mode. Each track
stores its encoded string + metadata + your `requester`, so a restored queue is immediately
playable.

### Restoring

Two options:

- **Automatic** — set `restore: true` and every newly created player hydrates its queue in the
  background (a mutation guard prevents races with your own `add` calls).
- **Explicit** — call it yourself when you want control:

```ts
const player = junie.createPlayer({ guildId, voiceChannelId, textChannelId });
const restored = await player.queue.restore();
if (restored && player.queue.current) {
  await player.play();   // resume where you left off
}
```

`Player#destroy` removes the persisted queue (the guild has no player anymore). If you want a
"keep my queue while the bot restarts" flow, persist on `playerDestroy` is *not* what you want
— destroy clears it; instead call `junie.destroyPlayer(guildId, 'restart')` only after you've
copied anything you need, or keep `destroyOnVoiceLeave: false` and manage teardown yourself.

### UnresolvedTrack — the cheap way to persist

Re-searching hundreds of tracks after a restart is slow and burns rate limit. Store
*queries* instead:

```ts
import { UnresolvedTrack } from 'junie';

queue.add(new UnresolvedTrack('never gonna give you up', 'Rick Astley'));
```

An `UnresolvedTrack` serializes to just `{ kind: 'unresolved', query, title, requester }` and
resolves (searches on the player's node) **right before it plays**. Resolution failures emit
`trackError` and auto-skip (configurable via `skipOnError`), so one dead query never stalls the
queue.

## Autoplay

```ts
player.setAutoplay(true);   // per player
// or by default: new JunieOptions({ … }) — set it on createPlayer options
```

When the queue runs dry *with autoplay on*, Junie asks a resolver for more music, adds the
pick, and plays it. `queueEnd` is only emitted when autoplay is off (or fails, or finds
nothing).

The **default resolver** searches YouTube with the last track's title and author, filters out
live streams and anything played in the last 10 history entries, then picks randomly among the
results — a decent "radio" behaviour with zero configuration.

Swap in your own (Spotify recommendations, Deezer radio, hand-picked playlists):

```ts
const junie = new Junie({
  // …
  autoplayResolver: async (player, lastTrack) => {
    // Either return tracks…
    const results = await mySpotifyApi.getRecommendations(lastTrack);
    return mySpotifyTracksToJunieTracks(results);
    // …or return a search query and let Junie do the searching:
    // return { query: `${lastTrack.title} radio`, source: 'youtube' };
  },
});
```

The resolver receives the player and the last played track; return an array of `Track`s or a
`SearchQuery`. Errors are caught, logged, and downgrade to `queueEnd`.
