/**
 * Junie — node registry & multi-node orchestration.
 *
 * The manager owns the node set, drives selection through the configured
 * strategy, and implements the parallel search fan-out used to dodge
 * upstream rate limits.
 */
import { JunieError, JunieErrorCode, TrackLoadError } from '../errors.js';
import { Node } from './Node.js';
export class NodeManager {
    nodes = new Map();
    host;
    strategy;
    logger;
    clientDefaults;
    constructor(host, strategy, clientDefaults = {}) {
        this.host = host;
        this.strategy = strategy;
        this.logger = host.logger.child('Nodes');
        this.clientDefaults = clientDefaults;
    }
    // -------------------------------------------------------------------------
    // Registry
    // -------------------------------------------------------------------------
    /** Register and connect a node. Throws on duplicate ids. */
    create(option) {
        if (this.nodes.has(option.id)) {
            throw new JunieError(JunieErrorCode.NODE_ALREADY_EXISTS, `A node with id "${option.id}" already exists.`, { id: option.id });
        }
        const node = new Node(this.host, option, this.clientDefaults);
        this.nodes.set(option.id, node);
        this.logger.debug(`Node "${option.id}" registered.`);
        return node;
    }
    /** Fetch a node by id. */
    get(id) {
        return this.nodes.get(id);
    }
    /** Whether a node id is registered. */
    has(id) {
        return this.nodes.has(id);
    }
    /** Require a node by id (throws `NODE_NOT_FOUND`). */
    require(id) {
        const node = this.nodes.get(id);
        if (!node) {
            throw new JunieError(JunieErrorCode.NODE_NOT_FOUND, `No node with id "${id}".`, { id });
        }
        return node;
    }
    /** All registered nodes. */
    list() {
        return [...this.nodes.values()];
    }
    /** All currently connected nodes. */
    connected() {
        return this.list().filter((node) => node.connected);
    }
    /** Number of registered nodes. */
    get size() {
        return this.nodes.size;
    }
    /** Connect every registered node. */
    connectAll() {
        for (const node of this.nodes.values())
            node.connect();
    }
    /** Destroy a node (id or instance). */
    destroy(node) {
        const target = typeof node === 'string' ? this.nodes.get(node) : node;
        if (!target)
            return;
        this.nodes.delete(target.id);
        target.destroy();
    }
    /** Destroy everything (used by `Junie#destroy`). */
    destroyAll() {
        for (const node of [...this.nodes.values()])
            this.destroy(node);
    }
    // -------------------------------------------------------------------------
    // Selection
    // -------------------------------------------------------------------------
    /**
     * Select the best node for a new player / search.
     * `voiceEndpoint` (from Discord) enables region-aware placement.
     */
    best(context) {
        return this.strategy.select(this.list(), context);
    }
    // -------------------------------------------------------------------------
    // Parallel search fan-out
    // -------------------------------------------------------------------------
    /**
     * Search every connected node in parallel and resolve with the first
     * non-empty result. Remaining requests are left to settle quietly in the
     * background — their (short) timeouts make them self-cleaning.
     *
     * This is the standard mitigation when one node's upstream is rate-limited
     * and returns empty results instead of errors.
     */
    async fanOutSearch(query, requester) {
        const nodes = this.connected();
        if (nodes.length === 0) {
            throw new JunieError(JunieErrorCode.NO_HEALTHY_NODES, 'No connected Lavalink node available for the search.');
        }
        if (nodes.length === 1) {
            return nodes[0].search(query, requester);
        }
        const queryObject = typeof query === 'string' ? { query } : query;
        return new Promise((resolve, reject) => {
            let settled = false;
            let completed = 0;
            let lastEmpty = null;
            let firstError = null;
            const finish = () => {
                if (settled)
                    return;
                if (lastEmpty) {
                    settled = true;
                    resolve(lastEmpty);
                }
                else {
                    settled = true;
                    reject(firstError instanceof Error
                        ? firstError
                        : new TrackLoadError('All nodes failed or returned no results.', { query: queryObject.query }));
                }
            };
            for (const node of nodes) {
                node
                    .search(query, requester)
                    .then((result) => {
                    completed += 1;
                    if (settled)
                        return;
                    if (!result.isEmpty) {
                        settled = true;
                        this.logger.debug(`Fan-out search won on node "${node.id}".`);
                        resolve(result);
                        return;
                    }
                    lastEmpty = result;
                    if (completed === nodes.length)
                        finish();
                })
                    .catch((error) => {
                    completed += 1;
                    if (!firstError)
                        firstError = error;
                    this.logger.debug(`Fan-out search failed on node "${node.id}".`, error);
                    if (!settled && completed === nodes.length)
                        finish();
                });
            }
        });
    }
}
//# sourceMappingURL=NodeManager.js.map