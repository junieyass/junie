/**
 * Unit tests for tracks and search result building.
 */

import { describe, expect, it } from 'vitest';
import { Track, UnresolvedTrack, reviveTrackLike } from '../src/track/Track.js';
import type { TrackResolver } from '../src/track/Track.js';
import { buildSearchIdentifier, buildSearchResult, SearchResult } from '../src/track/SearchResult.js';
import { TrackLoadError } from '../src/errors.js';
import { makeApiTrack } from './fixtures.js';
import type { Node } from '../src/node/Node.js';

describe('Track', () => {
  it('exposes metadata through convenience getters', () => {
    const track = new Track(makeApiTrack('Song', { author: 'Someone', length: 90_000 }));
    expect(track.title).toBe('Song');
    expect(track.author).toBe('Someone');
    expect(track.duration).toBe(90_000);
    expect(track.isSeekable).toBe(true);
    expect(track.isStream).toBe(false);
    expect(track.toString()).toBe('Song — Someone');
  });

  it('carries requester and user data', () => {
    const requester = { id: '42' };
    const track = new Track(makeApiTrack('Song'), requester);
    expect(track.requester).toBe(requester);
    track.setUserData({ custom: 'value' });
    expect(track.userData).toEqual({ custom: 'value' });
    expect(track.setRequester({ id: '1' })).toBe(track);
  });

  it('round-trips through JSON', () => {
    const track = new Track(makeApiTrack('Song'), { id: '7' });
    const restored = Track.fromJSON(track.toJSON());
    expect(restored.encoded).toBe(track.encoded);
    expect(restored.title).toBe('Song');
    expect(restored.requester).toEqual({ id: '7' });
  });
});

describe('UnresolvedTrack', () => {
  it('resolves through a resolver (node-like) and keeps requester', async () => {
    const requester = { id: '9' };
    const unresolved = new UnresolvedTrack('query song', 'Query Song', 'Artist', requester);
    const apiTrack = makeApiTrack('Result');
    const resolver = {
      search: async () => new SearchResult({
        loadType: 'search',
        tracks: [new Track(apiTrack)],
        node: {} as Node,
      }),
    } as unknown as TrackResolver;

    const resolved = await unresolved.resolve(resolver);
    expect(resolved.encoded).toBe(apiTrack.encoded);
    expect(resolved.requester).toBe(requester);
  });

  it('prefers non-stream results', async () => {
    const unresolved = new UnresolvedTrack('query');
    const stream = makeApiTrack('Live', { isStream: true });
    const normal = makeApiTrack('Normal');
    const resolver = {
      search: async () => new SearchResult({
        loadType: 'search',
        tracks: [new Track(stream), new Track(normal)],
        node: {} as Node,
      }),
    } as unknown as TrackResolver;
    expect((await unresolved.resolve(resolver)).title).toBe('Normal');
  });

  it('throws TrackLoadError when nothing playable is found', async () => {
    const unresolved = new UnresolvedTrack('query');
    const resolver = {
      search: async () => new SearchResult({ loadType: 'empty', tracks: [], node: {} as Node }),
    } as unknown as TrackResolver;
    await expect(unresolved.resolve(resolver)).rejects.toThrow(TrackLoadError);
  });

  it('round-trips through JSON', () => {
    const unresolved = new UnresolvedTrack('q', 'Title', 'Artist', { id: '1' });
    const restored = UnresolvedTrack.fromJSON(unresolved.toJSON());
    expect(restored.query).toBe('q');
    expect(restored.title).toBe('Title');
    expect(restored.requester).toEqual({ id: '1' });
  });
});

describe('reviveTrackLike', () => {
  it('revives instances, serialized tracks, and raw API tracks', () => {
    const track = new Track(makeApiTrack('A'));
    expect(reviveTrackLike(track)).toBe(track);

    const revived = reviveTrackLike(track.toJSON());
    expect(revived).toBeInstanceOf(Track);
    expect(revived?.title).toBe('A');

    const raw = reviveTrackLike(makeApiTrack('Raw'));
    expect(raw).toBeInstanceOf(Track);

    expect(reviveTrackLike('nope')).toBeNull();
    expect(reviveTrackLike({ encoded: 'x' })).toBeNull();
  });
});

describe('buildSearchIdentifier', () => {
  it('maps known sources to prefixes', () => {
    expect(buildSearchIdentifier('song', 'youtube')).toBe('ytsearch:song');
    expect(buildSearchIdentifier('song', 'youtubeMusic')).toBe('ytmsearch:song');
    expect(buildSearchIdentifier('song', 'soundcloud')).toBe('scsearch:song');
  });

  it('passes URLs and prefixed queries through', () => {
    expect(buildSearchIdentifier('https://youtu.be/x')).toBe('https://youtu.be/x');
    expect(buildSearchIdentifier('ytsearch:song')).toBe('ytsearch:song');
    expect(buildSearchIdentifier('https://youtu.be/x', 'youtube')).toBe('https://youtu.be/x');
  });

  it('treats unknown sources as plugin prefixes and honours "none"', () => {
    expect(buildSearchIdentifier('song', 'spsearch')).toBe('spsearch:song');
    expect(buildSearchIdentifier('raw identifier', 'none')).toBe('raw identifier');
  });

  it('falls back to the default source', () => {
    expect(buildSearchIdentifier('song')).toBe('ytsearch:song');
    expect(buildSearchIdentifier('song', undefined, 'soundcloud')).toBe('scsearch:song');
  });
});

describe('buildSearchResult', () => {
  const node = {} as Node;

  it('flattens single tracks', () => {
    const result = buildSearchResult(
      { loadType: 'track', playlistInfo: { name: '', selectedTrack: -1 }, data: makeApiTrack('One') },
      node,
    );
    expect(result.tracks).toHaveLength(1);
    expect(result.loadType).toBe('track');
    expect(result.playlist).toBeNull();
    expect(result.isEmpty).toBe(false);
  });

  it('flattens playlists with metadata', () => {
    const tracks = [makeApiTrack('P1'), makeApiTrack('P2')];
    const result = buildSearchResult(
      { loadType: 'playlist', playlistInfo: { name: 'My List', selectedTrack: 1 }, data: tracks },
      node,
    );
    expect(result.tracks).toHaveLength(2);
    expect(result.playlist?.name).toBe('My List');
    expect(result.playlist?.selectedTrack).toBe(1);
  });

  it('surfaces empty and error outcomes', () => {
    const empty = buildSearchResult(
      { loadType: 'empty', playlistInfo: { name: '', selectedTrack: -1 }, data: {} },
      node,
    );
    expect(empty.isEmpty).toBe(true);

    const error = buildSearchResult(
      {
        loadType: 'error',
        playlistInfo: { name: '', selectedTrack: -1 },
        data: { message: 'boom', severity: 'common' },
      },
      node,
    );
    expect(error.exception?.message).toBe('boom');
    expect(error.isEmpty).toBe(true);
  });

  it('attaches the requester to every track', () => {
    const requester = { id: '5' };
    const result = buildSearchResult(
      {
        loadType: 'search',
        playlistInfo: { name: '', selectedTrack: -1 },
        data: [makeApiTrack('S1'), makeApiTrack('S2')],
      },
      node,
      requester,
    );
    expect(result.tracks.every((track) => track.requester === requester)).toBe(true);
  });
});
