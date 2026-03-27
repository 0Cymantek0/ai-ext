# Architecture Patterns: Multi-Provider AI Settings

**Domain:** Chrome Extension with Multi-Provider AI Integration
**Researched:** 2026-03-27
**Confidence:** HIGH (based on Vercel AI SDK patterns, existing codebase analysis, and OpenAI-compatible provider documentation)

## Recommended Architecture

### High-Level Architecture

```
+------------------+     +-------------------+     +------------------+
|   Side Panel     |     |   Service Worker  |     |   External APIs  |
|   Settings UI    |     |   (Background)    |     |                  |
+--------+---------+     +---------+---------+     +--------+---------+
         |                         |                        |
         |  SETTINGS_UPDATE        |                        |
         |------------------------>|                        |
         |                         |                        |
         |                         v                        |
         |               +---------+---------+              |
         |               |  Provider Router  |              |
         |               |  (New Component)  |              |
         |               +---------+---------+              |
         |                         |                        |
         |            +------------+------------+           |
         |            |            |            |           |
         |            v            v            v           |
         |     +------+----+ +-----+-----+ +----+------+    |
         |     |  Gemini   | |  OpenAI   | |  Anthropic|    |
         |     |  Adapter  | |  Adapter  | |  Adapter  |    |
         |     +------+----+ +-----+-----+ +----+------+    |
         |            |            |            |           |
         |            +------------+------------+           |
         |                         |                        |
         |                         |  HTTP Requests         |
         |                         |----------------------->|
         |                         |                        |
         |                         |  Streaming Responses   |
         |                         |<-----------------------|
         |                         |                        |
         |  AI_PROCESS_STREAM_*    |                        |
         |<------------------------|                        |
         +------------------+     +-------------------+     +------------------+
```

### Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `ProviderAdapter` (interface) | Abstract interface for all AI providers | Implemented by all adapters |
| `GeminiAdapter` | Google Gemini API integration (existing + new) | Provider Router, Google APIs |
| `OpenAIAdapter` | OpenAI GPT models integration | Provider Router, OpenAI APIs |
| `AnthropicAdapter` | Claude models integration | Provider Router, Anthropic APIs |
| `OpenRouterAdapter` | OpenRouter unified API | Provider Router, OpenRouter API |
| `OllamaAdapter` | Local Ollama models | Provider Router, localhost:11434 |
| `GroqAdapter` | Groq fast inference | Provider Router, Groq APIs |
| `CustomOpenAIAdapter` | User-defined OpenAI-compatible endpoints | Provider Router, Custom URL |
| `ProviderRouter` | Routes requests to correct adapter based on capability | Hybrid AI Engine, Adapters |
| `SettingsManager` | Manages encrypted API keys and preferences | chrome.storage.local, UI |
| `HybridAIEngine` (modified) | Delegates to ProviderRouter instead of direct CloudAIManager | ProviderRouter, AIManager |

### Data Flow

```
User Query
    |
    v
+---------------------+
| Streaming Handler   |
| (existing)          |
+----------+----------+
           |
           v
+---------------------+
| Mode-Aware          |
| Processor           |
| (existing)          |
+----------+----------+
           |
           v
+---------------------+
| Provider Router     |  <-- NEW: Gets capability config from settings
| (new)               |  <-- Selects adapter based on:
+----------+----------+      - Capability (chat/embedding/speech)
           |                 - User preferences
           |                 - Provider availability
           v
+---------------------+
| Provider Adapter    |  <-- NEW: Unified interface
| (selected)          |  <-- Handles provider-specific API
+----------+----------+
           |
           v
    External API
```

## Provider Adapter Pattern

### Interface Definition

