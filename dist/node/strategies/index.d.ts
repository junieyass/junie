/**
 * Junie — alternative node selection strategies.
 */
import type { Node } from '../Node.js';
import type { NodeSelectionContext, NodeSelectionStrategy } from './Strategy.js';
/**
 * Round-robin across healthy nodes. Even, predictable distribution; ignores
 * node telemetry. Good for identical, geographically co-located nodes.
 */
export declare class RoundRobinStrategy implements NodeSelectionStrategy {
    private index;
    select(nodes: readonly Node[], context?: NodeSelectionContext): Node;
}
/** Always picks the node with the fewest total players. */
export declare class LeastPlayersStrategy implements NodeSelectionStrategy {
    select(nodes: readonly Node[], context?: NodeSelectionContext): Node;
}
/** Always picks the node with the lowest Lavalink-side CPU load. */
export declare class LeastLoadStrategy implements NodeSelectionStrategy {
    select(nodes: readonly Node[], context?: NodeSelectionContext): Node;
}
//# sourceMappingURL=index.d.ts.map