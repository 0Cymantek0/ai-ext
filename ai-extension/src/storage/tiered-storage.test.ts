import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../background/monitoring.js", () => {
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
  return { logger };
});

import {
  TieredStorageService,
  createTieredStorage,
  FILESYSTEM_SIZE_THRESHOLD_BYTES,
  LARGE_ASSET_THRESHOLD_BYTES,
  type SaveContentOptions,
  type LoadContentOptions,
  type DeleteContentOptions,
} from "./tiered-storage.js";
import type {
  FilesystemAccessService,
  FileWriteResult,
  FileReadResult,
  FileDeleteResult,
  AccessAvailabilityResult,
} from "./filesystem-access.js";
import { ResearchAssetKind } from "../background/storage/tiered-storage-types.js";

class MockFilesystemAccessService {
  private hasAccess = true;
  private writeResults: Map<string, FileWriteResult> = new Map();
  private readResults: Map<string, FileReadResult> = new Map();
  private deleteResults: Map<string, FileDeleteResult> = new Map();

  setHasAccess(value: boolean): void {
    this.hasAccess = value;
  }

  setWriteResult(path: string, result: FileWriteResult): void {
    this.writeResults.set(path, result);
  }

  setReadResult(path: string, result: FileReadResult): void {
    this.readResults.set(path, result);
  }

  setDeleteResult(path: string, result: FileDeleteResult): void {
    this.deleteResults.set(path, result);
  }

  async hasValidAccess(): Promise<AccessAvailabilityResult> {
    return {
      available: this.hasAccess,
      reason: this.hasAccess ? undefined : "unavailable",
    };
  }

  async saveFile(options: any): Promise<FileWriteResult> {
    const stored = this.writeResults.get(options.relativePath);
    if (stored) {
      return stored;
    }

    return {
      success: true,
      path: options.relativePath,
      handleId: options.handleId ?? "workspace",
      bytesWritten: 1024,
    };
  }

  async readFile(options: any): Promise<FileReadResult> {
    const stored = this.readResults.get(options.relativePath);
    if (stored) {
      return stored;
    }

    const data = new ArrayBuffer(1024);
    return {
      success: true,
      path: options.relativePath,
      handleId: options.handleId ?? "workspace",
      data,
      size: 1024,
    };
  }

  async deleteFile(options: any): Promise<FileDeleteResult> {
    const stored = this.deleteResults.get(options.relativePath);
    if (stored) {
      return stored;
    }

    return {
      success: true,
      path: options.relativePath,
      handleId: options.handleId ?? "workspace",
    };
  }
}

