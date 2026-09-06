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

import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import {
  DEFAULTS,
  DEFAULT_CLIENT_NAME,
  DEFAULT_PORT,
  WEBSOCKET_PATH,
} from '../constants.js';
import { JunieError, JunieErrorCode } from '../errors.js';
import { RestManager } from './Rest.js';
import { DefaultPenaltyProvider } from './strategies/PenaltyStrategy.js';
import type { PenaltyProvider } from './strategies/Strategy.js';
import { buildSearchIdentifier, buildSearchResult, SearchResult } from '../track/SearchResult.js';
import type { NodeStats, NodeInfo, LavalinkEvent, PlayerState, ReadyPayload, WebSocketPayload } from '../types/api.js';
import type {
  NodeOption,
  ResolvedReconnectOptions,
  ResolvedResumeOptions,
  ResolvedRestOptions,
  SearchQuery,
  SearchSource,
  WebSocketFactory,
  WebSocketLike,
} from '../types/options.js';
import type { NodeEvents } from '../types/events.js';
import { applyJitter, backoffDelay } from '../utils/Helpers.js';
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

const HANDSHAKE_TIMEOUT = 10_000;

/** Default WebSocket transport (the `ws` package). */
export const defaultWebSocketFactory: WebSocketFactory = (url, headers) =>
  new WebSocket(url, { headers, handshakeTimeout: HANDSHAKE_TIMEOUT }) as unknown as WebSocketLike;

/**
 * Connection to one Lavalink server.
 */
export class Node {
  /** Unique node id. */
  public readonly id: string;
  /** Node option bag (host, port, secure, regions, ...). */
  public readonly options: NodeOption;
  /** REST transport for this node. */
  public readonly rest: RestManager;
  /** Regions this node prefers (empty = region-neutral). */
  public readonly regions: readonly string[];
  /** Reconnect behaviour. */
  public readonly reconnectOptions: ResolvedReconnectOptions;
  /** Resume behaviour. */
  public readonly resumeOptions: ResolvedResumeOptions;

  /** True once the `ready` op established a session. */
  public connected = false;
  /** True while a WebSocket dial is in progress. */
  public connecting = false;
  /** True after `destroy()`. */
  public destroyed = false;
  /** True if the current session was resumed from a previous one. */
  public resumed = false;
  /** Current Lavalink session id (null until `ready`). */
  public sessionId: string | null = null;
  /** Latest stats payload. */
  public stats: NodeStats | null = null;
  /** When the last stats op was received (epoch ms). */
  public lastStatsUpdate = 0;
  /** Lavalink server version, detected after `ready` (e.g. "4.0.8"). */
  public lavalinkVersion: string | null = null;
  /**
   * Expected Lavalink major version. Bumped when Junie gains support for a
   * new protocol major. Mismatches emit `versionMismatch` and log a warning
   * but never break the connection — Junie stays forward/backward tolerant.
   */
  public readonly expectedLavalinkMajor = 4;

  private readonly host: NodeHost;
  private readonly logger: Logger;
  private readonly events = new EventEmitter();
  private ws: WebSocketLike | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private immediateReconnect = false;
  private penaltyProvider: PenaltyProvider = new DefaultPenaltyProvider();
  private infoCache: NodeInfo | null = null;

