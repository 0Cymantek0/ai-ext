/**
 * Tiered Storage Service
 * Implements intelligent routing between IndexedDB and filesystem storage tiers
 * based on content size, asset type, user preferences, and quota pressure.
 * 
 * Requirements: Maintains IndexedDB as baseline with filesystem offloading for
 * large assets like screenshots, full articles, and long-form archives.
 */

import { logger } from "../background/monitoring.js";
import {
  FilesystemAccessService,
  type FilesystemWriteOptions,
  type FilesystemReadOptions,
  type FilesystemDeleteOptions,
} from "./filesystem-access.js";
import {
  ResearchAssetKind,
  type FileArchiveDescriptor,
  type ArchiveCompression,
} from "../background/storage/tiered-storage-types.js";

export const FILESYSTEM_SIZE_THRESHOLD_BYTES = 50 * 1024; // 50 KB
export const LARGE_ASSET_THRESHOLD_BYTES = 200 * 1024; // 200 KB

export interface TieredStorageConfig {
  filesystemThreshold?: number;
  preferFilesystemForAssets?: ResearchAssetKind[];
  enableFilesystemOffload?: boolean;
  handleId?: string;
}

export interface TieredStorage {
  shouldArchiveToFilesystem(
    assetKind: ResearchAssetKind,
    dataSize: number,
    options?: { forceFilesystem?: boolean; forceIndexedDb?: boolean },
  ): Promise<StorageDecision>;
  saveContent(options: SaveContentOptions): Promise<SaveContentResult>;
  loadContent(options: LoadContentOptions): Promise<LoadContentResult>;
  deleteContent(options: DeleteContentOptions): Promise<DeleteContentResult>;
  hasFilesystemAccess(): Promise<boolean>;
  getMetrics(): Readonly<TieredStorageMetrics>;
  resetMetrics(): void;
}

export interface StorageDecision {
  tier: "indexeddb" | "filesystem";
  reason: string;
  shouldFallback: boolean;
}

export interface SaveContentOptions {
  contentId: string;
  assetKind: ResearchAssetKind;
  data: string | ArrayBuffer | Uint8Array | Blob;
  mimeType?: string;
  compression?: ArchiveCompression;
  forceFilesystem?: boolean;
  forceIndexedDb?: boolean;
}

export interface LoadContentOptions {
  descriptor: FileArchiveDescriptor;
  fallbackContent?: string | ArrayBuffer | Blob;
  encoding?: "utf-8" | "base64" | "binary";
}

export interface DeleteContentOptions {
  descriptor: FileArchiveDescriptor;
  recursive?: boolean;
}

export interface SaveContentResult {
  success: boolean;
  tier: "indexeddb" | "filesystem";
  descriptor?: FileArchiveDescriptor;
  reason?: string;
  bytesWritten?: number;
  fallbackRequired?: boolean;
}

export interface LoadContentResult {
  success: boolean;
  data?: string | ArrayBuffer | Blob;
  text?: string;
  mimeType?: string;
  size?: number;
  lastModified?: number;
  reason?: string;
  usedFallback?: boolean;
}

export interface DeleteContentResult {
  success: boolean;
  reason?: string;
}

export interface TieredStorageMetrics {
  filesystemWrites: number;
  filesystemReads: number;
  filesystemDeletes: number;
  filesystemFallbacks: number;
  indexedDbFallbacks: number;
  totalBytesSaved: number;
  totalBytesOffloaded: number;
}

const DEFAULT_FILESYSTEM_ASSETS: ResearchAssetKind[] = [
  ResearchAssetKind.ScreenshotImage,
  ResearchAssetKind.FullArticle,
  ResearchAssetKind.LongFormArchive,
];

function getExtensionForMimeType(mimeType?: string): string {
  if (!mimeType) return ".bin";
  
  const mimeToExt: Record<string, string> = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/svg+xml": ".svg",
    "text/plain": ".txt",
    "text/html": ".html",
    "text/markdown": ".md",
    "application/json": ".json",
    "application/pdf": ".pdf",
  };
  
  return mimeToExt[mimeType.toLowerCase()] || ".bin";
}

