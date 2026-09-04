/**
 * Junie — Lavalink v4 protocol types.
 *
 * These types mirror the Lavalink v4 REST & WebSocket API exactly.
 * They are intentionally raw: Junie's structures (Node, Player, Track, ...)
 * consume and produce these shapes when talking to a Lavalink server.
 *
 * @see https://lavalink.dev/api/index.html
 */

// ---------------------------------------------------------------------------
// Tracks
// ---------------------------------------------------------------------------

/** Metadata attached to a decoded track by Lavalink. */
export interface TrackInfo {
  /** The track's identifier on its source platform (e.g. YouTube video id). */
  identifier: string;
  /** Whether the track can be seeked. */
  isSeekable: boolean;
  /** The author / uploader of the track. */
  author: string;
  /** Track length in milliseconds (0 for streams). */
  length: number;
  /** Whether the track is a live stream. */
  isStream: boolean;
  /** Requested start position in milliseconds. */
  position: number;
  /** The track title. */
  title: string;
  /** The source URI of the track, if available. */
  uri: string | null;
  /** Artwork URL of the track, if available. */
  artworkUrl: string | null;
  /** The ISRC of the track, if available. */
  isrc: string | null;
  /** The name of the source that produced the track (e.g. "youtube"). */
  sourceName: string;
}