  public constructor(host: NodeHost, options: NodeOption, clientDefaults: {
    reconnect?: Partial<ResolvedReconnectOptions>;
    resume?: Partial<ResolvedResumeOptions>;
    rest?: Partial<ResolvedRestOptions>;
  } = {}) {
    this.host = host;
    this.options = options;
    this.id = options.id;
    this.regions = options.regions ?? [];
    this.logger = host.logger.child(`Node:${this.id}`);
    // Node's EventEmitter throws ERR_UNHANDLED_ERROR when 'error' has no
    // listener; keep a silent default so client-level nodeError is the only
    // place errors need to be handled.
    this.events.on('error', () => undefined);

    this.reconnectOptions = {
      ...DEFAULTS.reconnect,
      ...clientDefaults.reconnect,
      ...options.reconnect,
    };
    this.resumeOptions = {
      ...DEFAULTS.resume,
      ...clientDefaults.resume,
      ...options.resume,
    };

    const port = options.port ?? DEFAULT_PORT;
    const protocol = options.secure ? 'https' : 'http';
    const path = (options.path ?? '').replace(/\/+$/, '');
    const origin = `${protocol}://${options.host}:${port}${path}`;
    const clientName = host.clientName || DEFAULT_CLIENT_NAME;

    const restOptions: ResolvedRestOptions = {
      timeout: DEFAULTS.rest.timeout,
      retries: DEFAULTS.rest.retries,
      headers: {},
      ...clientDefaults.rest,
    };

    this.rest = new RestManager({
      origin,
      baseUrl: `${origin}/v4`,
      authorization: options.authorization,
      clientName,
      options: restOptions,
      getSessionId: () => this.sessionId,
      onSessionInvalid: () => this.forceReconnect(),
    });
  }

  // -------------------------------------------------------------------------
  // Typed emitter surface
  // -------------------------------------------------------------------------

  /** Subscribe to a node event. Returns `this` for chaining. */
  public on<K extends keyof NodeEvents>(event: K, listener: NodeEvents[K]): this {
    this.events.on(event as string, listener as (...args: unknown[]) => void);
    return this;
  }

  /** Subscribe to the next occurrence of a node event. */
  public once<K extends keyof NodeEvents>(event: K, listener: NodeEvents[K]): this {
    this.events.once(event as string, listener as (...args: unknown[]) => void);
    return this;
  }

  /** Unsubscribe from a node event. */
  public off<K extends keyof NodeEvents>(event: K, listener?: NodeEvents[K]): this {
    if (listener) this.events.off(event as string, listener as (...args: unknown[]) => void);
    else this.events.removeAllListeners(event as string);
    return this;
  }

  private emitEvent<K extends keyof NodeEvents>(event: K, ...args: Parameters<NodeEvents[K]>): void {
    this.events.emit(event as string, ...(args as unknown[]));
  }

  // -------------------------------------------------------------------------
  // Connection lifecycle
  // -------------------------------------------------------------------------

  /** Open the WebSocket session (idempotent while connected/connecting). */
  public connect(): void {
    if (this.destroyed) throw new JunieError(JunieErrorCode.NODE_CONNECTION_FAILED, `Node "${this.id}" is destroyed.`);
    if (this.connected || this.connecting || this.ws) return;
    if (!this.host.userId) {
      throw new JunieError(
        JunieErrorCode.MISSING_USER_ID,
        'Cannot connect before a user id is known — pass userId to the Junie options or call Junie#init(userId).',
      );
    }

    const protocol = this.options.secure ? 'wss' : 'ws';
    const port = this.options.port ?? DEFAULT_PORT;
    const path = (this.options.path ?? '').replace(/\/+$/, '');
    const url = `${protocol}://${this.options.host}:${port}${path}${WEBSOCKET_PATH}`;

    const headers: Record<string, string> = {
      Authorization: this.options.authorization,
      'User-Id': this.host.userId,
      'Client-Name': this.host.clientName || DEFAULT_CLIENT_NAME,
    };
    if (this.sessionId) headers['Session-Id'] = this.sessionId;

    this.connecting = true;
    this.logger.debug('Opening websocket', { url, resuming: Boolean(this.sessionId) });

    const factory = this.host.webSocketFactory ?? defaultWebSocketFactory;
    const socket = factory(url, headers);
    this.ws = socket;

    socket.on('open', () => this.handleOpen());
    socket.on('message', (data) => this.handleMessage(String(data)));
    socket.on('close', (code, reason) => this.handleClose(code, reason));
    socket.on('error', (error) => this.handleError(error));
  }

