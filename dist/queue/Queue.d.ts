/**
 * Junie — the guild queue.
 *
 * A Queue holds upcoming tracks, the currently-playing track, and bounded
 * history. It supports rich operations (add / remove / move / jump /
 * shuffle / reverse / repeat modes) and can persist itself through a
 * {@link QueueStore} adapter.
 */
import type { TrackLike } from '../track/Track.js';
import type { QueueStore, StoredQueue } from './QueueStore.js';
import type { Player } from '../player/Player.js';
import type { RepeatModeOption } from '../types/options.js';
/** Anything a queue accepts. */
export type QueueInput<TRequester = unknown> = TrackLike<TRequester> | TrackLike<TRequester>[] | {
    encoded: string;
    info: unknown;
} | {
    encoded: string;
    info: unknown;
}[];
/** Resolve a {@link QueueInput} into a flat array of track-likes. */
export declare function normalizeQueueInput<TRequester = unknown>(input: QueueInput<TRequester>): TrackLike<TRequester>[];
/**
 * Per-guild track queue.
 */
export declare class Queue<TRequester = unknown> {
    /** The player this queue belongs to. */
    readonly player: Player<TRequester>;
    /** Upcoming tracks (index 0 plays next). */
    tracks: TrackLike<TRequester>[];
    /** The currently playing track (null when idle). */
    current: TrackLike<TRequester> | null;
    /** Previously played tracks (oldest first, bounded). */
    previous: TrackLike<TRequester>[];
    /** Persistence adapter (optional). */
    private readonly store?;
    private readonly historyLimit;
    private _repeatMode;
    constructor(player: Player<TRequester>, options?: {
        store?: QueueStore;
        historyLimit?: number;
    });
    /** Number of *upcoming* tracks (excludes the current one). */
    get size(): number;
    /** Upcoming + current. */
    get totalSize(): number;
    /** True when nothing is upcoming. */
    get isEmpty(): boolean;
    /** Total playback duration of upcoming tracks in ms (streams count as 0). */
    get duration(): number;
    /** Total duration including the current track. */
    get totalDuration(): number;
    /** The most recently played track, or null. */
    get lastTrack(): TrackLike<TRequester> | null;
    /** Current repeat mode. */
    get repeatMode(): RepeatModeOption;
    /**
     * Set repeat mode: `'off'`, `'track'`, or `'queue'`.
     */
    setRepeatMode(mode: RepeatModeOption): this;
    set repeatMode(mode: RepeatModeOption);
    /**
     * Add tracks to the queue.
     *
     * @param input A track, several tracks, or raw Lavalink track objects.
     * @param position Insert index (default: end). Negative counts from the
     *   end (like Python's `list.insert`: -1 inserts before the last track).
     */
    add(input: QueueInput<TRequester>, position?: number): TrackLike<TRequester>[];
    /**
     * Remove the track at `index` (0-based over upcoming tracks).
     * Returns the removed track, or null when the index was out of range.
     */
    remove(index: number): TrackLike<TRequester> | null;
    /**
     * Remove up to `count` upcoming tracks starting at `index`.
     * Returns the removed tracks.
     */
    removeRange(index: number, count?: number): TrackLike<TRequester>[];
    /**
     * Clear upcoming tracks.
     *
     * @param keepCurrent Also drop the current track (default false).
     */
    clear(keepCurrent?: boolean): void;
    /** Clear the remembered history. */
    clearHistory(): void;
    /** Reverse the order of upcoming tracks. */
    reverse(): this;
    /**
     * Shuffle upcoming tracks (Fisher–Yates). The current track is untouched.
     * Pass a numeric `seed` for reproducible shuffles.
     */
    shuffle(seed?: number): this;
    /**
     * Move an upcoming track from one index to another.
     */
    move(from: number, to: number): TrackLike<TRequester> | null;
    /**
     * Remove the track at `index` and return it (handy for "play this next").
     */
    take(index: number): TrackLike<TRequester> | null;
    /**
     * Replace the entire upcoming queue.
     */
    setTracks(tracks: QueueInput<TRequester>): this;
    /** Record a finished track in history (bounded). */
    pushHistory(track: TrackLike<TRequester>): void;
    /** Serialize for a {@link QueueStore}. */
    toJSON(): StoredQueue;
    /** Restore from a {@link QueueStore} snapshot. */
    fromJSON(data: StoredQueue): this;
    /** Load the persisted state from the store (if any). */
    restore(): Promise<boolean>;
    /** Force-write the current state to the store. */
    flush(): Promise<void>;
    /** Remove the persisted state. */
    clearStore(): Promise<void>;
    /** Best-effort synchronous persistence (fire and forget). */
    private persist;
}
//# sourceMappingURL=Queue.d.ts.map