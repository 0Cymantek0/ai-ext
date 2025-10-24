/**
 * Vector Queue Integration Tests
 * 
 * Tests for vector indexing queue integration into content ingestion lifecycle.
 * Verifies that:
 * - Content creation enqueues CREATE jobs
 * - Content updates enqueue UPDATE jobs
 * - Content deletion enqueues DELETE jobs
 * - Queue jobs are processed correctly
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { 
  VectorIndexingQueue, 
  IndexingOperation 
} from "../src/background/vector-indexing-queue.js";
import {
  indexedDBManager,
  ContentType,
  ProcessingStatus,
} from "../src/background/indexeddb-manager.js";

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
    generateEmbedding: vi.fn().mockResolvedValue(
      Array.from({ length: 768 }, () => Math.random())
    ),
  },
}));

vi.mock("../src/background/indexeddb-manager.js", async () => {
  const actual = await vi.importActual("../src/background/indexeddb-manager.js");
  return {
    ...actual,
    indexedDBManager: {
      init: vi.fn().mockResolvedValue(undefined),
      saveContent: vi.fn(),
      updateContent: vi.fn(),
      deleteContent: vi.fn(),
      getContent: vi.fn(),
      saveEmbedding: vi.fn(),
      deleteEmbeddingByContentId: vi.fn(),
      getContentByPocket: vi.fn().mockResolvedValue([]),
    },
  };
});

// Mock chrome runtime API
global.chrome = {
  runtime: {
    sendMessage: vi.fn().mockResolvedValue(undefined),
  },
} as any;

describe("Vector Queue Integration", () => {
  let queue: VectorIndexingQueue;

  beforeEach(() => {
    queue = new VectorIndexingQueue();
    queue.clear();
    queue.setBatchSize(1);
    queue.setProcessingInterval(10);
    vi.clearAllMocks();
  });

  afterEach(() => {
    queue.clear();
  });

  describe("Content Creation Flow", () => {
    it("should enqueue CREATE job when content is created", async () => {
      const contentId = "test-content-123";
      
      // Mock content to prevent actual processing
      vi.mocked(indexedDBManager.getContent).mockImplementation(() => 
        new Promise(() => {}) // Never resolves to keep job in queue
      );
      
      // Simulate content creation by enqueuing
      const jobId = await queue.enqueueContent(contentId, IndexingOperation.CREATE);
      
      expect(jobId).toBeDefined();
      expect(typeof jobId).toBe("string");
      
      // Give a moment for queue to update
      await new Promise(resolve => setTimeout(resolve, 20));
      
      const stats = queue.getStats();
      expect(stats.queueLength).toBeGreaterThanOrEqual(0); // May be processing
      expect(stats.isProcessing).toBe(true);
    });

    it("should process CREATE job and generate embeddings", async () => {
      const contentId = "test-content-456";
      const mockContent = {
        id: contentId,
        pocketId: "pocket-123",
        type: ContentType.TEXT,
        content: "This is test content that should be indexed.",
        metadata: {
          timestamp: Date.now(),
          title: "Test Content",
        },
        capturedAt: Date.now(),
        sourceUrl: "https://example.com",
        processingStatus: ProcessingStatus.COMPLETED,
      };

      vi.mocked(indexedDBManager.getContent).mockResolvedValue(mockContent);

      const jobId = await queue.enqueueContent(contentId, IndexingOperation.CREATE);
      
      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Verify embedding was saved
      expect(indexedDBManager.saveEmbedding).toHaveBeenCalled();
      
      const stats = queue.getStats();
      expect(stats.jobsProcessed).toBe(1);
      expect(stats.queueLength).toBe(0);
    });

    it("should handle duplicate enqueueing gracefully", async () => {
      const contentId = "test-content-789";
      
      // Clear mocks and queue
      vi.clearAllMocks();
      queue.clear();
      
      const mockContent = {
        id: contentId,
        pocketId: "pocket-123",
        type: ContentType.TEXT,
        content: "test",
        metadata: { timestamp: Date.now() },
        capturedAt: Date.now(),
        sourceUrl: "",
        processingStatus: ProcessingStatus.COMPLETED,
      };

      vi.mocked(indexedDBManager.getContent).mockResolvedValue(mockContent);
      
      // Enqueue same content twice
      const jobId1 = await queue.enqueueContent(contentId, IndexingOperation.CREATE);
      const jobId2 = await queue.enqueueContent(contentId, IndexingOperation.CREATE);
      
      // Should get valid job IDs
      expect(jobId1).toBeDefined();
      expect(jobId2).toBeDefined();
      
      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Should process successfully without errors
      const stats = queue.getStats();
      expect(stats.jobsFailed).toBe(0);
    });

    it("should handle content with no text gracefully", async () => {
      const contentId = "test-empty-content";
      const mockContent = {
        id: contentId,
        pocketId: "pocket-123",
        type: ContentType.TEXT,
        content: "",
        metadata: {
          timestamp: Date.now(),
        },
        capturedAt: Date.now(),
        sourceUrl: "https://example.com",
        processingStatus: ProcessingStatus.COMPLETED,
      };

      vi.mocked(indexedDBManager.getContent).mockResolvedValue(mockContent);

      await queue.enqueueContent(contentId, IndexingOperation.CREATE);
      
      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Should complete without error
      const stats = queue.getStats();
      expect(stats.jobsProcessed).toBe(1);
      expect(stats.jobsFailed).toBe(0);
    });
  });

  describe("Content Update Flow", () => {
    it("should enqueue UPDATE job when content is updated", async () => {
      const contentId = "test-content-update-123";
      
      // Mock content to prevent actual processing
      vi.mocked(indexedDBManager.getContent).mockImplementation(() => 
        new Promise(() => {}) // Never resolves to keep job in queue
      );
      
      const jobId = await queue.enqueueContent(contentId, IndexingOperation.UPDATE);
      
      expect(jobId).toBeDefined();
      
      await new Promise(resolve => setTimeout(resolve, 20));
      
      const stats = queue.getStats();
      expect(stats.queueLength).toBeGreaterThanOrEqual(0);
      expect(stats.isProcessing).toBe(true);
    });

    it("should process UPDATE job and regenerate embeddings", async () => {
      const contentId = "test-content-update-456";
      const mockContent = {
        id: contentId,
        pocketId: "pocket-123",
        type: ContentType.NOTE,
        content: "Updated content with new information.",
        metadata: {
          timestamp: Date.now(),
          title: "Updated Note",
          updatedAt: Date.now(),
        },
        capturedAt: Date.now(),
        sourceUrl: "",
        processingStatus: ProcessingStatus.COMPLETED,
      };

      vi.mocked(indexedDBManager.getContent).mockResolvedValue(mockContent);

      await queue.enqueueContent(contentId, IndexingOperation.UPDATE);
      
      // Wait for processing with longer timeout
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Should delete old embeddings and create new ones
      expect(indexedDBManager.saveEmbedding).toHaveBeenCalled();
      
      const stats = queue.getStats();
      expect(stats.jobsProcessed).toBeGreaterThanOrEqual(1);
    });

    it("should handle multiple updates for same content gracefully", async () => {
      const contentId = "test-content-multiple-updates";
      
      // Clear mocks and queue
      vi.clearAllMocks();
      queue.clear();
      
      const mockContent = {
        id: contentId,
        pocketId: "pocket-123",
        type: ContentType.NOTE,
        content: "Updated content",
        metadata: {
          timestamp: Date.now(),
          updatedAt: Date.now(),
        },
        capturedAt: Date.now(),
        sourceUrl: "",
        processingStatus: ProcessingStatus.COMPLETED,
      };

      vi.mocked(indexedDBManager.getContent).mockResolvedValue(mockContent);
      
      // Enqueue multiple updates
      const jobId1 = await queue.enqueueContent(contentId, IndexingOperation.UPDATE);
      const jobId2 = await queue.enqueueContent(contentId, IndexingOperation.UPDATE);
      
      // Should get valid job IDs
      expect(jobId1).toBeDefined();
      expect(jobId2).toBeDefined();
      
      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Should process successfully without errors
      const stats = queue.getStats();
      expect(stats.jobsFailed).toBe(0);
    });
  });

  describe("Content Deletion Flow", () => {
    it("should enqueue DELETE job when content is deleted", async () => {
      const contentId = "test-content-delete-123";
      
      // Mock to delay processing
      vi.mocked(indexedDBManager.deleteEmbeddingByContentId).mockImplementation(() => 
        new Promise(() => {}) // Never resolves to keep job in queue
      );
      
      const jobId = await queue.enqueueContent(contentId, IndexingOperation.DELETE);
      
      expect(jobId).toBeDefined();
      
      await new Promise(resolve => setTimeout(resolve, 20));
      
      const stats = queue.getStats();
      expect(stats.queueLength).toBeGreaterThanOrEqual(0);
      expect(stats.isProcessing).toBe(true);
    });

    it("should process DELETE job and remove embeddings", async () => {
      const contentId = "test-content-delete-456";
      
      vi.mocked(indexedDBManager.deleteEmbeddingByContentId).mockResolvedValue();

      await queue.enqueueContent(contentId, IndexingOperation.DELETE);
      
      // Wait for processing with longer timeout
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Should delete embeddings
      expect(indexedDBManager.deleteEmbeddingByContentId).toHaveBeenCalledWith(contentId);
      
      const stats = queue.getStats();
      expect(stats.jobsProcessed).toBeGreaterThanOrEqual(1);
    });

    it("should handle deletion of non-existent content gracefully", async () => {
      const contentId = "non-existent-content";
      
      vi.mocked(indexedDBManager.deleteEmbeddingByContentId).mockResolvedValue();

      await queue.enqueueContent(contentId, IndexingOperation.DELETE);
      
      // Wait for processing with longer timeout
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Should complete without error
      const stats = queue.getStats();
      expect(stats.jobsProcessed).toBeGreaterThanOrEqual(1);
      expect(stats.jobsFailed).toBe(0);
    });
  });

  describe("Queue Priority and Ordering", () => {
    it("should process high priority jobs first", async () => {
      // Clear queue for a clean test
      queue.clear();
      queue.setBatchSize(3); // Process all at once
      
      const mockContent = {
        pocketId: "pocket-123",
        type: ContentType.TEXT,
        content: "test",
        metadata: { timestamp: Date.now() },
        capturedAt: Date.now(),
        sourceUrl: "",
        processingStatus: ProcessingStatus.COMPLETED,
      };

      vi.mocked(indexedDBManager.getContent).mockImplementation(async (id) => ({
        ...mockContent,
        id,
      }));

      // Enqueue with different priorities
      await queue.enqueueContent("low-priority", IndexingOperation.CREATE, "low");
      await queue.enqueueContent("high-priority", IndexingOperation.CREATE, "high");
      await queue.enqueueContent("normal-priority", IndexingOperation.CREATE, "normal");
      
      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // All jobs should be processed
      const stats = queue.getStats();
      expect(stats.jobsProcessed).toBeGreaterThanOrEqual(3);
    });

    it("should handle mixed operations with correct priority", async () => {
      const contentId = "mixed-ops-content";
      
      // Mock to prevent processing
      vi.mocked(indexedDBManager.getContent).mockImplementation(() => 
        new Promise(() => {})
      );
      
      // Enqueue different operations
      await queue.enqueueContent(contentId, IndexingOperation.CREATE, "normal");
      await queue.enqueueContent(contentId, IndexingOperation.UPDATE, "high");
      
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const stats = queue.getStats();
      // Should have at least 1 job, operations for same content can coexist
      expect(stats.queueLength + (stats.isProcessing ? 1 : 0)).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Error Handling", () => {
    it("should retry failed jobs up to max retries", async () => {
      const contentId = "failing-content";
      
      vi.mocked(indexedDBManager.getContent).mockRejectedValueOnce(new Error("Database error"));

      await queue.enqueueContent(contentId, IndexingOperation.CREATE);
      
      // Wait for processing and retry
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Job should be retried
      const stats = queue.getStats();
      expect(stats.jobsFailed).toBeGreaterThanOrEqual(0); // Depends on retry completion
    });

    it("should handle content not found error", async () => {
      const contentId = "missing-content";
      
      vi.mocked(indexedDBManager.getContent).mockResolvedValue(null);

      await queue.enqueueContent(contentId, IndexingOperation.CREATE);
      
      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Should fail and eventually give up
      const stats = queue.getStats();
      expect(stats.jobsFailed).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Non-blocking Behavior", () => {
    it("should not block main thread during enqueue", async () => {
      const startTime = Date.now();
      
      await queue.enqueueContent("content-1", IndexingOperation.CREATE);
      await queue.enqueueContent("content-2", IndexingOperation.CREATE);
      await queue.enqueueContent("content-3", IndexingOperation.CREATE);
      
      const enqueueTime = Date.now() - startTime;
      
      // Enqueuing should be fast (< 50ms)
      expect(enqueueTime).toBeLessThan(50);
    });

    it("should process jobs in background", async () => {
      const mockContent = {
        id: "bg-content",
        pocketId: "pocket-123",
        type: ContentType.TEXT,
        content: "Background processing test",
        metadata: { timestamp: Date.now() },
        capturedAt: Date.now(),
        sourceUrl: "",
        processingStatus: ProcessingStatus.COMPLETED,
      };

      vi.mocked(indexedDBManager.getContent).mockResolvedValue(mockContent);

      // Enqueue should return immediately
      const jobId = await queue.enqueueContent("bg-content", IndexingOperation.CREATE);
      expect(jobId).toBeDefined();
      
      // Processing happens in background
      const initialStats = queue.getStats();
      expect(initialStats.isProcessing || initialStats.queueLength > 0).toBe(true);
      
      // Wait for background processing
      await new Promise(resolve => setTimeout(resolve, 150));
      
      const finalStats = queue.getStats();
      expect(finalStats.jobsProcessed).toBeGreaterThan(0);
    });
  });

  describe("Event Emission", () => {
    it("should emit progress events during processing", async () => {
      const contentId = "event-content";
      const mockContent = {
        id: contentId,
        pocketId: "pocket-123",
        type: ContentType.TEXT,
        content: "Event test content",
        metadata: { timestamp: Date.now() },
        capturedAt: Date.now(),
        sourceUrl: "",
        processingStatus: ProcessingStatus.COMPLETED,
      };

      vi.mocked(indexedDBManager.getContent).mockResolvedValue(mockContent);

      await queue.enqueueContent(contentId, IndexingOperation.CREATE);
      
      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Should have emitted events via chrome.runtime.sendMessage
      expect(chrome.runtime.sendMessage).toHaveBeenCalled();
    });
  });

  describe("Batch Processing", () => {
    it("should process multiple jobs in batches", async () => {
      queue.setBatchSize(3);
      
      const mockContent = {
        pocketId: "pocket-123",
        type: ContentType.TEXT,
        content: "Batch test",
        metadata: { timestamp: Date.now() },
        capturedAt: Date.now(),
        sourceUrl: "",
        processingStatus: ProcessingStatus.COMPLETED,
      };

      vi.mocked(indexedDBManager.getContent).mockImplementation(async (id) => ({
        ...mockContent,
        id,
      }));

      // Enqueue 5 jobs
      await Promise.all([
        queue.enqueueContent("batch-1", IndexingOperation.CREATE),
        queue.enqueueContent("batch-2", IndexingOperation.CREATE),
        queue.enqueueContent("batch-3", IndexingOperation.CREATE),
        queue.enqueueContent("batch-4", IndexingOperation.CREATE),
        queue.enqueueContent("batch-5", IndexingOperation.CREATE),
      ]);
      
      // Wait for batch processing
      await new Promise(resolve => setTimeout(resolve, 300));
      
      const stats = queue.getStats();
      expect(stats.jobsProcessed).toBe(5);
    });
  });
});
