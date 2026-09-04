/**
 * Junie — search results & identifier building.
 */

import { SOURCE_PREFIXES } from '../constants.js';
import { hasSearchPrefix, isUrl } from '../utils/Helpers.js';
import type {
  APITrack,
  LavalinkException,
  LoadTracksResponse,
  LoadType,
  PlaylistInfo,
} from '../types/api.js';
import type { SearchSource } from '../types/options.js';
import type { Node } from '../node/Node.js';
import { Track } from './Track.js';

/**
 * Normalized outcome of a search.
 *
 * `tracks` is always a flat, ready-to-use array — for playlists it contains
 * the playlist's tracks; for single tracks it has one element.
 */
export class SearchResult<TRequester = unknown> {
  /** The raw Lavalink `loadType`. */
  public readonly loadType: LoadType;
  /** Flattened playable tracks. */
  public readonly tracks: Track<TRequester>[];
  /** Playlist metadata, when the result is a playlist. */
  public readonly playlist: { name: string; selectedTrack: number; tracks: Track<TRequester>[] } | null;
  /** Lavalink's exception, when the result is an error. */
  public readonly exception: LavalinkException | null;
  /** The node that produced this result. */
  public readonly node: Node;

  public constructor(init: {
    loadType: LoadType;
    tracks: Track<TRequester>[];
    playlist?: { name: string; selectedTrack: number; tracks: Track<TRequester>[] } | null;
    exception?: LavalinkException | null;
    node: Node;
  }) {
    this.loadType = init.loadType;
    this.tracks = init.tracks;
    this.playlist = init.playlist ?? null;
    this.exception = init.exception ?? null;
    this.node = init.node;
  }

  /** True when the result contains no playable tracks. */
  get isEmpty(): boolean {
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
export function buildSearchIdentifier(
  query: string,
  source?: SearchSource,
  defaultSource: SearchSource = 'youtube',
): string {
  const trimmed = query.trim();
  if (isUrl(trimmed) || hasSearchPrefix(trimmed)) return trimmed;
  const activeSource = source ?? defaultSource;
  if (activeSource === 'none') return trimmed;
  const prefix = SOURCE_PREFIXES[activeSource];
  return `${prefix ?? `${activeSource}:`}${trimmed}`;
}

/** Turn a raw `/v4/loadtracks` response into a {@link SearchResult}. */
export function buildSearchResult<TRequester = unknown>(
  response: LoadTracksResponse,
  node: Node,
  requester?: TRequester,
): SearchResult<TRequester> {
  const tracks: Track<TRequester>[] = [];
  let playlist: SearchResult<TRequester>['playlist'] = null;
  let exception: LavalinkException | null = null;

  switch (response.loadType) {
    case 'track': {
      const data = response.data as APITrack;
      if (data && typeof data === 'object' && data.encoded) {
        tracks.push(new Track<TRequester>(data, requester));
      }
      break;
    }
    case 'playlist': {
      const data = (Array.isArray(response.data) ? response.data : []) as APITrack[];
      for (const apiTrack of data) tracks.push(new Track<TRequester>(apiTrack, requester));
      const info = response.playlistInfo as PlaylistInfo;
      playlist = {
        name: info?.name ?? 'Unknown playlist',
        selectedTrack: info?.selectedTrack ?? -1,
        tracks,
      };
      break;
    }
    case 'search': {
      const data = (Array.isArray(response.data) ? response.data : []) as APITrack[];
      for (const apiTrack of data) tracks.push(new Track<TRequester>(apiTrack, requester));
      break;
    }
    case 'error': {
      exception = response.data as LavalinkException;
      break;
    }
    case 'empty':
    default:
      break;
  }

  return new SearchResult<TRequester>({
    loadType: response.loadType,
    tracks,
    playlist,
    exception,
    node,
  });
}
