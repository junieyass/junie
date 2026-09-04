/**
 * Junie — track structures.
 *
 * {@link Track} wraps a decoded Lavalink track with metadata plus your own
 * `requester`. {@link UnresolvedTrack} defers the (costly) search until the
 * moment the track is about to play — perfect for saved queues.
 */
import { TrackLoadError } from '../errors.js';
/**
 * A fully resolved, playable Lavalink track.
 */
export class Track {
    /** The base64-encoded track string understood by Lavalink. */
    encoded;
    /** Lavalink-provided track metadata. */
    info;
    /** Data attached by Lavalink plugins. */
    pluginInfo;
    /** Arbitrary user data sent back to Lavalink with the track. */
    userData;
    /** Whoever requested this track — set by your application. */
    requester;
    constructor(data, requester) {
        this.encoded = data.encoded;
        this.info = data.info;
        this.pluginInfo = data.pluginInfo ?? {};
        this.userData = data.userData ?? {};
        if (requester !== undefined)
            this.requester = requester;
    }
    /** Build a {@link Track} from a raw Lavalink track object. */
    static from(data, requester) {
        return new Track(data, requester);
    }
    get title() { return this.info.title; }
    get author() { return this.info.author; }
    get identifier() { return this.info.identifier; }
    get uri() { return this.info.uri; }
    get length() { return this.info.length; }
    get duration() { return this.info.length; }
    get isStream() { return this.info.isStream; }
    get isSeekable() { return this.info.isSeekable; }
    get artworkUrl() { return this.info.artworkUrl; }
    get isrc() { return this.info.isrc; }
    get sourceName() { return this.info.sourceName; }
    get position() { return this.info.position; }
    /** Attach a requester (chainable). */
    setRequester(requester) {
        this.requester = requester;
        return this;
    }
    /** Attach user data (chainable). */
    setUserData(userData) {
        this.userData = userData;
        return this;
    }
    /** `"Title — Author"` for logs and UIs. */
    toString() {
        return `${this.title} — ${this.author}`;
    }
    /** Serialize for queue stores. */
    toJSON() {
        return {
            kind: 'track',
            encoded: this.encoded,
            info: this.info,
            pluginInfo: this.pluginInfo,
            userData: this.userData,
            requester: this.requester,
        };
    }
    /** Restore a serialized track. */
    static fromJSON(json) {
        const track = new Track({ encoded: json.encoded, info: json.info });
        track.pluginInfo = json.pluginInfo ?? {};
        track.userData = json.userData ?? {};
        if (json.requester !== undefined)
            track.requester = json.requester;
        return track;
    }
}
/**
 * A track that is resolved lazily, right before it plays.
 * Use it to persist queues across restarts without re-searching every track.
 */
export class UnresolvedTrack {
    /** The query that will be searched when this track plays. */
    query;
    /** Display title (best effort — usually the query itself). */
    title;
    /** Display author (best effort). */
    author;
    userData = {};
    requester;
    isStream = false;
    isSeekable = false;
    constructor(query, title, author, requester) {
        this.query = query;
        this.title = title ?? query;
        this.author = author ?? 'Unknown artist';
        if (requester !== undefined)
            this.requester = requester;
    }
    get length() { return 0; }
    get duration() { return 0; }
    /**
     * Resolve into a playable {@link Track} by searching on the given node.
     * Throws {@link TrackLoadError} when nothing playable is found.
     */
    async resolve(resolver) {
        const result = await resolver.search(this.query, this.requester);
        const track = result.tracks.find((candidate) => !candidate.isStream) ?? result.tracks[0];
        if (!track) {
            throw new TrackLoadError(`No playable result for "${this.query}".`, {
                query: this.query,
                loadType: result.loadType,
            });
        }
        track.requester = this.requester;
        track.userData = { ...track.userData, ...this.userData };
        return track;
    }
    toString() {
        return `${this.title} (unresolved: ${this.query})`;
    }
    toJSON() {
        return {
            kind: 'unresolved',
            query: this.query,
            title: this.title,
            author: this.author,
            userData: this.userData,
            requester: this.requester,
        };
    }
    static fromJSON(json) {
        const track = new UnresolvedTrack(json.query, json.title, json.author);
        track.userData = json.userData ?? {};
        if (json.requester !== undefined)
            track.requester = json.requester;
        return track;
    }
}
/** Coerce unknown JSON into a track-like object (queues accept anything). */
export function reviveTrackLike(value) {
    if (value instanceof Track || value instanceof UnresolvedTrack)
        return value;
    if (typeof value === 'object' && value !== null) {
        const record = value;
        if (record.kind === 'unresolved' && typeof record.query === 'string') {
            return UnresolvedTrack.fromJSON(record);
        }
        if (typeof record.encoded === 'string' && record.info && typeof record.info === 'object') {
            if (record.kind === 'track') {
                return Track.fromJSON(record);
            }
            // Raw Lavalink API track.
            return new Track(record);
        }
    }
    return null;
}
//# sourceMappingURL=Track.js.map