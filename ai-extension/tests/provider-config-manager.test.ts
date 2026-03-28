import { beforeEach, describe, expect, it, vi } from "vitest";

const storageState = new Map<string, unknown>();

const mockLocalStorage = {
  get: vi.fn(async (keys?: string | string[] | null) => {
    if (keys == null) {
      return Object.fromEntries(storageState);
    }

    if (Array.isArray(keys)) {
      return Object.fromEntries(keys.map((key) => [key, storageState.get(key)]));
    }

    return { [keys]: storageState.get(keys) };
  }),
  set: vi.fn(async (items: Record<string, unknown>) => {
    Object.entries(items).forEach(([key, value]) => storageState.set(key, value));
  }),
  remove: vi.fn(async (keys: string | string[]) => {
    for (const key of Array.isArray(keys) ? keys : [keys]) {
      storageState.delete(key);
    }
  }),
  clear: vi.fn(async () => {
    storageState.clear();
  }),
  getBytesInUse: vi.fn(async () => JSON.stringify(Object.fromEntries(storageState)).length),
  QUOTA_BYTES: 10485760,
  MAX_ITEMS: 512,
  QUOTA_BYTES_PER_ITEM: 8192,
};

global.chrome = {
  storage: {
    local: mockLocalStorage as any,
    sync: {
      QUOTA_BYTES: 102400,
      MAX_ITEMS: 512,
      QUOTA_BYTES_PER_ITEM: 8192,
    } as any,
    onChanged: {
      addListener: vi.fn(),
    } as any,
  },
} as any;

const encryptMock = vi.fn(async (value: string) => ({
  ciphertext: `encrypted:${value}`,
  iv: "iv",
  salt: "salt",
  algorithm: "AES-GCM" as const,
  version: 1,
}));
const decryptMock = vi.fn(async (value: { ciphertext: string }) =>
  value.ciphertext.replace("encrypted:", ""),
);

vi.mock("../src/background/monitoring.js", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("../src/background/crypto-manager.js", () => ({
  getCryptoManager: () => ({
    initialize: vi.fn(async () => undefined),
    importMasterKey: vi.fn(async () => undefined),
    exportMasterKey: vi.fn(async () => "master-key"),
    encrypt: encryptMock,
    decrypt: decryptMock,
  }),
}));

vi.mock("nanoid", () => ({
  nanoid: () => "test-id",
}));

import {
  PROVIDER_CONFIGS_KEY,
  PROVIDER_KEYS_KEY,
  ProviderConfigManager,
} from "../src/background/provider-config-manager.js";

describe("ProviderConfigManager", () => {
  beforeEach(async () => {
    storageState.clear();
    vi.clearAllMocks();
    (ProviderConfigManager as any).instance = null;
  });

  it("should store a custom provider with baseUrl", async () => {
    const manager = ProviderConfigManager.getInstance();
    await manager.initialize();

    const provider = await manager.addProvider({
      type: "custom",
      name: "Local Gateway",
      baseUrl: "https://example.com/v1",
      endpointMode: "openai-compatible",
      apiKey: "secret",
      defaultHeaders: { "X-Test": "1" },
    });

    expect(provider.baseUrl).toBe("https://example.com/v1");
    expect(provider.endpointMode).toBe("openai-compatible");
    expect(provider.apiKeyId).toBe("key_provider_test-id");

    const storedConfigs = storageState.get(PROVIDER_CONFIGS_KEY) as any[];
    expect(storedConfigs[0].baseUrl).toBe("https://example.com/v1");
    expect(storedConfigs[0].defaultHeaders).toEqual({ "X-Test": "1" });

    const storedKeys = storageState.get(PROVIDER_KEYS_KEY) as Record<string, unknown>;
    expect(storedKeys["key_provider_test-id"]).toBeDefined();
  });

  it("should allow an Ollama-style provider to persist apiKeyRequired: false", async () => {
    const manager = ProviderConfigManager.getInstance();
    await manager.initialize();

    const provider = await manager.addProvider({
      type: "ollama",
      name: "Local Ollama",
      apiKeyRequired: false,
    });

    expect(provider.apiKeyRequired).toBe(false);
    expect(provider.baseUrl).toBe("http://localhost:11434/v1");
    expect(provider.apiKeyId).toBeUndefined();
  });

  it("should update a provider and keep richer transport fields intact", async () => {
    const manager = ProviderConfigManager.getInstance();
    await manager.initialize();

    const provider = await manager.addProvider({
      type: "openrouter",
      name: "OpenRouter",
      baseUrl: "https://openrouter.ai/api/v1",
      defaultQueryParams: { provider: "anthropic" },
      providerOptions: {
        type: "openrouter",
        attributionHeaders: {
          httpReferer: "https://example.com",
          xTitle: "AI Pocket",
        },
      },
      apiKey: "first-key",
    });

    const updated = await manager.updateProvider(provider.id, {
      name: "OpenRouter Production",
      enabled: false,
      defaultHeaders: { "X-Trace": "trace-id" },
      baseUrl: "https://openrouter.ai/api/v1",
      endpointMode: "openai-compatible",
    });

    expect(updated.name).toBe("OpenRouter Production");
    expect(updated.enabled).toBe(false);
    expect(updated.baseUrl).toBe("https://openrouter.ai/api/v1");
    expect(updated.defaultQueryParams).toEqual({ provider: "anthropic" });
    expect(updated.providerOptions).toEqual({
      type: "openrouter",
      attributionHeaders: {
        httpReferer: "https://example.com",
        xTitle: "AI Pocket",
      },
    });
  });
});
