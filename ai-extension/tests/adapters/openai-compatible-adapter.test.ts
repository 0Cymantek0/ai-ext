import { beforeEach, describe, expect, it, vi } from "vitest";
import * as aiModule from "ai";
import * as aiSdkOpenaiCompatible from "@ai-sdk/openai-compatible";

vi.mock("../../src/background/provider-config-manager.js", () => ({
  getProviderConfigManager: () => ({
    isInitialized: () => true,
    initialize: vi.fn(async () => undefined),
    getDecryptedApiKey: vi.fn(async () => null),
  }),
}));

import { OpenAICompatibleAdapter } from "../../src/background/adapters/openai-compatible-adapter.js";
import { ProviderFactory } from "../../src/background/adapters/provider-factory.js";
import { GroqAdapter } from "../../src/background/adapters/groq-adapter.js";
import { OllamaAdapter } from "../../src/background/adapters/ollama-adapter.js";
import { OpenRouterAdapter } from "../../src/background/adapters/openrouter-adapter.js";
import type { ProviderConfig } from "../../src/background/provider-types.js";

vi.mock("@ai-sdk/openai-compatible", () => ({
  createOpenAICompatible: vi.fn(() => vi.fn((modelId) => ({ provider: "compatible", modelId }))),
}));

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return {
    ...actual,
    generateText: vi.fn(),
  };
});

describe("OpenAICompatibleAdapter", () => {
  let baseConfig: ProviderConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    baseConfig = {
      id: "provider-1",
      type: "custom",
      name: "Custom",
      enabled: true,
      endpointMode: "openai-compatible",
      baseUrl: "https://example.com/v1",
      apiKeyRequired: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  });

  it("should create a compatible model with custom baseUrl, headers, and query params", () => {
    const adapter = new OpenAICompatibleAdapter(
      {
        ...baseConfig,
        defaultHeaders: { "X-Test": "1" },
        defaultQueryParams: { "api-version": "2026-03-01" },
      },
      "secret",
    );

    const model = adapter.getLanguageModel("custom-model") as any;
    expect(aiSdkOpenaiCompatible.createOpenAICompatible).toHaveBeenCalledWith({
      name: "custom",
      apiKey: "secret",
      baseURL: "https://example.com/v1",
      headers: { "X-Test": "1" },
      queryParams: { "api-version": "2026-03-01" },
    });
    expect(model.modelId).toBe("custom-model");
  });

  it("should include OpenRouter attribution headers when configured", () => {
    const adapter = new OpenAICompatibleAdapter(
      {
        ...baseConfig,
        type: "openrouter",
        providerOptions: {
          type: "openrouter",
          attributionHeaders: {
            httpReferer: "https://example.com",
            xTitle: "AI Pocket",
          },
        },
      },
      "secret",
    );

    adapter.getLanguageModel();

    expect(aiSdkOpenaiCompatible.createOpenAICompatible).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: {
          "HTTP-Referer": "https://example.com",
          "X-OpenRouter-Title": "AI Pocket",
        },
      }),
    );
  });

  it("should allow missing API key when apiKeyRequired is false", async () => {
    vi.mocked(aiModule.generateText).mockResolvedValueOnce({ text: "ok" } as any);

    const adapter = new OpenAICompatibleAdapter(
      {
        ...baseConfig,
        type: "ollama",
        apiKeyRequired: false,
      },
      undefined,
    );

    await expect(adapter.validateConnection()).resolves.toEqual({ success: true });
  });

  it("should register phase 4 providers in ProviderFactory", async () => {
    const openrouter = await ProviderFactory.createAdapter(
      {
        ...baseConfig,
        type: "openrouter",
        baseUrl: "https://openrouter.ai/api/v1",
      },
      "secret",
    );
    const ollama = await ProviderFactory.createAdapter(
      {
        ...baseConfig,
        type: "ollama",
        baseUrl: "http://localhost:11434/v1",
        apiKeyRequired: false,
      },
      undefined,
    );
    const groq = await ProviderFactory.createAdapter(
      {
        ...baseConfig,
        type: "groq",
        baseUrl: "https://api.groq.com/openai/v1",
      },
      "secret",
    );
    const custom = await ProviderFactory.createAdapter(baseConfig, "secret");

    expect(openrouter).toBeInstanceOf(OpenRouterAdapter);
    expect(ollama).toBeInstanceOf(OllamaAdapter);
    expect(groq).toBeInstanceOf(GroqAdapter);
    expect(custom).toBeInstanceOf(OpenAICompatibleAdapter);
  });
});
