import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenAIAdapter } from '../../src/background/adapters/openai-adapter.js';
import type { ProviderConfig } from '../../src/background/provider-types.js';
import * as aiSdkOpenai from '@ai-sdk/openai';
import * as aiModule from 'ai';

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => vi.fn((modelId) => ({ provider: 'openai', modelId }))),
}));

vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>();
  return {
    ...actual,
    generateText: vi.fn(),
  };
});

describe('OpenAIAdapter', () => {
  let config: ProviderConfig;
  const mockApiKey = 'sk-test-123';

  beforeEach(() => {
    vi.clearAllMocks();
    config = {
      id: 'openai-1',
      type: 'openai',
      name: 'OpenAI',
      enabled: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  });

  it('should initialize with config and api key', () => {
    const adapter = new OpenAIAdapter(config, mockApiKey);
    expect(adapter.providerType).toBe('openai');
    expect(adapter.config).toBe(config);
  });

  it('should return a language model with default model ID', () => {
    const adapter = new OpenAIAdapter(config, mockApiKey);
    const model = adapter.getLanguageModel() as any;
    
    expect(aiSdkOpenai.createOpenAI).toHaveBeenCalledWith({ apiKey: mockApiKey });
    expect(model.provider).toBe('openai');
    expect(model.modelId).toBe('gpt-4o-mini');
  });

  it('should return a language model with config model ID', () => {
    config.modelId = 'gpt-4-turbo';
    const adapter = new OpenAIAdapter(config, mockApiKey);
    const model = adapter.getLanguageModel() as any;
    
    expect(model.modelId).toBe('gpt-4-turbo');
  });

  it('should return a language model with explicit model ID overriding config', () => {
    config.modelId = 'gpt-4-turbo';
    const adapter = new OpenAIAdapter(config, mockApiKey);
    const model = adapter.getLanguageModel('gpt-3.5-turbo') as any;
    
    expect(model.modelId).toBe('gpt-3.5-turbo');
  });

  it('should validate connection successfully', async () => {
    vi.mocked(aiModule.generateText).mockResolvedValueOnce({ text: 'test' } as any);
    
    const adapter = new OpenAIAdapter(config, mockApiKey);
    const result = await adapter.validateConnection();
    
    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    expect(aiModule.generateText).toHaveBeenCalled();
  });

  it('should fail connection validation if api key is missing', async () => {
    const adapter = new OpenAIAdapter(config, '');
    const result = await adapter.validateConnection();
    
    expect(result.success).toBe(false);
    expect(result.error).toBe('API key is missing.');
  });

  it('should fail connection validation if generateText throws', async () => {
    vi.mocked(aiModule.generateText).mockRejectedValueOnce(new Error('Invalid API Key'));
    
    const adapter = new OpenAIAdapter(config, mockApiKey);
    const result = await adapter.validateConnection();
    
    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid API Key');
  });
});
