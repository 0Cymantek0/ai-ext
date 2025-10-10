/**
 * Chrome Storage Wrapper
 * Provides wrappers for sync and local storage with error handling, retry logic, and quota monitoring
 * Requirements: 5.2, 5.8, 13.1
 */

import { logger } from "./monitoring.js";

/**
 * Storage error types
 */
export enum StorageErrorType {
  QUOTA_EXCEEDED = "QUOTA_EXCEEDED",
  ACCESS_DENIED = "ACCESS_DENIED",
  NETWORK_ERROR = "NETWORK_ERROR",
  CORRUPTION = "CORRUPTION",
  UNKNOWN = "UNKNOWN",
}

/**
 * Storage error class
 */
export class StorageError extends Error {
  constructor(
    public type: StorageErrorType,
    message: string,
    public originalError?: unknown,
  ) {
    super(message);
    this.name = "StorageError";
  }
}

/**
 * Retry configuration
 */
interface RetryConfig {
  maxAttempts: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
}

/**
 * Storage quota information
 */
export interface StorageQuota {
  bytesInUse: number;
  bytesAvailable: number;
  percentUsed: number;
  isNearLimit: boolean;
  isAtLimit: boolean;
}

/**
 * Storage operation options
 */
interface StorageOptions {
  retry?: boolean;
  retryConfig?: Partial<RetryConfig>;
  throwOnQuotaExceeded?: boolean;
}

/**
 * Default retry configuration
 */
const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelay: 100,
  maxDelay: 2000,
  backoffMultiplier: 2,
};

/**
 * Storage quota thresholds
 */
const QUOTA_WARNING_THRESHOLD = 0.8; // 80%
const QUOTA_CRITICAL_THRESHOLD = 0.95; // 95%

/**
 * Chrome Storage Wrapper Base Class
 */
abstract class ChromeStorageWrapper {
  protected abstract storageArea: chrome.storage.StorageArea;
  protected abstract storageName: string;
  protected abstract quotaBytes: number;

  /**
   * Get items from storage with error handling and retry logic
   */
  async get<T = any>(
    keys?: string | string[] | null,
    options: StorageOptions = {},
  ): Promise<T> {
    const operation = async (): Promise<T> => {
      try {
        const result = await this.storageArea.get(keys);
        logger.debug("StorageWrapper", `${this.storageName}.get`, {
          keys,
          resultKeys: Object.keys(result),
        });
        return result as T;
      } catch (error) {
        throw this.handleStorageError(error, "get");
      }
    };

    if (options.retry !== false) {
      return this.retryOperation(operation, options.retryConfig);
    }

    return operation();
  }

  /**
   * Set items in storage with error handling and retry logic
   */
  async set(
    items: Record<string, any>,
    options: StorageOptions = {},
  ): Promise<void> {
    const operation = async (): Promise<void> => {
      try {
        // Check quota before setting
        const quota = await this.getQuota();
        if (quota.isAtLimit && options.throwOnQuotaExceeded !== false) {
          throw new StorageError(
            StorageErrorType.QUOTA_EXCEEDED,
            `${this.storageName} quota exceeded (${quota.percentUsed.toFixed(1)}% used)`,
          );
        }

        await this.storageArea.set(items);
        logger.debug("StorageWrapper", `${this.storageName}.set`, {
          keys: Object.keys(items),
          sizes: Object.entries(items).map(([key, value]) => ({
            key,
            bytes: new Blob([JSON.stringify(value)]).size,
          })),
        });

        // Check quota after setting and warn if near limit
        const newQuota = await this.getQuota();
        if (newQuota.isNearLimit) {
          logger.warn("StorageWrapper", `${this.storageName} quota warning`, {
            percentUsed: newQuota.percentUsed.toFixed(1),
            bytesInUse: newQuota.bytesInUse,
            bytesAvailable: newQuota.bytesAvailable,
          });
        }
      } catch (error) {
        throw this.handleStorageError(error, "set");
      }
    };

    if (options.retry !== false) {
      return this.retryOperation(operation, options.retryConfig);
    }

    return operation();
  }

  /**
   * Remove items from storage with error handling and retry logic
   */
  async remove(
    keys: string | string[],
    options: StorageOptions = {},
  ): Promise<void> {
    const operation = async (): Promise<void> => {
      try {
        await this.storageArea.remove(keys);
        logger.debug("StorageWrapper", `${this.storageName}.remove`, { keys });
      } catch (error) {
        throw this.handleStorageError(error, "remove");
      }
    };

    if (options.retry !== false) {
      return this.retryOperation(operation, options.retryConfig);
    }

    return operation();
  }

