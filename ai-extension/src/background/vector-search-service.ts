/**
 * Vector Search Service
 * Provides semantic search capabilities using embeddings and cosine similarity
 * Requirements: 7.2, 7.3
 */

import { logger } from "./monitoring.js";
import { hybridAIEngine } from "./hybrid-ai-engine.js";
import {
  indexedDBManager,
  type Pocket,
  type CapturedContent,
  type Embedding,
} from "./indexeddb-manager.js";

export interface SearchResult<T> {
  item: T;
  relevanceScore: number;
  matchedFields?: string[];
}

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
      // Use hybrid AI engine to generate embedding
      const embedding = await hybridAIEngine.generateEmbedding(text);
      
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
    query: string
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
        tag.toLowerCase().includes(lowerQuery)
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
    query: string
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
    limit: number = 10
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
          const similarity = this.cosineSimilarity(queryEmbedding, pocketEmbedding);
          
          if (similarity > 0.3) { // Threshold for relevance
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
          { error: embeddingError }
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
    limit: number = 20
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
          indexedDBManager.getContentByPocket(p.id)
        );
        const contentArrays = await Promise.all(contentPromises);
        contents = contentArrays.flat();
      }

      if (contents.length === 0) {
        return [];
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
              contentText.slice(0, 1000) // Limit text length
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
            contentEmbedding
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
          { error: embeddingError }
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
}

export const vectorSearchService = new VectorSearchService();
