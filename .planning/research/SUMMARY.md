# Project Research Summary

**Project:** AI Pocket - Multi-Provider Settings
**Domain:** Chrome Extension Multi-Provider AI Integration
**Researched:** 2026-03-27
**Confidence:** HIGH

## Executive Summary

AI Pocket is a Chrome extension implementing a multi-provider AI settings system that enables users to configure and switch between multiple LLM providers (OpenAI, Anthropic, Google Gemini, Groq, Ollama, OpenRouter, and custom endpoints). The recommended approach uses Vercel AI SDK as the unified abstraction layer, eliminating the need to learn each provider's SDK while providing consistent streaming, chat completions, and transcription APIs.

The architecture centers on a **Provider Adapter pattern** with a Provider Router that routes requests based on capability (chat, embedding, speech, vision). API keys must be encrypted using Web Crypto API (AES-GCM) and stored in `chrome.storage.local` - never in `chrome.storage.sync`. The key differentiator is **per-capability provider routing**, allowing users to optimize cost/speed/quality per task (e.g., Claude for chat, fast model for embeddings, Whisper for speech).

The critical risks are API key security (never expose keys in content scripts or sync storage), provider API format differences (Anthropic requires system prompts as top-level param, OpenAI accepts in messages array), and embedding dimension mismatches when switching providers mid-workflow.

## Key Findings

### Recommended Stack

Use Vercel AI SDK 4.2+ as the core abstraction layer. It provides a unified API for all LLM providers with streaming, chat completions, and transcription support. The SDK is already in the codebase (ai 5.0.81) and eliminates provider-specific SDK complexity.

**Core technologies:**
- **Vercel AI SDK**: Unified multi-provider abstraction - single API for all LLMs with streaming support
- **Web Crypto API**: Encryption primitive for API keys - native browser API, no dependencies, MV3 compatible
- **AES-GCM + PBKDF2**: Encryption algorithm + key derivation - standard for secure key storage
- **chrome.storage.local**: Encrypted storage - device-only, no sync, persists across sessions
- **shadcn/ui**: Settings UI components - already in codebase, consistent styling

**Provider SDKs (via Vercel AI SDK):**
- `@ai-sdk/openai` - OpenAI GPT models + Whisper transcription
- `@ai-sdk/anthropic` - Claude models
- `@ai-sdk/google` - Gemini cloud models
- `@ai-sdk/groq` - Fast inference + Whisper transcription
- `ollama-ai-provider` - Local Ollama models (community)
- `chrome-ai` - Chrome Built-in AI / Gemini Nano (community)

### Expected Features

**Must have (table stakes):**
- Multi-provider configuration (OpenAI, Anthropic, Google Gemini) - users expect their preferred provider
- API key management with encryption - required for authentication, security requirement
- Model selection per provider - users want to choose specific models (GPT-4, Claude, etc.)
- Provider status indicators - connection test, API key validation status
- Basic error handling - clear messages for API errors, rate limits, invalid keys
- Settings persistence - configuration survives browser restart

**Should have (competitive):**
- Per-capability provider routing - optimize cost/speed/quality per task (key differentiator)
- Custom OpenAI-compatible endpoints - supports local models (LM Studio, Ollama), niche providers
- Ollama local integration - zero-cost, privacy-first option for users with local hardware
- OpenRouter aggregator support - access to 100+ models through single API key

**Defer (v2+):**
- Usage tracking - nice to have, not critical for MVP
- Presets/Profiles - can add after basic multi-provider works
- Speech-to-text provider selection - keep existing Whisper integration initially
- Provider health monitoring - complexity without clear MVP value

### Architecture Approach

The architecture uses a **Provider Adapter pattern** with centralized routing. Each provider implements a `ProviderAdapter` interface with standardized methods (`chat`, `chatStream`, `embed`, `transcribe`). A `ProviderRouter` selects adapters based on capability-specific routing configuration. Settings are managed through a `SettingsManager` that handles encryption/decryption of API keys.

**Major components:**
1. **ProviderAdapter (interface)** - Abstract interface defining chat, streaming, embedding, transcription methods
2. **ProviderRouter** - Routes requests to correct adapter based on capability (chat/embedding/speech/vision)
3. **SettingsManager** - Manages encrypted API keys, provider configs, and routing preferences
4. **EncryptionService** - AES-GCM encryption using Web Crypto API with PBKDF2 key derivation
5. **HybridAIEngine (modified)** - Delegates to ProviderRouter instead of direct CloudAIManager

