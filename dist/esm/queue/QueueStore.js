/**
 * Junie — queue persistence.
 *
 * Junie serializes queues to strings and hands them to a {@link QueueStore}.
 * The default store is an in-memory map; implementing the three methods
 * against Redis, Postgres, files, ... gives you cross-restart persistence.
 */
/** The default, non-persistent in-memory store. */
export class MemoryQueueStore {
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
//# sourceMappingURL=QueueStore.js.map