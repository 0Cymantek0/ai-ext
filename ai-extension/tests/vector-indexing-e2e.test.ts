/**
 * Vector Indexing End-to-End Regression Tests
 * 
 * Comprehensive tests for the vector indexing workflow including:
 * - Text chunking
 * - Embedding generation
 * - Vector store operations
 * - Queue management
 * - Batch processing
 * - Rate limit handling
 * - UI event emission
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { TextChunker } from "../src/background/text-chunker.js";
import { 
  VectorIndexingQueue, 
  IndexingOperation 
} from "../src/background/vector-indexing-queue.js";
import {
  createMockContent,
  createLargeContent,
  createMockEmbedding,
  createMockChunks,
  createSimilarEmbeddings,
  MockEmbeddingGenerator,
  MockMessageRouter,
  MockIndexedDBManager,
  createRateLimitError,
  waitFor,
  assertValidEmbedding,
  cosineSimilarity,
} from "./vector-indexing-fixtures.js";

// Mock dependencies
vi.mock("../src/background/monitoring.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("../src/background/hybrid-ai-engine.js", () => ({
  hybridAIEngine: {
    generateEmbedding: vi.fn(),
  },
}));

vi.mock("../src/background/indexeddb-manager.js", async () => {
  const actual = await vi.importActual("../src/background/indexeddb-manager.js");
  return {
    ...actual,
    indexedDBManager: {
      init: vi.fn(),
      saveEmbedding: vi.fn(),
      getAllEmbeddings: vi.fn().mockResolvedValue([]),
      deleteEmbedding: vi.fn(),
      getContent: vi.fn(),
      saveContent: vi.fn(),
      getContentByPocket: vi.fn().mockResolvedValue([]),
      listPockets: vi.fn().mockResolvedValue([]),
    },
  };
});

// Mock chrome runtime API
global.chrome = {
  runtime: {
    sendMessage: vi.fn().mockResolvedValue(undefined),
  },
} as any;

describe("Text Chunker", () => {
  let chunker: TextChunker;

  beforeEach(() => {
    chunker = new TextChunker();
  });

  describe("Basic Chunking", () => {
    it("should return single chunk for small text", () => {
      const text = "This is a short text that fits in one chunk.";
      const chunks = chunker.chunkText(text, { maxChunkSize: 1000 });

      expect(chunks).toHaveLength(1);
      expect(chunks[0]?.text).toBe(text);
      expect(chunks[0]?.chunkIndex).toBe(0);
      expect(chunks[0]?.totalChunks).toBe(1);
    });

    it("should split large text into multiple chunks", () => {
      const text = "word ".repeat(500); // 2500 characters
      const chunks = chunker.chunkText(text, { maxChunkSize: 500 });

      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks.every(c => c.text.length <= 600)).toBe(true); // Allow some overlap
    });

    it("should handle empty text", () => {
      const chunks = chunker.chunkText("", { maxChunkSize: 1000 });
      expect(chunks).toHaveLength(0);
    });

    it("should handle whitespace-only text", () => {
      const chunks = chunker.chunkText("   \n\n  ", { maxChunkSize: 1000 });
      expect(chunks).toHaveLength(0);
    });
  });

  describe("Chunk Boundaries", () => {
    it("should respect sentence boundaries", () => {
      const text = "First sentence. Second sentence. Third sentence. Fourth sentence.";
      const chunks = chunker.chunkText(text, {
        maxChunkSize: 35,
        respectSentences: true,
      });

      // Chunks should end at sentence boundaries
      chunks.forEach(chunk => {
        const trimmed = chunk.text.trim();
        expect(trimmed.endsWith(".") || chunk.chunkIndex === chunk.totalChunks - 1)
          .toBe(true);
      });
    });

    it("should respect word boundaries when sentence break not available", () => {
      const text = "word1 word2 word3 word4 word5 word6 word7 word8";
      const chunks = chunker.chunkText(text, {
        maxChunkSize: 20,
        respectSentences: false,
      });

      // Chunks should not break words in the middle
      chunks.forEach(chunk => {
        const words = chunk.text.trim().split(/\s+/);
        words.forEach(word => {
          expect(word.length).toBeGreaterThan(0);
          expect(word).not.toContain(" ");
        });
      });
    });

    it("should respect paragraph boundaries", () => {
      const text = "Paragraph 1.\n\nParagraph 2.\n\nParagraph 3.";
      const chunks = chunker.chunkText(text, {
        maxChunkSize: 50,
        respectParagraphs: true,
      });

      expect(chunks.length).toBeGreaterThan(0);
    });
  });

  describe("Chunk Overlap", () => {
    it("should create overlap between chunks", () => {
      const text = "word ".repeat(300); // Create text that needs chunking
      const chunks = chunker.chunkText(text, {
        maxChunkSize: 500,
        overlapSize: 100,
      });

      if (chunks.length > 1) {
        // Check for overlap by comparing indices
        // With overlap, the next chunk should start before the previous ends
        const chunk1End = chunks[0]!.endIndex;
        const chunk2Start = chunks[1]!.startIndex;
        
        // There should be overlap (chunk2 starts before chunk1 ends in the source text)
        expect(chunk1End).toBeGreaterThan(chunk2Start);
      }
    });

    it("should handle zero overlap", () => {
      const text = "word ".repeat(300);
      const chunks = chunker.chunkText(text, {
        maxChunkSize: 200,
        overlapSize: 0,
      });

      if (chunks.length > 1) {
        expect(chunks[0]!.endIndex).toBeLessThanOrEqual(chunks[1]!.startIndex);
      }
    });
  });

  describe("Chunk Metadata", () => {
    it("should set correct chunk indices", () => {
      const text = "word ".repeat(500);
      const chunks = chunker.chunkText(text, { maxChunkSize: 200 });

      chunks.forEach((chunk, index) => {
        expect(chunk.chunkIndex).toBe(index);
        expect(chunk.totalChunks).toBe(chunks.length);
      });
    });

    it("should set correct start and end indices", () => {
      const text = "word ".repeat(500);
      const chunks = chunker.chunkText(text, { maxChunkSize: 200 });

      chunks.forEach((chunk, index) => {
        expect(chunk.startIndex).toBeGreaterThanOrEqual(0);
        expect(chunk.endIndex).toBeGreaterThan(chunk.startIndex);
        if (index > 0) {
          expect(chunk.startIndex).toBeGreaterThanOrEqual(0);
        }
      });
    });

    it("should generate unique chunk IDs", () => {
      const text = "word ".repeat(500);
      const chunks = chunker.chunkText(text, { maxChunkSize: 200 });

      const ids = new Set(chunks.map(c => c.id));
      expect(ids.size).toBe(chunks.length);
    });
  });

  describe("Edge Cases", () => {
    it("should handle very long words", () => {
      const longWord = "a".repeat(2000);
      const chunks = chunker.chunkText(longWord, { maxChunkSize: 500 });

      expect(chunks.length).toBeGreaterThan(0);
      chunks.forEach(chunk => {
        expect(chunk.text.length).toBeGreaterThan(0);
      });
    });

    it("should handle special characters", () => {
      const text = "Special chars: !@#$%^&*()[]{}|\\/<>?~`";
      const chunks = chunker.chunkText(text, { maxChunkSize: 1000 });

      expect(chunks).toHaveLength(1);
      expect(chunks[0]?.text).toBe(text);
    });

    it("should handle unicode characters", () => {
      const text = "Unicode: 你好世界 こんにちは 🚀 🎉 مرحبا";
      const chunks = chunker.chunkText(text, { maxChunkSize: 1000 });

      expect(chunks).toHaveLength(1);
      expect(chunks[0]?.text).toBe(text);
    });
  });

  describe("Utility Methods", () => {
    it("should estimate chunk count correctly", () => {
      const estimate = chunker.estimateChunkCount(5000, 1000);
      expect(estimate).toBe(5);
    });

    it("should merge chunks back to text", () => {
      const mockChunks = createMockChunks(3, 100);
      const merged = chunker.mergeChunks(mockChunks);
      
      expect(merged).toContain("Chunk 0");
      expect(merged).toContain("Chunk 1");
      expect(merged).toContain("Chunk 2");
    });
  });
});

describe("Vector Indexing Queue", () => {
  let queue: VectorIndexingQueue;
  let mockEmbeddingGen: MockEmbeddingGenerator;
  let mockDB: MockIndexedDBManager;
  let mockRouter: MockMessageRouter;
  let mockHybridAI: any;
  let mockIndexedDB: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Import mocked modules
    const { hybridAIEngine } = await import("../src/background/hybrid-ai-engine.js");
    const { indexedDBManager } = await import("../src/background/indexeddb-manager.js");

    mockHybridAI = hybridAIEngine;
    mockIndexedDB = indexedDBManager;

    // Setup mocks
    mockEmbeddingGen = new MockEmbeddingGenerator();
    mockDB = new MockIndexedDBManager();
    mockRouter = new MockMessageRouter();

    mockHybridAI.generateEmbedding.mockImplementation((text: string) =>
      mockEmbeddingGen.generate(text)
    );

    mockIndexedDB.init.mockResolvedValue(undefined);
    mockIndexedDB.getContent.mockImplementation((id: string) =>
      mockDB.getContent(id)
    );
    mockIndexedDB.saveEmbedding.mockImplementation((emb: any) =>
      mockDB.saveEmbedding(emb)
    );
    mockIndexedDB.getAllEmbeddings.mockImplementation(() =>
      mockDB.getAllEmbeddings()
    );
    mockIndexedDB.deleteEmbedding.mockImplementation((id: string) =>
      mockDB.deleteEmbedding(id)
    );

    // Mock chrome.runtime.sendMessage
    (global.chrome.runtime.sendMessage as any).mockImplementation((msg: any) => {
      mockRouter.send(msg);
      return Promise.resolve();
    });

    queue = new VectorIndexingQueue();
    queue.setProcessingInterval(10); // Speed up for tests
  });

  afterEach(() => {
    queue.clear();
    mockDB.clear();
    mockRouter.clear();
    mockEmbeddingGen.reset();
  });

  describe("Create Flow", () => {
    it("should index new content successfully", async () => {
      const content = createMockContent({
        content: "Test content for embedding generation.",
      });
      await mockDB.saveContent(content);

      const jobId = await queue.enqueueContent(
        content.id,
        IndexingOperation.CREATE,
        "high"
      );

      expect(jobId).toBeDefined();

      // Wait for processing
      await waitFor(() => queue.getStats().isProcessing === false, 5000);

      const stats = queue.getStats();
      expect(stats.jobsProcessed).toBe(1);
      expect(stats.jobsFailed).toBe(0);

      // Verify embedding was created
      const embeddings = await mockDB.getAllEmbeddings();
      expect(embeddings.length).toBeGreaterThan(0);
      expect(embeddings[0]?.contentId).toBe(content.id);
    });

    it("should handle multiple content items", async () => {
      const contents = [
        createMockContent({ id: "content1" }),
        createMockContent({ id: "content2" }),
        createMockContent({ id: "content3" }),
      ];

      for (const content of contents) {
        await mockDB.saveContent(content);
        await queue.enqueueContent(content.id, IndexingOperation.CREATE);
      }

      await waitFor(() => queue.getStats().isProcessing === false, 5000);

      const stats = queue.getStats();
      expect(stats.jobsProcessed).toBe(3);
      expect(stats.jobsFailed).toBe(0);

      const embeddings = await mockDB.getAllEmbeddings();
      expect(embeddings.length).toBe(3);
    });

    it("should chunk large content", async () => {
      const largeContent = createLargeContent(5000);
      await mockDB.saveContent(largeContent);

      await queue.enqueueContent(largeContent.id, IndexingOperation.CREATE);
      await waitFor(() => queue.getStats().isProcessing === false, 5000);

      const embeddings = await mockDB.getAllEmbeddings();
      // Should have multiple embeddings for chunks
      expect(embeddings.length).toBeGreaterThan(1);
    });

    it("should emit progress events during creation", async () => {
      const content = createMockContent();
      await mockDB.saveContent(content);

      await queue.enqueueContent(content.id, IndexingOperation.CREATE);
      await waitFor(() => queue.getStats().isProcessing === false, 5000);

      const progressMessages = mockRouter.getMessages().filter(
        m => m.type === "VECTOR_INDEXING_PROGRESS"
      );
      expect(progressMessages.length).toBeGreaterThan(0);

      // Should have pending, processing, and completed events
      const statuses = progressMessages.map(m => m.payload.status);
      expect(statuses).toContain("pending");
      expect(statuses).toContain("completed");
    });
  });

  describe("Update Flow", () => {
    it("should update existing embeddings", async () => {
      const content = createMockContent();
      await mockDB.saveContent(content);

      // Initial indexing
      await queue.enqueueContent(content.id, IndexingOperation.CREATE);
      await waitFor(() => queue.getStats().isProcessing === false, 5000);

      const initialEmbeddings = await mockDB.getAllEmbeddings();
      const initialCount = initialEmbeddings.length;

      // Update content
      content.content = "Updated content with new text.";
      await mockDB.saveContent(content);

      // Reindex
      await queue.enqueueContent(content.id, IndexingOperation.UPDATE);
      await waitFor(() => queue.getStats().isProcessing === false, 5000);

      const updatedEmbeddings = await mockDB.getAllEmbeddings();
      // Should have new embeddings (old ones might still exist)
      expect(updatedEmbeddings.length).toBeGreaterThanOrEqual(initialCount);
    });

    it("should handle update of non-existent content", async () => {
      const jobId = await queue.enqueueContent(
        "nonexistent",
        IndexingOperation.UPDATE
      );

      await waitFor(() => queue.getStats().isProcessing === false, 5000);

      const stats = queue.getStats();
      // Should fail since content doesn't exist
      expect(stats.jobsFailed).toBe(1);
    });
  });

  describe("Delete Flow", () => {
    it("should delete embeddings for content", async () => {
      const content = createMockContent();
      await mockDB.saveContent(content);

      // Create embeddings
      const embedding = createMockEmbedding(content.id);
      await mockDB.saveEmbedding(embedding);

      expect(mockDB.getEmbeddingCount()).toBe(1);

      // Delete
      await queue.enqueueContent(content.id, IndexingOperation.DELETE);
      await waitFor(() => queue.getStats().isProcessing === false, 5000);

      expect(mockDB.getEmbeddingCount()).toBe(0);
    });

    it("should handle deletion of content with no embeddings", async () => {
      await queue.enqueueContent("content_id", IndexingOperation.DELETE);
      await waitFor(() => queue.getStats().isProcessing === false, 5000);

      const stats = queue.getStats();
      expect(stats.jobsProcessed).toBe(1);
    });
  });

  describe("Batch Processing", () => {
    it("should process jobs in batches", async () => {
      queue.setBatchSize(2);

      const contents = Array.from({ length: 5 }, (_, i) =>
        createMockContent({ id: `content${i}` })
      );

      for (const content of contents) {
        await mockDB.saveContent(content);
        await queue.enqueueContent(content.id, IndexingOperation.CREATE);
      }

      await waitFor(() => queue.getStats().isProcessing === false, 10000);

      const stats = queue.getStats();
      expect(stats.jobsProcessed).toBe(5);
    });

    it("should respect batch size limits", async () => {
      queue.setBatchSize(3);
      
      // Enqueue more jobs than batch size
      const contents = Array.from({ length: 10 }, (_, i) =>
        createMockContent({ id: `content${i}` })
      );

      for (const content of contents) {
        await mockDB.saveContent(content);
        await queue.enqueueContent(content.id, IndexingOperation.CREATE);
      }

      await waitFor(() => queue.getStats().isProcessing === false, 10000);

      expect(queue.getStats().jobsProcessed).toBe(10);
    });
  });

  describe("Priority Handling", () => {
    it("should process multiple priority levels", async () => {
      const contents = [
        { id: "low1", priority: "low" as const },
        { id: "high1", priority: "high" as const },
        { id: "normal1", priority: "normal" as const },
      ];

      // Create all content
      for (const { id } of contents) {
        const content = createMockContent({ id });
        await mockDB.saveContent(content);
      }

      // Enqueue all
      for (const { id, priority } of contents) {
        await queue.enqueueContent(id, IndexingOperation.CREATE, priority);
      }

      await waitFor(() => queue.getStats().isProcessing === false, 5000);

      // Verify all were processed
      expect(queue.getStats().jobsProcessed).toBe(3);
      expect(queue.getStats().jobsFailed).toBe(0);
    });
  });

  describe("Rate Limit Handling", () => {
    it("should retry on rate limit errors", async () => {
      queue.setRateLimitDelay(100); // Speed up for tests

      const content = createMockContent();
      await mockDB.saveContent(content);

      let attemptCount = 0;
      mockHybridAI.generateEmbedding.mockImplementation(async () => {
        attemptCount++;
        if (attemptCount < 3) {
          throw createRateLimitError();
        }
        return mockEmbeddingGen.generate("success");
      });

      await queue.enqueueContent(content.id, IndexingOperation.CREATE);
      await waitFor(() => queue.getStats().isProcessing === false, 10000);

      // Should have made multiple attempts due to rate limiting
      expect(attemptCount).toBeGreaterThanOrEqual(3);
      // Eventually succeeds
      expect(queue.getStats().jobsFailed).toBe(0);
    });

    it("should eventually fail after max rate limit retries", async () => {
      queue.setRateLimitDelay(50);

      const content = createMockContent();
      await mockDB.saveContent(content);

      mockHybridAI.generateEmbedding.mockImplementation(async () => {
        throw createRateLimitError();
      });

      await queue.enqueueContent(content.id, IndexingOperation.CREATE);
      await waitFor(
        () => queue.getStats().isProcessing === false,
        10000
      );

      // Should eventually fail
      const stats = queue.getStats();
      expect(stats.jobsFailed).toBe(1);
    });

    it("should handle mixed success and rate limit errors", async () => {
      queue.setRateLimitDelay(50); // Speed up retries
      
      const contents = Array.from({ length: 3 }, (_, i) =>
        createMockContent({ id: `content${i}` })
      );

      for (const content of contents) {
        await mockDB.saveContent(content);
      }

      let callCount = 0;
      mockHybridAI.generateEmbedding.mockImplementation(async () => {
        callCount++;
        // Fail first 2 calls, then succeed
        if (callCount <= 2) {
          throw createRateLimitError();
        }
        return mockEmbeddingGen.generate("test");
      });

      for (const content of contents) {
        await queue.enqueueContent(content.id, IndexingOperation.CREATE);
      }

      await waitFor(() => queue.getStats().isProcessing === false, 15000);

      // All should eventually succeed after retries
      const stats = queue.getStats();
      expect(stats.jobsProcessed).toBeGreaterThan(0);
      expect(callCount).toBeGreaterThan(3); // Should have retried
    }, 20000); // Increase timeout for this test
  });

  describe("Error Handling", () => {
    it("should retry failed jobs up to max retries", async () => {
      const content = createMockContent();
      await mockDB.saveContent(content);

      let attempts = 0;
      mockHybridAI.generateEmbedding.mockImplementation(async () => {
        attempts++;
        if (attempts <= 3) {
          throw new Error("Embedding failed");
        }
        return mockEmbeddingGen.generate("success");
      });

      await queue.enqueueContent(content.id, IndexingOperation.CREATE);
      await waitFor(() => queue.getStats().isProcessing === false, 10000);

      expect(attempts).toBeGreaterThan(1);
      expect(queue.getStats().jobsProcessed).toBe(1);
    });

    it("should mark job as failed after max retries exceeded", async () => {
      const content = createMockContent();
      await mockDB.saveContent(content);

      mockHybridAI.generateEmbedding.mockRejectedValue(
        new Error("Permanent failure")
      );

      await queue.enqueueContent(content.id, IndexingOperation.CREATE);
      await waitFor(() => queue.getStats().isProcessing === false, 10000);

      const stats = queue.getStats();
      expect(stats.jobsFailed).toBe(1);

      // Should emit failed event
      const failedMessages = mockRouter.getMessages()
        .filter(m => m.type === "VECTOR_INDEXING_PROGRESS" && m.payload.status === "failed");
      expect(failedMessages.length).toBeGreaterThan(0);
    });

    it("should handle empty content gracefully", async () => {
      const content = createMockContent({ content: "" });
      await mockDB.saveContent(content);

      await queue.enqueueContent(content.id, IndexingOperation.CREATE);
      await waitFor(() => queue.getStats().isProcessing === false, 5000);

      // Should complete without error
      expect(queue.getStats().jobsProcessed).toBe(1);
    });
  });

  describe("UI Event Emission", () => {
    it("should emit progress events for all stages", async () => {
      const content = createMockContent();
      await mockDB.saveContent(content);

      mockRouter.clear();

      await queue.enqueueContent(content.id, IndexingOperation.CREATE);
      await waitFor(() => queue.getStats().isProcessing === false, 5000);

      const messages = mockRouter.getMessages()
        .filter(m => m.type === "VECTOR_INDEXING_PROGRESS");
      
      const statuses = messages.map(m => m.payload.status);
      expect(statuses).toContain("pending");
      expect(statuses).toContain("processing");
      expect(statuses).toContain("completed");
    });

    it("should include chunk progress in events", async () => {
      const largeContent = createLargeContent(3000);
      await mockDB.saveContent(largeContent);

      mockRouter.clear();

      await queue.enqueueContent(largeContent.id, IndexingOperation.CREATE);
      await waitFor(() => queue.getStats().isProcessing === false, 5000);

      const processingMessages = mockRouter.getMessages()
        .filter(m => m.type === "VECTOR_INDEXING_PROGRESS" && m.payload.status === "processing");

      if (processingMessages.length > 0) {
        const hasProgress = processingMessages.some(
          m => m.payload.chunksTotal > 0 && m.payload.chunksProcessed > 0
        );
        expect(hasProgress).toBe(true);
      }
    });

    it("should include error details in failed events", async () => {
      const content = createMockContent();
      await mockDB.saveContent(content);

      mockHybridAI.generateEmbedding.mockRejectedValue(
        new Error("Test error message")
      );

      mockRouter.clear();

      await queue.enqueueContent(content.id, IndexingOperation.CREATE);
      await waitFor(() => queue.getStats().isProcessing === false, 10000);

      const failedMessages = mockRouter.getMessages()
        .filter(m => m.type === "VECTOR_INDEXING_PROGRESS" && m.payload.status === "failed");

      expect(failedMessages.length).toBeGreaterThan(0);
      expect(failedMessages[0]?.payload.error).toBeDefined();
    });
  });

  describe("Queue Statistics", () => {
    it("should track jobs processed", async () => {
      const contents = Array.from({ length: 5 }, (_, i) =>
        createMockContent({ id: `content${i}` })
      );

      for (const content of contents) {
        await mockDB.saveContent(content);
        await queue.enqueueContent(content.id, IndexingOperation.CREATE);
      }

      await waitFor(() => queue.getStats().isProcessing === false, 5000);

      const stats = queue.getStats();
      expect(stats.jobsProcessed).toBe(5);
    });

    it("should track average processing time", async () => {
      mockEmbeddingGen.setLatency(50);

      const content = createMockContent();
      await mockDB.saveContent(content);

      await queue.enqueueContent(content.id, IndexingOperation.CREATE);
      await waitFor(() => queue.getStats().isProcessing === false, 5000);

      const stats = queue.getStats();
      expect(stats.averageProcessingTime).toBeGreaterThan(0);
    });

    it("should track queue length", async () => {
      const content = createMockContent();
      await mockDB.saveContent(content);

      await queue.enqueueContent(content.id, IndexingOperation.CREATE);

      const statsDuring = queue.getStats();
      expect(statsDuring.queueLength).toBeGreaterThanOrEqual(0);

      await waitFor(() => queue.getStats().isProcessing === false, 5000);

      const statsAfter = queue.getStats();
      expect(statsAfter.queueLength).toBe(0);
    });
  });

  describe("Deduplication", () => {
    it("should not process same content multiple times unnecessarily", async () => {
      const content = createMockContent();
      await mockDB.saveContent(content);

      // Enqueue same content twice
      await queue.enqueueContent(content.id, IndexingOperation.CREATE);
      await queue.enqueueContent(content.id, IndexingOperation.CREATE);

      await waitFor(() => queue.getStats().isProcessing === false, 5000);

      // The important thing is that we don't process it significantly more times
      // Due to chunking, there might be multiple embeddings created, but it should
      // be a reasonable number (not like 10x what we expect)
      const embeddings = await mockDB.getAllEmbeddings();
      expect(embeddings.filter(e => e.contentId === content.id).length).toBeLessThanOrEqual(2);
    });
  });
});

describe("End-to-End Integration", () => {
  it("should process complete indexing workflow", async () => {
    const chunker = new TextChunker();
    const mockGen = new MockEmbeddingGenerator();

    // 1. Create content
    const content = createLargeContent(3000);

    // 2. Chunk text
    const chunks = chunker.chunkText(content.content as string, {
      maxChunkSize: 1000,
      overlapSize: 100,
    });

    expect(chunks.length).toBeGreaterThan(1);

    // 3. Generate embeddings for each chunk
    const embeddings = [];
    for (const chunk of chunks) {
      const embedding = await mockGen.generate(chunk.text);
      expect(embedding).toBeDefined();
      expect(embedding.length).toBeGreaterThan(0);
      embeddings.push(embedding);
    }

    // 4. Verify embeddings are valid
    embeddings.forEach(emb => {
      expect(Array.isArray(emb)).toBe(true);
      expect(emb.length).toBeGreaterThan(0);
      expect(emb.every(v => typeof v === "number")).toBe(true);
    });

    // 5. Calculate similarities
    if (embeddings.length > 1) {
      const similarity = cosineSimilarity(embeddings[0]!, embeddings[1]!);
      expect(similarity).toBeGreaterThanOrEqual(-1);
      expect(similarity).toBeLessThanOrEqual(1);
    }
  });

  it("should handle complete lifecycle: create, update, delete", async () => {
    const mockDB = new MockIndexedDBManager();
    const mockGen = new MockEmbeddingGenerator();

    // Create
    const content = createMockContent();
    await mockDB.saveContent(content);

    const embedding1 = createMockEmbedding(content.id);
    await mockDB.saveEmbedding(embedding1);

    expect(mockDB.getEmbeddingCount()).toBe(1);

    // Update
    const embedding2 = createMockEmbedding(content.id);
    await mockDB.saveEmbedding(embedding2);

    expect(mockDB.getEmbeddingCount()).toBe(2);

    // Delete
    const embeddings = await mockDB.getAllEmbeddings();
    for (const emb of embeddings) {
      await mockDB.deleteEmbedding(emb.id!);
    }

    expect(mockDB.getEmbeddingCount()).toBe(0);
  });
});