```typescript
// src/background/providers/types.ts

/**
 * Capability types for per-capability routing
 */
export type AICapability = 'chat' | 'embedding' | 'speech' | 'vision';

/**
 * Provider identification
 */
export type ProviderId =
  | 'gemini-nano'      // Chrome Built-in AI (free, on-device)
  | 'gemini-cloud'     // Google Gemini Cloud
  | 'openai'           // OpenAI GPT models
  | 'anthropic'        // Anthropic Claude models
  | 'openrouter'       // OpenRouter unified API
  | 'ollama'           // Local Ollama
  | 'groq'             // Groq fast inference
  | 'nvidia-nim'       // NVIDIA NIM API
  | 'custom';          // User-defined OpenAI-compatible endpoint

/**
 * Provider configuration stored in settings
 */
export interface ProviderConfig {
  id: ProviderId;
  enabled: boolean;
  apiKey?: string;           // Encrypted when stored
  baseUrl?: string;          // For custom/Ollama endpoints
  defaultModel?: string;
  models?: ModelConfig[];
  capabilities: AICapability[];
  rateLimit?: {
    requestsPerMinute?: number;
    tokensPerMinute?: number;
  };
}

/**
 * Model configuration
 */
export interface ModelConfig {
  id: string;               // Model identifier (e.g., 'gpt-4', 'claude-3-opus')
  displayName: string;      // User-friendly name
  capabilities: AICapability[];
  contextWindow: number;
  maxOutputTokens: number;
  pricing?: {
    inputPer1k: number;
    outputPer1k: number;
  };
}

/**
 * Unified message format (Vercel AI SDK inspired)
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Provider adapter interface - all providers must implement
 */
export interface ProviderAdapter {
  readonly id: ProviderId;
  readonly name: string;

  // Lifecycle
  initialize(config: ProviderConfig): Promise<void>;
  isAvailable(): boolean;

  // Core capabilities
  chat(
    messages: ChatMessage[],
    options?: ChatOptions
  ): Promise<ChatResponse>;

  chatStream(
    messages: ChatMessage[],
    options?: ChatOptions
  ): AsyncGenerator<string, void, unknown>;

  embed?(
    texts: string[],
    options?: EmbedOptions
  ): Promise<EmbedResponse>;

  transcribe?(
    audio: Blob,
    options?: TranscribeOptions
  ): Promise<TranscribeResponse>;

  // Capability query
  supportsCapability(capability: AICapability): boolean;
  getModels(): ModelConfig[];

  // Health check
  healthCheck?(): Promise<boolean>;
}

/**
 * Chat options
 */
export interface ChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stopSequences?: string[];
  signal?: AbortSignal;
}

/**
 * Chat response
 */
export interface ChatResponse {
  content: string;
  model: string;
  tokensUsed?: {
    prompt: number;
    completion: number;
    total: number;
  };
  finishReason: 'stop' | 'length' | 'error';
  processingTimeMs: number;
}

/**
 * Embed options
 */
export interface EmbedOptions {
  model?: string;
  signal?: AbortSignal;
}

/**
 * Embed response
 */
export interface EmbedResponse {
  embeddings: number[][];
  model: string;
  tokensUsed?: number;
}

/**
 * Transcribe options
 */
export interface TranscribeOptions {
  language?: string;
  model?: string;
  signal?: AbortSignal;
}

/**
 * Transcribe response
 */
export interface TranscribeResponse {
  text: string;
  language?: string;
  duration?: number;
}
```

### Base Adapter Class

```typescript
// src/background/providers/base-adapter.ts

import type { ProviderAdapter, ProviderConfig, ChatOptions, ChatResponse, AICapability, ModelConfig } from './types';

/**
 * Abstract base class for provider adapters
 * Implements common functionality and provides hooks for provider-specific logic
 */
export abstract class BaseProviderAdapter implements ProviderAdapter {
  abstract readonly id: ProviderId;
  abstract readonly name: string;

  protected config: ProviderConfig | null = null;
  protected initialized = false;

  async initialize(config: ProviderConfig): Promise<void> {
    this.config = config;
    await this.onInitialize(config);
    this.initialized = true;
  }

  protected abstract onInitialize(config: ProviderConfig): Promise<void>;

  isAvailable(): boolean {
    return this.initialized && this.config?.enabled === true;
  }

  supportsCapability(capability: AICapability): boolean {
    return this.config?.capabilities.includes(capability) ?? false;
  }

  getModels(): ModelConfig[] {
    return this.config?.models ?? [];
  }

  // Abstract methods - must be implemented by concrete adapters
  abstract chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse>;
  abstract chatStream(messages: ChatMessage[], options?: ChatOptions): AsyncGenerator<string, void, unknown>;

  // Optional capabilities - override in subclasses
  async embed?(texts: string[], options?: EmbedOptions): Promise<EmbedResponse>;
  async transcribe?(audio: Blob, options?: TranscribeOptions): Promise<TranscribeResponse>;
  async healthCheck?(): Promise<boolean>;
}
```

### Concrete Adapter Examples

```typescript
// src/background/providers/openai-adapter.ts

import { BaseProviderAdapter } from './base-adapter';
import type { ProviderConfig, ChatMessage, ChatOptions, ChatResponse } from './types';

export class OpenAIAdapter extends BaseProviderAdapter {
  readonly id = 'openai' as const;
  readonly name = 'OpenAI';

  private client: OpenAI | null = null;

  protected async onInitialize(config: ProviderConfig): Promise<void> {
    if (!config.apiKey) {
      throw new Error('OpenAI API key required');
    }

    // Use dynamic import to avoid bundling issues
    const { default: OpenAI } = await import('openai');
    this.client = new OpenAI({
      apiKey: config.apiKey,
      dangerouslyAllowBrowser: true, // Required for extensions
    });
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    const startTime = performance.now();

    const response = await this.client!.chat.completions.create({
      model: options?.model ?? this.config?.defaultModel ?? 'gpt-4.1-mini',
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      temperature: options?.temperature,
      max_tokens: options?.maxTokens,
      top_p: options?.topP,
      stop: options?.stopSequences,
    });

    const choice = response.choices[0];

    return {
      content: choice.message.content ?? '',
      model: response.model,
      tokensUsed: {
        prompt: response.usage?.prompt_tokens ?? 0,
        completion: response.usage?.completion_tokens ?? 0,
        total: response.usage?.total_tokens ?? 0,
      },
      finishReason: choice.finish_reason === 'stop' ? 'stop' : 'length',
      processingTimeMs: performance.now() - startTime,
    };
  }

  async *chatStream(messages: ChatMessage[], options?: ChatOptions): AsyncGenerator<string, void, unknown> {
    const stream = await this.client!.chat.completions.create({
      model: options?.model ?? this.config?.defaultModel ?? 'gpt-4.1-mini',
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      temperature: options?.temperature,
      max_tokens: options?.maxTokens,
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        yield content;
      }
    }
  }

  async embed(texts: string[], options?: EmbedOptions): Promise<EmbedResponse> {
    const response = await this.client!.embeddings.create({
      model: options?.model ?? 'text-embedding-3-small',
      input: texts,
    });

    return {
      embeddings: response.data.map(d => d.embedding),
      model: response.model,
      tokensUsed: response.usage?.total_tokens,
    };
  }
}
```

