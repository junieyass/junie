/**
 * Junie — the Lavalink v4 client.
 *
 * The client owns the node registry, the player registry and the voice
 * routing layer, and fans every Lavalink event out to typed listeners.
 *
 * Typical wiring:
 *
 * ```ts
 * const junie = new Junie({
 *   nodes: [{ id: 'main', host: 'localhost', authorization: 'youshallnotpass' }],
 *   sendToShard: (guildId, payload) => shard.send(payload),
 * });
 * junie.init(botUserId);
 * discord.on('raw', (packet) => junie.sendRawData(packet));
 * ```
 */

import { DEFAULTS, DEFAULT_CLIENT_NAME } from './constants.js';
import { JunieError, JunieErrorCode } from './errors.js';
import { Node } from './node/Node.js';
import type { NodeHost } from './node/Node.js';
import { NodeManager } from './node/NodeManager.js';
import { PenaltyStrategy } from './node/strategies/PenaltyStrategy.js';
import { PlayerManager } from './player/PlayerManager.js';
import type { Player } from './player/Player.js';
import { Track } from './track/Track.js';
import type { SearchResult } from './track/SearchResult.js';
import type { JunieEvents } from './types/events.js';
import type {
  JunieOptions,
  LogLevel,
  PlayerDefaults,
  PlayerOptions,
  ResolvedReconnectOptions,
  ResolvedResumeOptions,
  ResolvedRestOptions,
  SearchQuery,
  SearchSource,
  WebSocketFactory,
} from './types/options.js';
import type { RawGatewayPacket } from './types/api.js';
import type {
  APITrack,
  LavalinkEvent,
  NodeStats,
  PlayerState,
  WebSocketPayload,
} from './types/api.js';
import { TypedEmitter } from './utils/TypedEmitter.js';
import type { EventArgs } from './utils/TypedEmitter.js';
import { createDefaultLogger } from './utils/Logger.js';
import type { Logger } from './utils/Logger.js';
import { formatDuration } from './utils/Helpers.js';
import { parseVoiceRegion, regionZone } from './utils/Regions.js';

/** Player-wide defaults merged from `JunieOptions.player`. */
export type { PlayerDefaults } from './types/options.js';

/** `JunieOptions` after defaults have been applied. */
export interface ResolvedJunieOptions<TRequester = unknown> {
  nodes: JunieOptions<TRequester>['nodes'];
  sendToShard: JunieOptions<TRequester>['sendToShard'];
  userId: string;
  clientName: string;
  strategy: NonNullable<JunieOptions<TRequester>['strategy']>;
  defaultSearchSource: SearchSource;
  searchParallel: boolean;
  skipOnError: boolean;
  autoVoiceReconnect: boolean;
  destroyOnVoiceLeave: boolean;
  /**
   * Automatically migrate players off a node whose WebSocket died onto the
   * best remaining connected node. Default: true.
   */
  autoFailover: boolean;
  voiceConnectionTimeout: number;
  autoplayResolver?: JunieOptions<TRequester>['autoplayResolver'];
  reconnect: ResolvedReconnectOptions;
  resume: ResolvedResumeOptions;
  rest: ResolvedRestOptions;
  queue: Omit<Required<NonNullable<JunieOptions<TRequester>['queue']>>, 'store'> & {
    store?: NonNullable<JunieOptions<TRequester>['queue']>['store'];
  };
  webSocketFactory?: WebSocketFactory;
  logLevel: LogLevel;
  logger?: Logger;
  player: PlayerDefaults;
}

