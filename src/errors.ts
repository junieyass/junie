/**
 * Junie — structured error hierarchy.
 *
 * Every error thrown by Junie carries a machine-readable `code`, a
 * human-readable message, and (where relevant) structured context. See
 * docs/errors.md for the full catalogue.
 */

/** Stable, machine-readable error codes. */
export enum JunieErrorCode {
  /** A node's WebSocket could not be established or failed. */
  NODE_CONNECTION_FAILED = 'NODE_CONNECTION_FAILED',
  /** No healthy node is available for the requested operation. */
  NO_HEALTHY_NODES = 'NO_HEALTHY_NODES',
  /** The requested node id is unknown. */
  NODE_NOT_FOUND = 'NODE_NOT_FOUND',
  /** A duplicate node id was supplied. */
  NODE_ALREADY_EXISTS = 'NODE_ALREADY_EXISTS',
  /** `Junie#init` was called without a user id anywhere. */
  MISSING_USER_ID = 'MISSING_USER_ID',
  /** A REST call failed (network, timeout, or Lavalink error response). */
  REST_REQUEST_FAILED = 'REST_REQUEST_FAILED',
  /** A player already exists for the guild. */
  PLAYER_ALREADY_EXISTS = 'PLAYER_ALREADY_EXISTS',
  /** The referenced player does not exist locally. */
  PLAYER_NOT_FOUND = 'PLAYER_NOT_FOUND',
  /** The player was destroyed and can no longer be used. */
  PLAYER_DESTROYED = 'PLAYER_DESTROYED',
  /** Voice credentials did not arrive in time. */
  VOICE_CONNECTION_TIMEOUT = 'VOICE_CONNECTION_TIMEOUT',
  /** A track could not be resolved or loaded. */
  TRACK_LOAD_FAILED = 'TRACK_LOAD_FAILED',
  /** A track does not support the requested operation (e.g. seeking a stream). */
  TRACK_NOT_SEEKABLE = 'TRACK_NOT_SEEKABLE',
  /** A filter value is out of range. */
  INVALID_FILTER_VALUE = 'INVALID_FILTER_VALUE',
  /** An argument is invalid. */
  INVALID_ARGUMENT = 'INVALID_ARGUMENT',
}

/** Base class of all errors thrown by Junie. */
export class JunieError extends Error {
  /** Stable machine-readable code. */
  public readonly code: JunieErrorCode;
  /** Structured context (always JSON-safe). */
  public readonly context: Record<string, unknown>;

  public constructor(
    code: JunieErrorCode,
    message: string,
    context: Record<string, unknown> = {},
  ) {
    super(`[${code}] ${message}`);
    this.name = 'JunieError';
    this.code = code;
    this.context = context;
  }
}

/** Thrown when a REST call fails or Lavalink answers with an error status. */
export class JunieRestError extends JunieError {
  /** HTTP method of the failed request. */
  public readonly method: string;
  /** Path of the failed request. */
  public readonly path: string;
  /** HTTP status code (0 for network-level failures). */
  public readonly status: number;
  /** Raw response body, if any. */
  public readonly body?: string;
  /** Lavalink's structured error body, when it returned one. */
  public readonly lavalink?: {
    timestamp: number;
    status: number;
    error: string;
    message: string;
    path: string;
    trace?: string;
  };

  public constructor(options: {
    method: string;
    path: string;
    status: number;
    message: string;
    body?: string;
    lavalink?: JunieRestError['lavalink'];
    cause?: unknown;
  }) {
    super(
      JunieErrorCode.REST_REQUEST_FAILED,
      `${options.method} ${options.path} -> ${options.status}: ${options.message}`,
      { method: options.method, path: options.path, status: options.status },
    );
    this.name = 'JunieRestError';
    this.method = options.method;
    this.path = options.path;
    this.status = options.status;
    this.body = options.body;
    this.lavalink = options.lavalink;
    if (options.cause) this.cause = options.cause;
  }
}

/** Thrown when Discord voice credentials don't arrive within the timeout. */
export class VoiceConnectionError extends JunieError {
  public constructor(guildId: string, timeoutMs: number) {
    super(
      JunieErrorCode.VOICE_CONNECTION_TIMEOUT,
      `Timed out after ${timeoutMs}ms waiting for Discord voice credentials (guild ${guildId}). ` +
        'Make sure VOICE_STATE_UPDATE / VOICE_SERVER_UPDATE are forwarded to Junie#sendRawData.',
      { guildId, timeoutMs },
    );
    this.name = 'VoiceConnectionError';
  }
}

/** Thrown when an (unresolved) track cannot be loaded or resolved. */
export class TrackLoadError extends JunieError {
  /** The exception Lavalink reported, if any. */
  public readonly exception?: { message: string; severity: string; cause?: string };

  public constructor(message: string, context: Record<string, unknown> = {}) {
    super(JunieErrorCode.TRACK_LOAD_FAILED, message, context);
    this.name = 'TrackLoadError';
  }
}
