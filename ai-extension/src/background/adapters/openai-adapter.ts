import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";
import type {
  AdapterValidationResult,
  BaseProviderAdapter,
} from "./base-adapter.js";
import type { ProviderConfig, ProviderType } from "../provider-types.js";

export class OpenAIAdapter implements BaseProviderAdapter {
  providerType: ProviderType = "openai";
  config: ProviderConfig;
  private apiKey: string;

  constructor(config: ProviderConfig, apiKey: string) {
    this.config = config;
    this.apiKey = apiKey;
  }

  getLanguageModel(modelId?: string): any {
    const openai = createOpenAI({
      apiKey: this.apiKey,
      ...(this.config.baseUrl ? { baseURL: this.config.baseUrl } : {}),
      ...(this.config.defaultHeaders
        ? { headers: this.config.defaultHeaders }
        : {}),
    });

    const selectedModelId = modelId || this.config.modelId || "gpt-4o-mini";
    return openai(selectedModelId);
  }

  async validateConnection(): Promise<AdapterValidationResult> {
    if ((this.config.apiKeyRequired ?? true) && !this.apiKey) {
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
