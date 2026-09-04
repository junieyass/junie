/**
 * Junie — the default, penalty-based least-load strategy.
 *
 * The score aggregates streaming load, CPU saturation, frame loss and
 * geographic distance into a single number; the node with the lowest total
 * penalty wins. Bring your own scoring via a custom {@link PenaltyProvider}.
 */
import type { Node } from '../Node.js';
import type { NodeSelectionContext, NodeSelectionStrategy, PenaltyProvider } from './Strategy.js';
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
export declare class DefaultPenaltyProvider implements PenaltyProvider {
    compute(node: Node, voiceEndpoint?: string | null): number;
}
/**
 * Picks the healthy node with the lowest penalty score.
 * This is Junie's default strategy.
 */
export declare class PenaltyStrategy implements NodeSelectionStrategy {
    private readonly provider;
    constructor(provider?: PenaltyProvider);
    select(nodes: readonly Node[], context?: NodeSelectionContext): Node;
}
//# sourceMappingURL=PenaltyStrategy.d.ts.map