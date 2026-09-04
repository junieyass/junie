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

import {
  DESTROY_TIMEOUT,
  DEFAULTS,
  GATEWAY_VOICE_STATE_OPCODE,
  MAX_VOICE_RECONNECT_ATTEMPTS,
  PLAYER_VOLUME_RANGE,
} from '../constants.js';
import {
  JunieError,
  JunieErrorCode,
  TrackLoadError,
  VoiceConnectionError,
} from '../errors.js';
import type { Junie } from '../Junie.js';
import type { Node } from '../node/Node.js';
import { Queue } from '../queue/Queue.js';
import { Track, UnresolvedTrack } from '../track/Track.js';
import type { TrackLike } from '../track/Track.js';
import type {
  APIPlayer,
  APITrack,
  FiltersPayload,
  LavalinkEvent,
  PlayerState,
  UpdatePlayerPayload,
  VoiceGatewayPayload,
} from '../types/api.js';
import type {
  AutoplayResolver,
  PlayerOptions,
  RepeatModeOption,
  SearchQuery,
} from '../types/options.js';
import type { PartialVoiceState, PlayerEvents } from '../types/events.js';
import { TypedEmitter } from '../utils/TypedEmitter.js';
import type { EventArgs } from '../utils/TypedEmitter.js';
import { clamp, withTimeout } from '../utils/Helpers.js';
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
export type PlayerLifecycle =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'playing'
  | 'paused'
  | 'destroying'
  | 'destroyed';

/** The default autoplay resolver: YouTube search seeded by the last track. */
export const defaultAutoplayResolver: AutoplayResolver<unknown> = async (_player, lastTrack) => {
  const query = lastTrack.isStream
    ? lastTrack.title
    : `${lastTrack.title} ${lastTrack.author}`;
  return { query, source: 'youtube' } satisfies SearchQuery;
};

/**
 * A guild's audio player.
 */
export class Player<TRequester = unknown> extends TypedEmitter<PlayerEvents<TRequester>> {
  /** The owning client. */
  public readonly junie: Junie<TRequester>;
  /** The guild this player serves. */
  public readonly guildId: string;
  /** The node currently driving this player (migrate with {@link setNode}). */
  public node: Node;
  /** Current voice channel (null when not connected). */
  public voiceChannelId: string | null;
  /** Your bot's reply channel (bookkeeping only — Junie never sends messages). */
  public textChannelId: string | null;

  /** The guild's queue (upcoming + current + history). */
  public readonly queue: Queue<TRequester>;
  /** Fluent filter builder. */
  public readonly filters: FilterManager;

  /** Player volume (0–1000). */
  public volume: number;
  /** Whether a track is loaded server-side. */
  public playing = false;
  /** Whether playback is paused. */
  public paused = false;
  /** Whether Lavalink reports a live voice connection. */
  public connected = false;
  /** Last reported playback position (ms). */
  public position = 0;
  /** Voice round-trip latency reported by Lavalink (ms, -1 when unknown). */
  public ping = -1;
  /** Epoch ms of the last playerUpdate. */
  public lastPositionUpdate = 0;
  /** Whether autoplay continues the queue when it runs dry. */
  public autoplay: boolean;

  /** @internal Voice credentials as they arrive from the gateway. */
  public voiceState: PartialVoiceState = {};
  /** @internal Coarse lifecycle. */
  public lifecycle: PlayerLifecycle = 'idle';

  private _destroying = false;
  private _suppressAutoAdvance = false;
  private _voiceReconnects = 0;
  private _voiceWaiter: Promise<void> | null = null;
  private _voiceResolve: (() => void) | null = null;
  private _chain: Promise<void> = Promise.resolve();

