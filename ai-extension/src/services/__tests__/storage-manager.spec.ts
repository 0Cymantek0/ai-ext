/**
 * Storage Manager Tests
 * 
 * Comprehensive unit tests for the storage manager service with dependency mocking
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  beforeAll,
  afterAll,
  afterEach,
  vi,
} from "vitest";
import {
  StorageManagerImpl,
  createStorageManager,
  StorageManagerError,
  StorageManagerErrorType,
  type DatabaseManager,
  type SaveContentOptions,
  type UpdateContentOptions,
  type ExportPocketOptions,
} from "../storage-manager.js";
import type { TieredStorage } from "../../storage/tiered-storage.js";
import type { CompressionService } from "../compression.js";
import type {
  CapturedContent,
  Pocket,
  StoredChunk,
  Embedding,
} from "../../background/indexeddb-manager.js";

const originalNavigator = globalThis.navigator;
const originalChrome = (globalThis as any).chrome;

type ChromeStorageStub = {
  storage: {
    local: {
      set: ReturnType<typeof vi.fn>;
      get: ReturnType<typeof vi.fn>;
      remove: ReturnType<typeof vi.fn>;
      getBytesInUse: ReturnType<typeof vi.fn>;
    };
  };
};

function createChromeStub(): ChromeStorageStub {
  return {
    storage: {
      local: {
        set: vi.fn().mockResolvedValue(undefined),
        get: vi.fn().mockResolvedValue({}),
        remove: vi.fn().mockResolvedValue(undefined),
        getBytesInUse: vi.fn().mockResolvedValue(0),
      },
    },
  };
}

type NavigatorStorageStub = {
  storage: {
    estimate: ReturnType<typeof vi.fn>;
    persisted: ReturnType<typeof vi.fn>;
  };
};

function createNavigatorStub(): NavigatorStorageStub {
  return {
    storage: {
      estimate: vi.fn().mockResolvedValue({ usage: 0, quota: 0 }),
      persisted: vi.fn().mockResolvedValue(false),
    },
  };
}

beforeEach(() => {
  Object.defineProperty(globalThis, "chrome", {
    configurable: true,
    writable: true,
    value: createChromeStub(),
  });

  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    writable: true,
    value: createNavigatorStub(),
  });
});

afterAll(() => {
  if (originalChrome === undefined) {
    delete (globalThis as any).chrome;
  } else {
    Object.defineProperty(globalThis, "chrome", {
      configurable: true,
      writable: true,
      value: originalChrome,
    });
  }

  if (originalNavigator === undefined) {
    delete (globalThis as any).navigator;
  } else {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      writable: true,
      value: originalNavigator,
    });
  }
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("StorageManagerImpl", () => {
  let mockDatabase: DatabaseManager;
  let mockTieredStorage: TieredStorage;
  let mockCompression: CompressionService;
  let storageManager: StorageManagerImpl;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeAll(() => {
    // Suppress console errors from logger in tests
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterAll(() => {
    consoleErrorSpy.mockRestore();
  });

  const mockPocket: Pocket = {
    id: "pocket-1",
    name: "Test Pocket",
    description: "Test description",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    contentIds: [],
    tags: [],
    color: "#000000",
  };

  const mockContent: CapturedContent = {
    id: "content-1",
    pocketId: "pocket-1",
    type: "text" as const,
    content: "Test content",
    metadata: {
      timestamp: Date.now(),
      title: "Test",
    },
    capturedAt: Date.now(),
    sourceUrl: "https://example.com",
    processingStatus: "completed" as const,
  };

  beforeEach(() => {
    // Mock database
    mockDatabase = {
      saveContent: vi.fn().mockResolvedValue("content-1"),
      getContent: vi.fn().mockResolvedValue(mockContent),
      updateContent: vi.fn().mockResolvedValue(undefined),
      deleteContent: vi.fn().mockResolvedValue(undefined),
      getContentByPocket: vi.fn().mockResolvedValue([mockContent]),
      getPocket: vi.fn().mockResolvedValue(mockPocket),
      saveChunk: vi.fn().mockResolvedValue("chunk-1"),
      getChunksByContent: vi.fn().mockResolvedValue([]),
      deleteChunksByContent: vi.fn().mockResolvedValue(undefined),
      saveEmbedding: vi.fn().mockResolvedValue("embedding-1"),
      getEmbeddingByContentId: vi.fn().mockResolvedValue(null),
      deleteEmbeddingByContentId: vi.fn().mockResolvedValue(undefined),
    };

    // Mock tiered storage
    mockTieredStorage = {
      shouldArchiveToFilesystem: vi.fn().mockResolvedValue({
        tier: "indexeddb",
        reason: "below-threshold",
        shouldFallback: false,
      }),
      saveContent: vi.fn().mockResolvedValue({
        success: true,
        tier: "filesystem",
        bytesWritten: 1000,
      }),
      loadContent: vi.fn().mockResolvedValue({
        success: true,
        data: "loaded content",
      }),
      deleteContent: vi.fn().mockResolvedValue({
        success: true,
      }),
      hasFilesystemAccess: vi.fn().mockResolvedValue(true),
      getMetrics: vi.fn().mockReturnValue({
        filesystemWrites: 0,
        filesystemReads: 0,
        filesystemDeletes: 0,
        filesystemFallbacks: 0,
        indexedDbFallbacks: 0,
        totalBytesSaved: 0,
        totalBytesOffloaded: 5000,
      }),
      resetMetrics: vi.fn(),
    };

    // Mock compression
    mockCompression = {
      compressImage: vi.fn().mockResolvedValue({
        original: { bytes: 1000 },
        compressed: { blob: new Blob(), bytes: 500 },
        ratio: 0.5,
        wasResized: false,
        wasConverted: false,
        fallback: false,
      }),
      createThumbnail: vi.fn().mockResolvedValue({
        blob: new Blob(),
        bytes: 200,
        mimeType: "image/png",
        width: 100,
        height: 100,
        dataUrl: "data:image/png;base64,",
      }),
      createExcerpt: vi.fn().mockReturnValue({
        excerpt: "Test excerpt",
        wordCount: 2,
        truncated: false,
        sentences: 1,
        originalWordCount: 2,
      }),
    };

    storageManager = new StorageManagerImpl({
      database: mockDatabase,
      tieredStorage: mockTieredStorage,
      compression: mockCompression,
    });
  });

  describe("saveContent", () => {
    it("should save content successfully to IndexedDB", async () => {
      const options: SaveContentOptions = {
        pocketId: "pocket-1",
        type: "text" as const,
        content: "Test content",
        metadata: { timestamp: Date.now() },
        sourceUrl: "https://example.com",
      };

      const result = await storageManager.saveContent(options);

      expect(result.success).toBe(true);
      expect(result.contentId).toBe("content-1");
      expect(result.tier).toBe("indexeddb");
      expect(mockDatabase.saveContent).toHaveBeenCalledWith(
        expect.objectContaining({
          pocketId: "pocket-1",
          type: "text",
          sourceUrl: "https://example.com",
        }),
      );
    });

    it("should validate required fields", async () => {
      const options: SaveContentOptions = {
        pocketId: "",
        type: "text" as const,
        content: "Test",
        metadata: { timestamp: Date.now() },
        sourceUrl: "https://example.com",
      };

      await expect(storageManager.saveContent(options)).rejects.toThrow(
        StorageManagerError,
      );
    });

    it("should verify pocket exists before saving", async () => {
      mockDatabase.getPocket = vi.fn().mockResolvedValue(null);

      const options: SaveContentOptions = {
        pocketId: "nonexistent",
        type: "text" as const,
        content: "Test",
        metadata: { timestamp: Date.now() },
        sourceUrl: "https://example.com",
      };

      await expect(storageManager.saveContent(options)).rejects.toThrow(
        /Pocket nonexistent not found/,
      );
    });

    it("should generate excerpt using compression service", async () => {
      const options: SaveContentOptions = {
        pocketId: "pocket-1",
        type: "text" as const,
        content: "Long test content that needs an excerpt",
        metadata: { timestamp: Date.now() },
        sourceUrl: "https://example.com",
      };

      await storageManager.saveContent(options);

      expect(mockCompression.createExcerpt).toHaveBeenCalledWith(
        options.content,
        expect.objectContaining({ maxWords: 50 }),
      );
    });

    it("should route large content to filesystem", async () => {
      mockTieredStorage.shouldArchiveToFilesystem = vi.fn().mockResolvedValue({
        tier: "filesystem",
        reason: "above-threshold",
        shouldFallback: false,
      });

      mockTieredStorage.saveContent = vi.fn().mockResolvedValue({
        success: true,
        tier: "filesystem",
        bytesWritten: 50000,
        descriptor: {
          archiveHandleId: "handle-1",
          relativePath: "content/test.txt",
          estimatedBytes: 50000,
        },
      });

      const options: SaveContentOptions = {
        pocketId: "pocket-1",
        type: "page" as const,
        content: "A".repeat(60000),
        metadata: { timestamp: Date.now() },
        sourceUrl: "https://example.com",
      };

      const result = await storageManager.saveContent(options);

      expect(result.tier).toBe("filesystem");
      expect(result.archiveDescriptor).toBeDefined();
      expect(mockTieredStorage.saveContent).toHaveBeenCalled();
    });

    it("should rollback filesystem save if database save fails", async () => {
      mockTieredStorage.shouldArchiveToFilesystem = vi.fn().mockResolvedValue({
        tier: "filesystem",
        reason: "above-threshold",
        shouldFallback: false,
      });

      mockTieredStorage.saveContent = vi.fn().mockResolvedValue({
        success: true,
        tier: "filesystem",
        descriptor: {
          archiveHandleId: "handle-1",
          relativePath: "content/test.txt",
          estimatedBytes: 50000,
        },
      });

      mockDatabase.saveContent = vi
        .fn()
        .mockRejectedValue(new Error("Database error"));

      const options: SaveContentOptions = {
        pocketId: "pocket-1",
        type: "page" as const,
        content: "Large content",
        metadata: { timestamp: Date.now() },
        sourceUrl: "https://example.com",
      };

      await expect(storageManager.saveContent(options)).rejects.toThrow();
      expect(mockTieredStorage.deleteContent).toHaveBeenCalled();
    });

    it("should save embedding if provided", async () => {
      const embedding = new Array(768).fill(0.1);
      const options: SaveContentOptions = {
        pocketId: "pocket-1",
        type: "text" as const,
        content: "Test",
        metadata: { timestamp: Date.now() },
        sourceUrl: "https://example.com",
        embedding,
      };

      await storageManager.saveContent(options);

      expect(mockDatabase.saveEmbedding).toHaveBeenCalledWith(
        expect.objectContaining({
          contentId: "content-1",
          vector: embedding,
        }),
      );
    });

    it("should handle missing metadata gracefully", async () => {
      const options: SaveContentOptions = {
        pocketId: "pocket-1",
        type: "text" as const,
        content: "Test",
        metadata: { timestamp: Date.now() },
        sourceUrl: "https://example.com",
      };

      const result = await storageManager.saveContent(options);
      expect(result.success).toBe(true);
    });
  });

  describe("getContent", () => {
    it("should retrieve content from IndexedDB", async () => {
      const content = await storageManager.getContent("content-1");

      expect(content).toEqual(mockContent);
      expect(mockDatabase.getContent).toHaveBeenCalledWith("content-1");
    });

    it("should return null for non-existent content", async () => {
      mockDatabase.getContent = vi.fn().mockResolvedValue(null);

      const content = await storageManager.getContent("nonexistent");

      expect(content).toBeNull();
    });

    it("should load full content from filesystem if archived", async () => {
      const archivedContent: CapturedContent = {
        ...mockContent,
        content: "excerpt only",
        metadata: {
          timestamp: Date.now(),
          storage: {
            tier: "filesystem",
            archive: {
              archiveHandleId: "handle-1",
              relativePath: "content/test.txt",
              estimatedBytes: 50000,
            },
          },
        },
      };

      mockDatabase.getContent = vi.fn().mockResolvedValue(archivedContent);
      mockTieredStorage.loadContent = vi.fn().mockResolvedValue({
        success: true,
        data: "full content from filesystem",
      });

      const content = await storageManager.getContent("content-1");

      expect(content?.content).toBe("full content from filesystem");
      expect(mockTieredStorage.loadContent).toHaveBeenCalled();
    });

    it("should use fallback if filesystem load fails", async () => {
      const archivedContent: CapturedContent = {
        ...mockContent,
        content: "fallback content",
        metadata: {
          timestamp: Date.now(),
          storage: {
            tier: "filesystem",
            archive: {
              archiveHandleId: "handle-1",
              relativePath: "content/test.txt",
              estimatedBytes: 50000,
            },
          },
        },
      };

      mockDatabase.getContent = vi.fn().mockResolvedValue(archivedContent);
      mockTieredStorage.loadContent = vi
        .fn()
        .mockRejectedValue(new Error("Filesystem error"));

      const content = await storageManager.getContent("content-1");

      expect(content?.content).toBe("fallback content");
    });

    it("should throw error for invalid content ID", async () => {
      await expect(storageManager.getContent("")).rejects.toThrow(
        StorageManagerError,
      );
    });
  });

  describe("updateContent", () => {
    it("should update content successfully", async () => {
      const updates: UpdateContentOptions = {
        content: "Updated content",
        metadata: { title: "Updated title" },
      };

      await storageManager.updateContent("content-1", updates);

      expect(mockDatabase.updateContent).toHaveBeenCalledWith(
        "content-1",
        expect.objectContaining({
          content: "Updated content",
          metadata: expect.objectContaining({
            title: "Updated title",
            updatedAt: expect.any(Number),
          }),
        }),
      );
    });

    it("should update embedding if provided", async () => {
      const embedding = new Array(768).fill(0.2);
      const updates: UpdateContentOptions = {
        embedding,
      };

      await storageManager.updateContent("content-1", updates);

      expect(mockDatabase.saveEmbedding).toHaveBeenCalledWith(
        expect.objectContaining({
          contentId: "content-1",
          vector: embedding,
        }),
      );
    });

    it("should verify content exists before updating", async () => {
      mockDatabase.getContent = vi.fn().mockResolvedValue(null);

      await expect(
        storageManager.updateContent("nonexistent", { content: "test" }),
      ).rejects.toThrow(/not found/);
    });

    it("should merge metadata with existing metadata", async () => {
      const updates: UpdateContentOptions = {
        metadata: { title: "New title" },
      };

      await storageManager.updateContent("content-1", updates);

      expect(mockDatabase.updateContent).toHaveBeenCalledWith(
        "content-1",
        expect.objectContaining({
          metadata: expect.objectContaining({
            timestamp: mockContent.metadata.timestamp,
            title: "New title",
          }),
        }),
      );
    });
  });

  describe("deleteContent", () => {
    it("should delete content and cascade to related data", async () => {
      await storageManager.deleteContent("content-1");

      expect(mockDatabase.deleteChunksByContent).toHaveBeenCalledWith(
        "content-1",
      );
      expect(mockDatabase.deleteEmbeddingByContentId).toHaveBeenCalledWith(
        "content-1",
      );
      expect(mockDatabase.deleteContent).toHaveBeenCalledWith("content-1");
    });

    it("should delete filesystem archive if exists", async () => {
      const archivedContent: CapturedContent = {
        ...mockContent,
        metadata: {
          timestamp: Date.now(),
          storage: {
            tier: "filesystem",
            archive: {
              archiveHandleId: "handle-1",
              relativePath: "content/test.txt",
              estimatedBytes: 50000,
            },
          },
        },
      };

      mockDatabase.getContent = vi.fn().mockResolvedValue(archivedContent);

      await storageManager.deleteContent("content-1");

      expect(mockTieredStorage.deleteContent).toHaveBeenCalledWith({
        descriptor: archivedContent.metadata.storage!.archive,
      });
    });

    it("should throw error for non-existent content", async () => {
      mockDatabase.getContent = vi.fn().mockResolvedValue(null);

      await expect(
        storageManager.deleteContent("nonexistent"),
      ).rejects.toThrow(/not found/);
    });

    it("should complete delete even if cascade operations fail", async () => {
      mockDatabase.deleteChunksByContent = vi
        .fn()
        .mockRejectedValue(new Error("Chunk delete failed"));
      mockDatabase.deleteEmbeddingByContentId = vi
        .fn()
        .mockRejectedValue(new Error("Embedding delete failed"));

      await storageManager.deleteContent("content-1");

      expect(mockDatabase.deleteContent).toHaveBeenCalledWith("content-1");
    });
  });

  describe("getStorageStats", () => {
    beforeEach(() => {
      // Mock navigator.storage
      global.navigator = {
        storage: {
          estimate: vi.fn().mockResolvedValue({
            usage: 50000000,
            quota: 100000000,
          }),
          persisted: vi.fn().mockResolvedValue(true),
        },
      } as any;
    });

    it("should return comprehensive storage statistics", async () => {
      const stats = await storageManager.getStorageStats();

      expect(stats).toMatchObject({
        indexedDB: {
          usage: expect.any(Number),
          quota: expect.any(Number),
          percentUsed: expect.any(Number),
        },
        filesystem: {
          usage: expect.any(Number),
          available: true,
        },
        total: {
          usage: 50000000,
          quota: 100000000,
          percentUsed: 50,
        },
        persistent: true,
        recommendations: expect.any(Array),
      });
    });

    it("should generate warning recommendations when usage is high", async () => {
      global.navigator.storage.estimate = vi.fn().mockResolvedValue({
        usage: 85000000,
        quota: 100000000,
      });

      const stats = await storageManager.getStorageStats();

      expect(stats.recommendations).toContainEqual(
        expect.objectContaining({
          level: "warning",
          message: expect.stringContaining("filling up"),
        }),
      );
    });

    it("should generate critical recommendations when usage is very high", async () => {
      global.navigator.storage.estimate = vi.fn().mockResolvedValue({
        usage: 96000000,
        quota: 100000000,
      });

      const stats = await storageManager.getStorageStats();

      expect(stats.recommendations).toContainEqual(
        expect.objectContaining({
          level: "critical",
          message: expect.stringContaining("critically full"),
        }),
      );
    });

    it("should recommend persistent storage if not enabled", async () => {
      global.navigator.storage.persisted = vi.fn().mockResolvedValue(false);

      const stats = await storageManager.getStorageStats();

      expect(stats.recommendations).toContainEqual(
        expect.objectContaining({
          level: "info",
          message: expect.stringContaining("not persistent"),
        }),
      );
    });

    it("should include filesystem usage if available", async () => {
      const stats = await storageManager.getStorageStats();

      expect(stats.filesystem.usage).toBe(5000);
      expect(stats.filesystem.available).toBe(true);
    });
  });

  describe("exportPocket", () => {
    it("should export pocket with contents", async () => {
      const options: ExportPocketOptions = {
        format: "json",
      };

      const exported = await storageManager.exportPocket("pocket-1", options);

      expect(exported).toMatchObject({
        pocket: mockPocket,
        contents: [mockContent],
        metadata: {
          exportedAt: expect.any(Number),
          version: "1.0",
          contentCount: 1,
        },
      });
    });

    it("should include embeddings if requested", async () => {
      const mockEmbedding: Embedding = {
        id: "embedding-1",
        contentId: "content-1",
        vector: new Array(768).fill(0.1),
        model: "default",
        createdAt: Date.now(),
      };

      mockDatabase.getEmbeddingByContentId = vi
        .fn()
        .mockResolvedValue(mockEmbedding);

      const options: ExportPocketOptions = {
        format: "json",
        includeEmbeddings: true,
      };

      const exported = await storageManager.exportPocket("pocket-1", options);

      expect(exported.embeddings).toContainEqual(mockEmbedding);
    });

    it("should throw error for non-existent pocket", async () => {
      mockDatabase.getPocket = vi.fn().mockResolvedValue(null);

      await expect(
        storageManager.exportPocket("nonexistent", { format: "json" }),
      ).rejects.toThrow(/not found/);
    });

    it("should handle empty pockets", async () => {
      mockDatabase.getContentByPocket = vi.fn().mockResolvedValue([]);

      const exported = await storageManager.exportPocket("pocket-1", {
        format: "json",
      });

      expect(exported.contents).toEqual([]);
      expect(exported.metadata.contentCount).toBe(0);
    });
  });

  describe("createStorageManager", () => {
    it("should create a storage manager instance", () => {
      const manager = createStorageManager({
        database: mockDatabase,
        tieredStorage: mockTieredStorage,
        compression: mockCompression,
      });

      expect(manager).toBeInstanceOf(StorageManagerImpl);
    });

    it("should work without optional dependencies", () => {
      const manager = createStorageManager({
        database: mockDatabase,
      });

      expect(manager).toBeInstanceOf(StorageManagerImpl);
    });
  });

  describe("error handling", () => {
    it("should wrap unknown errors in StorageManagerError", async () => {
      mockDatabase.saveContent = vi
        .fn()
        .mockRejectedValue(new Error("Unknown error"));

      const options: SaveContentOptions = {
        pocketId: "pocket-1",
        type: "text" as const,
        content: "Test",
        metadata: { timestamp: Date.now() },
        sourceUrl: "https://example.com",
      };

      await expect(storageManager.saveContent(options)).rejects.toThrow(
        StorageManagerError,
      );
    });

    it("should preserve StorageManagerError instances", async () => {
      const options: SaveContentOptions = {
        pocketId: "",
        type: "text" as const,
        content: "Test",
        metadata: { timestamp: Date.now() },
        sourceUrl: "https://example.com",
      };

      try {
        await storageManager.saveContent(options);
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(StorageManagerError);
        expect((error as StorageManagerError).type).toBe(
          StorageManagerErrorType.VALIDATION_FAILED,
        );
      }
    });
  });
});
