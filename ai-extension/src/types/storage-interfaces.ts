/**
 * Storage Interface Definitions
 *
 * Defines contracts for storage layer operations including IndexedDB, filesystem,
 * and tiered storage coordination. These interfaces provide a unified API for
 * persisting and retrieving content across different storage backends.
 *
 * Design principles:
 * - Generic types instead of `any` for type safety
 * - Clear separation between storage tiers (IndexedDB vs filesystem)
 * - Quota awareness and monitoring built into contracts
 * - Support for both transactional and batch operations
 */

import type {
  Content,
  ContentChunk,
  ContentMetadata,
  ContentUpdate,
  ContentFilters,
  FileArchiveDescriptor,
  StorageTier,
  ArchiveCompression,
} from "./content.js";

/**
 * Storage quota information
 * Provides current usage and capacity across storage tiers
 */
export interface StorageQuota {
  /**
   * Total bytes currently used
   */
  usage: number;

  /**
   * Total bytes available (quota)
   */
  quota: number;

  /**
   * Percentage of quota used (0-100)
   */
  percentUsed: number;

  /**
   * Whether storage persistence has been granted
   */
  persistent: boolean;
}

/**
 * Storage statistics aggregated across all tiers
 */
export interface StorageStats {
  /**
   * IndexedDB storage statistics
   */
  indexedDB: StorageQuota;

  /**
   * Filesystem storage statistics (if available)
   */
  filesystem: {
    usage: number;
    available: boolean;
  };

  /**
   * Combined statistics across all tiers
   */
  total: StorageQuota;

  /**
   * Recommended actions based on usage patterns
   */
  recommendations: StorageRecommendation[];
}

/**
 * Storage recommendation levels
 */
export type StorageRecommendationLevel = "info" | "warning" | "critical";

/**
 * Storage recommendations based on quota and usage
 */
export interface StorageRecommendation {
  /**
   * Severity level of the recommendation
   */
  level: StorageRecommendationLevel;

  /**
   * Human-readable message describing the issue or suggestion
   */
  message: string;

  /**
   * Optional recommended action to address the issue
   */
  action?: string;
}

/**
 * Storage tier routing decision
 * Determines which storage tier should be used for a given operation
 */
export interface StorageRoutingDecision {
  /**
   * Selected storage tier
   */
  tier: StorageTier;

  /**
   * Reason for the routing decision
   */
  reason: string;

  /**
   * Whether fallback to alternative tier is allowed on failure
   */
  allowFallback: boolean;
}

/**
 * Options for saving content to storage
 */
export interface StorageSaveOptions<TData = string | ArrayBuffer> {
  /**
   * Unique identifier for the content (generated if not provided)
   */
  id?: string;

  /**
   * The actual content data to store
   */
  data: TData;

  /**
   * Content metadata
   */
  metadata: ContentMetadata;

  /**
   * MIME type of the content
   */
  mimeType?: string;

  /**
   * Compression to apply (if supported by the storage tier)
   */
  compression?: ArchiveCompression;

  /**
   * Force storage to specific tier (overrides automatic routing)
   */
  forceTier?: StorageTier;

  /**
   * Whether to skip compression even if it would normally be applied
   */
  skipCompression?: boolean;

  /**
   * Whether to generate and store embeddings for vector search
   */
  generateEmbedding?: boolean;
}

/**
 * Result of a storage save operation
 */
export interface StorageSaveResult {
  /**
   * Whether the operation succeeded
   */
  success: boolean;

  /**
   * Unique identifier of the stored content
   */
  id: string;

  /**
   * Storage tier where content was saved
   */
  tier: StorageTier;

  /**
   * Number of bytes written to storage
   */
  bytesWritten: number;

  /**
   * Whether compression was applied
   */
  compressed: boolean;

  /**
   * Archive descriptor if stored in filesystem
   */
  archiveDescriptor?: FileArchiveDescriptor;

  /**
   * Optional error if operation failed
   */
  error?: StorageError;

  /**
   * Whether a fallback tier was used after primary tier failed
   */
  usedFallback?: boolean;
}

