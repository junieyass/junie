/**
 * Junie — the guild queue.
 *
 * A Queue holds upcoming tracks, the currently-playing track, and bounded
 * history. It supports rich operations (add / remove / move / jump /
 * shuffle / reverse / repeat modes) and can persist itself through a
 * {@link QueueStore} adapter.
 */

import { JunieError, JunieErrorCode } from '../errors.js';
import { Track, UnresolvedTrack, reviveTrackLike } from '../track/Track.js';
import type { TrackLike } from '../track/Track.js';
import type { QueueStore, StoredQueue } from './QueueStore.js';
import type { Player } from '../player/Player.js';
import type { RepeatModeOption } from '../types/options.js';
import { clamp, createRng, shuffleInPlace } from '../utils/Helpers.js';

/** Anything a queue accepts. */
export type QueueInput<TRequester = unknown> =
  | TrackLike<TRequester>
  | TrackLike<TRequester>[]
  | { encoded: string; info: unknown }
  | { encoded: string; info: unknown }[];

/** Resolve a {@link QueueInput} into a flat array of track-likes. */
export function normalizeQueueInput<TRequester = unknown>(
  input: QueueInput<TRequester>,
): TrackLike<TRequester>[] {
  const items = Array.isArray(input) ? input : [input];
  const normalized: TrackLike<TRequester>[] = [];
  for (const item of items) {
    const revived = reviveTrackLike<TRequester>(item);
    if (!revived) {
      throw new JunieError(
        JunieErrorCode.INVALID_ARGUMENT,
        'Queue input must be a Track, UnresolvedTrack, or raw Lavalink track object.',
        { received: typeof item },
      );
    }
    normalized.push(revived);
  }
  return normalized;
}

/**
 * Per-guild track queue.
 */
export class Queue<TRequester = unknown> {
  /** The player this queue belongs to. */
  public readonly player: Player<TRequester>;

  /** Upcoming tracks (index 0 plays next). */
  public tracks: TrackLike<TRequester>[] = [];
  /** The currently playing track (null when idle). */
  public current: TrackLike<TRequester> | null = null;
  /** Previously played tracks (oldest first, bounded). */
  public previous: TrackLike<TRequester>[] = [];

  /** Persistence adapter (optional). */
  private readonly store?: QueueStore;
  private readonly historyLimit: number;
  private _repeatMode: RepeatModeOption = 'off';

  public constructor(player: Player<TRequester>, options: { store?: QueueStore; historyLimit?: number } = {}) {
    this.player = player;
    this.store = options.store;
    this.historyLimit = options.historyLimit ?? 50;
  }

  // -------------------------------------------------------------------------
  // Basic accessors
  // -------------------------------------------------------------------------

  /** Number of *upcoming* tracks (excludes the current one). */
  get size(): number {
    return this.tracks.length;
  }

  /** Upcoming + current. */
  get totalSize(): number {
    return this.tracks.length + (this.current ? 1 : 0);
  }

  /** True when nothing is upcoming. */
  get isEmpty(): boolean {
    return this.tracks.length === 0;
  }

  /** Total playback duration of upcoming tracks in ms (streams count as 0). */
  get duration(): number {
    return this.tracks.reduce((sum, track) => sum + (track.isStream ? 0 : track.length), 0);
  }

  /** Total duration including the current track. */
  get totalDuration(): number {
    const current = this.current ? (this.current.isStream ? 0 : this.current.length) : 0;
    return this.duration + current;
  }

  /** The most recently played track, or null. */
  get lastTrack(): TrackLike<TRequester> | null {
    return this.previous.length > 0 ? this.previous[this.previous.length - 1]! : null;
  }

  /** Current repeat mode. */
  get repeatMode(): RepeatModeOption {
    return this._repeatMode;
  }

  /**
   * Set repeat mode: `'off'`, `'track'`, or `'queue'`.
   */
  public setRepeatMode(mode: RepeatModeOption): this {
    if (mode !== 'off' && mode !== 'track' && mode !== 'queue') {
      throw new JunieError(
        JunieErrorCode.INVALID_ARGUMENT,
        `Invalid repeat mode "${String(mode)}" — expected 'off' | 'track' | 'queue'.`,
      );
    }
    this._repeatMode = mode;
    this.persist();
    return this;
  }

  // Alias kept for discoverability.
  public set repeatMode(mode: RepeatModeOption) {
    this.setRepeatMode(mode);
  }

  // -------------------------------------------------------------------------
  // Mutations
  // -------------------------------------------------------------------------

  /**
   * Add tracks to the queue.
   *
   * @param input A track, several tracks, or raw Lavalink track objects.
   * @param position Insert index (default: end). Negative counts from the
   *   end (like Python's `list.insert`: -1 inserts before the last track).
   */
  public add(input: QueueInput<TRequester>, position?: number): TrackLike<TRequester>[] {
    const items = normalizeQueueInput(input);
    if (items.length === 0) return items;

    if (position === undefined) {
      this.tracks.push(...items);
    } else {
      const index = clamp(
        position < 0 ? this.tracks.length + position : position,
        0,
        this.tracks.length,
      );
      this.tracks.splice(index, 0, ...items);
    }
    this.persist();
    return items;
  }

