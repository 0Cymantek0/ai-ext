import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { performance } from "node:perf_hooks";

vi.mock("../src/background/monitoring.js", () => {
  const LogLevel = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 } as const;
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
  const performanceMonitor = {
    mark: vi.fn(),
    measure: vi.fn(),
    trackOperation: vi.fn(async (_name: string, operation: () => Promise<any>) =>
      await operation(),
    ),
    recordMetric: vi.fn(),
    recordMemorySnapshot: vi.fn(),
    getSummary: vi.fn(() => ({ metrics: [], snapshots: [] })),
    exportMetrics: vi.fn(() => "{}"),
    clearMetrics: vi.fn(),
  };

  return { logger, performanceMonitor, LogLevel };
});

vi.mock("../src/background/embedding-engine.js", () => {
  const VECTOR_DIMENSION = 512;
  const createVector = (text: string): number[] => {
    const vector = new Array(VECTOR_DIMENSION).fill(0);

    for (let index = 0; index < text.length; index += 1) {
      const charCode = text.charCodeAt(index);
      const bucket = Math.abs(charCode) % VECTOR_DIMENSION;
      vector[bucket] += 1;
    }

    const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));

    if (magnitude === 0) {
      return vector;
    }

    return vector.map((value) => value / magnitude);
  };

  return {
    embeddingEngine: {
      generateEmbedding: vi.fn(async (text: string) => createVector(text)),
      generateEmbeddingsBatch: vi.fn(async (texts: string[]) =>
        texts.map((item) => createVector(item)),
      ),
      clearCache: vi.fn(),
      destroy: vi.fn(),
    },
  };
});

type ContentProcessorModule = typeof import("../src/background/content-processor.js");
type VectorIndexingQueueModule = typeof import("../src/background/vector-indexing-queue.js");
type VectorSearchServiceModule = typeof import("../src/background/vector-search-service.js");
type VectorStoreModule = typeof import("../src/background/vector-store-service.js");
type IndexedDBModule = typeof import("../src/background/indexeddb-manager.js");
type FsAccessModule = typeof import("../src/background/storage/fs-access-manager.js");

const localStorageData = new Map<string, unknown>();
const syncStorageData = new Map<string, unknown>();

function createStorageArea(
  map: Map<string, unknown>,
  extras: Record<string, number> = {},
) {
  return {
    ...extras,
    get: vi.fn(async (keys?: string | string[] | Record<string, unknown> | null) => {
      if (keys === undefined || keys === null) {
        return Object.fromEntries(map.entries());
      }

      if (typeof keys === "string") {
        return { [keys]: map.get(keys) };
      }

      if (Array.isArray(keys)) {
        const result: Record<string, unknown> = {};
        for (const key of keys) {
          result[key] = map.get(key);
        }
        return result;
      }

      const result: Record<string, unknown> = { ...keys };
      for (const key of Object.keys(keys)) {
        if (map.has(key)) {
          result[key] = map.get(key);
        }
      }
      return result;
    }),
    set: vi.fn(async (items: Record<string, unknown>) => {
      for (const [key, value] of Object.entries(items)) {
        map.set(key, value);
      }
    }),
    remove: vi.fn(async (keys: string | string[]) => {
      if (Array.isArray(keys)) {
        for (const key of keys) {
          map.delete(key);
        }
      } else {
        map.delete(keys);
      }
    }),
    clear: vi.fn(async () => {
      map.clear();
    }),
    getBytesInUse: vi.fn(async () => 0),
  };
}

function setupChromeStub(): void {
  if ((globalThis as any).chrome) {
    return;
  }

  const localArea = createStorageArea(localStorageData, {
    QUOTA_BYTES: 10 * 1024 * 1024,
  });

  const syncArea = createStorageArea(syncStorageData, {
    QUOTA_BYTES: 102400,
    QUOTA_BYTES_PER_ITEM: 8192,
    MAX_ITEMS: 512,
  });

  (globalThis as any).chrome = {
    runtime: {
      sendMessage: vi.fn().mockResolvedValue(undefined),
      lastError: undefined,
    },
    storage: {
      local: localArea,
      sync: syncArea,
      onChanged: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
    },
    contextMenus: {
      create: vi.fn(),
      removeAll: vi.fn(),
      onClicked: {
        addListener: vi.fn(),
      },
    },
    tabs: {
      sendMessage: vi.fn().mockResolvedValue(undefined),
    },
    sidePanel: {
      open: vi.fn().mockResolvedValue(undefined),
    },
    alarms: {
      create: vi.fn(),
      clear: vi.fn(),
      onAlarm: {
        addListener: vi.fn(),
      },
    },
    action: {
      setBadgeText: vi.fn(),
      setBadgeBackgroundColor: vi.fn(),
    },
  } as any;
}

