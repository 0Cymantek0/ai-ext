# Technology Stack: Multi-Provider Settings

**Project:** AI Pocket - Multi-Provider Settings
**Researched:** 2026-03-27
**Mode:** Ecosystem

## Recommended Stack

### Core Abstraction Layer

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Vercel AI SDK | 4.2+ | Unified multi-provider abstraction | Single API for all LLM providers with streaming, chat completions, and transcription. Already in codebase (ai 5.0.81). Eliminates need to learn each provider's SDK. OpenAI-compatible pattern built-in. |

**Confidence:** HIGH - Official documentation, actively maintained, production-ready.

### LLM Provider SDKs

| Provider | Package | Version | Integration Pattern | Confidence |
|----------|---------|---------|---------------------|------------|
| OpenAI | `@ai-sdk/openai` | Latest (0.x) | Vercel AI SDK provider | HIGH |
| Anthropic | `@ai-sdk/anthropic` | Latest (0.x) | Vercel AI SDK provider | HIGH |
| Google Gemini | `@ai-sdk/google` | Latest (0.x) | Vercel AI SDK provider (replaces direct @google/generative-ai for chat) | HIGH |
| Groq | `@ai-sdk/groq` | Latest (0.x) | Vercel AI SDK provider with transcription support | HIGH |
| OpenRouter | `@ai-sdk/openai` | Latest (0.x) | OpenAI SDK with `baseURL: 'https://openrouter.ai/api/v1'` | HIGH |
| Ollama | `ollama-ai-provider` | Latest (0.x) | Community Vercel AI SDK provider | MEDIUM |
| Gemini Nano | `chrome-ai` | Latest (0.x) | Community Vercel AI SDK provider for Chrome Built-in AI | MEDIUM |
| NVIDIA NIM | Direct REST | N/A | No JS SDK - use fetch with OpenAI-compatible endpoints | MEDIUM |
| Custom Endpoints | `@ai-sdk/openai` | Latest (0.x) | OpenAI SDK with custom `baseURL` | HIGH |

### Speech-to-Text Providers

| Provider | Package | Approach | Notes |
|----------|---------|----------|-------|
| OpenAI Whisper | `@ai-sdk/openai` | `transcribe()` method | Part of OpenAI provider |
| Groq Whisper | `@ai-sdk/groq` | `transcribe()` method | Fast transcription via Groq API |
| NVIDIA Parakeet | Direct REST | POST to NIM endpoint | No SDK, OpenAI-compatible format |

### Encryption for API Keys

| Technology | Purpose | Why |
|------------|---------|-----|
| Web Crypto API | Encryption primitive | Native browser API, no dependencies, MV3 compatible, hardware-accelerated |
| AES-GCM | Encryption algorithm | Authenticated encryption, standard for key storage |
| PBKDF2 | Key derivation | Derives encryption key from user passphrase or extension ID |
| chrome.storage.local | Encrypted storage | Device-only, no sync, persists across sessions |

**Implementation pattern:**
```typescript
// Key derivation from extension ID (deterministic, device-specific)
const keyMaterial = await crypto.subtle.importKey(
  'raw',
  new TextEncoder().encode(chrome.runtime.id),
  'PBKDF2',
  false,
  ['deriveKey']
);

const encryptionKey = await crypto.subtle.deriveKey(
  { name: 'PBKDF2', salt: new Uint8Array(16), iterations: 100000, hash: 'SHA-256' },
  keyMaterial,
  { name: 'AES-GCM', length: 256 },
  false,
  ['encrypt', 'decrypt']
);

// Encrypt API key
const iv = crypto.getRandomValues(new Uint8Array(12));
const encrypted = await crypto.subtle.encrypt(
  { name: 'AES-GCM', iv },
  encryptionKey,
  new TextEncoder().encode(apiKey)
);
```

**Confidence:** HIGH - Web Crypto API is stable, well-documented, standard browser feature.

### Settings UI Components