  public constructor(junie: Junie<TRequester>, node: Node, options: PlayerOptions) {
    super();
    this.junie = junie;
    this.node = node;
    this.guildId = options.guildId;
    this.voiceChannelId = options.voiceChannelId ?? null;
    this.textChannelId = options.textChannelId ?? null;
    this.volume = options.volume ?? DEFAULTS.player.volume;
    this.autoplay = options.autoplay ?? false;

    this.queue = new Queue<TRequester>(this, {
      store: junie.options.queue.store,
      historyLimit: junie.options.queue.historyLimit,
    });
    this.queue.setRepeatMode(options.repeatMode ?? 'off');
    this.filters = new FilterManager(this as unknown as Player);
  }

  // -------------------------------------------------------------------------
  // Small conveniences
  // -------------------------------------------------------------------------

  /** Alias for `queue.repeatMode`. */
  get repeatMode(): RepeatModeOption {
    return this.queue.repeatMode;
  }

  /** Set repeat mode ('off' | 'track' | 'queue'). */
  public setRepeatMode(mode: RepeatModeOption): this {
    this.queue.setRepeatMode(mode);
    return this;
  }

  /** Enable / disable autoplay. */
  public setAutoplay(enabled: boolean): this {
    this.autoplay = enabled;
    return this;
  }

  /** Human-friendly description. */
  public toString(): string {
    return `Player[${this.guildId} @ ${this.node.id}]`;
  }

  private assertAlive(): void {
    if (this.lifecycle === 'destroyed' || this._destroying) {
      throw new JunieError(
        JunieErrorCode.PLAYER_DESTROYED,
        `Player for guild ${this.guildId} is destroyed.`,
        { guildId: this.guildId },
      );
    }
  }

  // -------------------------------------------------------------------------
  // Voice
  // -------------------------------------------------------------------------

  /**
   * Join the configured voice channel.
   *
   * Sends gateway op 4 through `sendToShard` and resolves once Discord's
   * voice credentials (`VOICE_STATE_UPDATE` + `VOICE_SERVER_UPDATE`) have
   * been forwarded to Lavalink. Rejects with {@link VoiceConnectionError}
   * after `voiceConnectionTimeout` (default 15s) if the credentials never
   * arrive — usually a sign that raw packets are not being forwarded.
   */
  public async connect(): Promise<void> {
    this.assertAlive();
    if (!this.voiceChannelId) {
      throw new JunieError(
        JunieErrorCode.INVALID_ARGUMENT,
        'Cannot connect without a voice channel id.',
        { guildId: this.guildId },
      );
    }
    if (this._voiceWaiter) return this._voiceWaiter;

    this.lifecycle = 'connecting';
    // Fresh credentials for a fresh join.
    this.voiceState = { channelId: this.voiceChannelId };

    // The waiter is created synchronously *before* the first await so that
    // voice credentials racing the op 4 round trip can never slip through.
    const timeoutMs = this.junie.options.voiceConnectionTimeout ?? DEFAULTS.voiceConnectionTimeout;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const waiter = new Promise<void>((resolve, reject) => {
      this._voiceResolve = () => resolve();
      timer = setTimeout(() => {
        this._voiceWaiter = null;
        this._voiceResolve = null;
        reject(new VoiceConnectionError(this.guildId, timeoutMs));
      }, timeoutMs);
    });
    this._voiceWaiter = waiter.finally(() => {
      if (timer) clearTimeout(timer);
      this._voiceWaiter = null;
      this._voiceResolve = null;
    });

    try {
      await this.sendGatewayPayload(this.voiceChannelId);
    } catch (error) {
      if (timer) clearTimeout(timer);
      this._voiceWaiter = null;
      this._voiceResolve = null;
      void waiter.catch(() => undefined);
      throw error;
    }

    return this._voiceWaiter;
  }

  /**
   * Leave the voice channel but keep the player (queue, filters, ...).
   * Most bots want `destroy()` instead.
   */
  public async disconnect(): Promise<void> {
    this.assertAlive();
    const oldChannel = this.voiceChannelId;
    this.voiceChannelId = null;
    this.connected = false;
    this.voiceState = {};
    if (this.lifecycle === 'playing' || this.lifecycle === 'paused' || this.lifecycle === 'connected') {
      this.lifecycle = 'idle';
    }
    await this.sendGatewayPayload(null);
    this.emitPublic('playerDisconnect', this, oldChannel);
    this.junie.forwardPlayerEvent(this, 'playerDisconnect', oldChannel);
  }