function resolveOptions<TRequester>(raw: JunieOptions<TRequester>): ResolvedJunieOptions<TRequester> {
  return {
    ...raw,
    userId: raw.userId ?? '',
    clientName: raw.clientName ?? DEFAULT_CLIENT_NAME,
    strategy: raw.strategy ?? new PenaltyStrategy(),
    defaultSearchSource: raw.defaultSearchSource ?? DEFAULTS.defaultSearchSource,
    searchParallel: raw.searchParallel ?? DEFAULTS.searchParallel,
    skipOnError: raw.skipOnError ?? DEFAULTS.skipOnError,
    autoVoiceReconnect: raw.autoVoiceReconnect ?? DEFAULTS.autoVoiceReconnect,
    destroyOnVoiceLeave: raw.destroyOnVoiceLeave ?? true,
    autoFailover: raw.autoFailover ?? DEFAULTS.autoFailover,
    voiceConnectionTimeout: raw.voiceConnectionTimeout ?? DEFAULTS.voiceConnectionTimeout,
    autoplayResolver: raw.autoplayResolver,
    reconnect: { ...DEFAULTS.reconnect, ...raw.reconnect },
    resume: { ...DEFAULTS.resume, ...raw.resume },
    rest: { timeout: DEFAULTS.rest.timeout, retries: DEFAULTS.rest.retries, headers: {}, ...raw.rest },
    queue: {
      store: raw.queue?.store,
      restore: raw.queue?.restore ?? DEFAULTS.queue.restore,
      historyLimit: raw.queue?.historyLimit ?? DEFAULTS.queue.historyLimit,
    },
    webSocketFactory: raw.webSocketFactory,
    logLevel: raw.logLevel ?? DEFAULTS.logLevel,
    logger: raw.logger,
    player: { ...DEFAULTS.player, ...raw.player },
  };
}

/**
 * The Junie Lavalink client.
 *
 * @typeParam TRequester The type you store on `track.requester` (e.g. your
 * Discord user class). Defaults to `unknown`.
 */
export class Junie<TRequester = unknown> extends TypedEmitter<JunieEvents<TRequester>> implements NodeHost {
  /** Fully resolved options. */
  public readonly options: ResolvedJunieOptions<TRequester>;
  /** The bot user id (available after `init`). */
  public userId: string;
  /** Client name reported to Lavalink (the `Client-Name` header). */
  public readonly clientName: string;
  /** Structured logger — tag children with `logger.child(...)`. */
  public readonly logger: Logger;
  /** Custom WebSocket transport factory, if configured. */
  public readonly webSocketFactory: WebSocketFactory | undefined;
  /** Node registry & load balancing. */
  public readonly nodes: NodeManager;
  /** Player registry. */
  public readonly players: PlayerManager<TRequester>;

  /** Handy utilities exposed under one namespace. */
  public readonly utils = {
    /** Build a {@link Track} from a raw Lavalink track object. */
    buildTrack: <T = TRequester>(data: APITrack, requester?: T): Track<T> => new Track(data, requester),
    /** `mm:ss` / `hh:mm:ss` formatting (streams render as "LIVE"). */
    formatDuration,
    /** Extract the Discord voice region token from an endpoint. */
    parseVoiceRegion,
    /** Map a region token to a coarse zone. */
    regionZone,
  };

  private destroyed = false;