```typescript
// src/background/providers/openrouter-adapter.ts

import { BaseProviderAdapter } from './base-adapter';
import type { ProviderConfig, ChatMessage, ChatOptions, ChatResponse } from './types';

/**
 * OpenRouter adapter - uses OpenAI-compatible API
 * Provides access to 100+ models through unified endpoint
 */
export class OpenRouterAdapter extends BaseProviderAdapter {
  readonly id = 'openrouter' as const;
  readonly name = 'OpenRouter';

  private baseUrl = 'https://openrouter.ai/api/v1';

  protected async onInitialize(config: ProviderConfig): Promise<void> {
    if (!config.apiKey) {
      throw new Error('OpenRouter API key required');
    }
    // No client initialization needed - uses fetch
  }

  private getHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.config!.apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'chrome-extension://ai-pocket', // For rankings
      'X-OpenRouter-Title': 'AI Pocket', // For rankings
    };
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    const startTime = performance.now();

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        model: options?.model ?? this.config?.defaultModel ?? 'openai/gpt-4.1-mini',
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        temperature: options?.temperature,
        max_tokens: options?.maxTokens,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenRouter error: ${response.status}`);
    }

    const data = await response.json();
    const choice = data.choices[0];

    return {
      content: choice.message.content ?? '',
      model: data.model,
      tokensUsed: {
        prompt: data.usage?.prompt_tokens ?? 0,
        completion: data.usage?.completion_tokens ?? 0,
        total: data.usage?.total_tokens ?? 0,
      },
      finishReason: choice.finish_reason === 'stop' ? 'stop' : 'length',
      processingTimeMs: performance.now() - startTime,
    };
  }

  async *chatStream(messages: ChatMessage[], options?: ChatOptions): AsyncGenerator<string, void, unknown> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        model: options?.model ?? this.config?.defaultModel ?? 'openai/gpt-4.1-mini',
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        temperature: options?.temperature,
        max_tokens: options?.maxTokens,
        stream: true,
      }),
    });

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(line => line.startsWith('data: '));

        for (const line of lines) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices[0]?.delta?.content;
            if (content) yield content;
          } catch {
            // Skip malformed JSON
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
```

```typescript
// src/background/providers/ollama-adapter.ts

import { BaseProviderAdapter } from './base-adapter';
import type { ProviderConfig, ChatMessage, ChatOptions, ChatResponse } from './types';

/**
 * Ollama adapter - local models via OpenAI-compatible API
 * Base URL defaults to localhost:11434
 */
export class OllamaAdapter extends BaseProviderAdapter {
  readonly id = 'ollama' as const;
  readonly name = 'Ollama (Local)';

  private baseUrl: string;

  protected async onInitialize(config: ProviderConfig): Promise<void> {
    // No API key needed for local Ollama
    this.baseUrl = config.baseUrl ?? 'http://localhost:11434/v1';
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    const startTime = performance.now();

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: options?.model ?? this.config?.defaultModel ?? 'llama3.2',
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        temperature: options?.temperature,
        max_tokens: options?.maxTokens,
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.status}`);
    }

    const data = await response.json();

    return {
      content: data.choices[0].message.content ?? '',
      model: data.model,
      tokensUsed: data.usage ? {
        prompt: data.usage.prompt_tokens ?? 0,
        completion: data.usage.completion_tokens ?? 0,
        total: data.usage.total_tokens ?? 0,
      } : undefined,
      finishReason: 'stop',
      processingTimeMs: performance.now() - startTime,
    };
  }

  async *chatStream(messages: ChatMessage[], options?: ChatOptions): AsyncGenerator<string, void, unknown> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: options?.model ?? this.config?.defaultModel ?? 'llama3.2',
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        temperature: options?.temperature,
        max_tokens: options?.maxTokens,
        stream: true,
      }),
    });

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(line => line.trim());

        for (const line of lines) {
          try {
            const data = JSON.parse(line);
            const content = data.choices[0]?.delta?.content;
            if (content) yield content;
          } catch {
            // Skip malformed JSON
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl.replace('/v1', '')}/api/tags`, {
        method: 'GET',
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
```

## Settings Storage Architecture

### Encryption Strategy

```typescript
// src/background/settings/encryption.ts

/**
 * AES-GCM encryption for API keys using Web Crypto API
 * Keys are derived from a device-specific secret stored in chrome.storage.session
 */

const ENCRYPTION_ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;
const IV_LENGTH = 12;
const SALT_LENGTH = 16;

/**
 * Get or create the master encryption key
 * Uses chrome.storage.session for temporary in-memory storage during session
 */
async function getMasterKey(): Promise<CryptoKey> {
  // Check if we have a stored key reference
  const session = await chrome.storage.session.get('encryptionKeyRef');

  if (session.encryptionKeyRef) {
    // Key exists in session - retrieve it
    // Note: We store the key material encrypted with a device-specific secret
    const deviceSecret = await getDeviceSecret();
    return await deriveKey(deviceSecret, session.encryptionKeyRef.salt);
  }

  // Create new key for this session
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const deviceSecret = await getDeviceSecret();
  const key = await deriveKey(deviceSecret, salt);

  // Store reference (not the key itself)
  await chrome.storage.session.set({
    encryptionKeyRef: { salt: Array.from(salt) }
  });

  return key;
}

/**
 * Get device-specific secret
 * Uses extension ID + installation time as unique identifier
 */
async function getDeviceSecret(): Promise<string> {
  const stored = await chrome.storage.local.get('deviceSecret');

  if (stored.deviceSecret) {
    return stored.deviceSecret;
  }

  // Generate new device secret on first run
  const secret = crypto.randomUUID();
  await chrome.storage.local.set({ deviceSecret: secret });
  return secret;
}

/**
 * Derive encryption key from secret and salt
 */
async function deriveKey(secret: string, salt: number[] | Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );

  const saltArray = salt instanceof Uint8Array ? salt : new Uint8Array(salt);

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltArray,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: ENCRYPTION_ALGORITHM, length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt API key for storage
 */
export async function encryptApiKey(plaintext: string): Promise<string> {
  const key = await getMasterKey();
  const encoder = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  const encrypted = await crypto.subtle.encrypt(
    { name: ENCRYPTION_ALGORITHM, iv },
    key,
    encoder.encode(plaintext)
  );

  // Combine IV + encrypted data, base64 encode
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);

  return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypt API key from storage
 */
export async function decryptApiKey(ciphertext: string): Promise<string> {
  const key = await getMasterKey();
  const combined = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0));

  const iv = combined.slice(0, IV_LENGTH);
  const encrypted = combined.slice(IV_LENGTH);

  const decrypted = await crypto.subtle.decrypt(
    { name: ENCRYPTION_ALGORITHM, iv },
    key,
    encrypted
  );

  return new TextDecoder().decode(decrypted);
}
```

### Settings Schema

```typescript
// src/background/settings/types.ts

import type { ProviderId, AICapability } from '../providers/types';

/**
 * Settings stored in chrome.storage.local (encrypted where marked)
 */
export interface AppSettings {
  version: number;  // Schema version for migrations

  // Per-capability provider routing
  routing: {
    chat: RoutingConfig;
    embedding: RoutingConfig;
    speech: RoutingConfig;
    vision: RoutingConfig;
  };

  // Provider configurations
  providers: Record<ProviderId, ProviderSettings>;

  // UI preferences
  ui: {
    showTokenCounts: boolean;
    showProviderBadges: boolean;
    confirmBeforeCloud: boolean;
  };
}

/**
 * Routing configuration for a capability
 */
export interface RoutingConfig {
  primary: ProviderId;          // Primary provider for this capability
  fallback?: ProviderId;        // Fallback if primary fails
  modelOverrides?: Record<string, string>;  // Pocket-specific model overrides
}

/**
 * Provider-specific settings
 */
export interface ProviderSettings {
  enabled: boolean;
  apiKey?: string;              // ENCRYPTED when stored
  baseUrl?: string;             // For custom/Ollama providers
  defaultModel?: string;
  customModels?: CustomModelConfig[];
  lastUsed?: number;
  healthStatus?: 'healthy' | 'unhealthy' | 'unknown';
}

/**
 * Custom model configuration (user-added)
 */
export interface CustomModelConfig {
  id: string;
  displayName: string;
  contextWindow: number;
  capabilities: AICapability[];
}

/**
 * Default settings
 */
export const DEFAULT_SETTINGS: AppSettings = {
  version: 1,
  routing: {
    chat: { primary: 'gemini-nano', fallback: 'gemini-cloud' },
    embedding: { primary: 'gemini-cloud' },
    speech: { primary: 'openai' },
    vision: { primary: 'gemini-cloud' },
  },
  providers: {
    'gemini-nano': { enabled: true },
    'gemini-cloud': { enabled: true },
    'openai': { enabled: false },
    'anthropic': { enabled: false },
    'openrouter': { enabled: false },
    'ollama': { enabled: false },
    'groq': { enabled: false },
    'nvidia-nim': { enabled: false },
    'custom': { enabled: false },
  },
  ui: {
    showTokenCounts: true,
    showProviderBadges: true,
    confirmBeforeCloud: true,
  },
};
```

### Settings Manager

```typescript
// src/background/settings/manager.ts

import type { AppSettings, ProviderSettings, RoutingConfig } from './types';
import { DEFAULT_SETTINGS } from './types';
import { encryptApiKey, decryptApiKey } from './encryption';
import type { ProviderId, AICapability } from '../providers/types';

const STORAGE_KEY = 'appSettings';

/**
 * Settings manager - handles encrypted storage and retrieval
 */
export class SettingsManager {
  private settings: AppSettings | null = null;
  private initialized = false;

  /**
   * Initialize settings from storage
   */
  async initialize(): Promise<void> {
    const stored = await chrome.storage.local.get(STORAGE_KEY);

    if (stored[STORAGE_KEY]) {
      this.settings = await this.migrateSettings(stored[STORAGE_KEY]);
    } else {
      this.settings = { ...DEFAULT_SETTINGS };
      await this.save();
    }

    this.initialized = true;
  }

  /**
   * Get current settings
   */
  getSettings(): AppSettings {
    if (!this.initialized || !this.settings) {
      throw new Error('SettingsManager not initialized');
    }
    return { ...this.settings };
  }

  /**
   * Update provider settings
   */
  async updateProvider(providerId: ProviderId, settings: Partial<ProviderSettings>): Promise<void> {
    if (!this.settings) return;

    // Encrypt API key if provided
    if (settings.apiKey && settings.apiKey !== '') {
      settings.apiKey = await encryptApiKey(settings.apiKey);
    }

    this.settings.providers[providerId] = {
      ...this.settings.providers[providerId],
      ...settings,
    };

    await this.save();
  }

  /**
   * Get decrypted API key for a provider
   */
  async getDecryptedApiKey(providerId: ProviderId): Promise<string | null> {
    const provider = this.settings?.providers[providerId];
    if (!provider?.apiKey) return null;

    try {
      return await decryptApiKey(provider.apiKey);
    } catch (error) {
      console.error(`Failed to decrypt API key for ${providerId}:`, error);
      return null;
    }
  }

  /**
   * Update routing configuration
   */
  async updateRouting(capability: AICapability, config: RoutingConfig): Promise<void> {
    if (!this.settings) return;

    this.settings.routing[capability] = config;
    await this.save();
  }

  /**
   * Get provider for a capability
   */
  getProviderForCapability(capability: AICapability): ProviderId {
    return this.settings?.routing[capability]?.primary ?? 'gemini-nano';
  }

  /**
   * Save settings to storage
   */
  private async save(): Promise<void> {
    await chrome.storage.local.set({ [STORAGE_KEY]: this.settings });
  }

  /**
   * Migrate settings to current version
   */
  private async migrateSettings(stored: any): Promise<AppSettings> {
    let settings = stored;

    // Version 0 -> 1: Initial migration
    if (!settings.version || settings.version < 1) {
      settings = {
        ...DEFAULT_SETTINGS,
        ...settings,
        version: 1,
      };
    }

    // Future migrations go here...

    return settings;
  }
}

// Singleton
export const settingsManager = new SettingsManager();
```

## Routing Architecture

### Provider Router

```typescript
// src/background/providers/router.ts

import type { ProviderAdapter, ProviderId, AICapability, ChatMessage, ChatOptions, ChatResponse } from './types';
import { settingsManager } from '../settings/manager';
import { GeminiAdapter } from './gemini-adapter';
import { OpenAIAdapter } from './openai-adapter';
import { AnthropicAdapter } from './anthropic-adapter';
import { OpenRouterAdapter } from './openrouter-adapter';
import { OllamaAdapter } from './ollama-adapter';
import { GroqAdapter } from './groq-adapter';
import { GeminiNanoAdapter } from './gemini-nano-adapter';

/**
 * Provider router - routes requests to correct adapter
 */
export class ProviderRouter {
  private adapters: Map<ProviderId, ProviderAdapter> = new Map();
  private initialized = false;

  /**
   * Initialize all adapters with their configurations
   */
  async initialize(): Promise<void> {
    await settingsManager.initialize();
    const settings = settingsManager.getSettings();

    // Register all adapters
    this.registerAdapter(new GeminiNanoAdapter());   // Chrome Built-in AI
    this.registerAdapter(new GeminiAdapter());       // Google Gemini Cloud
    this.registerAdapter(new OpenAIAdapter());
    this.registerAdapter(new AnthropicAdapter());
    this.registerAdapter(new OpenRouterAdapter());
    this.registerAdapter(new OllamaAdapter());
    this.registerAdapter(new GroqAdapter());

    // Initialize each enabled adapter
    for (const [providerId, adapter] of this.adapters) {
      const providerSettings = settings.providers[providerId];
      if (providerSettings?.enabled) {
        const apiKey = await settingsManager.getDecryptedApiKey(providerId);
        await adapter.initialize({
          id: providerId,
          enabled: true,
          apiKey: apiKey ?? undefined,
          baseUrl: providerSettings.baseUrl,
          defaultModel: providerSettings.defaultModel,
        });
      }
    }

    this.initialized = true;
  }

  /**
   * Register an adapter
   */
  private registerAdapter(adapter: ProviderAdapter): void {
    this.adapters.set(adapter.id, adapter);
  }

  /**
   * Get adapter for a capability
   */
  getAdapterForCapability(capability: AICapability): ProviderAdapter {
    const settings = settingsManager.getSettings();
    const routing = settings.routing[capability];
    const primaryId = routing.primary;

    const adapter = this.adapters.get(primaryId);

    if (!adapter || !adapter.isAvailable()) {
      // Try fallback
      if (routing.fallback) {
        const fallback = this.adapters.get(routing.fallback);
        if (fallback?.isAvailable()) {
          return fallback;
        }
      }

      // Ultimate fallback to Gemini Nano
      const nanoAdapter = this.adapters.get('gemini-nano');
      if (nanoAdapter?.isAvailable()) {
        return nanoAdapter;
      }

      throw new Error(`No available adapter for capability: ${capability}`);
    }

    return adapter;
  }

  /**
   * Chat with automatic routing
   */
  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    const adapter = this.getAdapterForCapability('chat');
    return adapter.chat(messages, options);
  }

  /**
   * Chat stream with automatic routing
   */
  async *chatStream(messages: ChatMessage[], options?: ChatOptions): AsyncGenerator<string, void, unknown> {
    const adapter = this.getAdapterForCapability('chat');
    yield* adapter.chatStream(messages, options);
  }

  /**
   * Generate embeddings with automatic routing
   */
  async embed(texts: string[], options?: EmbedOptions): Promise<EmbedResponse> {
    const adapter = this.getAdapterForCapability('embedding');
    if (!adapter.embed) {
      throw new Error(`Provider ${adapter.id} does not support embeddings`);
    }
    return adapter.embed(texts, options);
  }

  /**
   * Transcribe audio with automatic routing
   */
  async transcribe(audio: Blob, options?: TranscribeOptions): Promise<TranscribeResponse> {
    const adapter = this.getAdapterForCapability('speech');
    if (!adapter.transcribe) {
      throw new Error(`Provider ${adapter.id} does not support transcription`);
    }
    return adapter.transcribe(audio, options);
  }

  /**
   * Get all available providers
   */
  getAvailableProviders(): ProviderId[] {
    return Array.from(this.adapters.entries())
      .filter(([_, adapter]) => adapter.isAvailable())
      .map(([id]) => id);
  }

  /**
   * Reload adapter configurations (after settings change)
   */
  async reload(): Promise<void> {
    await this.initialize();
  }
}