  /**
   * Remove the track at `index` (0-based over upcoming tracks).
   * Returns the removed track, or null when the index was out of range.
   */
  public remove(index: number): TrackLike<TRequester> | null {
    if (index < 0 || index >= this.tracks.length) return null;
    const [removed] = this.tracks.splice(index, 1);
    this.persist();
    return removed ?? null;
  }

  /**
   * Remove up to `count` upcoming tracks starting at `index`.
   * Returns the removed tracks.
   */
  public removeRange(index: number, count = 1): TrackLike<TRequester>[] {
    if (index < 0 || index >= this.tracks.length || count <= 0) return [];
    const removed = this.tracks.splice(index, count);
    this.persist();
    return removed;
  }

  /**
   * Clear upcoming tracks.
   *
   * @param keepCurrent Also drop the current track (default false).
   */
  public clear(keepCurrent = true): void {
    this.tracks = [];
    if (!keepCurrent) this.current = null;
    this.persist();
  }

  /** Clear the remembered history. */
  public clearHistory(): void {
    this.previous = [];
    this.persist();
  }

  /** Reverse the order of upcoming tracks. */
  public reverse(): this {
    this.tracks.reverse();
    this.persist();
    return this;
  }

  /**
   * Shuffle upcoming tracks (Fisher–Yates). The current track is untouched.
   * Pass a numeric `seed` for reproducible shuffles.
   */
  public shuffle(seed?: number): this {
    shuffleInPlace(this.tracks, createRng(seed ?? Date.now()));
    this.persist();
    return this;
  }

  /**
   * Move an upcoming track from one index to another.
   */
  public move(from: number, to: number): TrackLike<TRequester> | null {
    if (from < 0 || from >= this.tracks.length) return null;
    const [moved] = this.tracks.splice(from, 1);
    if (!moved) return null;
    const target = clamp(to < 0 ? this.tracks.length + to : to, 0, this.tracks.length);
    this.tracks.splice(target, 0, moved);
    this.persist();
    return moved;
  }

  /**
   * Remove the track at `index` and return it (handy for "play this next").
   */
  public take(index: number): TrackLike<TRequester> | null {
    if (index < 0 || index >= this.tracks.length) return null;
    const [taken] = this.tracks.splice(index, 1);
    return taken ?? null;
  }

  /**
   * Replace the entire upcoming queue.
   */
  public setTracks(tracks: QueueInput<TRequester>): this {
    this.tracks = normalizeQueueInput(tracks);
    this.persist();
    return this;
  }

  // -------------------------------------------------------------------------
  // History (internal — driven by the player)
  // -------------------------------------------------------------------------

  /** Record a finished track in history (bounded). */
  public pushHistory(track: TrackLike<TRequester>): void {
    this.previous.push(track);
    if (this.previous.length > this.historyLimit) {
      this.previous.splice(0, this.previous.length - this.historyLimit);
    }
    this.persist();
  }

  // -------------------------------------------------------------------------
  // Persistence
  // -------------------------------------------------------------------------

  /** Serialize for a {@link QueueStore}. */
  public toJSON(): StoredQueue {
    const serialize = (track: TrackLike<TRequester>): unknown =>
      track instanceof Track || track instanceof UnresolvedTrack ? track.toJSON() : track;
    return {
      current: this.current ? serialize(this.current) : null,
      tracks: this.tracks.map(serialize),
      previous: this.previous.map(serialize),
      repeatMode: this._repeatMode,
    };
  }

  /** Restore from a {@link QueueStore} snapshot. */
  public fromJSON(data: StoredQueue): this {
    const revive = (value: unknown): TrackLike<TRequester> | null => reviveTrackLike<TRequester>(value);
    this.current = data.current ? revive(data.current) : null;
    this.tracks = (data.tracks ?? []).map(revive).filter((t): t is TrackLike<TRequester> => t !== null);
    this.previous = (data.previous ?? []).map(revive).filter((t): t is TrackLike<TRequester> => t !== null);
    this._repeatMode = data.repeatMode ?? 'off';
    return this;
  }

  /** Load the persisted state from the store (if any). */
  public async restore(): Promise<boolean> {
    if (!this.store) return false;
    const raw = await this.store.get(this.player.guildId);
    if (!raw) return false;
    try {
      this.fromJSON(JSON.parse(raw) as StoredQueue);
      return true;
    } catch {
      return false;
    }
  }

  /** Force-write the current state to the store. */
  public async flush(): Promise<void> {
    if (!this.store) return;
    await this.store.set(this.player.guildId, JSON.stringify(this.toJSON()));
  }

  /** Remove the persisted state. */
  public async clearStore(): Promise<void> {
    if (!this.store) return;
    await this.store.delete(this.player.guildId);
  }

  /** Best-effort synchronous persistence (fire and forget). */
  private persist(): void {
    if (!this.store) return;
    void this.flush().catch(() => {
      // Store failures must never break playback.
    });
  }
}
