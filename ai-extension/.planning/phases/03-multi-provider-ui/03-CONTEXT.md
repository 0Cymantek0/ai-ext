# Phase 03: Multi-Provider Integration & UI Overhaul - Context

**Gathered:** March 28, 2026
**Status:** Ready for planning

<domain>
## Phase Boundary

Transform the AI extension from a Gemini-only tool into a **Universal AI Orchestrator**. This phase delivers support for a wide range of 2026-era models (Claude 4.6 series, GPT 5.4 series, GLM 5.1, Qwen 3.5, etc.) powered by a local **Gemini Nano-based routing engine**. It also introduces a "Pro" UI with a complete **Model Library** and granular configuration.

</domain>

<decisions>
## Implementation Decisions

### 1. Smart Routing Engine (Gemini Nano Dispatcher)
- **D-01: Smart Mode (Auto):** The default model selection is "Smart Mode." Gemini Nano (Local) analyzes the user's prompt to determine complexity and task type (e.g., "Complex Coding," "Creative Writing," "Summary").
- **D-02: Semantic Mapping:** Each model has a **Routing Bio/Description** (e.g., "Best for multi-step reasoning and system architecture"). Gemini Nano matches the task to the best model bio.
- **D-03: User Override (Trigger Words):** Users can configure "High Effort" and "Low Effort" trigger words (e.g., "Refactor", "Analyze"). If a trigger word is present, the Nano analysis is skipped, and the task is immediately routed to the user's designated high-tier or low-tier model.
- **D-04: Active Selection:** If the user manually picks a model from the dropdown, Smart Mode is disabled for that conversation.

### 2. Model Library & Granular Configuration
- **D-05: Pre-populated Library:** The "Model Library" page (Settings) is pre-populated with 2026 major releases (Claude 4.6 Opus/Sonnet, GPT 5.4 Pro/Nano/Mini, GLM 5.1, Kimi 2.5, Minimax M2.7, Qwen 3.5).
- **D-06: Distinct Model Objects:** GPT 5.4 Pro, Nano, and Mini are distinct models.
- **D-07: Tier Toggles:** Within a model (like GPT 5.4 Nano), users can toggle between specific tiers: **Low, Medium, High, Extra High**. For Claude 4.6, users can toggle **Extended Thinking**.
- **D-08: Per-Model Controls:** Each model supports configuration of API Key, Context Window, Input/Output Token Limits, Temperature, Routing Bio, and Trigger Words.

### 3. UI & UX Refinements
- **D-09: Visual Flow Indicator:** An inline animation (inside the message area) appears during the "Smart Mode" phase. It shows a "Nano Router" icon pulsing with "Scanning Task..." before the final model is selected and the response begins.
- **D-10: Selection Meta:** A small, non-intrusive text line appears below every AI response: `Selected: Claude 4.6 Sonnet (Reason: Complexity score 0.85 - Architecture query)`.
- **D-11: Quick-Tweak Drawer:** A slide-out drawer in the sidepanel for immediate chat-level changes (Tier toggle, Temperature, Smart Mode toggle).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Model Architectures (2026 Context)
- `docs/vision-integration.md` — Reference for Gemini Vision models (Flash, Flash-Lite, Pro).
- (Context fetched from search: Claude 4.6 Opus/Sonnet (1M context), Gemini 3.1 Pro/Flash, GPT 5.4 High/Extra High (native computer use), GLM 5.1, Kimi 2.5, Qwen 3.5).

### Core Extension Foundations
- `src/background/adapters/anthropic-adapter.ts` — Existing adapter pattern for Claude.
- `src/background/adapters/openai-adapter.ts` — Existing adapter pattern for GPT.
- `src/background/adapters/google-cloud-adapter.ts` — Existing adapter pattern for Gemini.
- `src/background/provider-config-manager.ts` — Handles encrypted API key storage and provider settings.
- `src/background/query-router.ts` — Current (Gemini-only) routing logic to be refactored.
- `src/sidepanel/ChatApp.tsx` — Main UI container for sidepanel chat.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`ProviderFactory`**: Already set up to create adapters for OpenAI, Anthropic, Google, and Nano. Use this to unify the dispatch logic.
- **`ProviderConfigManager`**: Already handles key encryption and model settings storage. Needs expansion for bios and tiers.
- **`ModeSwitcher.tsx`**: Current UI for switching "Ask" vs "Write" modes. Can be evolved or adapted for "Model Selection."

### Integration Points
- **`query-router.ts`**: This is where the Gemini Nano classification logic must be injected.
- **`background/ai-manager.ts`**: The central dispatch point that needs to move from Gemini-only to `ProviderFactory`-aware.
- **`sidepanel/sidepanel.html`**: Will host the new Model Library (Settings) view.

</code_context>

<specifics>
## Specific Ideas

- **Visual Flow Indicator**: "I want to see the Nano icon light up, then 'Scanning Task...', then 'Routed to [Model]'."
- **Model Tiers**: "GPT 5.4 Nano/Mini/Low/Medium/High/Extra High should be granularly selectable via a toggle if supported by the model."
- **Settings Overhaul**: "Mixture of a full-screen library page for deep config and a slide-out drawer for quick tweaks during chat."

</specifics>

<deferred>
## Deferred Ideas

### Reviewed Todos (not folded)
- **Zork Game Integration**: Postponed. The AI engine is ready, but the UI work is deferred to favor the core extension's model library overhaul.
- **PDF Ingestion**: Mentioned in Phase 2 next steps; deferred to Phase 4 or 5 after the model library is stable.

</deferred>

---

*Phase: 03-multi-provider-ui*
*Context gathered: March 28, 2026*
