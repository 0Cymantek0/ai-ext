import type { EncryptedData } from "./crypto-manager.js";

/**
 * Supported AI Provider Types
 */
export type ProviderType = 
  | "openai"
  | "anthropic"
  | "google"
  | "openrouter"
  | "ollama"
  | "groq"
  | "nvidia"
  | "custom";

/**
 * Configuration for an AI Provider
 */
export interface ProviderConfig {
  id: string;
  type: ProviderType;
  name: string;
  enabled: boolean;
  apiKeyId?: string;
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
