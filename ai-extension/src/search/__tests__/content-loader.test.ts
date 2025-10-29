import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  FullContentLoader,
  FullContentError,
  FullContentErrorCode,
  configureFullContentLoader,
  loadFullContent,
  resetSharedFullContentLoader,
} from "../content-loader.js";
import {
  ContentType,
  ProcessingStatus,
  type CapturedContent,
  type ContentMetadata,
} from "../../background/indexeddb-manager.js";
import type { FileArchiveDescriptor } from "../../background/storage/tiered-storage-types.js";

interface MockStorageManager {
  getContent: ReturnType<typeof vi.fn>;
}

interface MockFilesystemService {
  hasAccess: ReturnType<typeof vi.fn>;
  read: ReturnType<typeof vi.fn>;
}

function createCapturedContent(
  overrides: Partial<CapturedContent> = {},
): CapturedContent {
  const metadata: ContentMetadata = {
    timestamp: overrides.metadata?.timestamp ?? Date.now(),
    ...overrides.metadata,
  } as ContentMetadata;

  return {
    id: overrides.id ?? `content-${Math.random().toString(36).slice(2)}`,
    pocketId: overrides.pocketId ?? "pocket-1",
    type: overrides.type ?? ContentType.TEXT,
    content: overrides.content ?? "stored-preview",
    metadata,
    capturedAt: overrides.capturedAt ?? Date.now(),
    sourceUrl: overrides.sourceUrl ?? "https://example.com",
    processingStatus: overrides.processingStatus ?? ProcessingStatus.COMPLETED,
    pdfMetadata: overrides.pdfMetadata,
    embedding: overrides.embedding,
  };
}

function createMocks(
  content: CapturedContent | null,
  filesystem?: Partial<{
    access: boolean;
    data: string | ArrayBuffer;
    permission: boolean;
    error: unknown;
    accessError: unknown;
  }>,
): {
  storageManager: MockStorageManager;
  filesystemService?: MockFilesystemService;
} {
  const storageManager = {
    getContent: vi.fn().mockResolvedValue(content),
  } as MockStorageManager;

  if (!filesystem) {
    return { storageManager };
  }

  const hasAccess = filesystem.permission ?? filesystem.access ?? true;
  const filesystemService: MockFilesystemService = {
    hasAccess: vi.fn(),
    read: vi.fn(),
  } as unknown as MockFilesystemService;

  if (filesystem.accessError !== undefined) {
    filesystemService.hasAccess.mockRejectedValue(filesystem.accessError);
  } else {
    filesystemService.hasAccess.mockResolvedValue(hasAccess);
  }

  if (filesystem.error !== undefined) {
    filesystemService.read.mockRejectedValue(filesystem.error);
  } else {
    filesystemService.read.mockResolvedValue(filesystem.data ?? "filesystem-data");
  }

  return { storageManager, filesystemService };
}

