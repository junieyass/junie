"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.FilterManager = void 0;
const constants_js_1 = require("../constants.js");
const errors_js_1 = require("../errors.js");
const DEFAULT_KARAOKE = { level: 1, monoLevel: 1, filterBand: 220, filterWidth: 100 };
const DEFAULT_TIMESCALE = { speed: 1, pitch: 1, rate: 1 };
const DEFAULT_TREMOLO = { frequency: 2, depth: 0.5 };
const DEFAULT_VIBRATO = { frequency: 2, depth: 0.5 };
const DEFAULT_ROTATION = { rotationHz: 0 };
const DEFAULT_DISTORTION = {
    sinOffset: 0, sinScale: 1, cosOffset: 0, cosScale: 1,
    tanOffset: 0, tanScale: 1, offset: 0, scale: 1,
};
const DEFAULT_CHANNEL_MIX = { leftToLeft: 1, leftToRight: 0, rightToLeft: 0, rightToRight: 1 };
const DEFAULT_LOW_PASS = { smoothing: 20 };
function assertNumber(name, value, min, max) {
    if (typeof value !== 'number' || Number.isNaN(value)) {
        throw new errors_js_1.JunieError(errors_js_1.JunieErrorCode.INVALID_FILTER_VALUE, `${name} must be a number (got ${String(value)}).`);
    }
    if (value < min || value > max) {
        throw new errors_js_1.JunieError(errors_js_1.JunieErrorCode.INVALID_FILTER_VALUE, `${name} must be between ${min} and ${max} (got ${value}).`);
    }
    return value;
}
function assertPositive(name, value) {
    if (typeof value !== 'number' || Number.isNaN(value) || value <= 0) {
        throw new errors_js_1.JunieError(errors_js_1.JunieErrorCode.INVALID_FILTER_VALUE, `${name} must be a positive number (got ${String(value)}).`);
    }
    return value;
}
function merge(base, patch) {
    return { ...base, ...(patch ?? {}) };
}
/**
 * Filter builder bound to a {@link Player}. Changes are local until
 * {@link FilterManager#apply} ships them in a single REST call.
 */
