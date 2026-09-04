/**
 * Junie — search results & identifier building.
 */
import type { LavalinkException, LoadTracksResponse, LoadType } from '../types/api.js';
import type { SearchSource } from '../types/options.js';
import type { Node } from '../node/Node.js';
import { Track } from './Track.js';
/**
 * Normalized outcome of a search.
 *
 * `tracks` is always a flat, ready-to-use array — for playlists it contains
 * the playlist's tracks; for single tracks it has one element.
 */
export declare class SearchResult<TRequester = unknown> {
    /** The raw Lavalink `loadType`. */
    readonly loadType: LoadType;
    /** Flattened playable tracks. */
    readonly tracks: Track<TRequester>[];
    /** Playlist metadata, when the result is a playlist. */
    readonly playlist: {
        name: string;
        selectedTrack: number;
        tracks: Track<TRequester>[];
    } | null;
    /** Lavalink's exception, when the result is an error. */
    readonly exception: LavalinkException | null;
    /** The node that produced this result. */
    readonly node: Node;
    constructor(init: {
        loadType: LoadType;
        tracks: Track<TRequester>[];
        playlist?: {
            name: string;
            selectedTrack: number;
            tracks: Track<TRequester>[];
        } | null;
        exception?: LavalinkException | null;
        node: Node;
    });
    /** True when the result contains no playable tracks. */
    get isEmpty(): boolean;
}
/**
 * Compose the `identifier` for `/v4/loadtracks`.
 *
 * - URLs pass through untouched
 * - strings that already carry a prefix (`ytsearch:...`) pass through
 * - known sources map to their prefix; unknown sources are treated as
 *   plugin prefixes (`spsearch:query` for LavaSrc, ...)
 * - `'none'` uses the raw string as the identifier
 */
export declare function buildSearchIdentifier(query: string, source?: SearchSource, defaultSource?: SearchSource): string;
/** Turn a raw `/v4/loadtracks` response into a {@link SearchResult}. */
export declare function buildSearchResult<TRequester = unknown>(response: LoadTracksResponse, node: Node, requester?: TRequester): SearchResult<TRequester>;
//# sourceMappingURL=SearchResult.d.ts.map