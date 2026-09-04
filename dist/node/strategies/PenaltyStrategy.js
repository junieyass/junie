"use strict";
/**
 * Junie — the default, penalty-based least-load strategy.
 *
 * The score aggregates streaming load, CPU saturation, frame loss and
 * geographic distance into a single number; the node with the lowest total
 * penalty wins. Bring your own scoring via a custom {@link PenaltyProvider}.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PenaltyStrategy = exports.DefaultPenaltyProvider = void 0;
const errors_js_1 = require("../../errors.js");
const Regions_js_1 = require("../../utils/Regions.js");
/**
 * The reference penalty provider.
 *
 * - `P_player`  — number of actively playing players.
 * - `P_cpu`     — `1.05^(100 * systemLoad) - 1`: near-zero until CPU
 *                 approaches saturation, then grows exponentially.
 * - `P_frame`   — `10 * nulled + 20 * deficit`: degraded voice frames
 *                 indicate a struggling host.
 * - `P_region`  — 0 (same zone / unconfigured), 250 (unknown), 1000 (cross-zone).
 */
class DefaultPenaltyProvider {
    compute(node, voiceEndpoint) {
        const stats = node.stats;
        if (!stats)
            return Number.POSITIVE_INFINITY;
        const playerPenalty = stats.playingPlayers;
        const cpuPenalty = Math.pow(1.05, 100 * stats.cpu.systemLoad) - 1;
        const framePenalty = stats.frameStats
            ? 10 * stats.frameStats.nulled + 20 * stats.frameStats.deficit
            : 0;
        const region = (0, Regions_js_1.regionPenalty)(node.regions, voiceEndpoint);
        return playerPenalty + cpuPenalty + framePenalty + region;
    }
}
exports.DefaultPenaltyProvider = DefaultPenaltyProvider;
/**
 * Picks the healthy node with the lowest penalty score.
 * This is Junie's default strategy.
 */
class PenaltyStrategy {
    provider;
    constructor(provider = new DefaultPenaltyProvider()) {
        this.provider = provider;
    }
    select(nodes, context) {
        const candidates = nodes.filter((node) => node.connected && !(context?.exclude?.has(node.id) ?? false));
        if (candidates.length === 0) {
            throw new errors_js_1.JunieError(errors_js_1.JunieErrorCode.NO_HEALTHY_NODES, 'No healthy Lavalink node is connected.');
        }
        let best = candidates[0];
        let bestScore = Number.POSITIVE_INFINITY;
        for (const node of candidates) {
            const score = this.provider.compute(node, context?.voiceEndpoint);
            if (score < bestScore) {
                bestScore = score;
                best = node;
            }
        }
        return best;
    }
}
exports.PenaltyStrategy = PenaltyStrategy;
//# sourceMappingURL=PenaltyStrategy.js.map