let contentProcessor: ContentProcessorModule["contentProcessor"];
let vectorIndexingQueue: VectorIndexingQueueModule["vectorIndexingQueue"];
let vectorSearchService: VectorSearchServiceModule["vectorSearchService"];
let vectorStoreService: VectorStoreModule["vectorStoreService"];
let indexedDBManager: IndexedDBModule["indexedDBManager"];
let ProcessingStatus: IndexedDBModule["ProcessingStatus"];
let fsAccessManager: FsAccessModule["fsAccessManager"];
let FS_ACCESS_STORAGE_KEY: FsAccessModule["FS_ACCESS_STORAGE_KEY"];

async function resetDatabase(): Promise<void> {
  if (!indexedDBManager) {
    return;
  }

  const dbName = "ai-pocket-db";
  const manager = indexedDBManager as unknown as {
    db: IDBDatabase | null;
    initPromise: Promise<IDBDatabase> | null;
  };

  if (manager.db) {
    manager.db.close();
  }

  manager.db = null;
  manager.initPromise = null;

  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(dbName);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
}

async function waitForQueueToDrain(timeoutMs: number = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const stats = vectorIndexingQueue.getStats();
    if (!stats.isProcessing && stats.queueLength === 0) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  throw new Error("Vector indexing queue did not drain within the expected window");
}

beforeAll(async () => {
  setupChromeStub();

  const cryptoModule = await import("node:crypto");
  if (!(globalThis as any).crypto) {
    (globalThis as any).crypto = cryptoModule.webcrypto;
  }
  if (typeof (globalThis as any).crypto.randomUUID !== "function") {
    (globalThis as any).crypto.randomUUID = cryptoModule.randomUUID;
  }

  const [{ contentProcessor: processor }, queueModule, searchModule, storeModule, indexedDbModule, fsModule] =
    await Promise.all([
      import("../src/background/content-processor.js") as Promise<ContentProcessorModule>,
      import("../src/background/vector-indexing-queue.js") as Promise<VectorIndexingQueueModule>,
      import("../src/background/vector-search-service.js") as Promise<VectorSearchServiceModule>,
      import("../src/background/vector-store-service.js") as Promise<VectorStoreModule>,
      import("../src/background/indexeddb-manager.js") as Promise<IndexedDBModule>,
      import("../src/background/storage/fs-access-manager.js") as Promise<FsAccessModule>,
    ]);

  contentProcessor = processor;
  vectorIndexingQueue = queueModule.vectorIndexingQueue;
  vectorSearchService = searchModule.vectorSearchService;
  vectorStoreService = storeModule.vectorStoreService;
  indexedDBManager = indexedDbModule.indexedDBManager;
  ProcessingStatus = indexedDbModule.ProcessingStatus;
  fsAccessManager = fsModule.fsAccessManager;
  FS_ACCESS_STORAGE_KEY = fsModule.FS_ACCESS_STORAGE_KEY;

  vectorIndexingQueue.setProcessingInterval(0);
  vectorIndexingQueue.setBatchSize(6);
});

beforeEach(async () => {
  vi.clearAllMocks();
  localStorageData.clear();
  syncStorageData.clear();
  vectorIndexingQueue.clear();
  await resetDatabase();
});

afterEach(async () => {
  try {
    await waitForQueueToDrain();
  } catch {
    // If the queue did not settle in time, force clear to prevent leakage between tests
  } finally {
    vectorIndexingQueue.clear();
  }

  await fsAccessManager.revokeAccess();
  delete (globalThis as any).showDirectoryPicker;
  localStorageData.clear();
  syncStorageData.clear();
});

const selectionContent = (
  text: string,
  formatted: string,
): { text: { content: string; formattedContent: string; wordCount: number; characterCount: number } } => ({
  text: {
    content: text,
    formattedContent: formatted,
    wordCount: text.trim().split(/\s+/).length,
    characterCount: text.length,
  },
});

