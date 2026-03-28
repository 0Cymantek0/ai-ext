# Phase 6: Settings UI - Context

**Gathered:** 2026-03-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the polished side-panel settings experience for the multi-provider system so users can configure providers, routing, speech settings, and API-key-related actions from a deliberate UI flow. This phase covers settings information architecture, provider configuration UX, routing assignment UX, and provider visibility inside the side panel. It does not add new provider/runtime capabilities beyond what earlier phases already implemented.

</domain>

<decisions>
## Implementation Decisions

### Settings Layout And Navigation
- **D-01:** The settings experience should use a tabbed top-level structure instead of a single long scroll view.
- **D-02:** Provider editing should happen in a dedicated detail view rather than inline expansion inside the overview list.
- **D-03:** Adding a provider should start with selecting a provider preset, then continue into a setup flow for that chosen provider.
- **D-04:** Speech settings should live in their own top-level section/tab rather than being buried inside general routing or provider details.

### Provider Overview And Detail Flow
- **D-05:** The provider overview list should stay lightweight and scannable, showing provider name, enabled state, connection status, and selected model.
- **D-06:** Clicking the provider row/card should open its dedicated detail view.
- **D-07:** The provider detail screen should include a primary model picker with an expandable advanced model metadata editor rather than a full model-admin table by default.
- **D-08:** Base URL and endpoint override controls should only appear when the provider supports or needs endpoint overrides.

### API Key Management
- **D-09:** Provider overview should show saved/not-saved state plus validation or connection status, but not expose full key-management actions directly on the list.
- **D-10:** Saved API keys should never be re-revealed in the UI after storage; users may replace or delete them, but not view the original secret again.
- **D-11:** API keys should be validated on save and also support a manual retest action afterward.
- **D-12:** Deleting a saved API key should require confirmation and should keep the provider configuration intact.

### Routing And Provider Visibility
- **D-13:** Routing assignments should be managed from a dedicated Routing tab, while provider detail screens should also show usage hints about where that provider is assigned.
- **D-14:** Capability routing controls should prioritize provider selection first, with the model shown and editable only when needed.
- **D-15:** Fallback-chain controls should be exposed as an advanced routing section rather than a first-class default control.
- **D-16:** Provider provenance should remain visible inline above assistant responses and should also appear in request-related UI where it helps explain which provider handled work.

### UX Guardrails
- **D-17:** The default settings flow should optimize for scanability and quick setup first, with advanced controls progressively disclosed in detail views and advanced sections.
- **D-18:** Phase 6 should build on the existing side-panel settings entry point and current provider/speech persistence surfaces rather than introducing a second settings system.

### the agent's Discretion
- Exact tab names, ordering, and iconography for the settings surface
- Exact visual treatment of provider status, model labels, and capability badges in the overview list
- Exact layout pattern for the provider detail view on narrow side-panel widths
- Exact wording and placement for API-key delete/replace/retest confirmations
- Exact UI affordance for routing usage hints inside provider detail

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Scope And Prior Phase Decisions
- `.planning/ROADMAP.md` — Phase 6 goal, requirements, UI hint, and success criteria
- `.planning/REQUIREMENTS.md` — `ROUT-04`, `KEYS-03`, `UI-01`, `UI-02`, `UI-03`, `UI-04`, `UI-06`, `UI-07`
- `.planning/PROJECT.md` — milestone-level product goals and plug-and-play expectations
- `.planning/STATE.md` — current project position and prior architectural decisions
- `.planning/phases/03-router-settings-manager/03-CONTEXT.md` — routing preferences, fallback chain, model sheet, and the earlier decision that settings UI work belongs in Phase 6
- `.planning/phases/03.1-phase-3-hardening-model-capabilities/03.1-CONTEXT.md` — model catalog, per-model enablement, validation, and UI-facing error-message expectations
- `.planning/phases/04-additional-providers/04-CONTEXT.md` — provider preset/default behavior, custom endpoint decisions, STT settings scope, and the explicit deferral of polished settings UX to Phase 6
- `.planning/phases/05-integration/05-CONTEXT.md` — provider provenance/fallback visibility decisions and runtime integration constraints that the UI must reflect

