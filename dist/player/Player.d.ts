/**
 * Junie — the guild player.
 *
 * A Player ties one guild to one node, one voice channel, one queue and one
 * filter chain, and drives the whole playback state machine:
 *
 *   create -> connect -> play -> (events) -> ... -> destroy
 *
 * Notable behaviours:
 * - **Auto-advance** on TrackEnd (with repeat modes and history)
 * - **Autoplay** when the queue runs dry
 * - **Zombie-proof destroy** — REST failures or timeouts can never leave the
 *   player locked in a half-destroyed state
 * - **Voice self-healing** — rejoins automatically when Discord closes the
 *   voice socket, and rebuilds remote state after session loss
 * - **Node migration** — move a live player between nodes with one call
 */
import type { Junie } from '../Junie.js';
import type { Node } from '../node/Node.js';
import { Queue } from '../queue/Queue.js';
import type { TrackLike } from '../track/Track.js';
import type { APIPlayer, FiltersPayload, LavalinkEvent, PlayerState, UpdatePlayerPayload } from '../types/api.js';
import type { AutoplayResolver, PlayerOptions, RepeatModeOption } from '../types/options.js';
import type { PartialVoiceState, PlayerEvents } from '../types/events.js';
import { TypedEmitter } from '../utils/TypedEmitter.js';
import { FilterManager } from './FilterManager.js';
/** Options for `Player#play`. */
export interface PlayOptions {
    /** Don't replace a track that is already playing server-side. */
    noReplace?: boolean;
    /** Start position in ms. */
    startTime?: number;
    /** Stop position in ms. */
    endTime?: number;
    /** Initial volume for this play (0–1000). */
    volume?: number;
    /** Start paused. */
    paused?: boolean;
}
/** Coarse lifecycle of a player. */
export type PlayerLifecycle = 'idle' | 'connecting' | 'connected' | 'playing' | 'paused' | 'destroying' | 'destroyed';
/** The default autoplay resolver: YouTube search seeded by the last track. */
export declare const defaultAutoplayResolver: AutoplayResolver<unknown>;
/**
 * A guild's audio player.
 */
