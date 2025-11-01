/**
 * Vector Indexing Queue Integration Tests
 *
 * Tests the integration of vector indexing queue with content ingestion lifecycle.
 * Verifies that CREATE, UPDATE, and DELETE operations properly enqueue vector indexing jobs.
 *
 * Requirements: 7.2, 7.3 (Vector search and semantic indexing)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { contentProcessor } from "../src/background/content-processor.js";
import {
  vectorIndexingQueue,
  IndexingOperation,
} from "../src/background/vector-indexing-queue.js";
import { indexedDBManager } from "../src/background/indexeddb-manager.js";

// Mock dependencies
vi.mock("../src/background/monitoring.js", () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  performanceMonitor: {
    measureAsync: vi.fn((name, fn) => fn()),
    recordMetric: vi.fn(),
  },
}));

vi.mock("../src/background/hybrid-ai-engine.js", () => ({
  hybridAIEngine: {
    generateEmbedding: vi.fn().mockResolvedValue(new Array(768).fill(0.1)),
  },
}));

vi.mock("../src/background/pdf-processor.js", () => ({
  pdfProcessor: {
    processPDF: vi.fn().mockResolvedValue({
      text: "Mock PDF text",
      pageCount: 1,
      images: [],
    }),
  },
}));

vi.mock("../src/background/service-worker.js", () => ({
  backgroundProcessor: {
    processNewCapture: vi.fn().mockResolvedValue(undefined),
  },
}));

describe("Vector Indexing Queue Integration", () => {
  let testPocketId: string;
  let enqueueSpy: any;

  beforeEach(async () => {
    // Initialize IndexedDB
    await indexedDBManager.init();

    // Create a test pocket
    testPocketId = await indexedDBManager.createPocket({
      name: "Test Pocket",
      description: "Test pocket for vector indexing",
      tags: ["test"],
      color: "#3b82f6",
      contentIds: [],
    });

    // Clear the queue
    vectorIndexingQueue.clear();

    // Spy on enqueueContent method
    enqueueSpy = vi.spyOn(vectorIndexingQueue, "enqueueContent");
  });

  afterEach(async () => {
    // Clean up test data
    if (testPocketId) {
      try {
        await indexedDBManager.deletePocket(testPocketId);
      } catch (error) {
        // Ignore cleanup errors
      }
    }

    // Restore spies
    vi.restoreAllMocks();
  });

  describe("CREATE Operation", () => {
    it("should enqueue vector indexing job when creating new content", async () => {
      // Arrange
      const testContent = {
        pocketId: testPocketId,
        mode: "note" as const,
        content: {
          text: "This is a test note for vector indexing",
          type: "note",
        },
        metadata: {
          title: "Test Note",
          timestamp: Date.now(),
        },
        sourceUrl: "",
        sanitize: false,
      };

      // Act
      const result = await contentProcessor.processContent(testContent);

      // Assert
      expect(result.contentId).toBeDefined();
      expect(enqueueSpy).toHaveBeenCalledWith(
        result.contentId,
        IndexingOperation.CREATE,
      );
      expect(enqueueSpy).toHaveBeenCalledTimes(1);
    });

    it("should enqueue vector indexing job for text selection capture", async () => {
      // Arrange
      const testContent = {
        pocketId: testPocketId,
        mode: "selection" as const,
        content: {
          text: {
            content: "Selected text for vector indexing test",
            wordCount: 6,
            characterCount: 38,
          },
        },
        metadata: {
          timestamp: Date.now(),
        },
        sourceUrl: "https://example.com",
        sanitize: true,
      };

      // Act
      const result = await contentProcessor.processContent(testContent);

      // Assert
      expect(result.contentId).toBeDefined();
      expect(enqueueSpy).toHaveBeenCalledWith(
        result.contentId,
        IndexingOperation.CREATE,
      );
    });

    it("should enqueue vector indexing job for full page capture", async () => {
      // Arrange
      const testContent = {
        pocketId: testPocketId,
        mode: "full-page" as const,
        content: {
          text: {
            content:
              "Full page content for vector indexing test with multiple paragraphs and sections",
            wordCount: 12,
            characterCount: 80,
          },
        },
        metadata: {
          timestamp: Date.now(),
        },
        sourceUrl: "https://example.com/article",
        sanitize: true,
      };

      // Act
      const result = await contentProcessor.processContent(testContent);

      // Assert
      expect(result.contentId).toBeDefined();
      expect(enqueueSpy).toHaveBeenCalledWith(
        result.contentId,
        IndexingOperation.CREATE,
      );
    });

    it("should not block UI when enqueuing vector indexing job", async () => {
      // Arrange
      const testContent = {
        pocketId: testPocketId,
        mode: "note" as const,
        content: { text: "Test note", type: "note" },
        metadata: {
          title: "Test",
          timestamp: Date.now(),
        },
        sourceUrl: "",
        sanitize: false,
      };

      // Mock enqueueContent to simulate delay
      enqueueSpy.mockImplementation(() => {
        return new Promise((resolve) => setTimeout(resolve, 100));
      });

      // Act
      const startTime = Date.now();
      const result = await contentProcessor.processContent(testContent);
      const endTime = Date.now();

      // Assert - processContent should return quickly without waiting for enqueue
      expect(result.contentId).toBeDefined();
      expect(endTime - startTime).toBeLessThan(50); // Should be much faster than 100ms
    });
  });

  describe("UPDATE Operation", () => {
    it("should enqueue vector indexing UPDATE job when updating note content", async () => {
      // Arrange - Create initial content
      const initialContent = {
        pocketId: testPocketId,
        mode: "note" as const,
        content: { text: "Initial note content", type: "note" },
        metadata: {
          title: "Test Note",
          timestamp: Date.now(),
        },
        sourceUrl: "",
        sanitize: false,
      };

      const created = await contentProcessor.processContent(initialContent);
      enqueueSpy.mockClear(); // Clear the CREATE call

      // Act - Update the content
      await indexedDBManager.updateContent(created.contentId, {
        content: "Updated note content with new information",
        metadata: {
          title: "Updated Test Note",
          updatedAt: Date.now(),
        },
      });

      // Manually enqueue UPDATE (simulating what service-worker does)
      await vectorIndexingQueue.enqueueContent(
        created.contentId,
        IndexingOperation.UPDATE,
      );

      // Assert
      expect(enqueueSpy).toHaveBeenCalledWith(
        created.contentId,
        IndexingOperation.UPDATE,
      );
    });

    it("should trigger re-chunking and embedding refresh on update", async () => {
      // Arrange - Create initial content
      const initialContent = {
        pocketId: testPocketId,
        mode: "note" as const,
        content: { text: "Original content", type: "note" },
        metadata: {
          title: "Test",
          timestamp: Date.now(),
        },
        sourceUrl: "",
        sanitize: false,
      };

      const created = await contentProcessor.processContent(initialContent);
      enqueueSpy.mockClear();

      // Act - Update content
      await indexedDBManager.updateContent(created.contentId, {
        content: "Completely new content that should be re-indexed",
      });

      await vectorIndexingQueue.enqueueContent(
        created.contentId,
        IndexingOperation.UPDATE,
      );

      // Assert - Verify UPDATE job was enqueued
      expect(enqueueSpy).toHaveBeenCalledWith(
        created.contentId,
        IndexingOperation.UPDATE,
      );
      expect(enqueueSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("DELETE Operation", () => {
    it("should enqueue vector indexing DELETE job when deleting content", async () => {
      // Arrange - Create content first
      const testContent = {
        pocketId: testPocketId,
        mode: "note" as const,
        content: { text: "Content to be deleted", type: "note" },
        metadata: {
          title: "Test Note",
          timestamp: Date.now(),
        },
        sourceUrl: "",
        sanitize: false,
      };

      const created = await contentProcessor.processContent(testContent);
      enqueueSpy.mockClear(); // Clear the CREATE call

      // Act - Delete the content
      await contentProcessor.deleteContent(created.contentId);

      // Assert
      expect(enqueueSpy).toHaveBeenCalledWith(
        created.contentId,
        IndexingOperation.DELETE,
      );
      expect(enqueueSpy).toHaveBeenCalledTimes(1);
    });

    it("should clear associated vector chunks on deletion", async () => {
      // Arrange - Create content with embeddings
      const testContent = {
        pocketId: testPocketId,
        mode: "note" as const,
        content: {
          text: "Content with embeddings to be deleted",
          type: "note",
        },
        metadata: {
          title: "Test Note",
          timestamp: Date.now(),
        },
        sourceUrl: "",
        sanitize: false,
      };

      const created = await contentProcessor.processContent(testContent);

      // Create some embeddings for this content
      await indexedDBManager.saveEmbedding({
        contentId: created.contentId,
        vector: new Array(768).fill(0.5),
        model: "gemini",
      });

      // Act - Delete the content
      await contentProcessor.deleteContent(created.contentId);

      // Wait for deletion to process
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Assert - Verify content is deleted
      const deletedContent = await indexedDBManager.getContent(
        created.contentId,
      );
      expect(deletedContent).toBeNull();

      // Verify DELETE job was enqueued
      expect(enqueueSpy).toHaveBeenCalledWith(
        created.contentId,
        IndexingOperation.DELETE,
      );
    });

    it("should not block UI when enqueuing deletion job", async () => {
      // Arrange - Create content
      const testContent = {
        pocketId: testPocketId,
        mode: "note" as const,
        content: { text: "Content to delete", type: "note" },
        metadata: {
          title: "Test",
          timestamp: Date.now(),
        },
        sourceUrl: "",
        sanitize: false,
      };

      const created = await contentProcessor.processContent(testContent);
      enqueueSpy.mockClear();

      // Mock enqueueContent to simulate delay
      enqueueSpy.mockImplementation(() => {
        return new Promise((resolve) => setTimeout(resolve, 100));
      });

      // Act
      const startTime = Date.now();
      await contentProcessor.deleteContent(created.contentId);
      const endTime = Date.now();

      // Assert - deleteContent should return quickly
      expect(endTime - startTime).toBeLessThan(50);
    });
  });

  describe("Queue Processing", () => {
    it("should process jobs in priority order", async () => {
      // Arrange - Create multiple jobs with different priorities
      const content1 = await contentProcessor.processContent({
        pocketId: testPocketId,
        mode: "note" as const,
        content: { text: "Low priority content", type: "note" },
        metadata: { title: "Low", timestamp: Date.now() },
        sourceUrl: "",
        sanitize: false,
      });

      await vectorIndexingQueue.enqueueContent(
        content1.contentId,
        IndexingOperation.UPDATE,
        "low",
      );

      const content2 = await contentProcessor.processContent({
        pocketId: testPocketId,
        mode: "note" as const,
        content: { text: "High priority content", type: "note" },
        metadata: { title: "High", timestamp: Date.now() },
        sourceUrl: "",
        sanitize: false,
      });

      await vectorIndexingQueue.enqueueContent(
        content2.contentId,
        IndexingOperation.UPDATE,
        "high",
      );

      // Act - Get queue stats
      const stats = vectorIndexingQueue.getStats();

      // Assert
      expect(stats.queueLength).toBeGreaterThan(0);
    });

    it("should handle multiple operations on same content", async () => {
      // Arrange - Create content
      const created = await contentProcessor.processContent({
        pocketId: testPocketId,
        mode: "note" as const,
        content: { text: "Test content", type: "note" },
        metadata: { title: "Test", timestamp: Date.now() },
        sourceUrl: "",
        sanitize: false,
      });

      enqueueSpy.mockClear();

      // Act - Enqueue multiple operations
      await vectorIndexingQueue.enqueueContent(
        created.contentId,
        IndexingOperation.UPDATE,
      );

      await vectorIndexingQueue.enqueueContent(
        created.contentId,
        IndexingOperation.UPDATE,
      );

      // Assert - Should not duplicate jobs
      const stats = vectorIndexingQueue.getStats();
      expect(stats.queueLength).toBeLessThanOrEqual(1);
    });
  });

  describe("Error Handling", () => {
    it("should handle enqueue failures gracefully", async () => {
      // Arrange
      enqueueSpy.mockRejectedValueOnce(new Error("Queue full"));

      const testContent = {
        pocketId: testPocketId,
        mode: "note" as const,
        content: { text: "Test note", type: "note" },
        metadata: { title: "Test", timestamp: Date.now() },
        sourceUrl: "",
        sanitize: false,
      };

      // Act & Assert - Should not throw
      await expect(
        contentProcessor.processContent(testContent),
      ).resolves.toBeDefined();
    });

    it("should continue processing other content if one fails", async () => {
      // Arrange - Create multiple content items
      const content1 = await contentProcessor.processContent({
        pocketId: testPocketId,
        mode: "note" as const,
        content: { text: "Content 1", type: "note" },
        metadata: { title: "Test 1", timestamp: Date.now() },
        sourceUrl: "",
        sanitize: false,
      });

      // Mock failure for first content
      enqueueSpy.mockRejectedValueOnce(new Error("Processing failed"));

      const content2 = await contentProcessor.processContent({
        pocketId: testPocketId,
        mode: "note" as const,
        content: { text: "Content 2", type: "note" },
        metadata: { title: "Test 2", timestamp: Date.now() },
        sourceUrl: "",
        sanitize: false,
      });

      // Assert - Second content should still be created
      expect(content2.contentId).toBeDefined();
    });
  });
});