function getDirectoryForAssetKind(kind: ResearchAssetKind): string {
  const kindStr = String(kind);
  
  if (kindStr.includes("screenshot") || kindStr.includes("image")) {
    return "screenshots";
  }
  if (kindStr.includes("article") || kindStr === "full-article") {
    return "articles";
  }
  if (kindStr.includes("archive")) {
    return "archives";
  }
  if (kindStr.includes("thumbnail")) {
    return "thumbnails";
  }
  if (kindStr.includes("text") || kindStr.includes("excerpt")) {
    return "excerpts";
  }
  
  return "content";
}

function calculateDataSize(
  data: string | ArrayBuffer | Uint8Array | Blob,
): number {
  if (typeof data === "string") {
    return new TextEncoder().encode(data).byteLength;
  }
  if (data instanceof Blob) {
    return data.size;
  }
  if (data instanceof ArrayBuffer) {
    return data.byteLength;
  }
  if (data instanceof Uint8Array) {
    return data.byteLength;
  }
  return 0;
}

export class TieredStorageService implements TieredStorage {
  private readonly filesystem: FilesystemAccessService;
  private readonly config: Required<TieredStorageConfig>;
  private readonly metrics: TieredStorageMetrics;

  constructor(
    filesystem: FilesystemAccessService,
    config: TieredStorageConfig = {},
  ) {
    this.filesystem = filesystem;
    this.config = {
      filesystemThreshold: config.filesystemThreshold ?? FILESYSTEM_SIZE_THRESHOLD_BYTES,
      preferFilesystemForAssets: config.preferFilesystemForAssets ?? DEFAULT_FILESYSTEM_ASSETS,
      enableFilesystemOffload: config.enableFilesystemOffload ?? true,
      handleId: config.handleId ?? "workspace",
    };
    
    this.metrics = {
      filesystemWrites: 0,
      filesystemReads: 0,
      filesystemDeletes: 0,
      filesystemFallbacks: 0,
      indexedDbFallbacks: 0,
      totalBytesSaved: 0,
      totalBytesOffloaded: 0,
    };
  }

  async shouldArchiveToFilesystem(
    assetKind: ResearchAssetKind,
    dataSize: number,
    options: { forceFilesystem?: boolean; forceIndexedDb?: boolean } = {},
  ): Promise<StorageDecision> {
    if (options.forceIndexedDb) {
      return {
        tier: "indexeddb",
        reason: "forced-indexeddb",
        shouldFallback: false,
      };
    }

    if (options.forceFilesystem) {
      const hasAccess = await this.hasFilesystemAccess();
      if (hasAccess) {
        return {
          tier: "filesystem",
          reason: "forced-filesystem",
          shouldFallback: true,
        };
      }
      logger.warn(
        "TieredStorage",
        "Filesystem forced but unavailable, using IndexedDB",
        { assetKind },
      );
      return {
        tier: "indexeddb",
        reason: "filesystem-unavailable",
        shouldFallback: false,
      };
    }

    if (!this.config.enableFilesystemOffload) {
      return {
        tier: "indexeddb",
        reason: "offload-disabled",
        shouldFallback: false,
      };
    }

    const hasAccess = await this.hasFilesystemAccess();
    if (!hasAccess) {
      return {
        tier: "indexeddb",
        reason: "filesystem-unavailable",
        shouldFallback: false,
      };
    }

    const isPreferredAsset = this.config.preferFilesystemForAssets.some(
      (kind) => String(kind) === String(assetKind),
    );

    if (isPreferredAsset) {
      return {
        tier: "filesystem",
        reason: "preferred-asset-kind",
        shouldFallback: true,
      };
    }

    if (dataSize >= LARGE_ASSET_THRESHOLD_BYTES) {
      return {
        tier: "filesystem",
        reason: "large-asset",
        shouldFallback: true,
      };
    }

    if (dataSize >= this.config.filesystemThreshold) {
      return {
        tier: "filesystem",
        reason: "size-threshold",
        shouldFallback: true,
      };
    }

    return {
      tier: "indexeddb",
      reason: "below-threshold",
      shouldFallback: false,
    };
  }

