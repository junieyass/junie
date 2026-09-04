/**
 * Junie — track structures.
 *
 * {@link Track} wraps a decoded Lavalink track with metadata plus your own
 * `requester`. {@link UnresolvedTrack} defers the (costly) search until the
 * moment the track is about to play — perfect for saved queues.
 */

import { TrackLoadError } from '../errors.js';
import type { APITrack, TrackInfo } from '../types/api.js';
import type { SearchQuery } from '../types/options.js';

/** Anything that can resolve a search query into tracks (a Node). */
export interface TrackResolver {
  search<TRequester = unknown>(
    query: string | SearchQuery,
    requester?: TRequester,
  ): Promise<import('./SearchResult.js').SearchResult<TRequester>>;
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
export class Track<TRequester = unknown> {
  /** The base64-encoded track string understood by Lavalink. */
  public readonly encoded: string;
  /** Lavalink-provided track metadata. */
  public readonly info: TrackInfo;
  /** Data attached by Lavalink plugins. */
  public pluginInfo: Record<string, unknown>;
  /** Arbitrary user data sent back to Lavalink with the track. */
  public userData: Record<string, unknown>;
  /** Whoever requested this track — set by your application. */
  public requester?: TRequester;

  public constructor(data: APITrack, requester?: TRequester) {
    this.encoded = data.encoded;
    this.info = data.info;
    this.pluginInfo = data.pluginInfo ?? {};
    this.userData = data.userData ?? {};
    if (requester !== undefined) this.requester = requester;
  }

  /** Build a {@link Track} from a raw Lavalink track object. */
  public static from<TRequester = unknown>(data: APITrack, requester?: TRequester): Track<TRequester> {
    return new Track<TRequester>(data, requester);
  }

  get title(): string { return this.info.title; }
  get author(): string { return this.info.author; }
  get identifier(): string { return this.info.identifier; }
  get uri(): string | null { return this.info.uri; }
  get length(): number { return this.info.length; }
  get duration(): number { return this.info.length; }
  get isStream(): boolean { return this.info.isStream; }
  get isSeekable(): boolean { return this.info.isSeekable; }
  get artworkUrl(): string | null { return this.info.artworkUrl; }
  get isrc(): string | null { return this.info.isrc; }
  get sourceName(): string { return this.info.sourceName; }
  get position(): number { return this.info.position; }

  /** Attach a requester (chainable). */
  public setRequester(requester: TRequester): this {
    this.requester = requester;
    return this;
  }

  /** Attach user data (chainable). */
  public setUserData(userData: Record<string, unknown>): this {
    this.userData = userData;
    return this;
  }

  /** `"Title — Author"` for logs and UIs. */
  public toString(): string {
    return `${this.title} — ${this.author}`;
  }

  /** Serialize for queue stores. */
  public toJSON(): SerializedTrack {
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
  public static fromJSON<TRequester = unknown>(json: SerializedTrack): Track<TRequester> {
    const track = new Track<TRequester>({ encoded: json.encoded, info: json.info });
    track.pluginInfo = json.pluginInfo ?? {};
    track.userData = json.userData ?? {};
    if (json.requester !== undefined) track.requester = json.requester as TRequester;
    return track;
  }
}

/**
 * A track that is resolved lazily, right before it plays.
 * Use it to persist queues across restarts without re-searching every track.
 */
export class UnresolvedTrack<TRequester = unknown> {
  /** The query that will be searched when this track plays. */
  public readonly query: string;
  /** Display title (best effort — usually the query itself). */
  public title: string;
  /** Display author (best effort). */
  public author: string;
  public userData: Record<string, unknown> = {};
  public requester?: TRequester;
  public readonly isStream = false;
  public readonly isSeekable = false;

  public constructor(query: string, title?: string, author?: string, requester?: TRequester) {
    this.query = query;
    this.title = title ?? query;
    this.author = author ?? 'Unknown artist';
    if (requester !== undefined) this.requester = requester;
  }

  get length(): number { return 0; }
  get duration(): number { return 0; }

  /**
   * Resolve into a playable {@link Track} by searching on the given node.
   * Throws {@link TrackLoadError} when nothing playable is found.
   */
  public async resolve(resolver: TrackResolver): Promise<Track<TRequester>> {
    const result = await resolver.search<TRequester>(this.query, this.requester);
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

  public toString(): string {
    return `${this.title} (unresolved: ${this.query})`;
  }

  public toJSON(): SerializedUnresolvedTrack {
    return {
      kind: 'unresolved',
      query: this.query,
      title: this.title,
      author: this.author,
      userData: this.userData,
      requester: this.requester,
    };
  }

  public static fromJSON<TRequester = unknown>(json: SerializedUnresolvedTrack): UnresolvedTrack<TRequester> {
    const track = new UnresolvedTrack<TRequester>(json.query, json.title, json.author);
    track.userData = json.userData ?? {};
    if (json.requester !== undefined) track.requester = json.requester as TRequester;
    return track;
  }
}

/** A {@link Track} or {@link UnresolvedTrack}. */
export type TrackLike<TRequester = unknown> = Track<TRequester> | UnresolvedTrack<TRequester>;

/** Coerce unknown JSON into a track-like object (queues accept anything). */
export function reviveTrackLike<TRequester = unknown>(value: unknown): TrackLike<TRequester> | null {
  if (value instanceof Track || value instanceof UnresolvedTrack) return value as TrackLike<TRequester>;
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    if (record.kind === 'unresolved' && typeof record.query === 'string') {
      return UnresolvedTrack.fromJSON<TRequester>(record as unknown as SerializedUnresolvedTrack);
    }
    if (typeof record.encoded === 'string' && record.info && typeof record.info === 'object') {
      if (record.kind === 'track') {
        return Track.fromJSON<TRequester>(record as unknown as SerializedTrack);
      }
      // Raw Lavalink API track.
      return new Track<TRequester>(record as unknown as APITrack);
    }
  }
  return null;
}
