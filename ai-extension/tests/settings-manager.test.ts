import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SettingsManager } from '../src/background/routing/settings-manager';
import { EmbeddingProviderSwitchError, RoutingPreferences, ModelSheetEntry } from '../src/background/routing/types';

// Mock provider-config-manager
const mockListProviders = vi.fn();
const mockIsInitialized = vi.fn().mockReturnValue(true);
const mockInitialize = vi.fn();

vi.mock('../src/background/provider-config-manager', () => ({
  getProviderConfigManager: () => ({
    listProviders: mockListProviders,
    isInitialized: mockIsInitialized,
    initialize: mockInitialize,
  }),
  ProviderConfigManager: vi.fn(),
}));

// Mock model-catalog
const mockSeedModelCatalog = vi.fn();

vi.mock('../src/background/routing/model-catalog', () => ({
  seedModelCatalog: (...args: any[]) => mockSeedModelCatalog(...args),
}));

describe('SettingsManager', () => {
  let settingsManager: SettingsManager;
  let mockStorage: Record<string, any>;

  beforeEach(() => {
    mockStorage = {};
    settingsManager = new SettingsManager();
    vi.clearAllMocks();
    mockIsInitialized.mockReturnValue(true);

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
        providerId: 'provider-1',
        providerType: 'openai',
        enabled: true,
        capabilities: { supportsVision: false, contextWindow: 4096, maxOutputTokens: 2048, supportsImageAnalysis: false, supportsVideoAnalysis: false, supportsAudioAnalysis: false, supportsTranscription: false, supportsTranslation: false, supportsAudioInput: false, supportsWordTimestamps: false },
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

describe('SettingsManager - Routing Mode', () => {
  let settingsManager: SettingsManager;
  let mockStorage: Record<string, any>;

  beforeEach(() => {
    mockStorage = {};
    settingsManager = new SettingsManager();
    vi.clearAllMocks();
    mockIsInitialized.mockReturnValue(true);

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

  it('should return "auto" by default', async () => {
    const mode = await settingsManager.getRoutingMode();
    expect(mode).toBe('auto');
  });

  it('should set routing mode to "manual"', async () => {
    await settingsManager.setRoutingMode('manual');
    const mode = await settingsManager.getRoutingMode();
    expect(mode).toBe('manual');
  });

  it('should throw on invalid routing mode', async () => {
    await expect(settingsManager.setRoutingMode('invalid')).rejects.toThrow(
      "routingMode must be 'auto' or 'manual'"
    );
  });
});

describe('SettingsManager - Fallback Chain', () => {
  let settingsManager: SettingsManager;
  let mockStorage: Record<string, any>;

  beforeEach(() => {
    mockStorage = {};
    settingsManager = new SettingsManager();
    vi.clearAllMocks();
    mockIsInitialized.mockReturnValue(true);

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

  it('should return empty array by default', async () => {
    const chain = await settingsManager.getFallbackChain();
    expect(chain).toEqual([]);
  });

  it('should set fallback chain with valid providers', async () => {
    mockListProviders.mockResolvedValue([
      { id: 'p1', enabled: true },
      { id: 'p2', enabled: true },
    ]);

    await settingsManager.setFallbackChain(['p1', 'p2']);
    const chain = await settingsManager.getFallbackChain();
    expect(chain).toEqual(['p1', 'p2']);
  });

  it('should throw on non-existent or disabled providers', async () => {
    mockListProviders.mockResolvedValue([
      { id: 'p1', enabled: true },
    ]);

    await expect(settingsManager.setFallbackChain(['nonexistent'])).rejects.toThrow(
      "non-existent or disabled providers"
    );
  });
});

describe('SettingsManager - Trigger Words', () => {
  let settingsManager: SettingsManager;
  let mockStorage: Record<string, any>;

  beforeEach(() => {
    mockStorage = {};
    settingsManager = new SettingsManager();
    vi.clearAllMocks();
    mockIsInitialized.mockReturnValue(true);

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

  it('should return empty object by default', async () => {
    const words = await settingsManager.getTriggerWords();
    expect(words).toEqual({});
  });

  it('should set trigger words', async () => {
    await settingsManager.setTriggerWords({ code: 'p1' });
    const words = await settingsManager.getTriggerWords();
    expect(words).toEqual({ code: 'p1' });
  });

  it('should add a trigger word', async () => {
    await settingsManager.addTriggerWord('analyze', 'p1');
    const words = await settingsManager.getTriggerWords();
    expect(words).toEqual({ analyze: 'p1' });
  });

  it('should remove a trigger word', async () => {
    await settingsManager.addTriggerWord('code', 'p1');
    await settingsManager.addTriggerWord('analyze', 'p2');
    await settingsManager.removeTriggerWord('code');
    const words = await settingsManager.getTriggerWords();
    expect(words).toEqual({ analyze: 'p2' });
  });

  it('should throw on empty trigger word', async () => {
    await expect(settingsManager.addTriggerWord('', 'p1')).rejects.toThrow(
      "Trigger word must be a non-empty string"
    );
  });
});

describe('SettingsManager - Model Management', () => {
  let settingsManager: SettingsManager;
  let mockStorage: Record<string, any>;

  const fullCapabilities = {
    supportsVision: false,
    contextWindow: 4096,
    maxOutputTokens: 2048,
    supportsImageAnalysis: false,
    supportsVideoAnalysis: false,
    supportsAudioAnalysis: false,
    supportsTranscription: false,
    supportsTranslation: false,
    supportsAudioInput: false,
    supportsWordTimestamps: false,
  };

  beforeEach(() => {
    mockStorage = {};
    settingsManager = new SettingsManager();
    vi.clearAllMocks();
    mockIsInitialized.mockReturnValue(true);

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

  it('should add a model to the model sheet', async () => {
    await settingsManager.addModel('p1', {
      modelId: 'gpt-4o',
      providerType: 'openai',
      capabilities: fullCapabilities,
      tier: { cost: 'medium', speed: 'fast', quality: 'advanced' },
    });

    const model = await settingsManager.getModel('gpt-4o');
    expect(model).toEqual({
      modelId: 'gpt-4o',
      providerId: 'p1',
      providerType: 'openai',
      enabled: true,
      capabilities: fullCapabilities,
      tier: { cost: 'medium', speed: 'fast', quality: 'advanced' },
    });
  });

  it('should remove a model from the model sheet', async () => {
    await settingsManager.addModel('p1', {
      modelId: 'gpt-4o',
      providerType: 'openai',
    });

    await settingsManager.removeModel('gpt-4o');
    const model = await settingsManager.getModel('gpt-4o');
    expect(model).toBeNull();
  });

  it('should get a model by modelId', async () => {
    await settingsManager.addModel('p1', {
      modelId: 'gpt-4o',
      providerType: 'openai',
    });

    const model = await settingsManager.getModel('gpt-4o');
    expect(model?.modelId).toBe('gpt-4o');
    expect(model?.providerId).toBe('p1');
  });

  it('should set model enabled state', async () => {
    await settingsManager.addModel('p1', {
      modelId: 'gpt-4o',
      providerType: 'openai',
    });

    await settingsManager.setModelEnabled('gpt-4o', false);
    const model = await settingsManager.getModel('gpt-4o');
    expect(model?.enabled).toBe(false);
  });

  it('should throw when adding model without modelId', async () => {
    await expect(
      settingsManager.addModel('p1', { modelId: '', providerType: 'openai' })
    ).rejects.toThrow("modelId is required");
  });

  it('should refresh model catalog by calling seedModelCatalog', async () => {
    const mockSheet: Record<string, ModelSheetEntry> = {
      'gpt-4o': {
        modelId: 'gpt-4o',
        providerId: 'p1',
        providerType: 'openai',
        enabled: true,
        capabilities: fullCapabilities,
        tier: { cost: 'medium', speed: 'fast', quality: 'advanced' },
      },
    };
    mockSeedModelCatalog.mockResolvedValue(mockSheet);

    const result = await settingsManager.refreshModelCatalog();
    expect(mockSeedModelCatalog).toHaveBeenCalled();
    expect(result).toEqual(mockSheet);
  });

  it('should return null for non-existent model', async () => {
    const model = await settingsManager.getModel('nonexistent');
    expect(model).toBeNull();
  });

  it('should throw when removing non-existent model', async () => {
    await expect(settingsManager.removeModel('nonexistent')).rejects.toThrow(
      "not found in model sheet"
    );
  });

  it('should throw when setting enabled on non-existent model', async () => {
    await expect(settingsManager.setModelEnabled('nonexistent', true)).rejects.toThrow(
      "not found in model sheet"
    );
  });

  it('should return empty model sheet when no data in storage', async () => {
    const sheet = await settingsManager.getModelSheet();
    expect(sheet).toEqual({});
  });
});

describe('SettingsManager - Speech Settings', () => {
  let settingsManager: SettingsManager;
  let mockStorage: Record<string, any>;

  beforeEach(() => {
    mockStorage = {};
    settingsManager = new SettingsManager();
    vi.clearAllMocks();
    mockIsInitialized.mockReturnValue(true);

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

  it('should return default speech settings when nothing saved', async () => {
    const settings = await settingsManager.getSpeechSettings();
    expect(settings.language).toBe('en');
    expect(settings.timestampGranularity).toBe('segment');
    expect(settings.provider).toEqual({ providerId: '', modelId: '' });
    expect(settings.advancedOptions).toEqual({});
  });

  it('should persist speech settings with provider and model', async () => {
    await settingsManager.setSpeechSettings({
      provider: { providerId: 'groq-stt', modelId: 'whisper-large-v3' },
      language: 'es',
      timestampGranularity: 'word',
      advancedOptions: { enableTranslation: true },
    });

    const settings = await settingsManager.getSpeechSettings();
    expect(settings.provider.providerId).toBe('groq-stt');
    expect(settings.provider.modelId).toBe('whisper-large-v3');
    expect(settings.language).toBe('es');
    expect(settings.timestampGranularity).toBe('word');
    expect(settings.advancedOptions?.enableTranslation).toBe(true);
  });

  it('should persist speech settings for OpenAI Whisper provider', async () => {
    await settingsManager.setSpeechSettings({
      provider: { providerId: 'openai-stt', modelId: 'whisper-1' },
      language: 'en',
      timestampGranularity: 'segment',
      advancedOptions: { temperature: 0.5 },
    });

    const settings = await settingsManager.getSpeechSettings();
    expect(settings.provider.providerId).toBe('openai-stt');
    expect(settings.provider.modelId).toBe('whisper-1');
    expect(settings.language).toBe('en');
    expect(settings.timestampGranularity).toBe('segment');
    expect(settings.advancedOptions?.temperature).toBe(0.5);
  });

  it('should persist speech settings for NVIDIA Parakeet provider', async () => {
    await settingsManager.setSpeechSettings({
      provider: { providerId: 'nvidia-stt', modelId: 'nvidia/parakeet-rnnt-1.1b-asr' },
      language: 'en',
      timestampGranularity: 'word',
      advancedOptions: { enableDiarization: true },
    });

    const settings = await settingsManager.getSpeechSettings();
    expect(settings.provider.providerId).toBe('nvidia-stt');
    expect(settings.provider.modelId).toBe('nvidia/parakeet-rnnt-1.1b-asr');
    expect(settings.advancedOptions?.enableDiarization).toBe(true);
  });

  it('should overwrite speech settings on subsequent set', async () => {
    await settingsManager.setSpeechSettings({
      provider: { providerId: 'openai-stt', modelId: 'whisper-1' },
      language: 'en',
      timestampGranularity: 'segment',
      advancedOptions: {},
    });

    await settingsManager.setSpeechSettings({
      provider: { providerId: 'groq-stt', modelId: 'whisper-large-v3' },
      language: 'fr',
      timestampGranularity: 'word',
      advancedOptions: { enableTranslation: true },
    });

    const settings = await settingsManager.getSpeechSettings();
    expect(settings.provider.providerId).toBe('groq-stt');
    expect(settings.provider.modelId).toBe('whisper-large-v3');
    expect(settings.language).toBe('fr');
  });

  it('should reject invalid speech settings (missing provider)', async () => {
    await expect(
      settingsManager.setSpeechSettings({
        language: 'en',
        timestampGranularity: 'segment',
        advancedOptions: {},
      })
    ).rejects.toThrow();
  });

  it('should reject invalid speech settings (bad timestampGranularity)', async () => {
    await expect(
      settingsManager.setSpeechSettings({
        provider: { providerId: 'p1', modelId: 'm1' },
        language: 'en',
        timestampGranularity: 'invalid',
        advancedOptions: {},
      })
    ).rejects.toThrow();
  });

  it('should reject invalid speech settings (temperature out of range)', async () => {
    await expect(
      settingsManager.setSpeechSettings({
        provider: { providerId: 'p1', modelId: 'm1' },
        language: 'en',
        timestampGranularity: 'word',
        advancedOptions: { temperature: 2.5 },
      })
    ).rejects.toThrow();
  });

  it('should accept speech settings without advancedOptions', async () => {
    await settingsManager.setSpeechSettings({
      provider: { providerId: 'p1', modelId: 'whisper-1' },
      language: 'de',
      timestampGranularity: 'none',
    });

    const settings = await settingsManager.getSpeechSettings();
    expect(settings.provider.providerId).toBe('p1');
    expect(settings.language).toBe('de');
    expect(settings.timestampGranularity).toBe('none');
  });
});
