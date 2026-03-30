import { z } from "zod";
import { EmbeddingProviderSwitchError } from "./types";
import type {
  CapabilityType,
  RoutingPreferences,
  ModelSheetEntry,
  SpeechSettings,
} from "./types";
import type { ProviderConfigManager } from "../provider-config-manager.js";
import { getProviderConfigManager } from "../provider-config-manager.js";
import { seedModelCatalog } from "./model-catalog.js";

const PREFS_KEY = "ai_pocket_routing_prefs";
const MODEL_SHEET_KEY = "ai_pocket_model_sheet";
const SPEECH_SETTINGS_KEY = "ai_pocket_speech_settings";

const SpeechSettingsSchema = z
  .object({
    provider: z.object({
      providerId: z.string().min(1),
      modelId: z.string().min(1),
    }),
    language: z.string().min(1),
    timestampGranularity: z.enum(["none", "segment", "word"]),
    advancedOptions: z
      .object({
        enableTranslation: z.boolean().optional(),
        enableDiarization: z.boolean().optional(),
        temperature: z.number().min(0).max(1).optional(),
        prompt: z.string().optional(),
      })
      .optional(),
  })
  .strict();

const DEFAULT_SPEECH_SETTINGS: SpeechSettings = {
  provider: { providerId: "", modelId: "" },
  language: "en",
  timestampGranularity: "segment",
  advancedOptions: {},
};

const RoutingModeSchema = z.enum(["auto", "manual"], {
  errorMap: () => ({ message: "routingMode must be 'auto' or 'manual'" }),
});

const DEFAULT_PREFS: RoutingPreferences = {
  chat: null,
  embeddings: null,
  speech: null,
  fallbackChain: [],
  routingMode: "auto",
  triggerWords: {},
  providerParameters: {},
};

const DEFAULT_MODEL_SHEET: Record<string, ModelSheetEntry> = {};

export class SettingsManager {
  async getRoutingPreferences(): Promise<RoutingPreferences> {
    const result = await chrome.storage.local.get(PREFS_KEY);
    return (
      result[PREFS_KEY] || {
        ...DEFAULT_PREFS,
        fallbackChain: [],
        triggerWords: {},
        providerParameters: {},
      }
    );
  }

  async updateRoutingPreferences(updates: Partial<RoutingPreferences>): Promise<void> {
    const prefs = await this.getRoutingPreferences();

    if (updates.routingMode !== undefined) {
      prefs.routingMode = RoutingModeSchema.parse(updates.routingMode);
    }

    if (updates.fallbackChain !== undefined) {
      if (!Array.isArray(updates.fallbackChain)) {
        throw new Error("fallbackChain must be an array of provider ID strings");
      }
      const configManager = getProviderConfigManager();
      if (!configManager.isInitialized()) {
        await configManager.initialize();
      }
      const providers = await configManager.listProviders();
      const enabledIds = new Set(
        providers.filter((p) => p.enabled).map((p) => p.id),
      );
      const invalid = updates.fallbackChain.filter((id) => !enabledIds.has(id));
      if (invalid.length > 0) {
        throw new Error(
          `Fallback chain contains non-existent or disabled providers: ${invalid.join(", ")}. Remove them or enable the providers first.`,
        );
      }
      prefs.fallbackChain = updates.fallbackChain;
    }

    if (updates.triggerWords !== undefined) {
      if (!updates.triggerWords || typeof updates.triggerWords !== "object") {
        throw new Error("triggerWords must be a Record<string, string>");
      }
      prefs.triggerWords = updates.triggerWords;
    }

    if (updates.providerParameters !== undefined) {
      prefs.providerParameters = { ...prefs.providerParameters, ...updates.providerParameters };
    }

    if (updates.chat !== undefined) prefs.chat = updates.chat;
    if (updates.embeddings !== undefined) prefs.embeddings = updates.embeddings;
    if (updates.speech !== undefined) prefs.speech = updates.speech;

    await chrome.storage.local.set({ [PREFS_KEY]: prefs });
  }

