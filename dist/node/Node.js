"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Node = exports.defaultWebSocketFactory = void 0;
const node_events_1 = require("node:events");
const ws_1 = __importDefault(require("ws"));
const constants_js_1 = require("../constants.js");
const errors_js_1 = require("../errors.js");
const Rest_js_1 = require("./Rest.js");
const PenaltyStrategy_js_1 = require("./strategies/PenaltyStrategy.js");
const SearchResult_js_1 = require("../track/SearchResult.js");
const Helpers_js_1 = require("../utils/Helpers.js");
const HANDSHAKE_TIMEOUT = 10_000;
/** Default WebSocket transport (the `ws` package). */
const defaultWebSocketFactory = (url, headers) => new ws_1.default(url, { headers, handshakeTimeout: HANDSHAKE_TIMEOUT });
exports.defaultWebSocketFactory = defaultWebSocketFactory;
/**
 * Connection to one Lavalink server.
 */
class Node {
    /** Unique node id. */
    id;
    /** Node option bag (host, port, secure, regions, ...). */
    options;
    /** REST transport for this node. */
    rest;
    /** Regions this node prefers (empty = region-neutral). */
    regions;
    /** Reconnect behaviour. */
    reconnectOptions;
    /** Resume behaviour. */
    resumeOptions;
    /** True once the `ready` op established a session. */
    connected = false;
    /** True while a WebSocket dial is in progress. */
    connecting = false;
    /** True after `destroy()`. */
    destroyed = false;
    /** True if the current session was resumed from a previous one. */
    resumed = false;
    /** Current Lavalink session id (null until `ready`). */
    sessionId = null;
    /** Latest stats payload. */
    stats = null;
    /** When the last stats op was received (epoch ms). */
    lastStatsUpdate = 0;
    /** Lavalink server version, detected after `ready` (e.g. "4.0.8"). */
    lavalinkVersion = null;
    /**
     * Expected Lavalink major version. Bumped when Junie gains support for a
     * new protocol major. Mismatches emit `versionMismatch` and log a warning
     * but never break the connection — Junie stays forward/backward tolerant.
     */
    expectedLavalinkMajor = 4;
    host;
    logger;
    events = new node_events_1.EventEmitter();
    ws = null;
    reconnectAttempts = 0;
    reconnectTimer = null;
    immediateReconnect = false;
    penaltyProvider = new PenaltyStrategy_js_1.DefaultPenaltyProvider();
    infoCache = null;
    constructor(host, options, clientDefaults = {}) {
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
            ...constants_js_1.DEFAULTS.reconnect,
            ...clientDefaults.reconnect,
            ...options.reconnect,
        };
        this.resumeOptions = {
            ...constants_js_1.DEFAULTS.resume,
            ...clientDefaults.resume,
            ...options.resume,
        };
        const port = options.port ?? constants_js_1.DEFAULT_PORT;
        const protocol = options.secure ? 'https' : 'http';
        const path = (options.path ?? '').replace(/\/+$/, '');
        const origin = `${protocol}://${options.host}:${port}${path}`;
        const clientName = host.clientName || constants_js_1.DEFAULT_CLIENT_NAME;
        const restOptions = {
            timeout: constants_js_1.DEFAULTS.rest.timeout,
            retries: constants_js_1.DEFAULTS.rest.retries,
            headers: {},
            ...clientDefaults.rest,
        };
        this.rest = new Rest_js_1.RestManager({
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
    on(event, listener) {
        this.events.on(event, listener);
        return this;
    }
    /** Subscribe to the next occurrence of a node event. */
    once(event, listener) {
        this.events.once(event, listener);
        return this;
    }
    /** Unsubscribe from a node event. */
    off(event, listener) {
        if (listener)
            this.events.off(event, listener);
        else
            this.events.removeAllListeners(event);
        return this;
    }
    emitEvent(event, ...args) {
        this.events.emit(event, ...args);
    }
    // -------------------------------------------------------------------------
    // Connection lifecycle
    // -------------------------------------------------------------------------
    /** Open the WebSocket session (idempotent while connected/connecting). */
    connect() {
        if (this.destroyed)
            throw new errors_js_1.JunieError(errors_js_1.JunieErrorCode.NODE_CONNECTION_FAILED, `Node "${this.id}" is destroyed.`);
        if (this.connected || this.connecting || this.ws)
            return;
        if (!this.host.userId) {
            throw new errors_js_1.JunieError(errors_js_1.JunieErrorCode.MISSING_USER_ID, 'Cannot connect before a user id is known — pass userId to the Junie options or call Junie#init(userId).');
        }
        const protocol = this.options.secure ? 'wss' : 'ws';
        const port = this.options.port ?? constants_js_1.DEFAULT_PORT;
        const path = (this.options.path ?? '').replace(/\/+$/, '');
        const url = `${protocol}://${this.options.host}:${port}${path}${constants_js_1.WEBSOCKET_PATH}`;
        const headers = {
            Authorization: this.options.authorization,
            'User-Id': this.host.userId,
            'Client-Name': this.host.clientName || constants_js_1.DEFAULT_CLIENT_NAME,
        };
        if (this.sessionId)
            headers['Session-Id'] = this.sessionId;
        this.connecting = true;
        this.logger.debug('Opening websocket', { url, resuming: Boolean(this.sessionId) });
        const factory = this.host.webSocketFactory ?? exports.defaultWebSocketFactory;
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
    forceReconnect() {
        if (this.destroyed || this.connecting)
            return;
        this.logger.warn('Session invalidated by the server — forcing a re-handshake.');
        this.emitEvent('sessionInvalid', this);
        this.immediateReconnect = true;
        if (this.ws) {
            try {
                this.ws.close(4009, 'Junie: session invalidated');
            }
            catch {
                // Transport may already be dead; the close handler takes over.
            }
        }
        else {
            this.connect();
        }
    }
    /** Gracefully disconnect and remove this node permanently. */
    destroy() {
        if (this.destroyed)
            return;
        this.destroyed = true;
        this.connected = false;
        this.connecting = false;
        if (this.reconnectTimer)
            clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
        this.immediateReconnect = false;
        if (this.ws) {
            try {
                this.ws.close(1000, 'Junie: node destroyed');
            }
            catch {
                // Ignore — socket already dead.
            }
        }
        this.ws = null;
        this.logger.info('Node destroyed.');
        this.emitEvent('destroy', this);
        this.host.notifyDestroy(this);
        this.events.removeAllListeners();
    }
    handleOpen() {
        this.logger.debug('WebSocket open — waiting for ready op.');
    }
    async handleMessage(raw) {
        let payload;
        try {
            payload = JSON.parse(raw);
        }
        catch (error) {
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
                this.logger.trace('Unknown op ignored', { op: payload.op });
        }
    }
    async handleReady(payload) {
        this.sessionId = payload.sessionId;
        this.resumed = payload.resumed;
        this.connected = true;
        this.connecting = false;
        this.reconnectAttempts = 0;
        if (this.reconnectTimer)
            clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
        // Configure resuming for fresh sessions (resumed sessions keep their config).
        if (this.resumeOptions.enabled && !this.resumed) {
            try {
                await this.rest.updateSession(true, this.resumeOptions.timeout);
                this.logger.debug('Session resuming configured', { timeout: this.resumeOptions.timeout });
            }
            catch (error) {
                this.logger.warn(`Could not configure session resuming: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
        this.infoCache = null; // Node may have upgraded/restarted between sessions.
        void this.detectVersion(); // fire-and-forget; never blocks the session.
        this.logger.info(this.resumed ? `Session resumed (${this.sessionId}).` : `Connected with new session ${this.sessionId}.`);
        this.emitEvent('connect', this);
        if (this.resumed)
            this.emitEvent('resumed', this);
        this.host.notifyReady(this, this.resumed);
    }
    handleClose(code, reason) {
        const reasonText = String(reason ?? '');
        const wasConnected = this.connected;
        this.connected = false;
        this.connecting = false;
        this.ws = null;
        if (this.destroyed)
            return;
        this.logger.warn(`WebSocket closed (code ${code})${reasonText ? `: ${reasonText}` : ''}`);
        this.emitEvent('disconnect', this, { code, reason: reasonText });
        this.host.notifyDisconnect(this, code, reasonText);
        void wasConnected;
        this.scheduleReconnect();
    }
    handleError(error) {
        this.logger.error(`WebSocket error: ${error.message}`);
        this.emitEvent('error', this, error);
        this.host.notifyError(this, error);
    }
    scheduleReconnect() {
        if (this.reconnectTimer)
            return;
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
            this.logger.error(`Giving up after ${this.reconnectOptions.retries} reconnect attempts. Call Node#connect() to retry manually.`);
            this.emitEvent('reconnectFailed', this);
            this.host.notifyReconnectFailed(this);
            return;
        }
        let delay = (0, Helpers_js_1.backoffDelay)(this.reconnectAttempts, this.reconnectOptions.initialDelay, this.reconnectOptions.multiplier, this.reconnectOptions.maxDelay);
        if (this.reconnectOptions.jitter)
            delay = (0, Helpers_js_1.applyJitter)(delay);
        this.logger.info(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.reconnectOptions.retries}).`);
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
    async detectVersion() {
        if (this.destroyed)
            return null;
        try {
            const version = (await this.rest.getVersion()).trim();
            this.lavalinkVersion = version || null;
            if (version && !version.startsWith(`${this.expectedLavalinkMajor}.`)) {
                this.logger.warn(`Lavalink server reports version "${version}" — Junie targets v4. ` +
                    'Proceeding, but verify protocol compatibility (see PROTOCOL.md).');
                this.emitEvent('versionMismatch', this, { version, expected: this.expectedLavalinkMajor });
            }
            else if (version) {
                this.logger.debug(`Lavalink version detected: ${version}`);
            }
            return this.lavalinkVersion;
        }
        catch {
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
    async search(query, requester, defaults) {
        const queryObject = typeof query === 'string' ? { query } : query;
        const identifier = (0, SearchResult_js_1.buildSearchIdentifier)(queryObject.query, queryObject.source, defaults?.source);
        const response = await this.rest.loadTracks(identifier, queryObject.extraQueryUrlParams);
        return (0, SearchResult_js_1.buildSearchResult)(response, this, requester);
    }
    // -------------------------------------------------------------------------
    // Introspection
    // -------------------------------------------------------------------------
    /** Node info (version, plugins). Cached per session. */
    async getInfo() {
        if (!this.infoCache)
            this.infoCache = await this.rest.getInfo();
        return this.infoCache;
    }
    /** Names of the plugins installed on this node (best effort). */
    async getPluginNames() {
        try {
            const info = await this.getInfo();
            return (info.plugins ?? []).map((plugin) => plugin.name);
        }
        catch {
            return [];
        }
    }
    /** The reference penalty score of this node (lower = more attractive). */
    penalty(voiceEndpoint) {
        return this.penaltyProvider.compute(this, voiceEndpoint);
    }
    /** True when stats arrived within the last 2 minutes. */
    get isHealthy() {
        if (!this.connected || !this.stats)
            return this.connected;
        return Date.now() - this.lastStatsUpdate < 120_000;
    }
    /** Penalties are computed by strategies; expose the provider for swapping. */
    setPenaltyProvider(provider) {
        this.penaltyProvider = provider;
    }
    /** `"Node[eu-1 @ localhost:2333]"`. */
    toString() {
        return `Node[${this.id} @ ${this.options.host}:${this.options.port ?? constants_js_1.DEFAULT_PORT}]`;
    }
}
exports.Node = Node;
//# sourceMappingURL=Node.js.map