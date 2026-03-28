import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProviderRouter } from '../src/background/routing/provider-router.js';
import { SettingsManager } from '../src/background/routing/settings-manager.js';
import { ProviderFactory } from '../src/background/adapters/provider-factory.js';
import { classifyPromptWithNano } from '../src/background/routing/nano-classifier.js';
import { getProviderConfigManager } from '../src/background/provider-config-manager.js';

vi.mock('../src/background/routing/settings-manager.js', () => ({
  SettingsManager: vi.fn().mockImplementation(() => ({
    getRoutingPreferences: vi.fn(),
    getModelSheet: vi.fn(),
  }))
}));

vi.mock('../src/background/routing/nano-classifier.js', () => ({
  classifyPromptWithNano: vi.fn()
}));

vi.mock('../src/background/adapters/provider-factory.js', () => ({
  ProviderFactory: {
    createAdapter: vi.fn()
  }
}));

vi.mock('../src/background/provider-config-manager.js', () => ({
  getProviderConfigManager: vi.fn()
}));

const makeModelEntry = (overrides: Partial<{
  modelId: string;
  providerId: string;
  providerType: string;
  enabled: boolean;
  contextWindow: number;
  maxOutputTokens: number;
  supportsVision: boolean;
  cost: string;
  speed: string;
  quality: string;
}>) => ({
  modelId: overrides.modelId ?? 'model-1',
  providerId: overrides.providerId ?? 'provider-1',
  providerType: overrides.providerType ?? 'openai',
  enabled: overrides.enabled ?? true,
  capabilities: {
    supportsVision: overrides.supportsVision ?? false,
    contextWindow: overrides.contextWindow ?? 4096,
    maxOutputTokens: overrides.maxOutputTokens ?? 2048,
    supportsImageAnalysis: false,
    supportsVideoAnalysis: false,
    supportsAudioAnalysis: false,
  },
  tier: {
    cost: overrides.cost ?? 'low',
    speed: overrides.speed ?? 'fast',
    quality: overrides.quality ?? 'basic',
  },
});