  /** @internal Send op 4 to the shard. */
  private _sendGatewayVoiceJoin(): void {
    void this.sendGatewayPayload(this.voiceChannelId).catch((error) => {
      this.junie.logger.error(`Failed to send voice join for guild ${this.guildId}: ${String(error)}`);
    });
  }

  private async sendGatewayPayload(channelId: string | null): Promise<void> {
    const payload: VoiceGatewayPayload = {
      op: GATEWAY_VOICE_STATE_OPCODE,
      d: {
        guild_id: this.guildId,
        channel_id: channelId,
        self_mute: this.junie.options.player.selfMute ?? DEFAULTS.player.selfMute,
        self_deaf: this.junie.options.player.selfDeaf ?? DEFAULTS.player.selfDeaf,
      },
    };
    await this.junie.options.sendToShard(this.guildId, payload);
  }

  /** @internal Called when both voice credentials are present. */
  public sendVoiceUpdate(): void {
    const { token, endpoint, sessionId, channelId } = this.voiceState;
    if (!token || !endpoint || !sessionId || !channelId) return;

    this.junie.logger.trace(`Forwarding voice credentials for guild ${this.guildId} to ${this.node.id}.`);
    this.node.rest
      .updatePlayer(this.guildId, {
        voice: { token, endpoint, sessionId, channelId },
      })
      .then(() => {
        this._voiceResolve?.();
      })
      .catch((error) => {
        this.junie.logger.warn(
          `Could not forward voice credentials for guild ${this.guildId}: ${String(error)}`,
        );
      });
  }

  // -------------------------------------------------------------------------
  // Playback control
  // -------------------------------------------------------------------------

  /**
   * Play a track (or the next queued track).
   *
   * - `play(track)` replaces whatever is playing with `track`
   * - `play()` plays the next queued track
   * - when the current track was stopped with `stop(false)`, `play()` replays it
   * - strings are treated as search queries and resolved lazily
   */
  public async play(track?: TrackLike<TRequester> | string, options: PlayOptions = {}): Promise<void> {
    this.assertAlive();

    if (track === undefined) {
      if (this.queue.current && !this.playing && !this.paused) {
        const current = this.queue.current;
        return this._enqueue(() => this._startTrack(current, options));
      }
      return this._enqueue(() => this._advanceInternal());
    }

    const input: TrackLike<TRequester> = typeof track === 'string'
      ? new UnresolvedTrack<TRequester>(track)
      : track;

    // Replaced tracks never see an advancing TrackEnd — record them now.
    if (this.queue.current && this.playing) {
      this.queue.pushHistory(this.queue.current);
    }

    return this._enqueue(() => this._startTrack(input, options));
  }

  /** Pause playback. `pause()` pauses, `pause(false)` resumes. */
  public async pause(paused = true): Promise<void> {
    this.assertAlive();
    await this.patchPlayer({ paused });
    this.paused = paused;
    this.lifecycle = paused ? 'paused' : this.playing ? 'playing' : 'connected';
  }

  /** Resume playback. */
  public async resume(): Promise<void> {
    return this.pause(false);
  }

  /**
   * Stop the current track.
   *
   * @param advance When true (default) the queue continues with the next
   * track — this is what `skip()` calls. When false, the current track is
   * kept and `play()` will replay it.
   */
  public async stop(advance = true): Promise<void> {
    this.assertAlive();
    if (!advance) this._suppressAutoAdvance = true;
    this.playing = false;
    await this.patchPlayer({ track: { encoded: null } });
  }

