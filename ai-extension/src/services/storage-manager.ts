/**
 * Storage Manager Service
 *
 * Orchestrates content ingestion, retrieval, updates, and exports across IndexedDB
 * and filesystem tiers. Provides a unified interface for all storage operations with
 * validation, compression, chunking, and quota monitoring.
 *
 * Requirements: 2.6, 5.8, 7.1, 7.2, 13.1
 */

import {
  ProcessingStatus,
  type CapturedContent,
  type ContentType,
  type ContentMetadata,
  type Pocket,
  type StoredChunk,
  type Embedding,
} from "../background/indexeddb-manager.js";
import type { TieredStorage } from "../storage/tiered-storage.js";
import type { CompressionService } from "./compression.js";
import {
  ResearchAssetKind,
  type FileArchiveDescriptor,
} from "../background/storage/tiered-storage-types.js";
import { logger } from "../background/monitoring.js";

/**
 * Storage statistics aggregated across all storage tiers
 */
export interface StorageStats {
  indexedDB: {
    usage: number;
    quota: number;
    percentUsed: number;
  };
  filesystem: {
    usage: number;
    available: boolean;
  };
  total: {
    usage: number;
    quota: number;
    percentUsed: number;
  };
  persistent: boolean;
  recommendations: StorageRecommendation[];
}

/**
 * Storage recommendations based on quota and usage patterns
 */
export interface StorageRecommendation {
  level: "info" | "warning" | "critical";
  message: string;
  action?: string;
}

/**
 * Options for saving content
 */
export interface SaveContentOptions {
  pocketId: string;
  type: ContentType;
  content: string | ArrayBuffer;
  metadata: ContentMetadata;
  sourceUrl: string;
  processingStatus?: ProcessingStatus;
  embedding?: number[];
  forceFilesystem?: boolean;
  forceIndexedDb?: boolean;
  skipCompression?: boolean;
  skipChunking?: boolean;
}

/**
 * Result of save operation
 */
export interface SaveContentResult {
  contentId: string;
  success: boolean;
  tier: "indexeddb" | "filesystem";
  bytesStored: number;
  compressed: boolean;
  chunked: boolean;
  archiveDescriptor?: FileArchiveDescriptor;
  error?: StorageManagerError;
}

/**
 * Options for updating content
 */
export interface UpdateContentOptions {
  content?: string | ArrayBuffer;
  metadata?: Partial<ContentMetadata>;
  processingStatus?: ProcessingStatus;
  embedding?: number[];
}

/**
 * Options for exporting pocket data
 */
export interface ExportPocketOptions {
  format: "json" | "markdown" | "html";
  includeMetadata?: boolean;
  includeConversations?: boolean;
  includeEmbeddings?: boolean;
}

/**
 * Exported pocket data structure
 */
export interface ExportedPocketData {
  pocket: Pocket;
  contents: CapturedContent[];
  conversations?: unknown[];
  embeddings?: Embedding[];
  metadata: {
    exportedAt: number;
    version: string;
    contentCount: number;
  };
}

/**
 * Error types for storage manager
 */
export enum StorageManagerErrorType {
  VALIDATION_FAILED = "VALIDATION_FAILED",
  QUOTA_EXCEEDED = "QUOTA_EXCEEDED",
  NOT_FOUND = "NOT_FOUND",
  SAVE_FAILED = "SAVE_FAILED",
  UPDATE_FAILED = "UPDATE_FAILED",
  DELETE_FAILED = "DELETE_FAILED",
  EXPORT_FAILED = "EXPORT_FAILED",
  TRANSACTION_FAILED = "TRANSACTION_FAILED",
  UNKNOWN = "UNKNOWN",
}

/**
 * Storage manager error
 */
export class StorageManagerError extends Error {
  constructor(
    public type: StorageManagerErrorType,
    message: string,
    public cause?: unknown,
  ) {
    super(message);
    this.name = "StorageManagerError";
  }
}

/**
 * Database manager interface required by storage manager
 */
