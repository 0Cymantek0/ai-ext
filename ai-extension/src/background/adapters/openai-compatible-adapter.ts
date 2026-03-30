import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText } from "ai";
import type {
  AdapterValidationResult,
  BaseProviderAdapter,
} from "./base-adapter.js";
import type { ProviderConfig, ProviderType } from "../provider-types.js";

export class OpenAICompatibleAdapter implements BaseProviderAdapter {
  providerType: ProviderType;
  config: ProviderConfig;
  protected apiKey: string | undefined;

  constructor(config: ProviderConfig, apiKey?: string) {
    this.providerType = config.type;
    this.config = config;
    this.apiKey = apiKey;
  }

  protected getBaseUrl(): string {
    return this.config.baseUrl || "https://api.openai.com/v1";
  }

  protected getHeaders(): Record<string, string> | undefined {
    const attributionHeaders =
      this.config.providerOptions?.type === "openrouter"
        ? {
            ...(this.config.providerOptions.attributionHeaders?.httpReferer
              ? {
                  "HTTP-Referer":
                    this.config.providerOptions.attributionHeaders.httpReferer,
                }
              : {}),
            ...(this.config.providerOptions.attributionHeaders?.xTitle
              ? {
                  "X-OpenRouter-Title":
                    this.config.providerOptions.attributionHeaders.xTitle,
                }
              : {}),
            ...(this.config.providerOptions.attributionHeaders?.xCategories
              ?.length
              ? {
                  "X-OpenRouter-Categories":
                    this.config.providerOptions.attributionHeaders.xCategories.join(
                      ",",
                    ),
                }
              : {}),
          }
        : undefined;

    return {
      ...this.config.defaultHeaders,
      ...attributionHeaders,
    };
  }

  getLanguageModel(modelId?: string): any {
    const headers = this.getHeaders();
    const provider = createOpenAICompatible({
      name: this.config.type,
      baseURL: this.getBaseUrl(),
      ...(this.apiKey ? { apiKey: this.apiKey } : {}),
      ...(headers ? { headers } : {}),
      ...(this.config.defaultQueryParams
        ? { queryParams: this.config.defaultQueryParams }
        : {}),
    });

    const selectedModelId = modelId || this.config.modelId || "gpt-4o-mini";
    return provider(selectedModelId);
  }

  async validateConnection(): Promise<AdapterValidationResult> {
    const apiKeyRequired = this.config.apiKeyRequired ?? true;
    if (apiKeyRequired && !this.apiKey) {
      return { success: false, error: "API key is missing." };
    }

    try {
      await generateText({
        model: this.getLanguageModel(),
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