  /**
   * Clear all items from storage with error handling and retry logic
   */
  async clear(options: StorageOptions = {}): Promise<void> {
    const operation = async (): Promise<void> => {
      try {
        await this.storageArea.clear();
        logger.info("StorageWrapper", `${this.storageName}.clear`, {
          message: "All items cleared",
        });
      } catch (error) {
        throw this.handleStorageError(error, "clear");
      }
    };

    if (options.retry !== false) {
      return this.retryOperation(operation, options.retryConfig);
    }

    return operation();
  }

  /**
   * Get storage quota information
   * Requirement: 5.8, 13.1
   */
  async getQuota(): Promise<StorageQuota> {
    try {
      const bytesInUse = await this.storageArea.getBytesInUse();
      const bytesAvailable = this.quotaBytes - bytesInUse;
      const percentUsed = (bytesInUse / this.quotaBytes) * 100;
      const isNearLimit = percentUsed >= QUOTA_WARNING_THRESHOLD * 100;
      const isAtLimit = percentUsed >= QUOTA_CRITICAL_THRESHOLD * 100;

      return {
        bytesInUse,
        bytesAvailable,
        percentUsed,
        isNearLimit,
        isAtLimit,
      };
    } catch (error) {
      logger.error(
        "StorageWrapper",
        `${this.storageName}.getQuota failed`,
        error,
      );
      throw this.handleStorageError(error, "getQuota");
    }
  }

  /**
   * Get the size of specific items in bytes
   */
  async getBytesInUse(keys?: string | string[]): Promise<number> {
    try {
      const bytes = await this.storageArea.getBytesInUse(keys);
      logger.debug("StorageWrapper", `${this.storageName}.getBytesInUse`, {
        keys,
        bytes,
      });
      return bytes;
    } catch (error) {
      throw this.handleStorageError(error, "getBytesInUse");
    }
  }

  /**
   * Check if storage has enough space for data
   */
  async hasSpace(estimatedBytes: number): Promise<boolean> {
    const quota = await this.getQuota();
    return quota.bytesAvailable >= estimatedBytes;
  }

  /**
   * Estimate the size of data in bytes
   */
  estimateSize(data: any): number {
    try {
      const json = JSON.stringify(data);
      return new Blob([json]).size;
    } catch (error) {
      logger.error("StorageWrapper", "Failed to estimate size", error);
      return 0;
    }
  }

  /**
   * Retry operation with exponential backoff
   */
  protected async retryOperation<T>(
    operation: () => Promise<T>,
    customConfig?: Partial<RetryConfig>,
  ): Promise<T> {
    const config = { ...DEFAULT_RETRY_CONFIG, ...customConfig };
    let lastError: Error | undefined;
    let delay = config.initialDelay;

    for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry on quota exceeded or access denied
        if (
          error instanceof StorageError &&
          (error.type === StorageErrorType.QUOTA_EXCEEDED ||
            error.type === StorageErrorType.ACCESS_DENIED)
        ) {
          throw error;
        }

        if (attempt < config.maxAttempts) {
          logger.warn(
            "StorageWrapper",
            `Retry attempt ${attempt}/${config.maxAttempts}`,
            {
              error: lastError.message,
              nextDelay: delay,
            },
          );

          await this.sleep(delay);
          delay = Math.min(delay * config.backoffMultiplier, config.maxDelay);
        }
      }
    }

    logger.error("StorageWrapper", "All retry attempts failed", lastError);
    throw lastError;
  }

  /**
   * Sleep utility for retry delays
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Handle storage errors and convert to StorageError
   */
  protected handleStorageError(
    error: unknown,
    operation: string,
  ): StorageError {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Classify error type
    let errorType = StorageErrorType.UNKNOWN;

    if (errorMessage.includes("QUOTA_BYTES")) {
      errorType = StorageErrorType.QUOTA_EXCEEDED;
    } else if (
      errorMessage.includes("access") ||
      errorMessage.includes("permission")
    ) {
      errorType = StorageErrorType.ACCESS_DENIED;
    } else if (
      errorMessage.includes("network") ||
      errorMessage.includes("offline")
    ) {
      errorType = StorageErrorType.NETWORK_ERROR;
    } else if (
      errorMessage.includes("corrupt") ||
      errorMessage.includes("invalid")
    ) {
      errorType = StorageErrorType.CORRUPTION;
    }

    const storageError = new StorageError(
      errorType,
      `${this.storageName}.${operation} failed: ${errorMessage}`,
      error,
    );

    logger.error("StorageWrapper", `${this.storageName}.${operation} error`, {
      type: errorType,
      message: errorMessage,
    });

    return storageError;
  }

  /**
   * Add storage change listener
   */
  onChanged(
    callback: (changes: Record<string, chrome.storage.StorageChange>) => void,
  ): void {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === this.storageName) {
        callback(changes);
      }
    });
  }
}

