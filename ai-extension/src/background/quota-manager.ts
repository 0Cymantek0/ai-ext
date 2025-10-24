/**
 * Storage Quota Manager
 * Monitors storage usage, implements automatic cleanup, and requests persistent storage
 * Requirements: 5.8, 13.1, 13.9
 */

import { logger } from "./monitoring.js";
import { getStorageManager, type StorageQuota } from "./storage-wrapper.js";
import {
  indexedDBManager,
  StoreName,
  ProcessingStatus,
} from "./indexeddb-manager.js";
import { vectorIndexingQueue, IndexingOperation } from "./vector-indexing-queue.js";

/**
 * Storage usage information across all storage areas
 */
export interface TotalStorageUsage {
  chromeStorage: {
    sync: StorageQuota;
    local: StorageQuota;
  };
  indexedDB: {
    usage: number;
    quota: number;
    percentUsed: number;
  };
  total: {
    usage: number;
    quota: number;
    percentUsed: number;
  };
  persistent: boolean;
}

/**
 * Cleanup policy configuration
 */
export interface CleanupPolicy {
  enabled: boolean;
  warningThreshold: number; // Percentage (e.g., 80)
  criticalThreshold: number; // Percentage (e.g., 95)
  maxConversationAge: number; // Days
  maxAIResponseAge: number; // Days
  maxContentAge: number; // Days (only for failed processing)
  keepRecentConversations: number; // Number of conversations to keep
  autoCleanupOnWarning: boolean;
  autoCleanupOnCritical: boolean;
}

/**
 * Cleanup result
 */
export interface CleanupResult {
  success: boolean;
  bytesFreed: number;
  itemsRemoved: {
    conversations: number;
    aiResponses: number;
    failedContent: number;
    chromeStorage: number;
  };
  errors: string[];
  duration: number;
}

/**
 * Quota event types
 */
export enum QuotaEventType {
  WARNING = "warning",
  CRITICAL = "critical",
  CLEANUP_STARTED = "cleanup_started",
  CLEANUP_COMPLETED = "cleanup_completed",
  PERSISTENT_GRANTED = "persistent_granted",
  PERSISTENT_DENIED = "persistent_denied",
}

/**
 * Default cleanup policy
 */
const DEFAULT_CLEANUP_POLICY: CleanupPolicy = {
  enabled: true,
  warningThreshold: 80,
  criticalThreshold: 95,
  maxConversationAge: 90, // 90 days
  maxAIResponseAge: 30, // 30 days
  maxContentAge: 7, // 7 days for failed content
  keepRecentConversations: 10,
  autoCleanupOnWarning: false,
  autoCleanupOnCritical: true,
};

/**
 * Storage Quota Manager
 * Requirement: 5.8, 13.1, 13.9
 */
export class QuotaManager {
  private policy: CleanupPolicy;
  private monitoringInterval: number | null = null;
  private storageManager = getStorageManager();

  constructor(policy: Partial<CleanupPolicy> = {}) {
    this.policy = { ...DEFAULT_CLEANUP_POLICY, ...policy };
  }

  /**
   * Initialize quota manager and request persistent storage
   * Requirement: 5.8
   */
  async initialize(): Promise<void> {
    logger.info("QuotaManager", "Initializing");

    // Request persistent storage
    await this.requestPersistentStorage();

    // Get initial usage
    const usage = await this.getTotalUsage();
    logger.info("QuotaManager", "Initial storage usage", {
      totalPercent: usage.total.percentUsed.toFixed(1),
      persistent: usage.persistent,
    });

    // Check if cleanup is needed
    if (
      usage.total.percentUsed >= this.policy.criticalThreshold &&
      this.policy.autoCleanupOnCritical
    ) {
      logger.warn(
        "QuotaManager",
        "Critical threshold exceeded, starting cleanup",
      );
      await this.performCleanup("critical");
    } else if (
      usage.total.percentUsed >= this.policy.warningThreshold &&
      this.policy.autoCleanupOnWarning
    ) {
      logger.warn(
        "QuotaManager",
        "Warning threshold exceeded, starting cleanup",
      );
      await this.performCleanup("warning");
    }
  }

