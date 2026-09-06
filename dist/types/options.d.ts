/**
 * Junie — configuration options.
 */
import type { NodeSelectionStrategy } from '../node/strategies/Strategy.js';
import type { QueueStore } from '../queue/QueueStore.js';
import type { Logger } from '../utils/Logger.js';
import type { NodeStats } from './api.js';
/** Log verbosity of Junie's built-in logger. */
export type LogLevel = 'silent' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
/** Search sources with well-known Lavalink prefixes. */
export type SearchSource = 'youtube' | 'youtubeMusic' | 'soundcloud' | 'none'
/** Any custom prefix (e.g. LavaSrc's `spsearch:`) — pass the raw prefix. */
 | (string & {});
/** Query passed to `Junie#search` / `Node#search`. */
export interface SearchQuery {
    /** The search text or a direct URL. */
    query: string;
    /**
     * The source to search. Defaults to the client's `defaultSearchSource`.
     * Accepts well-known sources, `'none'` (raw identifier), or a custom
     * plugin prefix such as `'spsearch'`.
     */
    source?: SearchSource;
    /** Extra query-string parameters appended to `/v4/loadtracks`. */
    extraQueryUrlParams?: Record<string, string>;
    /**
     * If true, dispatch the search to every healthy node in parallel and
     * resolve with the first non-empty result (rate-limit resilience).
     */
    parallel?: boolean;
    /** Force a specific node (by id) for this search. */
    node?: string;
}
/** Reconnection behaviour for node WebSockets. */
export interface ReconnectOptions {
    /** Maximum reconnection attempts before giving up. Default: 10. */
    retries: number;
    /** Delay of the first attempt, in milliseconds. Default: 1000. */
    initialDelay: number;
    /** Upper bound for the computed delay, in milliseconds. Default: 60000. */
    maxDelay: number;
    /** Exponential growth factor. Default: 2. */
    multiplier: number;
    /** Spread retries by ±30% to avoid thundering herds. Default: true. */
    jitter: boolean;
}
/** Session resuming behaviour. */
export interface ResumeOptions {
    /** Enable resuming. Default: true. */
    enabled: boolean;
    /** How long Lavalink should hold the session, in seconds. Default: 60. */
    timeout: number;
}
/** REST behaviour. */
export interface RestOptions {
    /** Per-request timeout, in milliseconds. Default: 10000. */
    timeout: number;
    /** Retries for network errors and 5xx responses. Default: 2. */
    retries: number;
    /** Additional headers sent with every REST request. */
    headers?: Record<string, string>;
}
/** Connection of a single Lavalink node. */
export interface NodeOption {
    /** A unique, stable id for this node (e.g. "node-eu-1"). */
    id: string;
    /** Hostname of the Lavalink server. */
    host: string;
    /** Port. Default: 2333. */
    port?: number;
    /** The `Authorization` password. */
    authorization: string;
    /** Use `wss` / `https`. Default: false. */
    secure?: boolean;
    /** Base path prefix, for hosts served under e.g. `/lavalink`. Default: ''. */
    path?: string;
    /**
     * Voice regions this node serves well (e.g. `['europe']` or
     * `['eu-central']`). Used by the region-aware penalty strategy.
     */
    regions?: string[];
    /** Per-node override of {@link ResumeOptions}. */
    resume?: Partial<ResumeOptions>;
    /** Per-node override of {@link ReconnectOptions}. */
    reconnect?: Partial<ReconnectOptions>;
}
/** Options for `Junie#createPlayer`. */
export interface PlayerOptions {
    /** The guild the player belongs to. */
    guildId: string;
    /** The voice channel to join. */
    voiceChannelId: string;
    /** Default text channel for your bot to reply in (purely bookkeeping). */
    textChannelId?: string | null;
    /** Pin the player to a node id. Omit for automatic selection. */
    node?: string;
    /** Initial player volume (0–1000). Default: 100. */
    volume?: number;
    /** Self-deafen on join. Default: true. */
    selfDeaf?: boolean;
    /** Self-mute on join. Default: false. */
    selfMute?: boolean;
    /** Initial repeat mode. Default: 'off'. */
    repeatMode?: RepeatModeOption;
    /** Start with autoplay enabled. Default: false. */
    autoplay?: boolean;
}
/** Queue repeat modes. */
export type RepeatModeOption = 'off' | 'track' | 'queue';
/** Queue-related client options. */
export interface QueueOptions {
    /**
     * Persistence adapter. When set, queues are serialized on every mutation
     * and (optionally) restored when a player is re-created.
     */
    store?: QueueStore;
    /** Restore the persisted queue when a player is created. Default: false. */
    restore?: boolean;
    /** Maximum remembered previously-played tracks. Default: 50. */
    historyLimit?: number;
}
/** Autoplay resolver — returns tracks (or a search query) to continue with when the queue ends. */
export type AutoplayResolver<TRequester = unknown> = (player: import('../player/Player.js').Player<TRequester>, lastTrack: import('../track/Track.js').Track<TRequester>) => Promise<import('../track/Track.js').Track<TRequester>[] | SearchQuery>;
/**
 * A custom WebSocket transport for a node. Swap this via
 * `JunieOptions.webSocketFactory` to route Lavalink traffic through a proxy
 * or to instrument connections.
 */
