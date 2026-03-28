# Roadmap: AI Pocket - Multi-Provider Settings

## Overview

This roadmap delivers a comprehensive multi-provider settings system for AI Pocket, enabling users to configure and switch between multiple LLM and speech-to-text providers. The journey starts with secure storage foundation, builds provider adapters, implements intelligent routing, extends to additional providers, integrates with the existing system, and culminates in a polished settings UI.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation** - Secure storage, provider types, and encryption system
- [x] **Phase 2: Core Adapters** - Provider implementations (Gemini Nano, Gemini Cloud, OpenAI, Anthropic)
- [ ] **Phase 3: Router + Settings Manager** - Per-capability routing and centralized settings management
- [ ] **Phase 4: Additional Providers** - Extended providers (Ollama, OpenRouter, Groq, Custom) and STT config
- [ ] **Phase 5: Integration** - HybridAIEngine integration and message handlers
- [ ] **Phase 6: Settings UI** - Side panel settings interface with provider configuration

## Phase Details

### Phase 1: Foundation
**Goal**: Secure infrastructure for storing provider configurations and encrypted API keys
**Depends on**: Nothing (first phase)
**Requirements**: PROV-01, PROV-03, PROV-05, KEYS-01, KEYS-02
**Success Criteria** (what must be TRUE):
  1. User can define provider configurations with name, type, and enabled status
  2. API keys are encrypted using AES-GCM before storage
  3. Encrypted keys are stored in chrome.storage.local (not sync)
  4. User can enable/disable providers without deleting configuration
  5. Encryption service can encrypt and decrypt keys on demand
**Plans**: 3 plans (Complete)

### Phase 2: Core Adapters
**Goal**: Working provider adapters for Gemini Nano, Gemini Cloud, OpenAI, and Anthropic with model selection
**Depends on**: Phase 1
**Requirements**: PROV-04, KEYS-04, KEYS-05, INT-01
**Success Criteria** (what must be TRUE):
  1. User can select specific models per provider (GPT-4, Claude 3.5, Gemini Pro, etc.)
  2. System validates API keys by testing connection before saving
  3. Connection status indicator shows per configured provider
  4. Gemini Nano remains available as a free provider option (no API key required)
  5. Each provider adapter can send chat requests and stream responses
**Plans**: 3 plans (Complete)
- [x] 02-01-PLAN.md — Foundation, Base Adapter Interface, and Factory
- [x] 02-02-PLAN.md — OpenAI and Anthropic Adapters with validation
- [x] 02-03-PLAN.md — Google Cloud and Gemini Nano Adapters with local AI support

### Phase 3: Router + Settings Manager
**Goal**: Intelligent routing system that directs AI requests to the correct provider per capability
**Depends on**: Phase 2
**Requirements**: PROV-06, ROUT-01, ROUT-02, ROUT-03, INT-04
**Success Criteria** (what must be TRUE):
  1. User can assign different providers for chat, embeddings, and speech capabilities
  2. System automatically routes AI requests to the configured provider for each capability
  3. System falls back to next available provider if primary fails
  4. User receives warning when switching embedding providers (dimension mismatch risk)
  5. Settings manager persists and retrieves all provider configurations
**Plans**: 2 plans (Complete)

### Phase 03.1: Phase 3 Hardening & Model Capabilities (INSERTED)
**Goal**: Harden Phase 3 routing — enabled provider/model filtering, predefined model catalog with capabilities (context window, max output tokens, image/video/audio analysis), missing SettingsManager methods, intent-aware heuristics, and comprehensive test coverage
**Requirements**: PROV-06, ROUT-02, ROUT-03
**Depends on**: Phase 3
**Success Criteria** (what must be TRUE):
  1. Router only routes to enabled providers with enabled models
  2. Predefined model catalog seeds the model sheet on first use
  3. Users can configure model capabilities (context window, max output tokens, image/video/audio analysis)
  4. SettingsManager exposes methods for routingMode, fallbackChain, triggerWords, and model management
  5. Heuristic scoring uses intent from Nano classifier
  6. Clear error messages for misconfigured capabilities
  7. All routing paths have test coverage (trigger words, embeddings, speech, enabled filtering)
**Plans**: 2 plans
- [ ] 03.1-01-PLAN.md — Extend types, create model catalog, implement SettingsManager methods with Zod validation
- [ ] 03.1-02-PLAN.md — Add enabled filtering to ProviderRouter and comprehensive test coverage

### Phase 4: Additional Providers
**Goal**: Extended provider support including local, aggregator, and custom endpoints with STT configuration
**Depends on**: Phase 3
**Requirements**: PROV-02, UI-05, STT-01, STT-03
**Success Criteria** (what must be TRUE):
  1. User can configure custom OpenAI-compatible endpoints with custom base URL
  2. Ollama, OpenRouter, and Groq adapters are available for selection
  3. User can select speech-to-text provider (OpenAI Whisper, Groq Whisper, NVIDIA Parakeet)
  4. User can configure STT-specific settings (language, model variant)
  5. Custom endpoint form validates URLs and optional API keys
**Plans**: 3 plans
- [x] 04-01-PLAN.md — Provider transport schema, persistence, and OpenAI-compatible adapter infrastructure
- [ ] 04-02-PLAN.md — Typed STT settings and richer capability metadata
- [ ] 04-03-PLAN.md — Minimal sidepanel configuration flow for providers and STT

### Phase 5: Integration
**Goal**: New provider system integrated with existing HybridAIEngine and message handling
**Depends on**: Phase 4
**Requirements**: STT-02, INT-02, INT-03
**Success Criteria** (what must be TRUE):
  1. HybridAIEngine delegates to ProviderRouter instead of direct CloudAIManager
  2. Audio transcription requests route to selected STT provider
  3. Existing conversations continue working after provider configuration changes
  4. All provider-related messages use typed message contracts
  5. Service worker handles new SETTINGS_* message types
**Plans**: TBD

### Phase 6: Settings UI
**Goal**: Complete settings interface in side panel for configuring all providers and routing
**Depends on**: Phase 5
**Requirements**: ROUT-04, KEYS-03, UI-01, UI-02, UI-03, UI-04, UI-06, UI-07
**Success Criteria** (what must be TRUE):
  1. User can access settings page from side panel header (settings icon)
  2. Provider cards display provider name, connection status, and model selector
  3. API key input has show/hide toggle and validation indicator
  4. Capability routing section shows chat/embeddings/speech provider assignments
  5. User sees which provider is handling each request in the UI
  6. User can view and delete saved API keys per provider
  7. Model selector dropdown populated from provider's available models
**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 3.1 -> 4 -> 5 -> 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 3/3 | Completed | 2026-03-28 |
| 2. Core Adapters | 3/3 | Completed | 2026-03-28 |
| 3. Router + Settings Manager | 2/2 | Completed | 2026-03-28 |
| 3.1 Hardening & Model Capabilities | 0/2 | Planning complete | - |
| 4. Additional Providers | 1/3 | In progress | - |
| 5. Integration | 0/TBD | Not started | - |
| 6. Settings UI | 0/TBD | Not started | - |

---

*Roadmap created: 2026-03-27*
*Granularity: standard*
