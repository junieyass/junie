/**
 * Junie — alternative node selection strategies.
 */

import { JunieError, JunieErrorCode } from '../../errors.js';
import type { Node } from '../Node.js';
import type { NodeSelectionContext, NodeSelectionStrategy } from './Strategy.js';

function healthyCandidates(nodes: readonly Node[], context?: NodeSelectionContext): Node[] {
  return (nodes as Node[]).filter(
    (node) => node.connected && !(context?.exclude?.has(node.id) ?? false),
  );
}

function requireCandidates(nodes: readonly Node[], context?: NodeSelectionContext): Node[] {
  const candidates = healthyCandidates(nodes, context);
  if (candidates.length === 0) {
    throw new JunieError(
      JunieErrorCode.NO_HEALTHY_NODES,
      'No healthy Lavalink node is connected.',
    );
  }
  return candidates;
}

/**
 * Round-robin across healthy nodes. Even, predictable distribution; ignores
 * node telemetry. Good for identical, geographically co-located nodes.
 */
export class RoundRobinStrategy implements NodeSelectionStrategy {
  private index = 0;

  public select(nodes: readonly Node[], context?: NodeSelectionContext): Node {
    const candidates = requireCandidates(nodes, context);
    const node = candidates[this.index % candidates.length]!;
    this.index = (this.index + 1) % Math.max(1, candidates.length);
    return node;
  }
}

/** Always picks the node with the fewest total players. */
export class LeastPlayersStrategy implements NodeSelectionStrategy {
  public select(nodes: readonly Node[], context?: NodeSelectionContext): Node {
    const candidates = requireCandidates(nodes, context);
    return candidates.reduce((min, node) =>
      (node.stats?.players ?? Number.POSITIVE_INFINITY) <
      (min.stats?.players ?? Number.POSITIVE_INFINITY)
        ? node
        : min,
    );
  }
}

/** Always picks the node with the lowest Lavalink-side CPU load. */
export class LeastLoadStrategy implements NodeSelectionStrategy {
  public select(nodes: readonly Node[], context?: NodeSelectionContext): Node {
    const candidates = requireCandidates(nodes, context);
    return candidates.reduce((min, node) =>
      (node.stats?.cpu.lavalinkLoad ?? Number.POSITIVE_INFINITY) <
      (min.stats?.cpu.lavalinkLoad ?? Number.POSITIVE_INFINITY)
        ? node
        : min,
    );
  }
}
