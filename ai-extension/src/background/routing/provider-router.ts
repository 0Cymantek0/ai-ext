import type { CapabilityType } from "./types.js";
import type { SpeechSettings } from "./types.js";
import { SettingsManager } from "./settings-manager.js";
import { classifyPromptWithNano } from "./nano-classifier.js";
import { ProviderFactory } from "../adapters/provider-factory.js";
import { getProviderConfigManager } from "../provider-config-manager.js";
import type { BaseProviderAdapter } from "../adapters/base-adapter.js";
import type { ResolvedProviderExecution } from "../provider-execution/types.js";

export class ProviderRouter {
  private settingsManager: SettingsManager;

  constructor() {
    this.settingsManager = new SettingsManager();
  }

  /**
   * Get the currently persisted speech settings.
   * Returns typed STT configuration without invoking transcription.
   */
  async getSpeechSettings(): Promise<SpeechSettings> {
    return this.settingsManager.getSpeechSettings();
  }

  async resolveCapability(
    capability: CapabilityType,
    prompt: string,
    nanoModel?: any,
    preferredProviderId?: string,
    preferredModelId?: string,
  ): Promise<ResolvedProviderExecution> {
    const prefs = await this.settingsManager.getRoutingPreferences();
    const primary = preferredProviderId ?? prefs[capability];

    let executionChain = [
      primary,
      ...prefs.fallbackChain.filter((providerId) => providerId !== primary),
    ].filter(Boolean) as string[];

    // Initialize configManager early — needed for both auto mode and execution chain
    const configManager = getProviderConfigManager();
    if (!configManager.isInitialized()) {
      await configManager.initialize();
    }

    // Get modelSheet early — needed for heuristic scoring and enabled filtering
    const modelSheet = await this.settingsManager.getModelSheet();

    // Auto mode: trigger words + heuristic scoring
    if (capability === "chat" && prefs.routingMode === "auto") {
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

        let bestMatchId: string | null = null;
        let bestScore = -1;

        for (const [modelKey, entry] of Object.entries(modelSheet)) {
          // D-11: Skip disabled models
          if (entry.enabled === false) continue;

          // D-11: Check provider enabled status
          const providerConfig = await configManager.getProvider(
            entry.providerId,
          );
          if (!providerConfig || !providerConfig.enabled) continue;

          let score = 0;

          if (intentMeta.budget_signal === "low" && entry.tier.cost === "low")
            score += 2;
          else if (
            intentMeta.budget_signal === "high" &&
            entry.tier.cost === "high"
          )
            score += 2;
          else if (
            intentMeta.budget_signal === "medium" &&
            entry.tier.cost === "medium"
          )
            score += 2;
          else if (entry.tier.cost === "free") score += 1;

          if (intentMeta.complexity >= 8 && entry.tier.quality === "expert")
            score += 3;
          else if (
            intentMeta.complexity >= 4 &&
            intentMeta.complexity <= 7 &&
            entry.tier.quality === "advanced"
          )
            score += 3;
          else if (intentMeta.complexity < 4 && entry.tier.quality === "basic")
            score += 3;

          if (score > bestScore) {
            bestScore = score;
            bestMatchId = entry.providerId;
          }
        }

        if (bestMatchId) {
          executionChain.unshift(bestMatchId);
        }
      }
    }

    executionChain = [...new Set(executionChain)];

    const diagnostics: { providerId: string; error: string }[] = [];

    for (const providerId of executionChain) {
      try {
        const config = await configManager.getProvider(providerId);

        // D-09: Check provider exists
        if (!config) {
          diagnostics.push({ providerId, error: "Provider config not found" });
          continue;
        }

        // D-09: Check provider-level enabled
        if (!config.enabled) {
          diagnostics.push({ providerId, error: "Provider is disabled" });
          continue;
        }

        const providerModels = Object.values(modelSheet).filter(
          (entry) => entry.providerId === providerId && entry.enabled !== false,
        );
        const resolvedModelId =
          (providerId === preferredProviderId ? preferredModelId : undefined) ||
          config.modelId ||
          providerModels[0]?.modelId ||
          "";

        if (!resolvedModelId) {
          diagnostics.push({
            providerId,
            error: "No enabled or configured models for this provider",
          });
          continue;
        }

        const adapter = await ProviderFactory.createAdapter(config);
        const validation = await adapter.validateConnection();

        if (!validation.success) {
          throw new Error(validation.error || "Connection validation failed");
        }

        const attemptedProviderIds = executionChain;
        const fallbackOccurred = providerId !== primary;

        return {
          capability,
          adapter,
          metadata: {
            providerId,
            providerType: config.type,
            modelId: resolvedModelId,
            attemptedProviderIds,
            ...(fallbackOccurred && primary
              ? { fallbackFromProviderId: primary }
              : {}),
            fallbackOccurred,
          },
        };
      } catch (e: any) {
        diagnostics.push({ providerId, error: e.message || "Unknown error" });
      }
    }

    // D-10: Clear actionable error when all filtered out
    throw new Error(
      `No enabled providers available for '${capability}' capability. ` +
        `Enable a provider and its models in settings. ` +
        `Diagnostics: ${JSON.stringify(diagnostics)}`,
    );
  }

  async routeCapability(
    capability: CapabilityType,
    prompt: string,
    nanoModel?: any,
  ): Promise<BaseProviderAdapter> {
    const { adapter } = await this.resolveCapability(
      capability,
      prompt,
      nanoModel,
    );
    return adapter;
  }
}
