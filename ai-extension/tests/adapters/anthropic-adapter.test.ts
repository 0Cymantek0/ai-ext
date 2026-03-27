import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnthropicAdapter } from '../../src/background/adapters/anthropic-adapter.js';
import type { ProviderConfig } from '../../src/background/provider-types.js';
import * as aiSdkAnthropic from '@ai-sdk/anthropic';
import * as aiModule from 'ai';

vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: vi.fn(() => vi.fn((modelId) => ({ provider: 'anthropic', modelId }))),
}));

vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>();
  return {
    ...actual,
    generateText: vi.fn(),
  };
});

describe('AnthropicAdapter', () => {
  let config: ProviderConfig;
  const mockApiKey = 'sk-ant-123';

  beforeEach(() => {
    vi.clearAllMocks();
    config = {
      id: 'anthropic-1',
      type: 'anthropic',
      name: 'Anthropic',
      enabled: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  });

  it('should initialize with config and api key', () => {
    const adapter = new AnthropicAdapter(config, mockApiKey);
    expect(adapter.providerType).toBe('anthropic');
    expect(adapter.config).toBe(config);
  });

  it('should return a language model with default model ID', () => {
    const adapter = new AnthropicAdapter(config, mockApiKey);
    const model = adapter.getLanguageModel() as any;
    
    expect(aiSdkAnthropic.createAnthropic).toHaveBeenCalledWith({ apiKey: mockApiKey });
    expect(model.provider).toBe('anthropic');
    expect(model.modelId).toBe('claude-3-5-sonnet-latest');
  });

  it('should return a language model with config model ID', () => {
    config.modelId = 'claude-3-opus-20240229';
    const adapter = new AnthropicAdapter(config, mockApiKey);
    const model = adapter.getLanguageModel() as any;
    
    expect(model.modelId).toBe('claude-3-opus-20240229');
  });

  it('should return a language model with explicit model ID overriding config', () => {
    config.modelId = 'claude-3-opus-20240229';
    const adapter = new AnthropicAdapter(config, mockApiKey);
    const model = adapter.getLanguageModel('claude-3-haiku-20240307') as any;
    
    expect(model.modelId).toBe('claude-3-haiku-20240307');
  });

  it('should validate connection successfully', async () => {
    vi.mocked(aiModule.generateText).mockResolvedValueOnce({ text: 'test' } as any);
    
    const adapter = new AnthropicAdapter(config, mockApiKey);
    const result = await adapter.validateConnection();
    
    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    expect(aiModule.generateText).toHaveBeenCalled();
  });

  it('should fail connection validation if api key is missing', async () => {
    const adapter = new AnthropicAdapter(config, '');
    const result = await adapter.validateConnection();
    
    expect(result.success).toBe(false);
    expect(result.error).toBe('API key is missing.');
  });

  it('should fail connection validation if generateText throws', async () => {
    vi.mocked(aiModule.generateText).mockRejectedValueOnce(new Error('Invalid API Key'));
    
    const adapter = new AnthropicAdapter(config, mockApiKey);
    const result = await adapter.validateConnection();
    
    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid API Key');
  });
});
