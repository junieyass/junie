"use strict";
/**
 * Junie — alternative node selection strategies.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.LeastLoadStrategy = exports.LeastPlayersStrategy = exports.RoundRobinStrategy = void 0;
const errors_js_1 = require("../../errors.js");
function healthyCandidates(nodes, context) {
    return nodes.filter((node) => node.connected && !(context?.exclude?.has(node.id) ?? false));
}
function requireCandidates(nodes, context) {
    const candidates = healthyCandidates(nodes, context);
    if (candidates.length === 0) {
        throw new errors_js_1.JunieError(errors_js_1.JunieErrorCode.NO_HEALTHY_NODES, 'No healthy Lavalink node is connected.');
    }
    return candidates;
}
/**
 * Round-robin across healthy nodes. Even, predictable distribution; ignores
 * node telemetry. Good for identical, geographically co-located nodes.
 */
class RoundRobinStrategy {
    index = 0;
    select(nodes, context) {
        const candidates = requireCandidates(nodes, context);
        const node = candidates[this.index % candidates.length];
        this.index = (this.index + 1) % Math.max(1, candidates.length);
        return node;
    }
}
exports.RoundRobinStrategy = RoundRobinStrategy;
/** Always picks the node with the fewest total players. */
class LeastPlayersStrategy {
    select(nodes, context) {
        const candidates = requireCandidates(nodes, context);
        return candidates.reduce((min, node) => (node.stats?.players ?? Number.POSITIVE_INFINITY) <
            (min.stats?.players ?? Number.POSITIVE_INFINITY)
            ? node
            : min);
    }
}
exports.LeastPlayersStrategy = LeastPlayersStrategy;
/** Always picks the node with the lowest Lavalink-side CPU load. */
class LeastLoadStrategy {
    select(nodes, context) {
        const candidates = requireCandidates(nodes, context);
        return candidates.reduce((min, node) => (node.stats?.cpu.lavalinkLoad ?? Number.POSITIVE_INFINITY) <
            (min.stats?.cpu.lavalinkLoad ?? Number.POSITIVE_INFINITY)
            ? node
            : min);
    }
}
exports.LeastLoadStrategy = LeastLoadStrategy;
//# sourceMappingURL=index.js.map