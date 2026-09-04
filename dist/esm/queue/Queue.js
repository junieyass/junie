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
import { clamp, createRng, shuffleInPlace } from '../utils/Helpers.js';
/** Resolve a {@link QueueInput} into a flat array of track-likes. */
export function normalizeQueueInput(input) {
    const items = Array.isArray(input) ? input : [input];
    const normalized = [];
    for (const item of items) {
        const revived = reviveTrackLike(item);
        if (!revived) {
            throw new JunieError(JunieErrorCode.INVALID_ARGUMENT, 'Queue input must be a Track, UnresolvedTrack, or raw Lavalink track object.', { received: typeof item });
        }
        normalized.push(revived);
    }
    return normalized;
}
/**
 * Per-guild track queue.
 */
export class Queue {
    /** The player this queue belongs to. */
    player;
    /** Upcoming tracks (index 0 plays next). */
    tracks = [];
    /** The currently playing track (null when idle). */
    current = null;
    /** Previously played tracks (oldest first, bounded). */
    previous = [];
    /** Persistence adapter (optional). */
    store;
    historyLimit;
    _repeatMode = 'off';
    constructor(player, options = {}) {
        this.player = player;
        this.store = options.store;
        this.historyLimit = options.historyLimit ?? 50;
    }
    // -------------------------------------------------------------------------
    // Basic accessors
    // -------------------------------------------------------------------------
    /** Number of *upcoming* tracks (excludes the current one). */
    get size() {
        return this.tracks.length;
    }
    /** Upcoming + current. */
    get totalSize() {
        return this.tracks.length + (this.current ? 1 : 0);
    }
    /** True when nothing is upcoming. */
    get isEmpty() {
        return this.tracks.length === 0;
    }
    /** Total playback duration of upcoming tracks in ms (streams count as 0). */
    get duration() {
        return this.tracks.reduce((sum, track) => sum + (track.isStream ? 0 : track.length), 0);
    }
    /** Total duration including the current track. */
    get totalDuration() {
        const current = this.current ? (this.current.isStream ? 0 : this.current.length) : 0;
        return this.duration + current;
    }
    /** The most recently played track, or null. */
    get lastTrack() {
        return this.previous.length > 0 ? this.previous[this.previous.length - 1] : null;
    }
    /** Current repeat mode. */
    get repeatMode() {
        return this._repeatMode;
    }
    /**
     * Set repeat mode: `'off'`, `'track'`, or `'queue'`.
     */
    setRepeatMode(mode) {
        if (mode !== 'off' && mode !== 'track' && mode !== 'queue') {
            throw new JunieError(JunieErrorCode.INVALID_ARGUMENT, `Invalid repeat mode "${String(mode)}" — expected 'off' | 'track' | 'queue'.`);
        }
        this._repeatMode = mode;
        this.persist();
        return this;
    }
    // Alias kept for discoverability.
    set repeatMode(mode) {
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
    add(input, position) {
        const items = normalizeQueueInput(input);
        if (items.length === 0)
            return items;
        if (position === undefined) {
            this.tracks.push(...items);
        }
        else {
            const index = clamp(position < 0 ? this.tracks.length + position : position, 0, this.tracks.length);
            this.tracks.splice(index, 0, ...items);
        }
        this.persist();
        return items;
    }
    /**
     * Remove the track at `index` (0-based over upcoming tracks).
     * Returns the removed track, or null when the index was out of range.
     */
    remove(index) {
        if (index < 0 || index >= this.tracks.length)
            return null;
        const [removed] = this.tracks.splice(index, 1);
        this.persist();
        return removed ?? null;
    }
    /**
     * Remove up to `count` upcoming tracks starting at `index`.
     * Returns the removed tracks.
     */
    removeRange(index, count = 1) {
        if (index < 0 || index >= this.tracks.length || count <= 0)
            return [];
        const removed = this.tracks.splice(index, count);
        this.persist();
        return removed;
    }
    /**
     * Clear upcoming tracks.
     *
     * @param keepCurrent Also drop the current track (default false).
     */
    clear(keepCurrent = true) {
        this.tracks = [];
        if (!keepCurrent)
            this.current = null;
        this.persist();
    }
    /** Clear the remembered history. */
    clearHistory() {
        this.previous = [];
        this.persist();
    }
    /** Reverse the order of upcoming tracks. */
    reverse() {
        this.tracks.reverse();
        this.persist();
        return this;
    }
    /**
     * Shuffle upcoming tracks (Fisher–Yates). The current track is untouched.
     * Pass a numeric `seed` for reproducible shuffles.
     */
    shuffle(seed) {
        shuffleInPlace(this.tracks, createRng(seed ?? Date.now()));
        this.persist();
        return this;
    }
    /**
     * Move an upcoming track from one index to another.
     */
    move(from, to) {
        if (from < 0 || from >= this.tracks.length)
            return null;
        const [moved] = this.tracks.splice(from, 1);
        if (!moved)
            return null;
        const target = clamp(to < 0 ? this.tracks.length + to : to, 0, this.tracks.length);
        this.tracks.splice(target, 0, moved);
        this.persist();
        return moved;
    }
    /**
     * Remove the track at `index` and return it (handy for "play this next").
     */
    take(index) {
        if (index < 0 || index >= this.tracks.length)
            return null;
        const [taken] = this.tracks.splice(index, 1);
        return taken ?? null;
    }
    /**
     * Replace the entire upcoming queue.
     */
    setTracks(tracks) {
        this.tracks = normalizeQueueInput(tracks);
        this.persist();
        return this;
    }
    // -------------------------------------------------------------------------
    // History (internal — driven by the player)
    // -------------------------------------------------------------------------
    /** Record a finished track in history (bounded). */
    pushHistory(track) {
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
    toJSON() {
        const serialize = (track) => track instanceof Track || track instanceof UnresolvedTrack ? track.toJSON() : track;
        return {
            current: this.current ? serialize(this.current) : null,
            tracks: this.tracks.map(serialize),
            previous: this.previous.map(serialize),
            repeatMode: this._repeatMode,
        };
    }
    /** Restore from a {@link QueueStore} snapshot. */
    fromJSON(data) {
        const revive = (value) => reviveTrackLike(value);
        this.current = data.current ? revive(data.current) : null;
        this.tracks = (data.tracks ?? []).map(revive).filter((t) => t !== null);
        this.previous = (data.previous ?? []).map(revive).filter((t) => t !== null);
        this._repeatMode = data.repeatMode ?? 'off';
        return this;
    }
    /** Load the persisted state from the store (if any). */
    async restore() {
        if (!this.store)
            return false;
        const raw = await this.store.get(this.player.guildId);
        if (!raw)
            return false;
        try {
            this.fromJSON(JSON.parse(raw));
            return true;
        }
        catch {
            return false;
        }
    }
    /** Force-write the current state to the store. */
    async flush() {
        if (!this.store)
            return;
        await this.store.set(this.player.guildId, JSON.stringify(this.toJSON()));
    }
    /** Remove the persisted state. */
    async clearStore() {
        if (!this.store)
            return;
        await this.store.delete(this.player.guildId);
    }
    /** Best-effort synchronous persistence (fire and forget). */
    persist() {
        if (!this.store)
            return;
        void this.flush().catch(() => {
            // Store failures must never break playback.
        });
    }
}
//# sourceMappingURL=Queue.js.map