  /** Skip to the next track (or the Nth-next with `count`). */
  public async skip(count = 1): Promise<void> {
    this.assertAlive();
    const drop = Math.max(0, count - 1);
    for (let i = 0; i < drop; i++) this.queue.take(0);
    if (this.playing || this.paused) {
      return this.stop(true);
    }
    return this._enqueue(() => this._advanceInternal());
  }

  /** Seek to `position` milliseconds (streams are not seekable). */
  public async seek(position: number): Promise<void> {
    this.assertAlive();
    const current = this.queue.current;
    if (!current) return;
    if (!current.isSeekable) {
      throw new JunieError(
        JunieErrorCode.TRACK_NOT_SEEKABLE,
        `Cannot seek the current track ("${current.title}") — it is a live stream.`,
        { guildId: this.guildId, title: current.title },
      );
    }
    const clamped = clamp(Math.round(position), 0, current.length);
    await this.patchPlayer({ position: clamped });
    this.position = clamped;
  }

  /** Set player volume (0–1000, clamped). */
  public async setVolume(volume: number): Promise<void> {
    this.assertAlive();
    const clamped = clamp(Math.round(volume), PLAYER_VOLUME_RANGE.min, PLAYER_VOLUME_RANGE.max);
    await this.patchPlayer({ volume: clamped });
    this.volume = clamped;
  }

  /**
   * Merge a raw filter payload and apply it immediately.
   * For the fluent API use `player.filters` instead.
   */
  public async setFilters(filters: FiltersPayload): Promise<void> {
    this.assertAlive();
    this.filters.merge(filters);
    await this.filters.apply();
  }

  /** Remember a text channel for this guild (bookkeeping). */
  public setTextChannel(channelId: string | null): this {
    this.textChannelId = channelId;
    return this;
  }

  /**
   * Migrate this player to another node without interrupting playback
   * longer than one REST round trip: the remote player is recreated on the
   * target node (voice + track + position + volume + filters) before the
   * old one is destroyed.
   */
  public async setNode(target: string | Node): Promise<void> {
    this.assertAlive();
    const newNode = typeof target === 'string' ? this.junie.nodes.require(target) : target;
    if (newNode === this.node) return;
    if (!newNode.connected) {
      throw new JunieError(
        JunieErrorCode.NODE_CONNECTION_FAILED,
        `Target node "${newNode.id}" is not connected.`,
        { guildId: this.guildId, node: newNode.id },
      );
    }

    const oldNode = this.node;
    this.node = newNode;

    const payload: UpdatePlayerPayload = {};
    const voice = this.completeVoiceState();
    if (voice) payload.voice = voice;
    if (this.queue.current instanceof Track) {
      payload.track = { encoded: this.queue.current.encoded, userData: this.queue.current.userData };
      payload.position = this.position;
      payload.paused = this.paused;
    }
    payload.volume = this.volume;
    const filters = this.filters.payload;
    if (!this.filters.isEmpty) payload.filters = filters;

    try {
      await this.patchPlayer(payload, true);
    } catch (error) {
      this.node = oldNode;
      throw error;
    }

    try {
      await withTimeout(oldNode.rest.destroyPlayer(this.guildId), DESTROY_TIMEOUT);
    } catch {
      // The old node will drop the player with its session eventually.
    }
    this.junie.logger.info(`Player ${this.guildId} migrated from ${oldNode.id} to ${newNode.id}.`);
  }

  // -------------------------------------------------------------------------
  // Destruction
  // -------------------------------------------------------------------------

