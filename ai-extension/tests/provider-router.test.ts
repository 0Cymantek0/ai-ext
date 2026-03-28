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

describe('ProviderRouter', () => {
  let router: ProviderRouter;
  let mockSettingsManager: any;
  let mockProviderConfigManager: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockSettingsManager = {
      getRoutingPreferences: vi.fn(),
      getModelSheet: vi.fn()
    };
    
    vi.mocked(SettingsManager).mockImplementation(() => mockSettingsManager as any);
    
    router = new ProviderRouter();

    mockProviderConfigManager = {
      isInitialized: vi.fn().mockReturnValue(true),
      initialize: vi.fn().mockResolvedValue(undefined),
      getProvider: vi.fn()
    };
    vi.mocked(getProviderConfigManager).mockReturnValue(mockProviderConfigManager);
  });

  it('should return the primary provider adapter when successful', async () => {
    mockSettingsManager.getRoutingPreferences.mockResolvedValue({
      chat: 'provider-1',
      fallbackChain: ['provider-2'],
      routingMode: 'manual',
      triggerWords: {}
    });

    mockProviderConfigManager.getProvider.mockResolvedValue({ id: 'provider-1', type: 'openai' });
    
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

    mockProviderConfigManager.getProvider.mockImplementation((id: string) => 
      Promise.resolve({ id, type: 'openai' })
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
      'provider-1': { tier: { cost: 'low', quality: 'basic' } },
      'expert-provider': { tier: { cost: 'high', quality: 'expert' } }
    });

    mockProviderConfigManager.getProvider.mockImplementation((id: string) => 
      Promise.resolve({ id, type: 'openai' })
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

    mockProviderConfigManager.getProvider.mockImplementation((id: string) => 
      Promise.resolve({ id, type: 'openai' })
    );

    const mockAdapterFail = { validateConnection: vi.fn().mockResolvedValue({ success: false, error: 'Failed' }) };
    vi.mocked(ProviderFactory.createAdapter).mockResolvedValue(mockAdapterFail as any);

    await expect(router.routeCapability('chat', 'test prompt')).rejects.toThrow(/All providers in fallback chain failed/);
  });
});