import { CapabilityType, RoutingPreferences, EmbeddingProviderSwitchError, ModelSheetEntry } from './types';

const PREFS_KEY = 'ai_pocket_routing_prefs';
const MODEL_SHEET_KEY = 'ai_pocket_model_sheet';

const DEFAULT_PREFS: RoutingPreferences = {
  chat: null,
  embeddings: null,
  speech: null,
  fallbackChain: [],
  routingMode: 'auto',
  triggerWords: {},
  providerParameters: {}
};

const DEFAULT_MODEL_SHEET: Record<string, ModelSheetEntry> = {};

export class SettingsManager {
  async getRoutingPreferences(): Promise<RoutingPreferences> {
    const result = await chrome.storage.local.get(PREFS_KEY);
    return result[PREFS_KEY] || DEFAULT_PREFS;
  }

  async getModelSheet(): Promise<Record<string, ModelSheetEntry>> {
    const result = await chrome.storage.local.get(MODEL_SHEET_KEY);
    return result[MODEL_SHEET_KEY] || DEFAULT_MODEL_SHEET;
  }

  async updateModelSheet(sheet: Record<string, ModelSheetEntry>): Promise<void> {
    await chrome.storage.local.set({ [MODEL_SHEET_KEY]: sheet });
  }

  async getProviderParameters(providerId: string): Promise<Record<string, any>> {
    const prefs = await this.getRoutingPreferences();
    return prefs.providerParameters[providerId] || {};
  }

  async setProviderParameters(providerId: string, params: Record<string, any>): Promise<void> {
    const prefs = await this.getRoutingPreferences();
    prefs.providerParameters = {
      ...prefs.providerParameters,
      [providerId]: params
    };
    await chrome.storage.local.set({ [PREFS_KEY]: prefs });
  }

  async setCapabilityProvider(capability: CapabilityType, providerId: string, bypassWarning = false): Promise<void> {
    const currentPrefs = await this.getRoutingPreferences();
    
    if (capability === 'embeddings' && currentPrefs.embeddings !== null && currentPrefs.embeddings !== providerId && !bypassWarning) {
      throw new EmbeddingProviderSwitchError("Switching embedding providers will render existing content embeddings incompatible. Pass bypassWarning=true to override.");
    }
    
    const updatedPrefs = {
      ...currentPrefs,
      [capability]: providerId
    };
    
    await chrome.storage.local.set({ [PREFS_KEY]: updatedPrefs });
  }
}