### Critical Pitfalls

1. **API Key Storage in chrome.storage.sync** - Keys sync across devices and have 100KB quota. Use `chrome.storage.local` exclusively with AES-GCM encryption. Never include keys in sync, export, or backup features.

2. **Client-Side API Key Exposure** - Making API calls from content scripts exposes keys. All external API calls MUST go through service worker. Content scripts request via message passing. Service worker sanitizes error messages.

3. **Provider API Format Assumptions** - Treating all providers as OpenAI-compatible causes silent failures. Anthropic requires system prompts as top-level param, OpenAI accepts in messages array. Create provider adapter pattern with explicit per-provider transforms.

4. **Inconsistent Model Selection Across Capabilities** - Embeddings from one model cannot be compared with another (different vector dimensions). Store embedding model metadata with each vector chunk. Detect dimension mismatch and warn user. Provide "compatible presets" that lock all capabilities to one provider.

5. **Hardcoded Model Lists** - Static model lists become outdated as providers release new models. Fetch available models from provider APIs on settings load. Allow custom model ID input. Cache with expiration (24-48 hours).

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Foundation - Secure Storage + Provider Types
**Rationale:** Must build encryption and type definitions first - all other components depend on these. Security is non-negotiable for API key handling.
**Delivers:** Encrypted API key storage, provider type definitions, base adapter class
**Addresses:** Multi-provider configuration, API key management (table stakes)
**Avoids:** Pitfall 1 (API key storage in sync), Pitfall 2 (client-side exposure), Security Pitfall 1 (weak encryption)

**Key files:**
- `src/background/providers/types.ts` - All interfaces and types
- `src/background/providers/base-adapter.ts` - Abstract base class
- `src/background/settings/encryption.ts` - AES-GCM encryption
- `src/background/settings/types.ts` - Settings schema

### Phase 2: Core Adapters - Provider Implementations
**Rationale:** Build adapters for existing providers first (Gemini Nano, Gemini Cloud) to wrap current functionality, then add new providers. Vercel AI SDK provides consistent patterns.
**Delivers:** GeminiNanoAdapter, GeminiAdapter, OpenAIAdapter, AnthropicAdapter
**Uses:** Vercel AI SDK provider packages, existing AIManager/CloudAIManager
**Implements:** ProviderAdapter interface for each provider
**Avoids:** Pitfall 3 (API format assumptions), Pitfall 5 (streaming assumptions)

**Key files:**
- `src/background/providers/gemini-nano-adapter.ts`
- `src/background/providers/gemini-adapter.ts`
- `src/background/providers/openai-adapter.ts`
- `src/background/providers/anthropic-adapter.ts`

### Phase 3: Provider Router + Settings Manager
**Rationale:** Router needs all adapters to be available. Settings manager needs encryption. These integrate the foundation components.
**Delivers:** ProviderRouter with capability-based routing, SettingsManager with encryption integration
**Addresses:** Model selection, default provider, per-capability routing (key differentiator)
**Avoids:** Anti-pattern 2 (hardcoding provider selection), Anti-pattern 3 (synchronous settings access)

**Key files:**
- `src/background/settings/manager.ts`
- `src/background/providers/router.ts`

### Phase 4: Additional Providers + Custom Endpoints
**Rationale:** Extended provider support after core system is stable. Custom endpoints enable Ollama, LM Studio, and any OpenAI-compatible service.
**Delivers:** OpenRouterAdapter, OllamaAdapter, GroqAdapter, CustomOpenAIAdapter
**Addresses:** Ollama local integration, OpenRouter aggregator, custom endpoints (differentiators)
**Avoids:** Pitfall 6 (hardcoded model lists), Pitfall 10 (custom endpoint URL validation)

**Key files:**
- `src/background/providers/openrouter-adapter.ts`
- `src/background/providers/ollama-adapter.ts`
- `src/background/providers/groq-adapter.ts`
- `src/background/providers/custom-adapter.ts`

### Phase 5: HybridAIEngine Integration + Message Handlers
**Rationale:** Modify existing engine to use router. Add message handlers for settings communication. This connects the new system to existing functionality.
**Delivers:** Modified HybridAIEngine using ProviderRouter, new message types for settings
**Uses:** ProviderRouter, SettingsManager
**Implements:** Message passing layer for UI communication