/**
 * Chrome Sync Storage Wrapper
 * Requirement: 5.2 - Encrypted storage
 */
export class ChromeSyncStorage extends ChromeStorageWrapper {
  protected storageArea = chrome.storage.sync;
  protected storageName = "sync";
  protected quotaBytes = chrome.storage.sync.QUOTA_BYTES; // 102,400 bytes (100KB)

  /**
   * Get maximum items allowed in sync storage
   */
  getMaxItems(): number {
    return chrome.storage.sync.MAX_ITEMS; // 512 items
  }

  /**
   * Get maximum bytes per item
   */
  getMaxBytesPerItem(): number {
    return chrome.storage.sync.QUOTA_BYTES_PER_ITEM; // 8,192 bytes (8KB)
  }

  /**
   * Validate item size before setting
   */
  async setWithValidation(
    items: Record<string, any>,
    options: StorageOptions = {},
  ): Promise<void> {
    // Validate each item size
    for (const [key, value] of Object.entries(items)) {
      const size = this.estimateSize(value);
      if (size > this.getMaxBytesPerItem()) {
        throw new StorageError(
          StorageErrorType.QUOTA_EXCEEDED,
          `Item "${key}" exceeds max bytes per item (${size} > ${this.getMaxBytesPerItem()})`,
        );
      }
    }

    // Validate total items count
    const currentItems = await this.get();
    const totalItems =
      Object.keys(currentItems).length + Object.keys(items).length;
    if (totalItems > this.getMaxItems()) {
      throw new StorageError(
        StorageErrorType.QUOTA_EXCEEDED,
        `Total items would exceed max items (${totalItems} > ${this.getMaxItems()})`,
      );
    }

    return this.set(items, options);
  }
}

/**
 * Chrome Local Storage Wrapper
 * Requirement: 5.8 - Quota monitoring
 */
export class ChromeLocalStorage extends ChromeStorageWrapper {
  protected storageArea = chrome.storage.local;
  protected storageName = "local";
  protected quotaBytes = chrome.storage.local.QUOTA_BYTES; // 10,485,760 bytes (10MB)

  /**
   * Get detailed quota information with breakdown
   */
  async getDetailedQuota(): Promise<
    StorageQuota & { itemSizes: Array<{ key: string; bytes: number }> }
  > {
    const quota = await this.getQuota();
    const allItems = await this.get();
    const itemSizes = Object.keys(allItems).map((key) => ({
      key,
      bytes: this.estimateSize(allItems[key]),
    }));

    // Sort by size descending
    itemSizes.sort((a, b) => b.bytes - a.bytes);

    return {
      ...quota,
      itemSizes,
    };
  }

  /**
   * Clean up old or large items to free space
   * Requirement: 13.1 - Performance optimization
   */
  async cleanup(
    options: {
      removeKeys?: string[];
      keepMostRecent?: number;
      minBytesToFree?: number;
    } = {},
  ): Promise<{ bytesFreed: number; itemsRemoved: number }> {
    const beforeQuota = await this.getQuota();
    let itemsRemoved = 0;

    // Remove specific keys if provided
    if (options.removeKeys && options.removeKeys.length > 0) {
      await this.remove(options.removeKeys);
      itemsRemoved += options.removeKeys.length;
    }

    // Remove oldest items if keepMostRecent specified
    if (options.keepMostRecent) {
      const allItems = await this.get();
      const itemsWithTimestamp = Object.entries(allItems)
        .filter(
          ([_, value]) =>
            value && typeof value === "object" && "timestamp" in value,
        )
        .sort((a, b) => (b[1] as any).timestamp - (a[1] as any).timestamp);

      if (itemsWithTimestamp.length > options.keepMostRecent) {
        const toRemove = itemsWithTimestamp
          .slice(options.keepMostRecent)
          .map(([key]) => key);
        await this.remove(toRemove);
        itemsRemoved += toRemove.length;
      }
    }

    const afterQuota = await this.getQuota();
    const bytesFreed = beforeQuota.bytesInUse - afterQuota.bytesInUse;

    logger.info("StorageWrapper", "local.cleanup completed", {
      bytesFreed,
      itemsRemoved,
      percentUsedBefore: beforeQuota.percentUsed.toFixed(1),
      percentUsedAfter: afterQuota.percentUsed.toFixed(1),
    });

    return { bytesFreed, itemsRemoved };
  }
}

