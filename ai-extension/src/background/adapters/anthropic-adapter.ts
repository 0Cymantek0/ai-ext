import { createAnthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import type { BaseProviderAdapter } from "./base-adapter.js";
import type { ProviderConfig, ProviderType } from "../provider-types.js";

export class AnthropicAdapter implements BaseProviderAdapter {
  providerType: ProviderType = "anthropic";
  config: ProviderConfig;
  private apiKey: string;

  constructor(config: ProviderConfig, apiKey: string) {
    this.config = config;
    this.apiKey = apiKey;
  }

  getLanguageModel(modelId?: string): any {
    const anthropic = createAnthropic({
      apiKey: this.apiKey,
    });

    const selectedModelId =
      modelId || this.config.modelId || "claude-3-5-sonnet-latest";
    return anthropic(selectedModelId);
  }

  async validateConnection(): Promise<{ success: boolean; error?: string }> {
    if (!this.apiKey) {
      return { success: false, error: "API key is missing." };
    }

    try {
      const model = this.getLanguageModel();
      await generateText({
        model: model as any,
        prompt: "Hello",
        maxOutputTokens: 1,
      });
      return { success: true };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || "Failed to validate connection",
      };
    }
  }
}