  /**
   * Request persistent storage to prevent eviction
   * Requirement: 5.8
   */
  async requestPersistentStorage(): Promise<boolean> {
    try {
      if (!navigator.storage || !navigator.storage.persist) {
        logger.warn("QuotaManager", "Persistent storage API not available");
        return false;
      }

      // Check if already persistent
      const isPersistent = await navigator.storage.persisted();
      if (isPersistent) {
        logger.info("QuotaManager", "Storage is already persistent");
        this.emitQuotaEvent(QuotaEventType.PERSISTENT_GRANTED, {
          alreadyGranted: true,
        });
        return true;
      }

      // Request persistent storage
      const granted = await navigator.storage.persist();
      if (granted) {
        logger.info("QuotaManager", "Persistent storage granted");
        this.emitQuotaEvent(QuotaEventType.PERSISTENT_GRANTED, {
          alreadyGranted: false,
        });
      } else {
        logger.warn("QuotaManager", "Persistent storage denied");
        this.emitQuotaEvent(QuotaEventType.PERSISTENT_DENIED, {});
      }

      return granted;
    } catch (error) {
      logger.error(
        "QuotaManager",
        "Failed to request persistent storage",
        error,
      );
      return false;
    }
  }

  /**
   * Get total storage usage across all storage areas
   * Requirement: 13.1
   */
  async getTotalUsage(): Promise<TotalStorageUsage> {
    try {
      // Get chrome.storage usage
      const chromeQuota = await this.storageManager.getCombinedQuota();

      // Get IndexedDB and total origin usage
      let indexedDBUsage = 0;
      let totalQuota = 0;
      let totalUsage = 0;
      let persistent = false;

      if (navigator.storage && navigator.storage.estimate) {
        const estimate = await navigator.storage.estimate();
        totalUsage = estimate.usage || 0;
        totalQuota = estimate.quota || 0;

        // IndexedDB usage is part of total usage, subtract chrome.storage
        indexedDBUsage = Math.max(0, totalUsage - chromeQuota.total.bytesInUse);

        persistent = await navigator.storage.persisted();
      }

      const indexedDBQuota = totalQuota > 0 ? totalQuota * 0.6 : 0; // Assume 60% for IndexedDB
      const indexedDBPercent =
        indexedDBQuota > 0 ? (indexedDBUsage / indexedDBQuota) * 100 : 0;
      const totalPercent = totalQuota > 0 ? (totalUsage / totalQuota) * 100 : 0;

      return {
        chromeStorage: {
          sync: chromeQuota.sync,
          local: chromeQuota.local,
        },
        indexedDB: {
          usage: indexedDBUsage,
          quota: indexedDBQuota,
          percentUsed: indexedDBPercent,
        },
        total: {
          usage: totalUsage,
          quota: totalQuota,
          percentUsed: totalPercent,
        },
        persistent,
      };
    } catch (error) {
      logger.error("QuotaManager", "Failed to get total usage", error);
      throw error;
    }
  }

  /**
   * Monitor storage usage and trigger cleanup if needed
   * Requirement: 13.1
   */
  async monitorUsage(): Promise<void> {
    try {
      const usage = await this.getTotalUsage();

      logger.debug("QuotaManager", "Storage usage check", {
        totalPercent: usage.total.percentUsed.toFixed(1),
        indexedDBPercent: usage.indexedDB.percentUsed.toFixed(1),
        chromeLocalPercent: usage.chromeStorage.local.percentUsed.toFixed(1),
      });

      // Check thresholds
      if (usage.total.percentUsed >= this.policy.criticalThreshold) {
        logger.error("QuotaManager", "Critical storage threshold exceeded", {
          percentUsed: usage.total.percentUsed.toFixed(1),
        });
        this.emitQuotaEvent(QuotaEventType.CRITICAL, usage);

        if (this.policy.autoCleanupOnCritical) {
          await this.performCleanup("critical");
        }
      } else if (usage.total.percentUsed >= this.policy.warningThreshold) {
        logger.warn("QuotaManager", "Warning storage threshold exceeded", {
          percentUsed: usage.total.percentUsed.toFixed(1),
        });
        this.emitQuotaEvent(QuotaEventType.WARNING, usage);

        if (this.policy.autoCleanupOnWarning) {
          await this.performCleanup("warning");
        }
      }
    } catch (error) {
      logger.error("QuotaManager", "Usage monitoring failed", error);
    }
  }

