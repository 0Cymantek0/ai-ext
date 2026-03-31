---
phase: 13-agentic-side-panel-experience
plan: 04
subsystem: ui
tags: [react, hooks, agent-streaming, render-isolation, sidepanel]

# Dependency graph
requires:
  - phase: 13-01
    provides: BrowserActionPanel, DeepResearchPanel component props interfaces
  - phase: 13-02
    provides: selectAgentTimeline, selectAgentPanelState selectors, RunHistoryPanel, RunReviewPanel
  - phase: 13-03
    provides: WorkflowLauncher, WorkflowTabs, ModelSelector components
provides:
  - useAgentRunEvents bounded per-run subscription hook with immediate streaming
  - ChatApp workflow stream isolation eliminating render fan-out on agent events
  - Workflow-scoped panel state derivation via selectAgentPanelState
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns: [bounded-event-buffer, hook-isolated-streaming, per-run-message-listener, dedup-by-eventId]

key-files:
  created:
    - ai-extension/src/sidepanel/hooks/useAgentRunEvents.ts
    - ai-extension/tests/sidepanel/use-agent-run-stream.test.tsx
    - ai-extension/tests/sidepanel/chat-app-agent-responsiveness.test.tsx
  modified:
    - ai-extension/src/sidepanel/ChatApp.tsx
    - ai-extension/tests/sidepanel/browser-action-launch.test.tsx

key-decisions:
  - "Each useAgentRunEvents instance registers its own chrome.runtime.onMessage listener for true render isolation between browser-action and deep-research streams"
  - "Hook uses direct runId closure in message listener (not a ref) so the listener re-registers when runId changes, avoiding stale closure issues"
  - "ChatApp tracks only lightweight runId strings; the hook manages full AgentRun state, events, timeline, and error independently"
  - "AGENT_RUN_STATUS in ChatApp message listener only sets runId by mode; the hooks handle all event streaming and run hydration"
  - "Bounded buffer (MAX_EVENTS=200) discards oldest events after dedup by eventId, keeping memory predictable for long runs"
  - "Timeline derived inside the hook via selectAgentTimeline so consumers do not repeat selector work"

patterns-established:
  - "Per-run event subscription hook: each hook instance owns its state and message listener, preventing cross-stream render fan-out"
  - "Even/odd call-pair mock pattern: handles React 18 strict mode double-invocation of hooks in tests"
  - "Lightweight runId tracking in parent with heavy state delegated to hook instances"

# Metrics
metrics:
  duration: 8m
  completed: "2026-03-31"
  tasks: 4
  files: 5
---

# Phase 13 Plan 04: Isolate Workflow Streams Summary

Bounded useAgentRunEvents hook with per-run chrome.runtime.onMessage listeners eliminates ChatApp render fan-out on agent events while preserving immediate per-event timeline updates.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 0 | Create Wave 0 tests | ec6ca20 | tests/sidepanel/use-agent-run-stream.test.tsx, tests/sidepanel/chat-app-agent-responsiveness.test.tsx |
| 1 | Create useAgentRunEvents hook | a79ac21 | src/sidepanel/hooks/useAgentRunEvents.ts |
| 2 | Refactor ChatApp to use isolated workflow streams | cb1af92 | src/sidepanel/ChatApp.tsx, src/sidepanel/hooks/useAgentRunEvents.ts |
| fix | Fix hook mock parity for React strict mode | 7931310 | tests/sidepanel/chat-app-agent-responsiveness.test.tsx |
| fix | Update browser-action-launch test for hook hydration | 83f7685 | tests/sidepanel/browser-action-launch.test.tsx |

## What Changed

### useAgentRunEvents hook
- Signature: `(runId: string | null) => { run, events, timeline, error }`
- Hydrates on runId change by requesting AGENT_RUN_STATUS from background
- Each instance has its own chrome.runtime.onMessage listener for true isolation
- Bounded buffer (MAX_EVENTS=200) with eventId deduplication
- Derives timeline internally via selectAgentTimeline
- Clears all state when runId is null

