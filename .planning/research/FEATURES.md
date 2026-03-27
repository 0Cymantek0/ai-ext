# Feature Landscape

**Domain:** Multi-Provider AI Settings System for Chrome Extension
**Researched:** 2026-03-27

## Table Stakes

Features users expect. Missing = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Multi-provider configuration** | Users expect to use their preferred AI provider | Medium | OpenAI, Anthropic, Google Gemini are baseline expectations |
| **API key management** | Required to authenticate with any cloud provider | Medium | Must be stored securely, never logged or exposed |
| **Model selection** | Users want to choose specific models (GPT-4, Claude, etc.) | Low | Dropdown or list selection per provider |
| **Provider status indicators** | Users need to know if their setup is working | Low | Connection test, API key validation status |
| **Default provider/model** | New users need sensible defaults | Low | Gemini Nano (free) as default aligns with existing UX |
| **Basic error handling** | Failed requests must show clear messages | Medium | API errors, rate limits, invalid keys |
| **Settings persistence** | Configuration must survive browser restart | Low | chrome.storage.local already available |

## Differentiators

Features that set product apart. Not expected, but valued.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Per-capability provider routing** | Users can optimize cost/speed/quality per task | High | Chat with Claude, embeddings with fast/cheap model, speech with Whisper |
| **Custom OpenAI-compatible endpoints** | Supports local models (LM Studio, Ollama) and niche providers | Medium | URL + API key configuration, model discovery |
| **Presets/Profiles** | Quick switching between configurations | Medium | "Coding" preset (Claude), "Creative" preset (GPT-4), "Local" preset (Ollama) |
| **Ollama local integration** | Zero-cost, privacy-first option for users with local hardware | Medium | Auto-detect local Ollama instance, model listing |
| **OpenRouter aggregator support** | Access to 100+ models through single API key | Low | Standard OpenAI-compatible endpoint |
| **Speech-to-text provider selection** | Separate provider for transcription tasks | Medium | OpenAI Whisper, Groq Whisper (fast), NVIDIA Parakeet |
| **Streaming response toggle** | Some users prefer complete responses | Low | Already implemented, extend to settings |
| **Model parameter tuning** | Temperature, max tokens, top_p per provider | Medium | Advanced settings panel |
| **Usage tracking (local)** | Users want to know their API costs | Medium | Token counting, estimated cost display |
| **Provider health monitoring** | Proactive alerts when providers are down | Low | Optional, ping endpoints periodically |
| **Import/Export settings** | Backup and migration of configuration | Low | JSON export of all settings |

## Anti-Features

Features to explicitly NOT build.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Cloud sync of API keys** | Security concern — keys should never leave device | Device-only storage in chrome.storage.local with encryption |
| **Backend proxy for API calls** | Adds infrastructure cost, latency, and trust requirements | Direct API calls from extension (CORS handled by extension context) |
| **Free tier / rate limiting** | Complex to manage, users have their own API quotas | Users manage their own provider quotas and billing |
| **Multi-user accounts** | Extension is single-user, per-browser | Single profile with all settings local |
| **Social features / sharing** | Outside scope of personal AI assistant | Focus on individual productivity |
| **Model fine-tuning UI** | Too complex, provider-specific | Defer to provider dashboards |
| **Conversation sync across devices** | Privacy concern, adds complexity | Local IndexedDB only (existing pattern) |
| **Automatic model selection** | Removes user control, unpredictable costs | Explicit user choice with sensible defaults |

## Feature Dependencies

```
API Key Management (core)
    ├── Provider Configuration (requires: API key)
    │       ├── Model Selection (requires: Provider config)
    │       │       ├── Per-Capability Routing (requires: Model selection)
    │       │       └── Presets/Profiles (requires: Model selection)
    │       └── Custom Endpoints (requires: Provider config)
    │
    └── Settings Persistence (enables: all above)

Ollama Integration
    └── Custom OpenAI-Compatible Endpoints (Ollama is a type of this)

Usage Tracking
    └── Requires: Token counting in response handlers

Speech-to-Text Provider
    └── Requires: Provider Configuration + Model Selection
```