  async saveContent(options: SaveContentOptions): Promise<SaveContentResult> {
    const dataSize = calculateDataSize(options.data);
    
    const decisionOptions: { forceFilesystem?: boolean; forceIndexedDb?: boolean } = {};
    if (options.forceFilesystem !== undefined) {
      decisionOptions.forceFilesystem = options.forceFilesystem;
    }
    if (options.forceIndexedDb !== undefined) {
      decisionOptions.forceIndexedDb = options.forceIndexedDb;
    }
    
    const decision = await this.shouldArchiveToFilesystem(
      options.assetKind,
      dataSize,
      decisionOptions,
    );

    if (decision.tier === "indexeddb") {
      this.metrics.totalBytesSaved += dataSize;
      return {
        success: true,
        tier: "indexeddb",
        reason: decision.reason,
        bytesWritten: dataSize,
      };
    }

    const directory = getDirectoryForAssetKind(options.assetKind);
    const extension = getExtensionForMimeType(options.mimeType);
    const relativePath = `${directory}/${options.contentId}${extension}`;

    const writeOptions: FilesystemWriteOptions = {
      handleId: this.config.handleId,
      relativePath,
      data: options.data,
      ...(options.mimeType !== undefined ? { mimeType: options.mimeType } : {}),
    };

    const result = await this.filesystem.saveFile(writeOptions);

    if (result.success) {
      this.metrics.filesystemWrites += 1;
      this.metrics.totalBytesSaved += dataSize;
      this.metrics.totalBytesOffloaded += dataSize;

      const descriptor: FileArchiveDescriptor = {
        archiveHandleId: this.config.handleId,
        relativePath: result.path,
        estimatedBytes: result.bytesWritten ?? dataSize,
        ...(options.mimeType !== undefined ? { mimeType: options.mimeType } : {}),
        compression: options.compression ?? "none",
        lastModified: Date.now(),
      };

      logger.info("TieredStorage", "Saved content to filesystem", {
        contentId: options.contentId,
        path: result.path,
        bytes: result.bytesWritten,
      });

      const saveResult: SaveContentResult = {
        success: true,
        tier: "filesystem",
        descriptor,
        reason: decision.reason,
      };
      
      if (result.bytesWritten !== undefined) {
        saveResult.bytesWritten = result.bytesWritten;
      }
      
      return saveResult;
    }

    logger.warn("TieredStorage", "Filesystem write failed, fallback to IndexedDB", {
      contentId: options.contentId,
      reason: result.reason,
    });

    this.metrics.indexedDbFallbacks += 1;
    this.metrics.totalBytesSaved += dataSize;

    return {
      success: true,
      tier: "indexeddb",
      reason: `filesystem-failed-${result.reason}`,
      bytesWritten: dataSize,
      fallbackRequired: true,
    };
  }

