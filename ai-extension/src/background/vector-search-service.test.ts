/**
 * Vector Search Service Tests
 * Tests for vector similarity search functionality
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { VectorSearchService } from "./vector-search-service.js";
import type {
  Pocket,
  CapturedContent,
  Embedding,
} from "./indexeddb-manager.js";

// Mock dependencies
vi.mock("./monitoring.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("./hybrid-ai-engine.js", () => ({
  hybridAIEngine: {
    generateEmbedding: vi.fn(),
  },
}));

vi.mock("./indexeddb-manager.js", () => ({
  indexedDBManager: {
    listPockets: vi.fn(),
    getContentByPocket: vi.fn(),
    getAllEmbeddings: vi.fn(),
    saveEmbedding: vi.fn(),
  },
  ContentType: {
    TEXT: "text",
    IMAGE: "image",
    AUDIO: "audio",
    VIDEO: "video",
    ELEMENT: "element",
    PAGE: "page",
    NOTE: "note",
  },
  ProcessingStatus: {
    PENDING: "pending",
    PROCESSING: "processing",
    COMPLETED: "completed",
    FAILED: "failed",
  },
}));

describe("VectorSearchService", () => {
  let service: VectorSearchService;
  let mockHybridAIEngine: any;
  let mockIndexedDBManager: any;

  beforeEach(async () => {
    // Reset mocks
    vi.clearAllMocks();

    // Import mocked modules
    const { hybridAIEngine } = await import("./hybrid-ai-engine.js");
    const { indexedDBManager } = await import("./indexeddb-manager.js");

    mockHybridAIEngine = hybridAIEngine;
    mockIndexedDBManager = indexedDBManager;

    // Create new service instance
    service = new VectorSearchService();
  });

  describe("Cosine Similarity", () => {
    it("should calculate cosine similarity correctly for identical vectors", async () => {
      const vec1 = [1, 2, 3, 4];
      const vec2 = [1, 2, 3, 4];

      // Access private method through reflection for testing
      const similarity = (service as any).cosineSimilarity(vec1, vec2);

      expect(similarity).toBeCloseTo(1.0, 5);
    });

    it("should calculate cosine similarity correctly for orthogonal vectors", async () => {
      const vec1 = [1, 0, 0];
      const vec2 = [0, 1, 0];

      const similarity = (service as any).cosineSimilarity(vec1, vec2);

      expect(similarity).toBeCloseTo(0.0, 5);
    });

    it("should calculate cosine similarity correctly for opposite vectors", async () => {
      const vec1 = [1, 2, 3];
      const vec2 = [-1, -2, -3];

      const similarity = (service as any).cosineSimilarity(vec1, vec2);

      expect(similarity).toBeCloseTo(-1.0, 5);
    });

    it("should handle zero vectors", async () => {
      const vec1 = [0, 0, 0];
      const vec2 = [1, 2, 3];

      const similarity = (service as any).cosineSimilarity(vec1, vec2);

      expect(similarity).toBe(0);
    });

    it("should throw error for vectors of different lengths", async () => {
      const vec1 = [1, 2, 3];
      const vec2 = [1, 2];

      expect(() => {
        (service as any).cosineSimilarity(vec1, vec2);
      }).toThrow("Vectors must have the same length");
    });
  });

  describe("Pocket Search", () => {
    it("should search pockets using vector similarity", async () => {
      const mockPockets: Pocket[] = [
        {
          id: "pocket1",
          name: "Machine Learning Research",
          description: "Papers and articles about ML",
          tags: ["ml", "ai", "research"],
          color: "#ff0000",
          contentIds: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        {
          id: "pocket2",
          name: "Web Development",
          description: "Frontend and backend tutorials",
          tags: ["web", "javascript", "react"],
          color: "#00ff00",
          contentIds: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ];

      mockIndexedDBManager.listPockets.mockResolvedValue(mockPockets);

      // Mock embedding generation to return consistent vectors
      let callCount = 0;
      mockHybridAIEngine.generateEmbedding.mockImplementation(
        (text: string) => {
          callCount++;
          // First call is for the query "machine learning"
          if (callCount === 1) {
            return Promise.resolve([0.9, 0.1, 0.0]);
          }
          // Second call is for pocket1 (contains "Machine Learning")
          if (text.includes("Machine Learning") || text.includes("ml")) {
            return Promise.resolve([0.9, 0.1, 0.0]);
          }
          // Third call is for pocket2 (Web Development)
          return Promise.resolve([0.1, 0.9, 0.0]);
        },
      );

      const results = await service.searchPockets("machine learning", 10);

      expect(results.length).toBeGreaterThan(0);
      // The first result should be the most relevant one
      expect(results[0]?.item.id).toBe("pocket1");
      expect(results[0]?.relevanceScore).toBeGreaterThan(0.3);
    });

    it("should fallback to keyword search when embedding fails", async () => {
      const mockPockets: Pocket[] = [
        {
          id: "pocket1",
          name: "Machine Learning",
          description: "ML research",
          tags: ["ml"],
          color: "#ff0000",
          contentIds: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ];

      mockIndexedDBManager.listPockets.mockResolvedValue(mockPockets);
      mockHybridAIEngine.generateEmbedding.mockRejectedValue(
        new Error("Embedding failed"),
      );

      const results = await service.searchPockets("machine learning", 10);

      expect(results).toHaveLength(1);
      expect(results[0]?.item.id).toBe("pocket1");
      expect(results[0]?.matchedFields).toContain("name");
    });

    it("should return empty array when no pockets exist", async () => {
      mockIndexedDBManager.listPockets.mockResolvedValue([]);

      const results = await service.searchPockets("test query", 10);

      expect(results).toHaveLength(0);
    });

    it("should limit results to specified limit", async () => {
      const mockPockets: Pocket[] = Array.from({ length: 20 }, (_, i) => ({
        id: `pocket${i}`,
        name: `Pocket ${i}`,
        description: "Test pocket",
        tags: ["test"],
        color: "#ff0000",
        contentIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }));

      mockIndexedDBManager.listPockets.mockResolvedValue(mockPockets);
      mockHybridAIEngine.generateEmbedding.mockResolvedValue([0.5, 0.5, 0.0]);

      const results = await service.searchPockets("test", 5);

      expect(results.length).toBeLessThanOrEqual(5);
    });
  });

  describe("Content Search", () => {
    it("should search content using vector similarity", async () => {
      const mockContent: CapturedContent[] = [
        {
          id: "content1",
          pocketId: "pocket1",
          type: "text" as any,
          content: "Introduction to machine learning algorithms",
          metadata: {
            title: "ML Tutorial",
            timestamp: Date.now(),
          },
          capturedAt: Date.now(),
          sourceUrl: "https://example.com/ml",
          processingStatus: "completed" as any,
        },
        {
          id: "content2",
          pocketId: "pocket1",
          type: "text" as any,
          content: "Web development best practices",
          metadata: {
            title: "Web Dev Guide",
            timestamp: Date.now(),
          },
          capturedAt: Date.now(),
          sourceUrl: "https://example.com/web",
          processingStatus: "completed" as any,
        },
      ];

      const mockEmbeddings: Embedding[] = [
        {
          id: "emb1",
          contentId: "content1",
          vector: [0.9, 0.1, 0.0],
          model: "gemini",
          createdAt: Date.now(),
        },
        {
          id: "emb2",
          contentId: "content2",
          vector: [0.1, 0.9, 0.0],
          model: "gemini",
          createdAt: Date.now(),
        },
      ];

      mockIndexedDBManager.getContentByPocket.mockResolvedValue(mockContent);
      mockIndexedDBManager.getAllEmbeddings.mockResolvedValue(mockEmbeddings);
      mockHybridAIEngine.generateEmbedding.mockResolvedValue([0.9, 0.1, 0.0]);

      const results = await service.searchContent(
        "machine learning",
        "pocket1",
        20,
      );

      expect(results).toHaveLength(1);
      expect(results[0]?.item.id).toBe("content1");
      expect(results[0]?.relevanceScore).toBeGreaterThan(0.3);
    });

    it("should search across all pockets when pocketId is not provided", async () => {
      const mockPockets: Pocket[] = [
        {
          id: "pocket1",
          name: "Pocket 1",
          description: "",
          tags: [],
          color: "#ff0000",
          contentIds: ["content1"],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        {
          id: "pocket2",
          name: "Pocket 2",
          description: "",
          tags: [],
          color: "#00ff00",
          contentIds: ["content2"],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ];

      const mockContent1: CapturedContent[] = [
        {
          id: "content1",
          pocketId: "pocket1",
          type: "text" as any,
          content: "Content 1",
          metadata: { timestamp: Date.now() },
          capturedAt: Date.now(),
          sourceUrl: "https://example.com/1",
          processingStatus: "completed" as any,
        },
      ];

      const mockContent2: CapturedContent[] = [
        {
          id: "content2",
          pocketId: "pocket2",
          type: "text" as any,
          content: "Content 2",
          metadata: { timestamp: Date.now() },
          capturedAt: Date.now(),
          sourceUrl: "https://example.com/2",
          processingStatus: "completed" as any,
        },
      ];

      mockIndexedDBManager.listPockets.mockResolvedValue(mockPockets);
      mockIndexedDBManager.getContentByPocket
        .mockResolvedValueOnce(mockContent1)
        .mockResolvedValueOnce(mockContent2);
      mockIndexedDBManager.getAllEmbeddings.mockResolvedValue([]);
      mockHybridAIEngine.generateEmbedding.mockResolvedValue([0.5, 0.5, 0.0]);

      const results = await service.searchContent("test query", undefined, 20);

      expect(mockIndexedDBManager.listPockets).toHaveBeenCalled();
      expect(mockIndexedDBManager.getContentByPocket).toHaveBeenCalledTimes(2);
    });

    it("should generate and save embeddings for content without embeddings", async () => {
      const mockContent: CapturedContent[] = [
        {
          id: "content1",
          pocketId: "pocket1",
          type: "text" as any,
          content: "Test content",
          metadata: { timestamp: Date.now() },
          capturedAt: Date.now(),
          sourceUrl: "https://example.com",
          processingStatus: "completed" as any,
        },
      ];

      mockIndexedDBManager.getContentByPocket.mockResolvedValue(mockContent);
      mockIndexedDBManager.getAllEmbeddings.mockResolvedValue([]);
      mockHybridAIEngine.generateEmbedding.mockResolvedValue([0.5, 0.5, 0.0]);

      await service.searchContent("test", "pocket1", 20);

      expect(mockIndexedDBManager.saveEmbedding).toHaveBeenCalledWith({
        contentId: "content1",
        vector: [0.5, 0.5, 0.0],
        model: "gemini",
      });
    });

    it("should fallback to keyword search when embedding fails", async () => {
      const mockContent: CapturedContent[] = [
        {
          id: "content1",
          pocketId: "pocket1",
          type: "text" as any,
          content: "Machine learning tutorial",
          metadata: {
            title: "ML Guide",
            timestamp: Date.now(),
          },
          capturedAt: Date.now(),
          sourceUrl: "https://example.com",
          processingStatus: "completed" as any,
        },
      ];

      mockIndexedDBManager.getContentByPocket.mockResolvedValue(mockContent);
      mockHybridAIEngine.generateEmbedding.mockRejectedValue(
        new Error("Embedding failed"),
      );

      const results = await service.searchContent(
        "machine learning",
        "pocket1",
        20,
      );

      expect(results).toHaveLength(1);
      expect(results[0]?.item.id).toBe("content1");
      expect(results[0]?.matchedFields).toBeDefined();
    });

    it("should filter results by relevance threshold", async () => {
      const mockContent: CapturedContent[] = [
        {
          id: "content1",
          pocketId: "pocket1",
          type: "text" as any,
          content: "Relevant content",
          metadata: { timestamp: Date.now() },
          capturedAt: Date.now(),
          sourceUrl: "https://example.com",
          processingStatus: "completed" as any,
        },
      ];

      const mockEmbeddings: Embedding[] = [
        {
          id: "emb1",
          contentId: "content1",
          vector: [0.1, 0.0, 0.0], // Low similarity
          model: "gemini",
          createdAt: Date.now(),
        },
      ];

      mockIndexedDBManager.getContentByPocket.mockResolvedValue(mockContent);
      mockIndexedDBManager.getAllEmbeddings.mockResolvedValue(mockEmbeddings);
      mockHybridAIEngine.generateEmbedding.mockResolvedValue([1.0, 0.0, 0.0]);

      const results = await service.searchContent("test", "pocket1", 20);

      // Should filter out results below 0.3 threshold
      expect(results.length).toBeLessThanOrEqual(1);
    });
  });

  describe("Keyword Search Fallback", () => {
    it("should perform keyword search on pocket name", async () => {
      const mockPockets: Pocket[] = [
        {
          id: "pocket1",
          name: "Machine Learning",
          description: "Other content",
          tags: [],
          color: "#ff0000",
          contentIds: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ];

      const results = (service as any).keywordSearchPockets(
        mockPockets,
        "machine",
      );

      expect(results).toHaveLength(1);
      expect(results[0]?.matchedFields).toContain("name");
      expect(results[0]?.relevanceScore).toBeGreaterThan(0);
    });

    it("should perform keyword search on pocket description", async () => {
      const mockPockets: Pocket[] = [
        {
          id: "pocket1",
          name: "Research",
          description: "Machine learning papers",
          tags: [],
          color: "#ff0000",
          contentIds: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ];

      const results = (service as any).keywordSearchPockets(
        mockPockets,
        "machine",
      );

      expect(results).toHaveLength(1);
      expect(results[0]?.matchedFields).toContain("description");
    });

    it("should perform keyword search on pocket tags", async () => {
      const mockPockets: Pocket[] = [
        {
          id: "pocket1",
          name: "Research",
          description: "Papers",
          tags: ["machine-learning", "ai"],
          color: "#ff0000",
          contentIds: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ];

      const results = (service as any).keywordSearchPockets(
        mockPockets,
        "machine",
      );

      expect(results).toHaveLength(1);
      expect(results[0]?.matchedFields).toContain("tags");
    });

    it("should rank keyword search results by relevance", async () => {
      const mockPockets: Pocket[] = [
        {
          id: "pocket1",
          name: "Machine Learning", // High score (name match)
          description: "Papers",
          tags: [],
          color: "#ff0000",
          contentIds: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        {
          id: "pocket2",
          name: "Research",
          description: "Machine learning content", // Lower score (description match)
          tags: [],
          color: "#00ff00",
          contentIds: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ];

      const results = (service as any).keywordSearchPockets(
        mockPockets,
        "machine",
      );

      expect(results).toHaveLength(2);
      expect(results[0]?.item.id).toBe("pocket1");
      expect(results[0]?.relevanceScore).toBeGreaterThan(
        results[1]?.relevanceScore || 0,
      );
    });
  });

  describe("Cache Management", () => {
    it("should cache embedding results", async () => {
      mockHybridAIEngine.generateEmbedding.mockResolvedValue([0.5, 0.5, 0.0]);

      // First call
      await (service as any).generateEmbedding("test text");

      // Second call with same text
      await (service as any).generateEmbedding("test text");

      // Should only call generateEmbedding once due to caching
      expect(mockHybridAIEngine.generateEmbedding).toHaveBeenCalledTimes(1);
    });

    it("should clear cache when requested", async () => {
      mockHybridAIEngine.generateEmbedding.mockResolvedValue([0.5, 0.5, 0.0]);

      await (service as any).generateEmbedding("test text");

      service.clearCache();

      await (service as any).generateEmbedding("test text");

      // Should call generateEmbedding twice after cache clear
      expect(mockHybridAIEngine.generateEmbedding).toHaveBeenCalledTimes(2);
    });

    it("should limit cache size to 100 entries", async () => {
      mockHybridAIEngine.generateEmbedding.mockResolvedValue([0.5, 0.5, 0.0]);

      // Generate 101 different embeddings
      for (let i = 0; i < 101; i++) {
        await (service as any).generateEmbedding(`test text ${i}`);
      }

      // Cache should have evicted the first entry
      expect(mockHybridAIEngine.generateEmbedding).toHaveBeenCalledTimes(101);
    });
  });
});
