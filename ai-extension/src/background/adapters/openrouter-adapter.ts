import { OpenAICompatibleAdapter } from "./openai-compatible-adapter.js";
import type { ProviderConfig } from "../provider-types.js";

export class OpenRouterAdapter extends OpenAICompatibleAdapter {
  constructor(config: ProviderConfig, apiKey?: string) {
    super(
      {
        ...config,
        type: "openrouter",
        endpointMode: "openai-compatible",
        baseUrl: config.baseUrl || "https://openrouter.ai/api/v1",
        apiKeyRequired: config.apiKeyRequired ?? true,
      },
      apiKey,
    );
  }
}