  /**
   * Destroy the player deterministically.
   *
   * Implements the force-cleanup pattern: the local player is invalidated
   * immediately, the REST `DELETE` is raced against a 3s budget, and local
   * purge (manager removal, voice reset, store cleanup, events) happens in
   * `finally` no matter what. A dead or slow node can never leave this
   * player half-alive.
   */
  public async destroy(reason = 'manual'): Promise<void> {
    if (this._destroying || this.lifecycle === 'destroyed') return;
    this._destroying = true;
    this.lifecycle = 'destroying';
    this._suppressAutoAdvance = true;

    // 1. Detach from the manager immediately — no new commands may arrive.
    this.junie.players.remove(this.guildId, this);

    // 2. Leave voice (best effort, never blocks).
    if (this.voiceChannelId || this.voiceState.sessionId) {
      this.voiceChannelId = null;
      this.voiceState = {};
      try {
        await this.sendGatewayPayload(null);
      } catch {
        // Shard may be gone; the Lavalink DELETE below still runs.
      }
    }

    // 3. REST destroy with a strict budget.
    try {
      await withTimeout(this.node.rest.destroyPlayer(this.guildId), DESTROY_TIMEOUT);
    } catch (error) {
      this.junie.logger.warn(
        `REST destroy for guild ${this.guildId} failed (${String(error)}) — forcing local cleanup.`,
      );
    } finally {
      // 4. Purge local state unconditionally.
      this.playing = false;
      this.paused = false;
      this.connected = false;
      this.queue.current = null;
      this.queue.tracks = [];
      void this.queue.clearStore().catch(() => undefined);
      this.lifecycle = 'destroyed';

      this.emitPublic('playerDestroy', this, reason);
      this.junie.handlePlayerDestroy(this, reason);
      this.removeAllListeners();
    }
  }

  // -------------------------------------------------------------------------
  // Internal: REST plumbing
  // -------------------------------------------------------------------------

  /** @internal Central PATCH — every state mutation funnels through here. */
  public async patchPlayer(payload: UpdatePlayerPayload, noReplace = false): Promise<APIPlayer> {
    return this.node.rest.updatePlayer(this.guildId, payload, noReplace);
  }

  private completeVoiceState(): { token: string; endpoint: string; sessionId: string; channelId: string } | null {
    const { token, endpoint, sessionId, channelId } = this.voiceState;
    if (!token || !endpoint || !sessionId || !channelId) return null;
    return { token, endpoint, sessionId, channelId };
  }

  // -------------------------------------------------------------------------
  // Internal: queue advancement
  // -------------------------------------------------------------------------

  /** Serialize async queue work to keep event ordering sane. */
  private _enqueue(work: () => Promise<void>): Promise<void> {
    const run = (): Promise<void> => work().catch((error) => {
      this.junie.logger.error(`Queue advancement failed for guild ${this.guildId}: ${String(error)}`);
    });
    this._chain = this._chain.then(run, run);
    return this._chain;
  }

  private async _advanceInternal(): Promise<void> {
    if (this.lifecycle === 'destroyed' || this._destroying) return;

    const next = this.queue.take(0);
    if (!next) {
      this.playing = false;
      this.paused = false;
      this.queue.current = null;
      this.lifecycle = this.connected ? 'connected' : 'idle';
      await this._tryAutoplay();
      return;
    }
    await this._startTrack(next);
  }

  private async _startTrack(target: TrackLike<TRequester>, options: PlayOptions = {}): Promise<void> {
    if (this.lifecycle === 'destroyed' || this._destroying) return;

    let track: Track<TRequester>;
    try {
      track = await this._resolveInput(target);
    } catch (error) {
      if (error instanceof TrackLoadError) {
        const exception = { message: error.message, severity: 'common' as const };
        this.emitPublic('trackError', this, this._asDisplayTrack(target), exception);
        this.junie.forwardPlayerEvent(this, 'trackError', this._asDisplayTrack(target), exception);
        if (this.junie.options.skipOnError ?? DEFAULTS.skipOnError) {
          await this._advanceInternal();
        }
        return;
      }
      // Network/REST failure: surface it and stop the queue (never drain it).
      this.junie.logger.error(`Cannot start track for guild ${this.guildId}: ${String(error)}`);
      return;
    }

    this.queue.current = track;
    this.playing = true;
    this.paused = options.paused ?? false;
    this.position = options.startTime ?? 0;
    this.lifecycle = options.paused ? 'paused' : 'playing';

    await this.patchPlayer(
      {
        track: { encoded: track.encoded, userData: track.userData },
        position: options.startTime,
        endTime: options.endTime,
        volume: options.volume,
        paused: options.paused,
      },
      options.noReplace ?? false,
    );
  }