**Key files:**
- `src/background/hybrid-ai-engine.ts` (modifications)
- `src/background/service-worker.ts` (new message handlers)
- `src/shared/types/index.d.ts` (new message types)

### Phase 6: Settings UI
**Rationale:** UI comes last - it depends on all backend infrastructure. Uses existing shadcn/ui components.
**Delivers:** Provider configuration cards, model selectors, capability routing UI, connection testing
**Addresses:** Provider status indicators, settings persistence
**Avoids:** Pitfall 11 (missing provider status), Pitfall 13 (rate limit not surfaced)

**Key files:**
- `src/sidepanel/components/SettingsUI.tsx`
- `src/sidepanel/components/ProviderCard.tsx`
- `src/sidepanel/components/CapabilityRouter.tsx`

### Phase Ordering Rationale

- **Phase 1 first:** Security foundation is non-negotiable. Types enable all other code.
- **Phase 2 before Phase 3:** Adapters must exist before router can route to them.
- **Phase 3 before Phase 4:** Core adapters validate the pattern before extending.
- **Phase 5 after Phase 3:** Engine integration needs router and settings working.
- **Phase 6 last:** UI depends on complete backend infrastructure.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 4 (Additional Providers):** NVIDIA NIM has no JS SDK, REST-only, less documentation. May need validation during implementation.
- **Phase 4 (Custom Endpoints):** URL validation edge cases, HTTPS requirements for production vs HTTP for localhost.

Phases with standard patterns (skip research-phase):
- **Phase 1 (Foundation):** Well-documented Web Crypto API patterns, existing codebase types.
- **Phase 2 (Core Adapters):** Vercel AI SDK has excellent documentation for OpenAI, Anthropic, Google.
- **Phase 3 (Router):** Standard adapter/router pattern, well-established.
- **Phase 6 (UI):** shadcn/ui components already in codebase with proven patterns.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Vercel AI SDK is official, actively maintained, matches codebase needs. Web Crypto API is standard browser feature. |
| Features | HIGH | Clear patterns across LibreChat, Open WebUI, Chatbox reference implementations. Table stakes well-defined. |
| Architecture | HIGH | Provider Adapter pattern is standard. Vercel AI SDK provides proven abstraction. Existing codebase analysis validates approach. |
| Pitfalls | HIGH | All sources verified from official documentation (Anthropic, OpenAI, Google, Chrome). |

**Overall confidence:** HIGH

### Gaps to Address

- **NVIDIA NIM Integration:** No official JS SDK exists. Must use REST API with OpenAI-compatible format. Validate endpoint format and authentication during Phase 4 implementation.
- **Ollama Auto-Discovery:** Detecting local Ollama instance at localhost:11434 may have CORS or network permission implications. Test in extension context.
- **Embedding Dimension Migration:** When users switch embedding providers, existing vectors become incompatible. Need clear UX for re-embedding workflow. Design during Phase 3.

## Sources

### Primary (HIGH confidence)
- Vercel AI SDK Documentation: https://sdk.vercel.ai/docs - Provider management, streaming, chat completions
- Anthropic Messages API: https://docs.anthropic.com/en/api/messages - API format, system prompts, authentication
- OpenAI API Reference: https://platform.openai.com/docs/api-reference - Authentication, streaming, error formats
- Chrome Storage API: https://developer.chrome.com/docs/extensions/reference/api/storage - Storage types, quotas, security
- Google Gemini API Key Security: https://ai.google.dev/gemini-api/docs/api-key - Client-side key risks, best practices

### Secondary (MEDIUM confidence)
- LibreChat (GitHub: danny-avila/LibreChat) - Multi-provider configuration, presets, model selection patterns
- Open WebUI (GitHub: open-webui/open-webui) - Ollama integration, RBAC patterns, model management
- Chatbox (GitHub: Bin-Huang/chatbox) - Local storage patterns, multi-provider UI
- Ollama AI Provider: https://www.npmjs.com/package/ollama-ai-provider - Community provider
- Chrome AI Provider: https://www.npmjs.com/package/chrome-ai - Community provider for Chrome Built-in AI

### Tertiary (LOW confidence)
- NVIDIA NIM Documentation - No JS SDK, REST-only, enterprise-focused, needs validation

---
*Research completed: 2026-03-27*
*Ready for roadmap: yes*
