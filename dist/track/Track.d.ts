/**
 * Junie — track structures.
 *
 * {@link Track} wraps a decoded Lavalink track with metadata plus your own
 * `requester`. {@link UnresolvedTrack} defers the (costly) search until the
 * moment the track is about to play — perfect for saved queues.
 */
import type { APITrack, TrackInfo } from '../types/api.js';
import type { SearchQuery } from '../types/options.js';
/** Anything that can resolve a search query into tracks (a Node). */
export interface TrackResolver {
    search<TRequester = unknown>(query: string | SearchQuery, requester?: TRequester): Promise<import('./SearchResult.js').SearchResult<TRequester>>;
}
/** JSON-safe serialization of a {@link Track}. */
export interface SerializedTrack {
    kind: 'track';
    encoded: string;
    info: TrackInfo;
    pluginInfo?: Record<string, unknown>;
    userData?: Record<string, unknown>;
    requester?: unknown;
}
/** JSON-safe serialization of an {@link UnresolvedTrack}. */
export interface SerializedUnresolvedTrack {
    kind: 'unresolved';
    query: string;
    title: string;
    author?: string;
    userData?: Record<string, unknown>;
    requester?: unknown;
}
export type SerializedTrackLike = SerializedTrack | SerializedUnresolvedTrack;
/**
 * A fully resolved, playable Lavalink track.
 */
export declare class Track<TRequester = unknown> {
    /** The base64-encoded track string understood by Lavalink. */
    readonly encoded: string;
    /** Lavalink-provided track metadata. */
    readonly info: TrackInfo;
    /** Data attached by Lavalink plugins. */
    pluginInfo: Record<string, unknown>;
    /** Arbitrary user data sent back to Lavalink with the track. */
    userData: Record<string, unknown>;
    /** Whoever requested this track — set by your application. */
    requester?: TRequester;
    constructor(data: APITrack, requester?: TRequester);
    /** Build a {@link Track} from a raw Lavalink track object. */
    static from<TRequester = unknown>(data: APITrack, requester?: TRequester): Track<TRequester>;
    get title(): string;
    get author(): string;
    get identifier(): string;
    get uri(): string | null;
    get length(): number;
    get duration(): number;
    get isStream(): boolean;
    get isSeekable(): boolean;
    get artworkUrl(): string | null;
    get isrc(): string | null;
    get sourceName(): string;
    get position(): number;
    /** Attach a requester (chainable). */
    setRequester(requester: TRequester): this;
    /** Attach user data (chainable). */
    setUserData(userData: Record<string, unknown>): this;
    /** `"Title — Author"` for logs and UIs. */
    toString(): string;
    /** Serialize for queue stores. */
    toJSON(): SerializedTrack;
    /** Restore a serialized track. */
    static fromJSON<TRequester = unknown>(json: SerializedTrack): Track<TRequester>;
}
/**
 * A track that is resolved lazily, right before it plays.
 * Use it to persist queues across restarts without re-searching every track.
 */
export declare class UnresolvedTrack<TRequester = unknown> {
    /** The query that will be searched when this track plays. */
    readonly query: string;
    /** Display title (best effort — usually the query itself). */
    title: string;
    /** Display author (best effort). */
    author: string;
    userData: Record<string, unknown>;
    requester?: TRequester;
    readonly isStream = false;
    readonly isSeekable = false;
    constructor(query: string, title?: string, author?: string, requester?: TRequester);
    get length(): number;
    get duration(): number;
    /**
     * Resolve into a playable {@link Track} by searching on the given node.
     * Throws {@link TrackLoadError} when nothing playable is found.
     */
    resolve(resolver: TrackResolver): Promise<Track<TRequester>>;
    toString(): string;
    toJSON(): SerializedUnresolvedTrack;
    static fromJSON<TRequester = unknown>(json: SerializedUnresolvedTrack): UnresolvedTrack<TRequester>;
}
/** A {@link Track} or {@link UnresolvedTrack}. */
export type TrackLike<TRequester = unknown> = Track<TRequester> | UnresolvedTrack<TRequester>;
/** Coerce unknown JSON into a track-like object (queues accept anything). */
export declare function reviveTrackLike<TRequester = unknown>(value: unknown): TrackLike<TRequester> | null;
//# sourceMappingURL=Track.d.ts.map