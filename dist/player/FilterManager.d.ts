/**
 * Junie — fluent filter management.
 *
 * All Lavalink v4 filters, with validation, sensible defaults, mergeable
 * raw access, and one-call presets. Setters return `this`, so a filter
 * chain reads like a sentence:
 *
 * ```ts
 * await player.filters
 *   .setVolume(1.2)
 *   .setTimescale({ speed: 1.2, pitch: 1.05 })
 *   .bassboost(0.6)
 *   .apply(); // one PATCH — one round trip
 * ```
 */
import type { ChannelMixSettings, DistortionSettings, EqualizerBand, FiltersPayload, KaraokeSettings, LowPassSettings, RotationSettings, TremoloSettings, VibratoSettings } from '../types/api.js';
import type { Player } from './Player.js';
type TimescaleSettings = {
    speed: number;
    pitch: number;
    rate: number;
};
/**
 * Filter builder bound to a {@link Player}. Changes are local until
 * {@link FilterManager#apply} ships them in a single REST call.
 */
export declare class FilterManager {
    /** @internal */
    readonly player: Player;
    private data;
    constructor(player: Player);
    /** A deep copy of the current filter payload. */
    get payload(): FiltersPayload;
    /** True when no filter is active. */
    get isEmpty(): boolean;
    /**
     * Linear output gain (0.0–5.0). This is *filter* volume — independent of
     * the player volume (0–1000); the two multiply server-side.
     */
    setVolume(volume: number): this;
    /** 15-band equalizer (bands 0–14, gain -0.25 to 1.0). */
    setEqualizer(bands: EqualizerBand[]): this;
    /** Remove vocals from most stereo mixes. */
    setKaraoke(settings?: Partial<KaraokeSettings>): this;
    /** Change speed / pitch / rate without pitch correction. */
    setTimescale(settings?: Partial<TimescaleSettings>): this;
    /** Amplitude modulation (trembling volume). */
    setTremolo(settings?: Partial<TremoloSettings>): this;
    /** Pitch modulation (wobbling pitch). */
    setVibrato(settings?: Partial<VibratoSettings>): this;
    /** Rotating audio panning ("8D audio"). */
    setRotation(settings?: Partial<RotationSettings>): this;
    /** Wave-shaping distortion. */
    setDistortion(settings?: Partial<DistortionSettings>): this;
    /** Mix left/right input into left/right output channels. */
    setChannelMix(settings?: Partial<ChannelMixSettings>): this;
    /** Low-pass filter; higher smoothing removes more highs. */
    setLowPass(settings?: Partial<LowPassSettings>): this;
    /** Raw plugin filter payloads (e.g. for LavaSrc-style DSP plugins). */
    setPluginFilters(filters: Record<string, Record<string, unknown>>): this;
    /** Remove one filter locally (no REST call). */
    remove(filter: keyof FiltersPayload): this;
    /** Remove all filters locally (no REST call). */
    reset(): this;
    /** Classic nightcore: +25% speed and pitch. */
    nightcore(): this;
    /** Classic vaporwave: -25% speed and pitch. */
    vaporwave(): this;
    /**
     * Boost the low end. `gain` defaults to 0.8 (max 1.0).
     * Falls off linearly across bands 0–4.
     */
    bassboost(gain?: number): this;
    /** Default karaoke (vocal removal) settings. */
    karaoke(): this;
    /** 8D-style rotation at 0.2 Hz. */
    eightD(rotationHz?: number): this;
    /** Merge a raw payload (subset allowed) into the current state. */
    merge(payload: FiltersPayload): this;
    /** Send the current filter state to Lavalink (one PATCH). */
    apply(): Promise<void>;
    /** Reset everything and apply immediately (one PATCH). */
    clear(): Promise<void>;
}
export {};
//# sourceMappingURL=FilterManager.d.ts.map