  async getModelSheet(): Promise<Record<string, ModelSheetEntry>> {
    const result = await chrome.storage.local.get(MODEL_SHEET_KEY);
    return result[MODEL_SHEET_KEY] || {};
  }

  async updateModelSheet(
    sheet: Record<string, ModelSheetEntry>,
  ): Promise<void> {
    await chrome.storage.local.set({ [MODEL_SHEET_KEY]: sheet });
  }

  async getProviderParameters(
    providerId: string,
  ): Promise<Record<string, any>> {
    const prefs = await this.getRoutingPreferences();
    return prefs.providerParameters[providerId] || {};
  }

  async setProviderParameters(
    providerId: string,
    params: Record<string, any>,
  ): Promise<void> {
    const prefs = await this.getRoutingPreferences();
    prefs.providerParameters = {
      ...prefs.providerParameters,
      [providerId]: params,
    };
    await chrome.storage.local.set({ [PREFS_KEY]: prefs });
  }

  async setCapabilityProvider(
    capability: CapabilityType,
    providerId: string,
    bypassWarning = false,
  ): Promise<void> {
    const currentPrefs = await this.getRoutingPreferences();

    if (
      capability === "embeddings" &&
      currentPrefs.embeddings !== null &&
      currentPrefs.embeddings !== providerId &&
      !bypassWarning
    ) {
      throw new EmbeddingProviderSwitchError(
        "Switching embedding providers will render existing content embeddings incompatible. Pass bypassWarning=true to override.",
      );
    }

    const updatedPrefs = {
      ...currentPrefs,
      [capability]: providerId,
    };

    await chrome.storage.local.set({ [PREFS_KEY]: updatedPrefs });
  }

  // Routing mode methods (D-12)

  async getRoutingMode(): Promise<"auto" | "manual"> {
    const prefs = await this.getRoutingPreferences();
    return prefs.routingMode;
  }

  async setRoutingMode(mode: unknown): Promise<void> {
    const validated = RoutingModeSchema.parse(mode);
    const prefs = await this.getRoutingPreferences();
    prefs.routingMode = validated;
    await chrome.storage.local.set({ [PREFS_KEY]: prefs });
  }

  // Fallback chain methods (D-12)

  async getFallbackChain(): Promise<string[]> {
    const prefs = await this.getRoutingPreferences();
    return prefs.fallbackChain;
  }

  async setFallbackChain(chain: unknown): Promise<void> {
    if (!Array.isArray(chain)) {
      throw new Error("fallbackChain must be an array of provider ID strings");
    }
    const configManager = getProviderConfigManager();
    if (!configManager.isInitialized()) {
      await configManager.initialize();
    }
    const providers = await configManager.listProviders();
    const enabledIds = new Set(
      providers.filter((p) => p.enabled).map((p) => p.id),
    );
    const invalid = (chain as string[]).filter((id) => !enabledIds.has(id));
    if (invalid.length > 0) {
      throw new Error(
        `Fallback chain contains non-existent or disabled providers: ${invalid.join(", ")}. Remove them or enable the providers first.`,
      );
    }
    const prefs = await this.getRoutingPreferences();
    prefs.fallbackChain = chain as string[];
    await chrome.storage.local.set({ [PREFS_KEY]: prefs });
  }

  // Trigger word methods (D-12)

  async getTriggerWords(): Promise<Record<string, string>> {
    const prefs = await this.getRoutingPreferences();
    return prefs.triggerWords;
  }

  async setTriggerWords(words: Record<string, string>): Promise<void> {
    if (!words || typeof words !== "object") {
      throw new Error("triggerWords must be a Record<string, string>");
    }
    const prefs = await this.getRoutingPreferences();
    prefs.triggerWords = words;
    await chrome.storage.local.set({ [PREFS_KEY]: prefs });
  }

  async addTriggerWord(word: unknown, providerId: unknown): Promise<void> {
    if (!word || typeof word !== "string") {
      throw new Error("Trigger word must be a non-empty string");
    }
    if (!providerId || typeof providerId !== "string") {
      throw new Error(
        "providerId must be a non-empty string referencing an existing provider",
      );
    }
    const prefs = await this.getRoutingPreferences();
    prefs.triggerWords = { ...prefs.triggerWords, [word]: providerId };
    await chrome.storage.local.set({ [PREFS_KEY]: prefs });
  }

