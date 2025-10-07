/**
 * Example: Integrating Storage Wrapper with Service Worker
 * 
 * This file demonstrates how to use the storage wrapper in the service worker
 * for state persistence and data management.
 */

import { storageManager, StorageError, StorageErrorType } from './storage-wrapper.js';
import { logger } from './monitoring.js';

/**
 * Example 1: Persisting Service Worker State
 */
export async function persistServiceWorkerState(state: any): Promise<void> {
  try {
    await storageManager.local.set({
      service_worker_state: {
        ...state,
        timestamp: Date.now(),
      },
    });
    logger.debug('StorageIntegration', 'State persisted successfully');
  } catch (error) {
    if (error instanceof StorageError && error.type === StorageErrorType.QUOTA_EXCEEDED) {
      // Clean up old data and retry
      logger.warn('StorageIntegration', 'Quota exceeded, cleaning up');
      await storageManager.local.cleanup({ keepMostRecent: 50 });
      await storageManager.local.set({ service_worker_state: state });
    } else {
      logger.error('StorageIntegration', 'Failed to persist state', error);
      throw error;
    }
  }
}

/**
 * Example 2: Restoring Service Worker State
 */
export async function restoreServiceWorkerState(): Promise<any> {
  try {
    const result = await storageManager.local.get('service_worker_state');
    return result.service_worker_state || null;
  } catch (error) {
    logger.error('StorageIntegration', 'Failed to restore state', error);
    return null;
  }
}

/**
 * Example 3: Storing User Preferences (Sync Storage)
 */
export async function saveUserPreferences(preferences: any): Promise<void> {
  try {
    // Validate size before storing
    const size = storageManager.sync.estimateSize(preferences);
    const maxSize = storageManager.sync['getMaxBytesPerItem']();
    
    if (size > maxSize) {
      throw new Error(`Preferences too large: ${size} > ${maxSize} bytes`);
    }

    await storageManager.sync.setWithValidation({
      userPreferences: preferences,
    });

    logger.info('StorageIntegration', 'User preferences saved', {
      size,
      keys: Object.keys(preferences),
    });
  } catch (error) {
    logger.error('StorageIntegration', 'Failed to save preferences', error);
    throw error;
  }
}

/**
 * Example 4: Loading User Preferences
 */
export async function loadUserPreferences(): Promise<any> {
  try {
    const result = await storageManager.sync.get('userPreferences');
    return result.userPreferences || getDefaultPreferences();
  } catch (error) {
    logger.error('StorageIntegration', 'Failed to load preferences', error);
    return getDefaultPreferences();
  }
}

function getDefaultPreferences() {
  return {
    theme: 'auto',
    language: 'en',
    defaultAIModel: 'nano',
    privacyMode: 'balanced',
  };
}

/**
 * Example 5: Storing Captured Content (Local Storage)
 */
export async function saveCapturedContent(content: any): Promise<string> {
  const contentId = crypto.randomUUID();
  
  try {
    // Check if we have enough space
    const estimatedSize = storageManager.local.estimateSize(content);
    const hasSpace = await storageManager.local.hasSpace(estimatedSize);

    if (!hasSpace) {
      logger.warn('StorageIntegration', 'Insufficient space, cleaning up');
      await storageManager.local.cleanup({
        keepMostRecent: 100,
        minBytesToFree: estimatedSize,
      });
    }

    await storageManager.local.set({
      [`content_${contentId}`]: {
        ...content,
        id: contentId,
        timestamp: Date.now(),
      },
    });

    logger.info('StorageIntegration', 'Content saved', {
      contentId,
      size: estimatedSize,
    });

    return contentId;
  } catch (error) {
    logger.error('StorageIntegration', 'Failed to save content', error);
    throw error;
  }
}

/**
 * Example 6: Monitoring Storage Quota
 */