/**
 * Storage Manager - Unified interface for both storage areas
 * Requirement: 13.1 - Performance optimization
 */
export class StorageManager {
  public readonly sync: ChromeSyncStorage;
  public readonly local: ChromeLocalStorage;

  constructor() {
    // Lazy initialization to avoid issues during testing
    this.sync = new ChromeSyncStorage();
    this.local = new ChromeLocalStorage();
  }

  /**
   * Get combined quota information
   */
  async getCombinedQuota(): Promise<{
    sync: StorageQuota;
    local: StorageQuota;
    total: {
      bytesInUse: number;
      percentUsed: number;
      hasWarnings: boolean;
    };
  }> {
    const [syncQuota, localQuota] = await Promise.all([
      this.sync.getQuota(),
      this.local.getQuota(),
    ]);

    const totalBytesInUse = syncQuota.bytesInUse + localQuota.bytesInUse;
    const totalQuota = this.sync["quotaBytes"] + this.local["quotaBytes"];
    const totalPercentUsed = (totalBytesInUse / totalQuota) * 100;
    const hasWarnings = syncQuota.isNearLimit || localQuota.isNearLimit;

    return {
      sync: syncQuota,
      local: localQuota,
      total: {
        bytesInUse: totalBytesInUse,
        percentUsed: totalPercentUsed,
        hasWarnings,
      },
    };
  }

  /**
   * Monitor storage quota and emit warnings
   * Requirement: 5.8, 13.1
   */
  async monitorQuota(): Promise<void> {
    const quota = await this.getCombinedQuota();

    if (quota.sync.isAtLimit) {
      logger.error("StorageManager", "Sync storage at critical limit", {
        percentUsed: quota.sync.percentUsed.toFixed(1),
      });
      this.emitQuotaEvent("critical", "sync", quota.sync);
    } else if (quota.sync.isNearLimit) {
      logger.warn("StorageManager", "Sync storage near limit", {
        percentUsed: quota.sync.percentUsed.toFixed(1),
      });
      this.emitQuotaEvent("warning", "sync", quota.sync);
    }

    if (quota.local.isAtLimit) {
      logger.error("StorageManager", "Local storage at critical limit", {
        percentUsed: quota.local.percentUsed.toFixed(1),
      });
      this.emitQuotaEvent("critical", "local", quota.local);
    } else if (quota.local.isNearLimit) {
      logger.warn("StorageManager", "Local storage near limit", {
        percentUsed: quota.local.percentUsed.toFixed(1),
      });
      this.emitQuotaEvent("warning", "local", quota.local);
    }
  }

  /**
   * Emit quota event for monitoring
   */
  private emitQuotaEvent(
    level: "warning" | "critical",
    area: "sync" | "local",
    quota: StorageQuota,
  ): void {
    const event = new CustomEvent("storage-quota-event", {
      detail: { level, area, quota },
    });
    globalThis.dispatchEvent(event);
  }

  /**
   * Start periodic quota monitoring
   */
  startQuotaMonitoring(intervalMs: number = 60000): number {
    logger.info("StorageManager", "Starting quota monitoring", {
      intervalMs,
    });

    const timerId = setInterval(() => {
      this.monitorQuota().catch((error) => {
        logger.error("StorageManager", "Quota monitoring failed", error);
      });
    }, intervalMs);

    return timerId as unknown as number;
  }

  /**
   * Stop quota monitoring
   */
  stopQuotaMonitoring(timerId: number): void {
    clearInterval(timerId);
    logger.info("StorageManager", "Stopped quota monitoring");
  }
}

// Export singleton instance (lazy initialization)
let _storageManager: StorageManager | null = null;

export function getStorageManager(): StorageManager {
  if (!_storageManager) {
    _storageManager = new StorageManager();
  }
  return _storageManager;
}

// For backward compatibility
export const storageManager = new Proxy({} as StorageManager, {
  get(target, prop) {
    return getStorageManager()[prop as keyof StorageManager];
  },
});