  private async _resolveInput(target: TrackLike<TRequester>): Promise<Track<TRequester>> {
    if (target instanceof Track) return target;
    // UnresolvedTrack: search on the player's node, right before playing.
    return target.resolve(this.node);
  }

  private _asDisplayTrack(target: TrackLike<TRequester>): Track<TRequester> | null {
    if (target instanceof Track) return target;
    return null;
  }

  private async _tryAutoplay(): Promise<void> {
    if (!this.autoplay) {
      this.emitPublic('queueEnd', this);
      this.junie.forwardPlayerEvent(this, 'queueEnd');
      return;
    }
    const last = this.queue.lastTrack;
    if (!last || !(last instanceof Track)) {
      this.emitPublic('queueEnd', this);
      this.junie.forwardPlayerEvent(this, 'queueEnd');
      return;
    }

    try {
      const resolver = (
        this.junie.options.autoplayResolver ?? defaultAutoplayResolver
      ) as AutoplayResolver<TRequester>;
      const output = await resolver(this, last);

      let tracks: Track<TRequester>[];
      if (Array.isArray(output)) {
        tracks = output;
      } else {
        const result = await this.node.search<TRequester>(output, last.requester);
        const seen = new Set(
          this.queue.previous
            .slice(-10)
            .filter((entry): entry is Track<TRequester> => entry instanceof Track)
            .map((entry) => `${entry.sourceName}:${entry.identifier}`),
        );
        tracks = result.tracks.filter(
          (candidate) => !candidate.isStream && !seen.has(`${candidate.sourceName}:${candidate.identifier}`),
        );
      }

      if (tracks.length === 0) {
        this.emitPublic('queueEnd', this);
        this.junie.forwardPlayerEvent(this, 'queueEnd');
        return;
      }
      const pick = tracks[Math.floor(Math.random() * tracks.length)]!;
      await this._startTrack(pick);
    } catch (error) {
      this.junie.logger.warn(`Autoplay failed for guild ${this.guildId}: ${String(error)}`);
      this.emitPublic('queueEnd', this);
      this.junie.forwardPlayerEvent(this, 'queueEnd');
    }
  }

  // -------------------------------------------------------------------------
  // Internal: Lavalink event handling (routed by the Junie client)
  // -------------------------------------------------------------------------

  /** @internal playerUpdate op. */
  public handlePlayerUpdate(state: PlayerState): void {
    const wasConnected = this.connected;
    this.position = state.position;
    this.ping = state.ping;
    this.connected = state.connected;
    this.lastPositionUpdate = state.time;
    if (this.connected && !wasConnected) this._voiceReconnects = 0;
    if (this.connected && this.lifecycle === 'idle') this.lifecycle = 'connected';
    this.emitPublic('playerUpdate', this, state);
    this.junie.forwardPlayerEvent(this, 'playerUpdate', state);
  }

  /** @internal event op. */
  public handleEvent(event: LavalinkEvent): void {
    switch (event.type) {
      case 'TrackStartEvent':
        this._handleTrackStart(event);
        break;
      case 'TrackEndEvent':
        this._handleTrackEnd(event);
        break;
      case 'TrackExceptionEvent':
        this._handleTrackException(event);
        break;
      case 'TrackStuckEvent':
        this._handleTrackStuck(event);
        break;
      case 'WebSocketClosedEvent':
        this._handleVoiceClosed(event);
        break;
    }
  }

  private _handleTrackStart(event: Extract<LavalinkEvent, { type: 'TrackStartEvent' }>): void {
    // Prefer our local instance (keeps requester/userData) when it matches.
    if (
      this.queue.current instanceof Track &&
      this.queue.current.encoded === event.track.encoded
    ) {
      // keep as-is
    } else {
      this.queue.current = new Track<TRequester>(event.track, this.queue.current?.requester);
    }
    this.playing = true;
    this.paused = false;
    this.lifecycle = 'playing';
    this._voiceReconnects = 0;

    const current = this.queue.current as Track<TRequester>;
    this.emitPublic('trackStart', this, current);
    this.junie.forwardPlayerEvent(this, 'trackStart', current);
  }

