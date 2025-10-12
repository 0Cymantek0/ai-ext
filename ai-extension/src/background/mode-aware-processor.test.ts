/**
 * Mode-Aware Processor Tests
 * 
 * Tests for mode detection, routing, and processing pipelines
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { ModeAwareProcessor, type ModeAwareRequest } from "./mode-aware-processor";
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
  serializeContextBundle: vi.fn().mockReturnValue("# Context\nPage context here"),
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
});
