import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SettingsManager } from '../src/background/routing/settings-manager';
import { EmbeddingProviderSwitchError, RoutingPreferences, ModelSheetEntry } from '../src/background/routing/types';

describe('SettingsManager', () => {
  let settingsManager: SettingsManager;
  let mockStorage: Record<string, any>;

  beforeEach(() => {
    mockStorage = {};
    settingsManager = new SettingsManager();

    global.chrome = {
      storage: {
        local: {
          get: vi.fn((key: string) => Promise.resolve({ [key]: mockStorage[key] })),
          set: vi.fn((data: Record<string, any>) => {
            Object.assign(mockStorage, data);
            return Promise.resolve();
          }),
        }
      }
    } as any;
  });

  it('should save capability providers independently', async () => {
    await settingsManager.setCapabilityProvider('chat', 'openai');
    const prefs = await settingsManager.getRoutingPreferences();
    
    expect(prefs.chat).toBe('openai');
    expect(prefs.embeddings).toBeNull();
    expect(prefs.speech).toBeNull();

    await settingsManager.setCapabilityProvider('embeddings', 'cohere');
    const prefs2 = await settingsManager.getRoutingPreferences();
    
    expect(prefs2.chat).toBe('openai');
    expect(prefs2.embeddings).toBe('cohere');
    expect(prefs2.speech).toBeNull();
  });

  it('should handle getting and setting the model sheet', async () => {
    const defaultSheet = await settingsManager.getModelSheet();
    expect(defaultSheet).toEqual({});

    const newSheet: Record<string, ModelSheetEntry> = {
      'model-1': {
        modelId: 'model-1',
        providerType: 'openai',
        capabilities: { supportsVision: false, contextWindow: 4096 },
        tier: { cost: 'low', speed: 'fast', quality: 'basic' }
      }
    };

    await settingsManager.updateModelSheet(newSheet);
    const updatedSheet = await settingsManager.getModelSheet();
    expect(updatedSheet).toEqual(newSheet);
  });

  it('should correctly store provider parameters', async () => {
    const defaultParams = await settingsManager.getProviderParameters('openai');
    expect(defaultParams).toEqual({});

    await settingsManager.setProviderParameters('openai', { temperature: 0.7 });
    const updatedParams = await settingsManager.getProviderParameters('openai');
    expect(updatedParams).toEqual({ temperature: 0.7 });

    const prefs = await settingsManager.getRoutingPreferences();
    expect(prefs.providerParameters.openai).toEqual({ temperature: 0.7 });
  });

  it('should throw EmbeddingProviderSwitchError when switching embedding providers', async () => {
    await settingsManager.setCapabilityProvider('embeddings', 'provider-A');
    
    await expect(
      settingsManager.setCapabilityProvider('embeddings', 'provider-B')
    ).rejects.toThrow(EmbeddingProviderSwitchError);
    
    const prefs = await settingsManager.getRoutingPreferences();
    expect(prefs.embeddings).toBe('provider-A');
  });

  it('should allow switching embedding providers if bypassWarning is true', async () => {
    await settingsManager.setCapabilityProvider('embeddings', 'provider-A');
    
    await settingsManager.setCapabilityProvider('embeddings', 'provider-B', true);
    
    const prefs = await settingsManager.getRoutingPreferences();
    expect(prefs.embeddings).toBe('provider-B');
  });
});
