---
phase: 04-additional-providers
plan: 03
subsystem: ui, settings
tags: [react, sidepanel, speech-to-text, provider-settings, chrome-extension, vitest]

# Dependency graph
requires:
  - phase: 04-additional-providers/02
    provides: "Routing types, SettingsManager, ProviderConfigManager, model catalog"
provides:
  - "Sidepanel provider settings sheet with custom endpoint form"
  - "Speech settings section with provider-aware controls"
  - "Typed message contracts for provider/STT settings persistence"
  - "Background handlers for provider CRUD and speech settings load/save"
affects: [phase-06-settings-redesign, phase-05-stt-integration]

# Tech tracking
tech-stack:
  added: ["@testing-library/react user-event for form interaction tests"]
  patterns: ["Settings sheet as overlay panel in sidepanel", "chrome.runtime.sendMessage for settings persistence from UI"]

key-files:
  created:
    - ai-extension/src/sidepanel/components/ProviderSettingsSheet.tsx
    - ai-extension/src/sidepanel/components/CustomEndpointForm.tsx
    - ai-extension/src/sidepanel/components/SpeechSettingsSection.tsx
    - ai-extension/tests/sidepanel/provider-settings-sheet.test.tsx
  modified:
    - ai-extension/src/shared/types/index.d.ts
    - ai-extension/src/background/service-worker.ts
    - ai-extension/src/components/TopBar.tsx
    - ai-extension/src/sidepanel/ChatApp.tsx

key-decisions:
  - "Overlay panel pattern for settings instead of Sheet/Dialog (no shadcn Sheet available)"
  - "Lazy initialization of SettingsManager singleton in service worker handlers"
  - "Provider-aware STT controls: translation/diarization only shown when provider supports them"
  - "URL validation via new URL() constructor in CustomEndpointForm"

patterns-established:
  - "Settings components in src/sidepanel/components/ using chrome.runtime.sendMessage"
  - "STT provider metadata catalog (STT_PROVIDERS) for gating UI controls"
  - "Message contract pattern: LOAD/SAVE pairs for settings persistence"

requirements-completed: [UI-05, PROV-02, STT-01, STT-03]

# Metrics
duration: 16min
completed: 2026-03-28
---

# Phase 04 Plan 03: Provider Settings UI Summary

**Minimal sidepanel settings surface with custom endpoint form, STT controls, and typed message contracts for provider/STT persistence**

## Performance

- **Duration:** 16 min
- **Started:** 2026-03-28T20:20:26Z
- **Completed:** 2026-03-28T20:36:00Z
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments
- Typed message contracts (5 new kinds) and background handlers for provider CRUD and speech settings persistence
- Provider settings sheet accessible from TopBar gear icon with add/delete/toggle provider management
- Custom endpoint form with URL validation, optional API key support for local providers (Ollama, custom)
- Speech settings section with provider/model/language/timestamp granularity controls and provider-aware advanced options
- 17 passing UI tests covering custom endpoint validation, optional API key, speech settings persistence

## Task Commits

Each task was committed atomically:

1. **Task 1: Add typed message contracts and background handlers** - `27a8275` (feat)
2. **Task 2: Build provider settings sheet in sidepanel** - `1f9a299` (feat)
3. **Task 3: Add STT settings section and UI tests** - `d6a0db6` (feat)

## Files Created/Modified
- `ai-extension/src/shared/types/index.d.ts` - Added 5 new MessageKind entries and 6 payload interfaces for provider/STT settings
- `ai-extension/src/background/service-worker.ts` - Added 6 message handlers for provider/STT settings with SettingsManager and ProviderConfigManager integration
- `ai-extension/src/components/TopBar.tsx` - Added settings gear button with onOpenProviderSettings callback
- `ai-extension/src/sidepanel/ChatApp.tsx` - Mounted ProviderSettingsSheet with open/close state
- `ai-extension/src/sidepanel/components/ProviderSettingsSheet.tsx` - Provider list, add/delete/toggle, speech settings section
- `ai-extension/src/sidepanel/components/CustomEndpointForm.tsx` - Custom endpoint form with URL validation, provider type selector, optional API key
- `ai-extension/src/sidepanel/components/SpeechSettingsSection.tsx` - STT provider/model/language/timestampGranularity with provider-aware controls
- `ai-extension/tests/sidepanel/provider-settings-sheet.test.tsx` - 17 tests for all settings components

## Decisions Made
- Used overlay panel pattern instead of shadcn Sheet (no Sheet component available in project)
- SettingsManager initialized lazily in service worker since it doesn't need async init
- STT provider catalog (STT_PROVIDERS array) gates translation/diarization UI controls per-provider capabilities
- URL validation uses native `new URL()` constructor for browser-safe parsing

## Self-Check: PASSED

- All 8 created/modified files verified present
- All 3 task commits verified (27a8275, 1f9a299, d6a0db6)
- 17/17 tests passing
- `pnpm build` succeeds

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- TypeScript strict mode (`exactOptionalPropertyTypes`) required conditional API key construction in addProvider call
- `DEFAULT_BASE_URLS` not exported from model-catalog.ts; removed unused import from validation handler
- Test for provider type selector needed `initialValues` approach instead of runtime select change due to jsdom limitations

## Next Phase Readiness
- Provider settings UI complete, users can configure custom endpoints and STT providers from sidepanel
- Speech settings persist through SettingsManager with Zod validation
- Ready for Phase 05 STT integration (actual audio capture and transcription)
- Phase 06 settings redesign will extend this minimal surface into full settings UX

---
*Phase: 04-additional-providers*
*Completed: 2026-03-28*

## Self-Check: PASSED

- All 8 created/modified files verified present
- All 3 task commits verified (27a8275, 1f9a299, d6a0db6)
- 17/17 tests passing
- `pnpm build` succeeds
