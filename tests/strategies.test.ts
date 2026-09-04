/**
 * Unit tests for node selection strategies.
 */

import { describe, expect, it, beforeEach } from 'vitest';
import { Junie } from '../src/Junie.js';
import { PenaltyStrategy, DefaultPenaltyProvider } from '../src/node/strategies/PenaltyStrategy.js';
import {
  RoundRobinStrategy,
  LeastPlayersStrategy,
  LeastLoadStrategy,
} from '../src/node/strategies/index.js';
import { JunieErrorCode } from '../src/errors.js';
import type { Node } from '../src/node/Node.js';
import { makeStats, resetSockets, fakeWebSocketFactory } from './fixtures.js';

function makeNodes(count: number): Node[] {
  resetSockets();
  const junie = new Junie({
    nodes: Array.from({ length: count }, (_, i) => ({
      id: `n${i}`,
      host: 'localhost',
      port: 2333 + i,
      authorization: 'pass',
    })),
    sendToShard: async () => undefined,
    logLevel: 'silent',
    webSocketFactory: fakeWebSocketFactory,
  });
  junie.init('1');
  return junie.nodes.list();
}

function healthy(nodes: Node[]): Node[] {
  for (const node of nodes) {
    node.connected = true;
    node.stats = makeStats();
  }
  return nodes;
}

describe('PenaltyStrategy (default)', () => {
  let nodes: Node[];

  beforeEach(() => {
    nodes = healthy(makeNodes(3));
  });

  it('prefers the least-loaded node by players', () => {
    nodes[0]!.stats = makeStats({ playingPlayers: 10 });
    nodes[1]!.stats = makeStats({ playingPlayers: 2 });
    nodes[2]!.stats = makeStats({ playingPlayers: 5 });
    expect(new PenaltyStrategy().select(nodes).id).toBe('n1');
  });

  it('weighs CPU saturation exponentially', () => {
    nodes[0]!.stats = makeStats({ systemLoad: 0.95, playingPlayers: 0 });
    nodes[1]!.stats = makeStats({ systemLoad: 0.1, playingPlayers: 8 });
    nodes[2]!.stats = makeStats({ systemLoad: 0.95, playingPlayers: 100 });
    const strategy = new PenaltyStrategy();
    // Saturated CPU (~130 penalty) dwarfs 8 players, but not 100 players + 130.
    expect(strategy.select(nodes).id).toBe('n1');
  });

  it('penalizes frame loss (nulled & deficit)', () => {
    nodes[0]!.stats = makeStats({ nulled: 5, deficit: 3, playingPlayers: 0 });
    nodes[1]!.stats = makeStats({ playingPlayers: 3 });
    nodes[2]!.stats = makeStats({ playingPlayers: 2 });
    // n0: 5*10 + 3*20 = 110; n2: 2 -> winner is n2.
    expect(new PenaltyStrategy().select(nodes).id).toBe('n2');
  });

  it('applies region penalties from the voice endpoint', () => {
    nodes[0]!.regions; // read-only empty
    const junie = new Junie({
      nodes: [
        { id: 'eu-node', host: 'localhost', port: 1, authorization: 'x', regions: ['europe'] },
        { id: 'us-node', host: 'localhost', port: 2, authorization: 'x', regions: ['north-america'] },
      ],
      sendToShard: async () => undefined,
      logLevel: 'silent',
      webSocketFactory: fakeWebSocketFactory,
    });
    junie.init('1');
    const [eu, us] = junie.nodes.list();
    eu!.connected = true;
    us!.connected = true;
    eu!.stats = makeStats({ playingPlayers: 1 });
    us!.stats = makeStats({ playingPlayers: 1 });

    const strategy = new PenaltyStrategy();
    // Voice endpoint in eu-central: same zone as the eu-node (penalty 0),
    // cross-zone for the us-node (penalty 1000).
    expect(strategy.select([eu!, us!], { voiceEndpoint: 'eu-central586.discord.media' }).id).toBe('eu-node');
    expect(strategy.select([eu!, us!], { voiceEndpoint: 'us-west77.discord.media' }).id).toBe('us-node');
  });

  it('excludes disconnected nodes and honours the exclude set', () => {
    nodes[1]!.connected = false;
    const strategy = new PenaltyStrategy();
    expect(strategy.select(nodes).id).not.toBe('n1');
    expect(strategy.select(nodes, { exclude: new Set(['n2']) }).id).toBe('n0');
  });

  it('throws NO_HEALTHY_NODES when nothing is connected', () => {
    nodes.forEach((node) => (node.connected = false));
    expect(() => new PenaltyStrategy().select(nodes)).toThrowError(JunieErrorCode.NO_HEALTHY_NODES);
  });

  it('treats missing stats as infinitely unattractive', () => {
    nodes[0]!.stats = null;
    nodes[2]!.stats = null;
    nodes[1]!.stats = makeStats({ playingPlayers: 50 });
    expect(new PenaltyStrategy().select(nodes).id).toBe('n1');
  });
});

