"use strict";
/**
 * Junie — lightweight leveled logger with component namespaces.
 *
 * The default logger writes to stdout/stderr and stamps every line with a
 * component tag such as `[Junie] [Node:eu-1]`, which makes multi-node logs
 * easy to follow. Pass your own logger via `JunieOptions.logger` to route
 * logs anywhere (pino, winston, Datadog, ...).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Logger = void 0;
exports.createDefaultLogger = createDefaultLogger;
const LEVEL_WEIGHT = {
    silent: 0,
    error: 1,
    warn: 2,
    info: 3,
    debug: 4,
    trace: 5,
};
function timestamp() {
    return new Date().toISOString().slice(11, 23);
}
/** Anything with leveled logging functions can act as Junie's logger. */
class Logger {
    level;
    namespace;
    constructor(level = 'info', namespace = '') {
        this.level = level;
        this.namespace = namespace ? `${namespace}` : '';
    }
    /** Create a tagged child logger (e.g. `logger.child('Node:eu-1')`). */
    child(namespace) {
        const merged = this.namespace ? `${this.namespace}:${namespace}` : namespace;
        return new Logger(this.level, merged);
    }
    write(level, message, extra) {
        if (LEVEL_WEIGHT[level] > LEVEL_WEIGHT[this.level])
            return;
        const tag = `[Junie]${this.namespace ? ` [${this.namespace}]` : ''}`;
        const line = `${timestamp()} ${tag} ${message}`;
        const stream = level === 'error' || level === 'warn' ? console.error : console.log;
        if (extra === undefined)
            stream(line);
        else
            stream(line, extra);
    }
    error(message, extra) {
        this.write('error', message, extra);
    }
    warn(message, extra) {
        this.write('warn', message, extra);
    }
    info(message, extra) {
        this.write('info', message, extra);
    }
    debug(message, extra) {
        this.write('debug', message, extra);
    }
    trace(message, extra) {
        this.write('trace', message, extra);
    }
}
exports.Logger = Logger;
/** Creates the default logger for a client. */
function createDefaultLogger(level) {
    return new Logger(level);
}
//# sourceMappingURL=Logger.js.map