// Singleton
export const providerRouter = new ProviderRouter();
```

### Integration with HybridAIEngine

```typescript
// src/background/hybrid-ai-engine.ts (modifications)

import { providerRouter } from './providers/router';
import { settingsManager } from './settings/manager';
import type { ProviderId, AICapability } from './providers/types';

export class HybridAIEngine {
  // ... existing properties ...

  private providerRouter: ProviderRouter;

  constructor(aiManager: AIManager, cloudAIManager?: CloudAIManager) {
    this.aiManager = aiManager;
    this.providerRouter = providerRouter;
    // CloudAIManager becomes just one of many adapters
    // Kept for backward compatibility during migration
    this.cloudAIManager = cloudAIManager || new CloudAIManager();
    this.taskClassifier = new TaskClassifier();
    this.capabilityDetector = new DeviceCapabilityDetector();
  }

  /**
   * Initialize the engine with provider router
   */
  async initialize(): Promise<void> {
    await this.providerRouter.initialize();
  }

  /**
   * Process content with multi-provider support
   */
  async processContent(
    task: Task,
    options?: Partial<ProcessingOptions>,
    onConsentRequired?: (decision: ProcessingDecision) => Promise<boolean>,
  ): Promise<AIResponse> {
    // Determine capability from task
    const capability = this.mapOperationToCapability(task.operation);

    // Check if consent needed for non-local providers
    const settings = settingsManager.getSettings();
    const providerId = settings.routing[capability].primary;

    if (providerId !== 'gemini-nano' && settings.ui.confirmBeforeCloud) {
      if (onConsentRequired) {
        const granted = await onConsentRequired({
          location: this.mapProviderToLocation(providerId),
          reason: `Using ${providerId} for ${capability}`,
          requiresConsent: true,
          estimatedTokens: this.taskClassifier.estimateTokens(task.content),
          complexity: this.taskClassifier.classifyTask(task),
        });
        if (!granted) {
          // Fallback to local
          return this.processLocally(task, options);
        }
      }
    }

    // Build messages from task
    const messages = this.buildMessages(task);

    // Use provider router for actual processing
    const response = await this.providerRouter.chat(messages, {
      model: options?.model,
      temperature: options?.temperature,
      maxTokens: options?.maxTokens,
      signal: options?.signal,
    });

    return {
      result: response.content,
      source: this.mapProviderToSource(providerId),
      confidence: 0.9,
      processingTime: response.processingTimeMs,
      tokensUsed: response.tokensUsed?.total,
    };
  }