### Existing UI Surfaces
- `ai-extension/src/components/TopBar.tsx` — existing settings entry point from the side-panel header via the gear button
- `ai-extension/src/sidepanel/ChatApp.tsx` — current side-panel composition, provider provenance display, and settings sheet mounting point
- `ai-extension/src/sidepanel/components/ProviderSettingsSheet.tsx` — current minimal provider settings sheet that Phase 6 will evolve
- `ai-extension/src/sidepanel/components/CustomEndpointForm.tsx` — current provider creation/editing form and endpoint validation affordances
- `ai-extension/src/sidepanel/components/SpeechSettingsSection.tsx` — current STT settings surface and advanced-option patterns

### Existing Settings And Runtime Contracts
- `ai-extension/src/background/provider-config-manager.ts` — provider CRUD, encrypted API key storage, and delete/replace behavior constraints
- `ai-extension/src/background/routing/settings-manager.ts` — persisted routing preferences, model sheet, speech settings, and validation rules that the UI must drive
- `ai-extension/src/shared/types/index.d.ts` — provider/speech settings message contracts and provider execution metadata types
- `ai-extension/src/background/service-worker.ts` — current `PROVIDER_SETTINGS_*` and `SPEECH_SETTINGS_*` handlers that the UI already talks to

### External Specs
- `No external ADR/spec file was identified for the Phase 6 settings UX. Requirements and prior context files are the canonical source of truth for this phase.`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`TopBar.tsx`**: already exposes the settings entry point from the side-panel header, so Phase 6 can preserve the current access pattern.
- **`ProviderSettingsSheet.tsx`**: already provides the shell for a full-screen settings surface, provider loading, and provider save/toggle interactions.
- **`CustomEndpointForm.tsx`**: already captures provider type, base URL, API key, endpoint mode, and endpoint validation, so it can be adapted into the provider setup/detail flow instead of rewritten from scratch.
- **`SpeechSettingsSection.tsx`**: already implements a provider/model/language/options form for STT and provides a concrete pattern for a dedicated Speech tab.
- **`ChatApp.tsx`**: already renders provider provenance above assistant responses and wires the settings sheet into the side-panel app state.
- **`SettingsManager` and `ProviderConfigManager`**: already persist the routing, model, speech, and key state that the new UI should edit.

### Established Patterns
- The side panel currently prefers full-screen overlays/sheets for focused workflows instead of opening separate extension pages.
- Settings changes already flow through typed runtime messages to the background service worker.
- Provider/system state lives in background storage managers, not React-only local state.
- Advanced controls already exist in minimal form and should be progressively disclosed instead of shown by default everywhere.

### Integration Points
- `ProviderSettingsSheet.tsx` is the direct seam for the new tabbed information architecture.
- `CustomEndpointForm.tsx` can become the basis for the dedicated add-provider and provider-detail setup flows.
- `SpeechSettingsSection.tsx` should likely move under a first-class Speech tab rather than remain appended to a generic scroll stack.
- `ChatApp.tsx` already has inline provider provenance rendering that Phase 6 should preserve and potentially refine.
- Routing controls will need to consume `SettingsManager` capability assignments and fallback-chain support through the existing message layer.

</code_context>

<specifics>
## Specific Ideas

- The settings UI should feel like a real settings product surface, not a long diagnostic form.
- Provider overview is intentionally lightweight: name, enabled state, connection/validation status, and selected model are the default scan fields.
- Provider detail is where progressive complexity belongs: model metadata, endpoint overrides, API key lifecycle actions, and usage hints.
- API keys should be treated as replace/delete-only once saved; confidence comes from validation state rather than secret reveal.
- Routing is cross-provider by nature, so its primary editing surface should stay separate from provider detail even if provider detail shows where a provider is currently used.

</specifics>

<deferred>
## Deferred Ideas

- Full app-wide persistent provider badges across all chrome/UI surfaces are out of scope; inline provenance near the relevant request/response flow is sufficient for this phase.
- A full model-catalog administration console is not required as the default Phase 6 settings experience; advanced model metadata editing should stay progressive.

</deferred>

---

*Phase: 06-settings-ui*
*Context gathered: 2026-03-29*