export interface WebSocketLike {
    on(event: 'open', listener: () => void): unknown;
    on(event: 'message', listener: (data: unknown) => void): unknown;
    on(event: 'close', listener: (code: number, reason: unknown) => void): unknown;
    on(event: 'error', listener: (error: Error) => void): unknown;
    on(event: string, listener: (...args: never[]) => void): unknown;
    once(event: string, listener: (...args: never[]) => void): unknown;
    close(code?: number, reason?: string): void;
}
/**
 * Factory for the WebSocket transport of a node. Swap this to route Lavalink
 * traffic through a proxy or to instrument connections.
 */
export type WebSocketFactory = (url: string, headers: Record<string, string>) => WebSocketLike;
/** Player-wide defaults (volume, self-deaf, self-mute). */
export interface PlayerDefaults {
    volume: number;
    selfDeaf: boolean;
    selfMute: boolean;
}
/** Global Junie client options. */
export interface JunieOptions<TRequester = unknown> {
    /** Lavalink nodes to connect to. */
    nodes: NodeOption[];
    /**
     * Forwards Discord gateway op 4 (voice state update) requests to your
     * shard. Junie calls this when a player joins/leaves voice.
     */
    sendToShard: (guildId: string, payload: import('./api.js').VoiceGatewayPayload) => void | Promise<void>;
    /** The bot's user id. May instead be passed to `Junie#init`. */
    userId?: string;
    /**
     * Value of the `Client-Name` header sent to Lavalink. Default: "Junie/1.0.0".
     * Recommended format: "YourBot/1.2.3 (Junie/1.0.0)".
     */
    clientName?: string;
    /** Node selection strategy. Default: penalty-based least-load balancing. */
    strategy?: NodeSelectionStrategy;
    /** Default search source. Default: 'youtube'. */
    defaultSearchSource?: SearchSource;
    /** Search all nodes in parallel by default. Default: false. */
    searchParallel?: boolean;
    /** Skip to the next track when one fails to load. Default: true. */
    skipOnError?: boolean;
    /** Automatically rejoin voice when Discord closes the voice socket. Default: true. */
    autoVoiceReconnect?: boolean;
    /** How long `Player#connect` waits for Discord voice credentials. Default: 15000. */
    voiceConnectionTimeout?: number;
    /** Default resolver used by autoplay. See docs/queue-and-autoplay.md. */
    autoplayResolver?: AutoplayResolver<TRequester>;
    /** True when the bot should be auto-destroyed after leaving voice. Default: true. */
    destroyOnVoiceLeave?: boolean;
    /**
     * Automatically migrate players off a node whose WebSocket died onto the
     * best remaining connected node. Default: true.
     */
    autoFailover?: boolean;
    /** Resume / reconnect / REST behaviour (client-wide defaults). */
    resume?: Partial<ResumeOptions>;
    reconnect?: Partial<ReconnectOptions>;
    rest?: Partial<RestOptions>;
    /** Queue persistence configuration. */
    queue?: QueueOptions;
    /** Client-wide player defaults. */
    player?: Partial<PlayerDefaults>;
    /** Custom WebSocket transport factory. */
    webSocketFactory?: WebSocketFactory;
    /** Log level. Default: 'info'. */
    logLevel?: LogLevel;
    /** Fully custom logger (wins over `logLevel`). */
    logger?: Logger;
}
/** Merged, fully-populated reconnect options. */
export type ResolvedReconnectOptions = Required<ReconnectOptions>;
/** Merged, fully-populated resume options. */
export type ResolvedResumeOptions = Required<ResumeOptions>;
/** Merged, fully-populated REST options. */
export type ResolvedRestOptions = Required<Omit<RestOptions, 'headers'>> & {
    headers: Record<string, string>;
};
/** Statistics snapshot used by selection strategies (subset of NodeStats). */
export type StrategyStats = Pick<NodeStats, 'players' | 'playingPlayers' | 'cpu'> & Partial<Pick<NodeStats, 'frameStats'>>;
//# sourceMappingURL=options.d.ts.map