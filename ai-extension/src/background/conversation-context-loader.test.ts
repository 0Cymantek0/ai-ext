/**
 * Tests for Conversation Context Loader
 * 
 * Verifies conversation history retrieval, formatting, and context window management.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { ConversationContextLoader } from "./conversation-context-loader";
import type { Conversation, Message } from "./indexeddb-manager";

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

// Mock the logger
vi.mock("./monitoring", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe("ConversationContextLoader", () => {
  let loader: ConversationContextLoader;
  let indexedDBManager: any;

  beforeEach(async () => {
    const module = await import("./indexeddb-manager");
    indexedDBManager = module.indexedDBManager;
    
    loader = new ConversationContextLoader();
    mockConversations.clear();
    vi.clearAllMocks();
    
    // Reset the mock implementation to default behavior
    vi.mocked(indexedDBManager.getConversation).mockImplementation(async (id: string) => {
      return mockConversations.get(id) || null;
    });
  });

  describe("loadConversationHistory", () => {
    it("should load conversation history successfully", async () => {
      const conversationId = "test-conv-1";
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
        tokensUsed: 100,
      };

      mockConversations.set(conversationId, mockConversation);

      const result = await loader.loadConversationHistory(conversationId);

      expect(result).toEqual(mockConversation);
      expect(indexedDBManager.init).toHaveBeenCalled();
      expect(indexedDBManager.getConversation).toHaveBeenCalledWith(conversationId);
    });

    it("should return null for non-existent conversation", async () => {
      const result = await loader.loadConversationHistory("non-existent");

      expect(result).toBeNull();
    });

    it("should retry on failure", async () => {
      const conversationId = "test-conv-retry";
      let attemptCount = 0;

      vi.mocked(indexedDBManager.getConversation).mockImplementation(async () => {
        attemptCount++;
        if (attemptCount < 2) {
          throw new Error("Database error");
        }
        return {
          id: conversationId,
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          model: "gemini-nano",
          tokensUsed: 0,
        };
      });

      const result = await loader.loadConversationHistory(conversationId);

      expect(result).not.toBeNull();
      expect(attemptCount).toBe(2);
    });

    it("should throw after max retries", async () => {
      vi.mocked(indexedDBManager.getConversation).mockRejectedValue(
        new Error("Persistent error")
      );

      await expect(
        loader.loadConversationHistory("failing-conv")
      ).rejects.toThrow("Failed to load conversation after 3 attempts");
    });
  });

  describe("formatMessagesForAI", () => {
    it("should format messages correctly", () => {
      const messages: Message[] = [
        {
          id: "msg-1",
          role: "user",
          content: "What is AI?",
          timestamp: Date.now(),
          source: "gemini-nano",
        },
        {
          id: "msg-2",
          role: "assistant",
          content: "AI stands for Artificial Intelligence.",
          timestamp: Date.now(),
          source: "gemini-nano",
        },
        {
          id: "msg-3",
          role: "system",
          content: "You are a helpful assistant.",
          timestamp: Date.now(),
          source: "gemini-nano",
        },
      ];

      const formatted = loader.formatMessagesForAI(messages);

      expect(formatted).toEqual([
        { role: "user", content: "What is AI?" },
        { role: "assistant", content: "AI stands for Artificial Intelligence." },
        { role: "system", content: "You are a helpful assistant." },
      ]);
    });

    it("should handle empty message array", () => {
      const formatted = loader.formatMessagesForAI([]);
      expect(formatted).toEqual([]);
    });
  });

  describe("buildConversationContext", () => {
    it("should build context for short conversation", async () => {
      const conversationId = "short-conv";
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
            content: "Hi!",
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

      const context = await loader.buildConversationContext(conversationId);

      expect(context.conversationId).toBe(conversationId);
      expect(context.messages).toHaveLength(2);
      expect(context.truncated).toBe(false);
      expect(context.totalTokens).toBeGreaterThan(0);
    });

    it("should truncate long conversations", async () => {
      const conversationId = "long-conv";
      
      // Create a conversation with many messages
      const messages: Message[] = [];
      for (let i = 0; i < 100; i++) {
        messages.push({
          id: `msg-${i}`,
          role: i % 2 === 0 ? "user" : "assistant",
          content: `Message ${i} with some content that takes up tokens. This is a longer message to simulate real conversation.`,
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

      // Configure with small token limit
      loader.updateConfig({ targetTokens: 500, maxTokens: 1000 });

      const context = await loader.buildConversationContext(conversationId);

      expect(context.conversationId).toBe(conversationId);
      expect(context.messages.length).toBeLessThan(messages.length);
      expect(context.truncated).toBe(true);
      expect(context.totalTokens).toBeLessThanOrEqual(1000);
    });

    it("should prioritize recent messages", async () => {
      const conversationId = "priority-conv";
      
      const messages: Message[] = [
        {
          id: "msg-old-1",
          role: "user",
          content: "Old message 1",
          timestamp: Date.now() - 10000,
          source: "gemini-nano",
        },
        {
          id: "msg-old-2",
          role: "assistant",
          content: "Old response 1",
          timestamp: Date.now() - 9000,
          source: "gemini-nano",
        },
        {
          id: "msg-recent-1",
          role: "user",
          content: "Recent message 1",
          timestamp: Date.now() - 1000,
          source: "gemini-nano",
        },
        {
          id: "msg-recent-2",
          role: "assistant",
          content: "Recent response 1",
          timestamp: Date.now(),
          source: "gemini-nano",
        },
      ];

      const mockConversation: Conversation = {
        id: conversationId,
        messages,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        model: "gemini-nano",
        tokensUsed: 200,
      };

      mockConversations.set(conversationId, mockConversation);

      // Configure with very small token limit to force truncation
      loader.updateConfig({ targetTokens: 50, maxTokens: 100 });

      const context = await loader.buildConversationContext(conversationId);

      // Should include recent messages
      const messageIds = context.messages.map(m => m.content);
      expect(messageIds).toContain("Recent message 1");
      expect(messageIds).toContain("Recent response 1");
    });

    it("should prioritize system messages", async () => {
      const conversationId = "system-priority-conv";
      
      const messages: Message[] = [
        {
          id: "msg-system",
          role: "system",
          content: "You are a helpful assistant.",
          timestamp: Date.now() - 10000,
          source: "gemini-nano",
        },
        {
          id: "msg-1",
          role: "user",
          content: "Hello",
          timestamp: Date.now() - 5000,
          source: "gemini-nano",
        },
        {
          id: "msg-2",
          role: "assistant",
          content: "Hi!",
          timestamp: Date.now(),
          source: "gemini-nano",
        },
      ];

      const mockConversation: Conversation = {
        id: conversationId,
        messages,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        model: "gemini-nano",
        tokensUsed: 100,
      };

      mockConversations.set(conversationId, mockConversation);

      // Configure with small token limit
      loader.updateConfig({ targetTokens: 50, maxTokens: 100 });

      const context = await loader.buildConversationContext(conversationId);

      // System message should be included even with small token budget
      const messageContents = context.messages.map(m => m.content);
      expect(messageContents).toContain("You are a helpful assistant.");
    });

    it("should handle empty conversation", async () => {
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

      const context = await loader.buildConversationContext(conversationId);

      expect(context.messages).toHaveLength(0);
      expect(context.totalTokens).toBe(0);
      expect(context.truncated).toBe(false);
    });

    it("should handle non-existent conversation", async () => {
      const context = await loader.buildConversationContext("non-existent");

      expect(context.messages).toHaveLength(0);
      expect(context.totalTokens).toBe(0);
      expect(context.truncated).toBe(false);
    });
  });

  describe("formatContextAsString", () => {
    it("should format context as string", () => {
      const context = {
        conversationId: "test",
        messages: [
          { role: "user" as const, content: "Hello" },
          { role: "assistant" as const, content: "Hi there!" },
        ],
        totalTokens: 50,
        truncated: false,
      };

      const formatted = loader.formatContextAsString(context);

      expect(formatted).toBe("user: Hello\nassistant: Hi there!");
    });

    it("should include truncation notice", () => {
      const context = {
        conversationId: "test",
        messages: [
          { role: "user" as const, content: "Recent message" },
        ],
        totalTokens: 50,
        truncated: true,
      };

      const formatted = loader.formatContextAsString(context);

      expect(formatted).toContain("[Earlier messages truncated to fit context window]");
      expect(formatted).toContain("user: Recent message");
    });

    it("should handle empty context", () => {
      const context = {
        conversationId: "test",
        messages: [],
        totalTokens: 0,
        truncated: false,
      };

      const formatted = loader.formatContextAsString(context);

      expect(formatted).toBe("");
    });
  });

  describe("configuration", () => {
    it("should update configuration", () => {
      loader.updateConfig({ maxTokens: 10000, targetTokens: 8000 });

      const config = loader.getConfig();

      expect(config.maxTokens).toBe(10000);
      expect(config.targetTokens).toBe(8000);
    });

    it("should preserve unmodified config values", () => {
      const originalConfig = loader.getConfig();
      
      loader.updateConfig({ maxTokens: 5000 });

      const newConfig = loader.getConfig();

      expect(newConfig.maxTokens).toBe(5000);
      expect(newConfig.targetTokens).toBe(originalConfig.targetTokens);
      expect(newConfig.recentMessageCount).toBe(originalConfig.recentMessageCount);
    });
  });
});