export function startStorageMonitoring(): number {
  logger.info('StorageIntegration', 'Starting storage monitoring');

  // Listen for quota events
  globalThis.addEventListener('storage-quota-event', async (event: Event) => {
    const customEvent = event as CustomEvent;
    const { level, area, quota } = customEvent.detail;

    if (level === 'critical') {
      logger.error('StorageIntegration', `${area} storage critical`, {
        percentUsed: quota.percentUsed.toFixed(1),
      });

      // Trigger aggressive cleanup
      if (area === 'local') {
        await storageManager.local.cleanup({
          keepMostRecent: 50,
          minBytesToFree: quota.bytesInUse * 0.2, // Free 20%
        });
      }
    } else if (level === 'warning') {
      logger.warn('StorageIntegration', `${area} storage warning`, {
        percentUsed: quota.percentUsed.toFixed(1),
      });
    }
  });

  // Start periodic monitoring (every minute)
  return storageManager.startQuotaMonitoring(60000);
}

/**
 * Example 7: Batch Operations
 */
export async function saveBatchContent(items: any[]): Promise<string[]> {
  const contentIds: string[] = [];
  const batchData: Record<string, any> = {};

  // Prepare batch
  for (const item of items) {
    const contentId = crypto.randomUUID();
    contentIds.push(contentId);
    batchData[`content_${contentId}`] = {
      ...item,
      id: contentId,
      timestamp: Date.now(),
    };
  }

  try {
    // Check total size
    const totalSize = storageManager.local.estimateSize(batchData);
    const hasSpace = await storageManager.local.hasSpace(totalSize);

    if (!hasSpace) {
      throw new StorageError(
        StorageErrorType.QUOTA_EXCEEDED,
        `Insufficient space for batch: ${totalSize} bytes needed`
      );
    }

    // Save all at once
    await storageManager.local.set(batchData);

    logger.info('StorageIntegration', 'Batch saved', {
      count: items.length,
      totalSize,
    });

    return contentIds;
  } catch (error) {
    logger.error('StorageIntegration', 'Failed to save batch', error);
    throw error;
  }
}

/**
 * Example 8: Storage Analytics
 */
export async function getStorageAnalytics() {
  const [combinedQuota, detailedQuota] = await Promise.all([
    storageManager.getCombinedQuota(),
    storageManager.local.getDetailedQuota(),
  ]);

  return {
    sync: {
      bytesInUse: combinedQuota.sync.bytesInUse,
      percentUsed: combinedQuota.sync.percentUsed,
      isNearLimit: combinedQuota.sync.isNearLimit,
    },
    local: {
      bytesInUse: combinedQuota.local.bytesInUse,
      percentUsed: combinedQuota.local.percentUsed,
      isNearLimit: combinedQuota.local.isNearLimit,
      largestItems: detailedQuota.itemSizes.slice(0, 10),
    },
    total: combinedQuota.total,
  };
}

/**
 * Example 9: Safe Delete with Retry
 */
export async function safeDeleteContent(contentId: string): Promise<boolean> {
  try {
    await storageManager.local.remove(`content_${contentId}`, {
      retry: true,
      retryConfig: {
        maxAttempts: 3,
        initialDelay: 100,
        maxDelay: 1000,
        backoffMultiplier: 2,
      },
    });

    logger.info('StorageIntegration', 'Content deleted', { contentId });
    return true;
  } catch (error) {
    logger.error('StorageIntegration', 'Failed to delete content', error);
    return false;
  }
}

/**
 * Example 10: Storage Change Listener
 */
export function setupStorageChangeListener(): void {
  storageManager.sync.onChanged((changes) => {
    for (const [key, change] of Object.entries(changes)) {
      logger.debug('StorageIntegration', 'Sync storage changed', {
        key,
        oldValue: change.oldValue,
        newValue: change.newValue,
      });

      // Handle specific changes
      if (key === 'userPreferences') {
        // Reload preferences
        logger.info('StorageIntegration', 'User preferences updated');
      }
    }
  });

  storageManager.local.onChanged((changes) => {
    for (const [key, change] of Object.entries(changes)) {
      if (key.startsWith('content_')) {
        logger.debug('StorageIntegration', 'Content changed', { key });
      }
    }
  });
}
