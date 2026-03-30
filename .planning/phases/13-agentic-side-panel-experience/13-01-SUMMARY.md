---
phase: 13-agentic-side-panel-experience
plan: 01
subsystem: ui
tags: [react, tailwind, agent-panels, component-extraction, sidepanel]

# Dependency graph
requires:
  - phase: 09
    provides: AgentRunStatusBadge, AgentRunControls, AgentApprovalCard components and agent-runtime selectors/contracts
provides:
  - AgentPanelLayout shared wrapper component with header/footer/children slots
  - BrowserActionPanel self-contained component for browser-action workflow UI
  - DeepResearchPanel self-contained component for deep-research workflow UI
  - ChatApp.tsx refactored to use extracted panel components instead of 437 lines of inline JSX
affects: [13-02, 13-03, 13-04]

# Tech tracking
tech-stack:
  added: []
  patterns: [agent-panel-extraction, props-driven-panels, shared-panel-layout]

key-files:
  created:
    - ai-extension/src/sidepanel/components/AgentPanelLayout.tsx
    - ai-extension/src/sidepanel/components/BrowserActionPanel.tsx
    - ai-extension/src/sidepanel/components/DeepResearchPanel.tsx
  modified:
    - ai-extension/src/sidepanel/ChatApp.tsx

key-decisions:
  - "Panel components receive model info as individual props (modelLabel, providerId, modelId, requiresModelSelection) rather than the full ChatModelOption object to keep the interface minimal"
  - "Approval resolve handler refactored to accept (runId, approvalId, resolution) parameters, making it reusable by both browser-action and deep-research panels"
  - "Deep-research panel does NOT clear topic/goal inputs after launch, allowing user refinement and re-launch without re-typing"
  - "openLinkedResearchPocket callback inlined as lambda in panel props, removing the standalone useCallback"

patterns-established:
  - "Agent panel components: self-contained React.FC receiving all data via props, managing only local input state (taskInput/topicInput/goalInput/isLaunching)"
  - "AgentPanelLayout: shared wrapper with header/footer/children slots using forwardRef and cn() for className merging"
  - "Launch handlers refactored from state-reading callbacks to parameter-accepting callbacks: onLaunch(task), onLaunch(topic, goal)"

requirements-completed: [UX-02, UX-03]

# Metrics
duration: 18min
completed: 2026-03-31
---

# Phase 13 Plan 01: Agent Panel Extraction Summary

**Extracted 437 lines of inline browser-action and deep-research JSX from ChatApp.tsx into three focused panel components (AgentPanelLayout, BrowserActionPanel, DeepResearchPanel) with props-driven interfaces**

## Performance

- **Duration:** 18 min
- **Started:** 2026-03-30T22:48:56Z
- **Completed:** 2026-03-30T23:06:57Z
- **Tasks:** 4
- **Files modified:** 4

## Accomplishments
- Created AgentPanelLayout shared wrapper with header/footer/children slots, matching existing rounded-2xl panel styling
- Extracted BrowserActionPanel with task textarea, launch button, status badge, run controls, approval card, todo list, and timeline
- Extracted DeepResearchPanel with topic/goal inputs, launch button, status badge, run controls, research state display (pocket, evidence, active question, synthesis, gaps), todo list, and timeline
- Reduced ChatApp.tsx from 3330 to 2845 lines by replacing 437 lines of inline JSX with 30 lines of component render calls

## Task Commits

Each task was committed atomically:

1. **Task 1: Create AgentPanelLayout shared wrapper component** - `1100c04` (feat)
2. **Task 2: Extract BrowserActionPanel from ChatApp inline code** - `7893d3b` (feat)
3. **Task 3: Extract DeepResearchPanel from ChatApp inline code** - `00dc4f0` (feat)
4. **Task 4: Refactor ChatApp.tsx to use extracted panel components** - `3bab481` (refactor)

## Files Created/Modified
- `ai-extension/src/sidepanel/components/AgentPanelLayout.tsx` - Shared layout wrapper with header/footer/children slots, forwardRef, cn() merging
- `ai-extension/src/sidepanel/components/BrowserActionPanel.tsx` - Browser-action workflow panel with task input, launch, status, controls, approval, todos, timeline
- `ai-extension/src/sidepanel/components/DeepResearchPanel.tsx` - Deep-research workflow panel with topic/goal input, launch, status, controls, research state, approval, todos, timeline
- `ai-extension/src/sidepanel/ChatApp.tsx` - Replaced inline JSX with component imports and render calls; removed 5 state variables, 5 computed values, 3 helper functions, and 4 unused imports

## Decisions Made
- Panel components receive model info as individual props rather than the full ChatModelOption object to keep interfaces minimal and avoid coupling to ChatApp's internal model resolution logic
- Approval resolve handler refactored to accept (runId, approvalId, resolution) parameters, making it reusable by both panels without needing separate approval state
- Deep-research panel does NOT clear inputs after launch to allow iterative refinement
- openLinkedResearchPocket callback removed as standalone useCallback and inlined as lambda in DeepResearchPanel props

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added AgentApprovalCard to DeepResearchPanel**
- **Found during:** Task 3 (DeepResearchPanel extraction)
- **Issue:** The plan listed AgentApprovalCard as required for DeepResearchPanel, but the original inline deep-research code did not render one. The panel now includes approval card support so deep-research runs with pending approvals can be resolved directly.
- **Fix:** Added pendingApproval derivation from panelState.pendingApproval and AgentApprovalCard rendering in DeepResearchPanel
- **Files modified:** ai-extension/src/sidepanel/components/DeepResearchPanel.tsx
- **Verification:** Build passes
- **Committed in:** 00dc4f0 (Task 3 commit)

**2. [Rule 3 - Blocking] Fixed exactOptionalPropertyTypes compatibility**
- **Found during:** Task 4 (ChatApp refactoring)
- **Issue:** TypeScript's exactOptionalPropertyTypes flag requires explicit `string | undefined` type instead of optional `string?` when passing `undefined` values
- **Fix:** Changed providerId and modelId prop types from `providerId?: string` to `providerId: string | undefined` in both panel components
- **Files modified:** BrowserActionPanel.tsx, DeepResearchPanel.tsx
- **Verification:** Build passes clean
- **Committed in:** 3bab481 (Task 4 commit)

---

**Total deviations:** 2 auto-fixed (1 missing critical, 1 blocking)
**Impact on plan:** Both auto-fixes necessary for correctness and build compatibility. No scope creep.

## Issues Encountered
- The plan's target of ChatApp.tsx under 2000 lines was not achievable because the remaining code (chat rendering, pocket management, conversation handling, history, note editor, export, share, virtual scrolling, streaming handlers, and all effects) constitutes ~2845 lines of non-agent-panel code. The agent panels themselves were the right extraction target, and they are now fully separated.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All three panel components are ready for Phase 13 Plan 02 (launch surfaces and enhanced interactions)
- The panel components' props interfaces are stable and can be extended without modifying ChatApp.tsx
- The AgentPanelLayout wrapper enables consistent styling for any future agent workflow panels
- ChatApp.tsx is ready for further reduction if chat/pocket sections are similarly extracted in future phases

---
*Phase: 13-agentic-side-panel-experience*
*Completed: 2026-03-31*

## Self-Check: PASSED

All created files verified present. All task commits verified in git log.
