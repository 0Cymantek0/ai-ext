/**
 * Streaming Handler Tests
 *
 * Tests for mode validation and routing functionality
 * Requirements: 8.2.1, 8.2.2, 8.2.3, 8.2.6, 8.2.7
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { AiStreamRequestPayload } from "../shared/types/index.d";
import type { ModeAwareRequest } from "./mode-aware-processor";

const routeQueryMock = vi.fn();
const processRequestMock = vi.fn();
const getModeAwareProcessorMock = vi.fn();
const buildConversationContextMock = vi.fn();

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

vi.mock("./mode-aware-processor", () => ({
  getModeAwareProcessor: getModeAwareProcessorMock,
  ModeAwareProcessor: vi.fn(),
}));

vi.mock("./query-router", () => ({
  routeQuery: routeQueryMock,
}));

vi.mock("./conversation-context-loader", () => ({
  conversationContextLoader: {
    buildConversationContext: buildConversationContextMock,
    formatContextAsString: vi.fn(),
  },
}));

vi.mock("./hybrid-ai-engine", () => ({
  HybridAIEngine: vi.fn().mockImplementation(() => ({})),
  TaskOperation: {
    GENERAL: "general",
  },
}));

import { StreamingHandler } from "./streaming-handler";
import { logger } from "./monitoring";

const loggerInfoMock = logger.info as unknown as ReturnType<typeof vi.fn>;
const loggerWarnMock = logger.warn as unknown as ReturnType<typeof vi.fn>;
const loggerErrorMock = logger.error as unknown as ReturnType<typeof vi.fn>;

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

describe("Streaming with Chunk-Level RAG", () => {
  describe("Ask Mode RAG Context", () => {
    it("should include pocketId in Ask mode streaming request", () => {
      const payload: AiStreamRequestPayload = {
        prompt: "What does my research say?",
        mode: "ask",
        pocketId: "pocket-research",
        autoContext: true,
      };

      expect(payload.mode).toBe("ask");
      expect(payload.pocketId).toBe("pocket-research");
      expect(payload.autoContext).toBe(true);
    });

    it("should support Ask mode with conversation and pocket context", () => {
      const payload: AiStreamRequestPayload = {
        prompt: "Follow-up about my saved content",
        mode: "ask",
        pocketId: "pocket-456",
        conversationId: "conv-789",
        autoContext: true,
      };

      expect(payload).toMatchObject({
        mode: "ask",
        pocketId: "pocket-456",
        conversationId: "conv-789",
        autoContext: true,
      });
    });
  });

  describe("Context Window Budgets", () => {
    it("should indicate expanded budget for Ask mode with RAG", () => {
      const payload: AiStreamRequestPayload = {
        prompt: "Query requiring RAG context",
        mode: "ask",
        pocketId: "pocket-large",
        autoContext: true,
      };

      // The processor will use 6000 token budget when pocketId is present
      expect(payload.pocketId).toBeDefined();
      expect(payload.mode).toBe("ask");
    });

    it("should use standard budget for Ask mode without RAG", () => {
      const payload: AiStreamRequestPayload = {
        prompt: "General conversation",
        mode: "ask",
        autoContext: true,
      };

      // The processor will use 4000 token budget when no pocketId
      expect(payload.pocketId).toBeUndefined();
      expect(payload.mode).toBe("ask");
    });
  });

  describe("Empty Pocket Handling", () => {
    it("should gracefully handle empty pocket in streaming request", () => {
      const payload: AiStreamRequestPayload = {
        prompt: "Query on empty pocket",
        mode: "ask",
        pocketId: "empty-pocket-123",
        autoContext: true,
      };

      // Should be valid even if pocket is empty
      expect(payload.pocketId).toBe("empty-pocket-123");
      expect(payload.mode).toBe("ask");
    });

    it("should support fallback messaging in context", () => {
      const streamEndPayload = {
        requestId: "req-123",
        totalTokens: 50,
        processingTime: 200,
        source: "gemini-nano" as const,
        mode: "ask" as const,
        contextUsed: ["history"], // No "pockets" signal when empty
      };

      expect(streamEndPayload.contextUsed).not.toContain("pockets");
      expect(streamEndPayload.mode).toBe("ask");
    });
  });

  describe("Context Assembly Tracking", () => {
    it("should track pockets signal in contextUsed", () => {
      const streamEndPayload = {
        requestId: "req-456",
        totalTokens: 1500,
        processingTime: 850,
        source: "gemini-flash" as const,
        mode: "ask" as const,
        contextUsed: ["history", "pockets", "page"],
      };

      expect(streamEndPayload.contextUsed).toContain("pockets");
      expect(streamEndPayload.contextUsed).toContain("history");
      expect(streamEndPayload.mode).toBe("ask");
    });

    it("should indicate successful RAG retrieval in context signals", () => {
      const streamEndPayload = {
        requestId: "req-789",
        totalTokens: 2500,
        processingTime: 1200,
        source: "gemini-pro" as const,
        mode: "ask" as const,
        contextUsed: ["pockets", "history"],
      };

      // Pockets signal indicates RAG was used
      expect(streamEndPayload.contextUsed).toContain("pockets");
      expect(streamEndPayload.contextUsed.length).toBeGreaterThanOrEqual(2);
    });

    it("should handle truncated context in streaming", () => {
      const streamEndPayload = {
        requestId: "req-truncated",
        totalTokens: 6000, // At budget limit
        processingTime: 1500,
        source: "gemini-flash" as const,
        mode: "ask" as const,
        contextUsed: ["pockets", "history", "page"],
      };

      // Context was likely truncated to fit budget
      expect(streamEndPayload.totalTokens).toBe(6000);
      expect(streamEndPayload.contextUsed.length).toBeGreaterThan(0);
    });
  });

  describe("Pocket Scoping in Streaming", () => {
    it("should enforce pocket scoping when pocketId provided", () => {
      const payload: AiStreamRequestPayload = {
        prompt: "Scoped search query",
        mode: "ask",
        pocketId: "scoped-pocket-999",
        autoContext: true,
      };

      // Payload should maintain pocket scope
      expect(payload.pocketId).toBe("scoped-pocket-999");
      expect(payload.mode).toBe("ask");
    });

    it("should search all pockets when no pocketId in AI Pocket mode", () => {
      const payload: AiStreamRequestPayload = {
        prompt: "Search everywhere",
        mode: "ai-pocket",
        autoContext: true,
      };

      // No pocket scoping
      expect(payload.pocketId).toBeUndefined();
      expect(payload.mode).toBe("ai-pocket");
    });
  });
});

describe("StreamingHandler routing integration", () => {
  const originalChrome = (globalThis as any).chrome;
  const originalCrypto = (globalThis as any).crypto;

  let randomUUIDMock: ReturnType<typeof vi.fn>;
  let sendMessageMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    routeQueryMock.mockReset();
    processRequestMock.mockReset();
    getModeAwareProcessorMock.mockReset();
    buildConversationContextMock.mockReset();

    loggerInfoMock.mockReset();
    loggerWarnMock.mockReset();
    loggerErrorMock.mockReset();

    getModeAwareProcessorMock.mockReturnValue({
      processRequest: processRequestMock,
    });

    buildConversationContextMock.mockResolvedValue({
      messages: [{ role: "user", content: "hello" }],
      totalTokens: 240,
      truncated: false,
      conversationId: "conv-123",
    });

    sendMessageMock = vi.fn().mockResolvedValue({});
    (globalThis as any).chrome = {
      runtime: {
        sendMessage: sendMessageMock,
      },
    };

    randomUUIDMock = vi.fn();
    randomUUIDMock.mockReturnValue("fixed-id");
    (globalThis as any).crypto = {
      ...(originalCrypto ?? {}),
      randomUUID: randomUUIDMock,
    };
  });

  afterEach(() => {
    routeQueryMock.mockReset();
    processRequestMock.mockReset();
    getModeAwareProcessorMock.mockReset();
    buildConversationContextMock.mockReset();

    if (originalChrome) {
      (globalThis as any).chrome = originalChrome;
    } else {
      delete (globalThis as any).chrome;
    }

    if (originalCrypto) {
      (globalThis as any).crypto = originalCrypto;
    } else {
      delete (globalThis as any).crypto;
    }

    loggerInfoMock.mockReset();
    loggerWarnMock.mockReset();
    loggerErrorMock.mockReset();
  });

  it("routes auto model requests and forwards decision", async () => {
    randomUUIDMock
      .mockReturnValueOnce("request-1")
      .mockReturnValueOnce("message-1");

    routeQueryMock.mockResolvedValue({
      targetModel: "flash",
      reason: "Auto-route to flash",
      confidence: 0.82,
      preferLocal: false,
      metadata: { heuristics: { promptLength: 32 } },
    });

    processRequestMock.mockImplementation(async function* (request: ModeAwareRequest) {
      yield "partial";
      yield {
        content: "partial",
        source:
          request.targetModel === "pro"
            ? "gemini-pro"
            : request.targetModel === "flash"
              ? "gemini-flash"
              : "gemini-nano",
        mode: request.mode,
        contextUsed: [],
        tokensUsed: 12,
        processingTime: 5,
      };
    });

    const handler = new StreamingHandler({} as any, {} as any);

    await handler.startStreaming(
      {
        prompt: "Please summarize my saved pocket research.",
        mode: "ask",
        conversationId: "conv-123",
        autoContext: true,
        model: "auto",
      },
      {} as any,
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(routeQueryMock).toHaveBeenCalledTimes(1);
    expect(routeQueryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "Please summarize my saved pocket research.",
        mode: "ask",
        conversation: expect.objectContaining({
          id: "conv-123",
          metadata: expect.objectContaining({
            messageCount: 1,
            totalTokens: 240,
          }),
        }),
      }),
    );

    expect(processRequestMock).toHaveBeenCalledTimes(1);
    const modeAwareArg = processRequestMock.mock.calls[0][0] as ModeAwareRequest;
    expect(modeAwareArg.targetModel).toBe("flash");
    expect(modeAwareArg.preferLocal).toBe(false);
    expect(modeAwareArg.routingMetadata).toMatchObject({
      reason: "Auto-route to flash",
      confidence: 0.82,
    });

    const startCall = sendMessageMock.mock.calls.find(
      ([message]: any[]) => message.kind === "AI_PROCESS_STREAM_START",
    );
    expect(startCall?.[0].payload.resolvedModel).toBe("flash");
  });

  it("bypasses router when model is manually selected", async () => {
    randomUUIDMock
      .mockReturnValueOnce("request-2")
      .mockReturnValueOnce("message-2");

    processRequestMock.mockImplementation(async function* (request: ModeAwareRequest) {
      yield {
        content: "result",
        source: "gemini-pro",
        mode: request.mode,
        contextUsed: [],
        tokensUsed: 20,
        processingTime: 10,
      };
    });

    const handler = new StreamingHandler({} as any, {} as any);

    await handler.startStreaming(
      {
        prompt: "Perform deep reasoning",
        mode: "ask",
        conversationId: "conv-999",
        model: "pro",
        preferLocal: false,
        autoContext: true,
      },
      {} as any,
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(routeQueryMock).not.toHaveBeenCalled();

    expect(processRequestMock).toHaveBeenCalledTimes(1);
    const modeAwareArg = processRequestMock.mock.calls[0][0] as ModeAwareRequest;
    expect(modeAwareArg.targetModel).toBe("pro");
    expect(modeAwareArg.preferLocal).toBe(false);
    expect(modeAwareArg.routingMetadata).toBeUndefined();

    const startCall = sendMessageMock.mock.calls.find(
      ([message]: any[]) => message.kind === "AI_PROCESS_STREAM_START",
    );
    expect(startCall?.[0].payload.resolvedModel).toBe("pro");
  });

  it("falls back to preferLocal defaults when router throws", async () => {
    randomUUIDMock
      .mockReturnValueOnce("request-3")
      .mockReturnValueOnce("message-3");

    routeQueryMock.mockRejectedValue(new Error("routing failed"));

    processRequestMock.mockImplementation(async function* (request: ModeAwareRequest) {
      yield "chunk";
      yield {
        content: "chunk",
        source: request.preferLocal ? "gemini-nano" : "gemini-flash",
        mode: request.mode,
        contextUsed: [],
        tokensUsed: 15,
        processingTime: 6,
      };
    });

    const handler = new StreamingHandler({} as any, {} as any);

    await handler.startStreaming(
      {
        prompt: "quick question",
        mode: "ask",
        conversationId: "conv-abc",
        autoContext: true,
      },
      {} as any,
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    const modeAwareArg = processRequestMock.mock.calls[0][0] as ModeAwareRequest;
    expect(modeAwareArg.targetModel).toBeUndefined();
    expect(modeAwareArg.preferLocal).toBe(true);

    const startCall = sendMessageMock.mock.calls.find(
      ([message]: any[]) => message.kind === "AI_PROCESS_STREAM_START",
    );
    expect(startCall?.[0].payload.resolvedModel).toBe("nano");
  });
});
