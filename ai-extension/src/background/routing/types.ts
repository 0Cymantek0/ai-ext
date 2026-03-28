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
  /** Whether the model supports transcription (speech-to-text) */
  supportsTranscription: boolean;
  /** Whether the model can translate speech input */
  supportsTranslation: boolean;
  /** Whether the model accepts audio input for processing */
  supportsAudioInput: boolean;
  /** Whether the model can produce word-level timestamps */
  supportsWordTimestamps: boolean;
}

export interface ModelSheetEntry {
  modelId: string;
  providerId: string;
  providerType: string;
  enabled: boolean;
  capabilities: ModelCapabilities;
  tier: ModelTier;
}

/**
 * Timestamp granularity options for STT providers.
 * - 'none': No timestamps in output
 * - 'segment': Segment-level timestamps
 * - 'word': Word-level timestamps
 */
export type TimestampGranularity = 'none' | 'segment' | 'word';

/**
 * Provider-aware advanced options for STT providers.
 * These are gated by provider capability and only surfaced
 * when the provider supports the corresponding feature.
 */
export interface SpeechProviderAdvancedOptions {
  /** Enable translation mode (output in English) — supported by OpenAI Whisper, Groq */
  enableTranslation?: boolean;
  /** Enable speaker diarization — supported by NVIDIA Parakeet */
  enableDiarization?: boolean;
  /** Temperature for transcription sampling (0-1) */
  temperature?: number;
  /** Optional prompt/context to guide transcription style */
  prompt?: string;
}

/**
 * Configuration for a speech-to-text provider.
 * Typed contract for persisting STT provider choices
 * independently of chat/embeddings provider selections.
 */
export interface SpeechProviderConfig {
  /** The provider ID referencing a configured provider */
  providerId: string;
  /** The model ID to use for transcription (e.g., 'whisper-1', 'gpt-4o-transcribe') */
  modelId: string;
}

/**
 * Full speech settings persisted in storage.
 * Includes provider selection, model, language, and
 * provider-aware advanced options.
 */
export interface SpeechSettings {
  /** The selected STT provider and model */
  provider: SpeechProviderConfig;
  /** Language code for transcription (e.g., 'en', 'es', 'fr') */
  language: string;
  /** Timestamp granularity level */
  timestampGranularity: 'none' | 'segment' | 'word';
  /** Provider-specific advanced options, only applied when supported */
  advancedOptions: SpeechProviderAdvancedOptions;
}

export const CATALOG_VERSION = 1;
