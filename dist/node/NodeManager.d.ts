/**
 * Junie — node registry & multi-node orchestration.
 *
 * The manager owns the node set, drives selection through the configured
 * strategy, and implements the parallel search fan-out used to dodge
 * upstream rate limits.
 */
import { Node } from './Node.js';
import type { NodeHost } from './Node.js';
import type { NodeSelectionStrategy } from './strategies/Strategy.js';
import type { SearchResult } from '../track/SearchResult.js';
import type { NodeOption, ResolvedReconnectOptions, ResolvedResumeOptions, ResolvedRestOptions, SearchQuery } from '../types/options.js';
/** Client-wide defaults forwarded to every node. */
export interface NodeManagerDefaults {
    reconnect?: Partial<ResolvedReconnectOptions>;
    resume?: Partial<ResolvedResumeOptions>;
    rest?: Partial<ResolvedRestOptions>;
}
export declare class NodeManager {
    private readonly nodes;
    private readonly host;
    private readonly strategy;
    private readonly logger;
    private readonly clientDefaults;
    constructor(host: NodeHost, strategy: NodeSelectionStrategy, clientDefaults?: NodeManagerDefaults);
    /** Register and connect a node. Throws on duplicate ids. */
    create(option: NodeOption): Node;
    /** Fetch a node by id. */
    get(id: string): Node | undefined;
    /** Whether a node id is registered. */
    has(id: string): boolean;
    /** Require a node by id (throws `NODE_NOT_FOUND`). */
    require(id: string): Node;
    /** All registered nodes. */
    list(): Node[];
    /** All currently connected nodes. */
    connected(): Node[];
    /** Number of registered nodes. */
    get size(): number;
    /** Connect every registered node. */
    connectAll(): void;
    /** Destroy a node (id or instance). */
    destroy(node: string | Node): void;
    /** Destroy everything (used by `Junie#destroy`). */
    destroyAll(): void;
    /**
     * Select the best node for a new player / search.
     * `voiceEndpoint` (from Discord) enables region-aware placement.
     */
    best(context?: {
        voiceEndpoint?: string | null;
        exclude?: ReadonlySet<string>;
    }): Node;
    /**
     * Search every connected node in parallel and resolve with the first
     * non-empty result. Remaining requests are left to settle quietly in the
     * background — their (short) timeouts make them self-cleaning.
     *
     * This is the standard mitigation when one node's upstream is rate-limited
     * and returns empty results instead of errors.
     */
    fanOutSearch<TRequester = unknown>(query: string | SearchQuery, requester?: TRequester): Promise<SearchResult<TRequester>>;
}
//# sourceMappingURL=NodeManager.d.ts.map