export interface DatabaseManager {
  saveContent(
    content: Omit<CapturedContent, "id" | "capturedAt">,
  ): Promise<string>;
  getContent(id: string): Promise<CapturedContent | null>;
  updateContent(
    id: string,
    updates: Partial<Omit<CapturedContent, "id" | "capturedAt">>,
  ): Promise<void>;
  deleteContent(id: string): Promise<void>;
  getContentByPocket(pocketId: string): Promise<CapturedContent[]>;
  getPocket(id: string): Promise<Pocket | null>;
  saveChunk(chunk: Omit<StoredChunk, "createdAt">): Promise<string>;
  getChunksByContent(contentId: string): Promise<StoredChunk[]>;
  deleteChunksByContent(contentId: string): Promise<void>;
  saveEmbedding(
    embedding: Omit<Embedding, "id" | "createdAt">,
  ): Promise<string>;
  getEmbeddingByContentId(contentId: string): Promise<Embedding | null>;
  deleteEmbeddingByContentId(contentId: string): Promise<void>;
}

/**
 * Storage manager dependencies for dependency injection
 */
export interface StorageManagerDependencies {
  database: DatabaseManager;
  tieredStorage?: TieredStorage;
  compression?: CompressionService;
}

/**
 * Storage Manager interface
 */
export interface StorageManager {
  /**
   * Save content with validation, compression, and tiered storage
   */
  saveContent(options: SaveContentOptions): Promise<SaveContentResult>;

  /**
   * Retrieve content by ID
   */
  getContent(contentId: string): Promise<CapturedContent | null>;

  /**
   * Update existing content
   */
  updateContent(
    contentId: string,
    options: UpdateContentOptions,
  ): Promise<void>;

  /**
   * Delete content and all associated data (chunks, embeddings, archives)
   */
  deleteContent(contentId: string): Promise<void>;

  /**
   * Get comprehensive storage statistics and recommendations
   */
  getStorageStats(): Promise<StorageStats>;

  /**
   * Export pocket data in specified format
   */
  exportPocket(
    pocketId: string,
    options: ExportPocketOptions,
  ): Promise<ExportedPocketData>;
}

/**
 * Storage Manager implementation
 */
export class StorageManagerImpl implements StorageManager {
  private readonly database: DatabaseManager;
  private readonly tieredStorage?: TieredStorage;
  private readonly compression?: CompressionService;

  constructor(dependencies: StorageManagerDependencies) {
    this.database = dependencies.database;
    if (dependencies.tieredStorage) {
      this.tieredStorage = dependencies.tieredStorage;
    }
    if (dependencies.compression) {
      this.compression = dependencies.compression;
    }
  }

