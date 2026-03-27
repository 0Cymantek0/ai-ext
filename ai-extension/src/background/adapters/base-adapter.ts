import type { LanguageModel } from 'ai';
import type { ProviderType, ProviderConfig } from '../provider-types.js';

export interface BaseProviderAdapter {
  providerType: ProviderType;
  config: ProviderConfig;
  getLanguageModel(modelId?: string): LanguageModel;
  validateConnection(): Promise<{ success: boolean; error?: string }>;
}
