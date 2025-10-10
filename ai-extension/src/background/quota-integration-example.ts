/**
 * Quota Manager Integration Example
 * Demonstrates how to use the quota manager in various scenarios
 */

import { getQuotaManager, QuotaEventType } from "./quota-manager.js";
import { logger } from "./monitoring.js";

/**
 * Example 1: Basic initialization and monitoring
 */
export async function example1_BasicUsage(): Promise<void> {
  const quotaManager = getQuotaManager();

  // Initialize and request persistent storage
  await quotaManager.initialize();

  // Get current usage
  const usage = await quotaManager.getTotalUsage();
  console.log("Storage usage:", {
    total: `${usage.total.percentUsed.toFixed(1)}%`,
    indexedDB: `${usage.indexedDB.percentUsed.toFixed(1)}%`,
    chromeLocal: `${usage.chromeStorage.local.percentUsed.toFixed(1)}%`,
    chromeSync: `${usage.chromeStorage.sync.percentUsed.toFixed(1)}%`,
    persistent: usage.persistent,
  });

  // Start monitoring (checks every 60 seconds)
  quotaManager.startMonitoring(60000);
}

/**
 * Example 2: Custom cleanup policy
 */
export async function example2_CustomPolicy(): Promise<void> {
  const quotaManager = getQuotaManager();

  // Update cleanup policy
  quotaManager.updatePolicy({
    warningThreshold: 75, // Trigger at 75% instead of 80%
    criticalThreshold: 90, // Trigger at 90% instead of 95%
    maxConversationAge: 60, // Keep conversations for 60 days
    keepRecentConversations: 20, // Keep 20 most recent
    autoCleanupOnWarning: true, // Enable auto-cleanup on warning
  });

  await quotaManager.initialize();
  quotaManager.startMonitoring();
}

/**
 * Example 3: Manual cleanup
 */
export async function example3_ManualCleanup(): Promise<void> {
  const quotaManager = getQuotaManager();

  // Force cleanup regardless of thresholds
  const result = await quotaManager.forceCleanup();

  console.log("Cleanup result:", {
    success: result.success,
    bytesFreed: `${(result.bytesFreed / 1024 / 1024).toFixed(2)} MB`,
    itemsRemoved: result.itemsRemoved,
    duration: `${result.duration}ms`,
    errors: result.errors,
  });
}

/**
 * Example 4: Listen for quota events
 */
export function example4_QuotaEvents(): void {
  globalThis.addEventListener("quota-event", (event: Event) => {
    const customEvent = event as CustomEvent;
    const { type, data, timestamp } = customEvent.detail;

    switch (type) {
      case QuotaEventType.WARNING:
        logger.warn("QuotaEvent", "Storage warning", {
          percentUsed: data.total.percentUsed,
          timestamp: new Date(timestamp).toISOString(),
        });
        // Show user notification or UI warning
        break;

      case QuotaEventType.CRITICAL:
        logger.error("QuotaEvent", "Storage critical", {
          percentUsed: data.total.percentUsed,
          timestamp: new Date(timestamp).toISOString(),
        });
        // Show urgent notification
        chrome.notifications.create({
          type: "basic",
          iconUrl: "icons/icon-128.png",
          title: "Storage Critical",
          message: "AI Pocket storage is almost full. Please free up space.",
        });
        break;

      case QuotaEventType.CLEANUP_STARTED:
        logger.info("QuotaEvent", "Cleanup started", data);
        // Show loading indicator
        break;

      case QuotaEventType.CLEANUP_COMPLETED:
        logger.info("QuotaEvent", "Cleanup completed", {
          bytesFreed: data.bytesFreed,
          itemsRemoved: data.itemsRemoved,
          duration: data.duration,
        });
        // Hide loading indicator, show success message
        break;

      case QuotaEventType.PERSISTENT_GRANTED:
        logger.info("QuotaEvent", "Persistent storage granted", data);
        break;

      case QuotaEventType.PERSISTENT_DENIED:
        logger.warn("QuotaEvent", "Persistent storage denied", data);
        // Inform user that data may be evicted
        break;
    }
  });
}

/**
 * Example 5: Check before large operations
 */
export async function example5_CheckBeforeOperation(
  estimatedBytes: number,
): Promise<boolean> {
  const quotaManager = getQuotaManager();
  const usage = await quotaManager.getTotalUsage();

  // Check if we have enough space
  const availableBytes = usage.total.quota - usage.total.usage;

  if (availableBytes < estimatedBytes) {
    logger.warn("QuotaCheck", "Insufficient space", {
      needed: estimatedBytes,
      available: availableBytes,
    });

    // Try cleanup
    const result = await quotaManager.performCleanup("warning");

    // Check again after cleanup
    const newUsage = await quotaManager.getTotalUsage();
    const newAvailable = newUsage.total.quota - newUsage.total.usage;

    if (newAvailable < estimatedBytes) {
      // Still not enough space
      return false;
    }
  }

  return true;
}

/**
 * Example 6: Get usage breakdown
 */
