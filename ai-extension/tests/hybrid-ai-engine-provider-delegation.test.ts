import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  HybridAIEngine,
  ProcessingLocation,
  TaskOperation,
  type Task,
} from "../src/background/hybrid-ai-engine.js";
import type { AIResponse } from "../src/background/ai-manager.js";
import type {
  ProviderExecutionMetadata,
  ProviderTextResult,
} from "../src/background/provider-execution/types.js";

const createTask = (text = "Explain provider routing"): Task => ({
  content: { text },
  operation: TaskOperation.GENERAL,
});

const executionMetadata: ProviderExecutionMetadata = {
  providerId: "primary-provider",
  providerType: "openai",
  modelId: "gpt-4o-mini",
  attemptedProviderIds: ["primary-provider", "fallback-provider"],
  fallbackFromProviderId: "fallback-provider",
  fallbackOccurred: true,
};

const providerTextResult: ProviderTextResult = {
  text: "Provider-routed answer",
  usage: {
    promptTokens: 12,
    completionTokens: 18,
    totalTokens: 30,
  },
  metadata: executionMetadata,
};

const createStream = (...chunks: string[]) =>
  (async function* () {
    for (const chunk of chunks) {
      yield chunk;
    }
  })();

describe("HybridAIEngine provider delegation", () => {
  let aiManager: {
    createSession: ReturnType<typeof vi.fn>;
    checkModelAvailability: ReturnType<typeof vi.fn>;
    processPrompt: ReturnType<typeof vi.fn>;
    processPromptStreaming: ReturnType<typeof vi.fn>;
    getSessionUsage: ReturnType<typeof vi.fn>;
  };
  let cloudAIManager: {
    isAvailable: ReturnType<typeof vi.fn>;
    processWithRetry: ReturnType<typeof vi.fn>;
    processWithFlashStreaming: ReturnType<typeof vi.fn>;
    processWithProStreaming: ReturnType<typeof vi.fn>;
    processWithModelStreaming: ReturnType<typeof vi.fn>;
    generateEmbedding: ReturnType<typeof vi.fn>;
  };
  let executionService: {
    generateText: ReturnType<typeof vi.fn>;
    streamText: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    aiManager = {
      createSession: vi.fn().mockResolvedValue("nano-session"),
      checkModelAvailability: vi.fn().mockResolvedValue("readily"),
      processPrompt: vi.fn().mockResolvedValue("nano-response"),
      processPromptStreaming: vi.fn().mockResolvedValue(
        new ReadableStream<string>({
          start(controller) {
            controller.enqueue("nano-stream");
            controller.close();
          },
        }),
      ),
      getSessionUsage: vi.fn().mockReturnValue({ used: 7 }),
    };

    cloudAIManager = {
      isAvailable: vi.fn().mockReturnValue(true),
      processWithRetry: vi.fn().mockResolvedValue({
        result: "cloud-response",
        source: "gemini-flash",
        confidence: 0.8,
        processingTime: 10,
        tokensUsed: 4,
      } satisfies AIResponse),
      processWithFlashStreaming: vi
        .fn()
        .mockImplementation(() => createStream("cloud", "-flash")),
      processWithProStreaming: vi
        .fn()
        .mockImplementation(() => createStream("cloud", "-pro")),
      processWithModelStreaming: vi
        .fn()
        .mockImplementation(() => createStream("cloud", "-lite")),
      generateEmbedding: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    };

    executionService = {
      generateText: vi.fn().mockResolvedValue(providerTextResult),
      streamText: vi.fn().mockReturnValue(createStream("provider", "-stream")),
    };
  });

  it("calls ProviderExecutionService.generateText for provider-routed general tasks", async () => {
    const engine = new HybridAIEngine(
      aiManager as any,
      cloudAIManager as any,
      executionService as any,
    );

    const result = await engine.processContent(createTask(), {
      preferLocal: false,
    });

    expect(executionService.generateText).toHaveBeenCalledTimes(1);
    expect(executionService.generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("Explain provider routing"),
        task: expect.objectContaining({ operation: TaskOperation.GENERAL }),
      }),
    );
    expect(result.result).toBe("Provider-routed answer");
    expect(result.tokensUsed).toBe(30);
    expect(result.metadata).toEqual(executionMetadata);
    expect(cloudAIManager.processWithRetry).not.toHaveBeenCalled();
  });

  it("calls ProviderExecutionService.streamText for provider-routed general streaming tasks", async () => {
    const engine = new HybridAIEngine(
      aiManager as any,
      cloudAIManager as any,
      executionService as any,
    );

    const chunks: string[] = [];
    for await (const chunk of engine.processContentStreaming(createTask(), {
      preferLocal: false,
    })) {
      chunks.push(chunk);
    }

    expect(executionService.streamText).toHaveBeenCalledTimes(1);
    expect(executionService.streamText).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("Explain provider routing"),
        task: expect.objectContaining({ operation: TaskOperation.GENERAL }),
      }),
    );
    expect(chunks).toEqual(["provider", "-stream"]);
    expect(cloudAIManager.processWithFlashStreaming).not.toHaveBeenCalled();
    expect(cloudAIManager.processWithModelStreaming).not.toHaveBeenCalled();
  });

  it("still honors forcedLocation compatibility branches for explicit Gemini overrides", async () => {
    const engine = new HybridAIEngine(
      aiManager as any,
      cloudAIManager as any,
      executionService as any,
    );

    const result = await engine.processContent(createTask(), {
      forcedLocation: ProcessingLocation.GEMINI_FLASH,
      forcedLocationReason: "forcedLocation for compatibility",
    });

    const streamedChunks: string[] = [];
    for await (const chunk of engine.processContentStreaming(createTask(), {
      forcedLocation: ProcessingLocation.GEMINI_FLASH,
      forcedLocationReason: "forcedLocation for compatibility",
    })) {
      streamedChunks.push(chunk);
    }

    expect(executionService.generateText).not.toHaveBeenCalled();
    expect(executionService.streamText).not.toHaveBeenCalled();
    expect(cloudAIManager.processWithRetry).toHaveBeenCalledTimes(1);
    expect(cloudAIManager.processWithFlashStreaming).toHaveBeenCalledTimes(1);
    expect(result.source).toBe("gemini-flash");
    expect(streamedChunks).toEqual(["cloud", "-flash"]);
  });

  it("keeps generateEmbedding on the existing cloud path", async () => {
    const engine = new HybridAIEngine(
      aiManager as any,
      cloudAIManager as any,
      executionService as any,
    );

    const embedding = await engine.generateEmbedding("embed me");

    expect(cloudAIManager.generateEmbedding).toHaveBeenCalledWith("embed me");
    expect(embedding).toEqual([0.1, 0.2, 0.3]);
  });
});