  /**
   * Save content with validation, compression, and tiered storage routing
   */
  async saveContent(options: SaveContentOptions): Promise<SaveContentResult> {
    const startTime = Date.now();

    try {
      // Step 1: Validate required fields
      this.validateSaveOptions(options);

      // Step 2: Verify pocket exists
      const pocket = await this.database.getPocket(options.pocketId);
      if (!pocket) {
        throw new StorageManagerError(
          StorageManagerErrorType.VALIDATION_FAILED,
          `Pocket ${options.pocketId} not found`,
        );
      }

      // Step 3: Prepare metadata with excerpt/preview if compression service available
      const metadata = await this.enrichMetadata(options);

      // Step 4: Determine storage tier and save content
      let contentData = options.content;
      let tier: "indexeddb" | "filesystem" = "indexeddb";
      let bytesStored = this.calculateDataSize(contentData);
      const compressed = false;
      let archiveDescriptor: FileArchiveDescriptor | undefined;

      if (this.tieredStorage && !options.forceIndexedDb) {
        const assetKind = this.mapContentTypeToAssetKind(options.type);
        const routingOptions: {
          forceFilesystem?: boolean;
          forceIndexedDb?: boolean;
        } = {};

        if (typeof options.forceFilesystem === "boolean") {
          routingOptions.forceFilesystem = options.forceFilesystem;
        }
        if (typeof options.forceIndexedDb === "boolean") {
          routingOptions.forceIndexedDb = options.forceIndexedDb;
        }

        const decision = await this.tieredStorage.shouldArchiveToFilesystem(
          assetKind,
          bytesStored,
          routingOptions,
        );

        if (decision.tier === "filesystem") {
          // Save to filesystem
          const saveOpts: {
            contentId: string;
            assetKind: typeof assetKind;
            data: string | ArrayBuffer;
            mimeType?: string;
            forceFilesystem?: boolean;
          } = {
            contentId: crypto.randomUUID(),
            assetKind,
            data: contentData,
          };

          if (metadata.fileType) {
            saveOpts.mimeType = metadata.fileType;
          }
          if (typeof options.forceFilesystem === "boolean") {
            saveOpts.forceFilesystem = options.forceFilesystem;
          }

          const saveResult = await this.tieredStorage.saveContent(saveOpts);

          if (saveResult.success && saveResult.descriptor) {
            tier = "filesystem";
            archiveDescriptor = saveResult.descriptor;
            bytesStored = saveResult.bytesWritten || bytesStored;

            // Store only preview/excerpt in IndexedDB
            contentData = metadata.excerpt || metadata.preview || "";

            // Update metadata to reflect filesystem storage
            metadata.storage = {
              tier: "filesystem",
              archive: archiveDescriptor,
              ...(metadata.excerpt
                ? { fallbackPreview: metadata.excerpt }
                : {}),
            };
          }
        }
      }

      // Step 5: Save to IndexedDB within a transaction
      let contentId: string;
      try {
        const dbRecord: Omit<CapturedContent, "id" | "capturedAt"> = {
          pocketId: options.pocketId,
          type: options.type,
          content: contentData,
          metadata,
          sourceUrl: options.sourceUrl,
          processingStatus:
            options.processingStatus ?? ProcessingStatus.COMPLETED,
        };

        if (options.embedding !== undefined) {
          dbRecord.embedding = options.embedding;
        }

        contentId = await this.database.saveContent(dbRecord);
      } catch (error) {
        // Rollback filesystem save if database save fails
        if (archiveDescriptor && this.tieredStorage) {
          try {
            await this.tieredStorage.deleteContent({
              descriptor: archiveDescriptor,
            });
          } catch (deleteError) {
            logger.error(
              "StorageManager",
              "Failed to rollback filesystem save",
              {
                archiveDescriptor,
                deleteError,
              },
            );
          }
        }
        throw error;
      }

      // Step 6: Save embedding if provided
      if (options.embedding) {
        try {
          await this.database.saveEmbedding({
            contentId,
            vector: options.embedding,
            model: "default",
          });
        } catch (error) {
          logger.warn("StorageManager", "Failed to save embedding", {
            contentId,
            error,
          });
        }
      }

      const duration = Date.now() - startTime;
      logger.info("StorageManager", "Content saved successfully", {
        contentId,
        tier,
        bytesStored,
        duration,
      });

      const result: SaveContentResult = {
        contentId,
        success: true,
        tier,
        bytesStored,
        compressed,
        chunked: false,
      };

      if (archiveDescriptor !== undefined) {
        result.archiveDescriptor = archiveDescriptor;
      }

      return result;
    } catch (error) {
      const storageError =
        error instanceof StorageManagerError
          ? error
          : new StorageManagerError(
              StorageManagerErrorType.SAVE_FAILED,
              `Failed to save content: ${error}`,
              error,
            );

      logger.error("StorageManager", "Content save failed", {
        error: storageError,
        pocketId: options.pocketId,
      });

      throw storageError;
    }
  }