  async loadContent(options: LoadContentOptions): Promise<LoadContentResult> {
    const descriptor = options.descriptor;

    if (!descriptor || !descriptor.relativePath) {
      return {
        success: false,
        reason: "invalid-descriptor",
      };
    }

    const hasAccess = await this.hasFilesystemAccess();
    if (!hasAccess) {
      logger.warn("TieredStorage", "Filesystem unavailable for load", {
        path: descriptor.relativePath,
      });

      if (options.fallbackContent) {
        this.metrics.filesystemFallbacks += 1;
        return {
          success: true,
          data: options.fallbackContent,
          reason: "filesystem-unavailable",
          usedFallback: true,
        };
      }

      return {
        success: false,
        reason: "filesystem-unavailable",
      };
    }

    const readOptions: FilesystemReadOptions = {
      handleId: descriptor.archiveHandleId ?? this.config.handleId,
      relativePath: descriptor.relativePath,
      ...(options.encoding !== undefined ? { encoding: options.encoding } : {}),
    };

    const result = await this.filesystem.readFile(readOptions);

    if (result.success) {
      this.metrics.filesystemReads += 1;

      logger.debug("TieredStorage", "Loaded content from filesystem", {
        path: result.path,
        size: result.size,
      });

      const loadResult: LoadContentResult = {
        success: true,
        size: result.size ?? descriptor.estimatedBytes,
      };

      if (result.data !== undefined) {
        loadResult.data = result.data;
      }

      if (result.text !== undefined) {
        loadResult.text = result.text;
      }

      const mimeType = result.mimeType ?? descriptor.mimeType;
      if (mimeType !== undefined) {
        loadResult.mimeType = mimeType;
      }

      const lastModified = result.lastModified ?? descriptor.lastModified;
      if (lastModified !== undefined) {
        loadResult.lastModified = lastModified;
      }

      return loadResult;
    }

    logger.warn("TieredStorage", "Filesystem read failed", {
      path: descriptor.relativePath,
      reason: result.reason,
    });

    if (options.fallbackContent !== undefined) {
      this.metrics.filesystemFallbacks += 1;

      const fallbackResult: LoadContentResult = {
        success: true,
        data: options.fallbackContent,
        reason: `filesystem-read-failed-${result.reason ?? "unknown"}`,
        usedFallback: true,
      };

      return fallbackResult;
    }

    const failureResult: LoadContentResult = {
      success: false,
    };

    if (result.reason !== undefined) {
      failureResult.reason = result.reason;
    }

    return failureResult;
  }

  async deleteContent(options: DeleteContentOptions): Promise<DeleteContentResult> {
    const descriptor = options.descriptor;

    if (!descriptor || !descriptor.relativePath) {
      return {
        success: false,
        reason: "invalid-descriptor",
      };
    }

    const hasAccess = await this.hasFilesystemAccess();
    if (!hasAccess) {
      logger.warn("TieredStorage", "Filesystem unavailable for delete", {
        path: descriptor.relativePath,
      });
      return {
        success: false,
        reason: "filesystem-unavailable",
      };
    }

    const deleteOptions: FilesystemDeleteOptions = {
      handleId: descriptor.archiveHandleId ?? this.config.handleId,
      relativePath: descriptor.relativePath,
      recursive: options.recursive ?? false,
    };

    const result = await this.filesystem.deleteFile(deleteOptions);

    if (result.success) {
      this.metrics.filesystemDeletes += 1;

      logger.info("TieredStorage", "Deleted content from filesystem", {
        path: result.path,
      });

      return {
        success: true,
      };
    }

    logger.warn("TieredStorage", "Filesystem delete failed", {
      path: descriptor.relativePath,
      reason: result.reason,
    });

    const deleteFailureResult: DeleteContentResult = {
      success: false,
    };

    if (result.reason !== undefined) {
      deleteFailureResult.reason = result.reason;
    }

    return deleteFailureResult;
  }

  async hasFilesystemAccess(): Promise<boolean> {
    try {
      const result = await this.filesystem.hasValidAccess();
      return result.available;
    } catch (error) {
      logger.error("TieredStorage", "Error checking filesystem access", error);
      return false;
    }
  }

  getMetrics(): Readonly<TieredStorageMetrics> {
    return { ...this.metrics };
  }

  resetMetrics(): void {
    this.metrics.filesystemWrites = 0;
    this.metrics.filesystemReads = 0;
    this.metrics.filesystemDeletes = 0;
    this.metrics.filesystemFallbacks = 0;
    this.metrics.indexedDbFallbacks = 0;
    this.metrics.totalBytesSaved = 0;
    this.metrics.totalBytesOffloaded = 0;
  }
}

export function createTieredStorage(
  filesystem: FilesystemAccessService,
  config?: TieredStorageConfig,
): TieredStorage {
  return new TieredStorageService(filesystem, config);
}