  private _handleTrackEnd(event: Extract<LavalinkEvent, { type: 'TrackEndEvent' }>): void {
    const ended = this._matchTrack(event.track);
    this.emitPublic('trackEnd', this, ended, event.reason);
    this.junie.forwardPlayerEvent(this, 'trackEnd', ended, event.reason);

    if (this.lifecycle === 'destroyed' || this._destroying) return;

    switch (event.reason) {
      case 'replaced':
        // The replacement was already queued by play(); nothing to do.
        return;
      case 'cleanup':
        // The player was removed server-side (guild deleted / our destroy).
        this.playing = false;
        return;
      default:
        break;
    }

    this.queue.pushHistory(ended);

    if (this._suppressAutoAdvance) {
      this._suppressAutoAdvance = false;
      this.playing = false;
      return;
    }

    if (event.reason === 'loadFailed' && !(this.junie.options.skipOnError ?? DEFAULTS.skipOnError)) {
      this.playing = false;
      return;
    }

    if (event.reason === 'finished') {
      if (this.queue.repeatMode === 'track') this.queue.tracks.unshift(ended);
      else if (this.queue.repeatMode === 'queue') this.queue.tracks.push(ended);
    }

    this.playing = false;
    void this._enqueue(() => this._advanceInternal());
  }

  private _handleTrackException(event: Extract<LavalinkEvent, { type: 'TrackExceptionEvent' }>): void {
    const track = this._matchTrack(event.track);
    this.emitPublic('trackError', this, track, event.exception);
    this.junie.forwardPlayerEvent(this, 'trackError', track, event.exception);
    // Auto-advance (if enabled) happens on the trailing TrackEnd(loadFailed).
  }

  private _handleTrackStuck(event: Extract<LavalinkEvent, { type: 'TrackStuckEvent' }>): void {
    const track = this._matchTrack(event.track);
    this.emitPublic('trackStuck', this, track, event.thresholdMs);
    this.junie.forwardPlayerEvent(this, 'trackStuck', track, event.thresholdMs);
    // Stuck audio is unlistenable: skip it.
    void this.stop(true).catch(() => undefined);
  }

  private _handleVoiceClosed(event: Extract<LavalinkEvent, { type: 'WebSocketClosedEvent' }>): void {
    this.connected = false;
    this.emitPublic('playerVoiceClosed', this, {
      code: event.code,
      reason: event.reason,
      byRemote: event.byRemote,
    });
    this.junie.forwardPlayerEvent(this, 'playerVoiceClosed', {
      code: event.code,
      reason: event.reason,
      byRemote: event.byRemote,
    });

    const autoReconnect = this.junie.options.autoVoiceReconnect ?? DEFAULTS.autoVoiceReconnect;
    if (
      !autoReconnect ||
      !event.byRemote ||
      !this.voiceChannelId ||
      this.lifecycle === 'destroyed' ||
      this._destroying ||
      this._voiceReconnects >= MAX_VOICE_RECONNECT_ATTEMPTS
    ) {
      return;
    }

    this._voiceReconnects += 1;
    const delay = Math.min(1000 * this._voiceReconnects, 5000);
    this.junie.logger.info(
      `Voice socket closed (code ${event.code}) for guild ${this.guildId} — rejoining in ${delay}ms ` +
      `(attempt ${this._voiceReconnects}/${MAX_VOICE_RECONNECT_ATTEMPTS}).`,
    );
    setTimeout(() => {
      if (this.lifecycle === 'destroyed' || !this.voiceChannelId) return;
      this.voiceState = { channelId: this.voiceChannelId };
      this._sendGatewayVoiceJoin();
    }, delay);
  }

