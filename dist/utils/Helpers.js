"use strict";
/**
 * Junie — small, dependency-free helpers.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.sleep = sleep;
exports.withTimeout = withTimeout;
exports.clamp = clamp;
exports.isUrl = isUrl;
exports.hasSearchPrefix = hasSearchPrefix;
exports.formatDuration = formatDuration;
exports.createRng = createRng;
exports.shuffleInPlace = shuffleInPlace;
exports.applyJitter = applyJitter;
exports.backoffDelay = backoffDelay;
exports.isPlainObject = isPlainObject;
exports.buildQueryString = buildQueryString;
/** Sleep for `ms` milliseconds. */
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
/**
 * Race a promise against a timeout. Never rejects on timeout — resolves to
 * `undefined` so callers can degrade gracefully.
 */
async function withTimeout(promise, ms) {
    let timer;
    try {
        return await Promise.race([
            promise,
            new Promise((resolve) => {
                timer = setTimeout(() => resolve(undefined), ms);
            }),
        ]);
    }
    finally {
        if (timer)
            clearTimeout(timer);
    }
}
/** Clamp `value` into `[min, max]`. */
function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}
/** True when the string looks like a direct http(s) media URL. */
function isUrl(value) {
    return /^https?:\/\//i.test(value);
}
/** True when the string already carries a Lavalink search prefix. */
function hasSearchPrefix(value) {
    return /^[a-z][a-z0-9_-]*:/i.test(value) && !isUrl(value);
}
/** Format milliseconds as `mm:ss` / `hh:mm:ss` (streams render as "LIVE"). */
function formatDuration(ms, live = false) {
    if (live || !Number.isFinite(ms) || ms <= 0)
        return 'LIVE';
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const mm = String(minutes).padStart(2, '0');
    const ss = String(seconds).padStart(2, '0');
    return hours > 0 ? `${hours}:${mm}:${ss}` : `${minutes}:${ss}`;
}
/**
 * Non-cryptographic deterministic RNG (mulberry32) — used to make queue
 * shuffles reproducible in tests. Returns a `() => number` in [0, 1).
 */
function createRng(seed = Date.now()) {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
/** Fisher-Yates shuffle performed in place. */
function shuffleInPlace(items, rng = Math.random) {
    for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
}
/**
 * Apply ±30% jitter to a delay value (used by the node reconnect backoff to
 * avoid thundering-herd reconnect storms).
 */
function applyJitter(delay) {
    const spread = delay * 0.3;
    return Math.max(0, Math.round(delay - spread + Math.random() * spread * 2));
}
/**
 * Compute exponential backoff with a cap.
 * `attempt` is 1-based: attempt 1 -> initialDelay.
 */
function backoffDelay(attempt, initialDelay, multiplier, maxDelay) {
    const raw = initialDelay * Math.pow(multiplier, Math.max(0, attempt - 1));
    return Math.min(maxDelay, Math.round(raw));
}
/** Type-guard: value is a plain (JSON-style) object. */
function isPlainObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
/** Build a query string from a record, skipping nullish values. */
function buildQueryString(params) {
    const entries = Object.entries(params).filter(([, v]) => v !== undefined);
    if (entries.length === 0)
        return '';
    return `?${entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')}`;
}
//# sourceMappingURL=Helpers.js.map