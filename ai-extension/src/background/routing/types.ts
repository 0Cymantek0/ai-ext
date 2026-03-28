export type CapabilityType = 'chat' | 'embeddings' | 'speech';

export interface RoutingPreferences {
  chat: string | null;
  embeddings: string | null;
  speech: string | null;
  fallbackChain: string[];
  routingMode: 'auto' | 'manual';
  triggerWords: Record<string, string>;
  providerParameters: Record<string, Record<string, any>>;
}

export class EmbeddingProviderSwitchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmbeddingProviderSwitchError';
  }
}

export interface ModelTier {
  cost: 'free' | 'low' | 'medium' | 'high';
  speed: 'fast' | 'medium' | 'slow';
  quality: 'basic' | 'advanced' | 'expert';
}

export interface ModelCapabilities {
  supportsVision: boolean;
  contextWindow: number;
  maxOutputTokens: number;
  supportsImageAnalysis: boolean;
  supportsVideoAnalysis: boolean;
  supportsAudioAnalysis: boolean;
}

export interface ModelSheetEntry {
  modelId: string;
  providerId: string;
  providerType: string;
  enabled: boolean;
  capabilities: ModelCapabilities;
  tier: ModelTier;
}

export const CATALOG_VERSION = 1;
