/**
 * Vector Chunk Types
 *
 * Defines chunk-level data structures for RAG retrieval
 * Requirements: 7.2 (Vector search with chunk-level granularity)
 */

import type {
  ChunkMetadata as SharedChunkMetadata,
  ContentChunk,
} from "../types/content.js";

/**
 * Metadata for a text chunk
 * Re-exported from shared content types for backward compatibility.
 */
export type ChunkMetadata = SharedChunkMetadata;

/**
 * A vector chunk with embedding and metadata
 * This is the primary unit for RAG retrieval
 */
export type VectorChunk = ContentChunk;

/**
 * Search result containing a chunk
 */
export interface ChunkSearchResult {
  chunk: VectorChunk;
  relevanceScore: number;
  matchType: "semantic" | "keyword" | "hybrid";
}

/**
 * Options for chunk-based search
 */
export interface ChunkSearchOptions {
  pocketId?: string | undefined; // Scope to specific pocket
  topK?: number | undefined; // Number of chunks to return (default: 5)
  minRelevance?: number | undefined; // Minimum relevance threshold (default: 0.3)
  maxTokens?: number | undefined; // Maximum tokens to return (default: 1500)
}

/**
 * Chunk storage record in IndexedDB
 * Alias maintained for legacy imports.
 */
export type StoredChunk = ContentChunk;
