/**
 * Unit tests for the FilterManager.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createTestClient, createFetchStub, connectNode, jsonResponse } from './fixtures.js';
import { FilterManager } from '../src/player/FilterManager.js';
import { JunieErrorCode } from '../src/errors.js';
import type { Player } from '../src/player/Player.js';
import type { APIPlayer } from '../src/types/api.js';

describe('FilterManager', () => {
  let filters: FilterManager;
  let player: Player;
  let restCalls: Array<{ url: string; body?: unknown }>;

  beforeEach(async () => {
    const { fetch, calls } = createFetchStub(() => jsonResponse({} as APIPlayer));
    vi.stubGlobal('fetch', fetch);
    const { junie, socket } = createTestClient();
    await connectNode(socket);
    player = junie.createPlayer({ guildId: 'g1', voiceChannelId: 'vc1' });
    filters = player.filters;
    restCalls = calls;
  });

  const patchCalls = (): Array<Record<string, unknown>> => {
    return restCalls
      .filter((call) => call.url.includes('/players/g1'))
      .map((call) => call.body as Record<string, unknown>);
  };

  it('starts empty and merges raw payloads', () => {
    expect(filters.isEmpty).toBe(true);
    filters.merge({ volume: 1.5 });
    expect(filters.payload.volume).toBe(1.5);
  });

  it('builds a full payload from chained setters', () => {
    filters
      .setVolume(1.2)
      .setTimescale({ speed: 1.1, pitch: 1.05 })
      .setEqualizer([{ band: 0, gain: 0.5 }])
      .setKaraoke({ level: 0.8 })
      .setTremolo({ frequency: 4, depth: 0.3 })
      .setVibrato({ frequency: 6, depth: 0.4 })
      .setRotation({ rotationHz: 0.2 })
      .setDistortion({ sinScale: 2 })
      .setChannelMix({ leftToRight: 0.2 })
      .setLowPass({ smoothing: 30 });

    const payload = filters.payload;
    expect(payload.volume).toBe(1.2);
    expect(payload.timescale).toEqual({ speed: 1.1, pitch: 1.05, rate: 1 });
    expect(payload.equalizer).toEqual([{ band: 0, gain: 0.5 }]);
    expect(payload.karaoke).toMatchObject({ level: 0.8, monoLevel: 1, filterBand: 220, filterWidth: 100 });
    expect(payload.tremolo).toEqual({ frequency: 4, depth: 0.3 });
    expect(payload.vibrato).toEqual({ frequency: 6, depth: 0.4 });
    expect(payload.rotation).toEqual({ rotationHz: 0.2 });
    expect(payload.distortion).toMatchObject({ sinScale: 2, cosScale: 1 });
    expect(payload.channelMix).toMatchObject({ leftToRight: 0.2, leftToLeft: 1 });
    expect(payload.lowPass).toEqual({ smoothing: 30 });
  });

  it('validates ranges', () => {
    expect(() => filters.setVolume(6)).toThrow(JunieErrorCode.INVALID_FILTER_VALUE);
    expect(() => filters.setVolume(-1)).toThrow();
    expect(() => filters.setEqualizer([{ band: 15, gain: 0.5 }])).toThrow();
    expect(() => filters.setEqualizer([{ band: 0, gain: 1.5 }])).toThrow();
    expect(() => filters.setTimescale({ speed: 0 })).toThrow();
    expect(() => filters.setTremolo({ depth: 1.5 })).toThrow();
    expect(() => filters.setVibrato({ frequency: 20 })).toThrow();
    expect(() => filters.setChannelMix({ leftToLeft: 2 })).toThrow();
    expect(() => filters.setLowPass({ smoothing: 0.5 })).toThrow();
    expect(() => filters.setRotation({ rotationHz: 5 })).toThrow();
  });

  it('supports presets', () => {
    filters.nightcore();
    expect(filters.payload.timescale).toMatchObject({ speed: 1.25, pitch: 1.25 });

    filters.reset().vaporwave();
    expect(filters.payload.timescale).toMatchObject({ speed: 0.75, pitch: 0.75 });

    filters.reset().bassboost(0.8);
    expect(filters.payload.equalizer).toHaveLength(5);
    expect(filters.payload.equalizer?.[0]).toEqual({ band: 0, gain: 0.8 });
    expect(filters.payload.equalizer?.[4]).toEqual({ band: 4, gain: 0.32 });

    filters.reset().eightD();
    expect(filters.payload.rotation).toEqual({ rotationHz: 0.2 });

    filters.reset().karaoke();
    expect(filters.payload.karaoke).toMatchObject({ level: 1, filterBand: 220 });
  });

  it('removes individual filters and resets', () => {
    filters.setVolume(2).setTimescale({ speed: 2 });
    filters.remove('volume');
    expect(filters.payload.volume).toBeUndefined();
    expect(filters.payload.timescale).toBeDefined();
    filters.reset();
    expect(filters.isEmpty).toBe(true);
  });

  it('applies in a single PATCH and clear() resets remotely', async () => {
    await filters.setVolume(1.5).setTimescale({ speed: 1.2 }).apply();
    const calls = patchCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ filters: { volume: 1.5, timescale: { speed: 1.2 } } });

    await filters.clear();
    const cleared = patchCalls();
    expect(cleared).toHaveLength(2);
    expect(cleared[1]).toMatchObject({ filters: {} });
  });
});
