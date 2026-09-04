/**
 * Unit tests for the queue.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Queue } from '../src/queue/Queue.js';
import { Track, UnresolvedTrack } from '../src/track/Track.js';
import { MemoryQueueStore } from '../src/queue/QueueStore.js';
import { makeApiTrack, createTestClient } from './fixtures.js';
import type { Player } from '../src/player/Player.js';

describe('Queue', () => {
  let queue: Queue;
  let player: Player;

  beforeEach(() => {
    const { junie } = createTestClient();
    junie.nodes.get('test')!.connected = true;
    player = junie.createPlayer({ guildId: 'g1', voiceChannelId: 'vc1' });
    queue = player.queue;
  });

  it('adds single tracks and arrays', () => {
    const a = new Track(makeApiTrack('A'));
    const b = new Track(makeApiTrack('B'));
    const c = new Track(makeApiTrack('C'));

    queue.add(a);
    expect(queue.size).toBe(1);

    queue.add([b, c]);
    expect(queue.size).toBe(3);
    expect(queue.tracks.map((t) => t.title)).toEqual(['A', 'B', 'C']);
  });

  it('accepts raw Lavalink track objects', () => {
    queue.add(makeApiTrack('Raw'));
    expect(queue.size).toBe(1);
    expect(queue.tracks[0]).toBeInstanceOf(Track);
  });

  it('inserts at a position and supports negative positions', () => {
    const [a, b, c, d] = ['A', 'B', 'C', 'D'].map((t) => new Track(makeApiTrack(t)));
    queue.add([a, b, c]);
    queue.add(d, 1);
    expect(queue.tracks.map((t) => t.title)).toEqual(['A', 'D', 'B', 'C']);
    queue.add(new Track(makeApiTrack('E')), -1);
    expect(queue.tracks.map((t) => t.title)).toEqual(['A', 'D', 'B', 'E', 'C']);
    queue.add(new Track(makeApiTrack('F')), -3);
    expect(queue.tracks.map((t) => t.title)).toEqual(['A', 'D', 'F', 'B', 'E', 'C']);
  });

  it('throws on invalid input', () => {
    expect(() => queue.add(42 as never)).toThrow();
    expect(() => queue.add({ nope: true } as never)).toThrow();
  });

  it('removes by index and range', () => {
    const [a, b, c, d] = ['A', 'B', 'C', 'D'].map((t) => new Track(makeApiTrack(t)));
    queue.add([a, b, c, d]);

    expect(queue.remove(1)?.title).toBe('B');
    expect(queue.removeRange(0, 2).map((t) => t.title)).toEqual(['A', 'C']);
    expect(queue.size).toBe(1);
    expect(queue.remove(99)).toBeNull();
  });

  it('clears upcoming and optionally the current track', () => {
    const a = new Track(makeApiTrack('A'));
    queue.add([a, new Track(makeApiTrack('B'))]);
    queue.current = new Track(makeApiTrack('Now'));

    queue.clear();
    expect(queue.size).toBe(0);
    expect(queue.current).toBeTruthy();

    queue.clear(false);
    expect(queue.current).toBeNull();
  });

  it('shuffles without losing tracks and respects a seed', () => {
    const tracks = Array.from({ length: 20 }, (_, i) => new Track(makeApiTrack(`T${i}`)));
    queue.add(tracks);
    const before = queue.tracks.map((t) => t.title);

    queue.shuffle(42);
    const after = queue.tracks.map((t) => t.title);
    expect(after).toHaveLength(20);
    expect(new Set(after)).toEqual(new Set(before));

    queue.setTracks(tracks);
    queue.shuffle(42);
    expect(queue.tracks.map((t) => t.title)).toEqual(after);
  });

  it('moves tracks', () => {
    const [a, b, c] = ['A', 'B', 'C'].map((t) => new Track(makeApiTrack(t)));
    queue.add([a, b, c]);
    expect(queue.move(2, 0)?.title).toBe('C');
    expect(queue.tracks.map((t) => t.title)).toEqual(['C', 'A', 'B']);
    expect(queue.move(99, 0)).toBeNull();
  });

  it('reverses and takes tracks', () => {
    const [a, b, c] = ['A', 'B', 'C'].map((t) => new Track(makeApiTrack(t)));
    queue.add([a, b, c]);
    queue.reverse();
    expect(queue.tracks.map((t) => t.title)).toEqual(['C', 'B', 'A']);
    expect(queue.take(0)?.title).toBe('C');
    expect(queue.size).toBe(2);
  });

  it('tracks durations (streams count as zero)', () => {
    const normal = new Track(makeApiTrack('N', { length: 100_000 }));
    const stream = new Track(makeApiTrack('S', { isStream: true, length: 0 }));
    queue.add([normal, stream]);
    expect(queue.duration).toBe(100_000);
    expect(queue.totalDuration).toBe(100_000);
    queue.current = normal;
    expect(queue.totalDuration).toBe(200_000);
  });

  it('validates and applies repeat modes', () => {
    expect(queue.repeatMode).toBe('off');
    queue.setRepeatMode('queue');
    expect(queue.repeatMode).toBe('queue');
    queue.repeatMode = 'track';
    expect(queue.repeatMode).toBe('track');
    expect(() => queue.setRepeatMode('banana' as never)).toThrow();
  });

  it('bounds history and exposes lastTrack', () => {
    const store = new MemoryQueueStore();
    const { junie } = createTestClient({ queue: { historyLimit: 3, store } });
    junie.nodes.get('test')!.connected = true;
    const smallQueue = junie.createPlayer({ guildId: 'g2', voiceChannelId: 'vc' }).queue;

    for (let i = 0; i < 6; i++) smallQueue.pushHistory(new Track(makeApiTrack(`H${i}`)));
    expect(smallQueue.previous).toHaveLength(3);
    expect(smallQueue.lastTrack?.title).toBe('H5');
  });

  it('serializes and restores through JSON round-trip', () => {
    const a = new Track(makeApiTrack('A'));
    const unresolved = new UnresolvedTrack('never gonna give you up');
    queue.add([a, unresolved]);
    queue.current = new Track(makeApiTrack('Now'));
    queue.setRepeatMode('queue');

    const json = queue.toJSON();
    const restored = new Queue(player);
    restored.fromJSON(json);

    expect(restored.tracks).toHaveLength(2);
    expect(restored.tracks[0]).toBeInstanceOf(Track);
    expect(restored.tracks[1]).toBeInstanceOf(UnresolvedTrack);
    expect(restored.current?.title).toBe('Now');
    expect(restored.repeatMode).toBe('queue');
  });

  it('persists through a store and restores', async () => {
    const store = new MemoryQueueStore();
    const { junie } = createTestClient({ queue: { store, restore: false } });
    junie.nodes.get('test')!.connected = true;
    const first = junie.createPlayer({ guildId: 'g3', voiceChannelId: 'vc' });
    first.queue.add([new Track(makeApiTrack('A')), new Track(makeApiTrack('B'))]);
    first.queue.setRepeatMode('track');

    const raw = await store.get('g3');
    expect(raw).toBeTruthy();

    const second = junie.createPlayer({ guildId: 'g3', voiceChannelId: 'vc' });
    // The manager returns the existing player — create a fresh one for restore.
    const fresh = new Queue(second, { store });
    expect(await fresh.restore()).toBe(true);
    expect(fresh.tracks).toHaveLength(2);
    expect(fresh.repeatMode).toBe('track');

    await first.queue.clearStore();
    expect(await store.get('g3')).toBeNull();
  });

  it('restore() returns false when there is nothing stored', async () => {
    const { junie } = createTestClient();
    junie.nodes.get('test')!.connected = true;
    const player2 = junie.createPlayer({ guildId: 'empty', voiceChannelId: 'vc' });
    expect(await player2.queue.restore()).toBe(false);
  });

  it('fires persist through the store on mutation', async () => {
    const setSpy = vi.fn();
    const { junie } = createTestClient({
      queue: { store: { get: async () => null, set: setSpy, delete: async () => undefined } },
    });
    junie.nodes.get('test')!.connected = true;
    const player3 = junie.createPlayer({ guildId: 'g4', voiceChannelId: 'vc' });
    player3.queue.add(new Track(makeApiTrack('X')));
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(setSpy).toHaveBeenCalledWith('g4', expect.any(String));
  });
});
