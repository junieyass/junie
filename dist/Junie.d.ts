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
import { Node } from './node/Node.js';
import type { NodeHost } from './node/Node.js';
import { NodeManager } from './node/NodeManager.js';
import { PlayerManager } from './player/PlayerManager.js';
import type { Player } from './player/Player.js';
import { Track } from './track/Track.js';
import type { SearchResult } from './track/SearchResult.js';
import type { JunieEvents } from './types/events.js';
import type { JunieOptions, LogLevel, PlayerDefaults, PlayerOptions, ResolvedReconnectOptions, ResolvedResumeOptions, ResolvedRestOptions, SearchQuery, SearchSource, WebSocketFactory } from './types/options.js';
import type { RawGatewayPacket } from './types/api.js';
import type { APITrack, LavalinkEvent, NodeStats, PlayerState, WebSocketPayload } from './types/api.js';
import { TypedEmitter } from './utils/TypedEmitter.js';
import type { EventArgs } from './utils/TypedEmitter.js';
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
/**
 * The Junie Lavalink client.
 *
 * @typeParam TRequester The type you store on `track.requester` (e.g. your
 * Discord user class). Defaults to `unknown`.
 */
export declare class Junie<TRequester = unknown> extends TypedEmitter<JunieEvents<TRequester>> implements NodeHost {
    /** Fully resolved options. */
    readonly options: ResolvedJunieOptions<TRequester>;
    /** The bot user id (available after `init`). */
    userId: string;
    /** Client name reported to Lavalink (the `Client-Name` header). */
    readonly clientName: string;
    /** Structured logger — tag children with `logger.child(...)`. */
    readonly logger: Logger;
    /** Custom WebSocket transport factory, if configured. */
    readonly webSocketFactory: WebSocketFactory | undefined;
    /** Node registry & load balancing. */
    readonly nodes: NodeManager;
    /** Player registry. */
    readonly players: PlayerManager<TRequester>;
    /** Handy utilities exposed under one namespace. */
    readonly utils: {
        /** Build a {@link Track} from a raw Lavalink track object. */
        buildTrack: <T = TRequester>(data: APITrack, requester?: T) => Track<T>;
        /** `mm:ss` / `hh:mm:ss` formatting (streams render as "LIVE"). */
        formatDuration: typeof formatDuration;
        /** Extract the Discord voice region token from an endpoint. */
        parseVoiceRegion: typeof parseVoiceRegion;
        /** Map a region token to a coarse zone. */
        regionZone: typeof regionZone;
    };
    private destroyed;
    constructor(options: JunieOptions<TRequester>);
    /**
     * Register the bot user id (if not given in the options) and connect all
     * nodes. Call this once your Discord client is ready.
     */
    init(userId?: string): this;
    /** Shut everything down: players, nodes, listeners. */
    destroy(): Promise<void>;
    /** Create (or fetch) the player of a guild. See {@link PlayerManager#create}. */
    createPlayer(options: PlayerOptions): Player<TRequester>;
    /** Fetch the player of a guild (undefined when absent). */
    getPlayer(guildId: string): Player<TRequester> | undefined;
    /** Fetch the player of a guild or throw. */
    requirePlayer(guildId: string): Player<TRequester>;
    /** Destroy a guild's player (no-op when absent). */
    destroyPlayer(guildId: string, reason?: string): Promise<void>;
    /**
     * Search for tracks.
     *
     * @param query Text, URL, or structured query (source, parallel, node).
     * @param requester Attached to every returned track.
     */
    search<T = TRequester>(query: string | SearchQuery, requester?: T): Promise<SearchResult<T>>;
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
    sendRawData(packet: RawGatewayPacket): void;
    /** @internal */
    notifyReady(node: Node, resumed: boolean): void;
    /** @internal */
    notifyStats(node: Node, stats: NodeStats): void;
    /** @internal */
    notifyPlayerUpdate(node: Node, guildId: string, state: PlayerState): void;
    /** @internal */
    notifyEvent(node: Node, event: LavalinkEvent): void;
    /** @internal */
    notifyDisconnect(node: Node, code: number, reason: string): void;
    /** @internal */
    notifyError(node: Node, error: Error): void;
    /** @internal */
    notifyReconnecting(node: Node, attempt: number, delay: number): void;
    /** @internal */
    notifyReconnectFailed(node: Node): void;
    /** @internal */
    notifyDestroy(node: Node): void;
    /** @internal */
    notifyRaw(node: Node, payload: WebSocketPayload): void;
    /** @internal Typed emit bridge. */
    emitClient<K extends keyof JunieEvents<TRequester>>(event: K, ...args: EventArgs<JunieEvents<TRequester>, K>): void;
    /** @internal Mirror a player event at client level. */
    forwardPlayerEvent(player: Player<TRequester>, event: string, ...args: unknown[]): void;
    /** @internal Called by Player#destroy after local purge. */
    handlePlayerDestroy(player: Player<TRequester>, reason: string): void;
    /** @internal Called when the bot user left voice (channel became null). */
    handleVoiceLeave(player: Player<TRequester>, _voiceChannelId: string | null): void;
}
//# sourceMappingURL=Junie.d.ts.map