describe('ProviderRouter', () => {
  let router: ProviderRouter;
  let mockSettingsManager: any;
  let mockConfigManager: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockSettingsManager = {
      getRoutingPreferences: vi.fn(),
      getModelSheet: vi.fn(),
    };

    vi.mocked(SettingsManager).mockImplementation(() => mockSettingsManager as any);

    router = new ProviderRouter();

    mockConfigManager = {
      isInitialized: vi.fn().mockReturnValue(true),
      initialize: vi.fn().mockResolvedValue(undefined),
      getProvider: vi.fn(),
      listProviders: vi.fn().mockResolvedValue([]),
    };
    vi.mocked(getProviderConfigManager).mockReturnValue(mockConfigManager);
  });

  it('should return the primary provider adapter when successful', async () => {
    mockSettingsManager.getRoutingPreferences.mockResolvedValue({
      chat: 'provider-1',
      fallbackChain: ['provider-2'],
      routingMode: 'manual',
      triggerWords: {}
    });

    mockSettingsManager.getModelSheet.mockResolvedValue({
      'model-1': makeModelEntry({ modelId: 'model-1', providerId: 'provider-1' }),
      'model-2': makeModelEntry({ modelId: 'model-2', providerId: 'provider-2' }),
    });

    mockConfigManager.getProvider.mockImplementation((id: string) =>
      Promise.resolve({ id, type: 'openai', enabled: true })
    );

    const mockAdapter = { validateConnection: vi.fn().mockResolvedValue({ success: true }) };
    vi.mocked(ProviderFactory.createAdapter).mockResolvedValue(mockAdapter as any);

    const result = await router.routeCapability('chat', 'test prompt');

    expect(result).toBe(mockAdapter);
    expect(ProviderFactory.createAdapter).toHaveBeenCalledWith(expect.objectContaining({ id: 'provider-1' }));
  });

  it('should iterate through the fallback chain if the primary provider fails', async () => {
    mockSettingsManager.getRoutingPreferences.mockResolvedValue({
      chat: 'provider-1',
      fallbackChain: ['provider-2'],
      routingMode: 'manual',
      triggerWords: {}
    });

    mockSettingsManager.getModelSheet.mockResolvedValue({
      'model-1': makeModelEntry({ modelId: 'model-1', providerId: 'provider-1' }),
      'model-2': makeModelEntry({ modelId: 'model-2', providerId: 'provider-2' }),
    });

    mockConfigManager.getProvider.mockImplementation((id: string) =>
      Promise.resolve({ id, type: 'openai', enabled: true })
    );

    const mockAdapterFail = { validateConnection: vi.fn().mockResolvedValue({ success: false, error: 'Connection error' }) };
    const mockAdapterSuccess = { validateConnection: vi.fn().mockResolvedValue({ success: true }) };

    vi.mocked(ProviderFactory.createAdapter)
      .mockResolvedValueOnce(mockAdapterFail as any)
      .mockResolvedValueOnce(mockAdapterSuccess as any);

    const result = await router.routeCapability('chat', 'test prompt');

    expect(result).toBe(mockAdapterSuccess);
    expect(ProviderFactory.createAdapter).toHaveBeenCalledTimes(2);
    expect(ProviderFactory.createAdapter).toHaveBeenNthCalledWith(1, expect.objectContaining({ id: 'provider-1' }));
    expect(ProviderFactory.createAdapter).toHaveBeenNthCalledWith(2, expect.objectContaining({ id: 'provider-2' }));
  });

  it('should integrate nano classifier and model sheet heuristics in auto mode', async () => {
    mockSettingsManager.getRoutingPreferences.mockResolvedValue({
      chat: 'provider-1',
      fallbackChain: [],
      routingMode: 'auto',
      triggerWords: {}
    });

    vi.mocked(classifyPromptWithNano).mockResolvedValue({
      complexity: 9,
      intent: 'code',
      budget_signal: 'high'
    });

    mockSettingsManager.getModelSheet.mockResolvedValue({
      'model-basic': makeModelEntry({
        modelId: 'model-basic', providerId: 'provider-1',
        cost: 'low', speed: 'fast', quality: 'basic',
      }),
      'model-expert': makeModelEntry({
        modelId: 'model-expert', providerId: 'expert-provider',
        contextWindow: 128000, maxOutputTokens: 16384, supportsVision: true,
        cost: 'high', speed: 'slow', quality: 'expert',
      }),
    });

    mockConfigManager.getProvider.mockImplementation((id: string) =>
      Promise.resolve({ id, type: 'openai', enabled: true })
    );

    const mockAdapter = { validateConnection: vi.fn().mockResolvedValue({ success: true }) };
    vi.mocked(ProviderFactory.createAdapter).mockResolvedValue(mockAdapter as any);

    await router.routeCapability('chat', 'write me a complex react app');

    expect(classifyPromptWithNano).toHaveBeenCalled();
    expect(mockSettingsManager.getModelSheet).toHaveBeenCalled();
    expect(ProviderFactory.createAdapter).toHaveBeenCalledWith(expect.objectContaining({ id: 'expert-provider' }));
  });

  it('should throw an error with diagnostics if all providers fail', async () => {
    mockSettingsManager.getRoutingPreferences.mockResolvedValue({
      chat: 'provider-1',
      fallbackChain: ['provider-2'],
      routingMode: 'manual',
      triggerWords: {}
    });

    mockSettingsManager.getModelSheet.mockResolvedValue({
      'model-1': makeModelEntry({ modelId: 'model-1', providerId: 'provider-1' }),
      'model-2': makeModelEntry({ modelId: 'model-2', providerId: 'provider-2' }),
    });

    mockConfigManager.getProvider.mockImplementation((id: string) =>
      Promise.resolve({ id, type: 'openai', enabled: true })
    );

    const mockAdapterFail = { validateConnection: vi.fn().mockResolvedValue({ success: false, error: 'Failed' }) };
    vi.mocked(ProviderFactory.createAdapter).mockResolvedValue(mockAdapterFail as any);

    await expect(router.routeCapability('chat', 'test prompt')).rejects.toThrow(/No enabled providers available for 'chat' capability/);
  });
});

