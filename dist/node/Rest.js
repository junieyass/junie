"use strict";
/**
 * Junie — Lavalink v4 REST transport.
 *
 * One RestManager per node. Provides:
 * - timeout enforcement (AbortSignal) and retries for transient failures
 * - structured `JunieRestError`s carrying Lavalink's error body
 * - automatic session-invalidation signalling when Lavalink answers 404 for
 *   our own session (e.g. after a node restart), so the node can re-handshake
 * - a public generic `request` for plugin endpoints (LavaLyrics, NodeLink, ...)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.RestManager = void 0;
const constants_js_1 = require("../constants.js");
const errors_js_1 = require("../errors.js");
const Helpers_js_1 = require("../utils/Helpers.js");
/** Default request timeout multiplier for search-style calls (they are slow). */
const SEARCH_TIMEOUT = 15_000;
class RestManager {
    deps;
    constructor(deps) {
        this.deps = deps;
    }
    // -------------------------------------------------------------------------
    // Generic transport
    // -------------------------------------------------------------------------
    /**
     * Perform a raw REST request against the node. Also usable for plugin
     * endpoints (`/v4/sessions/{id}/players/{guild}/track/lyrics`, ...).
     */
    async request(method, route, options = {}) {
        const base = options.rootRoute ? this.deps.origin : this.deps.baseUrl;
        const url = `${base}${route}${(0, Helpers_js_1.buildQueryString)(options.query ?? {})}`;
        const timeout = options.timeout ?? this.deps.options.timeout;
        const maxRetries = options.retries ?? this.deps.options.retries;
        const headers = {
            Authorization: this.deps.authorization,
            'Client-Name': this.deps.clientName,
            'User-Agent': `Junie/${constants_js_1.JUNIE_VERSION}`,
            ...this.deps.options.headers,
        };
        if (options.body !== undefined)
            headers['Content-Type'] = 'application/json';
        let attempt = 0;
        // One extra iteration beyond maxRetries.
        while (true) {
            attempt++;
            let response;
            try {
                response = await fetch(url, {
                    method,
                    headers,
                    body: options.body === undefined ? undefined : JSON.stringify(options.body),
                    signal: AbortSignal.timeout(timeout),
                });
            }
            catch (error) {
                if (attempt <= maxRetries) {
                    await (0, Helpers_js_1.sleep)(300 * attempt);
                    continue;
                }
                throw new errors_js_1.JunieRestError({
                    method,
                    path: route,
                    status: 0,
                    message: error instanceof Error ? error.message : String(error),
                    cause: error,
                });
            }
            // Retry transient server-side failures and rate limits.
            if ((response.status >= 500 || response.status === 429) && attempt <= maxRetries) {
                await (0, Helpers_js_1.sleep)(300 * attempt);
                continue;
            }
            const text = await response.text();
            if (!response.ok) {
                let lavalink;
                try {
                    const parsed = JSON.parse(text);
                    if (typeof parsed.status === 'number' && typeof parsed.message === 'string') {
                        lavalink = parsed;
                    }
                }
                catch {
                    // Not a Lavalink error body — keep raw text only.
                }
                // Session loss (e.g. Lavalink restarted and dropped its session store):
                // signal the node so it can re-handshake and rebuild players.
                if (response.status === 404 &&
                    !options.ignoreSessionInvalid &&
                    this.isSessionRoute(route)) {
                    this.deps.onSessionInvalid();
                }
                throw new errors_js_1.JunieRestError({
                    method,
                    path: route,
                    status: response.status,
                    message: lavalink?.message ?? (text.slice(0, 500) || `HTTP ${response.status}`),
                    body: text.slice(0, 2000),
                    lavalink,
                });
            }
            if (options.responseType === 'text' || text.length === 0) {
                return (text.length === 0 ? undefined : text);
            }
            try {
                return JSON.parse(text);
            }
            catch {
                return text;
            }
        }
    }
    isSessionRoute(route) {
        const sessionId = this.deps.getSessionId();
        return Boolean(sessionId) && route.includes(`/sessions/${sessionId}`);
    }
    // -------------------------------------------------------------------------
    // Track loading & decoding
    // -------------------------------------------------------------------------
    /** `GET /v4/loadtracks` — resolve a query / url into tracks. */
    loadTracks(identifier, extraQueryUrlParams) {
        return this.request('GET', '/loadtracks', {
            query: { identifier, ...extraQueryUrlParams },
            timeout: SEARCH_TIMEOUT,
        });
    }
    /** `GET /v4/decodetrack` — decode one base64 track. */
    decodeTrack(encoded) {
        return this.request('GET', '/decodetrack', {
            query: { track: encoded },
        });
    }
    /** `POST /v4/decodetracks` — decode many base64 tracks. */
    decodeTracks(encoded) {
        return this.request('POST', '/decodetracks', {
            body: encoded,
        });
    }
    // -------------------------------------------------------------------------
    // Session management
    // -------------------------------------------------------------------------
    /** `PATCH /v4/sessions/{id}` — configure resuming for this session. */
    updateSession(resuming, timeoutSeconds) {
        const sessionId = this.requireSession();
        return this.request('PATCH', `/sessions/${sessionId}`, {
            body: { resuming, timeout: timeoutSeconds },
            ignoreSessionInvalid: true,
        });
    }
    // -------------------------------------------------------------------------
    // Players
    // -------------------------------------------------------------------------
    /** `GET /v4/sessions/{id}/players` — all players of this session. */
    getPlayers() {
        const sessionId = this.requireSession();
        return this.request('GET', `/sessions/${sessionId}/players`);
    }
    /** `GET /v4/sessions/{id}/players/{guildId}` — one player. */
    getPlayer(guildId) {
        const sessionId = this.requireSession();
        return this.request('GET', `/sessions/${sessionId}/players/${guildId}`);
    }
    /** `PATCH /v4/sessions/{id}/players/{guildId}` — create/update a player. */
    updatePlayer(guildId, payload, noReplace = false) {
        const sessionId = this.requireSession();
        return this.request('PATCH', `/sessions/${sessionId}/players/${guildId}`, {
            body: payload,
            query: { noReplace: noReplace ? 'true' : undefined },
            // Session 404 during reconnect storms is handled upstream.
            ignoreSessionInvalid: true,
        });
    }
    /** `DELETE /v4/sessions/{id}/players/{guildId}` — destroy a player. */
    destroyPlayer(guildId) {
        const sessionId = this.requireSession();
        return this.request('DELETE', `/sessions/${sessionId}/players/${guildId}`, {
            ignoreSessionInvalid: true,
        });
    }
    // -------------------------------------------------------------------------
    // Node information
    // -------------------------------------------------------------------------
    /** `GET /v4/info` — version, build, plugins. */
    getInfo() {
        return this.request('GET', '/info');
    }
    /** `GET /v4/stats` — REST snapshot of node statistics. */
    getStats() {
        return this.request('GET', '/stats');
    }
    /** `GET /version` — raw Lavalink version string (served at the server root). */
    getVersion() {
        return this.request('GET', '/version', {
            responseType: 'text',
            rootRoute: true,
        });
    }
    /** `GET /v4/routeplanner/status` — IP route planner status. */
    getRoutePlannerStatus() {
        return this.request('GET', '/routeplanner/status');
    }
    /** `POST /v4/routeplanner/free` — release failed route planner addresses. */
    freeFailedAddresses(addresses) {
        return this.request('POST', '/routeplanner/free', {
            body: { addresses },
        });
    }
    // -------------------------------------------------------------------------
    requireSession() {
        const sessionId = this.deps.getSessionId();
        if (!sessionId) {
            throw new errors_js_1.JunieRestError({
                method: 'SESSION',
                path: '',
                status: 0,
                message: 'No session available yet — the node WebSocket is not connected.',
            });
        }
        return sessionId;
    }
}
exports.RestManager = RestManager;
//# sourceMappingURL=Rest.js.map