/**
 * Options for loading content from storage
 */
export interface StorageLoadOptions {
  /**
   * Unique identifier of the content to load
   */
  id: string;

  /**
   * Archive descriptor if content is in filesystem
   */
  archiveDescriptor?: FileArchiveDescriptor;

  /**
   * Optional fallback data if primary load fails
   */
  fallbackData?: string | ArrayBuffer;

  /**
   * Text encoding for string content
   */
  encoding?: "utf-8" | "base64" | "binary";

  /**
   * Whether to include embeddings in the result
   */
  includeEmbedding?: boolean;
}

/**
 * Result of a storage load operation
 */
export interface StorageLoadResult<TData = string | ArrayBuffer> {
  /**
   * Whether the operation succeeded
   */
  success: boolean;

  /**
   * The loaded content data
   */
  data?: TData;

  /**
   * Content metadata
   */
  metadata?: ContentMetadata;

  /**
   * Storage tier where content was loaded from
   */
  tier?: StorageTier;

  /**
   * Number of bytes read from storage
   */
  bytesRead?: number;

  /**
   * Whether the data was decompressed
   */
  decompressed?: boolean;

  /**
   * Whether fallback data was used
   */
  usedFallback?: boolean;

  /**
   * Optional error if operation failed
   */
  error?: StorageError;
}

/**
 * Options for deleting content from storage
 */
export interface StorageDeleteOptions {
  /**
   * Unique identifier of the content to delete
   */
  id: string;

  /**
   * Archive descriptor if content is in filesystem
   */
  archiveDescriptor?: FileArchiveDescriptor;

  /**
   * Whether to delete associated data (embeddings, chunks)
   */
  deleteAssociatedData?: boolean;

  /**
   * Whether to recursively delete if content has dependencies
   */
  recursive?: boolean;
}

/**
 * Result of a storage delete operation
 */
export interface StorageDeleteResult {
  /**
   * Whether the operation succeeded
   */
  success: boolean;

  /**
   * Number of items deleted (including associated data)
   */
  itemsDeleted?: number;

  /**
   * Number of bytes freed
   */
  bytesFreed?: number;

  /**
   * Optional error if operation failed
   */
  error?: StorageError;
}

/**
 * Storage error types
 */
export enum StorageErrorType {
  QUOTA_EXCEEDED = "QUOTA_EXCEEDED",
  NOT_FOUND = "NOT_FOUND",
  ACCESS_DENIED = "ACCESS_DENIED",
  INVALID_DATA = "INVALID_DATA",
  CORRUPTION = "CORRUPTION",
  TRANSACTION_FAILED = "TRANSACTION_FAILED",
  NETWORK_ERROR = "NETWORK_ERROR",
  UNKNOWN = "UNKNOWN",
}

/**
 * Storage error
 */
export interface StorageError {
  /**
   * Error type classification
   */
  type: StorageErrorType;

  /**
   * Human-readable error message
   */
  message: string;

  /**
   * Storage tier where the error occurred
   */
  tier?: StorageTier;

  /**
   * Original error cause (if available)
   */
  cause?: Error;

  /**
   * Whether retry might succeed
   */
  retryable?: boolean;
}

/**
 * Storage provider interface
 * Defines the contract for a single storage backend (IndexedDB or filesystem)
 */
export interface StorageProvider<TData = string | ArrayBuffer> {
  /**
   * Get the storage tier this provider manages
   */
  getTier(): StorageTier;

  /**
   * Check if this storage provider is available and accessible
   */
  isAvailable(): Promise<boolean>;

  /**
   * Get current storage quota information
   */
  getQuota(): Promise<StorageQuota>;

  /**
   * Save data to storage
   * @param options - Save operation options
   * @returns Result of the save operation
   */
  save(options: StorageSaveOptions<TData>): Promise<StorageSaveResult>;

  /**
   * Load data from storage
   * @param options - Load operation options
   * @returns Result of the load operation
   */
  load(options: StorageLoadOptions): Promise<StorageLoadResult<TData>>;

