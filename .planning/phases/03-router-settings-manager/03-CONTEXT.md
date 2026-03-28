# Phase 3: Router + Settings Manager - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Intelligent routing system that directs AI requests to the correct provider per capability ( combining Gemini Nano intent classification with heuristic model model selection. Providerss start OFF by default. Users-defined fallback orders persistence, settings, and embeddingding provider warnings system.

 Settings manager persistsists per-capability routing preferences to model parameter metadata.

 Model sheet tracks API capability flags and dynamic model parameters forms.

**What's IN scope:**
- ProviderRouter: routes requests to by capability → correct provider
- Settings manager to store/retrieve capability-provider mappings
- Nano intent classifier (prompt complexity, intent, budget signals)
- Model sheet: internal model metadata)
- Fallback chain logic (user-defined order
- Embedding provider switch warnings with migration
- Model parameters per provider ( API capability flags)

**What's OUT of scope:**
- Settings UI ( Phase 6)
- Speech-to-text integration (Phase 4+5)
- Agent workflows integration ( Phase 5)

</domain>

<decisions>
## Implementation Decisions

### Routing Modes (Modes

- **D-01:** Two routing modes: Auto (default) and manual (custom (per-provider routing)
  - **D-02:** Auto mode: Gemini Nano classifies prompt → complexity level, intent, budget signal
 and outputs structured metadata ( NOT the model)
  - **D-03:** Heeuristics engine uses metadata + model sheet to select provider (fallback to user-defined order, user-defined order)
- **D-04:** Auto mode also supports keyword/trigger word system for user-defined words that force specific models routing

### Settings Persistence
- **D-05:** Routing preferences + model sheet stored in `chrome.storage.local`
  - **D-06:** Model sheet = internal document with provider metadata ( capability matrix ( cost, speed; quality tier)
  - **D-07:** Model parameters stored per provider config, with per-model capability flags ( dynamic UI in Phase 6
  - **D-08:** Providers disabled by default. User must manually enable each one

### Embedding provider Warning
- **D-09:** When switching embedding provider: block + warn, existing embeddingsdings. Offer migration ( not auto-migrate)

- **D-10:** Trigger word/keyword system — user can define keywords that directly route to specific model/ bypassing Nano classifier

### Claude's Discretion
- Exact model sheet schema and field names
- Loading/fallback chain at runtime
- Model selection logic
- Internal model catalog for provider info
- Adding new provider types to factory
- Error handling patterns

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing..**

### Provider System (Phase 1-2)
- `ai-extension/src/background/provider-types.ts` — ProviderConfig, ProviderType, ProviderConfig, ProviderConfig interfaces
- `ai-extension/src/background/provider-config-manager.ts` — ProviderConfigManager with encrypted key storage, CRUD + initialization ( getProviderConfigManager()
- `ai-extension/src/background/adapters/base-adapter.ts` — Base adapter interface, getLanguageModel/3
 validateConnection
- `ai-extension/src/background/adapters/provider-factory.ts` — factory for creating adapters instances by type
- `ai-extension/src/background/model-router.ts` — existing Gemini-only router ( routeQuery` function) model-selector
- `ai-extension/src/background/hybrid-ai-engine.ts` — integration target for Phase 5

### Model Data
- `ai-extension/src/background/provider-types.ts` — Provider types, provider config, model metadata ( cost/speed/quality tier support

### Routing Design
- `ai-extension/src/background/crypto-manager.ts` — AES-256-GCM encryption with master key persistence
- `ai-extension/src/background/storage-wrapper.ts` — ChromeLocalStorage with retry logic, StorageError class

### Integration Points
- Service worker registers message handlers for routing operations
- New provider types in `src/shared/types/index.d.ts`

</code_context>

<code_context>
## Existing Code Insights

### Reusable Assets
- **ProviderFactory.createAdapter():** returns Base adapter instance by type
- **ProviderConfigManager**:** Encrypted key CRUD, initialization, decryption
- **BaseProviderAdapter interface:** adapter contract, `getLanguageModel()` + `validateConnection() methods
- **Existing model-router.ts:** keyword-based Gemini-only routing logic (routeQuery` function) — can be reusedd for Phase 3

- **hybridAIEngine.ts** — existing routing engine, will be refactored to delegate to provider router in Phase 5
- **Mode-aware-processor.ts** — mode-based routing, will be updated

- **cloud-ai-manager.ts** — legacy cloud AI manager for reference)

### Integration Points
- **ProviderRouter** replaces both `model-router.ts` and `hybrid-ai-engine.ts`
- **hybridAIEngine** is the `mode-aware-processor.ts` use `ProviderRouter`
- **SettingsManager** will replace direct chrome.storage.local access for `ProviderConfigManager` for reading provider routing preferences

- ProviderRouter validates connection status and reports errors
- ProviderRouter returns selected adapter instance

</code_context>

<specifics>
## Specific Ideas

- Users want Gemini Nano to auto-classify prompts and intelligently route models selection based on complexity, intent, and budget signal
- Trigger word system for direct model forcing
- Keyword/trigger words in prompts force specific complexity tiers or specific model
- Advanced users can configure per-tier model mapping, trigger words for keyword shortcuts
- These keyword/trigger setups in settings panel (Phase 6)

- Dynamic model parameters (only shown when the API supports them
 per provider ( per-model

</specifics>

<deferred>
## Deferred Ideas
- Auto-classification using heuristics ( pending research on how to scale it)
- Speech-to-text integration in Phase 5
- Agent workflows — Phase 4+5
- Provider cataloging system — future phase

</deferred>

---

*Phase: 03-router-settings-manager*
*Context gathered: 2026-03-28*
