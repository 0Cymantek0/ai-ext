/**
 * Tests for Chrome Storage Wrapper
 * Requirements: 5.2, 5.8, 13.1
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

// Mock chrome.storage API BEFORE importing the module
// Create separate mock functions for sync and local storage
const mockSyncStorage = {
  get: vi.fn(),
  set: vi.fn(),
  remove: vi.fn(),
  clear: vi.fn(),
  getBytesInUse: vi.fn(),
  QUOTA_BYTES: 102400, // 100KB for sync
  MAX_ITEMS: 512,
  QUOTA_BYTES_PER_ITEM: 8192,
};

const mockLocalStorage = {
  get: vi.fn(),
  set: vi.fn(),
  remove: vi.fn(),
  clear: vi.fn(),
  getBytesInUse: vi.fn(),
  QUOTA_BYTES: 10485760, // 10MB for local
  MAX_ITEMS: 512,
  QUOTA_BYTES_PER_ITEM: 8192,
};

global.chrome = {
  storage: {
    sync: mockSyncStorage as any,
    local: mockLocalStorage as any,
    onChanged: {
      addListener: vi.fn(),
    } as any,
  },
} as any;

// Mock logger
vi.mock("../src/background/monitoring.js", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Import after mocking
import {
  ChromeSyncStorage,
  ChromeLocalStorage,
  StorageManager,
  StorageError,
  StorageErrorType,
} from "../src/background/storage-wrapper";

describe("ChromeSyncStorage", () => {
  let syncStorage: ChromeSyncStorage;

  beforeEach(() => {
    syncStorage = new ChromeSyncStorage();
    vi.clearAllMocks();
  });

  describe("get", () => {
    it("should get items from sync storage", async () => {
      const mockData = { key1: "value1", key2: "value2" };
      mockSyncStorage.get.mockResolvedValue(mockData);

      const result = await syncStorage.get(["key1", "key2"]);

      expect(result).toEqual(mockData);
      expect(mockSyncStorage.get).toHaveBeenCalledWith(["key1", "key2"]);
    });

    it("should get all items when no keys specified", async () => {
      const mockData = { key1: "value1", key2: "value2" };
      mockSyncStorage.get.mockResolvedValue(mockData);

      const result = await syncStorage.get();

      expect(result).toEqual(mockData);
      expect(mockSyncStorage.get).toHaveBeenCalledWith(undefined);
    });

    it("should retry on transient errors", async () => {
      mockSyncStorage.get
        .mockRejectedValueOnce(new Error("Network error"))
        .mockResolvedValueOnce({ key1: "value1" });

      const result = await syncStorage.get("key1");

      expect(result).toEqual({ key1: "value1" });
      expect(mockSyncStorage.get).toHaveBeenCalledTimes(2);
    });

    it("should not retry when retry option is false", async () => {
      mockSyncStorage.get.mockRejectedValue(new Error("Network error"));

      await expect(syncStorage.get("key1", { retry: false })).rejects.toThrow();
      expect(mockSyncStorage.get).toHaveBeenCalledTimes(1);
    });
  });

  describe("set", () => {
    it("should set items in sync storage", async () => {
      mockSyncStorage.getBytesInUse.mockResolvedValue(1000);
      mockSyncStorage.set.mockResolvedValue(undefined);

      await syncStorage.set({ key1: "value1" });

      expect(mockSyncStorage.set).toHaveBeenCalledWith({ key1: "value1" });
    });

    it("should check quota before setting", async () => {
      mockSyncStorage.getBytesInUse
        .mockResolvedValueOnce(50000) // First call for quota check
        .mockResolvedValueOnce(51000); // Second call after setting
      mockSyncStorage.set.mockResolvedValue(undefined);

      await syncStorage.set({ key1: "value1" });

      expect(mockSyncStorage.getBytesInUse).toHaveBeenCalled();
      expect(mockSyncStorage.set).toHaveBeenCalled();
    });

    it("should throw error when quota exceeded", async () => {
      mockSyncStorage.getBytesInUse.mockResolvedValue(102300); // Over 95% limit

      await expect(syncStorage.set({ key1: "value1" })).rejects.toThrow(
        StorageError
      );
    });

    it("should retry on transient errors", async () => {
      mockSyncStorage.getBytesInUse.mockResolvedValue(1000);
      mockSyncStorage.set
        .mockRejectedValueOnce(new Error("Network error"))
        .mockResolvedValueOnce(undefined);

      await syncStorage.set({ key1: "value1" });

      expect(mockSyncStorage.set).toHaveBeenCalledTimes(2);
    });
  });

  describe("remove", () => {
    it("should remove items from sync storage", async () => {
      mockSyncStorage.remove.mockResolvedValue(undefined);

      await syncStorage.remove("key1");

      expect(mockSyncStorage.remove).toHaveBeenCalledWith("key1");
    });

    it("should remove multiple items", async () => {
      mockSyncStorage.remove.mockResolvedValue(undefined);

      await syncStorage.remove(["key1", "key2"]);

      expect(mockSyncStorage.remove).toHaveBeenCalledWith(["key1", "key2"]);
    });
  });

  describe("clear", () => {
    it("should clear all items from sync storage", async () => {
      mockSyncStorage.clear.mockResolvedValue(undefined);

      await syncStorage.clear();

      expect(mockSyncStorage.clear).toHaveBeenCalled();
    });
  });

  describe("getQuota", () => {
    it("should return quota information", async () => {
      mockSyncStorage.getBytesInUse.mockResolvedValue(50000);

      const quota = await syncStorage.getQuota();

      expect(quota.bytesInUse).toBe(50000);
      expect(quota.bytesAvailable).toBe(52400);
      expect(quota.percentUsed).toBeCloseTo(48.8, 1);
      expect(quota.isNearLimit).toBe(false);
      expect(quota.isAtLimit).toBe(false);
    });

    it("should detect near limit condition", async () => {
      mockSyncStorage.getBytesInUse.mockResolvedValue(85000); // 83%

      const quota = await syncStorage.getQuota();

      expect(quota.isNearLimit).toBe(true);
      expect(quota.isAtLimit).toBe(false);
    });

    it("should detect at limit condition", async () => {
      mockSyncStorage.getBytesInUse.mockResolvedValue(98000); // 95.7%

      const quota = await syncStorage.getQuota();

      expect(quota.isNearLimit).toBe(true);
      expect(quota.isAtLimit).toBe(true);
    });
  });

  describe("setWithValidation", () => {
    it("should validate item size before setting", async () => {
      const largeValue = "x".repeat(10000); // Exceeds 8KB limit
      mockSyncStorage.getBytesInUse.mockResolvedValue(1000);

      await expect(
        syncStorage.setWithValidation({ key1: largeValue })
      ).rejects.toThrow(StorageError);
    });

    it("should validate total items count", async () => {
      const existingItems: Record<string, string> = {};
      for (let i = 0; i < 512; i++) {
        existingItems[`key${i}`] = "value";
      }

      mockSyncStorage.get.mockResolvedValue(existingItems);
      mockSyncStorage.getBytesInUse.mockResolvedValue(1000);

      await expect(
        syncStorage.setWithValidation({ newKey: "value" })
      ).rejects.toThrow(StorageError);
    });

    it("should set items when validation passes", async () => {
      mockSyncStorage.get.mockResolvedValue({ key1: "value1" });
      mockSyncStorage.getBytesInUse.mockResolvedValue(1000);
      mockSyncStorage.set.mockResolvedValue(undefined);

      await syncStorage.setWithValidation({ key2: "value2" });

      expect(mockSyncStorage.set).toHaveBeenCalledWith({ key2: "value2" });
    });
  });

  describe("hasSpace", () => {
    it("should return true when enough space available", async () => {
      mockSyncStorage.getBytesInUse.mockResolvedValue(50000);

      const hasSpace = await syncStorage.hasSpace(10000);

      expect(hasSpace).toBe(true);
    });

    it("should return false when not enough space", async () => {
      mockSyncStorage.getBytesInUse.mockResolvedValue(100000);

      const hasSpace = await syncStorage.hasSpace(10000);

      expect(hasSpace).toBe(false);
    });
  });

  describe("estimateSize", () => {
    it("should estimate size of data", () => {
      const data = { key: "value", number: 123 };
      const size = syncStorage.estimateSize(data);

      expect(size).toBeGreaterThan(0);
    });

    it("should handle complex objects", () => {
      const data = {
        nested: { deep: { value: "test" } },
        array: [1, 2, 3],
      };
      const size = syncStorage.estimateSize(data);

      expect(size).toBeGreaterThan(0);
    });
  });
});

describe("ChromeLocalStorage", () => {
  let localStorage: ChromeLocalStorage;

  beforeEach(() => {
    localStorage = new ChromeLocalStorage();
    vi.clearAllMocks();
  });

  describe("getDetailedQuota", () => {
    it("should return detailed quota with item sizes", async () => {
      const mockData = {
        key1: "small",
        key2: "x".repeat(1000),
        key3: "medium",
      };

      mockLocalStorage.getBytesInUse.mockResolvedValue(5000000);
      mockLocalStorage.get.mockResolvedValue(mockData);

      const quota = await localStorage.getDetailedQuota();

      expect(quota.bytesInUse).toBe(5000000);
      expect(quota.itemSizes).toHaveLength(3);
      expect(quota.itemSizes[0].key).toBe("key2"); // Largest first
    });
  });

  describe("cleanup", () => {
    it("should remove specific keys", async () => {
      mockLocalStorage.getBytesInUse
        .mockResolvedValueOnce(5000000)
        .mockResolvedValueOnce(4000000);
      mockLocalStorage.remove.mockResolvedValue(undefined);

      const result = await localStorage.cleanup({
        removeKeys: ["key1", "key2"],
      });

      expect(mockLocalStorage.remove).toHaveBeenCalledWith(["key1", "key2"]);
      expect(result.itemsRemoved).toBe(2);
      expect(result.bytesFreed).toBe(1000000);
    });

    it("should keep most recent items", async () => {
      const mockData = {
        key1: { timestamp: 1000, data: "old" },
        key2: { timestamp: 3000, data: "newest" },
        key3: { timestamp: 2000, data: "middle" },
      };

      mockLocalStorage.getBytesInUse
        .mockResolvedValueOnce(5000000)
        .mockResolvedValueOnce(3000000);
      mockLocalStorage.get.mockResolvedValue(mockData);
      mockLocalStorage.remove.mockResolvedValue(undefined);

      const result = await localStorage.cleanup({ keepMostRecent: 2 });

      expect(mockLocalStorage.remove).toHaveBeenCalledWith(["key1"]);
      expect(result.itemsRemoved).toBe(1);
    });
  });
});

describe("StorageManager", () => {
  let storageManager: StorageManager;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock implementations
    mockSyncStorage.getBytesInUse.mockReset();
    mockLocalStorage.getBytesInUse.mockReset();
    storageManager = new StorageManager();
  });

  describe("getCombinedQuota", () => {
    it("should return combined quota information", async () => {
      mockSyncStorage.getBytesInUse.mockResolvedValue(50000);
      mockLocalStorage.getBytesInUse.mockResolvedValue(5000000);

      const quota = await storageManager.getCombinedQuota();

      expect(quota.sync.bytesInUse).toBe(50000);
      expect(quota.local.bytesInUse).toBe(5000000);
      expect(quota.total.bytesInUse).toBe(5050000);
      expect(quota.total.hasWarnings).toBe(false);
    });

    it("should detect warnings in combined quota", async () => {
      mockSyncStorage.getBytesInUse.mockResolvedValue(90000); // Near limit
      mockLocalStorage.getBytesInUse.mockResolvedValue(5000000);

      const quota = await storageManager.getCombinedQuota();

      expect(quota.total.hasWarnings).toBe(true);
    });
  });

  describe("monitorQuota", () => {
    it("should monitor quota and emit warnings", async () => {
      vi.clearAllMocks();
      mockSyncStorage.getBytesInUse.mockResolvedValue(90000); // Near limit
      mockLocalStorage.getBytesInUse.mockResolvedValue(5000000);

      const eventListener = vi.fn();
      
      // Mock addEventListener if not available in test environment
      const originalAddEventListener = globalThis.addEventListener;
      const originalDispatchEvent = globalThis.dispatchEvent;
      
      globalThis.addEventListener = vi.fn((event, handler) => {
        if (event === "storage-quota-event") {
          eventListener.mockImplementation(handler as any);
        }
      }) as any;
      
      globalThis.dispatchEvent = vi.fn((event) => {
        if (event.type === "storage-quota-event") {
          eventListener(event);
        }
        return true;
      }) as any;

      await storageManager.monitorQuota();

      expect(eventListener).toHaveBeenCalled();
      
      // Restore
      globalThis.addEventListener = originalAddEventListener;
      globalThis.dispatchEvent = originalDispatchEvent;
    });

    it("should emit critical events when at limit", async () => {
      vi.clearAllMocks();
      mockSyncStorage.getBytesInUse.mockResolvedValue(98000); // At limit
      mockLocalStorage.getBytesInUse.mockResolvedValue(5000000);

      const eventListener = vi.fn();
      
      // Mock addEventListener if not available in test environment
      const originalAddEventListener = globalThis.addEventListener;
      const originalDispatchEvent = globalThis.dispatchEvent;
      
      globalThis.addEventListener = vi.fn((event, handler) => {
        if (event === "storage-quota-event") {
          eventListener.mockImplementation(handler as any);
        }
      }) as any;
      
      globalThis.dispatchEvent = vi.fn((event) => {
        if (event.type === "storage-quota-event") {
          eventListener(event);
          return true;
        }
        return false;
      }) as any;

      await storageManager.monitorQuota();

      expect(eventListener).toHaveBeenCalled();
      const event = eventListener.mock.calls[0][0] as CustomEvent;
      expect(event.detail.level).toBe("critical");
      
      // Restore
      globalThis.addEventListener = originalAddEventListener;
      globalThis.dispatchEvent = originalDispatchEvent;
    });
  });

  describe("startQuotaMonitoring", () => {
    it("should start periodic quota monitoring", () => {
      vi.useFakeTimers();

      const timerId = storageManager.startQuotaMonitoring(1000);

      expect(timerId).toBeDefined();

      vi.advanceTimersByTime(1000);

      storageManager.stopQuotaMonitoring(timerId);
      vi.useRealTimers();
    });
  });
});

describe("Error Handling", () => {
  let syncStorage: ChromeSyncStorage;

  beforeEach(() => {
    syncStorage = new ChromeSyncStorage();
    vi.clearAllMocks();
  });

  it("should handle quota exceeded errors", async () => {
    mockSyncStorage.getBytesInUse.mockResolvedValue(102300);

    await expect(syncStorage.set({ key: "value" })).rejects.toThrow(
      StorageError
    );
  });

  it("should handle access denied errors", async () => {
    mockSyncStorage.get.mockRejectedValue(new Error("access denied"));

    await expect(syncStorage.get("key")).rejects.toThrow(StorageError);
  });

  it("should handle network errors with retry", async () => {
    mockSyncStorage.get
      .mockRejectedValueOnce(new Error("network error"))
      .mockRejectedValueOnce(new Error("network error"))
      .mockResolvedValueOnce({ key: "value" });

    const result = await syncStorage.get("key");

    expect(result).toEqual({ key: "value" });
    expect(mockSyncStorage.get).toHaveBeenCalledTimes(3);
  });

  it("should not retry quota exceeded errors", async () => {
    mockSyncStorage.getBytesInUse.mockResolvedValue(102300);

    await expect(syncStorage.set({ key: "value" })).rejects.toThrow(
      StorageError
    );
    expect(mockSyncStorage.set).not.toHaveBeenCalled();
  });

  it("should throw after max retry attempts", async () => {
    mockSyncStorage.get.mockRejectedValue(new Error("network error"));

    await expect(syncStorage.get("key")).rejects.toThrow();
    expect(mockSyncStorage.get).toHaveBeenCalledTimes(3); // Default max attempts
  });
});

describe("Retry Logic", () => {
  let syncStorage: ChromeSyncStorage;

  beforeEach(() => {
    syncStorage = new ChromeSyncStorage();
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should use exponential backoff", async () => {
    mockSyncStorage.get
      .mockRejectedValueOnce(new Error("error"))
      .mockRejectedValueOnce(new Error("error"))
      .mockResolvedValueOnce({ key: "value" });

    const promise = syncStorage.get("key");

    // First retry after 100ms
    await vi.advanceTimersByTimeAsync(100);

    // Second retry after 200ms (100 * 2)
    await vi.advanceTimersByTimeAsync(200);

    const result = await promise;
    expect(result).toEqual({ key: "value" });
  });

  it("should respect custom retry config", async () => {
    mockSyncStorage.get
      .mockRejectedValueOnce(new Error("error"))
      .mockResolvedValueOnce({ key: "value" });

    const promise = syncStorage.get("key", {
      retryConfig: {
        maxAttempts: 2,
        initialDelay: 50,
        maxDelay: 1000,
        backoffMultiplier: 3,
      },
    });

    await vi.advanceTimersByTimeAsync(50);

    const result = await promise;
    expect(result).toEqual({ key: "value" });
  });

  it("should cap delay at maxDelay", async () => {
    mockSyncStorage.get
      .mockRejectedValueOnce(new Error("error"))
      .mockRejectedValueOnce(new Error("error"))
      .mockResolvedValueOnce({ key: "value" });

    const promise = syncStorage.get("key", {
      retryConfig: {
        maxAttempts: 3,
        initialDelay: 1000,
        maxDelay: 1500,
        backoffMultiplier: 3,
      },
    });

    // First retry after 1000ms
    await vi.advanceTimersByTimeAsync(1000);

    // Second retry should be capped at 1500ms (not 3000ms)
    await vi.advanceTimersByTimeAsync(1500);

    const result = await promise;
    expect(result).toEqual({ key: "value" });
  });
});
