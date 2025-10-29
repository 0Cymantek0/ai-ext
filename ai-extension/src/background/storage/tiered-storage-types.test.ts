import { describe, it, expect } from "vitest";

import {
  DEFAULT_INDEXED_DB_ITEM_BYTES,
  INDEXED_DB_CAPACITY_BYTES,
  INDEXED_DB_SOFT_LIMIT_BYTES,
  ResearchAssetKind,
  type TieredStorageItem,
  estimateIndexedDbBytes,
} from "./tiered-storage-types.js";

describe("tiered storage type helpers", () => {
  it("combines excerpt and thumbnail estimates for UI sizing", () => {
    const excerptBytes = estimateIndexedDbBytes({
      kind: ResearchAssetKind.TextExcerpt,
    });
    const thumbnailBytes = estimateIndexedDbBytes({
      kind: ResearchAssetKind.ThumbnailImage,
    });

    expect(excerptBytes).toBe(DEFAULT_INDEXED_DB_ITEM_BYTES[ResearchAssetKind.TextExcerpt]);
    expect(thumbnailBytes).toBe(
      DEFAULT_INDEXED_DB_ITEM_BYTES[ResearchAssetKind.ThumbnailImage],
    );
    expect(excerptBytes + thumbnailBytes).toBe(17 * 1024);
  });

  it("supports overriding chunk math for large full article captures", () => {
    const estimate = estimateIndexedDbBytes({
      kind: ResearchAssetKind.FullArticle,
      chunkCount: 3,
      bytesPerChunk: 4096,
      extraBytes: 256,
    });

    expect(estimate).toBe(3 * 4096 + 256);
  });

  it("uses explicit chunk byte values when provided", () => {
    const estimate = estimateIndexedDbBytes({
      kind: ResearchAssetKind.LongFormArchive,
      chunkBytes: [2048.9, 1024.2, -50],
      extraBytes: 75.8,
    });

    expect(estimate).toBe(2048 + 1024 + 75);
  });

  it("marks screenshots as filesystem-backed via archive descriptor", () => {
    const screenshot: TieredStorageItem = {
      kind: ResearchAssetKind.ScreenshotImage,
      indexedDb: {
        kind: ResearchAssetKind.ScreenshotImage,
        estimatedBytes: estimateIndexedDbBytes({
          kind: ResearchAssetKind.ScreenshotImage,
        }),
      },
      archive: {
        archiveHandleId: "workspace",
        relativePath: "screenshots/page.png",
        estimatedBytes: 320 * 1024,
        compression: "none",
      },
    };

    expect(screenshot.indexedDb.estimatedBytes).toBe(0);
    expect(screenshot.archive?.relativePath).toBe("screenshots/page.png");
  });

  it("exports indexeddb quota constants for reuse", () => {
    expect(INDEXED_DB_CAPACITY_BYTES).toBe(50 * 1024 * 1024);
    expect(INDEXED_DB_SOFT_LIMIT_BYTES).toBeLessThan(INDEXED_DB_CAPACITY_BYTES);
    expect(INDEXED_DB_SOFT_LIMIT_BYTES).toBeGreaterThan(0);
  });
});
