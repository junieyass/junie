"use strict";
/**
 * Junie — library-wide constants.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.FILTER_VOLUME_RANGE = exports.PLAYER_VOLUME_RANGE = exports.EQUALIZER_BAND_RANGE = exports.MAX_VOICE_RECONNECT_ATTEMPTS = exports.DESTROY_TIMEOUT = exports.DEFAULTS = exports.SOURCE_PREFIXES = exports.GATEWAY_VOICE_STATE_OPCODE = exports.WEBSOCKET_PATH = exports.REST_BASE = exports.DEFAULT_PORT = exports.DEFAULT_CLIENT_NAME = exports.JUNIE_VERSION = void 0;
/** Junie's semantic version. */
exports.JUNIE_VERSION = '1.1.0';
/** Value sent as the `Client-Name` WebSocket/REST header by default. */
exports.DEFAULT_CLIENT_NAME = `Junie/${exports.JUNIE_VERSION}`;
/** Default Lavalink port. */
exports.DEFAULT_PORT = 2333;
/** REST base path of the Lavalink v4 API. */
exports.REST_BASE = '/v4';
/** WebSocket endpoint of the Lavalink v4 API. */
exports.WEBSOCKET_PATH = '/v4/websocket';
/** Discord gateway opcode for voice state update requests. */
exports.GATEWAY_VOICE_STATE_OPCODE = 4;
/** Well-known source prefixes understood by stock Lavalink v4. */
exports.SOURCE_PREFIXES = {
    youtube: 'ytsearch:',
    youtubeMusic: 'ytmsearch:',
    soundcloud: 'scsearch:',
};
/** Default `JunieOptions`. */
exports.DEFAULTS = {
    logLevel: 'info',
    defaultSearchSource: 'youtube',
    searchParallel: false,
    skipOnError: true,
    autoVoiceReconnect: true,
    autoFailover: true,
    voiceConnectionTimeout: 15_000,
    rest: {
        timeout: 10_000,
        retries: 2,
    },
    reconnect: {
        retries: 10,
        initialDelay: 1_000,
        maxDelay: 60_000,
        multiplier: 2,
        jitter: true,
    },
    resume: {
        enabled: true,
        timeout: 60,
    },
    queue: {
        restore: false,
        historyLimit: 50,
    },
    player: {
        volume: 100,
        selfDeaf: true,
        selfMute: false,
    },
};
/**
 * Deterministic force-cleanup budget for `Player#destroy`, in milliseconds.
 * Prevents zombie players when the node is unreachable.
 */
exports.DESTROY_TIMEOUT = 3_000;
/** Cap for automatic voice rejoin attempts after `WebSocketClosedEvent`. */
exports.MAX_VOICE_RECONNECT_ATTEMPTS = 5;
/** Valid equalizer band range (0–14, per Lavalink). */
exports.EQUALIZER_BAND_RANGE = { min: 0, max: 14, gainMin: -0.25, gainMax: 1 };
/** Player volume range (0–1000, per Lavalink). */
exports.PLAYER_VOLUME_RANGE = { min: 0, max: 1000 };
/** Filter volume range (0.0–5.0, per Lavalink). */
exports.FILTER_VOLUME_RANGE = { min: 0, max: 5 };
//# sourceMappingURL=constants.js.map