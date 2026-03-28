import type { ProviderType, ProviderConfig } from '../provider-types.js';

export interface AdapterValidationResult {
  success: boolean;
  error?: string;
}

export interface BaseProviderAdapter {
  providerType: ProviderType;
  config: ProviderConfig;
  getLanguageModel(modelId?: string): any;
  validateConnection(): Promise<AdapterValidationResult>;
}
