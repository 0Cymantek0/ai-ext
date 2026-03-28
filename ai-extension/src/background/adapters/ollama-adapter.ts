import { OpenAICompatibleAdapter } from "./openai-compatible-adapter.js";
import type { ProviderConfig } from "../provider-types.js";

export class OllamaAdapter extends OpenAICompatibleAdapter {
  constructor(config: ProviderConfig, apiKey?: string) {
    super(
      {
        ...config,
        type: "ollama",
        endpointMode: "openai-compatible",
        baseUrl: config.baseUrl || "http://localhost:11434/v1",
        apiKeyRequired: config.apiKeyRequired ?? false,
      },
      apiKey,
    );
  }
}
