/**
 * Junie — node selection strategies.
 *
 * A strategy decides which node serves a new player or search request.
 * Strategies must be deterministic, side-effect free, and must throw
 * {@link JunieError} with code `NO_HEALTHY_NODES` when nothing is healthy.
 */

import type { Node } from '../Node.js';

export interface NodeSelectionContext {
  /** Voice endpoint (from Discord) for region-aware decisions. */
  voiceEndpoint?: string | null;
  /** Node ids to skip (e.g. the node a player is migrating away from). */
  exclude?: ReadonlySet<string>;
}

export interface NodeSelectionStrategy {
  /** Pick the best node for the given context. */
  select(nodes: readonly Node[], context?: NodeSelectionContext): Node;
}

/** A strategy that decides purely from computed penalty scores. */
export interface PenaltyProvider {
  /**
   * Compute the total penalty of a node. Lower is better.
   * The default provider implements:
   *   P = playingPlayers + (1.05 ^ (100 * systemLoad) - 1)
   *       + 10 * nulledFrames + 20 * deficitFrames
   *       + region penalty (0 / 250 / 1000)
   */
  compute(node: Node, voiceEndpoint?: string | null): number;
}
