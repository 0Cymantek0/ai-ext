---
phase: 05-integration
plan: 03
subsystem: api, testing
tags: [chrome-extension, service-worker, speech-to-text, vitest, typescript]

# Dependency graph
requires:
  - phase: 05-integration/02
    provides: "Background transcription executor and provider-backed STT normalization"
  - phase: 04-additional-providers/03
    provides: "Typed provider and speech settings message families"
provides:
  - "Typed AI_PROCESS_REQUEST and AUDIO_TRANSCRIBE_REQUEST service-worker contracts"
  - "Provider metadata fields on AI stream start/end payloads"
  - "Media capture transcription routed through the background STT executor"
affects: [phase-05-04-stream-provenance, phase-06-settings-ui, content-capture]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Typed message-handler payloads at the service-worker seam", "Content-script audio transcription delegated to background executor via base64 payloads"]

key-files:
  created:
    - ai-extension/tests/service-worker-ai-process-request.test.ts
    - ai-extension/tests/service-worker-settings-messages.test.ts
    - ai-extension/tests/streaming-handler-provider-metadata.test.ts
    - ai-extension/tests/media-transcription.integration.test.ts
  modified:
    - ai-extension/src/shared/types/index.d.ts
    - ai-extension/src/background/service-worker.ts
    - ai-extension/src/background/streaming-handler.ts
    - ai-extension/src/content/media-capture.ts

key-decisions:
  - "Kept AI_PROCESS_REQUEST and existing settings message kinds, but tightened payload typing instead of creating parallel provider-only messages"
  - "Used AUDIO_TRANSCRIBE_REQUEST as the shared content-to-background STT seam so runtime and media capture hit the same TranscriptionExecutor"

patterns-established:
  - "Service-worker handlers for provider-aware surfaces should import shared payload types rather than casting payload as any"
  - "Content-side audio transcription serializes fetched media into base64 and delegates execution to the background"

requirements-completed: [STT-02, INT-02]

# Metrics
duration: 7min
completed: 2026-03-29
---

# Phase 05 Plan 03: Typed service-worker transcription wiring and provider-aware media capture

**Typed AI process and speech-transcription contracts now flow through the service worker, and media capture uses the background STT executor instead of a placeholder string**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-28T22:51:00Z
- **Completed:** 2026-03-28T22:58:23Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Added typed `AiProcessRequestPayload`/`AiProcessResponsePayload`, `AudioTranscribe*` payloads, and `AiStreamStartPayload` plus provider metadata on stream end payloads.
- Replaced `payload: any` on the relevant service-worker provider/settings handlers and registered a real `AUDIO_TRANSCRIBE_REQUEST` handler backed by `TranscriptionExecutor`.
- Removed the media-capture transcription placeholder and routed captured audio through typed background messaging with regression coverage.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add typed provider-aware chat, transcription, and settings contracts to the service worker surface** - `3f19009` (test), `858085a` (feat)
2. **Task 2: Replace media-capture transcription placeholder with the background STT flow** - `63bf9a6` (test), `719da45` (feat)

## Files Created/Modified
- `ai-extension/src/shared/types/index.d.ts` - Expanded shared contracts for provider-aware AI process, audio transcription, and stream provenance metadata.
- `ai-extension/src/background/service-worker.ts` - Typed AI/settings handlers and wired `AUDIO_TRANSCRIBE_REQUEST` through `TranscriptionExecutor`.
- `ai-extension/src/background/streaming-handler.ts` - Aligned stream-start payload creation with the shared typed contract.
- `ai-extension/src/content/media-capture.ts` - Fetches audio, serializes to base64, and calls the typed background transcription message.
- `ai-extension/tests/service-worker-ai-process-request.test.ts` - Locks the typed AI process and transcription service-worker seam.
- `ai-extension/tests/service-worker-settings-messages.test.ts` - Preserves the provider/speech settings message family while asserting typed handler signatures.
- `ai-extension/tests/streaming-handler-provider-metadata.test.ts` - Locks the stream metadata contract for provider/fallback provenance.
- `ai-extension/tests/media-transcription.integration.test.ts` - Verifies media capture uses the shared STT payload shape and handles background errors.

## Decisions Made
- Preserved the existing `AI_PROCESS_REQUEST`, `PROVIDER_SETTINGS_*`, and `SPEECH_SETTINGS_*` message families to satisfy the phase migration constraints while eliminating loose handler payload typing.
- Kept content-script transcription transport as base64 plus metadata keys `audioBase64`, `mimeType`, `fileName`, `durationMs`, and `sourceUrl` so the background remains the only STT execution boundary.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- `pnpm run lint` fails due pre-existing repo issues outside this plan, including parser configuration for `src/__tests__/contentCapture.capture.spec.ts` and widespread CRLF/prettier violations in untouched files.
- `pnpm build` fails due an existing dependency mismatch: `@ai-sdk/gateway` imports `lazyValidator` from `@ai-sdk/provider-utils`, but the installed provider-utils package does not export it.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- The service worker now exposes typed provider-aware seams for runtime chat and transcription work.
- Phase `05-04` can add persistence of provider/fallback provenance using the locked stream metadata contract without reopening the content/background STT path.

## Known Stubs

- `ai-extension/src/content/media-capture.ts:524` and `ai-extension/src/content/media-capture.ts:525` still use placeholder size estimates for aggregate audio/video byte counts. These comments were pre-existing and do not block the transcription goal of this plan.

## Self-Check: PASSED

- Verified summary file exists at `.planning/phases/05-integration/05-03-SUMMARY.md`
- Verified task commits exist: `3f19009`, `858085a`, `63bf9a6`, `719da45`

---
*Phase: 05-integration*
*Completed: 2026-03-29*