describe('DefaultPenaltyProvider formula', () => {
  it('computes players + cpu + frames + region', () => {
    resetSockets();
    const junie = new Junie({
      nodes: [{ id: 'n', host: 'localhost', authorization: 'x', regions: ['europe'] }],
      sendToShard: async () => undefined,
      logLevel: 'silent',
      webSocketFactory: fakeWebSocketFactory,
    });
    junie.init('1');
    const node = junie.nodes.list()[0]!;
    node.stats = makeStats({ playingPlayers: 3, systemLoad: 0.5, nulled: 2, deficit: 1 });

    const provider = new DefaultPenaltyProvider();
    // 3 + (1.05^50 - 1) + (2*10 + 1*20) + 0 (same region)
    const expected = 3 + (Math.pow(1.05, 50) - 1) + 40;
    expect(provider.compute(node, 'eu-central1.discord.media')).toBeCloseTo(expected, 5);
    // Unknown endpoint -> +250.
    expect(provider.compute(node, null)).toBeCloseTo(expected + 250, 5);
    // Cross-region endpoint -> +1000.
    expect(provider.compute(node, 'us-east1.discord.media')).toBeCloseTo(expected + 1000, 5);
  });
});

describe('Alternative strategies', () => {
  it('round-robins across healthy nodes', () => {
    const nodes = healthy(makeNodes(3));
    const strategy = new RoundRobinStrategy();
    expect(strategy.select(nodes).id).toBe('n0');
    expect(strategy.select(nodes).id).toBe('n1');
    expect(strategy.select(nodes).id).toBe('n2');
    expect(strategy.select(nodes).id).toBe('n0');
  });

  it('picks the node with the fewest players', () => {
    const nodes = healthy(makeNodes(3));
    nodes[0]!.stats = makeStats({ players: 9 });
    nodes[1]!.stats = makeStats({ players: 4 });
    nodes[2]!.stats = makeStats({ players: 6 });
    expect(new LeastPlayersStrategy().select(nodes).id).toBe('n1');
  });

  it('picks the node with the lowest lavalink load', () => {
    const nodes = healthy(makeNodes(3));
    nodes[0]!.stats = makeStats({ lavalinkLoad: 0.4 });
    nodes[1]!.stats = makeStats({ lavalinkLoad: 0.7 });
    nodes[2]!.stats = makeStats({ lavalinkLoad: 0.1 });
    expect(new LeastLoadStrategy().select(nodes).id).toBe('n2');
  });

  it('all throw when nothing is healthy', () => {
    const nodes = makeNodes(2);
    for (const strategy of [
      new RoundRobinStrategy(),
      new LeastPlayersStrategy(),
      new LeastLoadStrategy(),
    ]) {
      expect(() => strategy.select(nodes)).toThrowError(JunieErrorCode.NO_HEALTHY_NODES);
    }
  });
});
