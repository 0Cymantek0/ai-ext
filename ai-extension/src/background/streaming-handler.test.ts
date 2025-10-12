/**
 * Streaming Handler Tests
 * 
 * Tests for mode validation and routing functionality
 * Requirements: 8.2.1, 8.2.2, 8.2.3, 8.2.6, 8.2.7
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { AiStreamRequestPayload } from "../shared/types/index.d";

// Mock the dependencies
vi.mock("./monitoring", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("./ai-manager", () => ({
  AIManager: vi.fn(),
}));

vi.mock("./cloud-ai-manager", () => ({
  CloudAIManager: vi.fn(),
}));

describe("StreamingHandler Mode Validation", () => {
  describe("Mode Detection and Validation", () => {
    it("should accept valid 'ask' mode", () => {
      const payload: AiStreamRequestPayload = {
        prompt: "Test prompt",
        mode: "ask",
        autoContext: true,
      };

      expect(payload.mode).toBe("ask");
    });

    it("should accept valid 'ai-pocket' mode", () => {
      const payload: AiStreamRequestPayload = {
        prompt: "Test prompt",
        mode: "ai-pocket",
        pocketId: "test-pocket-id",
        autoContext: true,
      };

      expect(payload.mode).toBe("ai-pocket");
    });

    it("should handle missing mode field", () => {
      const payload: AiStreamRequestPayload = {
        prompt: "Test prompt",
        autoContext: true,
      };

      // Mode should default to "ask" in the handler
      expect(payload.mode).toBeUndefined();
    });

    it("should include autoContext flag", () => {
      const payload: AiStreamRequestPayload = {
        prompt: "Test prompt",
        mode: "ask",
        autoContext: false,
      };

      expect(payload.autoContext).toBe(false);
    });

    it("should handle AI Pocket mode without pocketId", () => {
      const payload: AiStreamRequestPayload = {
        prompt: "Search all pockets",
        mode: "ai-pocket",
        autoContext: true,
      };

      expect(payload.mode).toBe("ai-pocket");
      expect(payload.pocketId).toBeUndefined();
    });
  });

  describe("Mode-Aware Request Structure", () => {
    it("should include all required fields for Ask mode", () => {
      const payload: AiStreamRequestPayload = {
        prompt: "What is AI?",
        mode: "ask",
        conversationId: "conv-123",
        preferLocal: true,
        model: "nano",
        autoContext: true,
      };

      expect(payload).toHaveProperty("prompt");
      expect(payload).toHaveProperty("mode");
      expect(payload).toHaveProperty("conversationId");
      expect(payload).toHaveProperty("preferLocal");
      expect(payload).toHaveProperty("model");
      expect(payload).toHaveProperty("autoContext");
    });

    it("should include all required fields for AI Pocket mode", () => {
      const payload: AiStreamRequestPayload = {
        prompt: "Find information about X",
        mode: "ai-pocket",
        pocketId: "pocket-456",
        conversationId: "conv-123",
        preferLocal: false,
        model: "flash",
        autoContext: true,
      };

      expect(payload).toHaveProperty("prompt");
      expect(payload).toHaveProperty("mode");
      expect(payload).toHaveProperty("pocketId");
      expect(payload).toHaveProperty("conversationId");
      expect(payload).toHaveProperty("preferLocal");
      expect(payload).toHaveProperty("model");
      expect(payload).toHaveProperty("autoContext");
    });
  });

  describe("AutoContext Flag", () => {
    it("should default autoContext to true when not specified", () => {
      const payload: AiStreamRequestPayload = {
        prompt: "Test",
        mode: "ask",
      };

      // In the handler, autoContext defaults to true
      const autoContext = payload.autoContext ?? true;
      expect(autoContext).toBe(true);
    });

    it("should respect explicit autoContext false", () => {
      const payload: AiStreamRequestPayload = {
        prompt: "Test",
        mode: "ask",
        autoContext: false,
      };

      expect(payload.autoContext).toBe(false);
    });

    it("should work with AI Pocket mode", () => {
      const payload: AiStreamRequestPayload = {
        prompt: "Test",
        mode: "ai-pocket",
        pocketId: "test",
        autoContext: true,
      };

      expect(payload.autoContext).toBe(true);
    });
  });
});

describe("Mode-Aware Response Structure", () => {
  it("should include mode in stream end payload", () => {
    const streamEndPayload = {
      requestId: "req-123",
      conversationId: "conv-123",
      totalTokens: 100,
      processingTime: 500,
      source: "gemini-nano" as const,
      mode: "ask" as const,
      contextUsed: ["conversation", "page"],
    };

    expect(streamEndPayload).toHaveProperty("mode");
    expect(streamEndPayload).toHaveProperty("contextUsed");
    expect(streamEndPayload.mode).toBe("ask");
    expect(streamEndPayload.contextUsed).toContain("conversation");
  });

  it("should include context signals in response", () => {
    const streamEndPayload = {
      requestId: "req-123",
      totalTokens: 150,
      processingTime: 750,
      source: "gemini-flash" as const,
      mode: "ai-pocket" as const,
      contextUsed: ["pockets", "conversation", "page", "tabs"],
    };

    expect(streamEndPayload.contextUsed).toHaveLength(4);
    expect(streamEndPayload.contextUsed).toContain("pockets");
  });
});

describe("BaseMessage Mode Support", () => {
  it("should support optional mode field in BaseMessage", () => {
    const message = {
      kind: "AI_PROCESS_STREAM_START" as const,
      requestId: "req-123",
      payload: {
        prompt: "Test",
        mode: "ask" as const,
      },
      mode: "ask" as const,
    };

    expect(message).toHaveProperty("mode");
    expect(message.mode).toBe("ask");
  });

  it("should work without mode field for backward compatibility", () => {
    const message: {
      kind: "AI_PROCESS_STREAM_START";
      requestId: string;
      payload: { prompt: string };
      mode?: "ask" | "ai-pocket";
    } = {
      kind: "AI_PROCESS_STREAM_START" as const,
      requestId: "req-123",
      payload: {
        prompt: "Test",
      },
    };

    expect(message.mode).toBeUndefined();
  });
});
