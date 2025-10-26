/**
 * Runtime Logging Initialization
 * Provides helper to instrument console output in different runtimes and
 * bridge structured log envelopes to the background session recorder.
 */

import { wrapConsole, setConsoleWrapperEnabled } from "./console-wrapper.js";
import type { LogOrigin } from "./console-wrapper.js";
import { getLogBridgeClient, type LogBridgeConfig } from "./log-bridge-client.js";

export interface RuntimeLoggingOptions {
  origin: LogOrigin;
  tags?: string[];
  category?: string;
  bridge?: LogBridgeConfig;
}

/**
 * Initialize runtime logging by wrapping console methods and configuring the
 * log bridge client.
 */
export function initializeRuntimeLogging(options: RuntimeLoggingOptions): void {
  const bridgeClient = getLogBridgeClient({
    enabled: options.bridge?.enabled ?? false,
    batchSize: options.bridge?.batchSize ?? 25,
    flushIntervalMs: options.bridge?.flushIntervalMs ?? 2000,
    maxQueueSize: options.bridge?.maxQueueSize ?? 2000,
  });

  if (options.bridge?.enabled) {
    bridgeClient.enable();
  } else {
    bridgeClient.disable();
  }

  wrapConsole({
    origin: options.origin,
    tags: options.tags,
    category: options.category,
    collector: (envelope) => bridgeClient.collect(envelope),
    enabled: true,
  });

  setConsoleWrapperEnabled(true);
}