export declare class Player<TRequester = unknown> extends TypedEmitter<PlayerEvents<TRequester>> {
    /** The owning client. */
    readonly junie: Junie<TRequester>;
    /** The guild this player serves. */
    readonly guildId: string;
    /** The node currently driving this player (migrate with {@link setNode}). */
    node: Node;
    /** Current voice channel (null when not connected). */
    voiceChannelId: string | null;
    /** Your bot's reply channel (bookkeeping only — Junie never sends messages). */
    textChannelId: string | null;
    /** The guild's queue (upcoming + current + history). */
    readonly queue: Queue<TRequester>;
    /** Fluent filter builder. */
    readonly filters: FilterManager;
    /** Player volume (0–1000). */
    volume: number;
    /** Whether a track is loaded server-side. */
    playing: boolean;
    /** Whether playback is paused. */
    paused: boolean;
    /** Whether Lavalink reports a live voice connection. */
    connected: boolean;
    /** Last reported playback position (ms). */
    position: number;
    /** Voice round-trip latency reported by Lavalink (ms, -1 when unknown). */
    ping: number;
    /** Epoch ms of the last playerUpdate. */
    lastPositionUpdate: number;
    /** Whether autoplay continues the queue when it runs dry. */
    autoplay: boolean;
    /** @internal Voice credentials as they arrive from the gateway. */
    voiceState: PartialVoiceState;
    /** @internal Coarse lifecycle. */
    lifecycle: PlayerLifecycle;
    private _destroying;
    private _suppressAutoAdvance;
    private _voiceReconnects;
    private _voiceWaiter;
    private _voiceResolve;
    private _chain;
    constructor(junie: Junie<TRequester>, node: Node, options: PlayerOptions);
    /** Alias for `queue.repeatMode`. */
    get repeatMode(): RepeatModeOption;
    /** Set repeat mode ('off' | 'track' | 'queue'). */
    setRepeatMode(mode: RepeatModeOption): this;
    /** Enable / disable autoplay. */
    setAutoplay(enabled: boolean): this;
    /** Human-friendly description. */
    toString(): string;
    private assertAlive;
    /**
     * Join the configured voice channel.
     *
     * Sends gateway op 4 through `sendToShard` and resolves once Discord's
     * voice credentials (`VOICE_STATE_UPDATE` + `VOICE_SERVER_UPDATE`) have
     * been forwarded to Lavalink. Rejects with {@link VoiceConnectionError}
     * after `voiceConnectionTimeout` (default 15s) if the credentials never
     * arrive — usually a sign that raw packets are not being forwarded.
     */
    connect(): Promise<void>;
    /**
     * Leave the voice channel but keep the player (queue, filters, ...).
     * Most bots want `destroy()` instead.
     */
    disconnect(): Promise<void>;
    /** @internal Send op 4 to the shard. */
    private _sendGatewayVoiceJoin;
    private sendGatewayPayload;
    /** @internal Called when both voice credentials are present. */
    sendVoiceUpdate(): void;
    /**
     * Play a track (or the next queued track).
     *
     * - `play(track)` replaces whatever is playing with `track`
     * - `play()` plays the next queued track
     * - when the current track was stopped with `stop(false)`, `play()` replays it
     * - strings are treated as search queries and resolved lazily
     */
    play(track?: TrackLike<TRequester> | string, options?: PlayOptions): Promise<void>;
    /** Pause playback. `pause()` pauses, `pause(false)` resumes. */
    pause(paused?: boolean): Promise<void>;
    /** Resume playback. */
    resume(): Promise<void>;
    /**
     * Stop the current track.
     *
     * @param advance When true (default) the queue continues with the next
     * track — this is what `skip()` calls. When false, the current track is
     * kept and `play()` will replay it.
     */
    stop(advance?: boolean): Promise<void>;
    /** Skip to the next track (or the Nth-next with `count`). */
    skip(count?: number): Promise<void>;
    /** Seek to `position` milliseconds (streams are not seekable). */
    seek(position: number): Promise<void>;
    /** Set player volume (0–1000, clamped). */
    setVolume(volume: number): Promise<void>;
    /**
     * Merge a raw filter payload and apply it immediately.
     * For the fluent API use `player.filters` instead.
     */
    setFilters(filters: FiltersPayload): Promise<void>;
    /** Remember a text channel for this guild (bookkeeping). */
    setTextChannel(channelId: string | null): this;
    /**
     * Migrate this player to another node without interrupting playback
     * longer than one REST round trip: the remote player is recreated on the
     * target node (voice + track + position + volume + filters) before the
     * old one is destroyed.
     */
    setNode(target: string | Node): Promise<void>;
    /**
     * Destroy the player deterministically.
     *
     * Implements the force-cleanup pattern: the local player is invalidated
     * immediately, the REST `DELETE` is raced against a 3s budget, and local
     * purge (manager removal, voice reset, store cleanup, events) happens in
     * `finally` no matter what. A dead or slow node can never leave this
     * player half-alive.
     */
    destroy(reason?: string): Promise<void>;
    /** @internal Central PATCH — every state mutation funnels through here. */
    patchPlayer(payload: UpdatePlayerPayload, noReplace?: boolean): Promise<APIPlayer>;
    private completeVoiceState;
    /** Serialize async queue work to keep event ordering sane. */
    private _enqueue;
    private _advanceInternal;
    private _startTrack;
    private _resolveInput;
    private _asDisplayTrack;
    private _tryAutoplay;
    /** @internal playerUpdate op. */
    handlePlayerUpdate(state: PlayerState): void;
    /** @internal event op. */
    handleEvent(event: LavalinkEvent): void;
    private _handleTrackStart;
    private _handleTrackEnd;
    private _handleTrackException;
    private _handleTrackStuck;
    private _handleVoiceClosed;
    /** Prefer the local Track instance (with requester) over the raw payload. */
    private _matchTrack;
    /** @internal VOICE_STATE_UPDATE for our bot user. */
    handleVoiceStateUpdate(data: {
        sessionId?: string;
        channelId?: string | null;
    }): void;
    /** @internal VOICE_SERVER_UPDATE for a guild we have a player in. */
    handleVoiceServerUpdate(data: {
        token?: string;
        endpoint?: string;
    }): void;
    /**
     * @internal Rebuild the remote player after this node got a *fresh*
     * session (session lost, e.g. Lavalink restart). Voice credentials are
     * re-sent, and the current track resumes from the last known position.
     */
    reinitialize(): Promise<void>;
    /** @internal Typed emit (bridges protected TypedEmitter#emit). */
    private emitPublic;
}
//# sourceMappingURL=Player.d.ts.map