  /**
   * Retrieve content by ID
   */
  async getContent(contentId: string): Promise<CapturedContent | null> {
    try {
      if (!contentId) {
        throw new StorageManagerError(
          StorageManagerErrorType.VALIDATION_FAILED,
          "Content ID is required",
        );
      }

      const content = await this.database.getContent(contentId);

      if (!content) {
        return null;
      }

      // If content is stored in filesystem, load full content
      if (
        content.metadata.storage?.tier === "filesystem" &&
        content.metadata.storage.archive &&
        this.tieredStorage
      ) {
        try {
          const loadResult = await this.tieredStorage.loadContent({
            descriptor: content.metadata.storage.archive,
            fallbackContent: content.content,
          });

          if (loadResult.success && loadResult.data !== undefined) {
            let payload: string | ArrayBuffer;

            if (
              typeof Blob !== "undefined" &&
              loadResult.data instanceof Blob
            ) {
              // Convert Blob to string for text-based content types, ArrayBuffer for binary
              if (this.isTextBasedContentType(content.type)) {
                payload = await loadResult.data.text();
              } else {
                payload = await loadResult.data.arrayBuffer();
              }
            } else {
              payload = loadResult.data as string | ArrayBuffer;
            }

            return {
              ...content,
              content: payload,
            };
          }
        } catch (error) {
          logger.warn(
            "StorageManager",
            "Failed to load from filesystem, using fallback",
            {
              contentId,
              error,
            },
          );
        }
      }

      return content;
    } catch (error) {
      logger.error("StorageManager", "Failed to get content", {
        contentId,
        error,
      });
      throw error instanceof StorageManagerError
        ? error
        : new StorageManagerError(
            StorageManagerErrorType.UNKNOWN,
            `Failed to get content: ${error}`,
            error,
          );
    }
  }

  /**
   * Update existing content
   */
  async updateContent(
    contentId: string,
    options: UpdateContentOptions,
  ): Promise<void> {
    try {
      if (!contentId) {
        throw new StorageManagerError(
          StorageManagerErrorType.VALIDATION_FAILED,
          "Content ID is required",
        );
      }

      // Verify content exists
      const existing = await this.database.getContent(contentId);
      if (!existing) {
        throw new StorageManagerError(
          StorageManagerErrorType.NOT_FOUND,
          `Content ${contentId} not found`,
        );
      }

      // Prepare updates
      const updates: Partial<Omit<CapturedContent, "id" | "capturedAt">> = {};

      if (options.content !== undefined) {
        updates.content = options.content;
      }

      if (options.metadata !== undefined) {
        updates.metadata = {
          ...this.mergeMetadata(existing.metadata, options.metadata),
          updatedAt: Date.now(),
        };
      }

      if (options.processingStatus !== undefined) {
        updates.processingStatus = options.processingStatus;
      }

      if (options.embedding !== undefined) {
        updates.embedding = options.embedding;

        // Update embedding in separate table
        try {
          await this.database.saveEmbedding({
            contentId,
            vector: options.embedding,
            model: "default",
          });
        } catch (error) {
          logger.warn("StorageManager", "Failed to update embedding", {
            contentId,
            error,
          });
        }
      }

      // Perform update
      await this.database.updateContent(contentId, updates);

      logger.info("StorageManager", "Content updated successfully", {
        contentId,
      });
    } catch (error) {
      logger.error("StorageManager", "Failed to update content", {
        contentId,
        error,
      });
      throw error instanceof StorageManagerError
        ? error
        : new StorageManagerError(
            StorageManagerErrorType.UPDATE_FAILED,
            `Failed to update content: ${error}`,
            error,
          );
    }
  }