describe('ProviderRouter - Enabled Filtering', () => {
  let router: ProviderRouter;
  let mockSettingsManager: any;
  let mockConfigManager: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockSettingsManager = {
      getRoutingPreferences: vi.fn(),
      getModelSheet: vi.fn(),
    };
    vi.mocked(SettingsManager).mockImplementation(() => mockSettingsManager as any);
    router = new ProviderRouter();

    mockConfigManager = {
      isInitialized: vi.fn().mockReturnValue(true),
      initialize: vi.fn().mockResolvedValue(undefined),
      getProvider: vi.fn(),
      listProviders: vi.fn().mockResolvedValue([]),
    };
    vi.mocked(getProviderConfigManager).mockReturnValue(mockConfigManager);
  });

  it('should skip disabled primary provider and route to fallback', async () => {
    mockSettingsManager.getRoutingPreferences.mockResolvedValue({
      chat: 'disabled-provider',
      fallbackChain: ['enabled-provider'],
      routingMode: 'manual',
      triggerWords: {}
    });

    mockSettingsManager.getModelSheet.mockResolvedValue({
      'model-1': makeModelEntry({ modelId: 'model-1', providerId: 'enabled-provider' }),
    });

    mockConfigManager.getProvider.mockImplementation((id: string) =>
      Promise.resolve({ id, type: 'openai', enabled: id === 'enabled-provider' })
    );

    const mockAdapter = { validateConnection: vi.fn().mockResolvedValue({ success: true }) };
    vi.mocked(ProviderFactory.createAdapter).mockResolvedValue(mockAdapter as any);

    const result = await router.routeCapability('chat', 'test');
    expect(result).toBe(mockAdapter);
    expect(ProviderFactory.createAdapter).toHaveBeenCalledWith(expect.objectContaining({ id: 'enabled-provider' }));
  });

  it('should throw actionable error when all providers disabled', async () => {
    mockSettingsManager.getRoutingPreferences.mockResolvedValue({
      chat: 'disabled-provider',
      fallbackChain: [],
      routingMode: 'manual',
      triggerWords: {}
    });

    mockSettingsManager.getModelSheet.mockResolvedValue({
      'model-1': makeModelEntry({ modelId: 'model-1', providerId: 'disabled-provider' }),
    });

    mockConfigManager.getProvider.mockResolvedValue({ id: 'disabled-provider', enabled: false });

    await expect(router.routeCapability('chat', 'test')).rejects.toThrow(
      /No enabled providers available for 'chat' capability/
    );
  });

  it('should skip provider with no enabled models', async () => {
    mockSettingsManager.getRoutingPreferences.mockResolvedValue({
      chat: 'provider-no-models',
      fallbackChain: ['provider-with-models'],
      routingMode: 'manual',
      triggerWords: {}
    });

    mockSettingsManager.getModelSheet.mockResolvedValue({
      'model-disabled': makeModelEntry({ modelId: 'model-disabled', providerId: 'provider-no-models', enabled: false }),
      'model-enabled': makeModelEntry({ modelId: 'model-enabled', providerId: 'provider-with-models', enabled: true }),
    });

    mockConfigManager.getProvider.mockImplementation((id: string) =>
      Promise.resolve({ id, type: 'openai', enabled: true })
    );

    const mockAdapter = { validateConnection: vi.fn().mockResolvedValue({ success: true }) };
    vi.mocked(ProviderFactory.createAdapter).mockResolvedValue(mockAdapter as any);

    const result = await router.routeCapability('chat', 'test');
    expect(result).toBe(mockAdapter);
    expect(ProviderFactory.createAdapter).toHaveBeenCalledWith(expect.objectContaining({ id: 'provider-with-models' }));
  });
});

describe('ProviderRouter - Capability Routing', () => {
  let router: ProviderRouter;
  let mockSettingsManager: any;
  let mockConfigManager: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockSettingsManager = {
      getRoutingPreferences: vi.fn(),
      getModelSheet: vi.fn(),
    };
    vi.mocked(SettingsManager).mockImplementation(() => mockSettingsManager as any);
    router = new ProviderRouter();

    mockConfigManager = {
      isInitialized: vi.fn().mockReturnValue(true),
      initialize: vi.fn().mockResolvedValue(undefined),
      getProvider: vi.fn(),
      listProviders: vi.fn().mockResolvedValue([]),
    };
    vi.mocked(getProviderConfigManager).mockReturnValue(mockConfigManager);
  });

  it('should route embeddings to configured embeddings provider', async () => {
    mockSettingsManager.getRoutingPreferences.mockResolvedValue({
      embeddings: 'embed-provider',
      chat: null,
      speech: null,
      fallbackChain: [],
      routingMode: 'manual',
      triggerWords: {}
    });

    mockSettingsManager.getModelSheet.mockResolvedValue({
      'embed-model': makeModelEntry({ modelId: 'embed-model', providerId: 'embed-provider' }),
    });

    mockConfigManager.getProvider.mockResolvedValue({ id: 'embed-provider', type: 'openai', enabled: true });

    const mockAdapter = { validateConnection: vi.fn().mockResolvedValue({ success: true }) };
    vi.mocked(ProviderFactory.createAdapter).mockResolvedValue(mockAdapter as any);

    const result = await router.routeCapability('embeddings', 'embed this text');
    expect(result).toBe(mockAdapter);
    expect(ProviderFactory.createAdapter).toHaveBeenCalledWith(expect.objectContaining({ id: 'embed-provider' }));
  });

  it('should route speech to configured speech provider', async () => {
    mockSettingsManager.getRoutingPreferences.mockResolvedValue({
      speech: 'speech-provider',
      chat: null,
      embeddings: null,
      fallbackChain: [],
      routingMode: 'manual',
      triggerWords: {}
    });

    mockSettingsManager.getModelSheet.mockResolvedValue({
      'speech-model': makeModelEntry({ modelId: 'speech-model', providerId: 'speech-provider' }),
    });

    mockConfigManager.getProvider.mockResolvedValue({ id: 'speech-provider', type: 'openai', enabled: true });

    const mockAdapter = { validateConnection: vi.fn().mockResolvedValue({ success: true }) };
    vi.mocked(ProviderFactory.createAdapter).mockResolvedValue(mockAdapter as any);

    const result = await router.routeCapability('speech', 'transcribe audio');
    expect(result).toBe(mockAdapter);
    expect(ProviderFactory.createAdapter).toHaveBeenCalledWith(expect.objectContaining({ id: 'speech-provider' }));
  });
});

