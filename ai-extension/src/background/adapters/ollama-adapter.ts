import { OpenAICompatibleAdapter } from "./openai-compatible-adapter.js";
import type { ProviderConfig } from "../provider-types.js";

/**
 * Ensure the base URL ends with /v1 for Ollama's OpenAI-compatible endpoint.
 * Users may configure "http://localhost:11434" without the /v1 suffix.
 */
function ensureV1Suffix(url: string): string {
  const trimmed = url.replace(/\/+$/, "");
  if (trimmed.endsWith("/v1")) return trimmed;
  return `${trimmed}/v1`;
}

export class OllamaAdapter extends OpenAICompatibleAdapter {
  constructor(config: ProviderConfig, apiKey?: string) {
    const resolvedBase = ensureV1Suffix(
      config.baseUrl || "http://localhost:11434",
    );

    super(
      {
        ...config,
        type: "ollama",
        endpointMode: "openai-compatible",
        baseUrl: resolvedBase,
        apiKeyRequired: config.apiKeyRequired ?? false,
      },
      apiKey,
    );
  }
}
