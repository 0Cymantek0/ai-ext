import type { ProviderConfig } from '../provider-types.js';
import type { BaseProviderAdapter } from './base-adapter.js';
import { getProviderConfigManager } from '../provider-config-manager.js';
import { OpenAIAdapter } from './openai-adapter.js';
import { AnthropicAdapter } from './anthropic-adapter.js';

export class ProviderFactory {
  static async createAdapter(config: ProviderConfig, apiKey?: string): Promise<BaseProviderAdapter> {
    let resolvedApiKey = apiKey;

    if (!resolvedApiKey && config.id) {
      const configManager = getProviderConfigManager();
      if (!configManager.isInitialized()) {
        await configManager.initialize();
      }
      const decryptedKey = await configManager.getDecryptedApiKey(config.id);
      if (decryptedKey) {
        resolvedApiKey = decryptedKey;
      }
    }

    if (config.type === 'openai') {
      return new OpenAIAdapter(config, resolvedApiKey || '');
    }

    if (config.type === 'anthropic') {
      return new AnthropicAdapter(config, resolvedApiKey || '');
    }

    // For now, throw an error since specific adapters are not yet implemented
    throw new Error(`Adapter for provider type '${config.type}' is not yet implemented.`);
  }
}