  /**
   * Delete data from storage
   * @param options - Delete operation options
   * @returns Result of the delete operation
   */
  delete(options: StorageDeleteOptions): Promise<StorageDeleteResult>;

  /**
   * Check if content exists in storage
   * @param id - Content identifier
   * @returns True if content exists
   */
  exists(id: string): Promise<boolean>;

  /**
   * Clear all data from storage (use with caution)
   * @returns Number of items deleted
   */
  clear(): Promise<number>;
}

/**
 * IndexedDB-specific operations
 * Extends StorageProvider with transaction and index support
 */
export interface IndexedDBProvider extends StorageProvider {
  /**
   * Execute operations within a transaction
   * @param storeNames - Object store names to include in transaction
   * @param mode - Transaction mode (readonly or readwrite)
   * @param operation - Function to execute within the transaction
   * @returns Transaction result
   */
  executeTransaction<TResult>(
    storeNames: string | string[],
    mode: "readonly" | "readwrite",
    operation: (transaction: IDBTransaction) => Promise<TResult>,
  ): Promise<TResult>;

  /**
   * Query content using filters
   * @param storeName - Object store name
   * @param filters - Query filters
   * @returns Matching content items
   */
  query(storeName: string, filters: ContentFilters): Promise<Content[]>;

  /**
   * Get all items from a store
   * @param storeName - Object store name
   * @param limit - Maximum number of items to return
   * @param offset - Number of items to skip
   * @returns Array of items
   */
  getAll<T>(storeName: string, limit?: number, offset?: number): Promise<T[]>;

  /**
   * Count items in a store matching filters
   * @param storeName - Object store name
   * @param filters - Optional filters
   * @returns Count of matching items
   */
  count(storeName: string, filters?: ContentFilters): Promise<number>;
}

/**
 * Filesystem-specific operations
 * Extends StorageProvider with directory and handle management
 */
export interface FilesystemProvider extends StorageProvider {
  /**
   * Request permission to access the filesystem
   * @returns True if permission granted
   */
  requestPermission(): Promise<boolean>;

  /**
   * Check if filesystem access is granted
   * @returns True if access is available
   */
  hasAccess(): Promise<boolean>;

  /**
   * Get or create a directory handle
   * @param directoryName - Directory name or path
   * @param create - Whether to create if it doesn't exist
   * @returns Directory handle identifier
   */
  getDirectoryHandle(
    directoryName: string,
    create?: boolean,
  ): Promise<string | undefined>;

  /**
   * List files in a directory
   * @param directoryHandleId - Directory handle identifier
   * @param pattern - Optional filename pattern filter
   * @returns Array of file descriptors
   */
  listFiles(
    directoryHandleId: string,
    pattern?: string,
  ): Promise<FileArchiveDescriptor[]>;

  /**
   * Get storage estimate if available
   * @returns Storage quota information
   */
  getEstimate(): Promise<StorageQuota | undefined>;
}

/**
 * Tiered storage coordinator interface
 * Manages intelligent routing between IndexedDB and filesystem tiers
 */
export interface TieredStorageCoordinator {
  /**
   * Determine which storage tier should be used
   * @param dataSize - Size of data in bytes
   * @param metadata - Content metadata
   * @param options - Optional routing preferences
   * @returns Routing decision
   */
  routeToTier(
    dataSize: number,
    metadata: ContentMetadata,
    options?: {
      forceTier?: StorageTier;
      allowFallback?: boolean;
    },
  ): Promise<StorageRoutingDecision>;

  /**
   * Save content with automatic tier routing
   * @param options - Save options
   * @returns Save result
   */
  saveContent(options: StorageSaveOptions): Promise<StorageSaveResult>;

  /**
   * Load content from appropriate tier
   * @param id - Content identifier
   * @param options - Optional load options
   * @returns Load result
   */
  loadContent(
    id: string,
    options?: Partial<StorageLoadOptions>,
  ): Promise<StorageLoadResult>;

  /**
   * Delete content from all tiers
   * @param id - Content identifier
   * @param options - Optional delete options
   * @returns Delete result
   */
  deleteContent(
    id: string,
    options?: Partial<StorageDeleteOptions>,
  ): Promise<StorageDeleteResult>;

