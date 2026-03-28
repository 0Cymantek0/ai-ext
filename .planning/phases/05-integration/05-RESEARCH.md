# Phase 5: Integration - Research

**Researched:** 2026-03-29
**Domain:** Chrome extension MV3 runtime integration for multi-provider chat and STT
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
### Chat Integration Path
- **D-01:** Keep the existing streaming and mode-aware orchestration layers, but replace their final model execution path so requests are fulfilled through the provider-routing system rather than the legacy Gemini-only execution path.
- **D-02:** Phase 5 should be an internal integration swap under the current chat and streaming flow, not a wholesale replacement of the current streaming stack.

### Legacy Engine Role
- **D-03:** `HybridAIEngine` should remain as a compatibility shim for older call sites during Phase 5 while new execution flows move to provider routing.
- **D-04:** The provider-aware path becomes the primary execution path for new integrations, while the legacy engine is retained to reduce breakage risk during migration.

### Speech-to-Text Integration Scope
- **D-05:** Phase 5 must wire speech-to-text end to end for both background/runtime transcription requests and the existing content/media transcription path.
- **D-06:** Persisted speech settings from Phase 4 are not just configuration state anymore; they must drive actual provider/model selection during transcription execution.

### Message Contract Migration
- **D-07:** Preserve existing message kinds where practical, but update their handler implementations and payload handling to use typed provider-aware contracts internally.
- **D-08:** The system should avoid creating a parallel provider-only message family unless a capability genuinely cannot fit the current contract surface.
- **D-09:** All provider-related messages in this phase must use typed contracts consistently so service-worker integrations stop depending on loose `any` payloads.

### Conversation Continuity
- **D-10:** Existing conversation history remains valid after provider configuration changes.
- **D-11:** Historical messages should preserve metadata about which provider/model produced them, while new turns use the latest routing configuration at execution time.

### Fallback Visibility
- **D-12:** Provider fallback during chat should be recorded in response metadata and surfaced anywhere the UI already exposes provider/model information, but it should not interrupt the response flow with blocking prompts or warnings.

### the agent's Discretion
- Exact abstraction boundary between `HybridAIEngine` compatibility code and the new provider-routed execution path
- Exact metadata field names for fallback/provider/model tracking
- Whether chat and transcription share a lower-level provider execution helper or use separate adapters behind the same routing rules
- How far to tighten service-worker handler payload typing in this phase versus leaving some legacy wrappers in place

### Deferred Ideas (OUT OF SCOPE)
- Full settings information architecture and polished provider/status UI remain Phase 6 work.
- A wholesale rewrite of the chat/streaming stack is out of scope for this phase unless integration uncovers a hard blocker.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| STT-02 | System routes audio transcription to selected STT provider | Use a background provider-execution service that resolves `SpeechSettings` from `SettingsManager`, validates the configured speech model/provider, and exposes typed `transcribeAudio()` entry points for service-worker and media-capture flows. |
| INT-02 | Existing `hybrid-ai-engine.ts` delegates to new provider router | Keep `HybridAIEngine` as facade/compatibility shim, but move actual model execution to a provider-routed executor used by `ModeAwareProcessor` and `StreamingHandler`. |
| INT-03 | Existing conversations continue working after provider changes | Preserve old message shape, add provider/model/fallback metadata additively, and ensure new turns resolve current routing config at execution time rather than mutating prior conversation records. |
</phase_requirements>

## Summary

Phase 5 is an integration phase, not a new architecture phase. The repo already has most of the required primitives: `ProviderRouter`, `SettingsManager`, typed speech settings, provider adapters, streaming orchestration, and conversation persistence. The gap is that the live runtime still terminates in Gemini-specific execution paths. `HybridAIEngine`, `ModeAwareProcessor`, `StreamingHandler`, and `service-worker.ts` still assume Gemini-only sources and metadata, while `media-capture.ts` still contains a transcription placeholder.

The safest planning model is to introduce one provider-execution layer in the background that sits between orchestration and adapters. That service should own provider/model resolution, fallback execution, chat streaming/text generation, and STT execution. `HybridAIEngine` remains in place as a compatibility facade, but it should stop making direct `CloudAIManager` decisions for new flows. Conversation continuity must be handled additively: historical records stay readable, new turns write richer provider metadata, and provider changes must affect only future executions.

