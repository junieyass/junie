/**
 * Junie — small, dependency-free helpers.
 */
/** Sleep for `ms` milliseconds. */
export declare function sleep(ms: number): Promise<void>;
/**
 * Race a promise against a timeout. Never rejects on timeout — resolves to
 * `undefined` so callers can degrade gracefully.
 */
export declare function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | undefined>;
/** Clamp `value` into `[min, max]`. */
export declare function clamp(value: number, min: number, max: number): number;
/** True when the string looks like a direct http(s) media URL. */
export declare function isUrl(value: string): boolean;
/** True when the string already carries a Lavalink search prefix. */
export declare function hasSearchPrefix(value: string): boolean;
/** Format milliseconds as `mm:ss` / `hh:mm:ss` (streams render as "LIVE"). */
export declare function formatDuration(ms: number, live?: boolean): string;
/**
 * Non-cryptographic deterministic RNG (mulberry32) — used to make queue
 * shuffles reproducible in tests. Returns a `() => number` in [0, 1).
 */
export declare function createRng(seed?: number): () => number;
/** Fisher-Yates shuffle performed in place. */
export declare function shuffleInPlace<T>(items: T[], rng?: () => number): T[];
/**
 * Apply ±30% jitter to a delay value (used by the node reconnect backoff to
 * avoid thundering-herd reconnect storms).
 */
export declare function applyJitter(delay: number): number;
/**
 * Compute exponential backoff with a cap.
 * `attempt` is 1-based: attempt 1 -> initialDelay.
 */
export declare function backoffDelay(attempt: number, initialDelay: number, multiplier: number, maxDelay: number): number;
/** Type-guard: value is a plain (JSON-style) object. */
export declare function isPlainObject(value: unknown): value is Record<string, unknown>;
/** Build a query string from a record, skipping nullish values. */
export declare function buildQueryString(params: Record<string, string | undefined>): string;
//# sourceMappingURL=Helpers.d.ts.map