  /**
   * Force an immediate re-handshake (used when REST reports our session is
   * gone — typically after a Lavalink restart). Players are rebuilt on the
   * new session by the client.
   */
  public forceReconnect(): void {
    if (this.destroyed || this.connecting) return;
    this.logger.warn('Session invalidated by the server — forcing a re-handshake.');
    this.emitEvent('sessionInvalid', this);
    this.immediateReconnect = true;
    if (this.ws) {
      try {
        this.ws.close(4009, 'Junie: session invalidated');
      } catch {
        // Transport may already be dead; the close handler takes over.
      }
    } else {
      this.connect();
    }
  }

  /** Gracefully disconnect and remove this node permanently. */
  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.connected = false;
    this.connecting = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.immediateReconnect = false;

    if (this.ws) {
      try {
        this.ws.close(1000, 'Junie: node destroyed');
      } catch {
        // Ignore — socket already dead.
      }
    }
    this.ws = null;
    this.logger.info('Node destroyed.');
    this.emitEvent('destroy', this);
    this.host.notifyDestroy(this);
    this.events.removeAllListeners();
  }

  private handleOpen(): void {
    this.logger.debug('WebSocket open — waiting for ready op.');
  }

  private async handleMessage(raw: string): Promise<void> {
    let payload: WebSocketPayload;
    try {
      payload = JSON.parse(raw) as WebSocketPayload;
    } catch (error) {
      this.handleError(error instanceof Error ? error : new Error(String(error)));
      return;
    }

    this.emitEvent('raw', this, payload);
    this.host.notifyRaw(this, payload);

    switch (payload.op) {
      case 'ready':
        await this.handleReady(payload);
        break;
      case 'stats':
        this.stats = payload;
        this.lastStatsUpdate = Date.now();
        this.emitEvent('stats', this, payload);
        this.host.notifyStats(this, payload);
        break;
      case 'playerUpdate':
        this.host.notifyPlayerUpdate(this, payload.guildId, payload.state);
        break;
      case 'event':
        this.host.notifyEvent(this, payload);
        break;
      default:
        this.logger.trace('Unknown op ignored', { op: (payload as { op?: string }).op });
    }
  }

  private async handleReady(payload: ReadyPayload): Promise<void> {
    this.sessionId = payload.sessionId;
    this.resumed = payload.resumed;
    this.connected = true;
    this.connecting = false;
    this.reconnectAttempts = 0;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;

    // Configure resuming for fresh sessions (resumed sessions keep their config).
    if (this.resumeOptions.enabled && !this.resumed) {
      try {
        await this.rest.updateSession(true, this.resumeOptions.timeout);
        this.logger.debug('Session resuming configured', { timeout: this.resumeOptions.timeout });
      } catch (error) {
        this.logger.warn(
          `Could not configure session resuming: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    this.infoCache = null; // Node may have upgraded/restarted between sessions.
    void this.detectVersion(); // fire-and-forget; never blocks the session.

    this.logger.info(
      this.resumed ? `Session resumed (${this.sessionId}).` : `Connected with new session ${this.sessionId}.`,
    );
    this.emitEvent('connect', this);
    if (this.resumed) this.emitEvent('resumed', this);
    this.host.notifyReady(this, this.resumed);
  }

  private handleClose(code: number, reason: unknown): void {
    const reasonText = String(reason ?? '');
    const wasConnected = this.connected;
    this.connected = false;
    this.connecting = false;
    this.ws = null;

    if (this.destroyed) return;

    this.logger.warn(`WebSocket closed (code ${code})${reasonText ? `: ${reasonText}` : ''}`);
    this.emitEvent('disconnect', this, { code, reason: reasonText });
    this.host.notifyDisconnect(this, code, reasonText);
    void wasConnected;

    this.scheduleReconnect();
  }

  private handleError(error: Error): void {
    this.logger.error(`WebSocket error: ${error.message}`);
    this.emitEvent('error', this, error);
    this.host.notifyError(this, error);
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;

    if (this.immediateReconnect) {
      this.immediateReconnect = false;
      this.reconnectAttempts = 0;
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        this.connect();
      }, 0);
      return;
    }

    this.reconnectAttempts += 1;
    if (this.reconnectAttempts > this.reconnectOptions.retries) {
      this.logger.error(
        `Giving up after ${this.reconnectOptions.retries} reconnect attempts. Call Node#connect() to retry manually.`,
      );
      this.emitEvent('reconnectFailed', this);
      this.host.notifyReconnectFailed(this);
      return;
    }

    let delay = backoffDelay(
      this.reconnectAttempts,
      this.reconnectOptions.initialDelay,
      this.reconnectOptions.multiplier,
      this.reconnectOptions.maxDelay,
    );
    if (this.reconnectOptions.jitter) delay = applyJitter(delay);

    this.logger.info(
      `Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.reconnectOptions.retries}).`,
    );
    this.emitEvent('reconnecting', this, { attempt: this.reconnectAttempts, delay });
    this.host.notifyReconnecting(this, this.reconnectAttempts, delay);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  /**
   * Ask the server for its version (`GET /version`), remember it, and emit
   * `versionMismatch` when the major does not match expectations. This is
   * Junie's early-warning radar for protocol drift: when Lavalink ships a
   * new protocol version, node versions in your logs make the upgrade path
   * obvious before anything misbehaves.
   */
  public async detectVersion(): Promise<string | null> {
    if (this.destroyed) return null;
    try {
      const version = (await this.rest.getVersion()).trim();
      this.lavalinkVersion = version || null;
      if (version && !version.startsWith(`${this.expectedLavalinkMajor}.`)) {
        this.logger.warn(
          `Lavalink server reports version "${version}" — Junie targets v4. ` +
            'Proceeding, but verify protocol compatibility (see PROTOCOL.md).',
        );
        this.emitEvent('versionMismatch', this, { version, expected: this.expectedLavalinkMajor });
      } else if (version) {
        this.logger.debug(`Lavalink version detected: ${version}`);
      }
      return this.lavalinkVersion;
    } catch {
      // `/version` is best-effort (older servers may not expose it).
      return null;
    }
  }

  // -------------------------------------------------------------------------
  // Search
  // -------------------------------------------------------------------------

  /**
   * Search / load tracks on this node.
   *
   * @param query Search text, URL, or structured query.
   * @param requester Attached to every resulting track.
   */
  public async search<TRequester = unknown>(
    query: string | SearchQuery,
    requester?: TRequester,
    defaults?: { source?: SearchSource },
  ): Promise<SearchResult<TRequester>> {
    const queryObject: SearchQuery = typeof query === 'string' ? { query } : query;
    const identifier = buildSearchIdentifier(
      queryObject.query,
      queryObject.source,
      defaults?.source,
    );
    const response = await this.rest.loadTracks(identifier, queryObject.extraQueryUrlParams);
    return buildSearchResult<TRequester>(response, this, requester);
  }

  // -------------------------------------------------------------------------
  // Introspection
  // -------------------------------------------------------------------------

  /** Node info (version, plugins). Cached per session. */
  public async getInfo(): Promise<NodeInfo> {
    if (!this.infoCache) this.infoCache = await this.rest.getInfo();
    return this.infoCache;
  }

  /** Names of the plugins installed on this node (best effort). */
  public async getPluginNames(): Promise<string[]> {
    try {
      const info = await this.getInfo();
      return (info.plugins ?? []).map((plugin) => plugin.name);
    } catch {
      return [];
    }
  }

  /** The reference penalty score of this node (lower = more attractive). */
  public penalty(voiceEndpoint?: string | null): number {
    return this.penaltyProvider.compute(this, voiceEndpoint);
  }

  /** True when stats arrived within the last 2 minutes. */
  get isHealthy(): boolean {
    if (!this.connected || !this.stats) return this.connected;
    return Date.now() - this.lastStatsUpdate < 120_000;
  }

  /** Penalties are computed by strategies; expose the provider for swapping. */
  public setPenaltyProvider(provider: PenaltyProvider): void {
    this.penaltyProvider = provider;
  }

  /** `"Node[eu-1 @ localhost:2333]"`. */
  public toString(): string {
    return `Node[${this.id} @ ${this.options.host}:${this.options.port ?? DEFAULT_PORT}]`;
  }
}
