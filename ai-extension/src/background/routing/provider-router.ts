import type { CapabilityType } from './types.js';
import { SettingsManager } from './settings-manager.js';
import { classifyPromptWithNano } from './nano-classifier.js';
import { ProviderFactory } from '../adapters/provider-factory.js';
import { getProviderConfigManager } from '../provider-config-manager.js';
import type { BaseProviderAdapter } from '../adapters/base-adapter.js';

export class ProviderRouter {
  private settingsManager: SettingsManager;

  constructor() {
    this.settingsManager = new SettingsManager();
  }

  async routeCapability(capability: CapabilityType, prompt: string, nanoModel?: any): Promise<BaseProviderAdapter> {
    const prefs = await this.settingsManager.getRoutingPreferences();
    const primary = prefs[capability];
    
    let executionChain = [primary, ...prefs.fallbackChain].filter(Boolean) as string[];

    if (capability === 'chat' && prefs.routingMode === 'auto') {
      let matchedWord = false;
      
      if (prefs.triggerWords) {
        for (const [word, providerId] of Object.entries(prefs.triggerWords)) {
          if (prompt.toLowerCase().includes(word.toLowerCase())) {
            executionChain.unshift(providerId);
            matchedWord = true;
            break;
          }
        }
      }

      if (!matchedWord) {
        const intentMeta = await classifyPromptWithNano(prompt, nanoModel);
        const modelSheet = await this.settingsManager.getModelSheet();

        let bestMatchId: string | null = null;
        let bestScore = -1;

        for (const [providerId, entry] of Object.entries(modelSheet)) {
          let score = 0;
          
          if (intentMeta.budget_signal === 'low' && entry.tier.cost === 'low') score += 2;
          else if (intentMeta.budget_signal === 'high' && entry.tier.cost === 'high') score += 2;
          else if (intentMeta.budget_signal === 'medium' && entry.tier.cost === 'medium') score += 2;
          else if (entry.tier.cost === 'free') score += 1;

          if (intentMeta.complexity >= 8 && entry.tier.quality === 'expert') score += 3;
          else if (intentMeta.complexity >= 4 && intentMeta.complexity <= 7 && entry.tier.quality === 'advanced') score += 3;
          else if (intentMeta.complexity < 4 && entry.tier.quality === 'basic') score += 3;

          if (score > bestScore) {
            bestScore = score;
            bestMatchId = providerId;
          }
        }

        if (bestMatchId) {
          executionChain.unshift(bestMatchId);
        }
      }
    }

    executionChain = [...new Set(executionChain)];
    
    const diagnostics: { providerId: string; error: string }[] = [];
    const configManager = getProviderConfigManager();

    if (!configManager.isInitialized()) {
      await configManager.initialize();
    }

    for (const providerId of executionChain) {
      try {
        const config = await configManager.getProvider(providerId);
        if (!config) {
          throw new Error(`Provider config not found for ID: ${providerId}`);
        }

        const adapter = await ProviderFactory.createAdapter(config);
        const validation = await adapter.validateConnection();
        
        if (!validation.success) {
          throw new Error(validation.error || 'Connection validation failed');
        }

        return adapter;
      } catch (e: any) {
        diagnostics.push({ providerId, error: e.message || 'Unknown error' });
      }
    }

    throw new Error("All providers in fallback chain failed: " + JSON.stringify(diagnostics));
  }
}
