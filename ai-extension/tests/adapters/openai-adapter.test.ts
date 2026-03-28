import { beforeEach, describe, expect, it, vi } from "vitest";
import * as aiModule from "ai";
import * as aiSdkOpenai from "@ai-sdk/openai";
import { OpenAIAdapter } from "../../src/background/adapters/openai-adapter.js";
import type { ProviderConfig } from "../../src/background/provider-types.js";

vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: vi.fn(() => vi.fn((modelId) => ({ provider: "openai", modelId }))),
}));

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return {
    ...actual,
    generateText: vi.fn(),
  };
});

describe("OpenAIAdapter", () => {
  let config: ProviderConfig;
  const mockApiKey = "sk-test-123";

  beforeEach(() => {
    vi.clearAllMocks();
    config = {
      id: "openai-1",
      type: "openai",
      name: "OpenAI",
      enabled: true,
      endpointMode: "native",
      baseUrl: "https://api.openai.com/v1",
      apiKeyRequired: true,
      defaultHeaders: { "X-Test": "1" },
      defaultQueryParams: { apiVersion: "1" },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  });

  it("should pass provider transport metadata into createOpenAI", () => {
    const adapter = new OpenAIAdapter(config, mockApiKey);
    const model = adapter.getLanguageModel() as any;

    expect(aiSdkOpenai.createOpenAI).toHaveBeenCalledWith({
      apiKey: mockApiKey,
      baseURL: "https://api.openai.com/v1",
      headers: { "X-Test": "1" },
    });
    expect(model.provider).toBe("openai");
    expect(model.modelId).toBe("gpt-4o-mini");
  });

  it("should use config model id when present", () => {
    config.modelId = "gpt-4-turbo";
    const adapter = new OpenAIAdapter(config, mockApiKey);

    expect((adapter.getLanguageModel() as any).modelId).toBe("gpt-4-turbo");
  });

  it("should validate connection successfully", async () => {
    vi.mocked(aiModule.generateText).mockResolvedValueOnce({ text: "ok" } as any);

    const adapter = new OpenAIAdapter(config, mockApiKey);
    await expect(adapter.validateConnection()).resolves.toEqual({ success: true });
  });

  it("should fail validation when a required API key is missing", async () => {
    const adapter = new OpenAIAdapter(config, "");
    await expect(adapter.validateConnection()).resolves.toEqual({
      success: false,
      error: "API key is missing.",
    });
  });

  it("should allow missing API key when provider config marks auth optional", async () => {
    config.apiKeyRequired = false;
    vi.mocked(aiModule.generateText).mockResolvedValueOnce({ text: "ok" } as any);

    const adapter = new OpenAIAdapter(config, "");
    await expect(adapter.validateConnection()).resolves.toEqual({ success: true });
  });
});
