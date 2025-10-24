/**
 * Integration Tests for Conversation Context Loading
 * 
 * Tests the integration between ConversationContextLoader and StreamingHandler
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { conversationContextLoader } from "./conversation-context-loader";
import type { Conversation } from "./indexeddb-manager";

// Mock IndexedDB
const mockConversations = new Map<string, Conversation>();

vi.mock("./indexeddb-manager", () => ({
  indexedDBManager: {
    init: vi.fn().mockResolvedValue(undefined),
    getConversation: vi.fn(async (id: string) => {
      return mockConversations.get(id) || null;
    }),
    updateConversation: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock logger
vi.mock("./monitoring", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe("Conversation Context Integration", () => {
  beforeEach(() => {
    mockConversations.clear();
    vi.clearAllMocks();
  });

  it("should load and format context for streaming handler", async () => {
    // Setup: Create a conversation with history
    const conversationId = "integration-test-1";
    const conversation: Conversation = {
      id: conversationId,
      messages: [
        {
          id: "msg-1",
          role: "user",
          content: "What is machine learning?",
          timestamp: Date.now() - 5000,
          source: "gemini-nano",
        },
        {
          id: "msg-2",
          role: "assistant",
          content: "Machine learning is a subset of AI that enables systems to learn from data.",
          timestamp: Date.now() - 4000,
          source: "gemini-nano",
        },
        {
          id: "msg-3",
          role: "user",
          content: "Can you give me an example?",
          timestamp: Date.now() - 1000,
          source: "gemini-nano",
        },
      ],
      createdAt: Date.now() - 10000,
      updatedAt: Date.now() - 1000,
      model: "gemini-nano",
      tokensUsed: 150,
    };

    mockConversations.set(conversationId, conversation);

    // Act: Build context as streaming handler would
    const context = await conversationContextLoader.buildConversationContext(conversationId);
    const contextString = conversationContextLoader.formatContextAsString(context);

    // Assert: Context is properly formatted
    expect(context.conversationId).toBe(conversationId);
    expect(context.messages).toHaveLength(3);
    expect(context.truncated).toBe(false);

    // Verify string format matches expected AI input format
    expect(contextString).toContain("user: What is machine learning?");
    expect(contextString).toContain("assistant: Machine learning is a subset of AI");
    expect(contextString).toContain("user: Can you give me an example?");

    // Verify chronological order is maintained
    const lines = contextString.split("\n");
    expect(lines[0]).toContain("What is machine learning?");
    expect(lines[1]).toContain("Machine learning is a subset of AI");
    expect(lines[2]).toContain("Can you give me an example?");
  });

  it("should handle multi-turn conversation with context window", async () => {
    const conversationId = "integration-test-2";

    // Create a longer conversation
    const messages: Array<{
      id: string;
      role: "user" | "assistant";
      content: string;
      timestamp: number;
      source: "gemini-nano";
    }> = [];
    for (let i = 0; i < 20; i++) {
      messages.push({
        id: `msg-user-${i}`,
        role: "user" as const,
        content: `User message ${i}: This is a question about topic ${i}`,
        timestamp: Date.now() - (20 - i) * 1000,
        source: "gemini-nano" as const,
      });
      messages.push({
        id: `msg-assistant-${i}`,
        role: "assistant" as const,
        content: `Assistant response ${i}: Here is a detailed answer about topic ${i} with lots of information.`,
        timestamp: Date.now() - (20 - i) * 1000 + 500,
        source: "gemini-nano" as const,
      });
    }

    const conversation: Conversation = {
      id: conversationId,
      messages,
      createdAt: Date.now() - 30000,
      updatedAt: Date.now(),
      model: "gemini-nano",
      tokensUsed: 2000,
    };

    mockConversations.set(conversationId, conversation);

    // Configure with small token limit to force truncation
    conversationContextLoader.updateConfig({
      targetTokens: 300,
      maxTokens: 500,
    });

    // Act
    const context = await conversationContextLoader.buildConversationContext(conversationId);
    const contextString = conversationContextLoader.formatContextAsString(context);

    // Assert: Context is truncated but includes recent messages
    expect(context.truncated).toBe(true);
    expect(context.messages.length).toBeLessThan(messages.length);
    expect(context.totalTokens).toBeLessThanOrEqual(500);

    // Verify recent messages are included
    const contextContent = contextString.toLowerCase();
    expect(contextContent).toContain("topic 19"); // Most recent
    expect(contextContent).toContain("topic 18"); // Second most recent

    // Verify truncation notice
    expect(contextString).toContain("[Earlier messages truncated to fit context window]");

    // Reset config for other tests
    conversationContextLoader.updateConfig({
      targetTokens: 6000,
      maxTokens: 8000,
    });
  });

  it("should gracefully handle missing conversation", async () => {
    // Act: Try to load non-existent conversation
    const context = await conversationContextLoader.buildConversationContext("non-existent-id");

    // Assert: Returns empty context without throwing
    expect(context.messages).toHaveLength(0);
    expect(context.totalTokens).toBe(0);
    expect(context.truncated).toBe(false);
    expect(context.conversationId).toBe("non-existent-id");

    // Verify it can be formatted without errors
    const contextString = conversationContextLoader.formatContextAsString(context);
    expect(contextString).toBe("");
  });

  it("should maintain message order in context", async () => {
    const conversationId = "integration-test-order";

    const conversation: Conversation = {
      id: conversationId,
      messages: [
        {
          id: "msg-1",
          role: "system",
          content: "You are a helpful assistant.",
          timestamp: Date.now() - 10000,
          source: "gemini-nano",
        },
        {
          id: "msg-2",
          role: "user",
          content: "First question",
          timestamp: Date.now() - 5000,
          source: "gemini-nano",
        },
        {
          id: "msg-3",
          role: "assistant",
          content: "First answer",
          timestamp: Date.now() - 4000,
          source: "gemini-nano",
        },
        {
          id: "msg-4",
          role: "user",
          content: "Second question",
          timestamp: Date.now() - 2000,
          source: "gemini-nano",
        },
        {
          id: "msg-5",
          role: "assistant",
          content: "Second answer",
          timestamp: Date.now() - 1000,
          source: "gemini-nano",
        },
      ],
      createdAt: Date.now() - 15000,
      updatedAt: Date.now() - 1000,
      model: "gemini-nano",
      tokensUsed: 200,
    };

    mockConversations.set(conversationId, conversation);

    // Act
    const context = await conversationContextLoader.buildConversationContext(conversationId);

    // Assert: Messages are in chronological order
    expect(context.messages[0]?.content).toBe("You are a helpful assistant.");
    expect(context.messages[1]?.content).toBe("First question");
    expect(context.messages[2]?.content).toBe("First answer");
    expect(context.messages[3]?.content).toBe("Second question");
    expect(context.messages[4]?.content).toBe("Second answer");
  });

  it("should prioritize system messages even with token limits", async () => {
    const conversationId = "integration-test-system";

    const messages: Array<{
      id: string;
      role: "user" | "assistant" | "system";
      content: string;
      timestamp: number;
      source: "gemini-nano";
    }> = [
        {
          id: "msg-system",
          role: "system" as const,
          content: "IMPORTANT: You are a specialized assistant for medical queries.",
          timestamp: Date.now() - 10000,
          source: "gemini-nano" as const,
        },
      ];

    // Add many user/assistant messages
    for (let i = 0; i < 15; i++) {
      messages.push({
        id: `msg-user-${i}`,
        role: "user" as const,
        content: `Question ${i} about medical topic`,
        timestamp: Date.now() - (15 - i) * 500,
        source: "gemini-nano" as const,
      });
      messages.push({
        id: `msg-assistant-${i}`,
        role: "assistant" as const,
        content: `Answer ${i} with medical information`,
        timestamp: Date.now() - (15 - i) * 500 + 250,
        source: "gemini-nano" as const,
      });
    }

    const conversation: Conversation = {
      id: conversationId,
      messages,
      createdAt: Date.now() - 20000,
      updatedAt: Date.now(),
      model: "gemini-nano",
      tokensUsed: 1500,
    };

    mockConversations.set(conversationId, conversation);

    // Configure with very small token limit
    conversationContextLoader.updateConfig({
      targetTokens: 200,
      maxTokens: 300,
    });

    // Act
    const context = await conversationContextLoader.buildConversationContext(conversationId);

    // Assert: System message is included despite being old
    const systemMessage = context.messages.find(m => m.role === "system");
    expect(systemMessage).toBeDefined();
    expect(systemMessage?.content).toContain("IMPORTANT");

    // Reset config
    conversationContextLoader.updateConfig({
      targetTokens: 6000,
      maxTokens: 8000,
    });
  });
});