Chrome MV3 guidance reinforces two constraints that matter here: service-worker state must be persisted rather than assumed in globals, and `chrome.runtime.onMessage` async compatibility still favors `return true` for broad support even though Chrome 146 has promise-return support rolling out. That fits the current codebase and argues against a message-system rewrite during this phase.

**Primary recommendation:** Plan Phase 5 around a new background `ProviderExecutionService` that `HybridAIEngine` delegates to, and use it for both chat and STT while keeping current streaming/message surfaces backward-compatible.

## User Constraints

### Project Constraints (from CLAUDE.md)
- Use `pnpm` for Node/JS package commands.
- Do not run watch mode or continuously running processes.
- Use single-run test/build commands.
- Maintain MV3 typed message passing; avoid loose direct message usage.
- Focus tests on message handlers and component integration.
- Preserve Gemini Nano as a supported provider option.
- Treat service-worker lifecycle as ephemeral; persisted storage is the source of truth.
- Keep API keys device-local and encrypted at rest in `chrome.storage.local`.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Internal `ProviderRouter` + `SettingsManager` | repo-local | Resolve provider/model per capability and persist routing/STT settings | Already implemented and matches locked Phase 3/4 decisions; adding a second routing source would create drift. |
| `ai` | repo `5.0.81`; registry current `6.0.141` (published 2026-03-27) | Provider-agnostic text generation and streaming primitives | Existing provider adapters are already built around AI SDK-compatible models; Phase 5 should reuse that abstraction instead of building custom transport code. |
| `@ai-sdk/openai` | repo `3.0.48`; registry current `3.0.48` (published 2026-03-23) | OpenAI provider models | Already in repo; no upgrade needed for Phase 5. |
| `@ai-sdk/google` | repo `3.0.53`; registry current `3.0.53` (published 2026-03-23) | Google provider models | Already in repo; aligns with current provider adapters. |
| `@ai-sdk/anthropic` | repo `3.0.64`; registry current `3.0.64` (published 2026-03-24) | Anthropic provider models | Already in repo; aligns with current provider adapters. |
| Chrome extension messaging APIs | Chrome 146 installed | Service-worker/content/UI communication | This phase is fundamentally a message-handler integration phase; use official MV3 messaging patterns, not custom buses. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `zod` | repo `3.25.76`; registry current `4.3.6` | Runtime validation for typed message payloads/settings | Keep using for new typed provider/STT message contracts and internal executor inputs. |
| `vitest` | repo `2.1.1`; registry current `4.1.2` | Unit/integration testing | Use existing test stack; Phase 5 should add tests, not migrate frameworks. |
| IndexedDB manager | repo-local | Conversation persistence | Use for additive metadata persistence and continuity validation. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Reusing `HybridAIEngine` as facade | Replacing it outright | Faster cleanup long-term, but contradicts locked decision D-03/D-04 and raises migration risk. |
| Adding a provider execution service | Calling adapters directly from `StreamingHandler` and `service-worker.ts` | Simpler initially, but duplicates fallback/model resolution logic and makes STT/chat diverge. |
| Preserving current message kinds with typed payloads | Creating a brand-new provider-only message family | Cleaner on paper, but contradicts D-07/D-08 and increases migration surface for the UI/service worker. |

**Installation:**
```bash
pnpm install
```

**Version verification:** Verified via `pnpm view` on 2026-03-29. Current registry versions are newer than some repo-pinned packages, but Phase 5 should stay on the repo’s installed versions unless a concrete blocker appears.

## Architecture Patterns

### Recommended Project Structure
```text
ai-extension/src/background/
├── routing/                    # ProviderRouter, SettingsManager, routing types
├── provider-execution/         # New Phase 5 execution layer
│   ├── provider-execution-service.ts
│   ├── chat-executor.ts
│   └── transcription-executor.ts
├── hybrid-ai-engine.ts         # Compatibility facade delegating to provider execution
├── streaming-handler.ts        # Existing orchestration, upgraded metadata
├── mode-aware-processor.ts     # Existing pipeline assembly, upgraded execution calls
└── service-worker.ts           # Typed handlers only
```

