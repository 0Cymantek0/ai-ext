/**
 * Tiered Storage Integration Example
 * 
 * This file demonstrates how to integrate TieredStorageService with the existing
 * IndexedDB manager and content capture workflow.
 * 
 * NOTE: This is an example/reference file, not part of the active codebase.
 */

import { createTieredStorage, type TieredStorage } from "./tiered-storage.js";
import { FilesystemAccessService } from "./filesystem-access.js";
import { ResearchAssetKind } from "../background/storage/tiered-storage-types.js";
import type {
  CapturedContent,
  ContentMetadata,
  ContentStorageReference,
} from "../background/indexeddb-manager.js";

/**
 * Example: Initialize tiered storage service
 */
function initializeTieredStorage(): TieredStorage {
  const filesystem = new FilesystemAccessService({
    defaultHandleId: "workspace",
    rootDirectoryName: "AI Pocket",
  });

  return createTieredStorage(filesystem, {
    filesystemThreshold: 50 * 1024, // 50 KB
    enableFilesystemOffload: true,
  });
}

/**
 * Example: Save captured content with tiered storage
 */
async function saveCapturedContentWithTieredStorage(
  tieredStorage: TieredStorage,
  content: CapturedContent,
): Promise<ContentMetadata> {
  const assetKind = mapContentTypeToAssetKind(content.type);
  const data = content.content;

  if (typeof data !== "string" && !(data instanceof ArrayBuffer)) {
    throw new Error("Unsupported content data type");
  }

  const result = await tieredStorage.saveContent({
    contentId: content.id,
    assetKind,
    data,
    mimeType: content.metadata.fileType,
  });

  const storageReference: ContentStorageReference = {
    tier: result.tier,
    archive: result.descriptor,
    fallbackPreview: result.tier === "indexeddb" 
      ? undefined 
      : content.metadata.preview,
    reason: result.reason,
  };

  return {
    ...content.metadata,
    storage: storageReference,
  };
}

/**
 * Example: Load content from tiered storage
 */
async function loadContentFromTieredStorage(
  tieredStorage: TieredStorage,
  metadata: ContentMetadata,
): Promise<string | ArrayBuffer | Blob | null> {
  const storage = metadata.storage;

  if (!storage || storage.tier === "indexeddb") {
    return null;
  }

  if (!storage.archive) {
    return storage.fallbackPreview ?? metadata.preview ?? null;
  }

  const result = await tieredStorage.loadContent({
    descriptor: storage.archive,
    fallbackContent: storage.fallbackPreview ?? metadata.preview,
    encoding: metadata.fileType?.startsWith("text/") ? "utf-8" : undefined,
  });

  if (result.success) {
    return result.data ?? null;
  }

  return null;
}

/**
 * Example: Delete content from tiered storage
 */
async function deleteContentFromTieredStorage(
  tieredStorage: TieredStorage,
  metadata: ContentMetadata,
): Promise<boolean> {
  const storage = metadata.storage;

  if (!storage || storage.tier === "indexeddb" || !storage.archive) {
    return true;
  }

  const result = await tieredStorage.deleteContent({
    descriptor: storage.archive,
  });

  return result.success;
}

/**
 * Example: Map ContentType to ResearchAssetKind
 */
function mapContentTypeToAssetKind(
  contentType: CapturedContent["type"],
): ResearchAssetKind {
  switch (contentType) {
    case "image":
      return ResearchAssetKind.ScreenshotImage;
    case "page":
    case "document":
      return ResearchAssetKind.FullArticle;
    case "text":
    case "note":
      return ResearchAssetKind.TextExcerpt;
    case "snippet":
      return ResearchAssetKind.TextExcerpt;
    default:
      return ResearchAssetKind.TextExcerpt;
  }
}

/**
 * Example: Batch operation with metrics
 */
async function batchSaveWithMetrics(
  tieredStorage: TieredStorage,
  contents: CapturedContent[],
): Promise<void> {
  tieredStorage.resetMetrics();

  for (const content of contents) {
    await saveCapturedContentWithTieredStorage(tieredStorage, content);
  }

  const metrics = tieredStorage.getMetrics();
  console.log("Batch save metrics:", {
    totalItems: contents.length,
    filesystemWrites: metrics.filesystemWrites,
    indexedDbFallbacks: metrics.indexedDbFallbacks,
    totalBytesOffloaded: metrics.totalBytesOffloaded,
    offloadPercentage: 
      (metrics.totalBytesOffloaded / metrics.totalBytesSaved) * 100,
  });
}

/**
 * Example: Check filesystem access and request if needed
 */
async function ensureFilesystemAccess(
  tieredStorage: TieredStorage,
): Promise<boolean> {
  const hasAccess = await tieredStorage.hasFilesystemAccess();
  
  if (!hasAccess) {
    console.warn("Filesystem access not available - will use IndexedDB fallback");
  }
  
  return hasAccess;
}

export {
  initializeTieredStorage,
  saveCapturedContentWithTieredStorage,
  loadContentFromTieredStorage,
  deleteContentFromTieredStorage,
  mapContentTypeToAssetKind,
  batchSaveWithMetrics,
  ensureFilesystemAccess,
};
