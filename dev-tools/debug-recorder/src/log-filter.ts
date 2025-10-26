/**
 * Log Filtering Pipeline
 * Implements temporal correlation, semantic filtering, categorization,
 * throttling, and duplicate suppression for session logs.
 */

import type {
  StructuredLogEnvelope,
  LogFilterConfig,
  Interaction,
  InteractionType,
  TemporalCorrelationConfig,
  NetworkRequestEntry,
} from './types.js';

/**
 * Default temporal windows for different interaction types (in milliseconds)
 */
const DEFAULT_TEMPORAL_WINDOWS: Record<InteractionType, number> = {
  navigation: 5000,
  click: 2000,
  input: 1000,
  api_call: 3000,
  storage_operation: 2000,
  ai_request: 10000,
  message_passing: 1000,
  vector_operation: 5000,
  user_action: 2000,
  system_event: 1000,
};

/**
 * Default deny patterns for noisy logs
 */
const DEFAULT_DENY_PATTERNS = [
  /^\[HMR\]/i,
  /^\[vite\]/i,
  /^\[webpack\]/i,
  /hot.?update/i,
  /sockjs-node/i,
  /websocket.*connected/i,
];

/**
 * Severity weights for log levels
 */
const LOG_LEVEL_WEIGHTS: Record<StructuredLogEnvelope['level'], number> = {
  error: 5,
  warn: 4,
  info: 3,
  log: 2,
  debug: 1,
};

/**
 * Category weights for prioritization
 */
const DEFAULT_CATEGORY_WEIGHTS: Record<string, number> = {
  'ai-request': 5,
  'storage-operation': 4,
  'vector-operation': 4,
  'message-passing': 3,
  'navigation': 3,
  'performance': 2,
  'debug': 1,
};

/**
 * Log Filter Pipeline
 */
export class LogFilterPipeline {
  private config: LogFilterConfig;
  private temporalConfig: TemporalCorrelationConfig;
  private categoryWeights: Record<string, number>;
  private duplicateTracker: Map<string, { count: number; lastSeen: number }>;
  private throttleTracker: Map<string, number>;
  private networkRequests: NetworkRequestEntry[];

  constructor(
    config: LogFilterConfig = {},
    temporalConfig?: Partial<TemporalCorrelationConfig>,
    categoryWeights?: Record<string, number>,
  ) {
    this.config = {
      denyPatterns: DEFAULT_DENY_PATTERNS,
      maxDuplicates: 3,
      throttleMs: 100,
      temporalWindowMs: 5000,
      ...config,
    };

    this.temporalConfig = {
      windowMs: {
        ...DEFAULT_TEMPORAL_WINDOWS,
        ...temporalConfig?.windowMs,
      },
    };

    this.categoryWeights = {
      ...DEFAULT_CATEGORY_WEIGHTS,
      ...categoryWeights,
    };

    this.duplicateTracker = new Map();
    this.throttleTracker = new Map();
    this.networkRequests = [];
  }

  /**
   * Filter logs and correlate with interactions
   */
  filterAndCorrelate(
    logs: StructuredLogEnvelope[],
    interactions: Interaction[],
  ): { filteredLogs: StructuredLogEnvelope[]; correlatedLogs: Map<string, StructuredLogEnvelope[]> } {
    // Step 1: Apply semantic filtering
    const semanticallyFiltered = logs.filter((log) => this.applySemanticFilter(log));

    // Step 2: Apply duplicate suppression
    const deduplicated = this.suppressDuplicates(semanticallyFiltered);

    // Step 3: Apply throttling
    const throttled = this.applyThrottling(deduplicated);

    // Step 4: Temporal correlation with interactions
    const correlatedLogs = this.correlateWithInteractions(throttled, interactions);

    return {
      filteredLogs: throttled,
      correlatedLogs,
    };
  }

