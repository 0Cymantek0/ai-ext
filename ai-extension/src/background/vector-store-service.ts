/**
 * Vector Store Service
 *
 * Provides high-level operations for storing and retrieving vector chunks.
 * Wraps IndexedDB operations with business logic and error handling.
 *
 * Requirements: 7.2 (Vector storage and retrieval)
 */

import { logger } from "./monitoring.js";
import { indexedDBManager, type StoredChunk } from "./indexeddb-manager.js";
import type { VectorChunk, ChunkMetadata } from "./vector-chunk-types.js";

export class VectorStoreService {
  /**
   * Store a single chunk with its embedding
   */
  async storeChunk(
    id: string,
    text: string,
    embedding: number[],
    metadata: ChunkMetadata,
  ): Promise<void> {
    const chunk: Omit<StoredChunk, "createdAt"> = {
      id,
      contentId: metadata.contentId,
      pocketId: metadata.pocketId,
      text,
      embedding,
      metadata,
    };

    await indexedDBManager.saveChunk(chunk);
  }

  /**
   * Store multiple chunks in a batch (more efficient)
   */
  async storeChunksBatch(chunks: VectorChunk[]): Promise<void> {
    const storedChunks: Omit<StoredChunk, "createdAt">[] = chunks.map(
      (chunk) => ({
        id: chunk.id,
        contentId: chunk.metadata.contentId,
        pocketId: chunk.metadata.pocketId,
        text: chunk.text,
        embedding: chunk.embedding,
        metadata: chunk.metadata,
      }),
    );

    await indexedDBManager.saveChunksBatch(storedChunks);

    logger.info("VectorStoreService", "Batch stored", {
      count: chunks.length,
      pocketId: chunks[0]?.metadata.pocketId,
    });
  }

  /**
   * Get all chunks for a specific pocket
   */
  async getChunksByPocket(pocketId: string): Promise<VectorChunk[]> {
    const storedChunks = await indexedDBManager.getChunksByPocket(pocketId);

    return storedChunks.map((chunk) => ({
      id: chunk.id,
      text: chunk.text,
      embedding: chunk.embedding,
      metadata: chunk.metadata,
    }));
  }

  /**
   * Get all chunks for a specific content item
   */
  async getChunksByContent(contentId: string): Promise<VectorChunk[]> {
    const storedChunks = await indexedDBManager.getChunksByContent(contentId);

    return storedChunks.map((chunk) => ({
      id: chunk.id,
      text: chunk.text,
      embedding: chunk.embedding,
      metadata: chunk.metadata,
    }));
  }

  /**
   * Delete all chunks for a content item (for updates/deletes)
   */
  async deleteChunksByContent(contentId: string): Promise<void> {
    await indexedDBManager.deleteChunksByContent(contentId);

    logger.info("VectorStoreService", "Chunks deleted", { contentId });
  }

  /**
   * Delete all chunks for a pocket
   */
  async deleteChunksByPocket(pocketId: string): Promise<void> {
    await indexedDBManager.deleteChunksByPocket(pocketId);

    logger.info("VectorStoreService", "Pocket chunks deleted", { pocketId });
  }

  /**
   * Get all chunks (for debugging/migration)
   */
  async getAllChunks(): Promise<VectorChunk[]> {
    const storedChunks = await indexedDBManager.getAllChunks();

    return storedChunks.map((chunk) => ({
      id: chunk.id,
      text: chunk.text,
      embedding: chunk.embedding,
      metadata: chunk.metadata,
    }));
  }

  /**
   * Check if content has been indexed
   */
  async isContentIndexed(contentId: string): Promise<boolean> {
    const chunks = await indexedDBManager.getChunksByContent(contentId);
    return chunks.length > 0;
  }

  /**
   * Get chunk count for a pocket
   */
  async getChunkCount(pocketId: string): Promise<number> {
    const chunks = await indexedDBManager.getChunksByPocket(pocketId);
    return chunks.length;
  }
}

export const vectorStoreService = new VectorStoreService();
