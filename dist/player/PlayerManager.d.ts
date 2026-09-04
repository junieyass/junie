/**
 * Junie — the guild player registry.
 */
import type { Junie } from '../Junie.js';
import { Player } from './Player.js';
import type { PlayerOptions } from '../types/options.js';
/**
 * Registry of all guild players. Access it through `junie.players` or the
 * `junie.createPlayer` shortcut.
 */
export declare class PlayerManager<TRequester = unknown> {
    private readonly junie;
    private readonly players;
    /** @internal */
    constructor(junie: Junie<TRequester>);
    /**
     * Create a player for a guild.
     *
     * - if a player already exists, its voice/text channels are updated and
     *   the existing instance is returned (idempotent)
     * - the node is chosen by the client's selection strategy unless
     *   `options.node` pins one
     */
    create(options: PlayerOptions): Player<TRequester>;
    /** Fetch a player by guild id. */
    get(guildId: string): Player<TRequester> | undefined;
    /** Fetch a player or throw `PLAYER_NOT_FOUND`. */
    require(guildId: string): Player<TRequester>;
    /** Whether a guild has a live player. */
    has(guildId: string): boolean;
    /** All players. */
    list(): Player<TRequester>[];
    /** All players bound to a specific node. */
    listByNode(nodeId: string): Player<TRequester>[];
    /** Number of players. */
    get size(): number;
    /** @internal Remove a player (called by Player#destroy). Pass the instance to avoid removing a newer player created for the same guild. */
    remove(guildId: string, instance?: Player<TRequester>): boolean;
    /** Destroy every player (used by `Junie#destroy`). */
    destroyAll(reason?: string): Promise<void>;
    private resolveNode;
}
//# sourceMappingURL=PlayerManager.d.ts.map