| Component | Library | Why |
|-----------|---------|-----|
| Provider Cards | shadcn/ui Card | Already in codebase, consistent styling |
| Model Selector | shadcn/ui Select + Radix UI | Already using @radix-ui/react-select |
| API Key Input | shadcn/ui Input with password toggle | Built-in, customize with eye icon |
| Capability Router | Custom with shadcn/ui RadioGroup | Per-capability routing UI |
| Provider Status | Lucide icons (existing) | Check/X icons for connection status |
| Form Validation | Zod (already in codebase) | Runtime validation for API keys |

**UI Pattern:**
```
Settings
  |-- Provider List (Card per provider)
  |     |-- Provider Name + Status Icon
  |     |-- API Key Input (encrypted on save)
  |     |-- Model Selector (dropdown)
  |     |-- Test Connection Button
  |
  |-- Capability Routing
        |-- Chat: [Provider Dropdown]
        |-- Embeddings: [Provider Dropdown]
        |-- Speech: [Provider Dropdown]
```

**Confidence:** HIGH - All UI libraries already in codebase, no new dependencies needed.

## OpenAI-Compatible Abstraction Pattern

### Core Pattern

All providers use OpenAI-compatible message format through Vercel AI SDK:

```typescript
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createGroq } from '@ai-sdk/groq';
import { createOllama } from 'ollama-ai-provider';
import { chrome } from 'chrome-ai';

// Unified provider factory
type ProviderConfig = {
  id: string;
  name: string;
  createClient: (apiKey: string, baseURL?: string) => LanguageModelV1;
  models: string[];
  requiresApiKey: boolean;
};

const providers: Record<string, ProviderConfig> = {
  openai: {
    id: 'openai',
    name: 'OpenAI',
    createClient: (apiKey) => createOpenAI({ apiKey }),
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o1', 'o1-mini'],
    requiresApiKey: true,
  },
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic',
    createClient: (apiKey) => createAnthropic({ apiKey }),
    models: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022'],
    requiresApiKey: true,
  },
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter',
    createClient: (apiKey) => createOpenAI({
      apiKey,
      baseURL: 'https://openrouter.ai/api/v1',
    }),
    models: ['auto', 'anthropic/claude-3.5-sonnet', 'openai/gpt-4o'],
    requiresApiKey: true,
  },
  ollama: {
    id: 'ollama',
    name: 'Ollama (Local)',
    createClient: (_, baseURL = 'http://localhost:11434') => createOllama({ baseURL }),
    models: ['llama3.2', 'llama3.1', 'mistral'],
    requiresApiKey: false,
  },
  geminiNano: {
    id: 'geminiNano',
    name: 'Gemini Nano (On-Device)',
    createClient: () => chrome(),
    models: ['default'],
    requiresApiKey: false,
  },
  groq: {
    id: 'groq',
    name: 'Groq',
    createClient: (apiKey) => createGroq({ apiKey }),
    models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'],
    requiresApiKey: true,
  },
  custom: {
    id: 'custom',
    name: 'Custom Endpoint',
    createClient: (apiKey, baseURL) => createOpenAI({ apiKey, baseURL }),
    models: ['custom'], // User-specified
    requiresApiKey: true,
  },
};
```

### Streaming Chat Completion

```typescript
import { streamText } from 'ai';

async function chat(
  providerId: string,
  model: string,
  messages: Message[],
  onChunk: (text: string) => void
): Promise<string> {
  const config = providers[providerId];
  const client = config.createClient(decryptedApiKey, customBaseURL);

  const result = streamText({
    model: client(model),
    messages,
  });

  let fullText = '';
  for await (const chunk of result.textStream) {
    fullText += chunk;
    onChunk(chunk);
  }

  return fullText;
}
```

### Transcription (Speech-to-Text)

```typescript
import { transcribe } from 'ai';

async function speechToText(
  providerId: 'openai' | 'groq',
  audioBlob: Blob
): Promise<string> {
  const config = providers[providerId];
  const client = config.createClient(decryptedApiKey);

  const result = await transcribe({
    model: client.transcriptionModel('whisper-1'),
    audio: await audioBlob.arrayBuffer(),
  });

  return result.text;
}
```

