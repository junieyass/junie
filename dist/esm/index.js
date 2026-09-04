/**
 * Junie — a production-grade, developer-first Lavalink v4 client
 * for Node.js and TypeScript.
 *
 * ```ts
 * import { Junie } from 'junie';
 *
 * const junie = new Junie({ nodes: [...], sendToShard });
 * junie.init(userId);
 * ```
 */
// Core client
export { Junie } from './Junie.js';
// Nodes
export { Node, defaultWebSocketFactory } from './node/Node.js';
export { NodeManager } from './node/NodeManager.js';
export { RestManager } from './node/Rest.js';
// Strategies
export { PenaltyStrategy, DefaultPenaltyProvider } from './node/strategies/PenaltyStrategy.js';
export { RoundRobinStrategy, LeastPlayersStrategy, LeastLoadStrategy, } from './node/strategies/index.js';
// Players
export { Player, defaultAutoplayResolver } from './player/Player.js';
export { PlayerManager } from './player/PlayerManager.js';
export { FilterManager } from './player/FilterManager.js';
// Queue
export { Queue, normalizeQueueInput } from './queue/Queue.js';
export { MemoryQueueStore } from './queue/QueueStore.js';
// Tracks
export { Track, UnresolvedTrack, reviveTrackLike } from './track/Track.js';
export { SearchResult, buildSearchIdentifier, buildSearchResult } from './track/SearchResult.js';
// Errors
export { JunieError, JunieRestError, VoiceConnectionError, TrackLoadError, JunieErrorCode, } from './errors.js';
// Utilities
export { Logger, createDefaultLogger } from './utils/Logger.js';
export { TypedEmitter } from './utils/TypedEmitter.js';
export { sleep, withTimeout, clamp, isUrl, hasSearchPrefix, formatDuration, createRng, shuffleInPlace, applyJitter, backoffDelay, isPlainObject, buildQueryString, } from './utils/Helpers.js';
export { parseVoiceRegion, regionZone, regionPenalty, VOICE_ZONES, } from './utils/Regions.js';
// Constants
export { JUNIE_VERSION, SOURCE_PREFIXES, DEFAULTS } from './constants.js';
// Types
export * from './types/index.js';
//# sourceMappingURL=index.js.map