### Pattern 1: Compatibility Facade Over New Execution Core
**What:** Keep `HybridAIEngine` public shape stable while delegating actual execution to a provider-routed service.
**When to use:** Any legacy call site that still expects Gemini-era engine semantics.
**Example:**
```typescript
// Source: repo pattern + AI SDK docs
class ProviderExecutionService {
  async streamChat(request: ProviderChatRequest) {
    const resolved = await this.resolveChatTarget(request);
    return streamText({
      model: resolved.model,
      messages: request.messages,
    });
  }
}

class HybridAIEngine {
  constructor(private execution: ProviderExecutionService) {}

  async *processContentStreaming(task: Task, options?: ProcessingOptions) {
    yield* this.execution.streamLegacyTask(task, options);
  }
}
```

### Pattern 2: Additive Conversation Metadata
**What:** Keep existing `source` fields for backward compatibility, but add provider/model/fallback metadata under `metadata`.
**When to use:** Persisting any new assistant turn after provider routing is introduced.
**Example:**
```typescript
// Source: repo persistence pattern
await indexedDBManager.updateConversation(conversationId, {
  id: messageId,
  role: "assistant",
  content,
  timestamp: Date.now(),
  source: legacySourceLabel,
  metadata: {
    tokensUsed,
    processingTime,
    mode,
    providerId,
    modelId,
    fallbackFromProviderId,
    fallbackOccurred,
  },
});
```

### Pattern 3: Background-Owned STT Execution
**What:** Content-side audio capture sends typed data to the background; the background resolves speech settings and executes STT.
**When to use:** Any media transcription path, including page media capture and direct runtime transcription.
**Example:**
```typescript
// Source: Chrome messaging docs + repo messaging pattern
const response = await chrome.runtime.sendMessage({
  kind: "AUDIO_TRANSCRIBE_REQUEST",
  payload: {
    audioBase64,
    mimeType,
    durationMs,
  },
});
```

### Anti-Patterns to Avoid
- **Direct `CloudAIManager` calls from new provider-aware flows:** This bypasses capability routing, fallback metadata, and speech settings.
- **Provider/model chosen in the UI layer:** Routing state already lives in background storage; execution should resolve it there.
- **Conversation rewrites after provider changes:** Old turns must remain historical facts, not be re-labeled to match current settings.
- **`async` message listeners without compatibility handling:** Official docs say promise-return support is only rolling out from Chrome 146; keep `return true` compatible patterns for now.
- **Separate chat and STT routing sources:** Both must read from `SettingsManager` / provider metadata, not divergent configs.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Provider fallback selection | Ad hoc retry loops in `service-worker.ts` or `streaming-handler.ts` | Shared provider execution service backed by `ProviderRouter` + `SettingsManager` | Centralizes diagnostics, provider metadata, and retry ordering. |
| Speech settings persistence | New storage keys or custom JSON blobs | Existing `SettingsManager.getSpeechSettings()/setSpeechSettings()` | Already typed and validated with Zod. |
| Message validation | New loose `any` payload conventions | Existing shared `BaseMessage<K, T>` contracts + Zod for internal validation | Keeps service worker, sidepanel, and content scripts aligned. |
| Streaming chunk protocol | Custom chunk/event protocol | Existing `AI_PROCESS_STREAM_*` messages | Already wired through the UI and persistence path. |
| Conversation migration | Bulk rewrites of existing conversation records | Additive metadata on new records only | Avoids risky data migration for INT-03. |

**Key insight:** The hard part of Phase 5 is preserving existing behavior while swapping the execution core. Reuse the repo’s current orchestration and persistence surfaces unless a concrete blocker is proven.

## Common Pitfalls

### Pitfall 1: Replacing Routing But Not Metadata
**What goes wrong:** Chat executes through providers, but persisted messages and stream events still only say `gemini-*`.
**Why it happens:** Execution code is updated, but `StreamingHandler` persistence and sidepanel event payloads stay Gemini-shaped.
**How to avoid:** Define a canonical provider execution result shape first, then map it consistently into stream-end payloads, conversation metadata, and legacy `source`.
**Warning signs:** Responses succeed, but provider switch/fallback is invisible in conversation history.

