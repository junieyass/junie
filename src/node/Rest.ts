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

import { JUNIE_VERSION } from '../constants.js';
import { JunieRestError } from '../errors.js';
import type { ResolvedRestOptions } from '../types/options.js';
import {
  APITrack,
  APIPlayer,
  LavalinkErrorBody,
  LoadTracksResponse,
  NodeInfo,
  RoutePlannerStatus,
  UpdatePlayerPayload,
  NodeStats,
} from '../types/api.js';
import { buildQueryString, sleep } from '../utils/Helpers.js';

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

/** Default request timeout multiplier for search-style calls (they are slow). */
const SEARCH_TIMEOUT = 15_000;

export class RestManager {
  private readonly deps: RestDependencies;

  public constructor(deps: RestDependencies) {
    this.deps = deps;
  }

  // -------------------------------------------------------------------------
  // Generic transport
  // -------------------------------------------------------------------------

  /**
   * Perform a raw REST request against the node. Also usable for plugin
   * endpoints (`/v4/sessions/{id}/players/{guild}/track/lyrics`, ...).
   */
  public async request<T = unknown>(
    method: string,
    route: string,
    options: RequestOptions = {},
  ): Promise<T> {
    const base = options.rootRoute ? this.deps.origin : this.deps.baseUrl;
    const url = `${base}${route}${buildQueryString(options.query ?? {})}`;
    const timeout = options.timeout ?? this.deps.options.timeout;
    const maxRetries = options.retries ?? this.deps.options.retries;
    const headers: Record<string, string> = {
      Authorization: this.deps.authorization,
      'Client-Name': this.deps.clientName,
      'User-Agent': `Junie/${JUNIE_VERSION}`,
      ...this.deps.options.headers,
    };
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';

    let attempt = 0;
    // One extra iteration beyond maxRetries.
    while (true) {
      attempt++;
      let response: Response;
      try {
        response = await fetch(url, {
          method,
          headers,
          body: options.body === undefined ? undefined : JSON.stringify(options.body),
          signal: AbortSignal.timeout(timeout),
        });
      } catch (error) {
        if (attempt <= maxRetries) {
          await sleep(300 * attempt);
          continue;
        }
        throw new JunieRestError({
          method,
          path: route,
          status: 0,
          message: error instanceof Error ? error.message : String(error),
          cause: error,
        });
      }

      // Retry transient server-side failures and rate limits.
      if ((response.status >= 500 || response.status === 429) && attempt <= maxRetries) {
        await sleep(300 * attempt);
        continue;
      }

      const text = await response.text();

      if (!response.ok) {
        let lavalink: LavalinkErrorBody | undefined;
        try {
          const parsed = JSON.parse(text) as LavalinkErrorBody;
          if (typeof parsed.status === 'number' && typeof parsed.message === 'string') {
            lavalink = parsed;
          }
        } catch {
          // Not a Lavalink error body — keep raw text only.
        }

        // Session loss (e.g. Lavalink restarted and dropped its session store):
        // signal the node so it can re-handshake and rebuild players.
        if (
          response.status === 404 &&
          !options.ignoreSessionInvalid &&
          this.isSessionRoute(route)
        ) {
          this.deps.onSessionInvalid();
        }

        throw new JunieRestError({
          method,
          path: route,
          status: response.status,
          message: lavalink?.message ?? (text.slice(0, 500) || `HTTP ${response.status}`),
          body: text.slice(0, 2000),
          lavalink,
        });
      }

      if (options.responseType === 'text' || text.length === 0) {
        return (text.length === 0 ? undefined : text) as T;
      }
      try {
        return JSON.parse(text) as T;
      } catch {
        return text as T;
      }
    }
  }

  private isSessionRoute(route: string): boolean {
    const sessionId = this.deps.getSessionId();
    return Boolean(sessionId) && route.includes(`/sessions/${sessionId}`);
  }

  // -------------------------------------------------------------------------
  // Track loading & decoding
  // -------------------------------------------------------------------------

