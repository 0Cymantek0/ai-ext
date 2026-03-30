import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getRoutingPreferencesMock,
  getModelSheetMock,
  classifyPromptWithNanoMock,
  createAdapterMock,
  getProviderMock,
  isInitializedMock,
  initializeMock,
} = vi.hoisted(() => ({
  getRoutingPreferencesMock: vi.fn(),
  getModelSheetMock: vi.fn(),
  classifyPromptWithNanoMock: vi.fn(),
  createAdapterMock: vi.fn(),
  getProviderMock: vi.fn(),
  isInitializedMock: vi.fn(),
  initializeMock: vi.fn(),
}));

vi.mock("./settings-manager.js", () => ({
  SettingsManager: vi.fn().mockImplementation(() => ({
    getRoutingPreferences: getRoutingPreferencesMock,
    getModelSheet: getModelSheetMock,
  })),
}));

vi.mock("./nano-classifier.js", () => ({
  classifyPromptWithNano: classifyPromptWithNanoMock,
}));

vi.mock("../adapters/provider-factory.js", () => ({
  ProviderFactory: {
    createAdapter: createAdapterMock,
  },
}));

vi.mock("../provider-config-manager.js", () => ({
  getProviderConfigManager: vi.fn(() => ({
    isInitialized: isInitializedMock,
    initialize: initializeMock,
    getProvider: getProviderMock,
  })),
}));

import { ProviderRouter } from "./provider-router.js";

describe("ProviderRouter", () => {
  beforeEach(() => {
    getRoutingPreferencesMock.mockReset();
    getModelSheetMock.mockReset();
    classifyPromptWithNanoMock.mockReset();
    createAdapterMock.mockReset();
    getProviderMock.mockReset();
    isInitializedMock.mockReset();
    initializeMock.mockReset();

    isInitializedMock.mockReturnValue(true);
    initializeMock.mockResolvedValue(undefined);

    getRoutingPreferencesMock.mockResolvedValue({
      chat: "provider-default",
      embeddings: null,
      speech: null,
      fallbackChain: ["provider-fallback"],
      routingMode: "auto",
      triggerWords: {
        code: "provider-trigger",
      },
      providerParameters: {},
    });

    getModelSheetMock.mockResolvedValue({
      "default-model": {
        modelId: "default-model",
        providerId: "provider-default",
        providerType: "openai",
        enabled: true,
        tier: { cost: "low", speed: "medium", quality: "basic" },
      },
      "trigger-model": {
        modelId: "trigger-model",
        providerId: "provider-trigger",
        providerType: "groq",
        enabled: true,
        tier: { cost: "medium", speed: "fast", quality: "advanced" },
      },
      "preferred-model": {
        modelId: "preferred-model",
        providerId: "provider-explicit",
        providerType: "ollama",
        enabled: true,
        tier: { cost: "free", speed: "medium", quality: "advanced" },
      },
      "fallback-model": {
        modelId: "fallback-model",
        providerId: "provider-fallback",
        providerType: "openai",
        enabled: true,
        tier: { cost: "medium", speed: "medium", quality: "advanced" },
      },
    });

    getProviderMock.mockImplementation(async (providerId: string) => {
      const providers: Record<string, any> = {
        "provider-default": {
          id: "provider-default",
          type: "openai",
          enabled: true,
          modelId: "default-model",
        },
        "provider-trigger": {
          id: "provider-trigger",
          type: "groq",
          enabled: true,
          modelId: "trigger-model",
        },
        "provider-explicit": {
          id: "provider-explicit",
          type: "ollama",
          enabled: true,
          modelId: "preferred-model",
        },
        "provider-fallback": {
          id: "provider-fallback",
          type: "openai",
          enabled: true,
          modelId: "fallback-model",
        },
      };

      return providers[providerId] ?? null;
    });

    createAdapterMock.mockImplementation(async (config: { id: string }) => ({
      config,
      validateConnection: vi.fn().mockResolvedValue({ success: true }),
    }));
  });

  it("skips auto heuristics when provider is explicitly selected", async () => {
    const router = new ProviderRouter();

    const result = await router.resolveCapability(
      "chat",
      "please write code for this",
      undefined,
      "provider-explicit",
      "preferred-model",
    );

    expect(classifyPromptWithNanoMock).not.toHaveBeenCalled();
    expect(result.metadata.providerId).toBe("provider-explicit");
    expect(result.metadata.modelId).toBe("preferred-model");
    expect(result.metadata.attemptedProviderIds[0]).toBe("provider-explicit");
    expect(result.metadata.fallbackOccurred).toBe(false);
  });

  it("still uses auto heuristics when there is no explicit selection", async () => {
    classifyPromptWithNanoMock.mockResolvedValue({
      complexity: 8,
      intent: "code",
      budget_signal: "medium",
    });

    const router = new ProviderRouter();

    const result = await router.resolveCapability("chat", "please help with this");

    expect(classifyPromptWithNanoMock).toHaveBeenCalledTimes(1);
    expect(result.metadata.providerId).toBe("provider-trigger");
    expect(result.metadata.attemptedProviderIds[0]).toBe("provider-trigger");
  });
});
