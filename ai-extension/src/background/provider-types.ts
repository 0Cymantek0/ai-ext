import type { EncryptedData } from "./crypto-manager.js";

/**
 * Supported AI Provider Types
 */
export type ProviderType =
  | "openai"
  | "anthropic"
  | "google"
  | "gemini-nano"
  | "openrouter"
  | "ollama"
  | "groq"
  | "nvidia"
  | "custom";

export type ProviderEndpointMode = "native" | "openai-compatible" | "nvidia-nim";

export interface OpenRouterProviderOptions {
  type: "openrouter";
  attributionHeaders?: {
    httpReferer?: string;
    xTitle?: string;
    xCategories?: string[];
  };
}

export interface OllamaProviderOptions {
  type: "ollama";
  keepAlive?: string;
  local?: boolean;
}

export interface GroqProviderOptions {
  type: "groq";
  supportsSpeechModels?: boolean;
}

export interface CustomProviderOptions {
  type: "custom";
  displayBaseUrl?: string;
  validateModelsEndpoint?: boolean;
}

export interface NvidiaProviderOptions {
  type: "nvidia";
  healthEndpoint?: string;
  serviceScope?: "chat" | "speech";
}

export type ProviderTransportOptions =
  | OpenRouterProviderOptions
  | OllamaProviderOptions
  | GroqProviderOptions
  | CustomProviderOptions
  | NvidiaProviderOptions;

/**
 * Configuration for an AI Provider
 */
export interface ProviderConfig {
  id: string;
  type: ProviderType;
  name: string;
  enabled: boolean;
  apiKeyId?: string;
  modelId?: string;
  endpointMode: "native" | "openai-compatible" | "nvidia-nim";
  baseUrl?: string;
  apiKeyRequired?: boolean;
  defaultHeaders?: Record<string, string>;
  defaultQueryParams?: Record<string, string>;
  providerOptions?: ProviderTransportOptions;
  status?: "connected" | "error" | "disconnected" | "unknown";
  validationError?: string;
  lastValidated?: number;
  createdAt: number;
  updatedAt: number;
}

/**
 * Storage structure for provider configurations
 */
export interface ProviderConfigStorage {
  provider_configs: ProviderConfig[];
}

/**
 * Storage structure for encrypted provider API keys
 */
export interface ProviderKeyStorage {
  provider_keys: Record<string, EncryptedData>;
}