**Confidence:** HIGH - Pattern verified in Vercel AI SDK docs, matches existing codebase architecture.

## Installation

```bash
cd ai-extension

# Core (already installed)
npm install ai

# Official Vercel AI SDK providers
npm install @ai-sdk/openai @ai-sdk/anthropic @ai-sdk/google @ai-sdk/groq

# Community providers
npm install ollama-ai-provider chrome-ai

# Note: No new encryption libraries needed - Web Crypto API is native
# Note: No new UI libraries needed - shadcn/ui already in codebase
```

## What NOT to Use

| Technology | Why Not | Alternative |
|------------|---------|-------------|
| Direct provider SDKs | Inconsistent APIs, more code to maintain | Vercel AI SDK abstraction |
| `@google/generative-ai` directly | Already have Vercel provider | `@ai-sdk/google` |
| localStorage for API keys | No encryption, accessible to XSS | chrome.storage.local with encryption |
| chrome.storage.sync for keys | 100KB quota, syncs to cloud (security risk) | chrome.storage.local (device-only) |
| Third-party encryption libs (crypto-js) | Unnecessary dependency, larger bundle | Web Crypto API (native) |
| Custom abstraction layer | Reinventing Vercel AI SDK | Use proven abstraction |
| LangChain for simple chat | Overkill, adds complexity | Vercel AI SDK (simpler) |
| NVIDIA NIM JS SDK | Does not exist | REST API with fetch |

## Provider-Specific Notes

### OpenAI
- Use `dangerouslyAllowBrowser: true` for client-side usage (extension is browser environment)
- Supports Responses API (new) and Chat Completions API (standard)

### Anthropic
- Requires Node.js 18+ (satisfied by Chrome extension environment)
- No browser flag needed - Vercel SDK handles it

### Google Gemini
- Keep `@google/generative-ai` for vision tasks if needed
- Use `@ai-sdk/google` for chat to maintain abstraction

### OpenRouter
- API key from openrouter.ai
- Models format: `provider/model-name`
- Supports fallback routing

### Ollama
- Requires Ollama running locally (http://localhost:11434)
- No API key needed
- User must have Ollama installed

### Groq
- Fast inference (LPU-based)
- Supports Whisper transcription
- API key from console.groq.com

### NVIDIA NIM
- No official JavaScript SDK
- Use direct REST calls to NIM endpoints
- OpenAI-compatible format for chat
- Parakeet for transcription

### Gemini Nano
- Requires Chrome Built-in AI enabled
- No API key, no network calls
- Falls back gracefully if unavailable

### Custom Endpoints
- Any OpenAI-compatible server (LM Studio, vLLM, etc.)
- User provides baseURL and optional API key
- Works with existing OpenAI provider

## Confidence Summary

| Area | Confidence | Reason |
|------|------------|--------|
| Vercel AI SDK abstraction | HIGH | Official docs, actively maintained, matches codebase needs |
| Provider SDKs (official) | HIGH | Part of Vercel ecosystem, well-documented |
| Provider SDKs (community) | MEDIUM | Third-party, but widely used |
| Encryption approach | HIGH | Web Crypto API is standard browser feature |
| UI components | HIGH | Already in codebase, proven patterns |
| NVIDIA NIM integration | MEDIUM | No SDK, REST-only, less documentation |

## Sources

- Vercel AI SDK Documentation: https://sdk.vercel.ai/docs
- Vercel AI SDK Providers: https://sdk.vercel.ai/providers
- OpenAI NPM: https://www.npmjs.com/package/openai
- Anthropic SDK NPM: https://www.npmjs.com/package/@anthropic-ai/sdk
- Ollama AI Provider: https://www.npmjs.com/package/ollama-ai-provider
- Chrome AI Provider: https://www.npmjs.com/package/chrome-ai
- Groq Provider: https://www.npmjs.com/package/@ai-sdk/groq
- Web Crypto API MDN: https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API

---

*Research completed: 2026-03-27*
