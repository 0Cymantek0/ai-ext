import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateText } from 'ai';
import type { LanguageModel } from 'ai';
import type { BaseProviderAdapter } from './base-adapter.js';
import type { ProviderConfig } from '../provider-types.js';

export class GoogleCloudAdapter implements BaseProviderAdapter {
  providerType: 'google' = 'google';
  config: ProviderConfig;
  private apiKey?: string;

  constructor(config: ProviderConfig, apiKey?: string) {
    this.config = config;
    this.apiKey = apiKey;
  }

  getLanguageModel(modelId?: string): LanguageModel {
    if (!this.apiKey) {
      throw new Error('API key is required for Google Cloud adapter');
    }

    const google = createGoogleGenerativeAI({
      apiKey: this.apiKey,
    });

    const resolvedModelId = modelId || this.config.modelId || 'gemini-1.5-flash';
    return google(resolvedModelId) as unknown as LanguageModel;
  }

  async validateConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      if (!this.apiKey) {
        return { success: false, error: 'API key is required' };
      }

      const model = this.getLanguageModel();
      // Perform a minimal prompt to verify API key
      const response = await generateText({
        model,
        prompt: 'Hi',
      });

      if (response.text) {
        return { success: true };
      }
      return { success: false, error: 'Empty response from model' };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { success: false, error: errorMessage };
    }
  }
}