  /** Prefer the local Track instance (with requester) over the raw payload. */
  private _matchTrack(raw: APITrack): Track<TRequester> {
    if (this.queue.current instanceof Track && this.queue.current.encoded === raw.encoded) {
      return this.queue.current;
    }
    return new Track<TRequester>(raw, this.queue.current?.requester);
  }

  // -------------------------------------------------------------------------
  // Internal: voice routing (called by the Junie client)
  // -------------------------------------------------------------------------

  /** @internal VOICE_STATE_UPDATE for our bot user. */
  public handleVoiceStateUpdate(data: { sessionId?: string; channelId?: string | null }): void {
    if (this.lifecycle === 'destroyed' || this._destroying) return;

    const oldChannel = this.voiceChannelId;
    if (data.channelId === null) {
      // The bot left voice; the client decides whether to destroy us.
      this.connected = false;
      this.emitPublic('playerDisconnect', this, oldChannel);
      this.junie.forwardPlayerEvent(this, 'playerDisconnect', oldChannel);
      this.junie.handleVoiceLeave(this, oldChannel);
      return;
    }

    if (data.channelId && oldChannel && data.channelId !== oldChannel) {
      this.voiceChannelId = data.channelId;
      this.emitPublic('playerMove', this, oldChannel, data.channelId);
      this.junie.forwardPlayerEvent(this, 'playerMove', oldChannel, data.channelId);
    }

    this.voiceState.sessionId = data.sessionId;
    if (data.channelId) this.voiceState.channelId = data.channelId;
    if (this.voiceState.token && this.voiceState.endpoint) {
      this.sendVoiceUpdate();
    }
  }

  /** @internal VOICE_SERVER_UPDATE for a guild we have a player in. */
  public handleVoiceServerUpdate(data: { token?: string; endpoint?: string }): void {
    if (this.lifecycle === 'destroyed' || this._destroying) return;
    if (!data.token || !data.endpoint) return;
    this.voiceState.token = data.token;
    this.voiceState.endpoint = data.endpoint;
    if (this.voiceState.sessionId) {
      this.sendVoiceUpdate();
    }
  }

  // -------------------------------------------------------------------------
  // Internal: session loss recovery
  // -------------------------------------------------------------------------

  /**
   * @internal Rebuild the remote player after this node got a *fresh*
   * session (session lost, e.g. Lavalink restart). Voice credentials are
   * re-sent, and the current track resumes from the last known position.
   */
  public async reinitialize(): Promise<void> {
    if (this.lifecycle === 'destroyed' || this._destroying) return;
    if (!this.voiceState.token || !this.voiceState.endpoint || !this.voiceState.sessionId) return;

    const payload: UpdatePlayerPayload = {
      voice: {
        token: this.voiceState.token,
        endpoint: this.voiceState.endpoint,
        sessionId: this.voiceState.sessionId,
        channelId: this.voiceState.channelId ?? this.voiceChannelId ?? '',
      },
      volume: this.volume,
    };
    if (this.queue.current instanceof Track) {
      payload.track = { encoded: this.queue.current.encoded, userData: this.queue.current.userData };
      payload.position = this.position;
      payload.paused = this.paused ? true : undefined;
    }
    if (!this.filters.isEmpty) payload.filters = this.filters.payload;

    try {
      await this.patchPlayer(payload, true);
      this.junie.logger.info(
        `Rebuilt remote player for guild ${this.guildId} on fresh session of ${this.node.id}.`,
      );
    } catch (error) {
      this.junie.logger.warn(
        `Could not rebuild remote player for guild ${this.guildId}: ${String(error)}`,
      );
    }
  }

  /** @internal Typed emit (bridges protected TypedEmitter#emit). */
  private emitPublic<K extends keyof PlayerEvents<TRequester>>(
    event: K,
    ...args: EventArgs<PlayerEvents<TRequester>, K>
  ): void {
    this.emit(event, ...args);
  }
}
