import { OpenAICompatibleAdapter } from "./openai-compatible-adapter.js";
import type { ProviderConfig } from "../provider-types.js";

export class GroqAdapter extends OpenAICompatibleAdapter {
  constructor(config: ProviderConfig, apiKey?: string) {
    super(
      {
        ...config,
        type: "groq",
        endpointMode: "openai-compatible",
        baseUrl: config.baseUrl || "https://api.groq.com/openai/v1",
        apiKeyRequired: config.apiKeyRequired ?? true,
      },
      apiKey,
    );
  }
}