### Pitfall 2: STT Settings Remain “Save Only”
**What goes wrong:** `SPEECH_SETTINGS_SAVE` works, but transcription still uses a placeholder or hardcoded provider.
**Why it happens:** Settings and execution are implemented in separate layers without a background executor joining them.
**How to avoid:** Make `transcribeAudio()` resolve `SpeechSettings` internally every time it runs.
**Warning signs:** Changing speech provider in storage has no effect on actual transcription behavior.

### Pitfall 3: Breaking Historical Conversations
**What goes wrong:** Provider changes cause old conversation turns to render incorrectly or lose provenance.
**Why it happens:** New metadata fields overwrite or reinterpret older records.
**How to avoid:** Treat previous turns as immutable history; only new turns use new routing config.
**Warning signs:** Opening an old conversation after changing providers mutates displayed source/model data.

### Pitfall 4: MV3 Async Response Drift
**What goes wrong:** New typed handlers work locally on Chrome 146 but fail for users on older/rolling versions.
**Why it happens:** Listener implementations rely on promise-return support alone.
**How to avoid:** Keep `return true` safe paths for async service-worker handlers until wider compatibility is guaranteed.
**Warning signs:** Intermittent “message channel closed” or null responses in handler calls.

### Pitfall 5: Low-Level Adapter Coupling
**What goes wrong:** `StreamingHandler`, `HybridAIEngine`, and STT code each implement their own adapter usage patterns.
**Why it happens:** Planning skips the shared execution boundary and wires directly to adapters.
**How to avoid:** Introduce one execution layer and route all provider-based operations through it.
**Warning signs:** Same provider/model resolution logic appears in multiple files.

## Code Examples

Verified patterns from official sources:

### Stream Text Through a Provider Model
```typescript
// Source: https://sdk.vercel.ai/docs/ai-sdk-core/stream-text
import { streamText } from "ai";

const { textStream } = streamText({
  model: provider("model-id"),
  prompt: "Invent a new holiday and describe its traditions.",
});

for await (const chunk of textStream) {
  console.log(chunk);
}
```

### Generate Text Through a Provider Model
```typescript
// Source: https://sdk.vercel.ai/docs/ai-sdk-core/generating-text
import { generateText } from "ai";

const { text } = await generateText({
  model: provider("model-id"),
  prompt: "Write a vegetarian lasagna recipe for 4 people.",
});
```

