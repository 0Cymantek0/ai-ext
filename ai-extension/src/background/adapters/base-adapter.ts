import type { LanguageModelV3 } from '@ai-sdk/provider';
import type { ProviderType, ProviderConfig } from '../provider-types.js';

export interface BaseProviderAdapter {
  providerType: ProviderType;
  config: ProviderConfig;
  getLanguageModel(modelId?: string): LanguageModelV3;
  validateConnection(): Promise<{ success: boolean; error?: string }>;
}
