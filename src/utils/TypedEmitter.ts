/**
 * Junie — minimal, fully-typed event emitter.
 *
 * Wraps Node's EventEmitter with compile-time event signatures. Passing a
 * wrong listener or emitting unknown events is a type error, not a runtime
 * surprise.
 */

import { EventEmitter } from 'node:events';

/** A named event signature map. */
export type EventMap = Record<string, (...args: never[]) => void>;

/** The argument tuple of one event signature. */
export type EventArgs<Events extends object, K extends keyof Events> =
  Events[K] extends (...args: infer P) => unknown ? P : never;

type AnyListener = (...args: unknown[]) => void;

export class TypedEmitter<Events extends object> {
  private readonly emitter = new EventEmitter();

  public constructor() {
    this.emitter.setMaxListeners(0);
  }

  /** Subscribe to an event. Returns `this` for chaining. */
  public on<K extends keyof Events>(event: K, listener: Events[K]): this {
    this.emitter.on(event as string, listener as unknown as AnyListener);
    return this;
  }

  /** Subscribe for the next occurrence of an event only. */
  public once<K extends keyof Events>(event: K, listener: Events[K]): this {
    this.emitter.once(event as string, listener as unknown as AnyListener);
    return this;
  }

  /** Unsubscribe a listener (or all listeners of the event). */
  public off<K extends keyof Events>(event: K, listener?: Events[K]): this {
    if (listener) {
      this.emitter.off(event as string, listener as unknown as AnyListener);
    } else {
      this.emitter.removeAllListeners(event as string);
    }
    return this;
  }

  /** Remove every listener of every event. */
  public removeAllListeners(): this {
    this.emitter.removeAllListeners();
    return this;
  }

  /** Number of listeners for an event. */
  public listenerCount<K extends keyof Events>(event: K): number {
    return this.emitter.listenerCount(event as string);
  }

  /** Emit an event (internal — types guarantee correct payloads). */
  protected emit<K extends keyof Events>(
    event: K,
    ...args: EventArgs<Events, K>
  ): boolean {
    return this.emitter.emit(event as string, ...(args as unknown[]));
  }
}
