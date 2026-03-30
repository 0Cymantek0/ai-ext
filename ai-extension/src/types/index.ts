/**
 * Type Definition Barrel Export
 *
 * Centralized export for all shared type definitions in the AI Pocket extension.
 * These types form the contracts for storage and search modules introduced in Phase 2.
 *
 * Usage:
 * ```typescript
 * import type {
 *   Content,
 *   ContentMetadata,
 *   StorageProvider,
 *   SearchEngine
 * } from '@/types';
 * ```
 *
 * Note: These types coexist with legacy types in src/background/indexeddb-manager.ts.
 * When importing, prefer these types for new code while maintaining compatibility
 * with existing code that uses the legacy types.
 */

// Content types
export type {
  Content,
  ContentMetadata,
  ContentChunk,
  ChunkMetadata,
  ContentUpdate,
  ContentFilters,
  ContentStorageReference,
  FileArchiveDescriptor,
} from "./content.js";

export { ContentType, ProcessingStatus } from "./content.js";

export type { StorageTier, ArchiveCompression } from "./content.js";

// Storage interfaces
export type {
  StorageQuota,
  StorageStats,
  StorageRecommendation,
  StorageRecommendationLevel,
  StorageRoutingDecision,
  StorageSaveOptions,
  StorageSaveResult,
  StorageLoadOptions,
  StorageLoadResult,
  StorageDeleteOptions,
  StorageDeleteResult,
  StorageError,
  StorageProvider,
  IndexedDBProvider,
  FilesystemProvider,
  TieredStorageCoordinator,
  ChunkStorage,
  EmbeddingStorage,
  EmbeddingRecord,
} from "./storage-interfaces.js";

export { StorageErrorType } from "./storage-interfaces.js";

// Search interfaces
export type {
  SearchResult,
  ContentSearchOptions,
  ChunkSearchOptions,
  ChunkSearchResult,
  ChunkMatchType,
  EmbeddingOptions,
  EmbeddingRequest,
  EmbeddingResponse,
  EmbeddingGenerator,
  VectorStore,
  SearchEngine,
  SimilarityOptions,
  SimilarityResult,
  VectorSimilaritySearch,
} from "./search-interfaces.js";