describe("Phase 2 storage and search integration", () => {
  it("stores, indexes, searches, and loads without filesystem access", async () => {
    const pocketId = await indexedDBManager.createPocket({
      name: "AI Research",
      description: "Integration test pocket",
      tags: ["ai", "robotics"],
      color: "#A855F7",
      contentIds: [],
    });

    const articleText =
      "Robotics researchers are using AI breakthroughs to accelerate autonomous systems and improve safety analysis across multiple industries.";

    const metadata = {
      title: "AI Robotics Breakthroughs",
      timestamp: Date.now(),
      tags: ["ai", "robotics", "safety"],
      category: "Research",
      selectionContext: "phase2-integration",
    };

    const saveStart = performance.now();
    const processed = await contentProcessor.processContent({
      pocketId,
      mode: "selection",
      content: selectionContent(
        articleText,
        `<p>${articleText}</p>`,
      ),
      metadata,
      sourceUrl: "https://example.com/ai-robotics",
    });
    const saveDuration = performance.now() - saveStart;

    expect(processed.status).toBe(ProcessingStatus.COMPLETED);
    expect(processed.contentId).toBeDefined();

    const indexStart = performance.now();
    await waitForQueueToDrain();
    const indexDuration = performance.now() - indexStart;

    const storedChunks = await vectorStoreService.getChunksByPocket(pocketId);
    expect(storedChunks.length).toBeGreaterThan(0);
    expect(storedChunks[0]?.metadata.pocketId).toBe(pocketId);

    const searchStart = performance.now();
    const searchResults = await vectorSearchService.searchContent(
      "autonomous robotics safety breakthroughs",
      pocketId,
      5,
    );
    const searchDuration = performance.now() - searchStart;

    expect(searchResults.length).toBeGreaterThan(0);
    expect(searchResults[0]?.item.id).toBe(processed.contentId);
    expect(searchResults[0]?.relevanceScore).toBeGreaterThan(0);

    const chunkResults = await vectorSearchService.searchChunks(
      "autonomous robotics safety",
      {
        pocketId,
        topK: 3,
        minRelevance: 0.1,
      },
    );

    expect(
      chunkResults.some((result) => result.chunk.metadata.contentId === processed.contentId),
    ).toBe(true);

    const loadStart = performance.now();
    const loadedContent = await indexedDBManager.getContent(processed.contentId);
    const loadDuration = performance.now() - loadStart;

    expect(loadedContent?.pocketId).toBe(pocketId);
    expect(loadedContent?.metadata.title).toBe("AI Robotics Breakthroughs");

    const parsedContent = loadedContent?.content
      ? JSON.parse(loadedContent.content)
      : null;
    expect(parsedContent?.text).toContain("Robotics researchers");

    const embeddings = await indexedDBManager.getAllEmbeddings();
    expect(
      embeddings.some((embedding) => embedding.contentId === processed.contentId),
    ).toBe(true);

    expect(saveDuration).toBeLessThan(3000);
    expect(indexDuration).toBeLessThan(3000);
    expect(searchDuration).toBeLessThan(1000);
    expect(loadDuration).toBeLessThan(2000);

    console.info("Phase2 integration timings (filesystem disabled)", {
      saveDuration,
      indexDuration,
      searchDuration,
      loadDuration,
    });
  });

  it("preserves end-to-end behaviour when filesystem access is granted", async () => {
    const directoryHandle = {
      queryPermission: vi.fn().mockResolvedValue("granted"),
      requestPermission: vi.fn().mockResolvedValue("granted"),
    };

    (globalThis as any).showDirectoryPicker = vi
      .fn()
      .mockResolvedValue(directoryHandle);

    const accessResult = await fsAccessManager.requestDirectoryAccess();
    expect(accessResult.granted).toBe(true);

    const storedFlag = await chrome.storage.local.get(FS_ACCESS_STORAGE_KEY);
    expect(storedFlag[FS_ACCESS_STORAGE_KEY]?.granted).toBe(true);

    const pocketId = await indexedDBManager.createPocket({
      name: "Filesystem Enabled",
      description: "Integration test with FS access",
      tags: ["ai", "filesystem"],
      color: "#0EA5E9",
      contentIds: [],
    });

    const noteText =
      "Filesystem-backed notes preserve AI experiments, artifacts, and reproducibility data for offline workflows.";

    const metadata = {
      title: "Filesystem Integration Note",
      timestamp: Date.now(),
      tags: ["filesystem", "integration"],
      category: "Notes",
    };

    const saveStart = performance.now();
    const processed = await contentProcessor.processContent({
      pocketId,
      mode: "selection",
      content: selectionContent(noteText, `<p>${noteText}</p>`),
      metadata,
      sourceUrl: "https://example.com/filesystem-integration",
    });
    const saveDuration = performance.now() - saveStart;

    expect(processed.contentId).toBeDefined();

    const indexStart = performance.now();
    await waitForQueueToDrain();
    const indexDuration = performance.now() - indexStart;

    const storedChunks = await vectorStoreService.getChunksByContent(
      processed.contentId,
    );
    expect(storedChunks.length).toBeGreaterThan(0);

    const searchStart = performance.now();
    const searchResults = await vectorSearchService.searchContent(
      "offline archives for AI experiments",
      pocketId,
      5,
    );
    const searchDuration = performance.now() - searchStart;

    expect(searchResults.length).toBeGreaterThan(0);
    expect(searchResults[0]?.item.id).toBe(processed.contentId);

    const loadStart = performance.now();
    const loadedContent = await indexedDBManager.getContent(processed.contentId);
    const loadDuration = performance.now() - loadStart;

    expect(loadedContent?.metadata.title).toBe(metadata.title);

    const fsAvailability = await fsAccessManager.hasValidAccess();
    expect(fsAvailability.available).toBe(true);

    expect(saveDuration).toBeLessThan(3000);
    expect(indexDuration).toBeLessThan(3000);
    expect(searchDuration).toBeLessThan(1000);
    expect(loadDuration).toBeLessThan(2000);

    console.info("Phase2 integration timings (filesystem enabled)", {
      saveDuration,
      indexDuration,
      searchDuration,
      loadDuration,
    });
  });
});
