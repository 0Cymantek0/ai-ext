# Requirements: AI Pocket - Multi-Provider Settings

**Defined:** 2026-03-27
**Core Value:** User choice and flexibility — use any AI provider with your own API keys

## v1 Requirements

Requirements for multi-provider settings milestone. Each maps to roadmap phases.

### Provider Configuration

- [x] **PROV-01**: User can add/remove/configure multiple AI providers (OpenAI, Anthropic, Google, OpenRouter, Ollama, Groq, NVIDIA NIM)
- [ ] **PROV-02**: User can configure custom OpenAI-compatible endpoints with custom base URL
- [ ] **PROV-03**: User can enter and save API keys per provider with AES-GCM encryption
- [x] **PROV-04**: User can select specific models per provider (not just provider-level)
- [x] **PROV-05**: User can enable/disable individual providers without deleting configuration
- [x] **PROV-06**: User can set provider as active/inactive for each capability (chat, embeddings, speech)

### Per-Capability Routing

- [x] **ROUT-01**: User can select different providers for chat vs embeddings vs speech
- [x] **ROUT-02**: System routes AI requests to the configured provider per capability
- [x] **ROUT-03**: System falls back to next available provider if primary fails
- [ ] **ROUT-04**: User sees which provider is handling each request in UI

### API Key Management

- [ ] **KEYS-01**: API keys are encrypted at rest using Web Crypto API AES-GCM
- [ ] **KEYS-02**: API keys are stored in chrome.storage.local (never synced)
- [ ] **KEYS-03**: User can view/delete saved API keys per provider
- [ ] **KEYS-04**: System validates API keys before saving (test connection)
- [x] **KEYS-05**: System shows connection status indicator per configured provider

### Settings UI

- [ ] **UI-01**: Settings page accessible from side panel (settings icon in header)
- [ ] **UI-02**: Provider configuration cards with provider name, status, model selector
- [ ] **UI-03**: API key input field with show/hide toggle and validation
- [ ] **UI-04**: Capability routing section showing chat/embeddings/speech provider assignments
- [ ] **UI-05**: Custom endpoint form with base URL input and optional API key
- [ ] **UI-06**: Provider enable/disable toggle per provider
- [ ] **UI-07**: Model selector dropdown populated from provider's available models

### Speech-to-Text Integration

- [ ] **STT-01**: User can select speech-to-text provider (OpenAI Whisper, Groq Whisper, NVIDIA Parakeet)
- [x] **STT-02**: System routes audio transcription to selected STT provider
- [ ] **STT-03**: User can configure STT-specific settings (language, model variant)

### Existing System Integration

- [ ] **INT-01**: Gemini Nano remains available as a free provider option
- [x] **INT-02**: Existing hybrid-ai-engine.ts delegates to new provider router
- [ ] **INT-03**: Existing conversations continue working after provider changes
- [x] **INT-04**: System warns user if provider switch would affect existing embeddings

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Advanced Features

- **ADV-01**: Usage tracking with local token counting per provider
- **ADV-02**: Cost estimation based on token usage and provider pricing
- **ADV-03**: Presets/Profiles for quick configuration switching
- **ADV-04**: Model parameter tuning (temperature, max tokens, top_p)
- **ADV-05**: Automatic model list refresh from provider APIs

### Provider Health

- **HEALTH-01**: Provider health monitoring with latency tracking
- **HEALTH-02**: Automatic failover based on provider health
- **HEALTH-03**: Rate limit detection and user feedback

### Embeddings Migration

- **EMB-01**: Automatic embedding re-generation on embedding provider change
- **EMB-02**: Batch embedding migration tool for large content libraries
- **EMB-03**: Embedding dimension compatibility warnings

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Cloud sync of API keys | Security concern — keys must stay on device |
| Backend proxy for API keys | Users provide their own keys directly |
| Free tier / rate limiting | Users manage their own API quotas |
| Mobile app | Extension is desktop-only |
| OAuth authentication | API keys are sufficient for v1 |
| Team/organization accounts | Individual user focus |
| Local model management (Ollama) | Ollama handles this separately |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| PROV-01 | Phase 1 | Complete |
| PROV-02 | Phase 4 | Pending |
| PROV-03 | Phase 1 | Pending |
| PROV-04 | Phase 2 | Complete |
| PROV-05 | Phase 1 | Complete |
| PROV-06 | Phase 3 | Complete |
| ROUT-01 | Phase 3 | Complete |
| ROUT-02 | Phase 3 | Complete |
| ROUT-03 | Phase 3 | Complete |
| ROUT-04 | Phase 6 | Pending |
| KEYS-01 | Phase 1 | Pending |
| KEYS-02 | Phase 1 | Pending |
| KEYS-03 | Phase 6 | Pending |
| KEYS-04 | Phase 2 | Pending |
| KEYS-05 | Phase 2 | Complete |
| UI-01 | Phase 6 | Pending |
| UI-02 | Phase 6 | Pending |
| UI-03 | Phase 6 | Pending |
| UI-04 | Phase 6 | Pending |
| UI-05 | Phase 4 | Pending |
| UI-06 | Phase 6 | Pending |
| UI-07 | Phase 6 | Pending |
| STT-01 | Phase 4 | Pending |
| STT-02 | Phase 5 | Complete |
| STT-03 | Phase 4 | Pending |
| INT-01 | Phase 2 | Pending |
| INT-02 | Phase 5 | Complete |
| INT-03 | Phase 5 | Pending |
| INT-04 | Phase 3 | Complete |

**Coverage:**
- v1 requirements: 29 total
- Mapped to phases: 29
- Unmapped: 0

---

*Requirements defined: 2026-03-27*
*Last updated: 2026-03-27 after roadmap creation*