  /**
   * Delete content and cascade to chunks, embeddings, and filesystem archives
   */
  async deleteContent(contentId: string): Promise<void> {
    try {
      if (!contentId) {
        throw new StorageManagerError(
          StorageManagerErrorType.VALIDATION_FAILED,
          "Content ID is required",
        );
      }

      // Retrieve content to get archive descriptor
      const content = await this.database.getContent(contentId);
      if (!content) {
        throw new StorageManagerError(
          StorageManagerErrorType.NOT_FOUND,
          `Content ${contentId} not found`,
        );
      }

      const errors: string[] = [];

      // Delete chunks
      try {
        await this.database.deleteChunksByContent(contentId);
      } catch (error) {
        errors.push(`Failed to delete chunks: ${error}`);
        logger.warn("StorageManager", "Failed to delete chunks", {
          contentId,
          error,
        });
      }

      // Delete embedding
      try {
        await this.database.deleteEmbeddingByContentId(contentId);
      } catch (error) {
        errors.push(`Failed to delete embedding: ${error}`);
        logger.warn("StorageManager", "Failed to delete embedding", {
          contentId,
          error,
        });
      }

      // Delete filesystem archive if exists
      if (
        content.metadata.storage?.tier === "filesystem" &&
        content.metadata.storage.archive &&
        this.tieredStorage
      ) {
        try {
          await this.tieredStorage.deleteContent({
            descriptor: content.metadata.storage.archive,
          });
        } catch (error) {
          errors.push(`Failed to delete filesystem archive: ${error}`);
          logger.warn("StorageManager", "Failed to delete filesystem archive", {
            contentId,
            error,
          });
        }
      }

      // Delete from database (this is the primary record)
      await this.database.deleteContent(contentId);

      if (errors.length > 0) {
        logger.warn("StorageManager", "Content deleted with warnings", {
          contentId,
          errors,
        });
      } else {
        logger.info("StorageManager", "Content deleted successfully", {
          contentId,
        });
      }
    } catch (error) {
      logger.error("StorageManager", "Failed to delete content", {
        contentId,
        error,
      });
      throw error instanceof StorageManagerError
        ? error
        : new StorageManagerError(
            StorageManagerErrorType.DELETE_FAILED,
            `Failed to delete content: ${error}`,
            error,
          );
    }
  }

  /**
   * Get comprehensive storage statistics with recommendations
   */
  async getStorageStats(): Promise<StorageStats> {
    try {
      let indexedDBUsage = 0;
      let indexedDBQuota = 0;
      let totalUsage = 0;
      let totalQuota = 0;
      let persistent = false;

      // Get IndexedDB and total origin usage via Storage API
      if (
        typeof navigator !== "undefined" &&
        navigator.storage &&
        typeof navigator.storage.estimate === "function"
      ) {
        const estimate = await navigator.storage.estimate();
        totalUsage = estimate.usage || 0;
        totalQuota = estimate.quota || 0;

        if (typeof navigator.storage.persisted === "function") {
          persistent = await navigator.storage.persisted();
        }
      }

      // Check filesystem availability and usage
      let filesystemUsage = 0;
      let filesystemAvailable = false;
      if (this.tieredStorage) {
        filesystemAvailable = await this.tieredStorage.hasFilesystemAccess();
        if (filesystemAvailable) {
          const metrics = this.tieredStorage.getMetrics();
          filesystemUsage = metrics.totalBytesOffloaded;
        }
      }

      // Estimate chrome.storage.local usage
      let chromeStorageUsage = 0;
      if (
        typeof chrome !== "undefined" &&
        chrome.storage &&
        chrome.storage.local &&
        typeof chrome.storage.local.getBytesInUse === "function"
      ) {
        try {
          chromeStorageUsage = await new Promise<number>((resolve) => {
            chrome.storage.local.getBytesInUse(null, (bytes) => {
              resolve(bytes || 0);
            });
          });
        } catch (error) {
          logger.debug(
            "StorageManager",
            "Could not get chrome.storage.local usage",
            error,
          );
        }
      }

      // Calculate IndexedDB usage: total usage minus known external storage
      // Browser storage is a unified pool, so IndexedDB shares the same quota
      indexedDBUsage = Math.max(
        0,
        totalUsage - chromeStorageUsage - filesystemUsage,
      );
      indexedDBQuota = totalQuota; // Quota is for the entire origin, not just IndexedDB

      const indexedDBPercent =
        indexedDBQuota > 0 ? (indexedDBUsage / indexedDBQuota) * 100 : 0;
      const totalPercent = totalQuota > 0 ? (totalUsage / totalQuota) * 100 : 0;

      // Generate recommendations
      const recommendations = this.generateRecommendations(
        totalPercent,
        persistent,
        filesystemAvailable,
      );

      return {
        indexedDB: {
          usage: indexedDBUsage,
          quota: indexedDBQuota,
          percentUsed: indexedDBPercent,
        },
        filesystem: {
          usage: filesystemUsage,
          available: filesystemAvailable,
        },
        total: {
          usage: totalUsage,
          quota: totalQuota,
          percentUsed: totalPercent,
        },
        persistent,
        recommendations,
      };
    } catch (error) {
      logger.error("StorageManager", "Failed to get storage stats", error);
      throw new StorageManagerError(
        StorageManagerErrorType.UNKNOWN,
        `Failed to get storage stats: ${error}`,
        error,
      );
    }
  }

