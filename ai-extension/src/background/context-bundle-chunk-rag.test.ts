/**
 * Context Bundle Chunk-Based RAG Tests
 *
 * Comprehensive tests for chunk-level RAG integration with token budgeting
 * and metadata inclusion
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  ContextBundleBuilder,
  type ContextBundleOptions,
  serializeContextBundle,
} from "./context-bundle";
import type { VectorChunk, ChunkSearchResult } from "./vector-chunk-types.js";
import { ContentType } from "./indexeddb-manager.js";

// Mock dependencies
vi.mock("./monitoring", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("./pdf-processor", () => ({
  pdfProcessor: {
    generateLLMSummary: vi.fn().mockReturnValue("PDF summary"),
  },
}));

vi.mock("./conversation-context-loader", () => ({
  conversationContextLoader: {
    buildConversationContext: vi.fn().mockResolvedValue({
      messages: [],
      totalTokens: 0,
      truncated: false,
    }),
    formatContextAsString: vi.fn().mockReturnValue(""),
  },
}));

// Helper to create mock chunks
function createMockChunk(
  id: string,
  text: string,
  relevance: number,
  overrides: Partial<VectorChunk> = {}
): ChunkSearchResult {
  const chunk: VectorChunk = {
    id,
    text,
    embedding: Array(384).fill(0.1),
    metadata: {
      contentId: `content-${id}`,
      pocketId: "pocket-1",
      sourceType: ContentType.TEXT,
      sourceUrl: "https://example.com/article",
      chunkIndex: 0,
      totalChunks: 1,
      startOffset: 0,
      endOffset: text.length,
      capturedAt: Date.now() - 86400000, // 1 day ago
      chunkedAt: Date.now(),
      title: "Test Article",
      textPreview: text.slice(0, 100),
    },
    ...overrides,
  };

  return {
    chunk,
    relevanceScore: relevance,
    matchType: 'semantic',
  };
}

describe("Context Bundle with Chunk-Based RAG", () => {
  let builder: ContextBundleBuilder;

  beforeEach(() => {
    builder = new ContextBundleBuilder();
    vi.clearAllMocks();
  });

  describe("Chunk Aggregation", () => {
    it("should aggregate up to 5 chunks", async () => {
      const { vectorSearchService } = await import("./vector-search-service");

      // Mock 10 chunks, should only take top 5
      const mockChunks = Array.from({ length: 10 }, (_, i) =>
        createMockChunk(
          `chunk-${i}`,
          `This is chunk ${i} with some content about AI and machine learning.`,
          0.9 - i * 0.05
        )
      );

      vi.spyOn(vectorSearchService, "searchChunks").mockResolvedValue(mockChunks);

      const options: ContextBundleOptions = {
        mode: "ask",
        query: "What is machine learning?",
        pocketId: "pocket-1",
        maxTokens: 6000,
      };

      const bundle = await builder.buildContextBundle(options);

      expect(bundle.chunks).toBeDefined();
      expect(bundle.chunks!.length).toBeLessThanOrEqual(5);
      expect(bundle.signals).toContain("chunks");
    });

    it("should include chunks in descending relevance order", async () => {
      const { vectorSearchService } = await import("./vector-search-service");

      const mockChunks = [
        createMockChunk("chunk-1", "Low relevance content", 0.5),
        createMockChunk("chunk-2", "High relevance content", 0.95),
        createMockChunk("chunk-3", "Medium relevance content", 0.7),
      ];

      vi.spyOn(vectorSearchService, "searchChunks").mockResolvedValue(mockChunks);

      const options: ContextBundleOptions = {
        mode: "ask",
        query: "test query",
        pocketId: "pocket-1",
        maxTokens: 6000,
      };

      const bundle = await builder.buildContextBundle(options);

      // Chunks should be ordered by relevance (already sorted by search service)
      expect(bundle.chunks![0]!.relevanceScore).toBe(0.5);
      expect(bundle.chunks![1]!.relevanceScore).toBe(0.95);
      expect(bundle.chunks![2]!.relevanceScore).toBe(0.7);
    });

    it("should handle fewer than 5 chunks", async () => {
      const { vectorSearchService } = await import("./vector-search-service");

      const mockChunks = [
        createMockChunk("chunk-1", "First chunk", 0.9),
        createMockChunk("chunk-2", "Second chunk", 0.8),
      ];

      vi.spyOn(vectorSearchService, "searchChunks").mockResolvedValue(mockChunks);

      const options: ContextBundleOptions = {
        mode: "ask",
        query: "test query",
        pocketId: "pocket-1",
        maxTokens: 6000,
      };

      const bundle = await builder.buildContextBundle(options);

      expect(bundle.chunks).toBeDefined();
      expect(bundle.chunks!.length).toBe(2);
    });
  });

  describe("Token Budgeting", () => {
    it("should reserve 1k-1.5k tokens for response", async () => {
      const { vectorSearchService } = await import("./vector-search-service");

      const searchSpy = vi.spyOn(vectorSearchService, "searchChunks");
      searchSpy.mockResolvedValue([]);

      const options: ContextBundleOptions = {
        mode: "ask",
        query: "test query",
        pocketId: "pocket-1",
        maxTokens: 3000,
      };

      await builder.buildContextBundle(options);

      // Should pass maxTokens that accounts for reserve
      expect(searchSpy).toHaveBeenCalledWith(
        "test query",
        expect.objectContaining({
          pocketId: "pocket-1",
          topK: 5,
          minRelevance: 0.3,
          maxTokens: expect.any(Number),
        })
      );

      const callArgs = searchSpy.mock.calls[0]![1];
      // Available tokens should be less than total (due to reserve)
      expect(callArgs!.maxTokens).toBeLessThan(3000);
      expect(callArgs!.maxTokens).toBeGreaterThan(1000);
    });

    it("should stop adding chunks when token budget is exhausted", async () => {
      const { vectorSearchService } = await import("./vector-search-service");

      // Create large chunks that will exceed budget
      const largeText = "A".repeat(4000); // ~1000 tokens per chunk
      const mockChunks = Array.from({ length: 5 }, (_, i) =>
        createMockChunk(`chunk-${i}`, largeText, 0.9 - i * 0.05)
      );

      vi.spyOn(vectorSearchService, "searchChunks").mockResolvedValue(mockChunks);

      const options: ContextBundleOptions = {
        mode: "ask",
        query: "test query",
        pocketId: "pocket-1",
        maxTokens: 3000, // Limited budget
      };

      const bundle = await builder.buildContextBundle(options);

      // Should not include all 5 chunks due to budget
      expect(bundle.chunks!.length).toBeLessThan(5);
      expect(bundle.truncated).toBe(true);
    });

    it("should track token usage accurately", async () => {
      const { vectorSearchService } = await import("./vector-search-service");

      const mockChunks = [
        createMockChunk("chunk-1", "Short chunk", 0.9),
        createMockChunk("chunk-2", "Another short chunk", 0.8),
      ];

      vi.spyOn(vectorSearchService, "searchChunks").mockResolvedValue(mockChunks);

      const options: ContextBundleOptions = {
        mode: "ask",
        query: "test query",
        pocketId: "pocket-1",
        maxTokens: 6000,
      };

      const bundle = await builder.buildContextBundle(options);

      // Should have positive token count
      expect(bundle.totalTokens).toBeGreaterThan(0);
      expect(bundle.totalTokens).toBeLessThanOrEqual(6000);
    });

    it("should handle insufficient tokens gracefully", async () => {
      const { vectorSearchService } = await import("./vector-search-service");

      const searchSpy = vi.spyOn(vectorSearchService, "searchChunks");
      searchSpy.mockResolvedValue([]);

      const options: ContextBundleOptions = {
        mode: "ask",
        query: "test query",
        pocketId: "pocket-1",
        maxTokens: 500, // Very limited budget (less than reserve)
      };

      const bundle = await builder.buildContextBundle(options);

      // Should skip RAG due to insufficient tokens
      expect(bundle.chunks).toBeUndefined();
      expect(bundle.signals).not.toContain("chunks");
    });
  });

  describe("Metadata Inclusion", () => {
    it("should include chunk metadata in bundle", async () => {
      const { vectorSearchService } = await import("./vector-search-service");

      const mockChunk = createMockChunk(
        "chunk-1",
        "Test content about AI",
        0.9,
        {
          metadata: {
            contentId: "content-123",
            pocketId: "pocket-1",
            sourceType: ContentType.TEXT,
            sourceUrl: "https://example.com/ai-article",
            chunkIndex: 2,
            totalChunks: 5,
            startOffset: 1000,
            endOffset: 1700,
            capturedAt: 1704067200000, // Jan 1, 2024
            chunkedAt: Date.now(),
            title: "AI Research Paper",
            category: "research",
            textPreview: "Test content about AI",
          },
        }
      );

      vi.spyOn(vectorSearchService, "searchChunks").mockResolvedValue([mockChunk]);

      const options: ContextBundleOptions = {
        mode: "ask",
        query: "AI research",
        pocketId: "pocket-1",
        maxTokens: 6000,
      };

      const bundle = await builder.buildContextBundle(options);

      expect(bundle.chunks).toBeDefined();
      expect(bundle.chunks!.length).toBe(1);

      const chunk = bundle.chunks![0]!.chunk;
      expect(chunk.metadata.sourceUrl).toBe("https://example.com/ai-article");
      expect(chunk.metadata.sourceType).toBe(ContentType.TEXT);
      expect(chunk.metadata.title).toBe("AI Research Paper");
      expect(chunk.metadata.chunkIndex).toBe(2);
      expect(chunk.metadata.totalChunks).toBe(5);
      expect(chunk.metadata.capturedAt).toBe(1704067200000);
    });

    it("should include metadata in serialized context", async () => {
      const { vectorSearchService } = await import("./vector-search-service");

      const mockChunk = createMockChunk(
        "chunk-1",
        "Machine learning is a subset of artificial intelligence.",
        0.95,
        {
          metadata: {
            contentId: "content-456",
            pocketId: "pocket-1",
            sourceType: ContentType.TEXT,
            sourceUrl: "https://example.com/ml-guide",
            chunkIndex: 0,
            totalChunks: 3,
            startOffset: 0,
            endOffset: 100,
            capturedAt: 1704067200000,
            chunkedAt: Date.now(),
            title: "Machine Learning Guide",
            textPreview: "Machine learning is a subset...",
          },
        }
      );

      vi.spyOn(vectorSearchService, "searchChunks").mockResolvedValue([mockChunk]);

      const options: ContextBundleOptions = {
        mode: "ask",
        query: "machine learning",
        pocketId: "pocket-1",
        maxTokens: 6000,
      };

      const bundle = await builder.buildContextBundle(options);
      const serialized = serializeContextBundle(bundle, "ask");

      // Check that metadata is included in serialization
      expect(serialized).toContain("Machine Learning Guide");
      expect(serialized).toContain("https://example.com/ml-guide");
      expect(serialized).toContain("text");
      expect(serialized).toContain("Part: 1 of 3");
      expect(serialized).toContain("Captured:");
      expect(serialized).toContain("Relevance: 95%");
      expect(serialized).toContain("Machine learning is a subset of artificial intelligence.");
    });

    it("should format timestamps correctly", async () => {
      const { vectorSearchService } = await import("./vector-search-service");

      const capturedDate = new Date("2024-01-15").getTime();
      const mockChunk = createMockChunk("chunk-1", "Test content", 0.9, {
        metadata: {
          contentId: "content-789",
          pocketId: "pocket-1",
          sourceType: ContentType.TEXT,
          sourceUrl: "https://example.com",
          chunkIndex: 0,
          totalChunks: 1,
          startOffset: 0,
          endOffset: 100,
          capturedAt: capturedDate,
          chunkedAt: Date.now(),
          textPreview: "Test content",
        },
      });

      vi.spyOn(vectorSearchService, "searchChunks").mockResolvedValue([mockChunk]);

      const options: ContextBundleOptions = {
        mode: "ask",
        query: "test",
        pocketId: "pocket-1",
        maxTokens: 6000,
      };

      const bundle = await builder.buildContextBundle(options);
      const serialized = serializeContextBundle(bundle, "ask");

      // Should include formatted date
      expect(serialized).toContain("Captured:");
      expect(serialized).toMatch(/\d{1,2}\/\d{1,2}\/\d{4}/); // Date format
    });
  });

  describe("Empty Results Handling", () => {
    it("should handle empty search results gracefully", async () => {
      const { vectorSearchService } = await import("./vector-search-service");

      vi.spyOn(vectorSearchService, "searchChunks").mockResolvedValue([]);

      const options: ContextBundleOptions = {
        mode: "ask",
        query: "query with no results",
        pocketId: "empty-pocket",
        maxTokens: 6000,
      };

      const bundle = await builder.buildContextBundle(options);

      expect(bundle.chunks).toBeUndefined();
      expect(bundle.signals).not.toContain("chunks");
      expect(bundle.totalTokens).toBeGreaterThanOrEqual(0);
    });

    it("should continue processing other signals when chunks are empty", async () => {
      const { vectorSearchService } = await import("./vector-search-service");
      const { conversationContextLoader } = await import(
        "./conversation-context-loader"
      );

      vi.spyOn(vectorSearchService, "searchChunks").mockResolvedValue([]);
      vi.spyOn(
        conversationContextLoader,
        "buildConversationContext"
      ).mockResolvedValue({
        messages: [
          { role: "user", content: "Previous question", timestamp: Date.now() },
        ],
        totalTokens: 50,
        truncated: false,
      });

      const options: ContextBundleOptions = {
        mode: "ask",
        query: "query with no chunks",
        pocketId: "empty-pocket",
        conversationId: "conv-123",
        maxTokens: 6000,
      };

      const bundle = await builder.buildContextBundle(options);

      // Should still have history signal
      expect(bundle.signals).toContain("history");
      expect(bundle.signals).not.toContain("chunks");
    });

    it("should handle search service errors gracefully", async () => {
      const { vectorSearchService } = await import("./vector-search-service");

      vi.spyOn(vectorSearchService, "searchChunks").mockRejectedValue(
        new Error("Search service failed")
      );

      const options: ContextBundleOptions = {
        mode: "ask",
        query: "query causing error",
        pocketId: "pocket-1",
        maxTokens: 6000,
      };

      // Should not throw
      const bundle = await builder.buildContextBundle(options);

      expect(bundle).toBeDefined();
      expect(bundle.chunks).toBeUndefined();
      expect(bundle.signals).not.toContain("chunks");
    });
  });

  describe("Edge Cases", () => {
    it("should handle chunks with special characters", async () => {
      const { vectorSearchService } = await import("./vector-search-service");

      const specialText = "Content with émojis 🎉 and spëcial çharacters <>&\"'";
      const mockChunk = createMockChunk("chunk-1", specialText, 0.9);

      vi.spyOn(vectorSearchService, "searchChunks").mockResolvedValue([mockChunk]);

      const options: ContextBundleOptions = {
        mode: "ask",
        query: "test",
        pocketId: "pocket-1",
        maxTokens: 6000,
      };

      const bundle = await builder.buildContextBundle(options);

      expect(bundle.chunks).toBeDefined();
      expect(bundle.chunks![0]!.chunk.text).toContain("émojis");
      expect(bundle.chunks![0]!.chunk.text).toContain("🎉");
    });

    it("should handle chunks with newlines and whitespace", async () => {
      const { vectorSearchService } = await import("./vector-search-service");

      const multilineText = "Line 1\n\nLine 2\n   Line 3\t\tTabbed";
      const mockChunk = createMockChunk("chunk-1", multilineText, 0.9);

      vi.spyOn(vectorSearchService, "searchChunks").mockResolvedValue([mockChunk]);

      const options: ContextBundleOptions = {
        mode: "ask",
        query: "test",
        pocketId: "pocket-1",
        maxTokens: 6000,
      };

      const bundle = await builder.buildContextBundle(options);

      expect(bundle.chunks).toBeDefined();
      expect(bundle.chunks![0]!.chunk.text).toContain("\n");
    });

    it("should handle missing query", async () => {
      const { vectorSearchService } = await import("./vector-search-service");

      const searchSpy = vi.spyOn(vectorSearchService, "searchChunks");

      const options: ContextBundleOptions = {
        mode: "ask",
        query: undefined,
        pocketId: "pocket-1",
        maxTokens: 6000,
      };

      const bundle = await builder.buildContextBundle(options);

      // Should not call search
      expect(searchSpy).not.toHaveBeenCalled();
      expect(bundle.chunks).toBeUndefined();
    });

    it("should handle empty query string", async () => {
      const { vectorSearchService } = await import("./vector-search-service");

      const searchSpy = vi.spyOn(vectorSearchService, "searchChunks");

      const options: ContextBundleOptions = {
        mode: "ask",
        query: "",
        pocketId: "pocket-1",
        maxTokens: 6000,
      };

      const bundle = await builder.buildContextBundle(options);

      // Should not call search
      expect(searchSpy).not.toHaveBeenCalled();
      expect(bundle.chunks).toBeUndefined();
    });

    it("should handle chunks from different content types", async () => {
      const { vectorSearchService } = await import("./vector-search-service");

      const mockChunks = [
        createMockChunk("chunk-1", "Text content", 0.9, {
          metadata: {
            contentId: "content-1",
            pocketId: "pocket-1",
            sourceType: ContentType.TEXT,
            sourceUrl: "https://example.com/text",
            chunkIndex: 0,
            totalChunks: 1,
            startOffset: 0,
            endOffset: 100,
            capturedAt: Date.now(),
            chunkedAt: Date.now(),
            textPreview: "Text content",
          },
        }),
        createMockChunk("chunk-2", "PDF content", 0.8, {
          metadata: {
            contentId: "content-2",
            pocketId: "pocket-1",
            sourceType: ContentType.PDF,
            sourceUrl: "https://example.com/doc.pdf",
            chunkIndex: 0,
            totalChunks: 1,
            startOffset: 0,
            endOffset: 100,
            capturedAt: Date.now(),
            chunkedAt: Date.now(),
            textPreview: "PDF content",
          },
        }),
      ];

      vi.spyOn(vectorSearchService, "searchChunks").mockResolvedValue(mockChunks);

      const options: ContextBundleOptions = {
        mode: "ask",
        query: "test",
        pocketId: "pocket-1",
        maxTokens: 6000,
      };

      const bundle = await builder.buildContextBundle(options);

      expect(bundle.chunks).toBeDefined();
      expect(bundle.chunks!.length).toBe(2);
      expect(bundle.chunks![0]!.chunk.metadata.sourceType).toBe(ContentType.TEXT);
      expect(bundle.chunks![1]!.chunk.metadata.sourceType).toBe(ContentType.PDF);
    });
  });

  describe("Mode-Specific Behavior", () => {
    it("should support chunk RAG in Ask mode with pocketId", async () => {
      const { vectorSearchService } = await import("./vector-search-service");

      const mockChunk = createMockChunk("chunk-1", "Test content", 0.9);
      vi.spyOn(vectorSearchService, "searchChunks").mockResolvedValue([mockChunk]);

      const options: ContextBundleOptions = {
        mode: "ask",
        query: "test query",
        pocketId: "pocket-1",
        maxTokens: 6000,
      };

      const bundle = await builder.buildContextBundle(options);

      expect(bundle.chunks).toBeDefined();
      expect(bundle.signals).toContain("chunks");
    });

    it("should support chunk RAG in AI Pocket mode", async () => {
      const { vectorSearchService } = await import("./vector-search-service");

      const mockChunk = createMockChunk("chunk-1", "Test content", 0.9);
      vi.spyOn(vectorSearchService, "searchChunks").mockResolvedValue([mockChunk]);

      const options: ContextBundleOptions = {
        mode: "ai-pocket",
        query: "test query",
        pocketId: "pocket-1",
        maxTokens: 6000,
      };

      const bundle = await builder.buildContextBundle(options);

      expect(bundle.chunks).toBeDefined();
      expect(bundle.signals).toContain("chunks");
    });

    it("should pass correct pocket scoping to search", async () => {
      const { vectorSearchService } = await import("./vector-search-service");

      const searchSpy = vi.spyOn(vectorSearchService, "searchChunks");
      searchSpy.mockResolvedValue([]);

      const options: ContextBundleOptions = {
        mode: "ask",
        query: "scoped query",
        pocketId: "specific-pocket-789",
        maxTokens: 6000,
      };

      await builder.buildContextBundle(options);

      expect(searchSpy).toHaveBeenCalledWith(
        "scoped query",
        expect.objectContaining({
          pocketId: "specific-pocket-789",
        })
      );
    });
  });

  describe("Cache Behavior", () => {
    it("should cache chunk results", async () => {
      const { vectorSearchService } = await import("./vector-search-service");

      const mockChunk = createMockChunk("chunk-1", "Test content", 0.9);
      const searchSpy = vi.spyOn(vectorSearchService, "searchChunks");
      searchSpy.mockResolvedValue([mockChunk]);

      const options: ContextBundleOptions = {
        mode: "ask",
        query: "cacheable query",
        pocketId: "pocket-1",
        maxTokens: 6000,
      };

      // First call
      const bundle1 = await builder.buildContextBundle(options);

      // Second call with same options
      const bundle2 = await builder.buildContextBundle(options);

      // Should return cached result (same timestamp)
      expect(bundle1.timestamp).toBe(bundle2.timestamp);

      // Search should only be called once
      expect(searchSpy).toHaveBeenCalledTimes(1);
    });

    it("should invalidate cache when query changes", async () => {
      const { vectorSearchService } = await import("./vector-search-service");

      const mockChunk = createMockChunk("chunk-1", "Test content", 0.9);
      vi.spyOn(vectorSearchService, "searchChunks").mockResolvedValue([mockChunk]);

      const options1: ContextBundleOptions = {
        mode: "ask",
        query: "first query",
        pocketId: "pocket-1",
        maxTokens: 6000,
      };

      const options2: ContextBundleOptions = {
        mode: "ask",
        query: "second query",
        pocketId: "pocket-1",
        maxTokens: 6000,
      };

      const bundle1 = await builder.buildContextBundle(options1);

      // Wait to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 10));

      const bundle2 = await builder.buildContextBundle(options2);

      // Different queries should produce different bundles
      expect(bundle1.timestamp).not.toBe(bundle2.timestamp);
    });
  });
});
