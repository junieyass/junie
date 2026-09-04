"use strict";
/**
 * Junie — the guild player registry.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlayerManager = void 0;
const errors_js_1 = require("../errors.js");
const Player_js_1 = require("./Player.js");
/**
 * Registry of all guild players. Access it through `junie.players` or the
 * `junie.createPlayer` shortcut.
 */
class PlayerManager {
    junie;
    players = new Map();
    /** @internal */
    constructor(junie) {
        this.junie = junie;
    }
    /**
     * Create a player for a guild.
     *
     * - if a player already exists, its voice/text channels are updated and
     *   the existing instance is returned (idempotent)
     * - the node is chosen by the client's selection strategy unless
     *   `options.node` pins one
     */
    create(options) {
        const existing = this.players.get(options.guildId);
        if (existing) {
            if (existing.lifecycle === 'destroyed') {
                this.players.delete(options.guildId);
            }
            else {
                if (options.textChannelId !== undefined)
                    existing.textChannelId = options.textChannelId;
                if (options.voiceChannelId && options.voiceChannelId !== existing.voiceChannelId) {
                    existing.voiceChannelId = options.voiceChannelId;
                }
                return existing;
            }
        }
        const node = this.resolveNode(options);
        const player = new Player_js_1.Player(this.junie, node, options);
        this.players.set(options.guildId, player);
        this.junie.logger.debug(`Player created for guild ${options.guildId} on node ${node.id}.`);
        this.junie.emitClient('playerCreate', player);
        // Opt-in queue restoration (never blocks player creation; races are
        // guarded by the queue's mutation counter).
        if (this.junie.options.queue.restore) {
            void player.queue.restore().then((restored) => {
                if (restored) {
                    this.junie.logger.debug(`Queue restored for guild ${options.guildId}.`);
                }
            });
        }
        return player;
    }
    /** Fetch a player by guild id. */
    get(guildId) {
        return this.players.get(guildId);
    }
    /** Fetch a player or throw `PLAYER_NOT_FOUND`. */
    require(guildId) {
        const player = this.players.get(guildId);
        if (!player) {
            throw new errors_js_1.JunieError(errors_js_1.JunieErrorCode.PLAYER_NOT_FOUND, `No player for guild ${guildId}.`, { guildId });
        }
        return player;
    }
    /** Whether a guild has a live player. */
    has(guildId) {
        const player = this.players.get(guildId);
        return Boolean(player && player.lifecycle !== 'destroyed');
    }
    /** All players. */
    list() {
        return [...this.players.values()];
    }
    /** All players bound to a specific node. */
    listByNode(nodeId) {
        return this.list().filter((player) => player.node.id === nodeId);
    }
    /** Number of players. */
    get size() {
        return this.players.size;
    }
    /** @internal Remove a player (called by Player#destroy). Pass the instance to avoid removing a newer player created for the same guild. */
    remove(guildId, instance) {
        if (instance && this.players.get(guildId) !== instance)
            return false;
        return this.players.delete(guildId);
    }
    /** Destroy every player (used by `Junie#destroy`). */
    async destroyAll(reason = 'client-destroy') {
        await Promise.all(this.list().map((player) => player.destroy(reason)));
    }
    resolveNode(options) {
        if (options.node) {
            const pinned = this.junie.nodes.get(options.node);
            if (!pinned) {
                throw new errors_js_1.JunieError(errors_js_1.JunieErrorCode.NODE_NOT_FOUND, `Cannot create a player on unknown node "${options.node}".`, { node: options.node });
            }
            if (!pinned.connected) {
                this.junie.logger.warn(`Pinned node "${options.node}" is not connected — falling back to automatic selection.`);
                return this.junie.nodes.best();
            }
            return pinned;
        }
        return this.junie.nodes.best();
    }
}
exports.PlayerManager = PlayerManager;
//# sourceMappingURL=PlayerManager.js.map