describe('ProviderRouter - Auto Mode Enabled Filtering', () => {
  let router: ProviderRouter;
  let mockSettingsManager: any;
  let mockConfigManager: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockSettingsManager = {
      getRoutingPreferences: vi.fn(),
      getModelSheet: vi.fn(),
    };
    vi.mocked(SettingsManager).mockImplementation(() => mockSettingsManager as any);
    router = new ProviderRouter();

    mockConfigManager = {
      isInitialized: vi.fn().mockReturnValue(true),
      initialize: vi.fn().mockResolvedValue(undefined),
      getProvider: vi.fn(),
      listProviders: vi.fn().mockResolvedValue([]),
    };
    vi.mocked(getProviderConfigManager).mockReturnValue(mockConfigManager);
  });

  it('should skip disabled models in heuristic scoring', async () => {
    mockSettingsManager.getRoutingPreferences.mockResolvedValue({
      chat: 'provider-1',
      fallbackChain: [],
      routingMode: 'auto',
      triggerWords: {}
    });

    vi.mocked(classifyPromptWithNano).mockResolvedValue({
      complexity: 9,
      intent: 'code',
      budget_signal: 'high'
    });

    // Expert model is DISABLED — should be skipped
    mockSettingsManager.getModelSheet.mockResolvedValue({
      'model-expert': makeModelEntry({
        modelId: 'model-expert', providerId: 'expert-provider',
        cost: 'high', quality: 'expert', enabled: false,
      }),
      'model-basic': makeModelEntry({
        modelId: 'model-basic', providerId: 'provider-1',
        cost: 'low', quality: 'basic',
      }),
    });

    mockConfigManager.getProvider.mockImplementation((id: string) =>
      Promise.resolve({ id, type: 'openai', enabled: true })
    );

    const mockAdapter = { validateConnection: vi.fn().mockResolvedValue({ success: true }) };
    vi.mocked(ProviderFactory.createAdapter).mockResolvedValue(mockAdapter as any);

    await router.routeCapability('chat', 'complex prompt');

    // Expert model was disabled, so basic model's provider should win
    expect(ProviderFactory.createAdapter).toHaveBeenCalledWith(expect.objectContaining({ id: 'provider-1' }));
  });

  it('should skip disabled providers in heuristic scoring', async () => {
    mockSettingsManager.getRoutingPreferences.mockResolvedValue({
      chat: 'provider-1',
      fallbackChain: [],
      routingMode: 'auto',
      triggerWords: {}
    });

    vi.mocked(classifyPromptWithNano).mockResolvedValue({
      complexity: 9,
      intent: 'code',
      budget_signal: 'high'
    });

    mockSettingsManager.getModelSheet.mockResolvedValue({
      'model-expert': makeModelEntry({
        modelId: 'model-expert', providerId: 'disabled-provider',
        cost: 'high', quality: 'expert',
      }),
      'model-basic': makeModelEntry({
        modelId: 'model-basic', providerId: 'enabled-provider',
        cost: 'low', quality: 'basic',
      }),
    });

    mockConfigManager.getProvider.mockImplementation((id: string) =>
      Promise.resolve({ id, type: 'openai', enabled: id === 'enabled-provider' })
    );

    const mockAdapter = { validateConnection: vi.fn().mockResolvedValue({ success: true }) };
    vi.mocked(ProviderFactory.createAdapter).mockResolvedValue(mockAdapter as any);

    await router.routeCapability('chat', 'complex prompt');

    // Disabled provider skipped, enabled provider's model wins
    expect(ProviderFactory.createAdapter).toHaveBeenCalledWith(expect.objectContaining({ id: 'enabled-provider' }));
  });
});

