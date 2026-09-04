/**
 * Junie — a single Lavalink node connection.
 *
 * A Node owns:
 * - the WebSocket session (`/v4/websocket`) with handshake headers
 *   (`Authorization`, `User-Id`, `Client-Name`, `Session-Id`)
 * - session resuming (PATCH /v4/sessions/{id} right after `ready`)
 * - resilient reconnection with exponential backoff and jitter
 * - statistics used by load balancing
 * - a REST manager for all player/track operations
 *
 * The Node never touches players itself; it reports everything to its host
 * (the Junie client) through the {@link NodeHost} interface, which keeps
 * this layer testable and decoupled.
 */
import { RestManager } from './Rest.js';
import type { PenaltyProvider } from './strategies/Strategy.js';
import { SearchResult } from '../track/SearchResult.js';
import type { NodeStats, NodeInfo, LavalinkEvent, PlayerState, WebSocketPayload } from '../types/api.js';
import type { NodeOption, ResolvedReconnectOptions, ResolvedResumeOptions, ResolvedRestOptions, SearchQuery, SearchSource, WebSocketFactory } from '../types/options.js';
import type { NodeEvents } from '../types/events.js';
import type { Logger } from '../utils/Logger.js';
/** Everything a Node needs from its owning client (implemented by Junie). */
export interface NodeHost {
    readonly userId: string;
    readonly clientName: string;
    readonly logger: Logger;
    readonly webSocketFactory?: WebSocketFactory;
    notifyReady(node: Node, resumed: boolean): void;
    notifyStats(node: Node, stats: NodeStats): void;
    notifyPlayerUpdate(node: Node, guildId: string, state: PlayerState): void;
    notifyEvent(node: Node, event: LavalinkEvent): void;
    notifyDisconnect(node: Node, code: number, reason: string): void;
    notifyError(node: Node, error: Error): void;
    notifyReconnecting(node: Node, attempt: number, delay: number): void;
    notifyReconnectFailed(node: Node): void;
    notifyDestroy(node: Node): void;
    notifyRaw(node: Node, payload: WebSocketPayload): void;
}
/** Default WebSocket transport (the `ws` package). */
export declare const defaultWebSocketFactory: WebSocketFactory;
/**
 * Connection to one Lavalink server.
 */
export declare class Node {
    /** Unique node id. */
    readonly id: string;
    /** Node option bag (host, port, secure, regions, ...). */
    readonly options: NodeOption;
    /** REST transport for this node. */
    readonly rest: RestManager;
    /** Regions this node prefers (empty = region-neutral). */
    readonly regions: readonly string[];
    /** Reconnect behaviour. */
    readonly reconnectOptions: ResolvedReconnectOptions;
    /** Resume behaviour. */
    readonly resumeOptions: ResolvedResumeOptions;
    /** True once the `ready` op established a session. */
    connected: boolean;
    /** True while a WebSocket dial is in progress. */
    connecting: boolean;
    /** True after `destroy()`. */
    destroyed: boolean;
    /** True if the current session was resumed from a previous one. */
    resumed: boolean;
    /** Current Lavalink session id (null until `ready`). */
    sessionId: string | null;
    /** Latest stats payload. */
    stats: NodeStats | null;
    /** When the last stats op was received (epoch ms). */
    lastStatsUpdate: number;
    private readonly host;
    private readonly logger;
    private readonly events;
    private ws;
    private reconnectAttempts;
    private reconnectTimer;
    private immediateReconnect;
    private penaltyProvider;
    private infoCache;
    constructor(host: NodeHost, options: NodeOption, clientDefaults?: {
        reconnect?: Partial<ResolvedReconnectOptions>;
        resume?: Partial<ResolvedResumeOptions>;
        rest?: Partial<ResolvedRestOptions>;
    });
    /** Subscribe to a node event. Returns `this` for chaining. */
    on<K extends keyof NodeEvents>(event: K, listener: NodeEvents[K]): this;
    /** Subscribe to the next occurrence of a node event. */
    once<K extends keyof NodeEvents>(event: K, listener: NodeEvents[K]): this;
    /** Unsubscribe from a node event. */
    off<K extends keyof NodeEvents>(event: K, listener?: NodeEvents[K]): this;
    private emitEvent;
    /** Open the WebSocket session (idempotent while connected/connecting). */
    connect(): void;
    /**
     * Force an immediate re-handshake (used when REST reports our session is
     * gone — typically after a Lavalink restart). Players are rebuilt on the
     * new session by the client.
     */
    forceReconnect(): void;
    /** Gracefully disconnect and remove this node permanently. */
    destroy(): void;
    private handleOpen;
    private handleMessage;
    private handleReady;
    private handleClose;
    private handleError;
    private scheduleReconnect;
    /**
     * Search / load tracks on this node.
     *
     * @param query Search text, URL, or structured query.
     * @param requester Attached to every resulting track.
     */
    search<TRequester = unknown>(query: string | SearchQuery, requester?: TRequester, defaults?: {
        source?: SearchSource;
    }): Promise<SearchResult<TRequester>>;
    /** Node info (version, plugins). Cached per session. */
    getInfo(): Promise<NodeInfo>;
    /** Names of the plugins installed on this node (best effort). */
    getPluginNames(): Promise<string[]>;
    /** The reference penalty score of this node (lower = more attractive). */
    penalty(voiceEndpoint?: string | null): number;
    /** True when stats arrived within the last 2 minutes. */
    get isHealthy(): boolean;
    /** Penalties are computed by strategies; expose the provider for swapping. */
    setPenaltyProvider(provider: PenaltyProvider): void;
    /** `"Node[eu-1 @ localhost:2333]"`. */
    toString(): string;
}
//# sourceMappingURL=Node.d.ts.map