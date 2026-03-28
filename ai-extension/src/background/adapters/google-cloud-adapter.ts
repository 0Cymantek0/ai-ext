import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateText } from 'ai';
import type { BaseProviderAdapter } from './base-adapter.js';
import type { ProviderConfig, ProviderType } from '../provider-types.js';

export class GoogleCloudAdapter implements BaseProviderAdapter {
  providerType: ProviderType = 'google';
  config: ProviderConfig;
  private apiKey: string;

  constructor(config: ProviderConfig, apiKey: string) {
    this.config = config;
    this.apiKey = apiKey;
  }

  getLanguageModel(modelId?: string): any {
    const google = createGoogleGenerativeAI({
      apiKey: this.apiKey,
    });

    const selectedModelId = modelId || this.config.modelId || 'gemini-1.5-flash';
    return google(selectedModelId);
  }

  async validateConnection(): Promise<{ success: boolean; error?: string }> {
    if (!this.apiKey) {
      return { success: false, error: 'API key is missing.' };
    }

    try {
      const model = this.getLanguageModel();
      await generateText({
        model: model as any,
        prompt: 'test',
        maxOutputTokens: 1,
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