describe('ProviderRouter - Trigger Words', () => {
  let router: ProviderRouter;
  let mockSettingsManager: any;
  let mockConfigManager: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockSettingsManager = {
      getRoutingPreferences: vi.fn(),
      getModelSheet: vi.fn(),
    };
    vi.mocked(SettingsManager).mockImplementation(() => mockSettingsManager as any);
    router = new ProviderRouter();

    mockConfigManager = {
      isInitialized: vi.fn().mockReturnValue(true),
      initialize: vi.fn().mockResolvedValue(undefined),
      getProvider: vi.fn(),
      listProviders: vi.fn().mockResolvedValue([]),
    };
    vi.mocked(getProviderConfigManager).mockReturnValue(mockConfigManager);
  });

  it('should route to trigger word matched provider', async () => {
    mockSettingsManager.getRoutingPreferences.mockResolvedValue({
      chat: 'default-provider',
      fallbackChain: [],
      routingMode: 'auto',
      triggerWords: { code: 'code-provider' }
    });

    mockSettingsManager.getModelSheet.mockResolvedValue({
      'model-1': makeModelEntry({ modelId: 'model-1', providerId: 'code-provider' }),
    });

    mockConfigManager.getProvider.mockImplementation((id: string) =>
      Promise.resolve({ id, type: 'openai', enabled: true })
    );

    const mockAdapter = { validateConnection: vi.fn().mockResolvedValue({ success: true }) };
    vi.mocked(ProviderFactory.createAdapter).mockResolvedValue(mockAdapter as any);

    await router.routeCapability('chat', 'write me some code');

    expect(ProviderFactory.createAdapter).toHaveBeenCalledWith(expect.objectContaining({ id: 'code-provider' }));
  });

  it('should fall through to heuristic scoring when no trigger word matches', async () => {
    mockSettingsManager.getRoutingPreferences.mockResolvedValue({
      chat: 'default-provider',
      fallbackChain: [],
      routingMode: 'auto',
      triggerWords: { code: 'code-provider' }
    });

    vi.mocked(classifyPromptWithNano).mockResolvedValue({
      complexity: 3,
      intent: 'general',
      budget_signal: 'low'
    });

    mockSettingsManager.getModelSheet.mockResolvedValue({
      'model-1': makeModelEntry({
        modelId: 'model-1', providerId: 'default-provider',
        cost: 'low', quality: 'basic',
      }),
    });

    mockConfigManager.getProvider.mockImplementation((id: string) =>
      Promise.resolve({ id, type: 'openai', enabled: true })
    );

    const mockAdapter = { validateConnection: vi.fn().mockResolvedValue({ success: true }) };
    vi.mocked(ProviderFactory.createAdapter).mockResolvedValue(mockAdapter as any);

    await router.routeCapability('chat', 'tell me a joke');

    expect(classifyPromptWithNano).toHaveBeenCalled();
  });
});

describe('ProviderRouter - Fallback Chain', () => {
  let router: ProviderRouter;
  let mockSettingsManager: any;
  let mockConfigManager: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockSettingsManager = {
      getRoutingPreferences: vi.fn(),
      getModelSheet: vi.fn(),
    };
    vi.mocked(SettingsManager).mockImplementation(() => mockSettingsManager as any);
    router = new ProviderRouter();

    mockConfigManager = {
      isInitialized: vi.fn().mockReturnValue(true),
      initialize: vi.fn().mockResolvedValue(undefined),
      getProvider: vi.fn(),
      listProviders: vi.fn().mockResolvedValue([]),
    };
    vi.mocked(getProviderConfigManager).mockReturnValue(mockConfigManager);
  });

  it('should skip disabled providers in fallback chain', async () => {
    mockSettingsManager.getRoutingPreferences.mockResolvedValue({
      chat: 'disabled-1',
      fallbackChain: ['disabled-2', 'enabled-3'],
      routingMode: 'manual',
      triggerWords: {}
    });

    mockSettingsManager.getModelSheet.mockResolvedValue({
      'model-3': makeModelEntry({ modelId: 'model-3', providerId: 'enabled-3' }),
    });

    mockConfigManager.getProvider.mockImplementation((id: string) =>
      Promise.resolve({ id, type: 'openai', enabled: id === 'enabled-3' })
    );

    const mockAdapter = { validateConnection: vi.fn().mockResolvedValue({ success: true }) };
    vi.mocked(ProviderFactory.createAdapter).mockResolvedValue(mockAdapter as any);

    const result = await router.routeCapability('chat', 'test');
    expect(result).toBe(mockAdapter);
    expect(ProviderFactory.createAdapter).toHaveBeenCalledWith(expect.objectContaining({ id: 'enabled-3' }));
  });
});