### One-Time Message Handler Compatible With MV3 Async Work
```typescript
// Source: https://developer.chrome.com/docs/extensions/develop/concepts/messaging
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  void (async () => {
    const result = await handleMessage(message);
    sendResponse(result);
  })();

  return true;
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Gemini-specific engine chooses local/cloud model directly | Provider-agnostic execution using AI SDK provider models + routing metadata | Repo phases 3-4; AI SDK 5 docs current | Phase 5 should integrate, not invent a second execution model. |
| Async MV3 listeners must use `sendResponse` + `return true` only | Chrome docs now say promise-return support starts rolling out from Chrome 146, but `return true` remains the compatibility path | Chrome docs updated 2025-12-03 | Keep compatibility-safe handlers in Phase 5. |
| Service-worker globals can act like durable state | Official MV3 docs require persisted storage as source of truth because service workers terminate | MV3 migration guidance | Use `chrome.storage` / IndexedDB for routing, speech settings, and conversation state. |

**Deprecated/outdated:**
- Direct Gemini-only execution as the primary path for new provider-enabled features: outdated for this milestone because it bypasses Phase 3/4 routing decisions.
- Placeholder media transcription in `media-capture.ts`: no longer acceptable once STT-02 is implemented.

## Open Questions

1. **Does the roadmap’s “SETTINGS_*” wording require new message kinds, or do existing `PROVIDER_SETTINGS_*` / `SPEECH_SETTINGS_*` handlers satisfy the requirement?**
   - What we know: Shared types and service worker already implement provider/speech-specific settings messages.
   - What's unclear: Whether Phase 5 should add a generic alias family or treat roadmap wording as shorthand.
   - Recommendation: Decide in planning; default to preserving current kinds unless another phase depends on generic `SETTINGS_*` names.

2. **What is the minimum provider metadata shape that UI and persistence both need?**
   - What we know: Locked decision requires provider/model provenance and fallback visibility.
   - What's unclear: Exact field names and whether stream chunk/start messages need the same richness as final persistence.
   - Recommendation: Define one canonical execution result type first, then project it into stream payloads and IndexedDB metadata.

3. **How should STT input be serialized for content/media capture?**
   - What we know: Content-side code cannot own provider execution; background must.
   - What's unclear: Whether current capture flow should send `Blob`, `ArrayBuffer`, or base64 payloads through messaging.
   - Recommendation: Prefer a typed transport that is already safe with extension messaging and tested end-to-end before implementation expands.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Build, tests, typecheck | ✓ | `v22.14.0` | — |
| pnpm | Install, build, test commands | ✓ | `10.7.1` | None; project instructions require pnpm |
| Google Chrome | MV3 runtime/manual validation | ✓ | `146.0.7680.165` | Chromium-based browser for partial validation only |

**Missing dependencies with no fallback:**
- None identified for planning.

**Missing dependencies with fallback:**
- None identified.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest `2.1.1` in repo |
| Config file | `ai-extension/vitest.config.ts` |
| Quick run command | `pnpm exec vitest run tests/provider-router.test.ts tests/settings-manager.test.ts` |
| Full suite command | `pnpm exec vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| STT-02 | Selected speech provider/model is used for transcription execution | integration | `pnpm exec vitest run tests/transcription-executor.test.ts tests/media-transcription.integration.test.ts` | ❌ Wave 0 |
| INT-02 | `HybridAIEngine` delegates to provider execution instead of direct cloud manager logic | unit/integration | `pnpm exec vitest run tests/hybrid-ai-engine-provider-delegation.test.ts` | ❌ Wave 0 |
| INT-03 | Existing conversations stay readable and new turns persist provider-aware metadata after config changes | integration | `pnpm exec vitest run tests/streaming-handler-provider-metadata.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm exec vitest run tests/provider-router.test.ts tests/settings-manager.test.ts`
- **Per wave merge:** `pnpm exec vitest run tests/provider-router.test.ts tests/settings-manager.test.ts tests/hybrid-ai-engine-provider-delegation.test.ts tests/streaming-handler-provider-metadata.test.ts`
- **Phase gate:** `pnpm exec vitest run` and `pnpm build`

### Wave 0 Gaps
- [ ] `ai-extension/tests/hybrid-ai-engine-provider-delegation.test.ts` — covers `INT-02`
- [ ] `ai-extension/tests/transcription-executor.test.ts` — covers `STT-02`
- [ ] `ai-extension/tests/media-transcription.integration.test.ts` — covers `STT-02`
- [ ] `ai-extension/tests/streaming-handler-provider-metadata.test.ts` — covers `INT-03`
- [ ] `ai-extension/tests/service-worker-settings-messages.test.ts` — covers typed settings/provider message compatibility

## Sources

### Primary (HIGH confidence)
- `/vercel/ai` via Context7 — `streamText`, `generateText`, provider model integration, response/provider metadata
- https://developer.chrome.com/docs/extensions/develop/concepts/messaging — MV3 one-time messaging, `runtime.sendMessage`, async response guidance
- https://developer.chrome.com/docs/extensions/develop/migrate/to-service-workers — service-worker ephemerality and persisted state guidance
- https://www.npmjs.com/package/ai?activeTab=versions — package version verification
- https://www.npmjs.com/package/@ai-sdk/openai?activeTab=versions — package version verification
- https://www.npmjs.com/package/@ai-sdk/google?activeTab=versions — package version verification
- https://www.npmjs.com/package/@ai-sdk/anthropic?activeTab=versions — package version verification

### Secondary (MEDIUM confidence)
- Repo implementation surfaces in `ai-extension/src/background/*`, `ai-extension/src/content/media-capture.ts`, and `ai-extension/tests/*`

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - grounded in existing repo dependencies plus verified current docs/registry versions
- Architecture: HIGH - based on locked phase decisions and direct code inspection of current integration seams
- Pitfalls: HIGH - derived from actual current gaps (`HybridAIEngine`, `service-worker.ts`, `media-capture.ts`, conversation persistence) plus official MV3 behavior

**Research date:** 2026-03-29
**Valid until:** 2026-04-28
