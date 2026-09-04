"use strict";
/**
 * Junie — minimal, fully-typed event emitter.
 *
 * Wraps Node's EventEmitter with compile-time event signatures. Passing a
 * wrong listener or emitting unknown events is a type error, not a runtime
 * surprise.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TypedEmitter = void 0;
const node_events_1 = require("node:events");
class TypedEmitter {
    emitter = new node_events_1.EventEmitter();
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
exports.TypedEmitter = TypedEmitter;
//# sourceMappingURL=TypedEmitter.js.map