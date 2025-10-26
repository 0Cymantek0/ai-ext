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
  /**
   * Whether to automatically enable/disable the bridge client based on
   * the debugRecorderEnabled storage flag. Defaults to true.
   */
  autoToggle?: boolean;
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

  const applyEnabledState = (enabled: boolean) => {
    if (enabled) {
      bridgeClient.enable();
    } else {
      bridgeClient.disable();
    }
  };

  // Apply initial state from options (if provided)
  if (options.bridge?.enabled !== undefined) {
    applyEnabledState(options.bridge.enabled);
  }

  const shouldAutoToggle = options.autoToggle !== false;

  if (shouldAutoToggle && typeof chrome !== "undefined" && chrome.storage?.local) {
    // Initialize based on current storage value
    void chrome.storage.local
      .get("debugRecorderEnabled")
      .then((result) => {
        const enabled = result?.debugRecorderEnabled === true;
        applyEnabledState(enabled);
      })
      .catch(() => {
        // Ignore storage access errors
      });

    // Listen for changes to debugRecorderEnabled
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local" || !Object.prototype.hasOwnProperty.call(changes, "debugRecorderEnabled")) {
        return;
      }

      const change = changes.debugRecorderEnabled;
      const enabled = change?.newValue === true;
      applyEnabledState(enabled);
    });
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
