/**
 * Mode-Aware Processor - Pocket Attachment Integration Tests
 *
 * Tests for RAG pipeline integration with conversation pocket attachments
 * Ensures proper reading of attachedPocketId from conversations
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ModeAwareProcessor } from "./mode-aware-processor.js";
import { indexedDBManager } from "./indexeddb-manager.js";
import type { AIManager } from "./ai-manager.js";
import type { CloudAIManager } from "./cloud-ai-manager.js";

// Mock dependencies
vi.mock("./hybrid-ai-engine.js", () => ({
  HybridAIEngine: vi.fn().mockImplementation(() => ({
    processContentStreaming: vi.fn().mockImplementation(async function* () {
      yield "Test response";
    }),
  })),
  TaskOperation: {
    GENERAL: "general",
  },
}));

vi.mock("./conversation-context-loader.js", () => ({
  conversationContextLoader: {
    buildConversationContext: vi.fn().mockResolvedValue({
      messages: [],
      totalTokens: 0,
      truncated: false,
    }),
    formatContextAsString: vi.fn().mockReturnValue(""),
  },
}));

vi.mock("./context-bundle.js", () => ({
  contextBundleBuilder: {
    buildContextBundle: vi.fn().mockResolvedValue({
      totalTokens: 100,
      truncated: false,
      signals: ["chunks"],
      timestamp: Date.now(),
      chunks: [
        {
          chunk: {
            id: "chunk-1",
            text: "Test chunk content",
            embedding: [0.1, 0.2, 0.3],
            metadata: {
              contentId: "content-1",
              pocketId: "pocket-1",
              sourceType: "text",
              sourceUrl: "https://example.com",
              chunkIndex: 0,
              totalChunks: 1,
              startOffset: 0,
              endOffset: 100,
              capturedAt: Date.now(),
              chunkedAt: Date.now(),
              textPreview: "Test chunk",
            },
          },
          relevanceScore: 0.85,
        },
      ],
    }),
  },
  serializeContextBundle: vi.fn().mockReturnValue("Context preamble"),
}));

describe("ModeAwareProcessor - Pocket Attachment Integration", () => {
  let processor: ModeAwareProcessor;
  let mockAIManager: AIManager;
  let mockCloudAIManager: CloudAIManager;
  let testPocketId: string;
  let testConversationId: string;
  let secondPocketId: string;

  beforeEach(async () => {
    await indexedDBManager.init();
    mockAIManager = {} as AIManager;
    mockCloudAIManager = {} as CloudAIManager;
    processor = new ModeAwareProcessor(mockAIManager, mockCloudAIManager);

    testPocketId = await indexedDBManager.createPocket({
      name: "Test Pocket",
      description: "A test pocket",
      contentIds: [],
      tags: ["test"],
      color: "#FF5733",
    });

    secondPocketId = await indexedDBManager.createPocket({
      name: "Second Pocket",
      description: "Another test pocket",
      contentIds: [],
      tags: ["test"],
      color: "#33FF57",
    });

    testConversationId = await indexedDBManager.saveConversation({
      messages: [
        {
          id: crypto.randomUUID(),
          role: "user",
          content: "Hello",
          timestamp: Date.now(),
          source: "gemini-nano",
        },
      ],
      model: "gemini-nano",
      tokensUsed: 10,
    });
  });

  afterEach(async () => {
    try {
      await indexedDBManager.deleteConversation(testConversationId);
    } catch (error) {
      // Ignore
    }

    try {
      await indexedDBManager.deletePocket(testPocketId);
    } catch (error) {
      // Ignore
    }

    try {
      await indexedDBManager.deletePocket(secondPocketId);
    } catch (error) {
      // Ignore
    }

    vi.clearAllMocks();
  });

  describe("Ask Mode - Pocket Attachment", () => {
    it("should read attachedPocketId from conversation", async () => {
      await indexedDBManager.attachPocketToConversation(
        testConversationId,
        testPocketId,
      );

      const request = {
        prompt: "What's in my pocket?",
        mode: "ask" as const,
        conversationId: testConversationId,
        autoContext: true,
      };

      const generator = processor.processRequest(request);
      const chunks: string[] = [];
      for await (const chunk of generator) {
        chunks.push(chunk);
      }

      const { contextBundleBuilder } = await import("./context-bundle.js");
      expect(contextBundleBuilder.buildContextBundle).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: "ask",
          pocketId: testPocketId,
          conversationId: testConversationId,
        }),
      );
    });

    it("should prioritize conversation.attachedPocketId over request.pocketId", async () => {
      await indexedDBManager.attachPocketToConversation(
        testConversationId,
        testPocketId,
      );

      const request = {
        prompt: "What's in my pocket?",
        mode: "ask" as const,
        conversationId: testConversationId,
        pocketId: secondPocketId,
        autoContext: true,
      };

      const generator = processor.processRequest(request);
      for await (const chunk of generator) {
        // Consume
      }

      const { contextBundleBuilder } = await import("./context-bundle.js");
      expect(contextBundleBuilder.buildContextBundle).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: "ask",
          pocketId: testPocketId,
          conversationId: testConversationId,
        }),
      );
    });

    it("should validate pocket existence and detach if not found", async () => {
      await indexedDBManager.attachPocketToConversation(
        testConversationId,
        testPocketId,
      );

      await indexedDBManager.deletePocket(testPocketId);

      const request = {
        prompt: "What's in my pocket?",
        mode: "ask" as const,
        conversationId: testConversationId,
        autoContext: true,
      };

      const generator = processor.processRequest(request);
      for await (const chunk of generator) {
        // Consume
      }

      const conversation =
        await indexedDBManager.getConversation(testConversationId);
      expect(conversation?.attachedPocketId).toBeUndefined();

      const { contextBundleBuilder } = await import("./context-bundle.js");
      expect(contextBundleBuilder.buildContextBundle).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: "ask",
          pocketId: undefined,
          conversationId: testConversationId,
        }),
      );
    });
  });

  describe("AI Pocket Mode - Pocket Attachment", () => {
    it("should read attachedPocketId from conversation", async () => {
      await indexedDBManager.attachPocketToConversation(
        testConversationId,
        testPocketId,
      );

      const request = {
        prompt: "What's in my pocket?",
        mode: "ai-pocket" as const,
        conversationId: testConversationId,
      };

      const generator = processor.processRequest(request);
      for await (const chunk of generator) {
        // Consume
      }

      const { contextBundleBuilder } = await import("./context-bundle.js");
      expect(contextBundleBuilder.buildContextBundle).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: "ai-pocket",
          pocketId: testPocketId,
          conversationId: testConversationId,
        }),
      );
    });

    it("should validate pocket existence and detach if not found", async () => {
      await indexedDBManager.attachPocketToConversation(
        testConversationId,
        testPocketId,
      );

      await indexedDBManager.deletePocket(testPocketId);

      const request = {
        prompt: "What's in my pocket?",
        mode: "ai-pocket" as const,
        conversationId: testConversationId,
      };

      const generator = processor.processRequest(request);
      for await (const chunk of generator) {
        // Consume
      }

      const conversation =
        await indexedDBManager.getConversation(testConversationId);
      expect(conversation?.attachedPocketId).toBeUndefined();
    });
  });
});
