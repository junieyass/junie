"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULTS = exports.SOURCE_PREFIXES = exports.JUNIE_VERSION = exports.VOICE_ZONES = exports.regionPenalty = exports.regionZone = exports.parseVoiceRegion = exports.buildQueryString = exports.isPlainObject = exports.backoffDelay = exports.applyJitter = exports.shuffleInPlace = exports.createRng = exports.formatDuration = exports.hasSearchPrefix = exports.isUrl = exports.clamp = exports.withTimeout = exports.sleep = exports.TypedEmitter = exports.createDefaultLogger = exports.Logger = exports.JunieErrorCode = exports.TrackLoadError = exports.VoiceConnectionError = exports.JunieRestError = exports.JunieError = exports.buildSearchResult = exports.buildSearchIdentifier = exports.SearchResult = exports.reviveTrackLike = exports.UnresolvedTrack = exports.Track = exports.MemoryQueueStore = exports.normalizeQueueInput = exports.Queue = exports.FilterManager = exports.PlayerManager = exports.defaultAutoplayResolver = exports.Player = exports.LeastLoadStrategy = exports.LeastPlayersStrategy = exports.RoundRobinStrategy = exports.DefaultPenaltyProvider = exports.PenaltyStrategy = exports.RestManager = exports.NodeManager = exports.defaultWebSocketFactory = exports.Node = exports.Junie = void 0;
// Core client
var Junie_js_1 = require("./Junie.js");
Object.defineProperty(exports, "Junie", { enumerable: true, get: function () { return Junie_js_1.Junie; } });
// Nodes
var Node_js_1 = require("./node/Node.js");
Object.defineProperty(exports, "Node", { enumerable: true, get: function () { return Node_js_1.Node; } });
Object.defineProperty(exports, "defaultWebSocketFactory", { enumerable: true, get: function () { return Node_js_1.defaultWebSocketFactory; } });
var NodeManager_js_1 = require("./node/NodeManager.js");
Object.defineProperty(exports, "NodeManager", { enumerable: true, get: function () { return NodeManager_js_1.NodeManager; } });
var Rest_js_1 = require("./node/Rest.js");
Object.defineProperty(exports, "RestManager", { enumerable: true, get: function () { return Rest_js_1.RestManager; } });
// Strategies
var PenaltyStrategy_js_1 = require("./node/strategies/PenaltyStrategy.js");
Object.defineProperty(exports, "PenaltyStrategy", { enumerable: true, get: function () { return PenaltyStrategy_js_1.PenaltyStrategy; } });
Object.defineProperty(exports, "DefaultPenaltyProvider", { enumerable: true, get: function () { return PenaltyStrategy_js_1.DefaultPenaltyProvider; } });
var index_js_1 = require("./node/strategies/index.js");
Object.defineProperty(exports, "RoundRobinStrategy", { enumerable: true, get: function () { return index_js_1.RoundRobinStrategy; } });
Object.defineProperty(exports, "LeastPlayersStrategy", { enumerable: true, get: function () { return index_js_1.LeastPlayersStrategy; } });
Object.defineProperty(exports, "LeastLoadStrategy", { enumerable: true, get: function () { return index_js_1.LeastLoadStrategy; } });
// Players
var Player_js_1 = require("./player/Player.js");
Object.defineProperty(exports, "Player", { enumerable: true, get: function () { return Player_js_1.Player; } });
Object.defineProperty(exports, "defaultAutoplayResolver", { enumerable: true, get: function () { return Player_js_1.defaultAutoplayResolver; } });
var PlayerManager_js_1 = require("./player/PlayerManager.js");
Object.defineProperty(exports, "PlayerManager", { enumerable: true, get: function () { return PlayerManager_js_1.PlayerManager; } });
var FilterManager_js_1 = require("./player/FilterManager.js");
Object.defineProperty(exports, "FilterManager", { enumerable: true, get: function () { return FilterManager_js_1.FilterManager; } });
// Queue
var Queue_js_1 = require("./queue/Queue.js");
Object.defineProperty(exports, "Queue", { enumerable: true, get: function () { return Queue_js_1.Queue; } });
Object.defineProperty(exports, "normalizeQueueInput", { enumerable: true, get: function () { return Queue_js_1.normalizeQueueInput; } });
var QueueStore_js_1 = require("./queue/QueueStore.js");
Object.defineProperty(exports, "MemoryQueueStore", { enumerable: true, get: function () { return QueueStore_js_1.MemoryQueueStore; } });
// Tracks
var Track_js_1 = require("./track/Track.js");
Object.defineProperty(exports, "Track", { enumerable: true, get: function () { return Track_js_1.Track; } });
Object.defineProperty(exports, "UnresolvedTrack", { enumerable: true, get: function () { return Track_js_1.UnresolvedTrack; } });
Object.defineProperty(exports, "reviveTrackLike", { enumerable: true, get: function () { return Track_js_1.reviveTrackLike; } });
var SearchResult_js_1 = require("./track/SearchResult.js");
Object.defineProperty(exports, "SearchResult", { enumerable: true, get: function () { return SearchResult_js_1.SearchResult; } });
Object.defineProperty(exports, "buildSearchIdentifier", { enumerable: true, get: function () { return SearchResult_js_1.buildSearchIdentifier; } });
Object.defineProperty(exports, "buildSearchResult", { enumerable: true, get: function () { return SearchResult_js_1.buildSearchResult; } });
// Errors
var errors_js_1 = require("./errors.js");
Object.defineProperty(exports, "JunieError", { enumerable: true, get: function () { return errors_js_1.JunieError; } });
Object.defineProperty(exports, "JunieRestError", { enumerable: true, get: function () { return errors_js_1.JunieRestError; } });
Object.defineProperty(exports, "VoiceConnectionError", { enumerable: true, get: function () { return errors_js_1.VoiceConnectionError; } });
Object.defineProperty(exports, "TrackLoadError", { enumerable: true, get: function () { return errors_js_1.TrackLoadError; } });
Object.defineProperty(exports, "JunieErrorCode", { enumerable: true, get: function () { return errors_js_1.JunieErrorCode; } });
// Utilities
var Logger_js_1 = require("./utils/Logger.js");
Object.defineProperty(exports, "Logger", { enumerable: true, get: function () { return Logger_js_1.Logger; } });
Object.defineProperty(exports, "createDefaultLogger", { enumerable: true, get: function () { return Logger_js_1.createDefaultLogger; } });
var TypedEmitter_js_1 = require("./utils/TypedEmitter.js");
Object.defineProperty(exports, "TypedEmitter", { enumerable: true, get: function () { return TypedEmitter_js_1.TypedEmitter; } });
var Helpers_js_1 = require("./utils/Helpers.js");
Object.defineProperty(exports, "sleep", { enumerable: true, get: function () { return Helpers_js_1.sleep; } });
Object.defineProperty(exports, "withTimeout", { enumerable: true, get: function () { return Helpers_js_1.withTimeout; } });
Object.defineProperty(exports, "clamp", { enumerable: true, get: function () { return Helpers_js_1.clamp; } });
Object.defineProperty(exports, "isUrl", { enumerable: true, get: function () { return Helpers_js_1.isUrl; } });
Object.defineProperty(exports, "hasSearchPrefix", { enumerable: true, get: function () { return Helpers_js_1.hasSearchPrefix; } });
Object.defineProperty(exports, "formatDuration", { enumerable: true, get: function () { return Helpers_js_1.formatDuration; } });
Object.defineProperty(exports, "createRng", { enumerable: true, get: function () { return Helpers_js_1.createRng; } });
Object.defineProperty(exports, "shuffleInPlace", { enumerable: true, get: function () { return Helpers_js_1.shuffleInPlace; } });
Object.defineProperty(exports, "applyJitter", { enumerable: true, get: function () { return Helpers_js_1.applyJitter; } });
Object.defineProperty(exports, "backoffDelay", { enumerable: true, get: function () { return Helpers_js_1.backoffDelay; } });
Object.defineProperty(exports, "isPlainObject", { enumerable: true, get: function () { return Helpers_js_1.isPlainObject; } });
Object.defineProperty(exports, "buildQueryString", { enumerable: true, get: function () { return Helpers_js_1.buildQueryString; } });
var Regions_js_1 = require("./utils/Regions.js");
Object.defineProperty(exports, "parseVoiceRegion", { enumerable: true, get: function () { return Regions_js_1.parseVoiceRegion; } });
Object.defineProperty(exports, "regionZone", { enumerable: true, get: function () { return Regions_js_1.regionZone; } });
Object.defineProperty(exports, "regionPenalty", { enumerable: true, get: function () { return Regions_js_1.regionPenalty; } });
Object.defineProperty(exports, "VOICE_ZONES", { enumerable: true, get: function () { return Regions_js_1.VOICE_ZONES; } });
// Constants
var constants_js_1 = require("./constants.js");
Object.defineProperty(exports, "JUNIE_VERSION", { enumerable: true, get: function () { return constants_js_1.JUNIE_VERSION; } });
Object.defineProperty(exports, "SOURCE_PREFIXES", { enumerable: true, get: function () { return constants_js_1.SOURCE_PREFIXES; } });
Object.defineProperty(exports, "DEFAULTS", { enumerable: true, get: function () { return constants_js_1.DEFAULTS; } });
// Types
__exportStar(require("./types/index.js"), exports);
//# sourceMappingURL=index.js.map