describe("FullContentLoader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetSharedFullContentLoader();
  });

  afterEach(() => {
    resetSharedFullContentLoader();
  });

  it("loads content from IndexedDB and caches subsequent requests", async () => {
    const captured = createCapturedContent({ id: "alpha", content: "Hello world" });
    const { storageManager } = createMocks(captured);

    const loader = new FullContentLoader({ storageManager });

    const first = await loader.loadFullContent("alpha");
    expect(first.content).toBe("Hello world");
    expect(first.availability).toBe("full");
    expect(storageManager.getContent).toHaveBeenCalledTimes(1);

    const second = await loader.loadFullContent("alpha");
    expect(second).toBe(first);
    expect(storageManager.getContent).toHaveBeenCalledTimes(1);
  });

  it("retrieves archived content when filesystem access is available", async () => {
    const archive: FileArchiveDescriptor = {
      archiveHandleId: "dir-1",
      relativePath: "article.html",
      estimatedBytes: 1024,
      mimeType: "text/html",
    };

    const captured = createCapturedContent({
      id: "fs-success",
      metadata: {
        timestamp: Date.now(),
        storage: {
          tier: "filesystem",
          archive,
        },
      },
      content: "preview snippet",
    });

    const { storageManager, filesystemService } = createMocks(captured, {
      access: true,
      data: "<html>Full article</html>",
    });

    const loader = new FullContentLoader({
      storageManager,
      filesystem: filesystemService,
    });

    const result = await loader.loadFullContent("fs-success");

    expect(filesystemService?.hasAccess).toHaveBeenCalledWith(archive);
    expect(filesystemService?.read).toHaveBeenCalledWith(archive);
    expect(result.storage.tier).toBe("filesystem");
    expect(result.content).toBe("<html>Full article</html>");
    expect(result.availability).toBe("full");
    expect(result.error).toBeUndefined();
  });

  it("falls back to preview when filesystem permission is missing", async () => {
    const archive: FileArchiveDescriptor = {
      archiveHandleId: "dir-2",
      relativePath: "note.txt",
      estimatedBytes: 64,
    };

    const captured = createCapturedContent({
      id: "fs-permission",
      metadata: {
        timestamp: Date.now(),
        storage: {
          tier: "filesystem",
          archive,
          fallbackPreview: "cached fallback",
        },
      },
      content: "short preview",
    });

    const { storageManager, filesystemService } = createMocks(captured, {
      access: false,
      permission: false,
    });

    const loader = new FullContentLoader({
      storageManager,
      filesystem: filesystemService,
    });

    const result = await loader.loadFullContent("fs-permission");

    expect(result.availability).toBe("partial");
    expect(result.content).toBe("cached fallback");
    expect(result.error).toBeInstanceOf(FullContentError);
    expect(result.error?.code).toBe(FullContentErrorCode.PermissionRequired);
  });

  it("returns fallback and error when filesystem read fails", async () => {
    const archive: FileArchiveDescriptor = {
      archiveHandleId: "dir-3",
      relativePath: "doc.pdf",
      estimatedBytes: 2048,
    };

    const captured = createCapturedContent({
      id: "fs-failure",
      metadata: {
        timestamp: Date.now(),
        storage: {
          tier: "filesystem",
          archive,
        },
        excerpt: "stored excerpt",
      },
      content: "placeholder",
    });

    const fileError = new Error("read failed");
    const { storageManager, filesystemService } = createMocks(captured, {
      access: true,
      error: fileError,
    });

    const loader = new FullContentLoader({
      storageManager,
      filesystem: filesystemService,
    });

    const result = await loader.loadFullContent("fs-failure");

    expect(filesystemService?.hasAccess).toHaveBeenCalledWith(archive);
    expect(filesystemService?.read).toHaveBeenCalledWith(archive);
    expect(result.availability).toBe("partial");
    expect(result.content).toBe("stored excerpt");
    expect(result.error?.code).toBe(FullContentErrorCode.FilesystemReadFailed);
  });

  it("surfaces access check errors as partial availability", async () => {
    const archive: FileArchiveDescriptor = {
      archiveHandleId: "dir-4",
      relativePath: "story.md",
      estimatedBytes: 512,
    };

    const captured = createCapturedContent({
      id: "fs-access-check",
      metadata: {
        timestamp: Date.now(),
        storage: {
          tier: "filesystem",
          archive,
          fallbackPreview: "cached access fallback",
        },
      },
      content: "fetched preview",
    });

    const accessError = new Error("permission query failed");
    const { storageManager, filesystemService } = createMocks(captured, {
      accessError,
    });

    const loader = new FullContentLoader({
      storageManager,
      filesystem: filesystemService,
    });

    const result = await loader.loadFullContent("fs-access-check");

    expect(filesystemService?.hasAccess).toHaveBeenCalledWith(archive);
    expect(result.availability).toBe("partial");
    expect(result.content).toBe("cached access fallback");
    expect(result.error?.code).toBe(FullContentErrorCode.AccessCheckFailed);
    expect(result.error?.details?.cause).toBe(accessError);
  });

  it("throws an error when content is missing", async () => {
    const { storageManager } = createMocks(null);

    const loader = new FullContentLoader({ storageManager });

    await expect(loader.loadFullContent("missing"))
      .rejects.toBeInstanceOf(FullContentError);
    await expect(loader.loadFullContent("missing"))
      .rejects.toHaveProperty("code", FullContentErrorCode.NotFound);
  });

  it("evicts the least-recently-used cache entry when capacity is exceeded", async () => {
    const contents: Record<string, CapturedContent> = {
      a: createCapturedContent({ id: "a", content: "Content A" }),
      b: createCapturedContent({ id: "b", content: "Content B" }),
      c: createCapturedContent({ id: "c", content: "Content C" }),
    };

    const storageManager = {
      getContent: vi.fn((id: string) => Promise.resolve(contents[id]!)),
    } as MockStorageManager;

    const loader = new FullContentLoader({ storageManager }, { maxCacheEntries: 2 });

    await loader.loadFullContent("a");
    await loader.loadFullContent("b");
    await loader.loadFullContent("a"); // refresh "a" usage
    await loader.loadFullContent("c"); // should evict "b"
    await loader.loadFullContent("b"); // re-fetch as it was evicted

    expect(storageManager.getContent).toHaveBeenCalledTimes(4);
  });

  it("supports the shared loader configuration utilities", async () => {
    const captured = createCapturedContent({ id: "shared" });
    const storageManager = {
      getContent: vi.fn().mockResolvedValue(captured),
    } as MockStorageManager;

    configureFullContentLoader({ storageManager }, { maxCacheEntries: 1 });

    const first = await loadFullContent("shared");
    expect(first.id).toBe("shared");
    expect(storageManager.getContent).toHaveBeenCalledTimes(1);

    const second = await loadFullContent("shared");
    expect(second).toBe(first);
    expect(storageManager.getContent).toHaveBeenCalledTimes(1);
  });
});
