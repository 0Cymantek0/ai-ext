/**
 * Vector Chunk Types
 *
 * Defines chunk-level data structures for RAG retrieval
 * Requirements: 7.2 (Vector search with chunk-level granularity)
 */

import type { ContentType } from "./indexeddb-manager.js";

/**
 * Metadata for a text chunk
 */
export interface ChunkMetadata {
  // Source identification
  contentId: string; // Original content ID
  pocketId: string; // Pocket this belongs to
  sourceType: ContentType; // Type of source content
  sourceUrl: string; // URL where content was captured

  // Chunk positioning
  chunkIndex: number; // Position in content (0, 1, 2...)
  totalChunks: number; // Total chunks from this content
  startOffset: number; // Character offset in original content
  endOffset: number; // End character offset

  // Timestamps
  capturedAt: number; // When original content was captured
  chunkedAt: number; // When chunk was created

  // Content metadata
  title?: string | undefined; // Title of source content
  category?: string | undefined; // Category/tag

  // Preview
  textPreview: string; // First 100 chars for display
}

/**
 * A vector chunk with embedding and metadata
 * This is the primary unit for RAG retrieval
 */
export interface VectorChunk {
  id: string; // Unique chunk ID
  text: string; // Full chunk text
  embedding: number[]; // Vector embedding
  metadata: ChunkMetadata; // Rich metadata
  relevanceScore?: number; // Similarity score (set during search)
}

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
 */
export interface StoredChunk {
  id: string;
  contentId: string;
  pocketId: string;
  text: string;
  embedding: number[];
  metadata: ChunkMetadata;
  createdAt: number;
}
