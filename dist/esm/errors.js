/**
 * Junie — structured error hierarchy.
 *
 * Every error thrown by Junie carries a machine-readable `code`, a
 * human-readable message, and (where relevant) structured context. See
 * docs/errors.md for the full catalogue.
 */
/** Stable, machine-readable error codes. */
export var JunieErrorCode;
(function (JunieErrorCode) {
    /** A node's WebSocket could not be established or failed. */
    JunieErrorCode["NODE_CONNECTION_FAILED"] = "NODE_CONNECTION_FAILED";
    /** No healthy node is available for the requested operation. */
    JunieErrorCode["NO_HEALTHY_NODES"] = "NO_HEALTHY_NODES";
    /** The requested node id is unknown. */
    JunieErrorCode["NODE_NOT_FOUND"] = "NODE_NOT_FOUND";
    /** A duplicate node id was supplied. */
    JunieErrorCode["NODE_ALREADY_EXISTS"] = "NODE_ALREADY_EXISTS";
    /** `Junie#init` was called without a user id anywhere. */
    JunieErrorCode["MISSING_USER_ID"] = "MISSING_USER_ID";
    /** A REST call failed (network, timeout, or Lavalink error response). */
    JunieErrorCode["REST_REQUEST_FAILED"] = "REST_REQUEST_FAILED";
    /** A player already exists for the guild. */
    JunieErrorCode["PLAYER_ALREADY_EXISTS"] = "PLAYER_ALREADY_EXISTS";
    /** The referenced player does not exist locally. */
    JunieErrorCode["PLAYER_NOT_FOUND"] = "PLAYER_NOT_FOUND";
    /** The player was destroyed and can no longer be used. */
    JunieErrorCode["PLAYER_DESTROYED"] = "PLAYER_DESTROYED";
    /** Voice credentials did not arrive in time. */
    JunieErrorCode["VOICE_CONNECTION_TIMEOUT"] = "VOICE_CONNECTION_TIMEOUT";
    /** A track could not be resolved or loaded. */
    JunieErrorCode["TRACK_LOAD_FAILED"] = "TRACK_LOAD_FAILED";
    /** A track does not support the requested operation (e.g. seeking a stream). */
    JunieErrorCode["TRACK_NOT_SEEKABLE"] = "TRACK_NOT_SEEKABLE";
    /** A filter value is out of range. */
    JunieErrorCode["INVALID_FILTER_VALUE"] = "INVALID_FILTER_VALUE";
    /** An argument is invalid. */
    JunieErrorCode["INVALID_ARGUMENT"] = "INVALID_ARGUMENT";
})(JunieErrorCode || (JunieErrorCode = {}));
/** Base class of all errors thrown by Junie. */
export class JunieError extends Error {
    /** Stable machine-readable code. */
    code;
    /** Structured context (always JSON-safe). */
    context;
    constructor(code, message, context = {}) {
        super(`[${code}] ${message}`);
        this.name = 'JunieError';
        this.code = code;
        this.context = context;
    }
}
/** Thrown when a REST call fails or Lavalink answers with an error status. */
export class JunieRestError extends JunieError {
    /** HTTP method of the failed request. */
    method;
    /** Path of the failed request. */
    path;
    /** HTTP status code (0 for network-level failures). */
    status;
    /** Raw response body, if any. */
    body;
    /** Lavalink's structured error body, when it returned one. */
    lavalink;
    constructor(options) {
        super(JunieErrorCode.REST_REQUEST_FAILED, `${options.method} ${options.path} -> ${options.status}: ${options.message}`, { method: options.method, path: options.path, status: options.status });
        this.name = 'JunieRestError';
        this.method = options.method;
        this.path = options.path;
        this.status = options.status;
        this.body = options.body;
        this.lavalink = options.lavalink;
        if (options.cause)
            this.cause = options.cause;
    }
}
/** Thrown when Discord voice credentials don't arrive within the timeout. */
export class VoiceConnectionError extends JunieError {
    constructor(guildId, timeoutMs) {
        super(JunieErrorCode.VOICE_CONNECTION_TIMEOUT, `Timed out after ${timeoutMs}ms waiting for Discord voice credentials (guild ${guildId}). ` +
            'Make sure VOICE_STATE_UPDATE / VOICE_SERVER_UPDATE are forwarded to Junie#sendRawData.', { guildId, timeoutMs });
        this.name = 'VoiceConnectionError';
    }
}
/** Thrown when an (unresolved) track cannot be loaded or resolved. */
export class TrackLoadError extends JunieError {
    /** The exception Lavalink reported, if any. */
    exception;
    constructor(message, context = {}) {
        super(JunieErrorCode.TRACK_LOAD_FAILED, message, context);
        this.name = 'TrackLoadError';
    }
}
//# sourceMappingURL=errors.js.map