## Provider-Specific Features

### Ollama (Local)
- **Auto-discovery**: Try connecting to `localhost:11434` automatically
- **No API key**: Local instance requires no authentication
- **Model listing**: Fetch available models via `/api/tags` endpoint
- **Health check**: Ping endpoint to verify Ollama is running
- **GPU detection**: Show if Ollama has GPU available (optional)

### OpenRouter (Aggregator)
- **Single API key**: One key for 100+ models
- **Model catalog**: Fetch available models from OpenRouter API
- **Cost display**: Show pricing per 1K tokens for each model
- **Fallback routing**: Can configure fallback if primary model fails

### Groq (Fast Inference)
- **Speed indicator**: Highlight Groq as fastest option
- **Whisper integration**: Speech-to-text with Groq's Whisper
- **Model limitations**: Note available models (Llama, Mixtral variants)

### NVIDIA NIM
- **Enterprise focus**: May require specific setup documentation
- **Parakeet speech**: Alternative STT option
- **Hardware info**: Show if NVIDIA GPU detected (optional)

### Anthropic
- **Extended thinking**: Claude's thinking mode (if API supports)
- **Vision support**: Image analysis capabilities
- **Prompt caching**: Cost optimization for repeated prompts

### OpenAI
- **Assistants API**: Complex feature, likely out of scope
- **DALL-E**: Image generation (separate capability)
- **Whisper**: Primary speech-to-text option
- **TTS**: Text-to-speech (separate capability)

### Google Gemini
- **Gemini Nano**: Already implemented, preserve as free tier option
- **Vertex AI**: Enterprise option, may be out of scope
- **Multimodal**: Native image/video support

## MVP Recommendation

Prioritize:
1. **Multi-provider configuration** (OpenAI, Anthropic, Google Gemini) — Table stakes
2. **API key management with encryption** — Security requirement
3. **Model selection per provider** — User control
4. **Per-capability routing** — Key differentiator for AI Pocket
5. **Custom OpenAI-compatible endpoints** — Enables Ollama, LM Studio, local models

Defer:
- **Usage tracking**: Nice to have, not critical for MVP
- **Presets/Profiles**: Can add after basic multi-provider works
- **Speech-to-text provider selection**: Keep using existing Whisper integration initially
- **Provider health monitoring**: Complexity without clear MVP value

## Complexity Assessment

| Feature Set | Total Complexity | MVP Priority |
|-------------|------------------|--------------|
| Core multi-provider (OpenAI, Anthropic, Gemini) | Medium | Phase 1 |
| Per-capability routing | High | Phase 1 |
| Custom endpoints (Ollama, LM Studio) | Medium | Phase 1 |
| API key encryption | Medium | Phase 1 |
| Model parameter tuning | Medium | Phase 2 |
| Presets/Profiles | Medium | Phase 2 |
| Usage tracking | Medium | Phase 2 |
| Speech-to-text provider routing | Medium | Phase 3 |
| Provider health monitoring | Low | Phase 3 |

## Sources

- **LibreChat** (GitHub: danny-avila/LibreChat) — Multi-provider configuration, presets, model selection patterns
- **Open WebUI** (GitHub: open-webui/open-webui) — Ollama integration, RBAC patterns, model management
- **Chatbox** (GitHub: Bin-Huang/chatbox) — Local storage patterns, multi-provider UI
- **AI Pocket PROJECT.md** — Existing architecture, constraints, storage patterns

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Table stakes | HIGH | Clear patterns across all reference implementations |
| Differentiators | MEDIUM | Some features (per-capability routing) are novel, less precedent |
| Anti-features | HIGH | Aligned with PROJECT.md constraints and security requirements |
| Dependencies | HIGH | Logical dependencies clear from architecture |
| Provider-specific | MEDIUM | Some providers (NVIDIA NIM) less documented, may need validation |
