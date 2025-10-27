/**
 * Tests for ContextBundle conversation history integration
 *
 * Verifies that ContextBundle properly integrates with ConversationContextLoader
 * to load actual conversation history instead of just reserving token space.
 *
 * Requirements: 36.5, 36.7, 36.11, 38.1, 38.2
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  ContextBundleBuilder,
  serializeContextBundle,
  type ContextBundle,
} from "./context-bundle";
import type { Conversation, Message } from "./indexeddb-manager";
import type { ConversationContext } from "./conversation-context-loader";

// Create a shared mock conversations map
const mockConversations = new Map<string, Conversation>();

// Mock the indexedDBManager
vi.mock("./indexeddb-manager", () => {
  return {
    indexedDBManager: {
      init: vi.fn().mockResolvedValue(undefined),
      getConversation: vi.fn(async (id: string) => {
        return mockConversations.get(id) || null;
      }),
    },
  };
});

// Mock the vector search service
vi.mock("./vector-search-service", () => ({
  vectorSearchService: {
    searchContent: vi.fn().mockResolvedValue([]),
  },
}));

// Mock the logger
vi.mock("./monitoring", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe("ContextBundle History Integration", () => {
  let builder: ContextBundleBuilder;

  beforeEach(() => {
    builder = new ContextBundleBuilder();
    mockConversations.clear();
    vi.clearAllMocks();
  });

  describe("buildContextBundle with conversation history", () => {
    it("should load and include actual conversation history", async () => {
      const conversationId = "test-conv-1";
      const mockConversation: Conversation = {
        id: conversationId,
        messages: [
          {
            id: "msg-1",
            role: "user",
            content: "What is AI?",
            timestamp: Date.now() - 2000,
            source: "gemini-nano",
          },
          {
            id: "msg-2",
            role: "assistant",
            content:
              "AI stands for Artificial Intelligence. It's a field of computer science.",
            timestamp: Date.now() - 1000,
            source: "gemini-nano",
          },
          {
            id: "msg-3",
            role: "user",
            content: "Tell me more about machine learning",
            timestamp: Date.now(),
            source: "gemini-nano",
          },
        ],
        createdAt: Date.now() - 5000,
        updatedAt: Date.now(),
        model: "gemini-nano",
        tokensUsed: 150,
      };

      mockConversations.set(conversationId, mockConversation);

      const bundle = await builder.buildContextBundle({
        mode: "ask",
        conversationId,
      });

      // Verify history is included
      expect(bundle.history).toBeDefined();
      expect(bundle.history).toHaveLength(3);
      expect(bundle.signals).toContain("history");

      // Verify actual message content is present
      expect(bundle.history?.[0]?.content).toBe("What is AI?");
      expect(bundle.history?.[1]?.content).toBe(
        "AI stands for Artificial Intelligence. It's a field of computer science.",
      );
      expect(bundle.history?.[2]?.content).toBe(
        "Tell me more about machine learning",
      );

      // Verify roles are correct
      expect(bundle.history?.[0]?.role).toBe("user");
      expect(bundle.history?.[1]?.role).toBe("assistant");
      expect(bundle.history?.[2]?.role).toBe("user");

      // Verify token count is based on actual content
      expect(bundle.totalTokens).toBeGreaterThan(0);
    });

    it("should handle empty conversation history", async () => {
      const conversationId = "empty-conv";
      const mockConversation: Conversation = {
        id: conversationId,
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        model: "gemini-nano",
        tokensUsed: 0,
      };

      mockConversations.set(conversationId, mockConversation);

      const bundle = await builder.buildContextBundle({
        mode: "ask",
        conversationId,
      });

      // History should not be included if empty
      expect(bundle.history).toBeUndefined();
      expect(bundle.signals).not.toContain("history");
    });

    it("should handle non-existent conversation", async () => {
      const bundle = await builder.buildContextBundle({
        mode: "ask",
        conversationId: "non-existent",
      });

      // History should not be included if conversation doesn't exist
      expect(bundle.history).toBeUndefined();
      expect(bundle.signals).not.toContain("history");
    });

    it("should truncate history when token budget is exceeded", async () => {
      const conversationId = "long-conv";

      // Create a conversation with many long messages
      const messages: Message[] = [];
      for (let i = 0; i < 20; i++) {
        messages.push({
          id: `msg-${i}`,
          role: i % 2 === 0 ? "user" : "assistant",
          content:
            `This is message ${i} with a lot of content that takes up many tokens. `.repeat(
              20,
            ),
          timestamp: Date.now() + i,
          source: "gemini-nano",
        });
      }

      const mockConversation: Conversation = {
        id: conversationId,
        messages,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        model: "gemini-nano",
        tokensUsed: 5000,
      };

      mockConversations.set(conversationId, mockConversation);

      // Build bundle with small token budget
      const bundle = await builder.buildContextBundle({
        mode: "ask",
        conversationId,
        maxTokens: 500,
      });

      // History should be truncated
      expect(bundle.history).toBeDefined();
      expect(bundle.history!.length).toBeLessThan(messages.length);
      expect(bundle.truncated).toBe(true);
      expect(bundle.totalTokens).toBeLessThanOrEqual(500);
    });

    it("should prioritize history in Ask mode", async () => {
      const conversationId = "priority-conv";
      const mockConversation: Conversation = {
        id: conversationId,
        messages: [
          {
            id: "msg-1",
            role: "user",
            content: "Hello",
            timestamp: Date.now(),
            source: "gemini-nano",
          },
          {
            id: "msg-2",
            role: "assistant",
            content: "Hi there!",
            timestamp: Date.now(),
            source: "gemini-nano",
          },
        ],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        model: "gemini-nano",
        tokensUsed: 50,
      };

      mockConversations.set(conversationId, mockConversation);

      const bundle = await builder.buildContextBundle({
        mode: "ask",
        conversationId,
      });

      // In Ask mode, history should be included
      expect(bundle.signals).toContain("history");
      expect(bundle.history).toBeDefined();
    });

    it("should include history in AI Pocket mode", async () => {
      const conversationId = "pocket-conv";
      const mockConversation: Conversation = {
        id: conversationId,
        messages: [
          {
            id: "msg-1",
            role: "user",
            content: "What's in my research?",
            timestamp: Date.now(),
            source: "gemini-nano",
          },
        ],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        model: "gemini-nano",
        tokensUsed: 25,
      };

      mockConversations.set(conversationId, mockConversation);

      const bundle = await builder.buildContextBundle({
        mode: "ai-pocket",
        conversationId,
        query: "research findings",
      });

      // In AI Pocket mode, history should also be included
      expect(bundle.signals).toContain("history");
      expect(bundle.history).toBeDefined();
    });

    it("should not include history when preferences disable it", async () => {
      const conversationId = "disabled-history-conv";
      const mockConversation: Conversation = {
        id: conversationId,
        messages: [
          {
            id: "msg-1",
            role: "user",
            content: "Hello",
            timestamp: Date.now(),
            source: "gemini-nano",
          },
        ],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        model: "gemini-nano",
        tokensUsed: 25,
      };

      mockConversations.set(conversationId, mockConversation);

      // Create builder with history disabled
      const builderNoHistory = new ContextBundleBuilder({ history: false });

      const bundle = await builderNoHistory.buildContextBundle({
        mode: "ask",
        conversationId,
      });

      // History should not be included when disabled
      expect(bundle.history).toBeUndefined();
      expect(bundle.signals).not.toContain("history");
    });

    it("should not include history when conversationId is missing", async () => {
      const bundle = await builder.buildContextBundle({
        mode: "ask",
        // No conversationId provided
      });

      // History should not be included without conversationId
      expect(bundle.history).toBeUndefined();
      expect(bundle.signals).not.toContain("history");
    });
  });

  describe("serializeContextBundle with history", () => {
    it("should include history in serialized output for Ask mode", () => {
      const bundle: ContextBundle = {
        history: [
          {
            role: "user",
            content: "What is machine learning?",
            timestamp: Date.now() - 2000,
          },
          {
            role: "assistant",
            content:
              "Machine learning is a subset of AI that enables systems to learn from data.",
            timestamp: Date.now() - 1000,
          },
        ],
        totalTokens: 100,
        truncated: false,
        signals: ["history"],
        timestamp: Date.now(),
      };

      const serialized = serializeContextBundle(bundle, "ask");

      // Verify history section is included
      expect(serialized).toContain("## Conversation History");
      expect(serialized).toContain("User: What is machine learning?");
      expect(serialized).toContain(
        "Assistant: Machine learning is a subset of AI",
      );
    });

    it("should include history in serialized output for AI Pocket mode", () => {
      const bundle: ContextBundle = {
        history: [
          {
            role: "user",
            content: "Summarize my research",
            timestamp: Date.now(),
          },
        ],
        totalTokens: 50,
        truncated: false,
        signals: ["history"],
        timestamp: Date.now(),
      };

      const serialized = serializeContextBundle(bundle, "ai-pocket");

      // Verify history section is included
      expect(serialized).toContain("## Conversation History");
      expect(serialized).toContain("User: Summarize my research");
    });

    it("should truncate long messages in serialized history", () => {
      const longContent = "A".repeat(300);

      const bundle: ContextBundle = {
        history: [
          {
            role: "user",
            content: longContent,
            timestamp: Date.now(),
          },
        ],
        totalTokens: 100,
        truncated: false,
        signals: ["history"],
        timestamp: Date.now(),
      };

      const serialized = serializeContextBundle(bundle, "ask");

      // Long messages should be truncated with ellipsis
      expect(serialized).toContain("...");
      expect(serialized).not.toContain(longContent);
    });

    it("should not include history section when history is empty", () => {
      const bundle: ContextBundle = {
        totalTokens: 0,
        truncated: false,
        signals: [],
        timestamp: Date.now(),
      };

      const serialized = serializeContextBundle(bundle, "ask");

      // History section should not be present
      expect(serialized).not.toContain("## Conversation History");
    });

    it("should show correct message count in history section", () => {
      const bundle: ContextBundle = {
        history: [
          { role: "user", content: "Message 1", timestamp: Date.now() },
          { role: "assistant", content: "Response 1", timestamp: Date.now() },
          { role: "user", content: "Message 2", timestamp: Date.now() },
        ],
        totalTokens: 100,
        truncated: false,
        signals: ["history"],
        timestamp: Date.now(),
      };

      const serialized = serializeContextBundle(bundle, "ask");

      // Should show correct count
      expect(serialized).toContain("(3 messages)");
    });
  });

  describe("caching with history", () => {
    it("should cache bundles with history", async () => {
      const conversationId = "cache-conv";
      const mockConversation: Conversation = {
        id: conversationId,
        messages: [
          {
            id: "msg-1",
            role: "user",
            content: "Test message",
            timestamp: Date.now(),
            source: "gemini-nano",
          },
        ],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        model: "gemini-nano",
        tokensUsed: 25,
      };

      mockConversations.set(conversationId, mockConversation);

      // First call - should load from DB
      const bundle1 = await builder.buildContextBundle({
        mode: "ask",
        conversationId,
      });

      // Second call - should use cache
      const bundle2 = await builder.buildContextBundle({
        mode: "ask",
        conversationId,
      });

      // Both should have history
      expect(bundle1.history).toBeDefined();
      expect(bundle2.history).toBeDefined();

      // Should be the same reference (cached)
      expect(bundle1).toBe(bundle2);
    });

    it("should invalidate cache when conversation changes", async () => {
      const conversationId = "changing-conv";
      const mockConversation: Conversation = {
        id: conversationId,
        messages: [
          {
            id: "msg-1",
            role: "user",
            content: "First message",
            timestamp: Date.now(),
            source: "gemini-nano",
          },
        ],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        model: "gemini-nano",
        tokensUsed: 25,
      };

      mockConversations.set(conversationId, mockConversation);

      // First call
      const bundle1 = await builder.buildContextBundle({
        mode: "ask",
        conversationId,
      });

      // Clear cache
      builder.clearCache();

      // Update conversation
      mockConversation.messages.push({
        id: "msg-2",
        role: "assistant",
        content: "Response",
        timestamp: Date.now(),
        source: "gemini-nano",
      });

      // Second call after cache clear
      const bundle2 = await builder.buildContextBundle({
        mode: "ask",
        conversationId,
      });

      // Should have different history lengths
      expect(bundle1.history?.length).toBe(1);
      expect(bundle2.history?.length).toBe(2);
    });
  });

  describe("token budgeting with actual history", () => {
    it("should use actual token counts from history", async () => {
      const conversationId = "token-conv";
      const mockConversation: Conversation = {
        id: conversationId,
        messages: [
          {
            id: "msg-1",
            role: "user",
            content: "Short",
            timestamp: Date.now(),
            source: "gemini-nano",
          },
          {
            id: "msg-2",
            role: "assistant",
            content: "Also short",
            timestamp: Date.now(),
            source: "gemini-nano",
          },
        ],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        model: "gemini-nano",
        tokensUsed: 50,
      };

      mockConversations.set(conversationId, mockConversation);

      const bundle = await builder.buildContextBundle({
        mode: "ask",
        conversationId,
      });

      // Token count should reflect actual content
      expect(bundle.totalTokens).toBeGreaterThan(0);
      expect(bundle.totalTokens).toBeLessThan(100); // Should be reasonable for short messages
    });

    it("should respect token budget when adding history", async () => {
      const conversationId = "budget-conv";

      // Create conversation with moderate content
      const messages: Message[] = [];
      for (let i = 0; i < 10; i++) {
        messages.push({
          id: `msg-${i}`,
          role: i % 2 === 0 ? "user" : "assistant",
          content: `Message ${i} with some content. `.repeat(10),
          timestamp: Date.now() + i,
          source: "gemini-nano",
        });
      }

      const mockConversation: Conversation = {
        id: conversationId,
        messages,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        model: "gemini-nano",
        tokensUsed: 1000,
      };

      mockConversations.set(conversationId, mockConversation);

      const maxTokens = 300;
      const bundle = await builder.buildContextBundle({
        mode: "ask",
        conversationId,
        maxTokens,
      });

      // Should not exceed budget
      expect(bundle.totalTokens).toBeLessThanOrEqual(maxTokens);

      // Should have some history but not all
      if (bundle.history) {
        expect(bundle.history.length).toBeLessThan(messages.length);
        expect(bundle.truncated).toBe(true);
      }
    });
  });
});
