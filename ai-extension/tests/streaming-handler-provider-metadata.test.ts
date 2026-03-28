import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ModeAwareRequest, ModeAwareResponse } from "../src/background/mode-aware-processor";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const typesPath = path.resolve(__dirname, "../src/shared/types/index.d.ts");
const streamingHandlerPath = path.resolve(
  __dirname,
  "../src/background/streaming-handler.ts",
);

const typesSource = readFileSync(typesPath, "utf8");
const streamingHandlerSource = readFileSync(streamingHandlerPath, "utf8");

const {
  routeQueryMock,
  processRequestMock,
  getModeAwareProcessorMock,
  buildConversationContextMock,
  indexedDbInitMock,
  updateConversationMock,
} = vi.hoisted(() => ({
  routeQueryMock: vi.fn(),
  processRequestMock: vi.fn(),
  getModeAwareProcessorMock: vi.fn(),
  buildConversationContextMock: vi.fn(),
  indexedDbInitMock: vi.fn(),
  updateConversationMock: vi.fn(),
}));

vi.mock("../src/background/monitoring", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("../src/background/ai-manager", () => ({
  AIManager: vi.fn(),
}));

vi.mock("../src/background/cloud-ai-manager", () => ({
  CloudAIManager: vi.fn(),
}));

vi.mock("../src/background/mode-aware-processor", () => ({
  getModeAwareProcessor: getModeAwareProcessorMock,
  ModeAwareProcessor: vi.fn(),
}));

vi.mock("../src/background/query-router", () => ({
  routeQuery: routeQueryMock,
}));

vi.mock("../src/background/conversation-context-loader", () => ({
  conversationContextLoader: {
    buildConversationContext: buildConversationContextMock,
    formatContextAsString: vi.fn(),
  },
}));

vi.mock("../src/background/hybrid-ai-engine", () => ({
  HybridAIEngine: vi.fn().mockImplementation(() => ({})),
  TaskOperation: {
    GENERAL: "general",
  },
}));

vi.mock("../src/background/indexeddb-manager.js", () => ({
  indexedDBManager: {
    init: indexedDbInitMock,
    updateConversation: updateConversationMock,
  },
}));

import { StreamingHandler } from "../src/background/streaming-handler";

describe("stream metadata provider contract", () => {
  it("defines AiStreamStartPayload with provider metadata fields", () => {
    expect(typesSource).toContain("export interface AiStreamStartPayload");
    expect(typesSource).toContain("fallbackOccurred?: boolean");
    expect(typesSource).toContain("providerId?: string");
    expect(typesSource).toContain("providerType?: string");
    expect(typesSource).toContain("modelId?: string");
    expect(typesSource).toContain("fallbackFromProviderId?: string");
    expect(typesSource).toContain("attemptedProviderIds?: string[]");
  });

  it("extends AiStreamEndPayload with the same provider metadata fields", () => {
    const aiStreamEndBlock = typesSource.slice(
      typesSource.indexOf("export interface AiStreamEndPayload"),
      typesSource.indexOf("export interface AiStreamErrorPayload"),
    );

    expect(aiStreamEndBlock).toContain("fallbackOccurred?: boolean");
    expect(aiStreamEndBlock).toContain("providerId?: string");
    expect(aiStreamEndBlock).toContain("providerType?: string");
    expect(aiStreamEndBlock).toContain("modelId?: string");
    expect(aiStreamEndBlock).toContain("fallbackFromProviderId?: string");
    expect(aiStreamEndBlock).toContain("attemptedProviderIds?: string[]");
  });

  it("keeps the streaming handler wired to start and end payload contracts", () => {
    expect(streamingHandlerSource).toContain('kind: "AI_PROCESS_STREAM_START"');
    expect(streamingHandlerSource).toContain('kind: "AI_PROCESS_STREAM_END"');
    expect(streamingHandlerSource).toContain("AiStreamEndPayload");
  });
});

describe("StreamingHandler provider execution metadata", () => {
  const originalChrome = (globalThis as any).chrome;

  let randomUUIDMock: ReturnType<typeof vi.fn>;
  let sendMessageMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    routeQueryMock.mockReset();
    processRequestMock.mockReset();
    getModeAwareProcessorMock.mockReset();
    buildConversationContextMock.mockReset();
    indexedDbInitMock.mockReset();
    updateConversationMock.mockReset();

    getModeAwareProcessorMock.mockReturnValue({
      processRequest: processRequestMock,
    });

    buildConversationContextMock.mockResolvedValue({
      messages: [{ role: "user", content: "hello" }],
      totalTokens: 240,
      truncated: false,
      conversationId: "conv-123",
    });

    indexedDbInitMock.mockResolvedValue(undefined);
    updateConversationMock.mockResolvedValue(undefined);

    sendMessageMock = vi.fn().mockResolvedValue({});
    const listeners = new Set<(message: unknown) => void>();

    (globalThis as any).chrome = {
      runtime: {
        sendMessage: sendMessageMock,
        onMessage: {
          addListener: (listener: (message: unknown) => void) =>
            listeners.add(listener),
          removeListener: (listener: (message: unknown) => void) =>
            listeners.delete(listener),
        },
      },
    };

    randomUUIDMock = vi
      .spyOn(globalThis.crypto, "randomUUID")
      .mockReturnValue("fixed-id");
  });

  afterEach(() => {
    if (originalChrome) {
      (globalThis as any).chrome = originalChrome;
    } else {
      delete (globalThis as any).chrome;
    }

    randomUUIDMock.mockRestore();
  });

  it("emits provider execution metadata in stream start/end payloads and persistence", async () => {
    randomUUIDMock
      .mockReturnValueOnce("request-1")
      .mockReturnValueOnce("message-1");

    const providerExecution = {
      providerId: "openai-primary",
      providerType: "openai",
      modelId: "gpt-4.1-mini",
      attemptedProviderIds: ["openai-primary", "anthropic-fallback"],
      fallbackFromProviderId: "anthropic-fallback",
      fallbackOccurred: true,
    };

    processRequestMock.mockImplementation(
      async function* (request: ModeAwareRequest): AsyncGenerator<
        | string
        | { type: "provider-execution"; metadata: typeof providerExecution }
        | ModeAwareResponse,
        void,
        undefined
      > {
        yield {
          type: "provider-execution",
          metadata: providerExecution,
        };
        yield "Partial provider answer";
        yield {
          content: "Partial provider answer",
          source: "gemini-flash",
          mode: request.mode,
          contextUsed: ["conversation"],
          tokensUsed: 21,
          processingTime: 5,
          providerExecution,
        } as ModeAwareResponse;
      },
    );

    const handler = new StreamingHandler({} as any, {} as any);

    await handler.startStreaming(
      {
        prompt: "Summarize provider execution",
        mode: "ask",
        conversationId: "conv-123",
        autoContext: true,
      },
      {} as any,
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    const startCall = sendMessageMock.mock.calls.find(
      ([message]: any[]) => message.kind === "AI_PROCESS_STREAM_START",
    );
    const endCall = sendMessageMock.mock.calls.find(
      ([message]: any[]) => message.kind === "AI_PROCESS_STREAM_END",
    );

    expect(startCall?.[0].payload).toMatchObject(providerExecution);
    expect(endCall?.[0].payload).toMatchObject(providerExecution);
    expect(endCall?.[0].payload.fallbackOccurred).toBe(true);

    const persistedMessage = updateConversationMock.mock.calls[0]?.[1];
    expect(persistedMessage.id).toBe("message-1");
    expect(persistedMessage.metadata.providerExecution).toEqual(providerExecution);
    expect(typeof persistedMessage.metadata.tokensUsed).toBe("number");
    expect(typeof persistedMessage.metadata.processingTime).toBe("number");
  });

  it("preserves non-fallback metadata when provider execution does not fail over", async () => {
    randomUUIDMock
      .mockReturnValueOnce("request-2")
      .mockReturnValueOnce("message-2");

    processRequestMock.mockImplementation(
      async function* (request: ModeAwareRequest): AsyncGenerator<
        string | ModeAwareResponse,
        void,
        undefined
      > {
        yield {
          content: "Direct provider answer",
          source: "gemini-flash",
          mode: request.mode,
          contextUsed: [],
          tokensUsed: 10,
          processingTime: 2,
          providerExecution: {
            providerId: "openai-primary",
            providerType: "openai",
            modelId: "gpt-4.1-mini",
            attemptedProviderIds: ["openai-primary"],
            fallbackOccurred: false,
          },
        } as ModeAwareResponse;
      },
    );

    const handler = new StreamingHandler({} as any, {} as any);

    await handler.startStreaming(
      {
        prompt: "No fallback please",
        mode: "ask",
        conversationId: "conv-123",
        autoContext: true,
      },
      {} as any,
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    const endCall = sendMessageMock.mock.calls.find(
      ([message]: any[]) => message.kind === "AI_PROCESS_STREAM_END",
    );

    expect(endCall?.[0].payload.fallbackOccurred).toBe(false);
    expect(endCall?.[0].payload.fallbackFromProviderId).toBeUndefined();
    const persistedMessage = updateConversationMock.mock.calls[0]?.[1];
    expect(persistedMessage.metadata.providerExecution.fallbackOccurred).toBe(
      false,
    );
    expect(
      persistedMessage.metadata.providerExecution.fallbackFromProviderId,
    ).toBeUndefined();
  });

  it("keeps a legacy conversation message unchanged when a provider-routed turn is appended", async () => {
    randomUUIDMock
      .mockReturnValueOnce("request-3")
      .mockReturnValueOnce("message-3");

    const legacyConversationMessage = {
      id: "legacy-message",
      role: "assistant",
      content: "legacy conversation answer",
      timestamp: 100,
      source: "gemini-nano",
      metadata: {
        tokensUsed: 5,
      },
    };

    processRequestMock.mockImplementation(
      async function* (request: ModeAwareRequest): AsyncGenerator<
        string | ModeAwareResponse,
        void,
        undefined
      > {
        yield {
          content: "New routed answer",
          source: "gemini-flash",
          mode: request.mode,
          contextUsed: ["conversation"],
          tokensUsed: 12,
          processingTime: 3,
          providerExecution: {
            providerId: "anthropic-chat",
            providerType: "anthropic",
            modelId: "claude-3.7-sonnet",
            attemptedProviderIds: ["anthropic-chat"],
            fallbackOccurred: false,
          },
        } as ModeAwareResponse;
      },
    );

    const handler = new StreamingHandler({} as any, {} as any);

    await handler.startStreaming(
      {
        prompt: "Follow up on the legacy conversation",
        mode: "ask",
        conversationId: "conv-legacy",
        autoContext: true,
      },
      {} as any,
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    const persistedMessage = updateConversationMock.mock.calls[0]?.[1];
    expect(persistedMessage.metadata.providerExecution).toMatchObject({
      providerId: "anthropic-chat",
      modelId: "claude-3.7-sonnet",
    });
    expect(legacyConversationMessage).toEqual({
      id: "legacy-message",
      role: "assistant",
      content: "legacy conversation answer",
      timestamp: 100,
      source: "gemini-nano",
      metadata: {
        tokensUsed: 5,
      },
    });
  });
});
