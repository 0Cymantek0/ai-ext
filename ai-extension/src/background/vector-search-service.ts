/**
 * Vector Search Service
 * Provides semantic search capabilities using embeddings and cosine similarity
 * Requirements: 7.2, 7.3
 */

import { logger } from "./monitoring.js";
import { embeddingEngine } from "./embedding-engine.js";
import { vectorStoreService } from "./vector-store-service.js";
import {
  indexedDBManager,
  type Pocket,
  type CapturedContent,
  type Embedding,
} from "./indexeddb-manager.js";
import type {
  VectorChunk,
  ChunkSearchResult,
  ChunkSearchOptions,
} from "./vector-chunk-types.js";
import type { SearchResult } from "../types/search-interfaces.js";

export class VectorSearchService {
  private embeddingCache = new Map<string, number[]>();

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length) {
      throw new Error("Vectors must have the same length");
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      const a = vecA[i]!;
      const b = vecB[i]!;
      dotProduct += a * b;
      normA += a * a;
      normB += b * b;
    }

    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (normA * normB);
  }

  /**
   * Generate embedding for a text query
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    // Check cache first
    if (this.embeddingCache.has(text)) {
      return this.embeddingCache.get(text)!;
    }

    try {
      // Use embedding engine (Nano-first approach)
      const embedding = await embeddingEngine.generateEmbedding(text);

      // Cache the result
      this.embeddingCache.set(text, embedding);

      // Limit cache size
      if (this.embeddingCache.size > 100) {
        const firstKey = this.embeddingCache.keys().next().value;
        this.embeddingCache.delete(firstKey);
      }

      return embedding;
    } catch (error) {
      logger.error("VectorSearchService", "Failed to generate embedding", {
        error,
        textLength: text.length,
      });
      throw error;
    }
  }

  /**
   * Perform keyword-based fallback search for pockets
   */
  private keywordSearchPockets(
    pockets: Pocket[],
    query: string,
  ): SearchResult<Pocket>[] {
    const lowerQuery = query.toLowerCase();
    const results: SearchResult<Pocket>[] = [];

    for (const pocket of pockets) {
      const matchedFields: string[] = [];
      let score = 0;

      // Check name (highest weight)
      if (pocket.name.toLowerCase().includes(lowerQuery)) {
        score += 0.5;
        matchedFields.push("name");
      }

      // Check description
      if (pocket.description.toLowerCase().includes(lowerQuery)) {
        score += 0.3;
        matchedFields.push("description");
      }

      // Check tags
      const matchingTags = pocket.tags.filter((tag) =>
        tag.toLowerCase().includes(lowerQuery),
      );
      if (matchingTags.length > 0) {
        score += 0.2 * (matchingTags.length / pocket.tags.length);
        matchedFields.push("tags");
      }

      if (score > 0) {
        results.push({
          item: pocket,
          relevanceScore: score,
          matchedFields,
        });
      }
    }

    return results.sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  /**
   * Perform keyword-based fallback search for content
   */
  private keywordSearchContent(
    contents: CapturedContent[],
    query: string,
  ): SearchResult<CapturedContent>[] {
    const lowerQuery = query.toLowerCase();
    const results: SearchResult<CapturedContent>[] = [];

    for (const content of contents) {
      const matchedFields: string[] = [];
      let score = 0;

      // Check title
      if (content.metadata.title?.toLowerCase().includes(lowerQuery)) {
        score += 0.4;
        matchedFields.push("title");
      }

      // Check content text
      if (typeof content.content === "string") {
        if (content.content.toLowerCase().includes(lowerQuery)) {
          score += 0.4;
          matchedFields.push("content");
        }
      }

      // Check source URL (domain)
      if (content.sourceUrl?.toLowerCase().includes(lowerQuery)) {
        score += 0.1;
        matchedFields.push("sourceUrl");
      }

      const matchingTags = (content.metadata.tags || []).filter((tag) =>
        tag.toLowerCase().includes(lowerQuery),
      );
      if (matchingTags.length > 0) {
        score += 0.2;
        matchedFields.push("tags");
      }

      // Check type
      if (content.type.toLowerCase().includes(lowerQuery)) {
        score += 0.1;
        matchedFields.push("type");
      }

      if (score > 0) {
        results.push({
          item: content,
          relevanceScore: score,
          matchedFields,
        });
      }
    }

    return results.sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  /**
   * Search pockets using vector similarity
   */
  async searchPockets(
    query: string,
    limit: number = 10,
  ): Promise<SearchResult<Pocket>[]> {
    try {
      logger.info("VectorSearchService", "Searching pockets", { query, limit });

      // Get all pockets
      const pockets = await indexedDBManager.listPockets();

      if (pockets.length === 0) {
        return [];
      }

      // Try vector search first
      try {
        const queryEmbedding = await this.generateEmbedding(query);
        const results: SearchResult<Pocket>[] = [];

        for (const pocket of pockets) {
          // Create searchable text from pocket metadata
          const searchableText = `${pocket.name} ${pocket.description} ${pocket.tags.join(" ")}`;

          // Generate or retrieve embedding for pocket
          const pocketEmbedding = await this.generateEmbedding(searchableText);

          // Calculate similarity
          const similarity = this.cosineSimilarity(
            queryEmbedding,
            pocketEmbedding,
          );

          if (similarity > 0.3) {
            // Threshold for relevance
            results.push({
              item: pocket,
              relevanceScore: similarity,
              matchedFields: ["semantic"],
            });
          }
        }

        // Sort by relevance and limit
        const sortedResults = results
          .sort((a, b) => b.relevanceScore - a.relevanceScore)
          .slice(0, limit);

        logger.info("VectorSearchService", "Pocket search completed", {
          query,
          resultsCount: sortedResults.length,
        });

        return sortedResults;
      } catch (embeddingError) {
        logger.warn(
          "VectorSearchService",
          "Vector search failed, falling back to keyword search",
          { error: embeddingError },
        );

        // Fallback to keyword search
        return this.keywordSearchPockets(pockets, query).slice(0, limit);
      }
    } catch (error) {
      logger.error("VectorSearchService", "Pocket search failed", { error });
      throw error;
    }
  }

  /**
   * Search content within a pocket or across all pockets
   */
  async searchContent(
    query: string,
    pocketId?: string,
    limit: number = 20,
  ): Promise<SearchResult<CapturedContent>[]> {
    try {
      logger.info("VectorSearchService", "Searching content", {
        query,
        pocketId,
        limit,
      });

      // Get content to search
      let contents: CapturedContent[];
      if (pocketId) {
        contents = await indexedDBManager.getContentByPocket(pocketId);
      } else {
        // Get all pockets and their content
        const pockets = await indexedDBManager.listPockets();
        const contentPromises = pockets.map((p) =>
          indexedDBManager.getContentByPocket(p.id),
        );
        const contentArrays = await Promise.all(contentPromises);
        contents = contentArrays.flat();
      }

      if (contents.length === 0) {
        return [];
      }

      const keywordResults = this.keywordSearchContent(contents, query).slice(0, limit);
      if (keywordResults.length > 0) {
        logger.info("VectorSearchService", "Content search satisfied by keyword results", {
          query,
          resultsCount: keywordResults.length,
        });
        return keywordResults;
      }

      // Try vector search first
      try {
        const queryEmbedding = await this.generateEmbedding(query);
        const results: SearchResult<CapturedContent>[] = [];

        // Get all embeddings
        const allEmbeddings = await indexedDBManager.getAllEmbeddings();
        const embeddingMap = new Map<string, Embedding>();
        for (const emb of allEmbeddings) {
          embeddingMap.set(emb.contentId, emb);
        }

        for (const content of contents) {
          let contentEmbedding: number[];

          // Try to get existing embedding
          const existingEmbedding = embeddingMap.get(content.id);
          if (existingEmbedding) {
            contentEmbedding = existingEmbedding.vector;
          } else {
            // Generate embedding for content
            const contentText =
              typeof content.content === "string"
                ? content.content
                : content.metadata.title || "";

            if (!contentText.trim()) {
              continue;
            }

            contentEmbedding = await this.generateEmbedding(
              contentText.slice(0, 1000), // Limit text length
            );

            // Save embedding for future use
            await indexedDBManager.saveEmbedding({
              contentId: content.id,
              vector: contentEmbedding,
              model: "gemini",
            });
          }

          // Calculate similarity
          const similarity = this.cosineSimilarity(
            queryEmbedding,
            contentEmbedding,
          );

          if (similarity > 0.3) {
            results.push({
              item: content,
              relevanceScore: similarity,
              matchedFields: ["semantic"],
            });
          }
        }

        // Sort by relevance and limit
        const sortedResults = results
          .sort((a, b) => b.relevanceScore - a.relevanceScore)
          .slice(0, limit);

        logger.info("VectorSearchService", "Content search completed", {
          query,
          resultsCount: sortedResults.length,
        });

        return sortedResults;
      } catch (embeddingError) {
        logger.warn(
          "VectorSearchService",
          "Vector search failed, falling back to keyword search",
          { error: embeddingError },
        );

        // Fallback to keyword search
        return this.keywordSearchContent(contents, query).slice(0, limit);
      }
    } catch (error) {
      logger.error("VectorSearchService", "Content search failed", { error });
      throw error;
    }
  }

  /**
   * Clear the embedding cache
   */
  clearCache(): void {
    this.embeddingCache.clear();
    logger.info("VectorSearchService", "Cache cleared");
  }

  /**
   * Search for relevant chunks using vector similarity
   * This is the primary method for chunk-level RAG
   * NOW USES PRE-COMPUTED STORED CHUNKS (FIXED PERFORMANCE ISSUE)
   */
  async searchChunks(
    query: string,
    options: ChunkSearchOptions = {},
  ): Promise<ChunkSearchResult[]> {
    const {
      pocketId,
      topK = 5,
      minRelevance = 0.3,
      maxTokens = 1500,
    } = options;

    try {
      logger.info("VectorSearchService", "Searching chunks", {
        query,
        pocketId: pocketId || "all",
        topK,
        minRelevance,
        maxTokens,
      });

      // Get pre-computed chunks from storage
      let storedChunks: VectorChunk[];
      if (pocketId) {
        storedChunks = await vectorStoreService.getChunksByPocket(pocketId);
      } else {
        storedChunks = await vectorStoreService.getAllChunks();
      }

      if (storedChunks.length === 0) {
        logger.info("VectorSearchService", "No indexed chunks found", {
          pocketId: pocketId || "all",
        });
        return [];
      }

      logger.info("VectorSearchService", "Retrieved stored chunks", {
        totalChunks: storedChunks.length,
        pocketId: pocketId || "all",
      });

      // Generate query embedding
      const queryEmbedding = await this.generateEmbedding(query);

      // Calculate similarity for each chunk
      const results: ChunkSearchResult[] = [];
      let dimensionMismatchCount = 0;

      for (const chunk of storedChunks) {
        // Skip chunks with mismatched embedding dimensions
        if (chunk.embedding.length !== queryEmbedding.length) {
          dimensionMismatchCount++;
          logger.warn(
            "VectorSearchService",
            "Skipping chunk with mismatched embedding dimension",
            {
              chunkId: chunk.id,
              chunkDim: chunk.embedding.length,
              queryDim: queryEmbedding.length,
            },
          );
          continue;
        }

        const similarity = this.cosineSimilarity(
          queryEmbedding,
          chunk.embedding,
        );

        if (similarity >= minRelevance) {
          results.push({
            chunk: { ...chunk, relevanceScore: similarity },
            relevanceScore: similarity,
            matchType: "semantic",
          });
        }
      }

      if (dimensionMismatchCount > 0) {
        logger.warn("VectorSearchService", "Dimension mismatch detected", {
          skippedChunks: dimensionMismatchCount,
          totalChunks: storedChunks.length,
          queryDim: queryEmbedding.length,
          message:
            "Some chunks were indexed with a different embedding model. Consider re-indexing.",
        });
      }

      // Sort by relevance (descending)
      results.sort((a, b) => b.relevanceScore - a.relevanceScore);

      // Apply topK limit
      const topResults = results.slice(0, topK);

      // Apply token budget if specified
      if (maxTokens) {
        const budgetedResults: ChunkSearchResult[] = [];
        let tokensUsed = 0;

        for (const result of topResults) {
          // Estimate tokens (1 token ≈ 4 chars + metadata overhead)
          const chunkTokens = Math.ceil(result.chunk.text.length / 4) + 50;

          if (tokensUsed + chunkTokens <= maxTokens) {
            budgetedResults.push(result);
            tokensUsed += chunkTokens;
          } else {
            logger.info("VectorSearchService", "Reached token budget", {
              tokensUsed,
              maxTokens,
              chunksIncluded: budgetedResults.length,
              chunksSkipped: topResults.length - budgetedResults.length,
            });
            break;
          }
        }

        logger.info("VectorSearchService", "Chunk search completed", {
          query,
          totalChunks: storedChunks.length,
          matchedChunks: results.length,
          returnedChunks: budgetedResults.length,
          tokensUsed,
        });

        return budgetedResults;
      }

      logger.info("VectorSearchService", "Chunk search completed", {
        query,
        totalChunks: storedChunks.length,
        matchedChunks: results.length,
        returnedChunks: topResults.length,
      });

      return topResults;
    } catch (error) {
      logger.error("VectorSearchService", "Chunk search failed", { error });

      // Graceful fallback: return empty results
      return [];
    }
  }
}

export const vectorSearchService = new VectorSearchService();
