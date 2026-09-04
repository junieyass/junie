"use strict";
/**
 * Junie — queue persistence.
 *
 * Junie serializes queues to strings and hands them to a {@link QueueStore}.
 * The default store is an in-memory map; implementing the three methods
 * against Redis, Postgres, files, ... gives you cross-restart persistence.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MemoryQueueStore = void 0;
/** The default, non-persistent in-memory store. */
class MemoryQueueStore {
    data = new Map();
    async get(guildId) {
        return this.data.get(guildId) ?? null;
    }
    async set(guildId, data) {
        this.data.set(guildId, data);
    }
    async delete(guildId) {
        this.data.delete(guildId);
    }
}
exports.MemoryQueueStore = MemoryQueueStore;
//# sourceMappingURL=QueueStore.js.map