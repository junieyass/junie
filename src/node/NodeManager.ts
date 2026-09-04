/**
 * Junie — node registry & multi-node orchestration.
 *
 * The manager owns the node set, drives selection through the configured
 * strategy, and implements the parallel search fan-out used to dodge
 * upstream rate limits.
 */

import { JunieError, JunieErrorCode, TrackLoadError } from '../errors.js';
import { Node } from './Node.js';
import type { NodeHost } from './Node.js';
import type { NodeSelectionStrategy } from './strategies/Strategy.js';
import type { SearchResult } from '../track/SearchResult.js';
import type {
  NodeOption,
  ResolvedReconnectOptions,
  ResolvedResumeOptions,
  ResolvedRestOptions,
  SearchQuery,
} from '../types/options.js';
import type { Logger } from '../utils/Logger.js';

/** Client-wide defaults forwarded to every node. */
export interface NodeManagerDefaults {
  reconnect?: Partial<ResolvedReconnectOptions>;
  resume?: Partial<ResolvedResumeOptions>;
  rest?: Partial<ResolvedRestOptions>;
}

export class NodeManager {
  private readonly nodes = new Map<string, Node>();
  private readonly host: NodeHost;
  private readonly strategy: NodeSelectionStrategy;
  private readonly logger: Logger;
  private readonly clientDefaults: NodeManagerDefaults;

  public constructor(
    host: NodeHost,
    strategy: NodeSelectionStrategy,
    clientDefaults: NodeManagerDefaults = {},
  ) {
    this.host = host;
    this.strategy = strategy;
    this.logger = host.logger.child('Nodes');
    this.clientDefaults = clientDefaults;
  }

  // -------------------------------------------------------------------------
  // Registry
  // -------------------------------------------------------------------------

  /** Register and connect a node. Throws on duplicate ids. */
  public create(option: NodeOption): Node {
    if (this.nodes.has(option.id)) {
      throw new JunieError(
        JunieErrorCode.NODE_ALREADY_EXISTS,
        `A node with id "${option.id}" already exists.`,
        { id: option.id },
      );
    }
    const node = new Node(this.host, option, this.clientDefaults);
    this.nodes.set(option.id, node);
    this.logger.debug(`Node "${option.id}" registered.`);
    return node;
  }

  /** Fetch a node by id. */
  public get(id: string): Node | undefined {
    return this.nodes.get(id);
  }

  /** Whether a node id is registered. */
  public has(id: string): boolean {
    return this.nodes.has(id);
  }

  /** Require a node by id (throws `NODE_NOT_FOUND`). */
  public require(id: string): Node {
    const node = this.nodes.get(id);
    if (!node) {
      throw new JunieError(JunieErrorCode.NODE_NOT_FOUND, `No node with id "${id}".`, { id });
    }
    return node;
  }

  /** All registered nodes. */
  public list(): Node[] {
    return [...this.nodes.values()];
  }

  /** All currently connected nodes. */
  public connected(): Node[] {
    return this.list().filter((node) => node.connected);
  }

  /** Number of registered nodes. */
  get size(): number {
    return this.nodes.size;
  }

  /** Connect every registered node. */
  public connectAll(): void {
    for (const node of this.nodes.values()) node.connect();
  }

  /** Destroy a node (id or instance). */
  public destroy(node: string | Node): void {
    const target = typeof node === 'string' ? this.nodes.get(node) : node;
    if (!target) return;
    this.nodes.delete(target.id);
    target.destroy();
  }

  /** Destroy everything (used by `Junie#destroy`). */
  public destroyAll(): void {
    for (const node of [...this.nodes.values()]) this.destroy(node);
  }

  // -------------------------------------------------------------------------
  // Selection
  // -------------------------------------------------------------------------

  /**
   * Select the best node for a new player / search.
   * `voiceEndpoint` (from Discord) enables region-aware placement.
   */
  public best(context?: { voiceEndpoint?: string | null; exclude?: ReadonlySet<string> }): Node {
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
  public async fanOutSearch<TRequester = unknown>(
    query: string | SearchQuery,
    requester?: TRequester,
  ): Promise<SearchResult<TRequester>> {
    const nodes = this.connected();
    if (nodes.length === 0) {
      throw new JunieError(
        JunieErrorCode.NO_HEALTHY_NODES,
        'No connected Lavalink node available for the search.',
      );
    }
    if (nodes.length === 1) {
      return nodes[0]!.search<TRequester>(query, requester);
    }

    const queryObject: SearchQuery = typeof query === 'string' ? { query } : query;
    return new Promise<SearchResult<TRequester>>((resolve, reject) => {
      let settled = false;
      let completed = 0;
      let lastEmpty: SearchResult<TRequester> | null = null;
      let firstError: unknown = null;

      const finish = (): void => {
        if (settled) return;
        if (lastEmpty) {
          settled = true;
          resolve(lastEmpty);
        } else {
          settled = true;
          reject(
            firstError instanceof Error
              ? firstError
              : new TrackLoadError('All nodes failed or returned no results.', { query: queryObject.query }),
          );
        }
      };

      for (const node of nodes) {
        node
          .search<TRequester>(query, requester)
          .then((result) => {
            completed += 1;
            if (settled) return;
            if (!result.isEmpty) {
              settled = true;
              this.logger.debug(`Fan-out search won on node "${node.id}".`);
              resolve(result);
              return;
            }
            lastEmpty = result;
            if (completed === nodes.length) finish();
          })
          .catch((error) => {
            completed += 1;
            if (!firstError) firstError = error;
            this.logger.debug(`Fan-out search failed on node "${node.id}".`, error);
            if (!settled && completed === nodes.length) finish();
          });
      }
    });
  }
}