  /**
   * Stream content with multi-provider support
   */
  async *processContentStreaming(
    task: Task,
    options?: Partial<ProcessingOptions>,
    onConsentRequired?: (decision: ProcessingDecision) => Promise<boolean>,
  ): AsyncGenerator<string, void, unknown> {
    const capability = this.mapOperationToCapability(task.operation);
    const settings = settingsManager.getSettings();
    const providerId = settings.routing[capability].primary;

    // Consent check (same as above)
    if (providerId !== 'gemini-nano' && settings.ui.confirmBeforeCloud) {
      if (onConsentRequired) {
        const granted = await onConsentRequired({
          location: this.mapProviderToLocation(providerId),
          reason: `Using ${providerId} for ${capability}`,
          requiresConsent: true,
          estimatedTokens: this.taskClassifier.estimateTokens(task.content),
          complexity: this.taskClassifier.classifyTask(task),
        });
        if (!granted) {
          yield* this.processLocallyStreaming(task, options);
          return;
        }
      }
    }

    // Build messages and stream
    const messages = this.buildMessages(task);
    yield* this.providerRouter.chatStream(messages, options);
  }

  /**
   * Map task operation to capability
   */
  private mapOperationToCapability(operation: TaskOperation): AICapability {
    switch (operation) {
      case TaskOperation.EMBED:
        return 'embedding';
      case TaskOperation.TRANSCRIBE:
        return 'speech';
      case TaskOperation.ALT_TEXT:
      case TaskOperation.ANALYZE:
        return 'vision';
      default:
        return 'chat';
    }
  }