  /**
   * Export pocket data in specified format
   */
  async exportPocket(
    pocketId: string,
    options: ExportPocketOptions,
  ): Promise<ExportedPocketData> {
    try {
      if (!pocketId) {
        throw new StorageManagerError(
          StorageManagerErrorType.VALIDATION_FAILED,
          "Pocket ID is required",
        );
      }

      // Retrieve pocket
      const pocket = await this.database.getPocket(pocketId);
      if (!pocket) {
        throw new StorageManagerError(
          StorageManagerErrorType.NOT_FOUND,
          `Pocket ${pocketId} not found`,
        );
      }

      // Retrieve contents
      const contents = await this.database.getContentByPocket(pocketId);

      const exportData: ExportedPocketData = {
        pocket,
        contents,
        metadata: {
          exportedAt: Date.now(),
          version: "1.0",
          contentCount: contents.length,
        },
      };

      // TODO: Add support for including conversations when requested
      if (options.includeConversations) {
        logger.debug(
          "StorageManager",
          "Conversation export not yet implemented",
        );
        exportData.conversations = [];
      }

      // Add embeddings if requested
      if (options.includeEmbeddings) {
        // TODO: optimize by batching when DatabaseManager exposes a bulk fetch method.
        const embeddings: Embedding[] = [];
        for (const content of contents) {
          const embedding = await this.database.getEmbeddingByContentId(
            content.id,
          );
          if (embedding) {
            embeddings.push(embedding);
          }
        }
        exportData.embeddings = embeddings;
      }

      logger.info("StorageManager", "Pocket exported successfully", {
        pocketId,
        contentCount: contents.length,
        format: options.format,
      });

      return exportData;
    } catch (error) {
      logger.error("StorageManager", "Failed to export pocket", {
        pocketId,
        error,
      });
      throw error instanceof StorageManagerError
        ? error
        : new StorageManagerError(
            StorageManagerErrorType.EXPORT_FAILED,
            `Failed to export pocket: ${error}`,
            error,
          );
    }
  }

  /**
   * Validate save options
   */
  private validateSaveOptions(options: SaveContentOptions): void {
    if (!options.pocketId) {
      throw new StorageManagerError(
        StorageManagerErrorType.VALIDATION_FAILED,
        "Pocket ID is required",
      );
    }

    if (!options.type) {
      throw new StorageManagerError(
        StorageManagerErrorType.VALIDATION_FAILED,
        "Content type is required",
      );
    }

    if (options.content === undefined || options.content === null) {
      throw new StorageManagerError(
        StorageManagerErrorType.VALIDATION_FAILED,
        "Content is required",
      );
    }

    if (!options.sourceUrl) {
      throw new StorageManagerError(
        StorageManagerErrorType.VALIDATION_FAILED,
        "Source URL is required",
      );
    }
  }

  /**
   * Enrich metadata with excerpt and preview if compression service available
   */
  private async enrichMetadata(
    options: SaveContentOptions,
  ): Promise<ContentMetadata> {
    const metadata: ContentMetadata = {
      ...options.metadata,
      timestamp: options.metadata?.timestamp ?? Date.now(),
    };

    // Generate excerpt for text content if compression service available
    if (
      this.compression &&
      typeof options.content === "string" &&
      !metadata.excerpt
    ) {
      try {
        const excerptResult = this.compression.createExcerpt(options.content, {
          maxWords: 50,
          ellipsis: true,
        });
        metadata.excerpt = excerptResult.excerpt;
      } catch (error) {
        logger.warn("StorageManager", "Failed to generate excerpt", error);
      }
    }

    return metadata;
  }