describe("TieredStorageService", () => {
  let mockFilesystem: MockFilesystemAccessService;
  let service: TieredStorageService;

  beforeEach(() => {
    mockFilesystem = new MockFilesystemAccessService();
    service = new TieredStorageService(
      mockFilesystem as unknown as FilesystemAccessService,
    );
  });

  describe("shouldArchiveToFilesystem", () => {
    it("routes to IndexedDB when below threshold", async () => {
      const decision = await service.shouldArchiveToFilesystem(
        ResearchAssetKind.TextExcerpt,
        1024,
      );

      expect(decision.tier).toBe("indexeddb");
      expect(decision.reason).toBe("below-threshold");
      expect(decision.shouldFallback).toBe(false);
    });

    it("routes to filesystem for large assets", async () => {
      const decision = await service.shouldArchiveToFilesystem(
        ResearchAssetKind.FullArticle,
        LARGE_ASSET_THRESHOLD_BYTES + 1024,
      );

      expect(decision.tier).toBe("filesystem");
      expect(decision.reason).toBe("large-asset");
      expect(decision.shouldFallback).toBe(true);
    });

    it("routes to filesystem for screenshot images regardless of size", async () => {
      const decision = await service.shouldArchiveToFilesystem(
        ResearchAssetKind.ScreenshotImage,
        1024,
      );

      expect(decision.tier).toBe("filesystem");
      expect(decision.reason).toBe("preferred-asset-kind");
      expect(decision.shouldFallback).toBe(true);
    });

    it("routes to filesystem when size exceeds threshold", async () => {
      const decision = await service.shouldArchiveToFilesystem(
        ResearchAssetKind.FullArticle,
        FILESYSTEM_SIZE_THRESHOLD_BYTES + 1024,
      );

      expect(decision.tier).toBe("filesystem");
      expect(decision.reason).toMatch(/threshold|asset/);
      expect(decision.shouldFallback).toBe(true);
    });

    it("respects forceIndexedDb option", async () => {
      const decision = await service.shouldArchiveToFilesystem(
        ResearchAssetKind.ScreenshotImage,
        500 * 1024,
        { forceIndexedDb: true },
      );

      expect(decision.tier).toBe("indexeddb");
      expect(decision.reason).toBe("forced-indexeddb");
    });

    it("respects forceFilesystem option when access available", async () => {
      const decision = await service.shouldArchiveToFilesystem(
        ResearchAssetKind.TextExcerpt,
        100,
        { forceFilesystem: true },
      );

      expect(decision.tier).toBe("filesystem");
      expect(decision.reason).toBe("forced-filesystem");
    });

    it("falls back to IndexedDB when filesystem forced but unavailable", async () => {
      mockFilesystem.setHasAccess(false);

      const decision = await service.shouldArchiveToFilesystem(
        ResearchAssetKind.TextExcerpt,
        100,
        { forceFilesystem: true },
      );

      expect(decision.tier).toBe("indexeddb");
      expect(decision.reason).toBe("filesystem-unavailable");
    });

    it("routes to IndexedDB when filesystem unavailable", async () => {
      mockFilesystem.setHasAccess(false);

      const decision = await service.shouldArchiveToFilesystem(
        ResearchAssetKind.ScreenshotImage,
        1024,
      );

      expect(decision.tier).toBe("indexeddb");
      expect(decision.reason).toBe("filesystem-unavailable");
    });

    it("routes to IndexedDB when offload disabled", async () => {
      const customService = new TieredStorageService(
        mockFilesystem as unknown as FilesystemAccessService,
        { enableFilesystemOffload: false },
      );

      const decision = await customService.shouldArchiveToFilesystem(
        ResearchAssetKind.ScreenshotImage,
        500 * 1024,
      );

      expect(decision.tier).toBe("indexeddb");
      expect(decision.reason).toBe("offload-disabled");
    });
  });

  describe("saveContent", () => {
    it("saves small text to IndexedDB tier", async () => {
      const options: SaveContentOptions = {
        contentId: "test-123",
        assetKind: ResearchAssetKind.TextExcerpt,
        data: "Small text content",
        mimeType: "text/plain",
      };

      const result = await service.saveContent(options);

      expect(result.success).toBe(true);
      expect(result.tier).toBe("indexeddb");
      expect(result.reason).toBe("below-threshold");
      expect(result.bytesWritten).toBeGreaterThan(0);
    });

    it("saves screenshot to filesystem with descriptor", async () => {
      const imageData = new Uint8Array(100 * 1024);
      const options: SaveContentOptions = {
        contentId: "screenshot-456",
        assetKind: ResearchAssetKind.ScreenshotImage,
        data: imageData,
        mimeType: "image/png",
      };

      const result = await service.saveContent(options);

      expect(result.success).toBe(true);
      expect(result.tier).toBe("filesystem");
      expect(result.descriptor).toBeDefined();
      expect(result.descriptor?.relativePath).toMatch(/screenshots/);
      expect(result.descriptor?.archiveHandleId).toBe("workspace");
      expect(result.descriptor?.mimeType).toBe("image/png");
      expect(result.descriptor?.compression).toBe("none");
    });

    it("falls back to IndexedDB when filesystem write fails", async () => {
      mockFilesystem.setWriteResult("screenshots/test-789.png", {
        success: false,
        path: "screenshots/test-789.png",
        handleId: "workspace",
        reason: "permission-denied",
      });

      const options: SaveContentOptions = {
        contentId: "test-789",
        assetKind: ResearchAssetKind.ScreenshotImage,
        data: new Uint8Array(50 * 1024),
        mimeType: "image/png",
      };

      const result = await service.saveContent(options);

      expect(result.success).toBe(true);
      expect(result.tier).toBe("indexeddb");
      expect(result.reason).toMatch(/filesystem-failed/);
      expect(result.fallbackRequired).toBe(true);
    });

    it("updates metrics on successful filesystem save", async () => {
      const options: SaveContentOptions = {
        contentId: "article-999",
        assetKind: ResearchAssetKind.FullArticle,
        data: "A".repeat(100 * 1024),
        mimeType: "text/html",
      };

      await service.saveContent(options);

      const metrics = service.getMetrics();
      expect(metrics.filesystemWrites).toBe(1);
      expect(metrics.totalBytesSaved).toBeGreaterThan(0);
      expect(metrics.totalBytesOffloaded).toBeGreaterThan(0);
    });

    it("generates correct file paths for different asset kinds", async () => {
      const tests = [
        {
          kind: ResearchAssetKind.ScreenshotImage,
          mimeType: "image/png",
          expectedDir: "screenshots",
          expectedExt: ".png",
        },
        {
          kind: ResearchAssetKind.FullArticle,
          mimeType: "text/html",
          expectedDir: "articles",
          expectedExt: ".html",
        },
      ];

      for (const test of tests) {
        const options: SaveContentOptions = {
          contentId: `test-${test.kind}`,
          assetKind: test.kind,
          data: new Uint8Array(100 * 1024),
          mimeType: test.mimeType,
        };

        const result = await service.saveContent(options);

        if (result.descriptor) {
          expect(result.descriptor.relativePath).toMatch(
            new RegExp(test.expectedDir),
          );
          expect(result.descriptor.relativePath).toMatch(
            new RegExp(`\\${test.expectedExt}$`),
          );
        }
      }
    });
  });

  describe("loadContent", () => {
    it("loads content from filesystem successfully", async () => {
      const mockData = new ArrayBuffer(2048);
      mockFilesystem.setReadResult("screenshots/test.png", {
        success: true,
        path: "screenshots/test.png",
        handleId: "workspace",
        data: mockData,
        size: 2048,
        mimeType: "image/png",
        lastModified: 1234567890,
      });

      const options: LoadContentOptions = {
        descriptor: {
          archiveHandleId: "workspace",
          relativePath: "screenshots/test.png",
          estimatedBytes: 2048,
          mimeType: "image/png",
        },
      };

      const result = await service.loadContent(options);

      expect(result.success).toBe(true);
      expect(result.data).toBe(mockData);
      expect(result.size).toBe(2048);
      expect(result.mimeType).toBe("image/png");
      expect(result.usedFallback).toBeFalsy();
    });

    it("uses fallback content when filesystem unavailable", async () => {
      mockFilesystem.setHasAccess(false);

      const fallbackContent = "Fallback preview text";
      const options: LoadContentOptions = {
        descriptor: {
          archiveHandleId: "workspace",
          relativePath: "articles/test.html",
          estimatedBytes: 1024,
        },
        fallbackContent,
      };

      const result = await service.loadContent(options);

      expect(result.success).toBe(true);
      expect(result.data).toBe(fallbackContent);
      expect(result.usedFallback).toBe(true);
      expect(result.reason).toBe("filesystem-unavailable");
    });

    it("uses fallback when filesystem read fails", async () => {
      mockFilesystem.setReadResult("articles/missing.html", {
        success: false,
        path: "articles/missing.html",
        handleId: "workspace",
        reason: "not-found",
      });

      const fallbackContent = "Preview text";
      const options: LoadContentOptions = {
        descriptor: {
          archiveHandleId: "workspace",
          relativePath: "articles/missing.html",
          estimatedBytes: 1024,
        },
        fallbackContent,
      };

      const result = await service.loadContent(options);

      expect(result.success).toBe(true);
      expect(result.data).toBe(fallbackContent);
      expect(result.usedFallback).toBe(true);
    });

    it("fails when filesystem unavailable and no fallback", async () => {
      mockFilesystem.setHasAccess(false);

      const options: LoadContentOptions = {
        descriptor: {
          archiveHandleId: "workspace",
          relativePath: "screenshots/test.png",
          estimatedBytes: 2048,
        },
      };

      const result = await service.loadContent(options);

      expect(result.success).toBe(false);
      expect(result.reason).toBe("filesystem-unavailable");
    });

    it("updates metrics on successful filesystem read", async () => {
      const options: LoadContentOptions = {
        descriptor: {
          archiveHandleId: "workspace",
          relativePath: "articles/test.html",
          estimatedBytes: 1024,
        },
      };

      await service.loadContent(options);

      const metrics = service.getMetrics();
      expect(metrics.filesystemReads).toBe(1);
    });

    it("tracks fallback metrics", async () => {
      mockFilesystem.setHasAccess(false);

      const options: LoadContentOptions = {
        descriptor: {
          archiveHandleId: "workspace",
          relativePath: "test.txt",
          estimatedBytes: 100,
        },
        fallbackContent: "fallback",
      };

      await service.loadContent(options);

      const metrics = service.getMetrics();
      expect(metrics.filesystemFallbacks).toBe(1);
    });
  });

  describe("deleteContent", () => {
    it("deletes content from filesystem successfully", async () => {
      const options: DeleteContentOptions = {
        descriptor: {
          archiveHandleId: "workspace",
          relativePath: "screenshots/old.png",
          estimatedBytes: 1024,
        },
      };

      const result = await service.deleteContent(options);

      expect(result.success).toBe(true);
    });

    it("fails when filesystem unavailable", async () => {
      mockFilesystem.setHasAccess(false);

      const options: DeleteContentOptions = {
        descriptor: {
          archiveHandleId: "workspace",
          relativePath: "test.txt",
          estimatedBytes: 100,
        },
      };

      const result = await service.deleteContent(options);

      expect(result.success).toBe(false);
      expect(result.reason).toBe("filesystem-unavailable");
    });

    it("handles delete errors gracefully", async () => {
      mockFilesystem.setDeleteResult("protected/file.txt", {
        success: false,
        path: "protected/file.txt",
        handleId: "workspace",
        reason: "permission-denied",
      });

      const options: DeleteContentOptions = {
        descriptor: {
          archiveHandleId: "workspace",
          relativePath: "protected/file.txt",
          estimatedBytes: 100,
        },
      };

      const result = await service.deleteContent(options);

      expect(result.success).toBe(false);
      expect(result.reason).toBe("permission-denied");
    });

    it("updates metrics on successful delete", async () => {
      const options: DeleteContentOptions = {
        descriptor: {
          archiveHandleId: "workspace",
          relativePath: "temp/data.bin",
          estimatedBytes: 500,
        },
      };

      await service.deleteContent(options);

      const metrics = service.getMetrics();
      expect(metrics.filesystemDeletes).toBe(1);
    });
  });

  describe("metrics", () => {
    it("tracks metrics across operations", async () => {
      await service.saveContent({
        contentId: "test-1",
        assetKind: ResearchAssetKind.ScreenshotImage,
        data: new Uint8Array(50 * 1024),
        mimeType: "image/png",
      });

      await service.loadContent({
        descriptor: {
          archiveHandleId: "workspace",
          relativePath: "screenshots/test-1.png",
          estimatedBytes: 50 * 1024,
        },
      });

      const metrics = service.getMetrics();
      expect(metrics.filesystemWrites).toBe(1);
      expect(metrics.filesystemReads).toBe(1);
      expect(metrics.totalBytesSaved).toBeGreaterThan(0);
      expect(metrics.totalBytesOffloaded).toBeGreaterThan(0);
    });

    it("resets metrics correctly", async () => {
      await service.saveContent({
        contentId: "test-reset",
        assetKind: ResearchAssetKind.ScreenshotImage,
        data: new Uint8Array(10 * 1024),
        mimeType: "image/png",
      });

      service.resetMetrics();

      const metrics = service.getMetrics();
      expect(metrics.filesystemWrites).toBe(0);
      expect(metrics.filesystemReads).toBe(0);
      expect(metrics.totalBytesSaved).toBe(0);
      expect(metrics.totalBytesOffloaded).toBe(0);
    });
  });

  describe("createTieredStorage", () => {
    it("creates service with default config", () => {
      const newService = createTieredStorage(
        mockFilesystem as unknown as FilesystemAccessService,
      );
      expect(newService).toBeInstanceOf(TieredStorageService);
    });

    it("creates service with custom config", () => {
      const newService = createTieredStorage(
        mockFilesystem as unknown as FilesystemAccessService,
        {
          filesystemThreshold: 100 * 1024,
          enableFilesystemOffload: false,
        },
      );
      expect(newService).toBeInstanceOf(TieredStorageService);
    });
  });
});
