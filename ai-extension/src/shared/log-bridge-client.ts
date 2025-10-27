/**
 * Log Bridge Client
 * Collects structured log envelopes from console wrapper and Logger,
 * then batches and sends them to the background service worker for storage.
 */

import type { StructuredLogEnvelope } from "./console-wrapper.js";

export interface LogBatch {
  logs: StructuredLogEnvelope[];
  timestamp: number;
  origin: StructuredLogEnvelope["origin"];
}

export interface LogBridgeConfig {
  batchSize?: number;
  flushIntervalMs?: number;
  maxQueueSize?: number;
  enabled?: boolean;
}

const DEFAULT_CONFIG: Required<LogBridgeConfig> = {
  batchSize: 50,
  flushIntervalMs: 5000,
  maxQueueSize: 1000,
  enabled: false,
};

/**
 * Log Bridge Client for collecting and batching logs
 */
export class LogBridgeClient {
  private config: Required<LogBridgeConfig>;
  private queue: StructuredLogEnvelope[] = [];
  private flushTimer: number | null = null;
  private enabled: boolean;

  constructor(config: LogBridgeConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.enabled = this.config.enabled;

    if (this.enabled) {
      this.startFlushTimer();
    }
  }

  /**
   * Collect a log envelope
   */
  collect(envelope: StructuredLogEnvelope): void {
    if (!this.enabled) return;

    // Add to queue
    this.queue.push(envelope);

    // Enforce max queue size (drop oldest if exceeded)
    if (this.queue.length > this.config.maxQueueSize) {
      this.queue = this.queue.slice(-this.config.maxQueueSize);
    }

    // Flush if batch size reached
    if (this.queue.length >= this.config.batchSize) {
      this.flush();
    }
  }

  /**
   * Flush queued logs to the background service worker
   */
  flush(): void {
    if (this.queue.length === 0) return;

    const batch: LogBatch = {
      logs: [...this.queue],
      timestamp: Date.now(),
      origin: this.queue[0]?.origin || "background",
    };

    this.queue = [];

    // Send batch to background
    this.sendBatch(batch);
  }

  /**
   * Send batch to background service worker
   */
  private sendBatch(batch: LogBatch): void {
    try {
      // Check if chrome.runtime is available
      if (
        typeof chrome !== "undefined" &&
        chrome.runtime &&
        chrome.runtime.sendMessage
      ) {
        chrome.runtime
          .sendMessage({
            kind: "LOG_BATCH",
            payload: batch,
          })
          .catch(() => {
            // Silently swallow errors to avoid recursive logging
          });
      }
    } catch {
      // Silently swallow errors to avoid recursive logging
    }
  }

  /**
   * Start the flush timer
   */
  private startFlushTimer(): void {
    if (this.flushTimer !== null) return;

    this.flushTimer = setInterval(() => {
      this.flush();
    }, this.config.flushIntervalMs) as unknown as number;
  }

  /**
   * Stop the flush timer
   */
  private stopFlushTimer(): void {
    if (this.flushTimer !== null) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  /**
   * Enable log collection
   */
  enable(): void {
    this.enabled = true;
    this.startFlushTimer();
  }

  /**
   * Disable log collection
   */
  disable(): void {
    this.enabled = false;
    this.stopFlushTimer();
    this.flush(); // Flush remaining logs
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<LogBridgeConfig>): void {
    this.config = { ...this.config, ...config };
    if (config.enabled !== undefined) {
      this.enabled = config.enabled;
      if (this.enabled) {
        this.startFlushTimer();
      } else {
        this.stopFlushTimer();
      }
    }
  }

  /**
   * Get current status
   */
  getStatus(): {
    enabled: boolean;
    queueSize: number;
    config: Required<LogBridgeConfig>;
  } {
    return {
      enabled: this.enabled,
      queueSize: this.queue.length,
      config: this.config,
    };
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.stopFlushTimer();
    this.flush();
    this.queue = [];
  }
}

// Global singleton instance
let globalBridgeClient: LogBridgeClient | null = null;

/**
 * Get or create the global log bridge client
 */
export function getLogBridgeClient(config?: LogBridgeConfig): LogBridgeClient {
  if (!globalBridgeClient) {
    globalBridgeClient = new LogBridgeClient(config);
  } else if (config) {
    globalBridgeClient.updateConfig(config);
  }
  return globalBridgeClient;
}

/**
 * Initialize the global log bridge client
 */
export function initializeLogBridge(config?: LogBridgeConfig): LogBridgeClient {
  globalBridgeClient = new LogBridgeClient(config);
  return globalBridgeClient;
}
