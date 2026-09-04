# Filters

Lavalink v4 applies DSP filters server-side. Junie wraps every one of them with validation,
sensible defaults, and a **fluent builder** that batches changes into a single REST call:

```ts
await player.filters
  .setVolume(1.2)
  .setTimescale({ speed: 1.2, pitch: 1.05 })
  .setEqualizer([{ band: 1, gain: 0.4 }])
  .apply();          // ONE PATCH — one round trip
```

Changes are **local** until `apply()`; inspect them with `player.filters.payload` (a deep
copy) or `player.filters.isEmpty`.

## The filters

### `setVolume(volume: number)`

Linear output gain, `0.0–5.0`. This is *filter* volume — independent of player volume
(`player.setVolume`, 0–1000); the two multiply server-side. Filter volume is what you want for
gradual fades; player volume is what users think of as "the volume".

### `setEqualizer(bands: EqualizerBand[])`

15-band parametric equalizer.

```ts
player.filters.setEqualizer([
  { band: 0, gain: 0.8 },   // +8 dB-ish at the lowest band
  { band: 1, gain: 0.5 },
  { band: 14, gain: -0.25 }, // tame the highest band (max cut)
]);
```

- `band`: integer `0` (lowest) – `14` (highest)
- `gain`: `-0.25` – `1.0`

### `setKaraoke(settings?)`

Removes vocals from most stereo mixes.

```ts
player.filters.setKaraoke({ level: 1, monoLevel: 1, filterBand: 220, filterWidth: 100 });
```

| Field | Range / default | Meaning |
|---|---|---|
| `level` | 0–1 · default 1 | overall effect strength |
| `monoLevel` | 0–1 · default 1 | strength on the mono-ized part |
| `filterBand` | Hz · default 220 | frequency band to filter |
| `filterWidth` | Hz · default 100 | filter width |

### `setTimescale(settings?)`

The speed / pitch / rate filter — nightcore, vaporwave, chipmunk effects.

```ts
player.filters.setTimescale({ speed: 1.25, pitch: 1.25, rate: 1 });
```

All values must be positive. `speed` changes tempo without pitch, `pitch` transposes, `rate`
resamples (affecting both).

### `setTremolo(settings?)`

Amplitude modulation — a *volume* tremble.

```ts
player.filters.setTremolo({ frequency: 4, depth: 0.6 });
```

`frequency` > 0 Hz (default 2), `depth` 0–1 (default 0.5).

### `setVibrato(settings?)`

Pitch modulation — a *pitch* wobble.

```ts
player.filters.setVibrato({ frequency: 6, depth: 0.7 });
```

`frequency` 0–14 Hz (default 2), `depth` 0–1 (default 0.5).

### `setRotation(settings?)`

Rotating panning — "8D audio" when non-zero.

```ts
player.filters.setRotation({ rotationHz: 0.2 });
```

`rotationHz` −2 to 2; 0.15–0.25 sounds right for classic 8D.

### `setDistortion(settings?)`

Wave-shaping distortion. All eight parameters are free-form numbers (sin/cos/tan offsets and
scales, plus overall offset/scale):

```ts
player.filters.setDistortion({ sinOffset: 0, sinScale: 1, cosOffset: 0, cosScale: 1,
                               tanOffset: 0, tanScale: 1, offset: 0, scale: 1 });
```

### `setChannelMix(settings?)`

Mixes left/right input into left/right output. Great for "karaoke-style" mono folding or
swapping channels.

```ts
player.filters.setChannelMix({ leftToLeft: 0.5, leftToRight: 0.5,
                               rightToLeft: 0.5, rightToRight: 0.5 }); // mono fold
```

All four coefficients: 0–1 (defaults keep stereo identity).

### `setLowPass(settings?)`

Low-pass filter — softens high frequencies.

```ts
player.filters.setLowPass({ smoothing: 20 });
```

`smoothing` ≥ 1; higher = more high-frequency removal. 20+ starts sounding "underwater".

### `setPluginFilters(filters)`

Raw payload for DSP plugins — whatever your Lavalink plugin expects:

```ts
player.filters.setPluginFilters({ 'tcfilters:echo': { delayMs: 250, decay: 0.4 } });
```

## Presets

One call each, chainable:

```ts
player.filters.nightcore();     // timescale { speed: 1.25, pitch: 1.25 }
player.filters.vaporwave();     // timescale { speed: 0.75, pitch: 0.75 }
player.filters.bassboost(0.8);  // bands 0–4, gain falling off linearly (max 1)
player.filters.karaoke();       // default karaoke settings
player.filters.eightD(0.2);     // rotation at 0.2 Hz
```

## Managing state

```ts
player.filters.remove('timescale');      // drop one filter locally
player.filters.reset();                  // drop all locally
await player.filters.apply();            // ship current state
await player.filters.clear();            // reset + apply (server-side off)
player.filters.merge(rawPayload);        // merge a raw payload locally
```

And on the player directly — merge + apply in one call:

```ts
await player.setFilters({ volume: 2, timescale: { speed: 1.1 } });
```

## Validation

Out-of-range values throw `JunieError` with code `INVALID_FILTER_VALUE` *before* any network
call — bad filters never reach Lavalink:

```ts
player.filters.setEqualizer([{ band: 15, gain: 0.5 }]);
// ❌ [INVALID_FILTER_VALUE] equalizer.band must be between 0 and 14 (got 15).
```

## Effect recipes

```ts
// Nightcore + a touch of bass
await player.filters.nightcore().bassboost(0.4).apply();

// Underwater
await player.filters.setLowPass({ smoothing: 60 }).setTimescale({ speed: 0.9 }).apply();

// Phone call
await player.filters.setLowPass({ smoothing: 4 }).setEqualizer([
  { band: 0, gain: -0.25 }, { band: 1, gain: 0.2 },
  { band: 2, gain: 0.6 }, { band: 3, gain: 0.4 },
]).apply();

// Mono (for music bots in voice channels with mismatched users)
await player.filters.setChannelMix({ leftToLeft: 0.5, leftToRight: 0.5,
                                      rightToLeft: 0.5, rightToRight: 0.5 }).apply();

// Back to normal
await player.filters.clear();
```

Filters survive session loss — Junie re-applies the current filter payload when it rebuilds a
player after a Lavalink restart.
