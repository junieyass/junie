/**
 * Junie — typed event maps.
 *
 * All maps are generic over the requester type you choose for your app
 * (default `unknown`), so `player`, `track` and their `requester` fields are
 * fully typed end-to-end.
 */

import type { Node } from '../node/Node.js';
import type { Player } from '../player/Player.js';
import type { Track, UnresolvedTrack } from '../track/Track.js';
import type {
  LavalinkException,
  NodeStats,
  PlayerState,
  TrackEndReason,
  WebSocketPayload,
  VoiceState,
} from './api.js';

/** Events emitted by the {@link Junie} client. */
export interface JunieEvents<TRequester = unknown> {
  /** A node connected (fresh or resumed). */
  nodeConnect: (node: Node) => void;
  /** A node successfully resumed a previous session. */
  nodeResumed: (node: Node) => void;
  /** A node's WebSocket closed and a reconnect is being scheduled. */
  nodeDisconnect: (node: Node, info: { code: number; reason: string }) => void;
  /** A node's next reconnect attempt has been scheduled. */
  nodeReconnecting: (node: Node, info: { attempt: number; delay: number }) => void;
  /** A node gave up reconnecting (max retries hit). */
  nodeReconnectFailed: (node: Node) => void;
  /** A node-level error (socket / handshake / dispatch). */
  nodeError: (node: Node, error: Error) => void;
  /** Periodic stats update from a node. */
  nodeStats: (node: Node, stats: NodeStats) => void;
  /** A node was deliberately disconnected and removed. */
  nodeDestroy: (node: Node) => void;
  /** A player was created. */
  playerCreate: (player: Player<TRequester>) => void;
  /** A player was destroyed. */
  playerDestroy: (player: Player<TRequester>, reason: string) => void;
  /** The bot was moved to another voice channel. */
  playerMove: (player: Player<TRequester>, oldChannelId: string, newChannelId: string) => void;
  /** The bot left voice (kicked, moved out, or disconnect()). */
  playerDisconnect: (player: Player<TRequester>, voiceChannelId: string | null) => void;
  /** Discord closed the player's voice WebSocket. */
  playerVoiceClosed: (player: Player<TRequester>, info: { code: number; reason: string; byRemote: boolean }) => void;
  /** A track started playing. */
  trackStart: (player: Player<TRequester>, track: Track<TRequester>) => void;
  /** A track ended. */
  trackEnd: (player: Player<TRequester>, track: Track<TRequester>, reason: TrackEndReason) => void;
  /** A track threw an exception while playing/loading. */
  trackError: (player: Player<TRequester>, track: Track<TRequester> | null, exception: LavalinkException) => void;
  /** A track got stuck (exceeded its stuck threshold). */
  trackStuck: (player: Player<TRequester>, track: Track<TRequester>, thresholdMs: number) => void;
  /** The queue ran dry (and autoplay is off). */
  queueEnd: (player: Player<TRequester>) => void;
  /** A playerUpdate arrived from Lavalink (position / ping / connected). */
  playerUpdate: (player: Player<TRequester>, state: PlayerState) => void;
  /** Every raw WebSocket payload, before dispatch (debug / telemetry). */
  raw: (node: Node, payload: WebSocketPayload) => void;
}

/** Events emitted by each {@link Player} (also mirrored on the client). */
export interface PlayerEvents<TRequester = unknown> {
  trackStart: (player: Player<TRequester>, track: Track<TRequester>) => void;
  trackEnd: (player: Player<TRequester>, track: Track<TRequester>, reason: TrackEndReason) => void;
  trackError: (player: Player<TRequester>, track: Track<TRequester> | null, exception: LavalinkException) => void;
  trackStuck: (player: Player<TRequester>, track: Track<TRequester>, thresholdMs: number) => void;
  queueEnd: (player: Player<TRequester>) => void;
  playerUpdate: (player: Player<TRequester>, state: PlayerState) => void;
  playerVoiceClosed: (player: Player<TRequester>, info: { code: number; reason: string; byRemote: boolean }) => void;
  playerDisconnect: (player: Player<TRequester>, voiceChannelId: string | null) => void;
  playerMove: (player: Player<TRequester>, oldChannelId: string, newChannelId: string) => void;
  playerDestroy: (player: Player<TRequester>, reason: string) => void;
}

/** Events emitted by each {@link Node}. */
export interface NodeEvents {
  connect: (node: Node) => void;
  resumed: (node: Node) => void;
  disconnect: (node: Node, info: { code: number; reason: string }) => void;
  reconnecting: (node: Node, info: { attempt: number; delay: number }) => void;
  reconnectFailed: (node: Node) => void;
  error: (node: Node, error: Error) => void;
  stats: (node: Node, stats: NodeStats) => void;
  destroy: (node: Node) => void;
  /** Internal: the REST layer hit a 404 for our own session. */
  sessionInvalid: (node: Node) => void;
  /**
   * The server reported a Lavalink version whose major differs from the
   * version Junie targets (protocol-drift early warning).
   */
  versionMismatch: (node: Node, info: { version: string; expected: number }) => void;
  raw: (node: Node, payload: WebSocketPayload) => void;
}

/** Voice state as assembled by the client while joining a channel. */
export type PartialVoiceState = Partial<VoiceState>;

/** A track-ish object acceptable in queues. */
export type QueueableTrack<TRequester = unknown> = Track<TRequester> | UnresolvedTrack<TRequester>;