  /**
   * Get comprehensive storage statistics
   * @returns Storage stats across all tiers
   */
  getStats(): Promise<StorageStats>;

  /**
   * Move content between storage tiers
   * @param id - Content identifier
   * @param targetTier - Target storage tier
   * @returns True if migration succeeded
   */
  migrateToTier(id: string, targetTier: StorageTier): Promise<boolean>;

  /**
   * Get the IndexedDB provider
   */
  getIndexedDBProvider(): IndexedDBProvider;

  /**
   * Get the filesystem provider (if available)
   */
  getFilesystemProvider(): FilesystemProvider | undefined;
}

/**
 * Chunk storage interface
 * Specialized interface for storing and retrieving content chunks
 * Used by vector search and RAG systems
 */
export interface ChunkStorage {
  /**
   * Save a content chunk with its embedding
   * @param chunk - Content chunk to save
   * @returns Chunk identifier
   */
  saveChunk(chunk: ContentChunk): Promise<string>;

  /**
   * Save multiple chunks in a batch operation
   * @param chunks - Array of chunks to save
   * @returns Array of chunk identifiers
   */
  saveChunksBatch(chunks: ContentChunk[]): Promise<string[]>;

  /**
   * Get a chunk by identifier
   * @param id - Chunk identifier
   * @returns Content chunk or null if not found
   */
  getChunk(id: string): Promise<ContentChunk | null>;

  /**
   * Get all chunks for a specific content item
   * @param contentId - Content identifier
   * @returns Array of chunks
   */
  getChunksByContent(contentId: string): Promise<ContentChunk[]>;

  /**
   * Get all chunks in a pocket
   * @param pocketId - Pocket identifier
   * @returns Array of chunks
   */
  getChunksByPocket(pocketId: string): Promise<ContentChunk[]>;

  /**
   * Delete all chunks for a content item
   * @param contentId - Content identifier
   * @returns Number of chunks deleted
   */
  deleteChunksByContent(contentId: string): Promise<number>;

  /**
   * Delete all chunks in a pocket
   * @param pocketId - Pocket identifier
   * @returns Number of chunks deleted
   */
  deleteChunksByPocket(pocketId: string): Promise<number>;

  /**
   * Get total number of stored chunks
   * @returns Chunk count
   */
  getChunkCount(): Promise<number>;
}

/**
 * Embedding storage interface
 * Manages storage and retrieval of vector embeddings
 */
export interface EmbeddingStorage {
  /**
   * Save an embedding for content
   * @param contentId - Content identifier
   * @param embedding - Vector embedding array
   * @param model - Model name that generated the embedding
   * @returns Embedding identifier
   */
  saveEmbedding(
    contentId: string,
    embedding: number[],
    model: string,
  ): Promise<string>;

  /**
   * Get embedding for content
   * @param contentId - Content identifier
   * @returns Embedding vector or null if not found
   */
  getEmbedding(contentId: string): Promise<number[] | null>;

  /**
   * Get embedding with metadata
   * @param contentId - Content identifier
   * @returns Embedding record or null if not found
   */
  getEmbeddingRecord(contentId: string): Promise<EmbeddingRecord | null>;

  /**
   * Delete embedding for content
   * @param contentId - Content identifier
   * @returns True if deleted
   */
  deleteEmbedding(contentId: string): Promise<boolean>;

  /**
   * Get all embeddings for a model
   * @param model - Model name
   * @returns Array of embedding records
   */
  getEmbeddingsByModel(model: string): Promise<EmbeddingRecord[]>;
}

/**
 * Embedding record with metadata
 */
export interface EmbeddingRecord {
  /**
   * Unique identifier
   */
  id: string;

  /**
   * Content identifier this embedding belongs to
   */
  contentId: string;

  /**
   * Vector embedding
   */
  vector: number[];

  /**
   * Model name that generated the embedding
   */
  model: string;

  /**
   * Timestamp when created
   */
  createdAt: number;

  /**
   * Vector dimension
   */
  dimension?: number;
}
