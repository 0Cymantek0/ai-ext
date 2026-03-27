import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GoogleCloudAdapter } from '../../src/background/adapters/google-cloud-adapter.js';
import type { ProviderConfig } from '../../src/background/provider-types.js';
import * as aiSdkGoogle from '@ai-sdk/google';
import * as aiModule from 'ai';

vi.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: vi.fn(() => vi.fn((modelId) => ({ provider: 'google', modelId }))),
}));

vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>();
  return {
    ...actual,
    generateText: vi.fn(),
  };
});

describe('GoogleCloudAdapter', () => {
  let config: ProviderConfig;
  const mockApiKey = 'ai-goo-123';

  beforeEach(() => {
    vi.clearAllMocks();
    config = {
      id: 'google-1',
      type: 'google',
      name: 'Google',
      enabled: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  });

  it('should initialize with config and api key', () => {
    const adapter = new GoogleCloudAdapter(config, mockApiKey);
    expect(adapter.providerType).toBe('google');
    expect(adapter.config).toBe(config);
  });

  it('should return a language model with default model ID', () => {
    const adapter = new GoogleCloudAdapter(config, mockApiKey);
    const model = adapter.getLanguageModel() as any;
    
    expect(aiSdkGoogle.createGoogleGenerativeAI).toHaveBeenCalledWith({ apiKey: mockApiKey });
    expect(model.provider).toBe('google');
    expect(model.modelId).toBe('gemini-1.5-flash');
  });

  it('should return a language model with explicit model ID overriding config', () => {
    config.modelId = 'gemini-1.5-pro';
    const adapter = new GoogleCloudAdapter(config, mockApiKey);
    const model = adapter.getLanguageModel('gemini-1.0-pro') as any;
    
    expect(model.modelId).toBe('gemini-1.0-pro');
  });

  it('should validate connection successfully', async () => {
    vi.mocked(aiModule.generateText).mockResolvedValueOnce({ text: 'test' } as any);
    
    const adapter = new GoogleCloudAdapter(config, mockApiKey);
    const result = await adapter.validateConnection();
    
    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    expect(aiModule.generateText).toHaveBeenCalled();
  });

  it('should fail connection validation if api key is missing', async () => {
    const adapter = new GoogleCloudAdapter(config, '');
    const result = await adapter.validateConnection();
    
    expect(result.success).toBe(false);
    expect(result.error).toBe('API key is missing.');
  });
});
