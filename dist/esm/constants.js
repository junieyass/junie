/**
 * Junie — library-wide constants.
 */
/** Junie's semantic version. */
export const JUNIE_VERSION = '1.0.0';
/** Value sent as the `Client-Name` WebSocket/REST header by default. */
export const DEFAULT_CLIENT_NAME = `Junie/${JUNIE_VERSION}`;
/** Default Lavalink port. */
export const DEFAULT_PORT = 2333;
/** REST base path of the Lavalink v4 API. */
export const REST_BASE = '/v4';
/** WebSocket endpoint of the Lavalink v4 API. */
export const WEBSOCKET_PATH = '/v4/websocket';
/** Discord gateway opcode for voice state update requests. */
export const GATEWAY_VOICE_STATE_OPCODE = 4;
/** Well-known source prefixes understood by stock Lavalink v4. */
export const SOURCE_PREFIXES = {
    youtube: 'ytsearch:',
    youtubeMusic: 'ytmsearch:',
    soundcloud: 'scsearch:',
};
/** Default `JunieOptions`. */
export const DEFAULTS = {
    logLevel: 'info',
    defaultSearchSource: 'youtube',
    searchParallel: false,
    skipOnError: true,
    autoVoiceReconnect: true,
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
export const DESTROY_TIMEOUT = 3_000;
/** Cap for automatic voice rejoin attempts after `WebSocketClosedEvent`. */
export const MAX_VOICE_RECONNECT_ATTEMPTS = 5;
/** Valid equalizer band range (0–14, per Lavalink). */
export const EQUALIZER_BAND_RANGE = { min: 0, max: 14, gainMin: -0.25, gainMax: 1 };
/** Player volume range (0–1000, per Lavalink). */
export const PLAYER_VOLUME_RANGE = { min: 0, max: 1000 };
/** Filter volume range (0.0–5.0, per Lavalink). */
export const FILTER_VOLUME_RANGE = { min: 0, max: 5 };
//# sourceMappingURL=constants.js.map