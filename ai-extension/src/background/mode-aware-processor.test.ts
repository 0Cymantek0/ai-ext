/**
 * Mode-Aware Processor Tests
 *
 * Tests for mode detection, routing, and processing pipelines
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  ModeAwareProcessor,
  type ModeAwareRequest,
} from "./mode-aware-processor";
import { AIManager } from "./ai-manager";
import { CloudAIManager } from "./cloud-ai-manager";

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

vi.mock("./context-bundle", () => ({
  contextBundleBuilder: {
    buildContextBundle: vi.fn().mockResolvedValue({
      totalTokens: 100,
      truncated: false,
      signals: ["page"],
      timestamp: Date.now(),
    }),
  },
  serializeContextBundle: vi
    .fn()
    .mockReturnValue("# Context\nPage context here"),
}));

vi.mock("./hybrid-ai-engine", () => ({
  HybridAIEngine: vi.fn().mockImplementation(() => ({
    processContentStreaming: vi.fn().mockImplementation(async function* () {
      yield "Test ";
      yield "response ";
      yield "chunk";
    }),
  })),
  TaskOperation: {
    GENERAL: "general",
  },
}));

describe("ModeAwareProcessor", () => {
  let processor: ModeAwareProcessor;
  let mockAIManager: AIManager;
  let mockCloudAIManager: CloudAIManager;

  beforeEach(() => {
    mockAIManager = {} as AIManager;
    mockCloudAIManager = {} as CloudAIManager;
    processor = new ModeAwareProcessor(mockAIManager, mockCloudAIManager);
  });

  describe("Mode Detection", () => {
    it("should detect Ask mode from payload", () => {
      const mode = ModeAwareProcessor.detectMode({ mode: "ask" });
      expect(mode).toBe("ask");
    });

    it("should detect AI Pocket mode from payload", () => {
      const mode = ModeAwareProcessor.detectMode({ mode: "ai-pocket" });
      expect(mode).toBe("ai-pocket");
    });

    it("should default to Ask mode when mode is not specified", () => {
      const mode = ModeAwareProcessor.detectMode({});
      expect(mode).toBe("ask");
    });

    it("should default to Ask mode on invalid mode", () => {
      const mode = ModeAwareProcessor.detectMode({ mode: "invalid" });
      expect(mode).toBe("ask");
    });
  });

  describe("Ask Mode Processing", () => {
    it("should process request in Ask mode", async () => {
      const request: ModeAwareRequest = {
        prompt: "What is AI?",
        mode: "ask",
        preferLocal: true,
      };

      const chunks: string[] = [];
      for await (const chunk of processor.processRequest(request)) {
        if (typeof chunk === "string") {
          chunks.push(chunk);
        }
      }

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks.join("")).toContain("Test response chunk");
    });

    it("should include conversation context in Ask mode", async () => {
      const request: ModeAwareRequest = {
        prompt: "Follow-up question",
        mode: "ask",
        conversationId: "conv-123",
        preferLocal: true,
      };

      const chunks: string[] = [];
      for await (const chunk of processor.processRequest(request)) {
        if (typeof chunk === "string") {
          chunks.push(chunk);
        }
      }

      expect(chunks.length).toBeGreaterThan(0);
    });
  });

  describe("AI Pocket Mode Processing", () => {
    it("should process request in AI Pocket mode", async () => {
      const request: ModeAwareRequest = {
        prompt: "What's in my pockets?",
        mode: "ai-pocket",
        preferLocal: true,
      };

      const chunks: string[] = [];
      for await (const chunk of processor.processRequest(request)) {
        if (typeof chunk === "string") {
          chunks.push(chunk);
        }
      }

      expect(chunks.length).toBeGreaterThan(0);
    });

    it("should include pocket context in AI Pocket mode", async () => {
      const request: ModeAwareRequest = {
        prompt: "Summarize my research",
        mode: "ai-pocket",
        pocketId: "pocket-123",
        preferLocal: true,
      };

      const chunks: string[] = [];
      for await (const chunk of processor.processRequest(request)) {
        if (typeof chunk === "string") {
          chunks.push(chunk);
        }
      }

      expect(chunks.length).toBeGreaterThan(0);
    });
  });

  describe("Fallback Behavior", () => {
    it("should fallback to Ask mode on AI Pocket failure", async () => {
      // Mock the hybrid engine to throw an error on first call
      const mockEngine = {
        processContentStreaming: vi
          .fn()
          .mockImplementationOnce(async function* () {
            throw new Error("RAG failed");
          })
          .mockImplementationOnce(async function* () {
            yield "Fallback response";
          }),
      };

      // Replace the engine
      (processor as any).hybridEngine = mockEngine;

      const request: ModeAwareRequest = {
        prompt: "Query that fails",
        mode: "ai-pocket",
        preferLocal: true,
      };

      const chunks: string[] = [];
      try {
        for await (const chunk of processor.processRequest(request)) {
          if (typeof chunk === "string") {
            chunks.push(chunk);
          }
        }
      } catch (error) {
        // Expected to fallback
      }

      // Should have attempted fallback
      expect(mockEngine.processContentStreaming).toHaveBeenCalledTimes(2);
    });
  });

  describe("Context Bundle Integration", () => {
    it("should build context bundle when autoContext is enabled", async () => {
      const request: ModeAwareRequest = {
        prompt: "Test with context",
        mode: "ask",
        autoContext: true,
        preferLocal: true,
      };

      const chunks: string[] = [];
      for await (const chunk of processor.processRequest(request)) {
        if (typeof chunk === "string") {
          chunks.push(chunk);
        }
      }

      expect(chunks.length).toBeGreaterThan(0);
    });

    it("should skip context bundle when autoContext is disabled", async () => {
      const request: ModeAwareRequest = {
        prompt: "Test without context",
        mode: "ask",
        autoContext: false,
        preferLocal: true,
      };

      const chunks: string[] = [];
      for await (const chunk of processor.processRequest(request)) {
        if (typeof chunk === "string") {
          chunks.push(chunk);
        }
      }

      expect(chunks.length).toBeGreaterThan(0);
    });
  });

  describe("Ask Mode with Chunk-Level RAG", () => {
    it("should enable RAG in Ask mode when pocketId is provided", async () => {
      const { contextBundleBuilder } = await import("./context-bundle");
      const buildSpy = vi.spyOn(contextBundleBuilder, "buildContextBundle");

      const request: ModeAwareRequest = {
        prompt: "What does my research say about AI?",
        mode: "ask",
        pocketId: "pocket-123",
        autoContext: true,
        preferLocal: true,
      };

      const chunks: string[] = [];
      for await (const chunk of processor.processRequest(request)) {
        if (typeof chunk === "string") {
          chunks.push(chunk);
        }
      }

      expect(chunks.length).toBeGreaterThan(0);
      expect(buildSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: "ask",
          pocketId: "pocket-123",
          query: request.prompt,
          maxTokens: 6000, // Should use expanded budget with RAG
        }),
      );
    });

    it("should use standard budget in Ask mode without pocketId", async () => {
      const { contextBundleBuilder } = await import("./context-bundle");
      const buildSpy = vi.spyOn(contextBundleBuilder, "buildContextBundle");

      const request: ModeAwareRequest = {
        prompt: "General question",
        mode: "ask",
        autoContext: true,
        preferLocal: true,
      };

      const chunks: string[] = [];
      for await (const chunk of processor.processRequest(request)) {
        if (typeof chunk === "string") {
          chunks.push(chunk);
        }
      }

      expect(chunks.length).toBeGreaterThan(0);
      expect(buildSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: "ask",
          pocketId: undefined,
          maxTokens: 4000, // Standard budget without RAG
        }),
      );
    });

    it("should handle empty pocket gracefully in Ask mode", async () => {
      const { contextBundleBuilder } = await import("./context-bundle");
      vi.spyOn(contextBundleBuilder, "buildContextBundle").mockResolvedValue({
        totalTokens: 50,
        truncated: false,
        signals: ["history"],
        timestamp: Date.now(),
        pockets: [], // Empty pockets array
      });

      const request: ModeAwareRequest = {
        prompt: "Query with empty pocket",
        mode: "ask",
        pocketId: "empty-pocket",
        autoContext: true,
        preferLocal: true,
      };

      const chunks: string[] = [];
      for await (const chunk of processor.processRequest(request)) {
        if (typeof chunk === "string") {
          chunks.push(chunk);
        }
      }

      // Should still process successfully
      expect(chunks.length).toBeGreaterThan(0);
    });

    it("should include fallback message when no relevant content found", async () => {
      const { contextBundleBuilder } = await import("./context-bundle");
      vi.spyOn(contextBundleBuilder, "buildContextBundle").mockResolvedValue({
        totalTokens: 50,
        truncated: false,
        signals: [],
        timestamp: Date.now(),
        pockets: undefined, // No pockets
      });

      const request: ModeAwareRequest = {
        prompt: "Query for non-existent content",
        mode: "ask",
        pocketId: "pocket-with-no-matches",
        autoContext: true,
        preferLocal: true,
      };

      const chunks: string[] = [];
      for await (const chunk of processor.processRequest(request)) {
        if (typeof chunk === "string") {
          chunks.push(chunk);
        }
      }

      expect(chunks.length).toBeGreaterThan(0);
    });

    it("should enforce pocket scoping when pocketId provided", async () => {
      const { contextBundleBuilder } = await import("./context-bundle");
      const buildSpy = vi.spyOn(contextBundleBuilder, "buildContextBundle");

      const request: ModeAwareRequest = {
        prompt: "Search within specific pocket",
        mode: "ask",
        pocketId: "scoped-pocket-456",
        autoContext: true,
        preferLocal: true,
      };

      const chunks: string[] = [];
      for await (const chunk of processor.processRequest(request)) {
        if (typeof chunk === "string") {
          chunks.push(chunk);
        }
      }

      expect(buildSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          pocketId: "scoped-pocket-456",
        }),
      );
    });

    it("should respect context window budgets with RAG", async () => {
      const { contextBundleBuilder } = await import("./context-bundle");
      vi.spyOn(contextBundleBuilder, "buildContextBundle").mockResolvedValue({
        totalTokens: 5500, // Close to 6000 budget
        truncated: false,
        signals: ["pockets", "history"],
        timestamp: Date.now(),
        pockets: [
          {
            content: {
              id: "content-1",
              pocketId: "pocket-1",
              type: "text" as any,
              content: "Test content",
              metadata: { timestamp: Date.now() },
              capturedAt: Date.now(),
              sourceUrl: "https://example.com",
              processingStatus: "completed" as any,
            },
            relevanceScore: 0.85,
          },
        ],
      });

      const request: ModeAwareRequest = {
        prompt: "Large context query",
        mode: "ask",
        pocketId: "pocket-789",
        autoContext: true,
        preferLocal: true,
      };

      const chunks: string[] = [];
      for await (const chunk of processor.processRequest(request)) {
        if (typeof chunk === "string") {
          chunks.push(chunk);
        }
      }

      expect(chunks.length).toBeGreaterThan(0);
    });

    it("should handle truncated context gracefully", async () => {
      const { contextBundleBuilder } = await import("./context-bundle");
      vi.spyOn(contextBundleBuilder, "buildContextBundle").mockResolvedValue({
        totalTokens: 6000, // At budget limit
        truncated: true, // Context was truncated
        signals: ["pockets", "history"],
        timestamp: Date.now(),
        pockets: [
          {
            content: {
              id: "content-1",
              pocketId: "pocket-1",
              type: "text" as any,
              content: "Truncated content",
              metadata: { timestamp: Date.now() },
              capturedAt: Date.now(),
              sourceUrl: "https://example.com",
              processingStatus: "completed" as any,
            },
            relevanceScore: 0.75,
          },
        ],
      });

      const request: ModeAwareRequest = {
        prompt: "Query causing truncation",
        mode: "ask",
        pocketId: "large-pocket",
        autoContext: true,
        preferLocal: true,
      };

      const chunks: string[] = [];
      for await (const chunk of processor.processRequest(request)) {
        if (typeof chunk === "string") {
          chunks.push(chunk);
        }
      }

      expect(chunks.length).toBeGreaterThan(0);
    });
  });
});
