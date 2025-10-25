/**
 * Vector Search Service - Chunk Search Tests
 * 
 * Tests for chunk-level semantic search functionality
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { VectorSearchService } from "./vector-search-service";
import type { CapturedContent } from "./indexeddb-manager";
import { ContentType, ProcessingStatus } from "./indexeddb-manager";

// Mock dependencies
vi.mock("./monitoring", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("./embedding-engine", () => ({
  embeddingEngine: {
    generateEmbedding: vi.fn().mockResolvedValue(Array(768).fill(0.5)),
  },
}));

vi.mock("./vector-store-service", () => ({
  vectorStoreService: {
    getChunksByPocket: vi.fn().mockResolvedValue([]),
    getAllChunks: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("./indexeddb-manager", () => ({
  indexedDBManager: {
    getContentByPocket: vi.fn(),
    listPockets: vi.fn(),
  },
  ContentType: {
    TEXT: "text",
    PDF: "pdf",
    NOTE: "note",
  },
  ProcessingStatus: {
    COMPLETED: "completed",
  },
}));

vi.mock("./pdf-processor", () => ({
  pdfProcessor: {
    generateLLMSummary: vi.fn().mockReturnValue("PDF summary"),
  },
}));

vi.mock("./text-chunker", () => ({
  textChunker: {
    chunkText: vi.fn((text, options) => {
      // Simple mock chunking: split into 100-char chunks
      const chunks = [];
      for (let i = 0; i < text.length; i += 100) {
        const chunkText = text.slice(i, i + 100);
        chunks.push({
          id: `chunk-${i}`,
          text: chunkText,
          startIndex: i,
          endIndex: i + chunkText.length,
          chunkIndex: Math.floor(i / 100),
          totalChunks: Math.ceil(text.length / 100),
        });
      }
      return chunks;
    }),
  },
}));

// Helper to create mock content
function createMockContent(
  id: string,
  text: string,
  overrides: Partial<CapturedContent> = {}
): CapturedContent {
  return {
    id,
    pocketId: "pocket-1",
    type: ContentType.TEXT,
    content: text,
    metadata: {
      timestamp: Date.now(),
      title: "Test Content",
    },
    capturedAt: Date.now(),
    sourceUrl: "https://example.com",
    processingStatus: ProcessingStatus.COMPLETED,
    ...overrides,
  };
}

describe("VectorSearchService - Chunk Search", () => {
  let service: VectorSearchService;

  beforeEach(() => {
    service = new VectorSearchService();
    vi.clearAllMocks();
  });

  describe("searchChunks", () => {
    it("should search and return relevant chunks", async () => {
      const { indexedDBManager } = await import("./indexeddb-manager");

      const mockContent = createMockContent(
        "content-1",
        "This is a long piece of content about machine learning and artificial intelligence that will be split into multiple chunks for better semantic search."
      );

      vi.spyOn(indexedDBManager, "getContentByPocket").mockResolvedValue([
        mockContent,
      ]);

      const results = await service.searchChunks("machine learning", {
        pocketId: "pocket-1",
        topK: 5,
      });

      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);

      // Check result structure
      const firstResult = results[0]!;
      expect(firstResult.chunk).toBeDefined();
      expect(firstResult.relevanceScore).toBeDefined();
      expect(firstResult.matchType).toBe("semantic");

      // Check chunk structure
      expect(firstResult.chunk.id).toBeDefined();
      expect(firstResult.chunk.text).toBeDefined();
      expect(firstResult.chunk.embedding).toBeDefined();
      expect(firstResult.chunk.metadata).toBeDefined();
    });

    it("should respect topK limit", async () => {
      const { indexedDBManager } = await import("./indexeddb-manager");

      // Create content that will generate many chunks
      const longText = "A".repeat(1000); // Will create ~10 chunks
      const mockContent = createMockContent("content-1", longText);

      vi.spyOn(indexedDBManager, "getContentByPocket").mockResolvedValue([
        mockContent,
      ]);

      const results = await service.searchChunks("test query", {
        pocketId: "pocket-1",
        topK: 3,
      });

      expect(results.length).toBeLessThanOrEqual(3);
    });

    it("should respect minRelevance threshold", async () => {
      const { indexedDBManager } = await import("./indexeddb-manager");
      const { hybridAIEngine } = await import("./hybrid-ai-engine");

      const mockContent = createMockContent(
        "content-1",
        "Some content that might not be very relevant"
      );

      vi.spyOn(indexedDBManager, "getContentByPocket").mockResolvedValue([
        mockContent,
      ]);

      // Mock low similarity
      vi.spyOn(service as any, "cosineSimilarity").mockReturnValue(0.2);

      const results = await service.searchChunks("unrelated query", {
        pocketId: "pocket-1",
        minRelevance: 0.3,
      });

      // Should filter out low-relevance results
      expect(results.length).toBe(0);
    });

    it("should respect maxTokens budget", async () => {
      const { indexedDBManager } = await import("./indexeddb-manager");

      // Create content with multiple chunks
      const longText = "A".repeat(2000); // ~500 tokens
      const mockContent = createMockContent("content-1", longText);

      vi.spyOn(indexedDBManager, "getContentByPocket").mockResolvedValue([
        mockContent,
      ]);

      const results = await service.searchChunks("test query", {
        pocketId: "pocket-1",
        topK: 10,
        maxTokens: 200, // Limited budget
      });

      // Should limit results based on token budget
      expect(results.length).toBeGreaterThan(0);
      expect(results.length).toBeLessThan(10);
    });

    it("should include chunk metadata", async () => {
      const { indexedDBManager } = await import("./indexeddb-manager");

      const mockContent = createMockContent(
        "content-123",
        "Test content for metadata",
        {
          pocketId: "pocket-456",
          type: ContentType.TEXT,
          sourceUrl: "https://example.com/article",
          metadata: {
            timestamp: Date.now(),
            title: "Test Article",
            category: "research",
          },
        }
      );

      vi.spyOn(indexedDBManager, "getContentByPocket").mockResolvedValue([
        mockContent,
      ]);

      const results = await service.searchChunks("test", {
        pocketId: "pocket-456",
      });

      expect(results.length).toBeGreaterThan(0);

      const chunk = results[0]!.chunk;
      expect(chunk.metadata.contentId).toBe("content-123");
      expect(chunk.metadata.pocketId).toBe("pocket-456");
      expect(chunk.metadata.sourceType).toBe(ContentType.TEXT);
      expect(chunk.metadata.sourceUrl).toBe("https://example.com/article");
      expect(chunk.metadata.title).toBe("Test Article");
      expect(chunk.metadata.category).toBe("research");
      expect(chunk.metadata.chunkIndex).toBeGreaterThanOrEqual(0);
      expect(chunk.metadata.totalChunks).toBeGreaterThan(0);
    });

    it("should handle pocket scoping", async () => {
      const { indexedDBManager } = await import("./indexeddb-manager");

      const getContentSpy = vi.spyOn(
        indexedDBManager,
        "getContentByPocket"
      ).mockResolvedValue([]);

      await service.searchChunks("test query", {
        pocketId: "specific-pocket",
      });

      expect(getContentSpy).toHaveBeenCalledWith("specific-pocket");
    });

    it("should search all pockets when no pocketId provided", async () => {
      const { indexedDBManager } = await import("./indexeddb-manager");

      const listPocketsSpy = vi.spyOn(indexedDBManager, "listPockets").mockResolvedValue([
        { id: "pocket-1", name: "Pocket 1", description: "", createdAt: Date.now(), updatedAt: Date.now(), contentIds: [], tags: [], color: "#000" },
        { id: "pocket-2", name: "Pocket 2", description: "", createdAt: Date.now(), updatedAt: Date.now(), contentIds: [], tags: [], color: "#000" },
      ]);

      vi.spyOn(indexedDBManager, "getContentByPocket").mockResolvedValue([]);

      await service.searchChunks("test query", {
        // No pocketId
      });

      expect(listPocketsSpy).toHaveBeenCalled();
    });

    it("should handle empty content gracefully", async () => {
      const { indexedDBManager } = await import("./indexeddb-manager");

      vi.spyOn(indexedDBManager, "getContentByPocket").mockResolvedValue([]);

      const results = await service.searchChunks("test query", {
        pocketId: "empty-pocket",
      });

      expect(results).toEqual([]);
    });

    it("should skip binary content", async () => {
      const { indexedDBManager } = await import("./indexeddb-manager");

      const binaryContent = createMockContent("content-1", "", {
        content: new ArrayBuffer(100),
      });

      vi.spyOn(indexedDBManager, "getContentByPocket").mockResolvedValue([
        binaryContent,
      ]);

      const results = await service.searchChunks("test query", {
        pocketId: "pocket-1",
      });

      expect(results).toEqual([]);
    });

    it("should handle JSON-wrapped content", async () => {
      const { indexedDBManager } = await import("./indexeddb-manager");

      const jsonContent = createMockContent(
        "content-1",
        JSON.stringify({
          text: { content: "Actual text content" },
        })
      );

      vi.spyOn(indexedDBManager, "getContentByPocket").mockResolvedValue([
        jsonContent,
      ]);

      const results = await service.searchChunks("test query", {
        pocketId: "pocket-1",
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0]!.chunk.text).toContain("Actual text content");
    });

    it("should handle embedding generation errors gracefully", async () => {
      const { indexedDBManager } = await import("./indexeddb-manager");
      const { hybridAIEngine } = await import("./hybrid-ai-engine");

      const mockContent = createMockContent("content-1", "Test content");

      vi.spyOn(indexedDBManager, "getContentByPocket").mockResolvedValue([
        mockContent,
      ]);

      // Mock embedding failure for chunks (but not query)
      let callCount = 0;
      vi.spyOn(hybridAIEngine, "generateEmbedding").mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          // Query embedding succeeds
          return Array(384).fill(0.5);
        }
        // Chunk embeddings fail
        throw new Error("Embedding generation failed");
      });

      const results = await service.searchChunks("test query", {
        pocketId: "pocket-1",
      });

      // Should return empty results, not throw
      expect(results).toEqual([]);
    });

    it("should sort results by relevance", async () => {
      const { indexedDBManager } = await import("./indexeddb-manager");

      const mockContent = createMockContent(
        "content-1",
        "A".repeat(500) // Multiple chunks
      );

      vi.spyOn(indexedDBManager, "getContentByPocket").mockResolvedValue([
        mockContent,
      ]);

      // Mock varying similarities
      let callIndex = 0;
      const similarities = [0.9, 0.5, 0.8, 0.6, 0.7];
      vi.spyOn(service as any, "cosineSimilarity").mockImplementation(() => {
        return similarities[callIndex++ % similarities.length]!;
      });

      const results = await service.searchChunks("test query", {
        pocketId: "pocket-1",
        topK: 5,
      });

      // Should be sorted descending
      for (let i = 0; i < results.length - 1; i++) {
        expect(results[i]!.relevanceScore).toBeGreaterThanOrEqual(
          results[i + 1]!.relevanceScore
        );
      }
    });

    it("should handle multiple content items", async () => {
      const { indexedDBManager } = await import("./indexeddb-manager");

      const contents = [
        createMockContent("content-1", "First piece of content about machine learning"),
        createMockContent("content-2", "Second piece of content about artificial intelligence"),
        createMockContent("content-3", "Third piece of content about deep learning"),
      ];

      vi.spyOn(indexedDBManager, "getContentByPocket").mockResolvedValue(contents);

      const results = await service.searchChunks("content", {
        pocketId: "pocket-1",
        minRelevance: 0.1, // Lower threshold for this test
      });

      // Should process multiple content items (even if no results due to low similarity)
      // The test verifies the method handles multiple items without errors
      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
    });

    it("should handle different content types", async () => {
      const { indexedDBManager } = await import("./indexeddb-manager");

      const contents = [
        createMockContent("content-1", "Text content about machine learning", {
          type: ContentType.TEXT,
        }),
        createMockContent("content-2", "PDF content about artificial intelligence", {
          type: ContentType.PDF,
        }),
      ];

      vi.spyOn(indexedDBManager, "getContentByPocket").mockResolvedValue(contents);

      const results = await service.searchChunks("content", {
        pocketId: "pocket-1",
        minRelevance: 0.1, // Lower threshold
      });

      // Should process different content types without errors
      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty query", async () => {
      const { indexedDBManager } = await import("./indexeddb-manager");

      vi.spyOn(indexedDBManager, "getContentByPocket").mockResolvedValue([]);

      const results = await service.searchChunks("", {
        pocketId: "pocket-1",
      });

      expect(results).toEqual([]);
    });

    it("should handle very long content", async () => {
      const { indexedDBManager } = await import("./indexeddb-manager");

      const veryLongText = "A".repeat(50000); // Very long content
      const mockContent = createMockContent("content-1", veryLongText);

      vi.spyOn(indexedDBManager, "getContentByPocket").mockResolvedValue([
        mockContent,
      ]);

      const results = await service.searchChunks("test query", {
        pocketId: "pocket-1",
        topK: 5,
      });

      // Should handle without errors
      expect(results).toBeDefined();
      expect(results.length).toBeLessThanOrEqual(5);
    });

    it("should handle special characters in content", async () => {
      const { indexedDBManager } = await import("./indexeddb-manager");

      const specialContent = createMockContent(
        "content-1",
        "Content with émojis 🎉 and spëcial çharacters <>&\"'"
      );

      vi.spyOn(indexedDBManager, "getContentByPocket").mockResolvedValue([
        specialContent,
      ]);

      const results = await service.searchChunks("émojis", {
        pocketId: "pocket-1",
        minRelevance: 0.1, // Lower threshold
      });

      // Should handle special characters without errors
      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
    });

    it("should handle whitespace-only content", async () => {
      const { indexedDBManager } = await import("./indexeddb-manager");

      const whitespaceContent = createMockContent("content-1", "   \n\n\t  ");

      vi.spyOn(indexedDBManager, "getContentByPocket").mockResolvedValue([
        whitespaceContent,
      ]);

      const results = await service.searchChunks("test query", {
        pocketId: "pocket-1",
      });

      // Should skip empty content
      expect(results).toEqual([]);
    });

    it("should handle search service errors", async () => {
      const { indexedDBManager } = await import("./indexeddb-manager");

      vi.spyOn(indexedDBManager, "getContentByPocket").mockRejectedValue(
        new Error("Database error")
      );

      const results = await service.searchChunks("test query", {
        pocketId: "pocket-1",
      });

      // Should return empty results, not throw
      expect(results).toEqual([]);
    });
  });

  describe("Performance", () => {
    it("should handle large number of chunks efficiently", async () => {
      const { indexedDBManager } = await import("./indexeddb-manager");

      // Create 100 content items
      const contents = Array.from({ length: 100 }, (_, i) =>
        createMockContent(`content-${i}`, `Content ${i} with some text`)
      );

      vi.spyOn(indexedDBManager, "getContentByPocket").mockResolvedValue(contents);

      const startTime = Date.now();

      const results = await service.searchChunks("test query", {
        pocketId: "pocket-1",
        topK: 5,
      });

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete in reasonable time (< 5 seconds for test)
      expect(duration).toBeLessThan(5000);
      expect(results.length).toBeLessThanOrEqual(5);
    });
  });
});