class FilterManager {
    /** @internal */
    player;
    data = {};
    constructor(player) {
        this.player = player;
    }
    /** A deep copy of the current filter payload. */
    get payload() {
        return JSON.parse(JSON.stringify(this.data));
    }
    /** True when no filter is active. */
    get isEmpty() {
        return Object.keys(this.data).length === 0;
    }
    // -------------------------------------------------------------------------
    // Individual filters (chainable)
    // -------------------------------------------------------------------------
    /**
     * Linear output gain (0.0–5.0). This is *filter* volume — independent of
     * the player volume (0–1000); the two multiply server-side.
     */
    setVolume(volume) {
        assertNumber('filters.volume', volume, constants_js_1.FILTER_VOLUME_RANGE.min, constants_js_1.FILTER_VOLUME_RANGE.max);
        this.data.volume = volume;
        return this;
    }
    /** 15-band equalizer (bands 0–14, gain -0.25 to 1.0). */
    setEqualizer(bands) {
        if (!Array.isArray(bands)) {
            throw new errors_js_1.JunieError(errors_js_1.JunieErrorCode.INVALID_FILTER_VALUE, 'equalizer expects an array of bands.');
        }
        for (const band of bands) {
            assertNumber('equalizer.band', band.band, constants_js_1.EQUALIZER_BAND_RANGE.min, constants_js_1.EQUALIZER_BAND_RANGE.max);
            assertNumber('equalizer.gain', band.gain, constants_js_1.EQUALIZER_BAND_RANGE.gainMin, constants_js_1.EQUALIZER_BAND_RANGE.gainMax);
        }
        this.data.equalizer = [...bands];
        return this;
    }
    /** Remove vocals from most stereo mixes. */
    setKaraoke(settings) {
        this.data.karaoke = merge(DEFAULT_KARAOKE, settings);
        return this;
    }
    /** Change speed / pitch / rate without pitch correction. */
    setTimescale(settings) {
        const merged = merge(DEFAULT_TIMESCALE, settings);
        assertPositive('timescale.speed', merged.speed);
        assertPositive('timescale.pitch', merged.pitch);
        assertPositive('timescale.rate', merged.rate);
        this.data.timescale = merged;
        return this;
    }
    /** Amplitude modulation (trembling volume). */
    setTremolo(settings) {
        const merged = merge(DEFAULT_TREMOLO, settings);
        assertPositive('tremolo.frequency', merged.frequency);
        assertNumber('tremolo.depth', merged.depth, 0, 1);
        this.data.tremolo = merged;
        return this;
    }
    /** Pitch modulation (wobbling pitch). */
    setVibrato(settings) {
        const merged = merge(DEFAULT_VIBRATO, settings);
        assertNumber('vibrato.frequency', merged.frequency, 0, 14);
        assertNumber('vibrato.depth', merged.depth, 0, 1);
        this.data.vibrato = merged;
        return this;
    }
    /** Rotating audio panning ("8D audio"). */
    setRotation(settings) {
        const merged = merge(DEFAULT_ROTATION, settings);
        assertNumber('rotation.rotationHz', merged.rotationHz, -2, 2);
        this.data.rotation = merged;
        return this;
    }
    /** Wave-shaping distortion. */
    setDistortion(settings) {
        this.data.distortion = merge(DEFAULT_DISTORTION, settings);
        return this;
    }
    /** Mix left/right input into left/right output channels. */
    setChannelMix(settings) {
        const merged = merge(DEFAULT_CHANNEL_MIX, settings);
        assertNumber('channelMix.leftToLeft', merged.leftToLeft, 0, 1);
        assertNumber('channelMix.leftToRight', merged.leftToRight, 0, 1);
        assertNumber('channelMix.rightToLeft', merged.rightToLeft, 0, 1);
        assertNumber('channelMix.rightToRight', merged.rightToRight, 0, 1);
        this.data.channelMix = merged;
        return this;
    }
    /** Low-pass filter; higher smoothing removes more highs. */
    setLowPass(settings) {
        const merged = merge(DEFAULT_LOW_PASS, settings);
        if (merged.smoothing < 1) {
            throw new errors_js_1.JunieError(errors_js_1.JunieErrorCode.INVALID_FILTER_VALUE, `lowPass.smoothing must be >= 1 (got ${merged.smoothing}).`);
        }
        this.data.lowPass = merged;
        return this;
    }
    /** Raw plugin filter payloads (e.g. for LavaSrc-style DSP plugins). */
    setPluginFilters(filters) {
        this.data.pluginFilters = { ...filters };
        return this;
    }
    // -------------------------------------------------------------------------
    // Local clearing
    // -------------------------------------------------------------------------
    /** Remove one filter locally (no REST call). */
    remove(filter) {
        delete this.data[filter];
        return this;
    }
    /** Remove all filters locally (no REST call). */
    reset() {
        this.data = {};
        return this;
    }
    // -------------------------------------------------------------------------
    // Presets (chainable)
    // -------------------------------------------------------------------------
    /** Classic nightcore: +25% speed and pitch. */
    nightcore() {
        return this.setTimescale({ speed: 1.25, pitch: 1.25 });
    }
    /** Classic vaporwave: -25% speed and pitch. */
    vaporwave() {
        return this.setTimescale({ speed: 0.75, pitch: 0.75 });
    }
    /**
     * Boost the low end. `gain` defaults to 0.8 (max 1.0).
     * Falls off linearly across bands 0–4.
     */
    bassboost(gain = 0.8) {
        assertNumber('bassboost.gain', gain, 0, 1);
        const bands = [0, 1, 2, 3, 4].map((band) => ({
            band,
            gain: Number((gain * (1 - band * 0.15)).toFixed(3)),
        }));
        return this.setEqualizer(bands);
    }
    /** Default karaoke (vocal removal) settings. */
    karaoke() {
        return this.setKaraoke();
    }
    /** 8D-style rotation at 0.2 Hz. */
    eightD(rotationHz = 0.2) {
        return this.setRotation({ rotationHz });
    }
    // -------------------------------------------------------------------------
    // Shipping
    // -------------------------------------------------------------------------
    /** Merge a raw payload (subset allowed) into the current state. */
    merge(payload) {
        this.data = { ...this.data, ...payload };
        return this;
    }
    /** Send the current filter state to Lavalink (one PATCH). */
    async apply() {
        await this.player.patchPlayer({ filters: this.data });
    }
    /** Reset everything and apply immediately (one PATCH). */
    async clear() {
        this.reset();
        return this.apply();
    }
}
exports.FilterManager = FilterManager;
//# sourceMappingURL=FilterManager.js.map