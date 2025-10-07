/**
 * Quota Manager Tests
 * Tests for storage quota management functionality
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QuotaManager, QuotaEventType } from '../src/background/quota-manager';

// Mock chrome APIs
const mockChrome = {
  storage: {
    local: {
      get: vi.fn(),
      set: vi.fn(),
      remove: vi.fn(),
      clear: vi.fn(),
      getBytesInUse: vi.fn(),
      QUOTA_BYTES: 10485760, // 10MB
    },
    sync: {
      get: vi.fn(),
      set: vi.fn(),
      remove: vi.fn(),
      clear: vi.fn(),
      getBytesInUse: vi.fn(),
      QUOTA_BYTES: 102400, // 100KB
      MAX_ITEMS: 512,
      QUOTA_BYTES_PER_ITEM: 8192,
    },
    onChanged: {
      addListener: vi.fn(),
    },
  },
  notifications: {
    create: vi.fn(),
  },
};

// Mock navigator.storage
const mockNavigatorStorage = {
  estimate: vi.fn(),
  persist: vi.fn(),
  persisted: vi.fn(),
};

// Setup global mocks
beforeEach(() => {
  global.chrome = mockChrome as any;
  global.navigator = {
    ...global.navigator,
    storage: mockNavigatorStorage as any,
  };

  // Reset mocks
  vi.clearAllMocks();

  // Default mock implementations
  mockChrome.storage.local.getBytesInUse.mockResolvedValue(1000000); // 1MB
  mockChrome.storage.sync.getBytesInUse.mockResolvedValue(10000); // 10KB
  mockNavigatorStorage.estimate.mockResolvedValue({
    usage: 5000000, // 5MB
    quota: 50000000, // 50MB
  });
  mockNavigatorStorage.persisted.mockResolvedValue(false);
  mockNavigatorStorage.persist.mockResolvedValue(true);
});

describe('QuotaManager', () => {
  describe('initialization', () => {
    it('should initialize successfully', async () => {
      const quotaManager = new QuotaManager();
      await quotaManager.initialize();

      expect(mockNavigatorStorage.persisted).toHaveBeenCalled();
      expect(mockNavigatorStorage.persist).toHaveBeenCalled();
    });

    it('should request persistent storage', async () => {
      const quotaManager = new QuotaManager();
      const granted = await quotaManager.requestPersistentStorage();

      expect(granted).toBe(true);
      expect(mockNavigatorStorage.persist).toHaveBeenCalled();
    });

    it('should handle already persistent storage', async () => {
      mockNavigatorStorage.persisted.mockResolvedValue(true);

      const quotaManager = new QuotaManager();
      const granted = await quotaManager.requestPersistentStorage();

      expect(granted).toBe(true);
      expect(mockNavigatorStorage.persist).not.toHaveBeenCalled();
    });

    it('should handle persistent storage denial', async () => {
      mockNavigatorStorage.persist.mockResolvedValue(false);

      const quotaManager = new QuotaManager();
      const granted = await quotaManager.requestPersistentStorage();

      expect(granted).toBe(false);
    });
  });

  describe('usage monitoring', () => {
    it('should get total storage usage', async () => {
      const quotaManager = new QuotaManager();
      const usage = await quotaManager.getTotalUsage();

      expect(usage).toHaveProperty('chromeStorage');
      expect(usage).toHaveProperty('indexedDB');
      expect(usage).toHaveProperty('total');
      expect(usage).toHaveProperty('persistent');
      expect(usage.total.percentUsed).toBeGreaterThanOrEqual(0);
      expect(usage.total.percentUsed).toBeLessThanOrEqual(100);
    });

    it('should calculate correct percentages', async () => {
      mockNavigatorStorage.estimate.mockResolvedValue({
        usage: 40000000, // 40MB
        quota: 50000000, // 50MB
      });

      const quotaManager = new QuotaManager();
      const usage = await quotaManager.getTotalUsage();

      expect(usage.total.percentUsed).toBeCloseTo(80, 0);
    });

    it('should monitor usage periodically', async () => {
      const quotaManager = new QuotaManager();
      await quotaManager.initialize();

      quotaManager.startMonitoring(100); // 100ms for testing
      
      // Wait for at least one monitoring cycle
      await new Promise(resolve => setTimeout(resolve, 150));

      quotaManager.stopMonitoring();

      expect(mockNavigatorStorage.estimate).toHaveBeenCalled();
    });
  });

  describe('cleanup policy', () => {
    it('should use default cleanup policy', () => {
      const quotaManager = new QuotaManager();
      const policy = quotaManager.getPolicy();

      expect(policy.enabled).toBe(true);
      expect(policy.warningThreshold).toBe(80);
      expect(policy.criticalThreshold).toBe(95);
      expect(policy.maxConversationAge).toBe(90);
      expect(policy.keepRecentConversations).toBe(10);
    });

    it('should accept custom cleanup policy', () => {
      const customPolicy = {
        warningThreshold: 70,
        criticalThreshold: 90,
        maxConversationAge: 60,
      };

      const quotaManager = new QuotaManager(customPolicy);
      const policy = quotaManager.getPolicy();

      expect(policy.warningThreshold).toBe(70);
      expect(policy.criticalThreshold).toBe(90);
      expect(policy.maxConversationAge).toBe(60);
      expect(policy.enabled).toBe(true); // Default value
    });

    it('should update cleanup policy', () => {
      const quotaManager = new QuotaManager();
      
      quotaManager.updatePolicy({
        warningThreshold: 75,
        autoCleanupOnWarning: true,
      });

      const policy = quotaManager.getPolicy();
      expect(policy.warningThreshold).toBe(75);
      expect(policy.autoCleanupOnWarning).toBe(true);
    });
  });

  describe('quota events', () => {
    it('should emit warning event when threshold exceeded', async () => {
      mockNavigatorStorage.estimate.mockResolvedValue({
        usage: 42000000, // 84%
        quota: 50000000,
      });

      const eventPromise = new Promise((resolve) => {
        globalThis.addEventListener('quota-event', (event: Event) => {
          const customEvent = event as CustomEvent;
          if (customEvent.detail.type === QuotaEventType.WARNING) {
            resolve(customEvent.detail);
          }
        });
      });

      const quotaManager = new QuotaManager({
        autoCleanupOnWarning: false,
      });
      await quotaManager.initialize();
      await quotaManager.monitorUsage();

      const event = await eventPromise;
      expect(event).toBeDefined();
    });

    it('should emit critical event when threshold exceeded', async () => {
      mockNavigatorStorage.estimate.mockResolvedValue({
        usage: 48000000, // 96%
        quota: 50000000,
      });

      const eventPromise = new Promise((resolve) => {
        globalThis.addEventListener('quota-event', (event: Event) => {
          const customEvent = event as CustomEvent;
          if (customEvent.detail.type === QuotaEventType.CRITICAL) {
            resolve(customEvent.detail);
          }
        });
      });

      const quotaManager = new QuotaManager({
        autoCleanupOnCritical: false,
      });
      await quotaManager.initialize();
      await quotaManager.monitorUsage();

      const event = await eventPromise;
      expect(event).toBeDefined();
    });

    it('should emit persistent storage events', async () => {
      const events: string[] = [];

      globalThis.addEventListener('quota-event', (event: Event) => {
        const customEvent = event as CustomEvent;
        events.push(customEvent.detail.type);
      });

      const quotaManager = new QuotaManager();
      await quotaManager.requestPersistentStorage();

      expect(events).toContain(QuotaEventType.PERSISTENT_GRANTED);
    });
  });

  describe('cleanup operations', () => {
    it('should perform cleanup and return results', async () => {
      const quotaManager = new QuotaManager();
      await quotaManager.initialize();

      const result = await quotaManager.performCleanup('warning');

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('bytesFreed');
      expect(result).toHaveProperty('itemsRemoved');
      expect(result).toHaveProperty('duration');
      expect(result.bytesFreed).toBeGreaterThanOrEqual(0);
    });

    it('should force cleanup regardless of thresholds', async () => {
      mockNavigatorStorage.estimate.mockResolvedValue({
        usage: 10000000, // 20% - below thresholds
        quota: 50000000,
      });

      const quotaManager = new QuotaManager();
      await quotaManager.initialize();

      const result = await quotaManager.forceCleanup();

      expect(result).toBeDefined();
      expect(result.success).toBeDefined();
    });

    it('should emit cleanup events', async () => {
      const events: string[] = [];

      globalThis.addEventListener('quota-event', (event: Event) => {
        const customEvent = event as CustomEvent;
        events.push(customEvent.detail.type);
      });

      const quotaManager = new QuotaManager();
      await quotaManager.initialize();
      await quotaManager.performCleanup('warning');

      expect(events).toContain(QuotaEventType.CLEANUP_STARTED);
      expect(events).toContain(QuotaEventType.CLEANUP_COMPLETED);
    });
  });

  describe('usage breakdown', () => {
    it('should get usage breakdown by store', async () => {
      const quotaManager = new QuotaManager();
      await quotaManager.initialize();

      const breakdown = await quotaManager.getUsageBreakdown();

      expect(breakdown).toHaveProperty('pockets');
      expect(breakdown).toHaveProperty('content');
      expect(breakdown).toHaveProperty('conversations');
      expect(breakdown).toHaveProperty('embeddings');
      expect(typeof breakdown.pockets).toBe('number');
      expect(typeof breakdown.content).toBe('number');
    });
  });

  describe('monitoring lifecycle', () => {
    it('should start and stop monitoring', async () => {
      const quotaManager = new QuotaManager();
      await quotaManager.initialize();

      quotaManager.startMonitoring(100);
      expect(quotaManager['monitoringInterval']).not.toBeNull();

      quotaManager.stopMonitoring();
      expect(quotaManager['monitoringInterval']).toBeNull();
    });

    it('should not start monitoring twice', async () => {
      const quotaManager = new QuotaManager();
      await quotaManager.initialize();

      quotaManager.startMonitoring(100);
      const firstInterval = quotaManager['monitoringInterval'];

      quotaManager.startMonitoring(100);
      const secondInterval = quotaManager['monitoringInterval'];

      expect(firstInterval).toBe(secondInterval);

      quotaManager.stopMonitoring();
    });
  });

  describe('error handling', () => {
    it('should handle storage API errors gracefully', async () => {
      mockNavigatorStorage.estimate.mockRejectedValue(new Error('Storage API error'));

      const quotaManager = new QuotaManager();

      await expect(quotaManager.getTotalUsage()).rejects.toThrow();
    });

    it('should handle persistent storage API unavailable', async () => {
      global.navigator = {
        ...global.navigator,
        storage: undefined as any,
      };

      const quotaManager = new QuotaManager();
      const granted = await quotaManager.requestPersistentStorage();

      expect(granted).toBe(false);
    });

    it('should continue cleanup even if some operations fail', async () => {
      const quotaManager = new QuotaManager();
      await quotaManager.initialize();

      const result = await quotaManager.performCleanup('critical');

      // Should complete even if some cleanup operations fail
      expect(result).toBeDefined();
      expect(result.duration).toBeGreaterThan(0);
    });
  });
});