  /**
   * Apply semantic filtering (allow/deny patterns, level, origin, category)
   */
  private applySemanticFilter(log: StructuredLogEnvelope): boolean {
    // Check deny patterns
    if (this.config.denyPatterns) {
      for (const pattern of this.config.denyPatterns) {
        if (pattern.test(log.message)) {
          return false;
        }
      }
    }

    // Check allow patterns (if specified, only allow matching logs)
    if (this.config.allowPatterns && this.config.allowPatterns.length > 0) {
      let matches = false;
      for (const pattern of this.config.allowPatterns) {
        if (pattern.test(log.message)) {
          matches = true;
          break;
        }
      }
      if (!matches) return false;
    }

    // Check minimum level
    if (this.config.minLevel) {
      const logWeight = LOG_LEVEL_WEIGHTS[log.level];
      const minWeight = LOG_LEVEL_WEIGHTS[this.config.minLevel];
      if (logWeight < minWeight) {
        return false;
      }
    }

    // Check origins filter
    if (this.config.origins && this.config.origins.length > 0) {
      if (!this.config.origins.includes(log.origin)) {
        return false;
      }
    }

    // Check categories filter
    if (this.config.categories && this.config.categories.length > 0 && log.category) {
      if (!this.config.categories.includes(log.category)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Suppress duplicate logs
   */
  private suppressDuplicates(logs: StructuredLogEnvelope[]): StructuredLogEnvelope[] {
    const maxDuplicates = this.config.maxDuplicates ?? 3;
    const result: StructuredLogEnvelope[] = [];
    const now = Date.now();

    // Clean up old entries (older than 1 minute)
    for (const [key, value] of this.duplicateTracker.entries()) {
      if (now - value.lastSeen > 60000) {
        this.duplicateTracker.delete(key);
      }
    }

    for (const log of logs) {
      const key = this.getLogKey(log);
      const tracker = this.duplicateTracker.get(key);

      if (!tracker) {
        this.duplicateTracker.set(key, { count: 1, lastSeen: log.timestamp });
        result.push(log);
      } else if (tracker.count < maxDuplicates) {
        tracker.count++;
        tracker.lastSeen = log.timestamp;
        result.push(log);
      } else {
        // Skip this duplicate
        tracker.lastSeen = log.timestamp;
      }
    }

    return result;
  }

  /**
   * Apply high-frequency event throttling
   */
  private applyThrottling(logs: StructuredLogEnvelope[]): StructuredLogEnvelope[] {
    if (!this.config.throttleMs || this.config.throttleMs === 0) return logs;

    const result: StructuredLogEnvelope[] = [];

    for (const log of logs) {
      const key = this.getLogKey(log);
      const lastEmitted = this.throttleTracker.get(key);

      if (!lastEmitted || log.timestamp - lastEmitted >= this.config.throttleMs) {
        this.throttleTracker.set(key, log.timestamp);
        result.push(log);
      }
    }

    return result;
  }

  /**
   * Correlate logs with interactions using temporal windows
   */
  private correlateWithInteractions(
    logs: StructuredLogEnvelope[],
    interactions: Interaction[],
  ): Map<string, StructuredLogEnvelope[]> {
    const correlatedLogs = new Map<string, StructuredLogEnvelope[]>();

    // Initialize map with interaction IDs
    for (const interaction of interactions) {
      correlatedLogs.set(interaction.id, []);
    }

    // Sort logs by timestamp
    const sortedLogs = [...logs].sort((a, b) => a.timestamp - b.timestamp);

    // Correlate logs with interactions
    for (const log of sortedLogs) {
      let bestMatch: { interaction: Interaction; score: number } | null = null;

      for (const interaction of interactions) {
        const window = this.temporalConfig.windowMs[interaction.type];
        const timeDiff = Math.abs(log.timestamp - interaction.timestamp);

        // Check if log falls within temporal window
        if (timeDiff <= window) {
          // Calculate score based on time proximity and category weight
          const timeScore = 1 - timeDiff / window;
          const categoryScore = log.category
            ? this.categoryWeights[log.category] ?? 1
            : 1;
          const levelScore = LOG_LEVEL_WEIGHTS[log.level];

          const score = timeScore * categoryScore * levelScore;

          if (!bestMatch || score > bestMatch.score) {
            bestMatch = { interaction, score };
          }
        }
      }

      // Add log to best matching interaction
      if (bestMatch) {
        const logs = correlatedLogs.get(bestMatch.interaction.id) || [];
        logs.push(log);
        correlatedLogs.set(bestMatch.interaction.id, logs);
      }
    }

    return correlatedLogs;
  }

  /**
   * Add network request for correlation
   */
  addNetworkRequest(request: NetworkRequestEntry): void {
    this.networkRequests.push(request);

    // Keep only recent requests (last 5 minutes)
    const fiveMinutesAgo = Date.now() - 300000;
    this.networkRequests = this.networkRequests.filter(
      (req) => req.timestamp > fiveMinutesAgo,
    );
  }

  /**
   * Correlate network requests with interactions
   */
  correlateNetworkRequests(
    interactions: Interaction[],
  ): Map<string, NetworkRequestEntry[]> {
    const correlatedRequests = new Map<string, NetworkRequestEntry[]>();

    for (const interaction of interactions) {
      const window = this.temporalConfig.windowMs[interaction.type];
      const matchingRequests = this.networkRequests.filter((req) => {
        const timeDiff = Math.abs(req.timestamp - interaction.timestamp);
        return timeDiff <= window;
      });

      if (matchingRequests.length > 0) {
        correlatedRequests.set(interaction.id, matchingRequests);
      }
    }

    return correlatedRequests;
  }

  /**
   * Generate a unique key for a log entry (for duplicate detection)
   */
  private getLogKey(log: StructuredLogEnvelope): string {
    // Create key from level, origin, category, and truncated message
    const truncatedMessage = log.message.substring(0, 100);
    return `${log.level}:${log.origin}:${log.category || ''}:${truncatedMessage}`;
  }

  /**
   * Get priority score for a log
   */
  getPriority(log: StructuredLogEnvelope): number {
    const levelScore = LOG_LEVEL_WEIGHTS[log.level];
    const categoryScore = log.category
      ? this.categoryWeights[log.category] ?? 1
      : 1;
    return levelScore * categoryScore;
  }

  /**
   * Filter logs by priority threshold
   */
  filterByPriority(logs: StructuredLogEnvelope[], minPriority: number): StructuredLogEnvelope[] {
    return logs.filter((log) => this.getPriority(log) >= minPriority);
  }

  /**
   * Clear internal state
   */
  reset(): void {
    this.duplicateTracker.clear();
    this.throttleTracker.clear();
    this.networkRequests = [];
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<LogFilterConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Update temporal correlation windows
   */
  updateTemporalWindows(windows: Partial<Record<InteractionType, number>>): void {
    this.temporalConfig.windowMs = {
      ...this.temporalConfig.windowMs,
      ...windows,
    };
  }

  /**
   * Update category weights
   */
  updateCategoryWeights(weights: Record<string, number>): void {
    this.categoryWeights = { ...this.categoryWeights, ...weights };
  }
}

/**
 * Create a default log filter pipeline
 */
export function createDefaultLogFilter(): LogFilterPipeline {
  return new LogFilterPipeline();
}

/**
 * Create a strict log filter (only errors and warnings)
 */
export function createStrictLogFilter(): LogFilterPipeline {
  return new LogFilterPipeline({
    minLevel: 'warn',
    maxDuplicates: 2,
  });
}

/**
 * Create a verbose log filter (all logs with minimal filtering)
 */
export function createVerboseLogFilter(): LogFilterPipeline {
  return new LogFilterPipeline({
    denyPatterns: [],
    maxDuplicates: 10,
    minLevel: 'debug',
  });
}
