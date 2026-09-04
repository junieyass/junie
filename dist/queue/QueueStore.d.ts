/**
 * Junie — queue persistence.
 *
 * Junie serializes queues to strings and hands them to a {@link QueueStore}.
 * The default store is an in-memory map; implementing the three methods
 * against Redis, Postgres, files, ... gives you cross-restart persistence.
 */
/** Persistence adapter for serialized queues. */
export interface QueueStore {
    /** Fetch the serialized queue for a guild (null when absent). */
    get(guildId: string): Promise<string | null>;
    /** Persist the serialized queue for a guild. */
    set(guildId: string, data: string): Promise<void>;
    /** Forget the persisted queue of a guild. */
    delete(guildId: string): Promise<void>;
}
/** The default, non-persistent in-memory store. */
export declare class MemoryQueueStore implements QueueStore {
    private readonly data;
    get(guildId: string): Promise<string | null>;
    set(guildId: string, data: string): Promise<void>;
    delete(guildId: string): Promise<void>;
}
/** The shape stored by `Queue#toJSON`. */
export interface StoredQueue {
    current: unknown;
    tracks: unknown[];
    previous: unknown[];
    repeatMode: 'off' | 'track' | 'queue';
}
//# sourceMappingURL=QueueStore.d.ts.map