  /**
   * Perform automatic cleanup based on policy
   * Requirement: 13.1, 13.9
   */
  async performCleanup(level: "warning" | "critical"): Promise<CleanupResult> {
    const startTime = Date.now();
    const result: CleanupResult = {
      success: false,
      bytesFreed: 0,
      itemsRemoved: {
        conversations: 0,
        aiResponses: 0,
        failedContent: 0,
        chromeStorage: 0,
      },
      errors: [],
      duration: 0,
    };

    logger.info("QuotaManager", `Starting ${level} cleanup`);
    this.emitQuotaEvent(QuotaEventType.CLEANUP_STARTED, { level });

    try {
      const usageBefore = await this.getTotalUsage();

      // 1. Clean up old conversations
      try {
        const conversationsRemoved = await this.cleanupOldConversations();
        result.itemsRemoved.conversations = conversationsRemoved;
        logger.info("QuotaManager", "Cleaned up conversations", {
          count: conversationsRemoved,
        });
      } catch (error) {
        const errorMsg = `Failed to cleanup conversations: ${error}`;
        result.errors.push(errorMsg);
        logger.error("QuotaManager", errorMsg, error);
      }

      // 2. Clean up old AI responses (cache)
      try {
        const responsesRemoved = await this.cleanupOldAIResponses();
        result.itemsRemoved.aiResponses = responsesRemoved;
        logger.info("QuotaManager", "Cleaned up AI responses", {
          count: responsesRemoved,
        });
      } catch (error) {
        const errorMsg = `Failed to cleanup AI responses: ${error}`;
        result.errors.push(errorMsg);
        logger.error("QuotaManager", errorMsg, error);
      }

      // 3. Clean up failed content processing
      try {
        const failedContentRemoved = await this.cleanupFailedContent();
        result.itemsRemoved.failedContent = failedContentRemoved;
        logger.info("QuotaManager", "Cleaned up failed content", {
          count: failedContentRemoved,
        });
      } catch (error) {
        const errorMsg = `Failed to cleanup failed content: ${error}`;
        result.errors.push(errorMsg);
        logger.error("QuotaManager", errorMsg, error);
      }

      // 4. Clean up chrome.storage.local (if critical)
      if (level === "critical") {
        try {
          const chromeCleanup = await this.storageManager.local.cleanup({
            keepMostRecent: 50,
          });
          result.itemsRemoved.chromeStorage = chromeCleanup.itemsRemoved;
          logger.info(
            "QuotaManager",
            "Cleaned up chrome.storage.local",
            chromeCleanup,
          );
        } catch (error) {
          const errorMsg = `Failed to cleanup chrome.storage: ${error}`;
          result.errors.push(errorMsg);
          logger.error("QuotaManager", errorMsg, error);
        }
      }

      // Calculate bytes freed
      const usageAfter = await this.getTotalUsage();
      result.bytesFreed = usageBefore.total.usage - usageAfter.total.usage;
      result.success = result.errors.length === 0;
      result.duration = Date.now() - startTime;

      logger.info("QuotaManager", "Cleanup completed", {
        level,
        bytesFreed: result.bytesFreed,
        totalItemsRemoved: Object.values(result.itemsRemoved).reduce(
          (a, b) => a + b,
          0,
        ),
        duration: result.duration,
        success: result.success,
      });

      this.emitQuotaEvent(QuotaEventType.CLEANUP_COMPLETED, result);
    } catch (error) {
      result.errors.push(`Cleanup failed: ${error}`);
      result.duration = Date.now() - startTime;
      logger.error("QuotaManager", "Cleanup failed", error);
    }

    return result;
  }

  /**
   * Clean up old conversations based on policy
   */
  private async cleanupOldConversations(): Promise<number> {
    const conversations = await indexedDBManager.listConversations();
    const now = Date.now();
    const maxAge = this.policy.maxConversationAge * 24 * 60 * 60 * 1000; // Convert days to ms

    // Sort by updatedAt descending (most recent first)
    conversations.sort((a, b) => b.updatedAt - a.updatedAt);

    // Keep recent conversations, remove old ones
    const toRemove = conversations
      .slice(this.policy.keepRecentConversations)
      .filter((conv) => now - conv.updatedAt > maxAge);

    for (const conv of toRemove) {
      await indexedDBManager.deleteConversation(conv.id);
    }

    return toRemove.length;
  }

