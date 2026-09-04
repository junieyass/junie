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
export class MemoryQueueStore implements QueueStore {
  private readonly data = new Map<string, string>();

  public async get(guildId: string): Promise<string | null> {
    return this.data.get(guildId) ?? null;
  }

  public async set(guildId: string, data: string): Promise<void> {
    this.data.set(guildId, data);
  }

  public async delete(guildId: string): Promise<void> {
    this.data.delete(guildId);
  }
}

/** The shape stored by `Queue#toJSON`. */
export interface StoredQueue {
  current: unknown;
  tracks: unknown[];
  previous: unknown[];
  repeatMode: 'off' | 'track' | 'queue';
}