  /** `GET /v4/loadtracks` — resolve a query / url into tracks. */
  public loadTracks(identifier: string, extraQueryUrlParams?: Record<string, string>): Promise<LoadTracksResponse> {
    return this.request<LoadTracksResponse>('GET', '/loadtracks', {
      query: { identifier, ...extraQueryUrlParams },
      timeout: SEARCH_TIMEOUT,
    });
  }

  /** `GET /v4/decodetrack` — decode one base64 track. */
  public decodeTrack(encoded: string): Promise<APITrack> {
    return this.request<APITrack>('GET', '/decodetrack', {
      query: { track: encoded },
    });
  }

  /** `POST /v4/decodetracks` — decode many base64 tracks. */
  public decodeTracks(encoded: string[]): Promise<APITrack[]> {
    return this.request<APITrack[]>('POST', '/decodetracks', {
      body: encoded,
    });
  }

  // -------------------------------------------------------------------------
  // Session management
  // -------------------------------------------------------------------------

  /** `PATCH /v4/sessions/{id}` — configure resuming for this session. */
  public updateSession(resuming: boolean, timeoutSeconds: number): Promise<unknown> {
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
  public getPlayers(): Promise<APIPlayer[]> {
    const sessionId = this.requireSession();
    return this.request<APIPlayer[]>('GET', `/sessions/${sessionId}/players`);
  }

  /** `GET /v4/sessions/{id}/players/{guildId}` — one player. */
  public getPlayer(guildId: string): Promise<APIPlayer> {
    const sessionId = this.requireSession();
    return this.request<APIPlayer>('GET', `/sessions/${sessionId}/players/${guildId}`);
  }

  /** `PATCH /v4/sessions/{id}/players/{guildId}` — create/update a player. */
  public updatePlayer(
    guildId: string,
    payload: UpdatePlayerPayload,
    noReplace = false,
  ): Promise<APIPlayer> {
    const sessionId = this.requireSession();
    return this.request<APIPlayer>(
      'PATCH',
      `/sessions/${sessionId}/players/${guildId}`,
      {
        body: payload,
        query: { noReplace: noReplace ? 'true' : undefined },
        // Session 404 during reconnect storms is handled upstream.
        ignoreSessionInvalid: true,
      },
    );
  }

  /** `DELETE /v4/sessions/{id}/players/{guildId}` — destroy a player. */
  public destroyPlayer(guildId: string): Promise<unknown> {
    const sessionId = this.requireSession();
    return this.request('DELETE', `/sessions/${sessionId}/players/${guildId}`, {
      ignoreSessionInvalid: true,
    });
  }

  // -------------------------------------------------------------------------
  // Node information
  // -------------------------------------------------------------------------

  /** `GET /v4/info` — version, build, plugins. */
  public getInfo(): Promise<NodeInfo> {
    return this.request<NodeInfo>('GET', '/info');
  }

  /** `GET /v4/stats` — REST snapshot of node statistics. */
  public getStats(): Promise<NodeStats> {
    return this.request<NodeStats>('GET', '/stats');
  }

  /** `GET /version` — raw Lavalink version string (served at the server root). */
  public getVersion(): Promise<string> {
    return this.request<string>('GET', '/version', {
      responseType: 'text',
      rootRoute: true,
    });
  }

  /** `GET /v4/routeplanner/status` — IP route planner status. */
  public getRoutePlannerStatus(): Promise<RoutePlannerStatus | null> {
    return this.request<RoutePlannerStatus | null>('GET', '/routeplanner/status');
  }

  /** `POST /v4/routeplanner/free` — release failed route planner addresses. */
  public freeFailedAddresses(addresses: string[]): Promise<unknown> {
    return this.request('POST', '/routeplanner/free', {
      body: { addresses },
    });
  }

  // -------------------------------------------------------------------------

  private requireSession(): string {
    const sessionId = this.deps.getSessionId();
    if (!sessionId) {
      throw new JunieRestError({
        method: 'SESSION',
        path: '',
        status: 0,
        message: 'No session available yet — the node WebSocket is not connected.',
      });
    }
    return sessionId;
  }
}