/** A raw track object as returned by Lavalink. */
export interface APITrack {
  /** The base64-encoded track string. */
  encoded: string;
  info: TrackInfo;
  /** Additional data attached by Lavalink plugins. */
  pluginInfo?: Record<string, unknown>;
  /** Arbitrary user data attached to the track. */
  userData?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Track loading
// ---------------------------------------------------------------------------

/** The outcome of a `/v4/loadtracks` call. */
export type LoadType = 'track' | 'playlist' | 'search' | 'empty' | 'error';

/** Severity of a Lavalink exception. */
export type Severity = 'common' | 'suspicious' | 'fault';

/** A Lavalink exception payload. */
export interface LavalinkException {
  message: string;
  severity: Severity;
  /** The cause of the exception, if provided. */
  cause?: string;
}

/** Playlist metadata attached to playlist load results. */
export interface PlaylistInfo {
  name: string;
  /** Index of the selected track, -1 if none. */
  selectedTrack: number;
}

/**
 * Raw response of `GET /v4/loadtracks`.
 *
 * The shape of `data` depends on `loadType`:
 * - `track`    -> a single {@link APITrack}
 * - `playlist` -> an array of {@link APITrack}
 * - `search`   -> an array of {@link APITrack}
 * - `empty`    -> an empty object
 * - `error`    -> a {@link LavalinkException}
 */
export interface LoadTracksResponse {
  loadType: LoadType;
  playlistInfo: PlaylistInfo;
  data: APITrack | APITrack[] | LavalinkException | Record<string, never>;
}

// ---------------------------------------------------------------------------
// Players
// ---------------------------------------------------------------------------

/** Voice credentials forwarded to Lavalink so it can join Discord voice. */
export interface VoiceState {
  /** The voice token from `VOICE_SERVER_UPDATE`. */
  token: string;
  /** The voice endpoint from `VOICE_SERVER_UPDATE` (e.g. "eu-central123.discord.media"). */
  endpoint: string;
  /** The Discord voice session id from `VOICE_STATE_UPDATE`. */
  sessionId: string;
  /**
   * The voice channel id. Required by Lavalink v4.2+ (DAVE / E2EE support).
   */
  channelId: string | null;
}

/** Lavalink-side player state, reported through `playerUpdate` and REST. */
export interface PlayerState {
  /** Milliseconds since epoch when this state was measured. */
  time: number;
  /** Playback position in milliseconds. */
  position: number;
  /** Whether Lavalink is connected to Discord voice. */
  connected: boolean;
  /** Round-trip latency to Discord voice, in milliseconds (-1 if unknown). */
  ping: number;
}

/** The reason a track ended, as reported by `TrackEndEvent`. */
export type TrackEndReason = 'finished' | 'loadFailed' | 'stopped' | 'replaced' | 'cleanup';

/** A player as seen by the Lavalink REST API. */
export interface APIPlayer {
  guildId: string;
  voice: VoiceState | null;
  volume: number;
  paused: boolean;
  state: PlayerState;
  track?: APITrack | null;
  filters: FiltersPayload;
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

/** An equalizer band. `band` is 0–14, `gain` is -0.25 to 1.0. */
export interface EqualizerBand {
  band: number;
  gain: number;
}

export interface KaraokeSettings {
  /** Overall effect level (0.0–1.0). */
  level: number;
  /** Level applied to the mono channel (0.0–1.0). */
  monoLevel: number;
  /** The band to filter (Hz). */
  filterBand: number;
  /** The filter width (Hz). */
  filterWidth: number;
}

export interface TimescaleSettings {
  /** Playback speed multiplier (> 0). */
  speed: number;
  /** Pitch multiplier (> 0). */
  pitch: number;
  /** Combined rate multiplier (> 0). */
  rate: number;
}

export interface TremoloSettings {
  /** Oscillation frequency in Hz (> 0). */
  frequency: number;
  /** Oscillation depth (0.0–1.0). */
  depth: number;
}

export interface VibratoSettings {
  /** Oscillation frequency in Hz (0.0–14.0). */
  frequency: number;
  /** Oscillation depth (0.0–1.0). */
  depth: number;
}

export interface RotationSettings {
  /** Rotations per second (a.k.a. "8D audio" when non-zero). */
  rotationHz: number;
}

export interface DistortionSettings {
  sinOffset: number;
  sinScale: number;
  cosOffset: number;
  cosScale: number;
  tanOffset: number;
  tanScale: number;
  offset: number;
  scale: number;
}

export interface ChannelMixSettings {
  /** 0.0–1.0 — left channel mixed into left. */
  leftToLeft: number;
  /** 0.0–1.0 — left channel mixed into right. */
  leftToRight: number;
  /** 0.0–1.0 — right channel mixed into left. */
  rightToLeft: number;
  /** 0.0–1.0 — right channel mixed into right. */
  rightToRight: number;
}

export interface LowPassSettings {
  /** Smoothing factor (>= 1.0). Higher values remove more high frequencies. */
  smoothing: number;
}

/** All Lavalink v4 filters. `undefined` filters are left untouched server-side. */
export interface FiltersPayload {
  /** Linear output gain (0.0–5.0). Independent of player volume. */
  volume?: number;
  equalizer?: EqualizerBand[];
  karaoke?: KaraokeSettings;
  timescale?: TimescaleSettings;
  tremolo?: TremoloSettings;
  vibrato?: VibratoSettings;
  rotation?: RotationSettings;
  distortion?: DistortionSettings;
  channelMix?: ChannelMixSettings;
  lowPass?: LowPassSettings;
  /** Filter payload consumed by Lavalink plugins. */
  pluginFilters?: Record<string, Record<string, unknown>>;
}

// ---------------------------------------------------------------------------
// Update player (REST)
// ---------------------------------------------------------------------------

/** Body for `PATCH /v4/sessions/{sessionId}/players/{guildId}`. */
export interface UpdatePlayerPayload {
  /** The track to play. Omit to leave the track untouched. */
  track?: {
    /** Base64-encoded track, or null to stop. */
    encoded?: string | null;
    /** A raw identifier to load instead of an encoded track. */
    identifier?: string;
    /** Custom user data attached to the track. */
    userData?: Record<string, unknown>;
  } | null;
  /** Seek position in milliseconds. */
  position?: number;
  /** Stop playing at this position (milliseconds). */
  endTime?: number;
  /** Player volume (0–1000, where 100 = 100%). */
  volume?: number;
  /** Whether the player is paused. */
  paused?: boolean;
  /** Voice credentials. */
  voice?: VoiceState;
  /** Filters to apply. */
  filters?: FiltersPayload;
}

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

export interface MemoryStats {
  free: number;
  used: number;
  allocated: number;
  reservable: number;
}

export interface CpuStats {
  cores: number;
  /** Total host system load (0.0–1.0). */
  systemLoad: number;
  /** Lavalink's own load (0.0–1.0). */
  lavalinkLoad: number;
}

export interface FrameStats {
  sent: number;
  nulled: number;
  deficit: number;
}

export interface NodeStats {
  op: 'stats';
  players: number;
  playingPlayers: number;
  /** Uptime in milliseconds. */
  uptime: number;
  memory: MemoryStats;
  cpu: CpuStats;
  frameStats?: FrameStats;
}

// ---------------------------------------------------------------------------
// Info / version
// ---------------------------------------------------------------------------

export interface PluginInfo {
  name: string;
  version: string;
}

export interface NodeInfo {
  version: { semver: string; major: number; minor: number; patch: number };
  buildTime: number;
  git: { commit: string; commitTime: number };
  /** Lavalink v4.x — enabled source managers. */
  enabledSources?: Record<string, boolean>;
  /** Lavalink v4.x — configured Lavalink plugins. */
  plugins?: PluginInfo[];
  /** @deprecated use enabledSources / plugins */
  lavaplayer?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// WebSocket payloads (server -> client)
// ---------------------------------------------------------------------------

/** Dispatched by Lavalink once the WebSocket session is established. */
export interface ReadyPayload {
  op: 'ready';
  /** Whether a previous session was resumed. */
  resumed: boolean;
  /** The session id used for all REST player operations. */
  sessionId: string;
}

export interface PlayerUpdatePayload {
  op: 'playerUpdate';
  guildId: string;
  state: PlayerState;
}

/** Discriminated union of all Lavalink track/voice events. */
export type LavalinkEvent =
  | TrackStartEvent
  | TrackEndEvent
  | TrackExceptionEvent
  | TrackStuckEvent
  | WebSocketClosedEvent;

interface EventBase {
  op: 'event';
  guildId: string;
}

export interface TrackStartEvent extends EventBase {
  type: 'TrackStartEvent';
  track: APITrack;
}

export interface TrackEndEvent extends EventBase {
  type: 'TrackEndEvent';
  track: APITrack;
  reason: TrackEndReason;
}

export interface TrackExceptionEvent extends EventBase {
  type: 'TrackExceptionEvent';
  track: APITrack;
  exception: LavalinkException;
}

export interface TrackStuckEvent extends EventBase {
  type: 'TrackStuckEvent';
  track: APITrack;
  thresholdMs: number;
}

export interface WebSocketClosedEvent extends EventBase {
  type: 'WebSocketClosedEvent';
  /** Discord voice WebSocket close code. */
  code: number;
  reason: string;
  /** Whether the voice server closed the connection (vs. the client side). */
  byRemote: boolean;
}

/** Any message Lavalink may push over the WebSocket. */
export type WebSocketPayload =
  | ReadyPayload
  | NodeStats
  | PlayerUpdatePayload
  | LavalinkEvent;

// ---------------------------------------------------------------------------
// REST error shape
// ---------------------------------------------------------------------------

/** The error body Lavalink returns for failed REST calls. */
export interface LavalinkErrorBody {
  timestamp: number;
  status: number;
  error: string;
  message: string;
  path: string;
  trace?: string;
}

// ---------------------------------------------------------------------------
// Route planner (ops)
// ---------------------------------------------------------------------------

export interface RoutePlannerStatus {
  class: string;
  details: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Discord gateway voice packets (raw)
// ---------------------------------------------------------------------------

/** The payload Junie hands to `sendToShard` (Discord gateway op 4). */
export interface VoiceGatewayPayload {
  op: 4;
  d: {
    guild_id: string;
    channel_id: string | null;
    self_mute: boolean;
    self_deaf: boolean;
  };
}

/**
 * A raw gateway dispatch forwarded to `Junie#sendRawData`.
 * Only `VOICE_STATE_UPDATE` and `VOICE_SERVER_UPDATE` are consumed.
 */
export interface RawGatewayPacket {
  t?: string | null;
  d?: Record<string, unknown>;
}