export async function example6_UsageBreakdown(): Promise<void> {
  const quotaManager = getQuotaManager();

  const breakdown = await quotaManager.getUsageBreakdown();
  const usage = await quotaManager.getTotalUsage();

  console.log("Storage breakdown:", {
    pockets: breakdown.pockets,
    content: breakdown.content,
    conversations: breakdown.conversations,
    embeddings: breakdown.embeddings,
    totalBytes: usage.total.usage,
    totalPercent: usage.total.percentUsed.toFixed(1) + "%",
  });
}

/**
 * Example 7: Handle storage errors
 */
export async function example7_HandleStorageError(error: any): Promise<void> {
  if (error.message?.includes("quota") || error.message?.includes("QUOTA")) {
    logger.error("StorageError", "Quota exceeded", error);

    // Trigger immediate cleanup
    const quotaManager = getQuotaManager();
    const result = await quotaManager.forceCleanup();

    if (result.success && result.bytesFreed > 0) {
      logger.info("StorageError", "Cleanup freed space, retrying operation");
      // Retry the failed operation
    } else {
      logger.error("StorageError", "Cleanup failed to free enough space");
      // Notify user to manually free space
      chrome.notifications.create({
        type: "basic",
        iconUrl: "icons/icon-128.png",
        title: "Storage Full",
        message: "Please delete some pockets or content to free up space.",
      });
    }
  }
}

/**
 * Example 8: Periodic usage reporting
 */
export async function example8_UsageReport(): Promise<void> {
  const quotaManager = getQuotaManager();

  // Get detailed usage information
  const usage = await quotaManager.getTotalUsage();
  const breakdown = await quotaManager.getUsageBreakdown();
  const policy = quotaManager.getPolicy();

  const report = {
    timestamp: new Date().toISOString(),
    storage: {
      total: {
        used: `${(usage.total.usage / 1024 / 1024).toFixed(2)} MB`,
        quota: `${(usage.total.quota / 1024 / 1024).toFixed(2)} MB`,
        percent: `${usage.total.percentUsed.toFixed(1)}%`,
      },
      indexedDB: {
        used: `${(usage.indexedDB.usage / 1024 / 1024).toFixed(2)} MB`,
        percent: `${usage.indexedDB.percentUsed.toFixed(1)}%`,
      },
      chromeLocal: {
        used: `${(usage.chromeStorage.local.bytesInUse / 1024).toFixed(2)} KB`,
        percent: `${usage.chromeStorage.local.percentUsed.toFixed(1)}%`,
      },
      chromeSync: {
        used: `${(usage.chromeStorage.sync.bytesInUse / 1024).toFixed(2)} KB`,
        percent: `${usage.chromeStorage.sync.percentUsed.toFixed(1)}%`,
      },
    },
    items: breakdown,
    persistent: usage.persistent,
    policy: {
      warningThreshold: policy.warningThreshold + "%",
      criticalThreshold: policy.criticalThreshold + "%",
      autoCleanup: policy.autoCleanupOnWarning || policy.autoCleanupOnCritical,
    },
  };

  logger.info("UsageReport", "Storage usage report", report);
  return report as any;
}

/**
 * Example 9: Integration with UI
 */
export async function example9_UIIntegration(): Promise<{
  status: "healthy" | "warning" | "critical";
  message: string;
  usage: number;
  canSave: boolean;
}> {
  const quotaManager = getQuotaManager();
  const usage = await quotaManager.getTotalUsage();
  const policy = quotaManager.getPolicy();

  let status: "healthy" | "warning" | "critical";
  let message: string;
  let canSave: boolean;

  if (usage.total.percentUsed >= policy.criticalThreshold) {
    status = "critical";
    message = "Storage is almost full. Please free up space.";
    canSave = false;
  } else if (usage.total.percentUsed >= policy.warningThreshold) {
    status = "warning";
    message = "Storage is getting full. Consider cleaning up old data.";
    canSave = true;
  } else {
    status = "healthy";
    message = "Storage is healthy.";
    canSave = true;
  }

  return {
    status,
    message,
    usage: usage.total.percentUsed,
    canSave,
  };
}

/**
 * Example 10: Complete integration in service worker
 */
export async function example10_ServiceWorkerIntegration(): Promise<void> {
  const quotaManager = getQuotaManager();

  // Initialize on startup
  await quotaManager.initialize();

  // Start monitoring
  quotaManager.startMonitoring(60000);

  // Listen for events
  globalThis.addEventListener("quota-event", (event: Event) => {
    const customEvent = event as CustomEvent;
    const { type, data } = customEvent.detail;

    if (type === QuotaEventType.CRITICAL) {
      // Send message to UI
      chrome.runtime.sendMessage({
        kind: "QUOTA_CRITICAL",
        payload: { usage: data.total.percentUsed },
      });
    }
  });

  // Handle storage errors globally
  globalThis.addEventListener("unhandledrejection", async (event) => {
    if (event.reason?.message?.includes("quota")) {
      await example7_HandleStorageError(event.reason);
    }
  });

  logger.info("QuotaManager", "Fully integrated with service worker");
}
