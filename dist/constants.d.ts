/**
 * Junie — library-wide constants.
 */
import type { SearchSource } from './types/options.js';
/** Junie's semantic version. */
export declare const JUNIE_VERSION = "1.0.0";
/** Value sent as the `Client-Name` WebSocket/REST header by default. */
export declare const DEFAULT_CLIENT_NAME = "Junie/1.0.0";
/** Default Lavalink port. */
export declare const DEFAULT_PORT = 2333;
/** REST base path of the Lavalink v4 API. */
export declare const REST_BASE = "/v4";
/** WebSocket endpoint of the Lavalink v4 API. */
export declare const WEBSOCKET_PATH = "/v4/websocket";
/** Discord gateway opcode for voice state update requests. */
export declare const GATEWAY_VOICE_STATE_OPCODE = 4;
/** Well-known source prefixes understood by stock Lavalink v4. */
export declare const SOURCE_PREFIXES: Record<string, string>;
/** Default `JunieOptions`. */
export declare const DEFAULTS: {
    readonly logLevel: "info";
    readonly defaultSearchSource: SearchSource;
    readonly searchParallel: false;
    readonly skipOnError: true;
    readonly autoVoiceReconnect: true;
    readonly voiceConnectionTimeout: 15000;
    readonly rest: {
        timeout: number;
        retries: number;
    };
    readonly reconnect: {
        retries: number;
        initialDelay: number;
        maxDelay: number;
        multiplier: number;
        jitter: true;
    };
    readonly resume: {
        enabled: true;
        timeout: number;
    };
    readonly queue: {
        readonly restore: false;
        readonly historyLimit: 50;
    };
    readonly player: {
        readonly volume: 100;
        readonly selfDeaf: true;
        readonly selfMute: false;
    };
};
/**
 * Deterministic force-cleanup budget for `Player#destroy`, in milliseconds.
 * Prevents zombie players when the node is unreachable.
 */
export declare const DESTROY_TIMEOUT = 3000;
/** Cap for automatic voice rejoin attempts after `WebSocketClosedEvent`. */
export declare const MAX_VOICE_RECONNECT_ATTEMPTS = 5;
/** Valid equalizer band range (0–14, per Lavalink). */
export declare const EQUALIZER_BAND_RANGE: {
    readonly min: 0;
    readonly max: 14;
    readonly gainMin: -0.25;
    readonly gainMax: 1;
};
/** Player volume range (0–1000, per Lavalink). */
export declare const PLAYER_VOLUME_RANGE: {
    readonly min: 0;
    readonly max: 1000;
};
/** Filter volume range (0.0–5.0, per Lavalink). */
export declare const FILTER_VOLUME_RANGE: {
    readonly min: 0;
    readonly max: 5;
};
//# sourceMappingURL=constants.d.ts.map