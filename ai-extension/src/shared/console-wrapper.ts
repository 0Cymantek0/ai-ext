/**
 * Console Wrapper for Structured Logging
 * Wraps native console methods to emit structured log envelopes
 * to the debug recorder bridge client.
 */

export type LogLevel = 'debug' | 'log' | 'info' | 'warn' | 'error';
export type LogOrigin = 'background' | 'content-script' | 'side-panel' | 'offscreen';

export interface StructuredLogEnvelope {
  timestamp: number;
  level: LogLevel;
  message: string;
  data?: unknown[];
  stack?: string;
  origin: LogOrigin;
  tags?: string[];
  category?: string;
}

export type LogCollector = (envelope: StructuredLogEnvelope) => void;

interface ConsoleWrapperOptions {
  origin: LogOrigin;
  category?: string;
  tags?: string[];
  collector?: LogCollector;
  enabled?: boolean;
}

/**
 * Captures stack trace for log entries
 */
function captureStackTrace(): string | undefined {
  try {
    const stack = new Error().stack;
    if (!stack) return undefined;

    // Remove the first lines (this function and the wrapper)
    const lines = stack.split('\n').slice(3);
    return lines.join('\n').trim();
  } catch {
    return undefined;
  }
}

/**
 * Converts console arguments to a message string
 */
function formatConsoleArgs(args: unknown[]): string {
  return args
    .map((arg) => {
      if (typeof arg === 'string') return arg;
      if (arg instanceof Error) return arg.message;
      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    })
    .join(' ');
}

/**
 * Global storage for original console methods
 */
const originalConsole = {
  debug: console.debug,
  log: console.log,
  info: console.info,
  warn: console.warn,
  error: console.error,
};

let isWrapped = false;
let globalCollector: LogCollector | undefined;
let globalOrigin: LogOrigin = 'background';
let globalCategory: string | undefined;
let globalTags: string[] | undefined;
let isEnabled = false;

/**
 * Wrap console methods to emit structured log envelopes
 */
export function wrapConsole(options: ConsoleWrapperOptions): void {
  if (isWrapped) {
    // Update configuration if already wrapped
    globalOrigin = options.origin;
    globalCategory = options.category;
    globalTags = options.tags;
    globalCollector = options.collector;
    isEnabled = options.enabled ?? true;
    return;
  }

  globalOrigin = options.origin;
  globalCategory = options.category;
  globalTags = options.tags;
  globalCollector = options.collector;
  isEnabled = options.enabled ?? true;

  const wrapMethod = (level: LogLevel, original: (...args: any[]) => void) => {
    return function (this: Console, ...args: unknown[]): void {
      // Always call original console
      original.apply(this, args);

      // Emit structured log if enabled
      if (isEnabled && globalCollector) {
        const message = formatConsoleArgs(args);
        const stack = level === 'error' || level === 'warn' ? captureStackTrace() : undefined;
        const envelope: StructuredLogEnvelope = {
          timestamp: Date.now(),
          level,
          message,
          data: args,
          ...(stack !== undefined && { stack }),
          origin: globalOrigin,
          ...(globalCategory !== undefined && { category: globalCategory }),
          ...(globalTags !== undefined && { tags: globalTags }),
        };

        try {
          globalCollector(envelope);
        } catch {
          // Silently swallow errors to avoid recursive logging
        }
      }
    };
  };

  console.debug = wrapMethod('debug', originalConsole.debug);
  console.log = wrapMethod('log', originalConsole.log);
  console.info = wrapMethod('info', originalConsole.info);
  console.warn = wrapMethod('warn', originalConsole.warn);
  console.error = wrapMethod('error', originalConsole.error);

  isWrapped = true;
}

/**
 * Unwrap console methods (restore original behavior)
 */
export function unwrapConsole(): void {
  if (!isWrapped) return;

  console.debug = originalConsole.debug;
  console.log = originalConsole.log;
  console.info = originalConsole.info;
  console.warn = originalConsole.warn;
  console.error = originalConsole.error;

  isWrapped = false;
  isEnabled = false;
}

/**
 * Update the log collector
 */
export function setLogCollector(collector: LogCollector | undefined): void {
  globalCollector = collector;
}

/**
 * Enable or disable log collection
 */
export function setConsoleWrapperEnabled(enabled: boolean): void {
  isEnabled = enabled;
}

/**
 * Get current wrapper status
 */
export function getConsoleWrapperStatus(): {
  wrapped: boolean;
  enabled: boolean;
  origin: LogOrigin;
  category?: string;
} {
  return {
    wrapped: isWrapped,
    enabled: isEnabled,
    origin: globalOrigin,
    ...(globalCategory !== undefined && { category: globalCategory }),
  };
}
