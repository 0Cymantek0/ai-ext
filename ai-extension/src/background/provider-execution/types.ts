import type { CapabilityType } from "../routing/types.js";
import type { ProviderType } from "../provider-types.js";
import type { BaseProviderAdapter } from "../adapters/base-adapter.js";
import type { Task } from "../hybrid-ai-engine.js";

export interface ProviderExecutionMetadata {
  providerId: string;
  providerType: string;
  modelId: string;
  attemptedProviderIds: string[];
  fallbackFromProviderId?: string;
  fallbackOccurred: boolean;
}

export interface ResolvedProviderExecution {
  capability: CapabilityType;
  adapter: BaseProviderAdapter;
  metadata: ProviderExecutionMetadata;
}

export interface ProviderTextRequest {
  prompt: string;
  task: Task;
  signal?: AbortSignal;
  maxOutputTokens?: number;
  providerId?: string;
  modelId?: string;
}

export interface ProviderTextResult {
  text: string;
  usage: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  metadata: ProviderExecutionMetadata;
}

export interface ProviderStreamRequest {
  prompt: string;
  task: Task;
  signal?: AbortSignal;
  maxOutputTokens?: number;
  providerId?: string;
  modelId?: string;
}

export interface ProviderAudioRequest {
  audio: Blob;
  fileName: string;
  mimeType: string;
}

export interface ProviderAudioWordTimestamp {
  word: string;
  start: number;
  end: number;
}

export interface ProviderAudioSegment {
  id?: number;
  start: number;
  end: number;
  text: string;
  words?: ProviderAudioWordTimestamp[];
  speaker?: string | number;
}

export interface ProviderAudioResult {
  text: string;
  providerId: string;
  modelId: string;
  language: string;
  rawResponse: unknown;
  segments?: ProviderAudioSegment[];
  words?: ProviderAudioWordTimestamp[];
}
