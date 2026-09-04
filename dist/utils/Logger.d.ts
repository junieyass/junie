/**
 * Junie — lightweight leveled logger with component namespaces.
 *
 * The default logger writes to stdout/stderr and stamps every line with a
 * component tag such as `[Junie] [Node:eu-1]`, which makes multi-node logs
 * easy to follow. Pass your own logger via `JunieOptions.logger` to route
 * logs anywhere (pino, winston, Datadog, ...).
 */
import type { LogLevel } from '../types/options.js';
/** Anything with leveled logging functions can act as Junie's logger. */
export declare class Logger {
    private readonly level;
    private readonly namespace;
    constructor(level?: LogLevel, namespace?: string);
    /** Create a tagged child logger (e.g. `logger.child('Node:eu-1')`). */
    child(namespace: string): Logger;
    private write;
    error(message: string, extra?: unknown): void;
    warn(message: string, extra?: unknown): void;
    info(message: string, extra?: unknown): void;
    debug(message: string, extra?: unknown): void;
    trace(message: string, extra?: unknown): void;
}
/** Creates the default logger for a client. */
export declare function createDefaultLogger(level: LogLevel): Logger;
//# sourceMappingURL=Logger.d.ts.map