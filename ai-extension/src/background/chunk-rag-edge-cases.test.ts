/**
 * Chunk-Level RAG Edge Cases Test
 * 
 * Tests edge cases and error scenarios for RAG implementation
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { ContextBundleBuilder, type ContextBundleOptions } from "./context-bundle";

// Mock dependencies
vi.mock("./monitoring", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
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

vi.mock("./content-extractor", () => ({
  extractLLMContent: vi.fn((content) => {
    if (typeof content.content === "string") {
      return content.content;
    }
    return content.metadata.title || "";
  }),
}));

describe("Chunk-Level RAG Edge Cases", () => {
  let builder: ContextBundleBuilder;

  beforeEach(() => {
    builder = new ContextBundleBuilder();
    vi.clearAllMocks();
  });

  describe("Missing Query Validation", () => {
    it("should skip RAG when query is undefined", async () => {
      const { vectorSearchService } = await import("./vector-search-service");
      const searchSpy = vi.spyOn(vectorSearchService, "searchContent");

      const options: ContextBundleOptions = {
        mode: "ask",
        query: undefined, // No query
        pocketId: "pocket-123",
        maxTokens: 6000,
      };

      const bundle = await builder.buildContextBundle(options);

      // Should not call vector search
      expect(searchSpy).not.toHaveBeenCalled();
      expect(bundle.signals).not.toContain("pockets");
    });

    it("should skip RAG when query is empty string", async () => {
      const { vectorSearchService } = await import("./vector-search-service");
      const searchSpy = vi.spyOn(vectorSearchService, "searchContent");

      const options: ContextBundleOptions = {
        mode: "ask",
        query: "", // Empty query
        pocketId: "pocket-123",
        maxTokens: 6000,
      };

      const bundle = await builder.buildContextBundle(options);

      // Should not call vector search
      expect(searchSpy).not.toHaveBeenCalled();
      expect(bundle.signals).not.toContain("pockets");
    });
  });

  describe("Very Large Content Handling", () => {
    it("should truncate when content exceeds budget", async () => {
      const { vectorSearchService } = await import("./vector-search-service");
      
      // Create very large content items
      const largeContent = "A".repeat(20000); // ~5000 tokens
      
      vi.spyOn(vectorSearchService, "searchContent").mockResolvedValue([
        {
          item: {
            id: "large-1",
            pocketId: "pocket-1",
            type: "text",
            content: largeContent,
            metadata: { timestamp: Date.now() },
            capturedAt: Date.now(),
            sourceUrl: "https://example.com",
            processingStatus: "completed",
          },
          relevanceScore: 0.95,
          matchedFields: ["semantic"],
        },
        {
          item: {
            id: "large-2",
            pocketId: "pocket-1",
            type: "text",
            content: largeContent,
            metadata: { timestamp: Date.now() },
            capturedAt: Date.now(),
            sourceUrl: "https://example.com",
            processingStatus: "completed",
          },
          relevanceScore: 0.90,
          matchedFields: ["semantic"],
        },
      ]);

      const options: ContextBundleOptions = {
        mode: "ask",
        query: "test query",
        pocketId: "pocket-1",
        maxTokens: 3000, // Limited budget
      };

      const bundle = await builder.buildContextBundle(options);

      // Should have truncated
      expect(bundle.truncated).toBe(true);
      expect(bundle.totalTokens).toBeLessThanOrEqual(3000);
    });

    it("should handle content that exceeds entire budget", async () => {
      const { vectorSearchService } = await import("./vector-search-service");
      
      // Create extremely large content
      const hugeContent = "X".repeat(50000); // ~12500 tokens
      
      vi.spyOn(vectorSearchService, "searchContent").mockResolvedValue([
        {
          item: {
            id: "huge-1",
            pocketId: "pocket-1",
            type: "text",
            content: hugeContent,
            metadata: { timestamp: Date.now() },
            capturedAt: Date.now(),
            sourceUrl: "https://example.com",
            processingStatus: "completed",
          },
          relevanceScore: 0.99,
          matchedFields: ["semantic"],
        },
      ]);

      const options: ContextBundleOptions = {
        mode: "ask",
        query: "test query",
        pocketId: "pocket-1",
        maxTokens: 1000, // Very limited budget
      };

      const bundle = await builder.buildContextBundle(options);

      // Should mark as truncated and not include any pockets
      expect(bundle.truncated).toBe(true);
      expect(bundle.pockets?.length || 0).toBe(0);
    });
  });

  describe("Special Character Handling", () => {
    it("should handle content with special characters", async () => {
      const { vectorSearchService } = await import("./vector-search-service");
      
      vi.spyOn(vectorSearchService, "searchContent").mockResolvedValue([
        {
          item: {
            id: "special-1",
            pocketId: "pocket-1",
            type: "text",
            content: "Content with émojis 🎉 and spëcial çharacters <>&\"'",
            metadata: { timestamp: Date.now() },
            capturedAt: Date.now(),
            sourceUrl: "https://example.com",
            processingStatus: "completed",
          },
          relevanceScore: 0.85,
          matchedFields: ["semantic"],
        },
      ]);

      const options: ContextBundleOptions = {
        mode: "ask",
        query: "test query",
        pocketId: "pocket-1",
        maxTokens: 6000,
      };

      const bundle = await builder.buildContextBundle(options);

      expect(bundle.pockets).toBeDefined();
      expect(bundle.pockets!.length).toBe(1);
      expect(bundle.pockets![0]!.content.content).toContain("émojis");
    });

    it("should handle content with newlines and whitespace", async () => {
      const { vectorSearchService } = await import("./vector-search-service");
      
      vi.spyOn(vectorSearchService, "searchContent").mockResolvedValue([
        {
          item: {
            id: "whitespace-1",
            pocketId: "pocket-1",
            type: "text",
            content: "Line 1\n\nLine 2\n   Line 3\t\tTabbed",
            metadata: { timestamp: Date.now() },
            capturedAt: Date.now(),
            sourceUrl: "https://example.com",
            processingStatus: "completed",
          },
          relevanceScore: 0.80,
          matchedFields: ["semantic"],
        },
      ]);

      const options: ContextBundleOptions = {
        mode: "ask",
        query: "test query",
        pocketId: "pocket-1",
        maxTokens: 6000,
      };

      const bundle = await builder.buildContextBundle(options);

      expect(bundle.pockets).toBeDefined();
      expect(bundle.pockets!.length).toBe(1);
    });
  });

  describe("Multiple Pocket Scenarios", () => {
    it("should handle pocketId that doesn't exist", async () => {
      const { vectorSearchService } = await import("./vector-search-service");
      
      // Mock empty results for non-existent pocket
      vi.spyOn(vectorSearchService, "searchContent").mockResolvedValue([]);

      const options: ContextBundleOptions = {
        mode: "ask",
        query: "test query",
        pocketId: "non-existent-pocket",
        maxTokens: 6000,
      };

      const bundle = await builder.buildContextBundle(options);

      // Should handle gracefully
      expect(bundle.pockets).toBeUndefined();
      expect(bundle.signals).not.toContain("pockets");
    });

    it("should handle switching between pockets", async () => {
      const { vectorSearchService } = await import("./vector-search-service");
      
      const searchSpy = vi.spyOn(vectorSearchService, "searchContent");
      
      // First call with pocket-1
      searchSpy.mockResolvedValueOnce([
        {
          item: {
            id: "content-1",
            pocketId: "pocket-1",
            type: "text",
            content: "Content from pocket 1",
            metadata: { timestamp: Date.now() },
            capturedAt: Date.now(),
            sourceUrl: "https://example.com",
            processingStatus: "completed",
          },
          relevanceScore: 0.90,
          matchedFields: ["semantic"],
        },
      ]);

      const options1: ContextBundleOptions = {
        mode: "ask",
        query: "test query",
        pocketId: "pocket-1",
        maxTokens: 6000,
      };

      const bundle1 = await builder.buildContextBundle(options1);
      expect(bundle1.pockets![0]!.content.pocketId).toBe("pocket-1");

      // Second call with pocket-2
      searchSpy.mockResolvedValueOnce([
        {
          item: {
            id: "content-2",
            pocketId: "pocket-2",
            type: "text",
            content: "Content from pocket 2",
            metadata: { timestamp: Date.now() },
            capturedAt: Date.now(),
            sourceUrl: "https://example.com",
            processingStatus: "completed",
          },
          relevanceScore: 0.85,
          matchedFields: ["semantic"],
        },
      ]);

      const options2: ContextBundleOptions = {
        mode: "ask",
        query: "test query",
        pocketId: "pocket-2",
        maxTokens: 6000,
      };

      // Clear cache to force new search
      builder.clearCache();

      const bundle2 = await builder.buildContextBundle(options2);
      expect(bundle2.pockets![0]!.content.pocketId).toBe("pocket-2");

      // Verify searches were scoped correctly
      expect(searchSpy).toHaveBeenNthCalledWith(1, "test query", "pocket-1", 5);
      expect(searchSpy).toHaveBeenNthCalledWith(2, "test query", "pocket-2", 5);
    });
  });

  describe("Relevance Score Edge Cases", () => {
    it("should handle zero relevance scores", async () => {
      const { vectorSearchService } = await import("./vector-search-service");
      
      vi.spyOn(vectorSearchService, "searchContent").mockResolvedValue([
        {
          item: {
            id: "zero-relevance",
            pocketId: "pocket-1",
            type: "text",
            content: "Not relevant content",
            metadata: { timestamp: Date.now() },
            capturedAt: Date.now(),
            sourceUrl: "https://example.com",
            processingStatus: "completed",
          },
          relevanceScore: 0,
          matchedFields: ["semantic"],
        },
      ]);

      const options: ContextBundleOptions = {
        mode: "ask",
        query: "test query",
        pocketId: "pocket-1",
        maxTokens: 6000,
      };

      const bundle = await builder.buildContextBundle(options);

      // Should still include content with 0 relevance if returned by search
      expect(bundle.pockets).toBeDefined();
      expect(bundle.pockets!.length).toBe(1);
      expect(bundle.pockets![0]!.relevanceScore).toBe(0);
    });

    it("should handle perfect relevance scores", async () => {
      const { vectorSearchService } = await import("./vector-search-service");
      
      vi.spyOn(vectorSearchService, "searchContent").mockResolvedValue([
        {
          item: {
            id: "perfect-match",
            pocketId: "pocket-1",
            type: "text",
            content: "Perfect match",
            metadata: { timestamp: Date.now() },
            capturedAt: Date.now(),
            sourceUrl: "https://example.com",
            processingStatus: "completed",
          },
          relevanceScore: 1.0,
          matchedFields: ["semantic"],
        },
      ]);

      const options: ContextBundleOptions = {
        mode: "ask",
        query: "test query",
        pocketId: "pocket-1",
        maxTokens: 6000,
      };

      const bundle = await builder.buildContextBundle(options);

      expect(bundle.pockets![0]!.relevanceScore).toBe(1.0);
    });
  });

  describe("Concurrent Request Handling", () => {
    it("should handle multiple concurrent requests", async () => {
      const { vectorSearchService } = await import("./vector-search-service");
      
      vi.spyOn(vectorSearchService, "searchContent").mockResolvedValue([
        {
          item: {
            id: "content-1",
            pocketId: "pocket-1",
            type: "text",
            content: "Test content",
            metadata: { timestamp: Date.now() },
            capturedAt: Date.now(),
            sourceUrl: "https://example.com",
            processingStatus: "completed",
          },
          relevanceScore: 0.85,
          matchedFields: ["semantic"],
        },
      ]);

      const options: ContextBundleOptions = {
        mode: "ask",
        query: "test query",
        pocketId: "pocket-1",
        maxTokens: 6000,
      };

      // Create multiple concurrent requests
      const promises = [
        builder.buildContextBundle(options),
        builder.buildContextBundle(options),
        builder.buildContextBundle(options),
      ];

      const results = await Promise.all(promises);

      // All should succeed
      results.forEach((bundle) => {
        expect(bundle).toBeDefined();
        expect(bundle.pockets).toBeDefined();
      });
    });
  });

  describe("Mode Switching", () => {
    it("should handle switching from Ask to AI Pocket mode", async () => {
      const { vectorSearchService } = await import("./vector-search-service");
      
      const searchSpy = vi.spyOn(vectorSearchService, "searchContent").mockResolvedValue([
        {
          item: {
            id: "content-1",
            pocketId: "pocket-1",
            type: "text",
            content: "Test content",
            metadata: { timestamp: Date.now() },
            capturedAt: Date.now(),
            sourceUrl: "https://example.com",
            processingStatus: "completed",
          },
          relevanceScore: 0.85,
          matchedFields: ["semantic"],
        },
      ]);

      // Ask mode with RAG
      const askOptions: ContextBundleOptions = {
        mode: "ask",
        query: "test query",
        pocketId: "pocket-1",
        maxTokens: 6000,
      };

      const askBundle = await builder.buildContextBundle(askOptions);
      expect(askBundle.pockets).toBeDefined();

      // AI Pocket mode
      const aiPocketOptions: ContextBundleOptions = {
        mode: "ai-pocket",
        query: "test query",
        pocketId: "pocket-1",
        maxTokens: 6000,
      };

      builder.clearCache();

      const aiPocketBundle = await builder.buildContextBundle(aiPocketOptions);
      expect(aiPocketBundle.pockets).toBeDefined();

      // Both should have called search
      expect(searchSpy).toHaveBeenCalledTimes(2);
    });
  });
});