  // ... rest of existing methods, adapted to use providerRouter ...
}
```

## Message Passing Changes

### New Message Types

```typescript
// Add to src/shared/types/index.d.ts

export type MessageKind =
  // ... existing types ...
  | "SETTINGS_GET"
  | "SETTINGS_UPDATE"
  | "SETTINGS_UPDATE_PROVIDER"
  | "SETTINGS_UPDATE_ROUTING"
  | "SETTINGS_TEST_PROVIDER"
  | "SETTINGS_GET_MODELS"
  | "PROVIDER_HEALTH_CHECK";

// New payload types

export interface SettingsGetPayload {
  // No payload needed
}

export interface SettingsGetResponsePayload {
  success: boolean;
  settings?: AppSettings;
  error?: string;
}

export interface SettingsUpdatePayload {
  settings: Partial<AppSettings>;
}

export interface SettingsUpdateProviderPayload {
  providerId: ProviderId;
  settings: Partial<ProviderSettings>;
}

export interface SettingsUpdateRoutingPayload {
  capability: AICapability;
  config: RoutingConfig;
}

export interface SettingsTestProviderPayload {
  providerId: ProviderId;
}

export interface SettingsTestProviderResponsePayload {
  success: boolean;
  latency?: number;
  error?: string;
}

export interface SettingsGetModelsPayload {
  providerId: ProviderId;
}

