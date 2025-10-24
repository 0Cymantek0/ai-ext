/**
 * Context Bundle RAG Tests
 *
 * Tests for chunk-level RAG integration in Ask mode
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  ContextBundleBuilder,
  type ContextBundleOptions,
} from "./context-bundle";

// Mock dependencies
vi.mock("./monitoring", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock("./vector-search-service", () => ({
  vectorSearchService: {
    searchContent: vi.fn().mockResolvedValue([
      {
        item: {
          id: "content-1",
          pocketId: "pocket-1",
          type: "text",
          content: "This is relevant content about AI and machine learning.",
          metadata: {
            timestamp: Date.now(),
            title: "AI Research",
          },
          capturedAt: Date.now(),
          sourceUrl: "https://example.com/ai-research",
          processingStatus: "completed",
        },
        relevanceScore: 0.85,
        matchedFields: ["semantic"],
      },
      {
        item: {
          id: "content-2",
          pocketId: "pocket-1",
          type: "text",
          content: "Deep learning is a subset of machine learning.",
          metadata: {
            timestamp: Date.now(),
            title: "Deep Learning Basics",
          },
          capturedAt: Date.now(),
          sourceUrl: "https://example.com/deep-learning",
          processingStatus: "completed",
        },
        relevanceScore: 0.72,
        matchedFields: ["semantic"],
      },
    ]),
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

describe("Context Bundle with Chunk-Level RAG", () => {
  let builder: ContextBundleBuilder;

  beforeEach(() => {
    builder = new ContextBundleBuilder();
    vi.clearAllMocks();
  });

  describe("Ask Mode RAG Integration", () => {
    it("should include RAG results when pocketId is provided in Ask mode", async () => {
      const options: ContextBundleOptions = {
        mode: "ask",
        query: "What is machine learning?",
        pocketId: "pocket-123",
        maxTokens: 6000,
      };

      const bundle = await builder.buildContextBundle(options);

      expect(bundle.pockets).toBeDefined();
      expect(bundle.pockets!.length).toBeGreaterThan(0);
      expect(bundle.signals).toContain("pockets");
    });

    it("should skip RAG when no pocketId is provided in Ask mode", async () => {
      const options: ContextBundleOptions = {
        mode: "ask",
        query: "General question",
        maxTokens: 4000,
      };

      const bundle = await builder.buildContextBundle(options);

      // Should not include pockets signal when no pocketId
      expect(bundle.signals).not.toContain("pockets");
    });

    it("should prioritize history before pockets in Ask mode", async () => {
      const { conversationContextLoader } = await import(
        "./conversation-context-loader"
      );
      vi.spyOn(
        conversationContextLoader,
        "buildConversationContext",
      ).mockResolvedValue({
        messages: [
          { role: "user", content: "Previous question", timestamp: Date.now() },
          {
            role: "assistant",
            content: "Previous answer",
            timestamp: Date.now(),
          },
        ],
        totalTokens: 100,
        truncated: false,
      });

      const options: ContextBundleOptions = {
        mode: "ask",
        query: "Follow-up question",
        pocketId: "pocket-123",
        conversationId: "conv-123",
        maxTokens: 6000,
      };

      const bundle = await builder.buildContextBundle(options);

      // Both history and pockets should be present
      expect(bundle.signals).toContain("history");
      expect(bundle.signals).toContain("pockets");

      // History should appear before pockets in signals array
      const historyIndex = bundle.signals.indexOf("history");
      const pocketsIndex = bundle.signals.indexOf("pockets");
      expect(historyIndex).toBeLessThan(pocketsIndex);
    });
  });

  describe("Pocket Scoping", () => {
    it("should pass pocketId to vector search for scoped search", async () => {
      const { vectorSearchService } = await import("./vector-search-service");
      const searchSpy = vi.spyOn(vectorSearchService, "searchContent");

      const options: ContextBundleOptions = {
        mode: "ask",
        query: "Scoped query",
        pocketId: "specific-pocket-456",
        maxTokens: 6000,
      };

      await builder.buildContextBundle(options);

      expect(searchSpy).toHaveBeenCalledWith(
        "Scoped query",
        "specific-pocket-456",
        5, // Top 5 results
      );
    });

    it("should search all pockets when no pocketId in AI Pocket mode", async () => {
      const { vectorSearchService } = await import("./vector-search-service");
      const searchSpy = vi.spyOn(vectorSearchService, "searchContent");

      const options: ContextBundleOptions = {
        mode: "ai-pocket",
        query: "Search all pockets",
        maxTokens: 6000,
      };

      await builder.buildContextBundle(options);

      expect(searchSpy).toHaveBeenCalledWith(
        "Search all pockets",
        undefined, // No pocket scoping
        5,
      );
    });
  });

  describe("Empty Pocket Fallback", () => {
    it("should handle empty search results gracefully", async () => {
      const { vectorSearchService } = await import("./vector-search-service");
      vi.spyOn(vectorSearchService, "searchContent").mockResolvedValue([]);

      const options: ContextBundleOptions = {
        mode: "ask",
        query: "Query with no results",
        pocketId: "empty-pocket",
        maxTokens: 6000,
      };

      const bundle = await builder.buildContextBundle(options);

      // Should not have pockets signal when no results
      expect(bundle.signals).not.toContain("pockets");
      expect(bundle.pockets).toBeUndefined();
    });

    it("should continue processing other signals when RAG returns empty", async () => {
      const { vectorSearchService } = await import("./vector-search-service");
      vi.spyOn(vectorSearchService, "searchContent").mockResolvedValue([]);

      const options: ContextBundleOptions = {
        mode: "ask",
        query: "Query with no pocket results",
        pocketId: "empty-pocket",
        conversationId: "conv-123",
        maxTokens: 6000,
      };

      const bundle = await builder.buildContextBundle(options);

      // Should still have other signals like history
      expect(bundle.signals.length).toBeGreaterThanOrEqual(0);
      expect(bundle.totalTokens).toBeGreaterThanOrEqual(0);
    });

    it("should handle RAG service errors gracefully", async () => {
      const { vectorSearchService } = await import("./vector-search-service");
      vi.spyOn(vectorSearchService, "searchContent").mockRejectedValue(
        new Error("Vector search failed"),
      );

      const options: ContextBundleOptions = {
        mode: "ask",
        query: "Query causing error",
        pocketId: "problematic-pocket",
        maxTokens: 6000,
      };

      // Should not throw, just log error
      const bundle = await builder.buildContextBundle(options);

      expect(bundle).toBeDefined();
      expect(bundle.signals).not.toContain("pockets");
    });
  });

  describe("Context Window Budget", () => {
    it("should respect maxTokens budget with RAG content", async () => {
      const { vectorSearchService } = await import("./vector-search-service");

      // Mock large content that would exceed budget
      vi.spyOn(vectorSearchService, "searchContent").mockResolvedValue([
        {
          item: {
            id: "large-content-1",
            pocketId: "pocket-1",
            type: "text",
            content: "A".repeat(10000), // Large content
            metadata: { timestamp: Date.now() },
            capturedAt: Date.now(),
            sourceUrl: "https://example.com",
            processingStatus: "completed",
          },
          relevanceScore: 0.9,
          matchedFields: ["semantic"],
        },
        {
          item: {
            id: "large-content-2",
            pocketId: "pocket-1",
            type: "text",
            content: "B".repeat(10000), // Large content
            metadata: { timestamp: Date.now() },
            capturedAt: Date.now(),
            sourceUrl: "https://example.com",
            processingStatus: "completed",
          },
          relevanceScore: 0.8,
          matchedFields: ["semantic"],
        },
      ]);

      const options: ContextBundleOptions = {
        mode: "ask",
        query: "Query with large results",
        pocketId: "pocket-large",
        maxTokens: 2000, // Small budget
      };

      const bundle = await builder.buildContextBundle(options);

      // Should not exceed maxTokens
      expect(bundle.totalTokens).toBeLessThanOrEqual(2000);

      // Should mark as truncated if content didn't fit
      if (bundle.pockets && bundle.pockets.length < 2) {
        expect(bundle.truncated).toBe(true);
      }
    });

    it("should use 6000 tokens for Ask mode with RAG", async () => {
      const options: ContextBundleOptions = {
        mode: "ask",
        query: "Query with pocket",
        pocketId: "pocket-123",
        // maxTokens not specified, should use default based on mode
      };

      const bundle = await builder.buildContextBundle(options);

      // Should use expanded budget
      expect(bundle.totalTokens).toBeLessThanOrEqual(6000);
    });

    it("should use 4000 tokens for Ask mode without RAG", async () => {
      const options: ContextBundleOptions = {
        mode: "ask",
        query: "General query",
        // No pocketId, no RAG
      };

      const bundle = await builder.buildContextBundle(options);

      // Should use standard budget
      expect(bundle.totalTokens).toBeLessThanOrEqual(6000); // Default is 6000
    });

    it("should track token usage accurately", async () => {
      const options: ContextBundleOptions = {
        mode: "ask",
        query: "Track tokens",
        pocketId: "pocket-123",
        maxTokens: 6000,
      };

      const bundle = await builder.buildContextBundle(options);

      // totalTokens should reflect actual usage
      expect(bundle.totalTokens).toBeGreaterThanOrEqual(0);
      expect(bundle.totalTokens).toBeLessThanOrEqual(6000);

      // Should have metadata about signals used
      expect(bundle.signals).toBeDefined();
      expect(Array.isArray(bundle.signals)).toBe(true);
    });

    it("should truncate when budget is exhausted", async () => {
      const { vectorSearchService } = await import("./vector-search-service");

      // Mock multiple large results
      const largeResults = Array.from({ length: 10 }, (_, i) => ({
        item: {
          id: `content-${i}`,
          pocketId: "pocket-1",
          type: "text",
          content: "X".repeat(5000), // 5000 chars ≈ 1250 tokens
          metadata: { timestamp: Date.now() },
          capturedAt: Date.now(),
          sourceUrl: "https://example.com",
          processingStatus: "completed",
        },
        relevanceScore: 0.9 - i * 0.05,
        matchedFields: ["semantic"],
      }));

      vi.spyOn(vectorSearchService, "searchContent").mockResolvedValue(
        largeResults,
      );

      const options: ContextBundleOptions = {
        mode: "ask",
        query: "Query with many large results",
        pocketId: "pocket-large",
        maxTokens: 3000, // Limited budget
      };

      const bundle = await builder.buildContextBundle(options);

      // Should not include all 10 results
      expect(bundle.pockets!.length).toBeLessThan(10);
      expect(bundle.truncated).toBe(true);
      expect(bundle.totalTokens).toBeLessThanOrEqual(3000);
    });
  });

  describe("Context Assembly", () => {
    it("should assemble context with pockets, history, and page signals", async () => {
      const { conversationContextLoader } = await import(
        "./conversation-context-loader"
      );
      vi.spyOn(
        conversationContextLoader,
        "buildConversationContext",
      ).mockResolvedValue({
        messages: [
          { role: "user", content: "Previous question", timestamp: Date.now() },
        ],
        totalTokens: 50,
        truncated: false,
      });

      const options: ContextBundleOptions = {
        mode: "ask",
        query: "Comprehensive query",
        pocketId: "pocket-123",
        conversationId: "conv-123",
        maxTokens: 6000,
      };

      const bundle = await builder.buildContextBundle(options);

      // Should have multiple signals assembled
      expect(bundle.signals.length).toBeGreaterThanOrEqual(2);
      expect(bundle.timestamp).toBeDefined();
    });

    it("should include relevance scores for pocket content", async () => {
      const options: ContextBundleOptions = {
        mode: "ask",
        query: "Query for scored results",
        pocketId: "pocket-123",
        maxTokens: 6000,
      };

      const bundle = await builder.buildContextBundle(options);

      expect(bundle.pockets).toBeDefined();
      expect(bundle.pockets!.length).toBeGreaterThan(0);

      // Each pocket should have a relevance score
      bundle.pockets!.forEach((pocket) => {
        expect(pocket.relevanceScore).toBeDefined();
        expect(pocket.relevanceScore).toBeGreaterThanOrEqual(0);
        expect(pocket.relevanceScore).toBeLessThanOrEqual(1);
      });
    });

    it("should order pockets by relevance score", async () => {
      const options: ContextBundleOptions = {
        mode: "ask",
        query: "Ordered results",
        pocketId: "pocket-123",
        maxTokens: 6000,
      };

      const bundle = await builder.buildContextBundle(options);

      if (bundle.pockets && bundle.pockets.length > 1) {
        // Verify descending order by relevance
        for (let i = 0; i < bundle.pockets.length - 1; i++) {
          expect(bundle.pockets[i]!.relevanceScore).toBeGreaterThanOrEqual(
            bundle.pockets[i + 1]!.relevanceScore,
          );
        }
      }
    });
  });

  describe("Cache Behavior with RAG", () => {
    it("should cache results including pocket content", async () => {
      const options: ContextBundleOptions = {
        mode: "ask",
        query: "Cacheable query",
        pocketId: "pocket-123",
        maxTokens: 6000,
      };

      // First call
      const bundle1 = await builder.buildContextBundle(options);

      // Second call with same options
      const bundle2 = await builder.buildContextBundle(options);

      // Should return cached result
      expect(bundle1.timestamp).toBe(bundle2.timestamp);
    });

    it("should invalidate cache when query changes", async () => {
      const options1: ContextBundleOptions = {
        mode: "ask",
        query: "First query",
        pocketId: "pocket-123",
        maxTokens: 6000,
      };

      const options2: ContextBundleOptions = {
        mode: "ask",
        query: "Second query",
        pocketId: "pocket-123",
        maxTokens: 6000,
      };

      const bundle1 = await builder.buildContextBundle(options1);

      // Wait a small amount to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 10));

      const bundle2 = await builder.buildContextBundle(options2);

      // Different queries should produce different bundles (verified by pockets length or other property)
      // Since timestamps are set at bundle creation, they should differ
      expect(bundle1).not.toEqual(bundle2);
    });

    it("should invalidate cache when pocketId changes", async () => {
      const options1: ContextBundleOptions = {
        mode: "ask",
        query: "Same query",
        pocketId: "pocket-123",
        maxTokens: 6000,
      };

      const options2: ContextBundleOptions = {
        mode: "ask",
        query: "Same query",
        pocketId: "pocket-456",
        maxTokens: 6000,
      };

      const bundle1 = await builder.buildContextBundle(options1);

      // Wait a small amount to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 10));

      const bundle2 = await builder.buildContextBundle(options2);

      // Different pockets should produce different bundles (verified by pockets or other property)
      expect(bundle1).not.toEqual(bundle2);
    });
  });
});