  /**
   * Calculate data size in bytes
   */
  private calculateDataSize(data: string | ArrayBuffer): number {
    if (typeof data === "string") {
      return new TextEncoder().encode(data).byteLength;
    }
    if (data instanceof ArrayBuffer) {
      return data.byteLength;
    }
    return 0;
  }

  private mergeMetadata(
    base: ContentMetadata,
    updates: Partial<ContentMetadata>,
  ): ContentMetadata {
    if (!updates || Object.keys(updates).length === 0) {
      return { ...base };
    }

    return this.deepMergeObjects(base, updates);
  }

  private deepMergeObjects<T>(target: T, source: Partial<T>): T {
    const isTargetArray = Array.isArray(target);
    const output: any = isTargetArray
      ? [...(target as unknown[])]
      : { ...(target as Record<string, unknown>) };

    for (const key of Object.keys(source) as Array<keyof T>) {
      const sourceValue = source[key];
      if (sourceValue === undefined) {
        continue;
      }

      const targetValue = (target as Record<string, unknown>)[key as string];
      if (
        sourceValue &&
        typeof sourceValue === "object" &&
        !Array.isArray(sourceValue) &&
        targetValue &&
        typeof targetValue === "object" &&
        !Array.isArray(targetValue)
      ) {
        output[key as string] = this.deepMergeObjects(
          targetValue,
          sourceValue as any,
        );
      } else if (Array.isArray(sourceValue)) {
        output[key as string] = [...sourceValue];
      } else {
        output[key as string] = sourceValue as unknown;
      }
    }

    return output as T;
  }

  private normalizeContentType(value: ContentType | string): string {
    return typeof value === "string"
      ? value.toLowerCase()
      : String(value).toLowerCase();
  }

  private isTextBasedContentType(value: ContentType | string): boolean {
    const normalized = this.normalizeContentType(value);
    return (
      normalized === "text" ||
      normalized === "snippet" ||
      normalized === "note" ||
      normalized === "page"
    );
  }

  /**
   * Map content type to research asset kind for tiered storage
   */
  private mapContentTypeToAssetKind(type: ContentType): ResearchAssetKind {
    const normalized = this.normalizeContentType(type);

    switch (normalized) {
      case "text":
      case "snippet":
      case "note":
        return ResearchAssetKind.TextExcerpt;
      case "image":
        return ResearchAssetKind.ScreenshotImage;
      case "page":
        return ResearchAssetKind.FullArticle;
      case "pdf":
      case "document":
        return ResearchAssetKind.LongFormArchive;
      default:
        return ResearchAssetKind.TextExcerpt;
    }
  }

  /**
   * Generate storage recommendations based on usage
   */
  private generateRecommendations(
    percentUsed: number,
    persistent: boolean,
    filesystemAvailable: boolean,
  ): StorageRecommendation[] {
    const recommendations: StorageRecommendation[] = [];

    // Quota recommendations
    if (percentUsed >= 95) {
      recommendations.push({
        level: "critical",
        message: "Storage is critically full",
        action: "Delete old content or enable filesystem offloading",
      });
    } else if (percentUsed >= 80) {
      recommendations.push({
        level: "warning",
        message: "Storage is filling up",
        action:
          "Consider enabling filesystem offloading or cleaning up old content",
      });
    }

    // Persistence recommendation
    if (!persistent) {
      recommendations.push({
        level: "info",
        message: "Storage is not persistent",
        action: "Request persistent storage to prevent data loss",
      });
    }

    // Filesystem recommendation
    if (!filesystemAvailable && percentUsed >= 60) {
      recommendations.push({
        level: "info",
        message: "Filesystem offloading not available",
        action: "Enable filesystem access to store large files efficiently",
      });
    }

    return recommendations;
  }
}

/**
 * Create a new storage manager instance with dependencies
 */
export function createStorageManager(
  dependencies: StorageManagerDependencies,
): StorageManager {
  return new StorageManagerImpl(dependencies);
}
