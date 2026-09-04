/**
 * Junie — search results & identifier building.
 */
import { SOURCE_PREFIXES } from '../constants.js';
import { hasSearchPrefix, isUrl } from '../utils/Helpers.js';
import { Track } from './Track.js';
/**
 * Normalized outcome of a search.
 *
 * `tracks` is always a flat, ready-to-use array — for playlists it contains
 * the playlist's tracks; for single tracks it has one element.
 */
export class SearchResult {
    /** The raw Lavalink `loadType`. */
    loadType;
    /** Flattened playable tracks. */
    tracks;
    /** Playlist metadata, when the result is a playlist. */
    playlist;
    /** Lavalink's exception, when the result is an error. */
    exception;
    /** The node that produced this result. */
    node;
    constructor(init) {
        this.loadType = init.loadType;
        this.tracks = init.tracks;
        this.playlist = init.playlist ?? null;
        this.exception = init.exception ?? null;
        this.node = init.node;
    }
    /** True when the result contains no playable tracks. */
    get isEmpty() {
        return this.tracks.length === 0;
    }
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
export function buildSearchIdentifier(query, source, defaultSource = 'youtube') {
    const trimmed = query.trim();
    if (isUrl(trimmed) || hasSearchPrefix(trimmed))
        return trimmed;
    const activeSource = source ?? defaultSource;
    if (activeSource === 'none')
        return trimmed;
    const prefix = SOURCE_PREFIXES[activeSource];
    return `${prefix ?? `${activeSource}:`}${trimmed}`;
}
/** Turn a raw `/v4/loadtracks` response into a {@link SearchResult}. */
export function buildSearchResult(response, node, requester) {
    const tracks = [];
    let playlist = null;
    let exception = null;
    switch (response.loadType) {
        case 'track': {
            const data = response.data;
            if (data && typeof data === 'object' && data.encoded) {
                tracks.push(new Track(data, requester));
            }
            break;
        }
        case 'playlist': {
            const data = (Array.isArray(response.data) ? response.data : []);
            for (const apiTrack of data)
                tracks.push(new Track(apiTrack, requester));
            const info = response.playlistInfo;
            playlist = {
                name: info?.name ?? 'Unknown playlist',
                selectedTrack: info?.selectedTrack ?? -1,
                tracks,
            };
            break;
        }
        case 'search': {
            const data = (Array.isArray(response.data) ? response.data : []);
            for (const apiTrack of data)
                tracks.push(new Track(apiTrack, requester));
            break;
        }
        case 'error': {
            exception = response.data;
            break;
        }
        case 'empty':
        default:
            break;
    }
    return new SearchResult({
        loadType: response.loadType,
        tracks,
        playlist,
        exception,
        node,
    });
}
//# sourceMappingURL=SearchResult.js.map