export interface SettingsGetModelsResponsePayload {
  success: boolean;
  models?: ModelConfig[];
  error?: string;
}
```

### Message Handlers

```typescript
// Add to src/background/service-worker.ts

import { settingsManager } from './settings/manager';
import { providerRouter } from './providers/router';

// In message handler switch:
case "SETTINGS_GET":
  return handleSettingsGet();

case "SETTINGS_UPDATE_PROVIDER":
  return handleSettingsUpdateProvider(message.payload);

case "SETTINGS_UPDATE_ROUTING":
  return handleSettingsUpdateRouting(message.payload);

case "SETTINGS_TEST_PROVIDER":
  return handleSettingsTestProvider(message.payload);

case "SETTINGS_GET_MODELS":
  return handleSettingsGetModels(message.payload);

// Handler implementations

async function handleSettingsGet(): Promise<SettingsGetResponsePayload> {
  try {
    const settings = settingsManager.getSettings();
    // Mask API keys before sending to UI
    const masked = maskApiKeys(settings);
    return { success: true, settings: masked };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

async function handleSettingsUpdateProvider(
  payload: SettingsUpdateProviderPayload
): Promise<ApiResponse> {
  try {
    await settingsManager.updateProvider(payload.providerId, payload.settings);

    // Reinitialize the adapter if it was enabled
    if (payload.settings.enabled || payload.settings.apiKey) {
      await providerRouter.reload();
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

async function handleSettingsTestProvider(
  payload: SettingsTestProviderPayload
): Promise<SettingsTestProviderResponsePayload> {
  try {
    const start = performance.now();
    const adapter = providerRouter.getAdapterForCapability('chat');
    const healthy = await adapter.healthCheck?.() ?? true;
    const latency = performance.now() - start;

    return { success: healthy, latency };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

function maskApiKeys(settings: AppSettings): AppSettings {
  const masked = { ...settings };
  for (const providerId of Object.keys(masked.providers) as ProviderId[]) {
    if (masked.providers[providerId].apiKey) {
      masked.providers[providerId].apiKey = '••••••••';
    }
  }
  return masked;
}
```

## Build Order Implications

### Phase 1: Foundation (Must Build First)

1. **Provider Types** (`src/background/providers/types.ts`)
   - Define all interfaces and types
   - No dependencies
   - Required by all other provider code

2. **Base Adapter** (`src/background/providers/base-adapter.ts`)
   - Depends on: types
   - Required by: all concrete adapters

3. **Encryption Module** (`src/background/settings/encryption.ts`)
   - No dependencies (uses Web Crypto API)
   - Required by: SettingsManager

4. **Settings Types** (`src/background/settings/types.ts`)
   - Depends on: provider types
   - Required by: SettingsManager

### Phase 2: Core Components

5. **Settings Manager** (`src/background/settings/manager.ts`)
   - Depends on: encryption, settings types
   - Required by: ProviderRouter, message handlers

6. **GeminiNanoAdapter** (`src/background/providers/gemini-nano-adapter.ts`)
   - Depends on: base adapter, existing AIManager
   - Wraps existing Chrome Built-in AI

7. **GeminiAdapter** (`src/background/providers/gemini-adapter.ts`)
   - Depends on: base adapter
   - Wraps existing CloudAIManager

### Phase 3: Additional Providers

8. **OpenAIAdapter** - Standard OpenAI API
9. **AnthropicAdapter** - Claude API
10. **OpenRouterAdapter** - OpenAI-compatible unified API
11. **OllamaAdapter** - Local models
12. **GroqAdapter** - Fast inference

### Phase 4: Integration

13. **Provider Router** (`src/background/providers/router.ts`)
    - Depends on: all adapters, settings manager
    - Central routing component

14. **HybridAIEngine Modifications**
    - Depends on: provider router
    - Modify existing engine to use router

15. **Message Handlers** (in service-worker.ts)
    - Depends on: settings manager, provider router
    - Add new message types

### Phase 5: UI

16. **Settings UI Components** (in sidepanel)
    - Depends on: message types
    - Provider configuration interface

### Dependency Graph

```
types.ts
    |
    v
base-adapter.ts ---> gemini-nano-adapter.ts ---+
    |                gemini-adapter.ts ---------+--+
    |                openai-adapter.ts ---------+--+
    |                anthropic-adapter.ts ------+--+
    |                openrouter-adapter.ts -----+--+
    |                ollama-adapter.ts ---------+--+
    |                groq-adapter.ts -----------+--+
    |                                             |
    v                                             |
encryption.ts                                     |
    |                                             |
    v                                             |
settings/types.ts                                 |
    |                                             |
    v                                             |
settings/manager.ts ----------------------------->+
    |                                             |
    +---------------------------------------------+
    |                                             |
    v                                             v
providers/router.ts --------------------------> hybrid-ai-engine.ts (modified)
    |
    v
service-worker.ts (message handlers)
    |
    v
sidepanel/SettingsUI.tsx
```

## Anti-Patterns to Avoid

### Anti-Pattern 1: Storing API Keys Unencrypted

**What goes wrong:** API keys in plaintext are accessible to any code running in the extension context or through storage inspection.

**Why it happens:** Simplicity, time pressure, forgetting security requirements.

**Consequences:** User API keys compromised, potential financial liability.

**Prevention:** Always use the encryption module. Never log or expose API keys.

**Detection:** Code review checklist: "Are there any `chrome.storage.local.set` calls with `apiKey` that don't go through `encryptApiKey`?"

### Anti-Pattern 2: Hardcoding Provider Selection

**What goes wrong:** Provider selection logic scattered throughout codebase makes it impossible to change providers without code changes.

**Why it happens:** Quick prototyping, not planning for multi-provider from start.

**Consequences:** Technical debt, difficult to add new providers, user frustration.

**Prevention:** Always route through ProviderRouter. Use capability-based routing.

**Instead:** Use `providerRouter.getAdapterForCapability('chat')` instead of direct adapter instantiation.

### Anti-Pattern 3: Synchronous Settings Access

**What goes wrong:** Accessing settings synchronously during initialization before they're loaded.

**Why it happens:** Not properly awaiting initialization, assuming settings exist.

**Consequences:** Undefined behavior, crashes, wrong provider used.

**Prevention:** Always await `settingsManager.initialize()` before accessing settings.

```typescript
// BAD
const settings = settingsManager.getSettings(); // May throw!

// GOOD
await settingsManager.initialize();
const settings = settingsManager.getSettings();
```

### Anti-Pattern 4: Not Handling Adapter Unavailability

**What goes wrong:** Assuming adapter is available without checking, leading to runtime errors.

**Why it happens:** Development environment has all providers configured, forgetting production reality.

**Consequences:** Crashes when user hasn't configured provider, poor UX.

**Prevention:** Always check `adapter.isAvailable()` before use. Implement fallback chains.

```typescript
// BAD
const adapter = adapters.get('openai');
await adapter.chat(messages); // May fail if not configured

// GOOD
const adapter = providerRouter.getAdapterForCapability('chat'); // Handles fallbacks
```

## Scalability Considerations

| Concern | At 100 users | At 10K users | At 1M users |
|---------|--------------|--------------|-------------|
| **Provider switching latency** | Negligible | < 10ms | < 50ms (may need caching) |
| **Settings storage** | < 10KB | < 100MB total | < 10GB total |
| **Encryption overhead** | < 5ms per operation | < 5ms per operation | Consider Web Workers |
| **Provider health checks** | On-demand | Periodic background | Distributed health monitoring |
| **Model list fetching** | On settings open | Cache for session | CDN-cached model lists |

## Sources

- **Vercel AI SDK Provider Management** - https://sdk.vercel.ai/docs/ai-sdk-core/provider-management (HIGH confidence - official docs)
- **OpenRouter API Documentation** - https://openrouter.ai/docs (HIGH confidence - official docs)
- **Groq OpenAI Compatibility** - https://console.groq.com/docs/openai (HIGH confidence - official docs)
- **LangChain.js Architecture** - https://js.langchain.com/docs/introduction/ (HIGH confidence - official docs)
- **Anthropic Models Reference** - https://docs.anthropic.com/en/docs/about-claude/models (HIGH confidence - official docs)
- **Web Crypto API** - MDN Web Docs (MEDIUM confidence - standard API)
- **Chrome Storage API** - Chrome Extension Documentation (HIGH confidence - official docs)
- **Existing Codebase** - hybrid-ai-engine.ts, cloud-ai-manager.ts (HIGH confidence - direct analysis)
