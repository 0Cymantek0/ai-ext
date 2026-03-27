import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GeminiNanoAdapter } from '../../src/background/adapters/gemini-nano-adapter.js';
import type { ProviderConfig } from '../../src/background/provider-types.js';
import * as aiModule from 'ai';
import * as chromeAiModule from 'chrome-ai';

vi.mock('chrome-ai', () => ({
  chromeai: vi.fn((modelId) => ({ provider: 'gemini-nano', modelId })),
}));

vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>();
  return {
    ...actual,
    generateText: vi.fn(),
  };
});

describe('GeminiNanoAdapter', () => {
  let config: ProviderConfig;
  let mockCapabilities: any;

  beforeEach(() => {
    vi.clearAllMocks();
    config = {
      id: 'nano-1',
      type: 'gemini-nano',
      name: 'Gemini Nano',
      enabled: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    
    mockCapabilities = { available: 'readily' };

    (global as any).self = {
      ai: {
        languageModel: {
          capabilities: vi.fn().mockImplementation(() => Promise.resolve(mockCapabilities)),
        }
      }
    };
  });

  it('should initialize with config', () => {
    const adapter = new GeminiNanoAdapter(config);
    expect(adapter.providerType).toBe('gemini-nano');
    expect(adapter.config).toBe(config);
  });

  it('should return a language model from chromeai', () => {
    const adapter = new GeminiNanoAdapter(config);
    const model = adapter.getLanguageModel() as any;
    
    expect(chromeAiModule.chromeai).toHaveBeenCalledWith('text');
    expect(model.provider).toBe('gemini-nano');
    expect(model.modelId).toBe('text');
  });

  it('should pass availability check if available', async () => {
    const adapter = new GeminiNanoAdapter(config);
    const result = await adapter.checkAvailability();
    
    expect(result.available).toBe(true);
  });

  it('should fail availability check if not available', async () => {
    mockCapabilities.available = 'no';
    const adapter = new GeminiNanoAdapter(config);
    const result = await adapter.checkAvailability();
    
    expect(result.available).toBe(false);
    expect(result.error).toContain('not available');
  });

  it('should fail availability check if prompt API missing', async () => {
    (global as any).self = {};
    const adapter = new GeminiNanoAdapter(config);
    adapter['setupOffscreenProxy'] = vi.fn().mockResolvedValue(undefined); // Mock offscreen fallback
    
    const result = await adapter.checkAvailability();
    
    expect(result.available).toBe(false);
    expect(result.error).toContain('Prompt API is not available');
  });

  it('should validate connection successfully when available', async () => {
    vi.mocked(aiModule.generateText).mockResolvedValueOnce({ text: 'test' } as any);
    
    const adapter = new GeminiNanoAdapter(config);
    const result = await adapter.validateConnection();
    
    expect(result.success).toBe(true);
    expect(aiModule.generateText).toHaveBeenCalled();
  });
  
  it('should fail connection validation if not available', async () => {
    mockCapabilities.available = 'no';
    
    const adapter = new GeminiNanoAdapter(config);
    const result = await adapter.validateConnection();
    
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(aiModule.generateText).not.toHaveBeenCalled();
  });
});
