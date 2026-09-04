/**
 * Junie — structured error hierarchy.
 *
 * Every error thrown by Junie carries a machine-readable `code`, a
 * human-readable message, and (where relevant) structured context. See
 * docs/errors.md for the full catalogue.
 */
/** Stable, machine-readable error codes. */
export declare enum JunieErrorCode {
    /** A node's WebSocket could not be established or failed. */
    NODE_CONNECTION_FAILED = "NODE_CONNECTION_FAILED",
    /** No healthy node is available for the requested operation. */
    NO_HEALTHY_NODES = "NO_HEALTHY_NODES",
    /** The requested node id is unknown. */
    NODE_NOT_FOUND = "NODE_NOT_FOUND",
    /** A duplicate node id was supplied. */
    NODE_ALREADY_EXISTS = "NODE_ALREADY_EXISTS",
    /** `Junie#init` was called without a user id anywhere. */
    MISSING_USER_ID = "MISSING_USER_ID",
    /** A REST call failed (network, timeout, or Lavalink error response). */
    REST_REQUEST_FAILED = "REST_REQUEST_FAILED",
    /** A player already exists for the guild. */
    PLAYER_ALREADY_EXISTS = "PLAYER_ALREADY_EXISTS",
    /** The referenced player does not exist locally. */
    PLAYER_NOT_FOUND = "PLAYER_NOT_FOUND",
    /** The player was destroyed and can no longer be used. */
    PLAYER_DESTROYED = "PLAYER_DESTROYED",
    /** Voice credentials did not arrive in time. */
    VOICE_CONNECTION_TIMEOUT = "VOICE_CONNECTION_TIMEOUT",
    /** A track could not be resolved or loaded. */
    TRACK_LOAD_FAILED = "TRACK_LOAD_FAILED",
    /** A track does not support the requested operation (e.g. seeking a stream). */
    TRACK_NOT_SEEKABLE = "TRACK_NOT_SEEKABLE",
    /** A filter value is out of range. */
    INVALID_FILTER_VALUE = "INVALID_FILTER_VALUE",
    /** An argument is invalid. */
    INVALID_ARGUMENT = "INVALID_ARGUMENT"
}
/** Base class of all errors thrown by Junie. */
export declare class JunieError extends Error {
    /** Stable machine-readable code. */
    readonly code: JunieErrorCode;
    /** Structured context (always JSON-safe). */
    readonly context: Record<string, unknown>;
    constructor(code: JunieErrorCode, message: string, context?: Record<string, unknown>);
}
/** Thrown when a REST call fails or Lavalink answers with an error status. */
export declare class JunieRestError extends JunieError {
    /** HTTP method of the failed request. */
    readonly method: string;
    /** Path of the failed request. */
    readonly path: string;
    /** HTTP status code (0 for network-level failures). */
    readonly status: number;
    /** Raw response body, if any. */
    readonly body?: string;
    /** Lavalink's structured error body, when it returned one. */
    readonly lavalink?: {
        timestamp: number;
        status: number;
        error: string;
        message: string;
        path: string;
        trace?: string;
    };
    constructor(options: {
        method: string;
        path: string;
        status: number;
        message: string;
        body?: string;
        lavalink?: JunieRestError['lavalink'];
        cause?: unknown;
    });
}
/** Thrown when Discord voice credentials don't arrive within the timeout. */
export declare class VoiceConnectionError extends JunieError {
    constructor(guildId: string, timeoutMs: number);
}
/** Thrown when an (unresolved) track cannot be loaded or resolved. */
export declare class TrackLoadError extends JunieError {
    /** The exception Lavalink reported, if any. */
    readonly exception?: {
        message: string;
        severity: string;
        cause?: string;
    };
    constructor(message: string, context?: Record<string, unknown>);
}
//# sourceMappingURL=errors.d.ts.map