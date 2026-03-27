import { createOpenAI } from '@ai-sdk/openai';
import { generateText, type LanguageModel } from 'ai';
import type { BaseProviderAdapter } from './base-adapter.js';
import type { ProviderConfig, ProviderType } from '../provider-types.js';

export class OpenAIAdapter implements BaseProviderAdapter {
  providerType: ProviderType = 'openai';
  config: ProviderConfig;
  private apiKey: string;

  constructor(config: ProviderConfig, apiKey: string) {
    this.config = config;
    this.apiKey = apiKey;
  }

  getLanguageModel(modelId?: string): LanguageModel {
    const openai = createOpenAI({
      apiKey: this.apiKey,
    });
    
    const selectedModelId = modelId || this.config.modelId || 'gpt-4o-mini';
    return openai(selectedModelId);
  }

  async validateConnection(): Promise<{ success: boolean; error?: string }> {
    if (!this.apiKey) {
      return { success: false, error: 'API key is missing.' };
    }

    try {
      const model = this.getLanguageModel();
      await generateText({
        model,
        prompt: 'Hello',
        maxTokens: 1,
      });
      return { success: true };
    } catch (error: any) {
      return { 
        success: false, 
        error: error.message || 'Failed to validate connection'
      };
    }
  }
}