  /**
   * Clean up old AI responses (cached responses)
   */
  private async cleanupOldAIResponses(): Promise<number> {
    // AI responses are stored in IndexedDB but we need to implement a query
    // For now, we'll implement a basic cleanup strategy
    // This would need to be extended based on actual AI response storage implementation
    const maxAge = this.policy.maxAIResponseAge * 24 * 60 * 60 * 1000;

    // TODO: Implement AI response cleanup when AI response storage is implemented
    // For now, return 0 as placeholder
    logger.debug("QuotaManager", "AI response cleanup not yet implemented");
    return 0;
  }

  /**
   * Clean up content with failed processing status
   */
  private async cleanupFailedContent(): Promise<number> {
    const pockets = await indexedDBManager.listPockets();
    const now = Date.now();
    const maxAge = this.policy.maxContentAge * 24 * 60 * 60 * 1000;
    let removed = 0;

    for (const pocket of pockets) {
      const contents = await indexedDBManager.getContentByPocket(pocket.id);

      for (const content of contents) {
        // Remove failed content older than maxContentAge
        if (
          content.processingStatus === ProcessingStatus.FAILED &&
          now - content.capturedAt > maxAge
        ) {
          await indexedDBManager.deleteContent(content.id);
          
          // Enqueue vector indexing DELETE job (non-blocking)
          vectorIndexingQueue.enqueueContent(content.id, IndexingOperation.DELETE).catch((error) => {
            logger.error("QuotaManager", "Failed to enqueue vector deletion job", { contentId: content.id, error });
          });
          
          removed++;
        }
      }
    }

    return removed;
  }

  /**
   * Start periodic quota monitoring
   * Requirement: 13.1
   */
  startMonitoring(intervalMs: number = 60000): void {
    if (this.monitoringInterval !== null) {
      logger.warn("QuotaManager", "Monitoring already started");
      return;
    }

    logger.info("QuotaManager", "Starting quota monitoring", { intervalMs });

    this.monitoringInterval = setInterval(() => {
      this.monitorUsage().catch((error) => {
        logger.error("QuotaManager", "Monitoring error", error);
      });
    }, intervalMs) as unknown as number;

    // Run initial check
    this.monitorUsage().catch((error) => {
      logger.error("QuotaManager", "Initial monitoring check failed", error);
    });
  }

  /**
   * Stop quota monitoring
   */
  stopMonitoring(): void {
    if (this.monitoringInterval !== null) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      logger.info("QuotaManager", "Stopped quota monitoring");
    }
  }

  /**
   * Update cleanup policy
   */
  updatePolicy(updates: Partial<CleanupPolicy>): void {
    this.policy = { ...this.policy, ...updates };
    logger.info("QuotaManager", "Cleanup policy updated", updates);
  }

  /**
   * Get current cleanup policy
   */
  getPolicy(): CleanupPolicy {
    return { ...this.policy };
  }

  /**
   * Emit quota event for monitoring
   */
  private emitQuotaEvent(type: QuotaEventType, data: any): void {
    const event = new CustomEvent("quota-event", {
      detail: { type, data, timestamp: Date.now() },
    });
    globalThis.dispatchEvent(event);
  }

  /**
   * Force cleanup regardless of thresholds
   */
  async forceCleanup(): Promise<CleanupResult> {
    logger.info("QuotaManager", "Force cleanup requested");
    return this.performCleanup("critical");
  }

  /**
   * Get storage usage breakdown by store
   */
  async getUsageBreakdown(): Promise<{
    pockets: number;
    content: number;
    conversations: number;
    embeddings: number;
  }> {
    // This is an estimate based on item counts
    // Actual byte size would require iterating through all items
    const [pockets, conversations] = await Promise.all([
      indexedDBManager.listPockets(),
      indexedDBManager.listConversations(),
    ]);

    let contentCount = 0;
    for (const pocket of pockets) {
      contentCount += pocket.contentIds.length;
    }

    return {
      pockets: pockets.length,
      content: contentCount,
      conversations: conversations.length,
      embeddings: 0, // Would need to query embeddings store
    };
  }
}

// Export singleton instance
let _quotaManager: QuotaManager | null = null;

export function getQuotaManager(): QuotaManager {
  if (!_quotaManager) {
    _quotaManager = new QuotaManager();
  }
  return _quotaManager;
}

// For backward compatibility
export const quotaManager = new Proxy({} as QuotaManager, {
  get(target, prop) {
    return getQuotaManager()[prop as keyof QuotaManager];
  },
});
