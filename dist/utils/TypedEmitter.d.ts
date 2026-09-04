/**
 * Junie — minimal, fully-typed event emitter.
 *
 * Wraps Node's EventEmitter with compile-time event signatures. Passing a
 * wrong listener or emitting unknown events is a type error, not a runtime
 * surprise.
 */
/** A named event signature map. */
export type EventMap = Record<string, (...args: never[]) => void>;
/** The argument tuple of one event signature. */
export type EventArgs<Events extends object, K extends keyof Events> = Events[K] extends (...args: infer P) => unknown ? P : never;
export declare class TypedEmitter<Events extends object> {
    private readonly emitter;
    constructor();
    /** Subscribe to an event. Returns `this` for chaining. */
    on<K extends keyof Events>(event: K, listener: Events[K]): this;
    /** Subscribe for the next occurrence of an event only. */
    once<K extends keyof Events>(event: K, listener: Events[K]): this;
    /** Unsubscribe a listener (or all listeners of the event). */
    off<K extends keyof Events>(event: K, listener?: Events[K]): this;
    /** Remove every listener of every event. */
    removeAllListeners(): this;
    /** Number of listeners for an event. */
    listenerCount<K extends keyof Events>(event: K): number;
    /** Emit an event (internal — types guarantee correct payloads). */
    protected emit<K extends keyof Events>(event: K, ...args: EventArgs<Events, K>): boolean;
}
//# sourceMappingURL=TypedEmitter.d.ts.map