  public constructor(options: JunieOptions<TRequester>) {
    super();
    this.options = resolveOptions(options);
    this.userId = this.options.userId;
    this.clientName = this.options.clientName;
    this.webSocketFactory = this.options.webSocketFactory;
    this.logger = this.options.logger ?? createDefaultLogger(this.options.logLevel);
    this.nodes = new NodeManager(this, this.options.strategy, {
      reconnect: this.options.reconnect,
      resume: this.options.resume,
      rest: this.options.rest,
    });
    this.players = new PlayerManager<TRequester>(this);

    for (const nodeOption of this.options.nodes) this.nodes.create(nodeOption);
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /**
   * Register the bot user id (if not given in the options) and connect all
   * nodes. Call this once your Discord client is ready.
   */
  public init(userId?: string): this {
    if (userId) this.userId = userId;
    if (!this.userId) {
      throw new JunieError(
        JunieErrorCode.MISSING_USER_ID,
        'No user id — pass userId in the Junie options or call Junie#init(userId) after login.',
      );
    }
    this.nodes.connectAll();
    return this;
  }

  /** Shut everything down: players, nodes, listeners. */
  public async destroy(): Promise<void> {
    if (this.destroyed) return;
    this.destroyed = true;
    await this.players.destroyAll('client-destroy');
    this.nodes.destroyAll();
    this.removeAllListeners();
    this.logger.info('Junie client destroyed.');
  }

  // -------------------------------------------------------------------------
  // Players
  // -------------------------------------------------------------------------

  /** Create (or fetch) the player of a guild. See {@link PlayerManager#create}. */
  public createPlayer(options: PlayerOptions): Player<TRequester> {
    return this.players.create(options);
  }

  /** Fetch the player of a guild (undefined when absent). */
  public getPlayer(guildId: string): Player<TRequester> | undefined {
    return this.players.get(guildId);
  }

  /** Fetch the player of a guild or throw. */
  public requirePlayer(guildId: string): Player<TRequester> {
    return this.players.require(guildId);
  }

  /** Destroy a guild's player (no-op when absent). */
  public async destroyPlayer(guildId: string, reason = 'manual'): Promise<void> {
    const player = this.players.get(guildId);
    if (player) await player.destroy(reason);
  }

  // -------------------------------------------------------------------------
  // Search
  // -------------------------------------------------------------------------

  /**
   * Search for tracks.
   *
   * @param query Text, URL, or structured query (source, parallel, node).
   * @param requester Attached to every returned track.
   */
  public async search<T = TRequester>(
    query: string | SearchQuery,
    requester?: T,
  ): Promise<SearchResult<T>> {
    const queryObject: SearchQuery = typeof query === 'string' ? { query } : query;

    if (queryObject.node) {
      return this.nodes.require(queryObject.node).search<T>(
        queryObject,
        requester,
        { source: this.options.defaultSearchSource },
      );
    }

    if (queryObject.parallel ?? this.options.searchParallel) {
      return this.nodes.fanOutSearch<T>(queryObject, requester);
    }

    const node = this.nodes.best();
    return node.search<T>(queryObject, requester, {
      source: this.options.defaultSearchSource,
    });
  }

  // -------------------------------------------------------------------------
  // Discord voice routing
  // -------------------------------------------------------------------------

  /**
   * Forward raw Discord gateway packets to Junie.
   *
   * Only `VOICE_STATE_UPDATE` and `VOICE_SERVER_UPDATE` are consumed — wire
   * this to your library's raw event:
   *
   * ```ts
   * discord.on('raw', (packet) => junie.sendRawData(packet));
   * ```
   */
  public sendRawData(packet: RawGatewayPacket): void {
    if (!packet?.t || !packet.d) return;

    switch (packet.t) {
      case 'VOICE_STATE_UPDATE': {
        const data = packet.d as {
          user_id?: string;
          guild_id?: string;
          channel_id?: string | null;
          session_id?: string;
        };
        if (this.userId && data.user_id !== this.userId) return;
        if (!data.guild_id) return;
        const player = this.players.get(data.guild_id);
        if (!player) return;
        player.handleVoiceStateUpdate({
          sessionId: data.session_id,
          channelId: data.channel_id,
        });
        break;
      }
      case 'VOICE_SERVER_UPDATE': {
        const data = packet.d as { token?: string; guild_id?: string; endpoint?: string };
        if (!data.guild_id) return;
        const player = this.players.get(data.guild_id);
        if (!player) return;
        player.handleVoiceServerUpdate({ token: data.token, endpoint: data.endpoint });
        break;
      }
      default:
        break;
    }
  }

  // -------------------------------------------------------------------------
  // NodeHost implementation (called by nodes — not public API)
  // -------------------------------------------------------------------------

  /** @internal */
  public notifyReady(node: Node, resumed: boolean): void {
    this.emitClient('nodeConnect', node);
    if (resumed) {
      this.emitClient('nodeResumed', node);
      return;
    }
    // Fresh session: any players we think exist remotely are gone — rebuild.
    for (const player of this.players.listByNode(node.id)) {
      void player.reinitialize();
    }
  }

  /** @internal */
  public notifyStats(node: Node, stats: NodeStats): void {
    this.emitClient('nodeStats', node, stats);
  }

  /** @internal */
  public notifyPlayerUpdate(node: Node, guildId: string, state: PlayerState): void {
    const player = this.players.get(guildId);
    if (player && player.node === node) player.handlePlayerUpdate(state);
  }

  /** @internal */
  public notifyEvent(node: Node, event: LavalinkEvent): void {
    const player = this.players.get(event.guildId);
    if (player && player.node === node) player.handleEvent(event);
  }

  /** @internal */
  public notifyDisconnect(node: Node, code: number, reason: string): void {
    this.emitClient('nodeDisconnect', node, { code, reason });
    if (this.options.autoFailover) void this.failoverPlayers(node);
  }

  /**
   * Move every player of a just-disconnected node onto the best remaining
   * connected node (live migration: voice + track + position + filters are
   * re-established on the target before the old player is destroyed).
   *
   * When no other node is connected, migration is skipped — the node's own
   * reconnect (and the `reinitialize()` that follows a fresh session) takes
   * care of recovery.
   */
  private async failoverPlayers(from: Node): Promise<void> {
    const players = this.players.listByNode(from.id);
    if (players.length === 0) return;

    let target: Node;
    try {
      target = this.nodes.best({ exclude: new Set([from.id]) });
    } catch {
      this.logger.info(
        `Node "${from.id}" died with ${players.length} player(s) and no failover target — awaiting its reconnect.`,
      );
      return;
    }

    this.logger.warn(
      `Node "${from.id}" died — migrating ${players.length} player(s) to "${target.id}".`,
    );
    for (const player of players) {
      if (player.lifecycle === 'destroyed' || player.lifecycle === 'destroying') continue;
      try {
        await player.setNode(target);
      } catch (error) {
        this.logger.warn(
          `Failover of guild ${player.guildId} to "${target.id}" failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }

  /** @internal */
  public notifyError(node: Node, error: Error): void {
    this.emitClient('nodeError', node, error);
  }

  /** @internal */
  public notifyReconnecting(node: Node, attempt: number, delay: number): void {
    this.emitClient('nodeReconnecting', node, { attempt, delay });
  }

  /** @internal */
  public notifyReconnectFailed(node: Node): void {
    this.emitClient('nodeReconnectFailed', node);
  }

  /** @internal */
  public notifyDestroy(node: Node): void {
    this.emitClient('nodeDestroy', node);
  }

  /** @internal */
  public notifyRaw(node: Node, payload: WebSocketPayload): void {
    this.emitClient('raw', node, payload);
  }

  // -------------------------------------------------------------------------
  // Internal bridges for players / managers
  // -------------------------------------------------------------------------

  /** @internal Typed emit bridge. */
  public emitClient<K extends keyof JunieEvents<TRequester>>(
    event: K,
    ...args: EventArgs<JunieEvents<TRequester>, K>
  ): void {
    this.emit(event, ...args);
  }

  /** @internal Mirror a player event at client level. */
  public forwardPlayerEvent(player: Player<TRequester>, event: string, ...args: unknown[]): void {
    const emit = this.emit.bind(this) as unknown as (e: string, ...a: unknown[]) => void;
    emit(event, player, ...args);
  }

  /** @internal Called by Player#destroy after local purge. */
  public handlePlayerDestroy(player: Player<TRequester>, reason: string): void {
    this.emitClient('playerDestroy', player, reason);
  }

  /** @internal Called when the bot user left voice (channel became null). */
  public handleVoiceLeave(player: Player<TRequester>, _voiceChannelId: string | null): void {
    if (this.options.destroyOnVoiceLeave && player.lifecycle !== 'destroyed') {
      void player.destroy('voice-leave');
    }
  }
}
