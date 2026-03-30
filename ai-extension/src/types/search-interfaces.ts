/**
 * Search Interface Definitions
 *
 * Defines contracts for search services, embedding generation, and vector search.
 * These interfaces provide a standardized API for search implementations across
 * the extension, ensuring compatibility between storage, search, and AI features.
 */

import type {
  ContentChunk,
  Content,
  ContentMetadata,
  ContentFilters,
} from "./content.js";

/**
 * Search result wrapper for generic items
 */
export interface SearchResult<T> {
  /**
   * The matched item
   */
  item: T;

  /**
   * Relevance score between 0 and 1
   */
  relevanceScore: number;

  /**
   * Optional array describing which fields contributed to the match
   */
  matchedFields?: string[];
}

/**
 * Search options for content-level search
 */
export interface ContentSearchOptions {
  /**
   * Pocket identifier to scope the search to
   */
  pocketId?: string;

  /**
   * Maximum number of results to return
   */
  limit?: number;

  /**
   * Content filters applied before scoring
   */
  filters?: ContentFilters;

  /**
   * Whether to fallback to keyword search when embedding fails
   */
  allowKeywordFallback?: boolean;

  /**
   * Minimum relevance score required to include result
   */
  minRelevance?: number;
}

/**
 * Chunk search options for RAG retrieval
 */
export interface ChunkSearchOptions {
  /**
   * Pocket identifier to scope the search to
   */
  pocketId?: string;

  /**
   * Number of top results to return
   */
  topK?: number;

  /**
   * Minimum relevance score required
   */
  minRelevance?: number;

  /**
   * Maximum token budget for returned chunks
   */
  maxTokens?: number;

  /**
   * Whether to include keyword matches alongside semantic ones
   */
  hybridMode?: boolean;
}

/**
 * Search strategy applied
 */
export type ChunkMatchType = "semantic" | "keyword" | "hybrid";

/**
 * Chunk search result
 */
export interface ChunkSearchResult {
  /**
   * Matched content chunk
   */
  chunk: ContentChunk;

  /**
   * Relevance score between 0 and 1
   */
  relevanceScore: number;

  /**
   * Match strategy used
   */
  matchType: ChunkMatchType;
}

/**
 * Embedding generation options
 */
export interface EmbeddingOptions {
  /**
   * Prefer using local on-device model when available
   */
  preferLocal?: boolean;

  /**
   * Batch size for batched operations
   */
  batchSize?: number;

  /**
   * Maximum retries for transient failures
   */
  maxRetries?: number;

  /**
   * Optional hints about expected content type (may affect preprocessing)
   */
  contentType?: string;
}

/**
 * Embedding generation request
 */
export interface EmbeddingRequest {
  /**
   * Unique identifier for correlating responses
   */
  id: string;

  /**
   * Plain text to generate embedding for
   */
  text: string;

  /**
   * Optional metadata for downstream use
   */
  metadata?: Record<string, unknown>;
}

/**
 * Embedding generation response
 */
export interface EmbeddingResponse {
  /**
   * Identifier from the request
   */
  id: string;

  /**
   * Generated embedding vector
   */
  vector: number[];

  /**
   * Model name used (e.g., "gemini-nano-text-embedding")
   */
  model: string;

  /**
   * Optional metadata about the generation process
   */
  metadata?: Record<string, unknown>;
}

/**
 * Embedding generator interface
 */
export interface EmbeddingGenerator {
  /**
   * Dimension of generated embeddings
   */
  readonly dimension: number;

  /**
   * Preferred model identifier
   */
  readonly model: string;

  /**
   * Generate embedding for text
   * @param text - Input text
   * @param options - Optional generation options
   * @returns Embedding vector
   */
  generateEmbedding(
    text: string,
    options?: EmbeddingOptions,
  ): Promise<number[]>;

  /**
   * Generate embeddings for multiple texts
   * @param requests - Array of embedding requests
   * @param options - Optional generation options
   * @returns Array of embedding responses
   */
  generateEmbeddings(
    requests: EmbeddingRequest[],
    options?: EmbeddingOptions,
  ): Promise<EmbeddingResponse[]>;

  /**
   * Clear any internal caches
   */
  clearCache?(): void;
}

/**
 * Vector store interface for storing embeddings
 */
export interface VectorStore {
  /**
   * Store or update embeddings for content chunks
   * @param chunks - Array of content chunks to index
   */
  upsertChunks(chunks: ContentChunk[]): Promise<void>;

  /**
   * Remove embeddings for content chunks
   * @param contentId - Content identifier
   */
  deleteChunks(contentId: string): Promise<void>;

  /**
   * Retrieve all stored chunks
   * @returns Array of content chunks
   */
  getAllChunks(): Promise<ContentChunk[]>;

  /**
   * Retrieve chunks scoped to a pocket
   * @param pocketId - Pocket identifier
   */
  getChunksByPocket(pocketId: string): Promise<ContentChunk[]>;
}

/**
 * Hybrid search engine interface combining semantic and keyword search
 */
export interface SearchEngine {
  /**
   * Search pockets by keyword and semantic relevance
   * @param query - Search query string
   * @param options - Search options
   * @returns Array of pocket search results
   */
  searchPockets(
    query: string,
    options?: ContentSearchOptions,
  ): Promise<SearchResult<ContentMetadata>[]>;

  /**
   * Search content records
   * @param query - Search query string
   * @param options - Search options
   * @returns Array of content search results
   */
  searchContent(
    query: string,
    options?: ContentSearchOptions,
  ): Promise<SearchResult<Content>[]>;

  /**
   * Search chunks for RAG retrieval
   * @param query - Search query string
   * @param options - Chunk search options
   * @returns Array of chunk search results
   */
  searchChunks(
    query: string,
    options?: ChunkSearchOptions,
  ): Promise<ChunkSearchResult[]>;

  /**
   * Clear internal caches
   */
  clearCache?(): void;
}

/**
 * Vector similarity options
 */
export interface SimilarityOptions {
  /**
   * Similarity algorithm (cosine, dot-product, etc.)
   */
  algorithm?: "cosine" | "dot-product" | "euclidean";

  /**
   * Minimum similarity threshold (0-1)
   */
  minSimilarity?: number;

  /**
   * Maximum number of results to return
   */
  topK?: number;
}

/**
 * Similarity search result for embeddings
 */
export interface SimilarityResult {
  /**
   * Identifier of the matching vector (content or chunk ID)
   */
  id: string;

  /**
   * Similarity score (0-1)
   */
  score: number;

  /**
   * Optional reference to the chunk when available
   */
  chunk?: ContentChunk;
}

/**
 * Vector similarity search interface
 */
export interface VectorSimilaritySearch {
  /**
   * Compare query embedding against stored embeddings
   * @param embedding - Query embedding vector
   * @param options - Similarity options
   * @returns Array of similarity search results
   */
  searchSimilar(
    embedding: number[],
    options?: SimilarityOptions,
  ): Promise<SimilarityResult[]>;

  /**
   * Get the embedding dimension used by the store
   */
  getDimension(): number;
}
