import type { ProviderConfig } from '../provider-types.js';
import type { BaseProviderAdapter } from './base-adapter.js';
import { getProviderConfigManager } from '../provider-config-manager.js';

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

    // For now, throw an error since specific adapters are not yet implemented
    throw new Error(`Adapter for provider type '${config.type}' is not yet implemented.`);
  }
}
