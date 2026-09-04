/**
 * Junie — minimal, fully-typed event emitter.
 *
 * Wraps Node's EventEmitter with compile-time event signatures. Passing a
 * wrong listener or emitting unknown events is a type error, not a runtime
 * surprise.
 */
import { EventEmitter } from 'node:events';
export class TypedEmitter {
    emitter = new EventEmitter();
    constructor() {
        this.emitter.setMaxListeners(0);
    }
    /** Subscribe to an event. Returns `this` for chaining. */
    on(event, listener) {
        this.emitter.on(event, listener);
        return this;
    }
    /** Subscribe for the next occurrence of an event only. */
    once(event, listener) {
        this.emitter.once(event, listener);
        return this;
    }
    /** Unsubscribe a listener (or all listeners of the event). */
    off(event, listener) {
        if (listener) {
            this.emitter.off(event, listener);
        }
        else {
            this.emitter.removeAllListeners(event);
        }
        return this;
    }
    /** Remove every listener of every event. */
    removeAllListeners() {
        this.emitter.removeAllListeners();
        return this;
    }
    /** Number of listeners for an event. */
    listenerCount(event) {
        return this.emitter.listenerCount(event);
    }
    /** Emit an event (internal — types guarantee correct payloads). */
    emit(event, ...args) {
        return this.emitter.emit(event, ...args);
    }
}
//# sourceMappingURL=TypedEmitter.js.map