  async removeTriggerWord(word: string): Promise<void> {
    const prefs = await this.getRoutingPreferences();
    const { [word]: _, ...rest } = prefs.triggerWords;
    prefs.triggerWords = rest;
    await chrome.storage.local.set({ [PREFS_KEY]: prefs });
  }

  // Model management methods (D-13)

  async addModel(
    providerId: string,
    entry: Partial<ModelSheetEntry> & { modelId: string },
  ): Promise<void> {
    if (!entry.modelId || typeof entry.modelId !== "string") {
      throw new Error("modelId is required and must be a string");
    }
    if (!providerId || typeof providerId !== "string") {
      throw new Error("providerId is required and must be a string");
    }
    if (!entry.providerType || typeof entry.providerType !== "string") {
      throw new Error("providerType is required and must be a string");
    }

    const sheet = await this.getModelSheet();
    sheet[entry.modelId] = {
      modelId: entry.modelId,
      providerId,
      providerType: entry.providerType,
      enabled: entry.enabled ?? true,
      capabilities: entry.capabilities ?? {
        supportsVision: false,
        contextWindow: 4096,
        maxOutputTokens: 2048,
        supportsImageAnalysis: false,
        supportsVideoAnalysis: false,
        supportsAudioAnalysis: false,
        supportsTranscription: false,
        supportsTranslation: false,
        supportsAudioInput: false,
        supportsWordTimestamps: false,
      },
      tier: entry.tier ?? { cost: "medium", speed: "medium", quality: "basic" },
    };
    await chrome.storage.local.set({ [MODEL_SHEET_KEY]: sheet });
  }

  async removeModel(modelId: string): Promise<void> {
    const sheet = await this.getModelSheet();
    if (!sheet[modelId]) {
      throw new Error(`Model '${modelId}' not found in model sheet`);
    }
    delete sheet[modelId];
    await chrome.storage.local.set({ [MODEL_SHEET_KEY]: sheet });
  }

  async getModel(modelId: string): Promise<ModelSheetEntry | null> {
    const sheet = await this.getModelSheet();
    return sheet[modelId] ?? null;
  }

  async setModelEnabled(modelId: string, enabled: boolean): Promise<void> {
    const sheet = await this.getModelSheet();
    if (!sheet[modelId]) {
      throw new Error(
        `Model '${modelId}' not found in model sheet. Add it first using addModel().`,
      );
    }
    sheet[modelId].enabled = enabled;
    await chrome.storage.local.set({ [MODEL_SHEET_KEY]: sheet });
  }

  async refreshModelCatalog(): Promise<Record<string, ModelSheetEntry>> {
    const configManager = getProviderConfigManager();
    if (!configManager.isInitialized()) {
      await configManager.initialize();
    }
    const newSheet = await seedModelCatalog(configManager);
    await chrome.storage.local.set({ [MODEL_SHEET_KEY]: newSheet });
    return newSheet;
  }

  // Speech settings methods (STT-01, STT-03)

  /**
   * Get the persisted speech settings.
   * Returns defaults if no settings have been saved.
   */
  async getSpeechSettings(): Promise<SpeechSettings> {
    const result = await chrome.storage.local.get(SPEECH_SETTINGS_KEY);
    if (result[SPEECH_SETTINGS_KEY]) {
      return result[SPEECH_SETTINGS_KEY] as SpeechSettings;
    }
    return {
      ...DEFAULT_SPEECH_SETTINGS,
      advancedOptions: { ...DEFAULT_SPEECH_SETTINGS.advancedOptions },
    };
  }

  /**
   * Persist speech settings with Zod validation.
   * Throws if the settings fail validation.
   */
  async setSpeechSettings(settings: unknown): Promise<void> {
    const validated = SpeechSettingsSchema.parse(settings);
    await chrome.storage.local.set({ [SPEECH_SETTINGS_KEY]: validated });
  }
}
