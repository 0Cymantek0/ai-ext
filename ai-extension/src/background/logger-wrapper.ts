/**
 * Logger Bridge
 * Instruments the background Logger instance to emit structured log envelopes
 * to the log bridge client without changing existing imports.
 */

import type { Logger, LogLevel } from "./monitoring.js";
import type { StructuredLogEnvelope } from "../shared/console-wrapper.js";
import type { LogBridgeClient } from "../shared/log-bridge-client.js";

/**
 * Map Logger LogLevel enum to structured log level
 */
function mapLogLevel(level: LogLevel): StructuredLogEnvelope["level"] {
  switch (level) {
    case 0: // LogLevel.DEBUG
      return "debug";
    case 1: // LogLevel.INFO
      return "info";
    case 2: // LogLevel.WARN
      return "warn";
    case 3: // LogLevel.ERROR
      return "error";
    default:
      return "info";
  }
}

/**
 * Patch a Logger instance to emit structured log envelopes
 */
export function attachLoggerBridge(
  logger: Logger,
  bridgeClient: LogBridgeClient | null,
  options: { tags?: string[] } = {},
): void {
  if (!bridgeClient) {
    return;
  }

  const tags = options.tags ?? ["logger"];

  const originalDebug = logger.debug.bind(logger);
  const originalInfo = logger.info.bind(logger);
  const originalWarn = logger.warn.bind(logger);
  const originalError = logger.error.bind(logger);

  const emit = (
    level: LogLevel,
    category: string,
    message: string,
    data?: unknown,
    stack?: string,
  ): void => {
    const envelope: StructuredLogEnvelope = {
      timestamp: Date.now(),
      level: mapLogLevel(level),
      message,
      ...(data !== undefined && { data: [data] }),
      ...(stack !== undefined && { stack }),
      origin: "background",
      category,
      tags,
      ...(data !== undefined && { data: [data] }),
      ...(stack && { stack }),
    };

    try {
      bridgeClient.collect(envelope);
    } catch {
      // Silently swallow errors to avoid recursive logging
    }
  };

  logger.debug = ((category: string, message: string, data?: unknown) => {
    originalDebug(category, message, data);
    emit(0, category, message, data);
  }) as typeof logger.debug;

  logger.info = ((category: string, message: string, data?: unknown) => {
    originalInfo(category, message, data);
    emit(1, category, message, data);
  }) as typeof logger.info;

  logger.warn = ((category: string, message: string, data?: unknown) => {
    originalWarn(category, message, data);
    emit(2, category, message, data, data instanceof Error ? data.stack : undefined);
  }) as typeof logger.warn;

  logger.error = ((category: string, message: string, error?: unknown) => {
    originalError(category, message, error);
    const stack = error instanceof Error ? error.stack : undefined;
    emit(3, category, message, error, stack);
  }) as typeof logger.error;
}
