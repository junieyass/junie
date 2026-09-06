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
import type { ResolvedRestOptions } from '../types/options.js';
import { APITrack, APIPlayer, LoadTracksResponse, NodeInfo, RoutePlannerStatus, UpdatePlayerPayload, NodeStats } from '../types/api.js';
/** Dependencies injected by the owning {@link Node}. */
export interface RestDependencies {
    /** Server origin, e.g. `http://localhost:2333`. */
    origin: string;
    /** REST base URL, e.g. `http://localhost:2333/v4`. */
    baseUrl: string;
    /** The `Authorization` password. */
    authorization: string;
    /** Value for the `Client-Name` header. */
    clientName: string;
    /** Fully resolved REST options. */
    options: ResolvedRestOptions;
    /** Returns the current WebSocket session id, if any. */
    getSessionId: () => string | null;
    /** Invoked when a session-scoped call returned 404 for our session. */
    onSessionInvalid: () => void;
}
export interface RequestOptions {
    /** JSON body (serialized automatically). */
    body?: unknown;
    /** Extra query parameters. */
    query?: Record<string, string | undefined>;
    /** Override the client-wide timeout (ms). */
    timeout?: number;
    /** Override the client-wide retry count. */
    retries?: number;
    /** Parse the response as text instead of JSON. */
    responseType?: 'json' | 'text';
    /** Skip session-404 invalidation handling (internal). */
    ignoreSessionInvalid?: boolean;
    /** Resolve the route against the server origin instead of `/v4`. */
    rootRoute?: boolean;
}
export declare class RestManager {
    private readonly deps;
    constructor(deps: RestDependencies);
    /**
     * Perform a raw REST request against the node. Also usable for plugin
     * endpoints (`/v4/sessions/{id}/players/{guild}/track/lyrics`, ...).
     */
    request<T = unknown>(method: string, route: string, options?: RequestOptions): Promise<T>;
    private isSessionRoute;
    /** `GET /v4/loadtracks` — resolve a query / url into tracks. */
    loadTracks(identifier: string, extraQueryUrlParams?: Record<string, string>): Promise<LoadTracksResponse>;
    /**
     * `GET /v4/decodetrack` — decode one base64 track.
     * (Verified against Lavalink 4.2.2: the route is `/decodetrack` and it
     * binds both `encodedTrack` and `track` query names; we send both
     * spellings' modern form.)
     */
    decodeTrack(encoded: string): Promise<APITrack>;
    /** `POST /v4/decodetracks` — decode many base64 tracks (JSON array body). */
    decodeTracks(encoded: string[]): Promise<APITrack[]>;
    /** `PATCH /v4/sessions/{id}` — configure resuming for this session. */
    updateSession(resuming: boolean, timeoutSeconds: number): Promise<unknown>;
    /** `GET /v4/sessions/{id}/players` — all players of this session. */
    getPlayers(): Promise<APIPlayer[]>;
    /** `GET /v4/sessions/{id}/players/{guildId}` — one player. */
    getPlayer(guildId: string): Promise<APIPlayer>;
    /** `PATCH /v4/sessions/{id}/players/{guildId}` — create/update a player. */
    updatePlayer(guildId: string, payload: UpdatePlayerPayload, noReplace?: boolean): Promise<APIPlayer>;
    /** `DELETE /v4/sessions/{id}/players/{guildId}` — destroy a player. */
    destroyPlayer(guildId: string): Promise<unknown>;
    /** `GET /v4/info` — version, build, plugins. */
    getInfo(): Promise<NodeInfo>;
    /** `GET /v4/stats` — REST snapshot of node statistics. */
    getStats(): Promise<NodeStats>;
    /** `GET /version` — raw Lavalink version string (served at the server root). */
    getVersion(): Promise<string>;
    /** `GET /v4/routeplanner/status` — IP route planner status. */
    getRoutePlannerStatus(): Promise<RoutePlannerStatus | null>;
    /** `POST /v4/routeplanner/free` — release failed route planner addresses. */
    freeFailedAddresses(addresses: string[]): Promise<unknown>;
    private requireSession;
}
//# sourceMappingURL=Rest.d.ts.map