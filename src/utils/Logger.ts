/**
 * Junie — lightweight leveled logger with component namespaces.
 *
 * The default logger writes to stdout/stderr and stamps every line with a
 * component tag such as `[Junie] [Node:eu-1]`, which makes multi-node logs
 * easy to follow. Pass your own logger via `JunieOptions.logger` to route
 * logs anywhere (pino, winston, Datadog, ...).
 */

import type { LogLevel } from '../types/options.js';

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
  trace: 5,
};

function timestamp(): string {
  return new Date().toISOString().slice(11, 23);
}

/** Anything with leveled logging functions can act as Junie's logger. */
export class Logger {
  private readonly level: LogLevel;
  private readonly namespace: string;

  public constructor(level: LogLevel = 'info', namespace = '') {
    this.level = level;
    this.namespace = namespace ? `${namespace}` : '';
  }

  /** Create a tagged child logger (e.g. `logger.child('Node:eu-1')`). */
  public child(namespace: string): Logger {
    const merged = this.namespace ? `${this.namespace}:${namespace}` : namespace;
    return new Logger(this.level, merged);
  }

  private write(level: Exclude<LogLevel, 'silent'>, message: string, extra?: unknown): void {
    if (LEVEL_WEIGHT[level] > LEVEL_WEIGHT[this.level]) return;
    const tag = `[Junie]${this.namespace ? ` [${this.namespace}]` : ''}`;
    const line = `${timestamp()} ${tag} ${message}`;
    const stream = level === 'error' || level === 'warn' ? console.error : console.log;
    if (extra === undefined) stream(line);
    else stream(line, extra);
  }

  public error(message: string, extra?: unknown): void {
    this.write('error', message, extra);
  }

  public warn(message: string, extra?: unknown): void {
    this.write('warn', message, extra);
  }

  public info(message: string, extra?: unknown): void {
    this.write('info', message, extra);
  }

  public debug(message: string, extra?: unknown): void {
    this.write('debug', message, extra);
  }

  public trace(message: string, extra?: unknown): void {
    this.write('trace', message, extra);
  }
}

/** Creates the default logger for a client. */
export function createDefaultLogger(level: LogLevel): Logger {
  return new Logger(level);
}