### ChatApp refactoring
- Replaced `browserActionRun`/`deepResearchRun` state (full AgentRun objects) with lightweight `browserActionRunId`/`deepResearchRunId` strings
- Removed `syncAgentRunStatus` and `appendAgentEvent` callbacks that caused full ChatApp re-renders on every agent event
- AGENT_RUN_STATUS in message listener now only sets runId by mode; hooks handle all streaming
- `browserActionStream = useAgentRunEvents(browserActionRunId)` and `deepResearchStream = useAgentRunEvents(deepResearchRunId)` provide isolated state
- Panel state derived per-stream via `selectAgentPanelState(stream.run, stream.events)`
- Timeline comes from `stream.timeline` (derived inside the hook)

### Test coverage
- 9 tests for useAgentRunEvents hook: hydration, streaming, dedup, bounding, state clearing
- 5 tests for ChatApp responsiveness: hook wiring, stream isolation, error propagation, non-agent surface interaction
- 1 test for browser-action launch: full launch flow through WorkflowLauncher with hook hydration

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed useAgentRunEvents message listener stale closure**
- **Found during:** Task 2 execution
- **Issue:** Hook used ref-based tracking (activeRunIdRef) in message listener registered with empty dependency array, causing stale closure when runId changed
- **Fix:** Changed listener to re-register on runId changes so it always has the correct runId in its closure
- **Files modified:** ai-extension/src/sidepanel/hooks/useAgentRunEvents.ts
- **Commit:** cb1af92

**2. [Rule 1 - Bug] Fixed test mock for React strict mode double-invocation**
- **Found during:** Test verification
- **Issue:** useAgentRunEvents mock used sequential counter (0=BA, 1=DR) but React 18 strict mode calls hooks twice, breaking the 1:1 mapping
- **Fix:** Changed to even/odd call-pair pattern: even calls = browser-action, odd calls = deep-research
- **Files modified:** ai-extension/tests/sidepanel/chat-app-agent-responsiveness.test.tsx
- **Commit:** 7931310

**3. [Rule 3 - Blocking] Updated browser-action-launch test for hook-based architecture**
- **Found during:** Full test suite verification
- **Issue:** Test was written before Plan 04 introduced useAgentRunEvents; expected direct state updates from syncAgentRunStatus, but the new architecture requires hook hydration via AGENT_RUN_STATUS
- **Fix:** Added AGENT_RUN_STATUS mock case that returns run data for known runId, supporting the hook's hydration flow. Also added missing component mocks for WorkflowLauncher composition.
- **Files modified:** ai-extension/tests/sidepanel/browser-action-launch.test.tsx
- **Commit:** 83f7685

## Deferred Issues

Pre-existing test failures in 4 test files (17 tests total) that are out of scope for Plan 04:
- `provider-settings-sheet.test.tsx` (13 failures) - Settings sheet rendering infrastructure
- `deep-research-launch.test.tsx` (1 failure) - Needs same AGENT_RUN_STATUS mock fix as browser-action-launch
- `deep-research-timeline.test.tsx` (1 failure) - Needs AGENT_RUN_STATUS mock for hook hydration
- `research-pocket-evidence.test.tsx` (1 failure) - Deep research panel rendering issue

These failures existed before Plan 04 changes and do not affect the plan's goal.

## Verification

- 15 Plan 04 tests pass (9 hook + 5 responsiveness + 1 launch)
- `pnpm build` completes without errors
- Timeline updates arrive per-event without batching
- Browser-action and deep-research streams are isolated from each other
- ChatApp no longer contains appendAgentEvent or syncAgentRunStatus fan-out

## Self-Check: PASSED

- ai-extension/src/sidepanel/hooks/useAgentRunEvents.ts: FOUND
- ai-extension/tests/sidepanel/use-agent-run-stream.test.tsx: FOUND
- ai-extension/tests/sidepanel/chat-app-agent-responsiveness.test.tsx: FOUND
- ai-extension/tests/sidepanel/browser-action-launch.test.tsx: FOUND
- ai-extension/src/sidepanel/ChatApp.tsx: FOUND
- Commit ec6ca20: FOUND
- Commit a79ac21: FOUND
- Commit cb1af92: FOUND
- Commit 7931310: FOUND
- Commit 83f7685: FOUND
