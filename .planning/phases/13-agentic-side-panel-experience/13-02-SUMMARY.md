---
phase: 13-agentic-side-panel-experience
plan: 02
subsystem: ui
tags: [react, timeline, agent-runtime, typed-messages, run-history]

requires:
  - phase: 13-agentic-side-panel-experience
    provides: AgentPanelLayout, BrowserActionPanel, DeepResearchPanel extracted from ChatApp
provides:
  - Shared AgentTimeline and AgentTimelineEntry components for live and historical rendering
  - Typed AGENT_RUN_HISTORY_LIST and AGENT_RUN_HISTORY_DETAIL message transport
  - RunHistoryPanel for browsing/filtering completed runs
  - RunHistoryItem for rendering individual run summaries
  - RunReviewPanel for hydrated review of selected completed runs
  - ChatApp wiring for run history affordance, selection, and review
affects: [13-03, 13-04]

tech-stack:
  added: []
  patterns:
    - "Shared timeline component pattern: AgentTimeline wraps AgentTimelineEntry, both accept projected AgentTimelineEntry[] from selectAgentTimeline()"
    - "Typed history transport: AGENT_RUN_HISTORY_LIST returns AgentRun[], AGENT_RUN_HISTORY_DETAIL returns same shape as AgentRunStatusPayload"
    - "Historical review independence: selectedHistoricalRun state separate from live browserAction/deepResearch state"

key-files:
  created:
    - ai-extension/src/sidepanel/components/AgentTimeline.tsx
    - ai-extension/src/sidepanel/components/AgentTimelineEntry.tsx
    - ai-extension/src/sidepanel/components/RunHistoryItem.tsx
    - ai-extension/src/sidepanel/components/RunHistoryPanel.tsx
    - ai-extension/src/sidepanel/components/RunReviewPanel.tsx
    - ai-extension/tests/sidepanel/agent-timeline.test.tsx
    - ai-extension/tests/sidepanel/run-history-panel.test.tsx
    - ai-extension/tests/sidepanel/run-review-panel.test.tsx
  modified:
    - ai-extension/src/shared/types/index.d.ts
    - ai-extension/src/background/service-worker.ts
    - ai-extension/src/sidepanel/ChatApp.tsx
    - ai-extension/src/sidepanel/components/BrowserActionPanel.tsx
    - ai-extension/src/sidepanel/components/DeepResearchPanel.tsx

key-decisions:
  - "AgentTimelineEntry uses entry.type for icon/color only, renders display text from entry.label and entry.detail projected by selectAgentTimeline()"
  - "AgentTimeline sorts newest-first for display, caps items with maxItems for compact live mode, shows all in full review mode"
  - "Service worker delegates to agentRuntimeService.listRuns() and getTimeline() via new typed handlers — no direct sidepanel IndexedDB access"
  - "RunReviewPanel accepts hydrated data as props from ChatApp rather than fetching on its own"
  - "Historical review state (selectedHistoricalRun, selectedHistoricalTimeline) stays independent from live workflow state"

patterns-established:
  - "Typed history transport: AGENT_RUN_HISTORY_LIST for listing, AGENT_RUN_HISTORY_DETAIL for hydrated single-run detail"
  - "Mode-aware filtering: RunHistoryPanel supports all/browser-action/deep-research filter tabs"
  - "Review surface sections: RunReviewPanel shows summary/status, timeline, artifacts, evidence, terminal outcome"

requirements-completed: [UX-02, UX-04]

duration: 24min
completed: 2026-03-30
---

# Phase 13 Plan 02: Shared Timeline and Historical Review Summary

Shared timeline components driven by projected selector output, typed history transport through service worker, and hydrated run review surface for completed browser-action and deep-research runs.

## Performance

- **Duration:** 24 min
- **Started:** 2026-03-30T23:17:30Z
- **Completed:** 2026-03-30T23:41:42Z
- **Tasks:** 4
- **Files modified:** 11

## Accomplishments
- Built shared AgentTimeline/AgentTimelineEntry components that both live panels and historical review use for consistent timeline rendering
- Added typed AGENT_RUN_HISTORY_LIST and AGENT_RUN_HISTORY_DETAIL message handlers in the service worker, delegating to existing agentRuntimeService methods
- Created RunHistoryPanel with mode filtering and RunReviewPanel with full review sections (summary, timeline, artifacts, evidence, terminal outcome)
- Wired ChatApp with independent historical review state that does not clobber live workflow state

## Task Commits

Each task was committed atomically:

1. **Task 0: Wave 0 tests** - `65d7928` (test)
2. **Task 1: Shared timeline primitives** - `d1187b9` (feat)
3. **Task 2: Typed transport and review components** - `d4c7947` (feat)
4. **Task 3: ChatApp wiring** - `eb820c1` (feat)

## Files Created/Modified
- `ai-extension/src/sidepanel/components/AgentTimeline.tsx` - Shared timeline container with newest-first sort, maxItems, collapsible, empty state
- `ai-extension/src/sidepanel/components/AgentTimelineEntry.tsx` - Single timeline row with type-based icon/tone and projected label/detail text
- `ai-extension/src/sidepanel/components/RunHistoryItem.tsx` - Individual run summary row with mode icon, status badge, duration, timestamp
- `ai-extension/src/sidepanel/components/RunHistoryPanel.tsx` - Run browsing surface with mode filter tabs and loading/empty states
- `ai-extension/src/sidepanel/components/RunReviewPanel.tsx` - Hydrated review surface with summary, timeline, artifacts, evidence, terminal outcome sections
- `ai-extension/src/shared/types/index.d.ts` - Added AGENT_RUN_HISTORY_LIST/DETAIL to MessageKind, added payload/result interfaces
- `ai-extension/src/background/service-worker.ts` - Added history list and detail handlers delegating to agentRuntimeService
- `ai-extension/src/sidepanel/ChatApp.tsx` - Added historical review state, handlers, and panel rendering
- `ai-extension/src/sidepanel/components/BrowserActionPanel.tsx` - Replaced inline timeline with shared AgentTimeline
- `ai-extension/src/sidepanel/components/DeepResearchPanel.tsx` - Replaced inline timeline with shared AgentTimeline
- `ai-extension/tests/sidepanel/agent-timeline.test.tsx` - 14 tests for timeline component contract
- `ai-extension/tests/sidepanel/run-history-panel.test.tsx` - 16 tests for history panel
- `ai-extension/tests/sidepanel/run-review-panel.test.tsx` - 16 tests for review panel

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None.

## Self-Check: PASSED

- All 8 created files verified present
- All 4 commit hashes verified in git log
- Build passes clean (pnpm build)
- 49 tests pass across 5 test files
