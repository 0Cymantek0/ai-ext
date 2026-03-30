---
phase: 09-human-in-the-loop-control-layer
plan: 01
subsystem: agent-runtime
tags: [approval, human-in-the-loop, approval-service, indexeddb, persistence]

# Dependency graph
requires:
  - phase: 07-agent-architecture-reset
    provides: AgentRun contracts, reducer, selectors, store
provides:
  - ApprovalService class with requestApproval, resolveApproval, recoverPendingApprovals
  - Rewired beginBrowserActionToolCall using ApprovalService
  - AGENT_RUN_APPROVAL_RESOLVE message handler in service-worker
  - ApprovalTargetContext interface and schema (CTRL-02)
affects: [09-03, side-panel-ui]

# Tech tracking
tech-stack:
  added: []
  patterns: [approval-service, approval-persistence, event-driven-approval]

key-files:
  created:
    - ai-extension/src/background/agent-runtime/approval-service.ts
    - ai-extension/src/background/agent-runtime/__tests__/approval-service.test.ts
    - ai-extension/src/shared/agent-runtime/__tests__/contracts.test.ts
    - ai-extension/src/shared/agent-runtime/__tests__/schemas.test.ts
  modified:
    - ai-extension/src/shared/agent-runtime/contracts.ts
    - ai-extension/src/shared/agent-runtime/schemas.ts
    - ai-extension/src/background/agent-runtime/agent-runtime-service.ts
    - ai-extension/src/background/service-worker.ts
    - ai-extension/src/shared/types/index.d.ts

key-decisions:
  - "ApprovalService is constructor-injected into AgentRuntimeService, not standalone singleton"
  - "Approval record persisted to IndexedDB BEFORE event emission (survives SW termination)"
  - "Rejected approvals transition run back to running (not cancelled) so agent can replan"
  - "ApprovalTargetContext uses spread pattern for optional fields to satisfy exactOptionalPropertyTypes"

patterns-established:
  - "ApprovalService pattern: persist first, then emit event via runtimeService.applyEvent"
  - "exactOptionalPropertyTypes-safe spread: ...(value ? { key: value } : {}) pattern for optional context fields"

requirements-completed: [CTRL-01, CTRL-02]

# Metrics
duration: 30min
completed: 2026-03-30
---

# Phase 09 Plan 01: Approval Flow Wiring Summary

**ApprovalService with requestApproval/resolveApproval/recoverPendingApprovals, rewired runtime, enriched approval contracts with CTRL-02 target context, and 35 comprehensive tests**

## Performance

- **Duration:** 30 min (including review of prior broken attempt)
- **Tasks:** 2 (TDD — contracts + service wiring)
- **Files modified:** 5 existing, 4 new

## Accomplishments
- Extended AgentPendingApproval with CTRL-02 context fields (toolName, toolArgs, targetContext)
- Created ApprovalService that persists approval records to IndexedDB and emits canonical approval.requested/approval.resolved events
- Rewired beginBrowserActionToolCall to use ApprovalService instead of recording fake failure
- Rejected approvals transition back to "running" (not cancelled) so agent can replan — this is critical for the autonomous loop
- Added AGENT_RUN_APPROVAL_RESOLVE message handler in service-worker with side panel forwarding
- All 35 phase 9 tests pass (3 contracts + 5 schemas + 18 selectors + 7 approval-service + 2 new)

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend contracts with CTRL-02 fields** - `c515537` (feat) — prior session
2. **Task 2: Create ApprovalService and wire into runtime** - `1e4ea5a` (feat)

## Files Created/Modified
- `ai-extension/src/background/agent-runtime/approval-service.ts` - ApprovalService class with 3 methods
- `ai-extension/src/background/agent-runtime/__tests__/approval-service.test.ts` - 7 tests
- `ai-extension/src/shared/agent-runtime/contracts.ts` - Added ApprovalTargetContext, extended AgentPendingApproval
- `ai-extension/src/shared/agent-runtime/schemas.ts` - Added ApprovalTargetContextSchema, extended AgentPendingApprovalSchema
- `ai-extension/src/shared/agent-runtime/__tests__/contracts.test.ts` - 3 contract tests
- `ai-extension/src/shared/agent-runtime/__tests__/schemas.test.ts` - 5 schema tests
- `ai-extension/src/background/agent-runtime/agent-runtime-service.ts` - Added approvalService property, rewired requiresHumanApproval
- `ai-extension/src/background/service-worker.ts` - Added AGENT_RUN_APPROVAL_RESOLVE handler
- `ai-extension/src/shared/types/index.d.ts` - Added AGENT_RUN_APPROVAL_RESOLVE message kind and payload type

## Decisions Made
- Used constructor injection for ApprovalService (not standalone singleton) — follows existing pattern with PocketArtifactService and CheckpointService
- Approval record persisted BEFORE event emission — ensures IndexedDB has record even if SW terminates mid-event
- Used spread pattern `...(value ? { key: value } : {})` for optional context fields to satisfy TypeScript's `exactOptionalPropertyTypes: true`

## Deviations from Plan

- Cleaned up broken prior attempt in agent-runtime-service.ts before implementing properly
- Restored agent-runtime-service.ts to HEAD (garbled code from failed prior attempt)

## Issues Encountered

- Prior session left broken garbled code in agent-runtime-service.ts — had to restore to HEAD and re-implement cleanly
- TypeScript `exactOptionalPropertyTypes: true` required spread pattern for optional context fields

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- ApprovalService ready for 09-03 side panel UI consumption
- approval.requested/approval.resolved events flow through canonical reducer
- AGENT_RUN_APPROVAL_RESOLVE handler forwards status to side panel
- Ready for Plan 09-03 (side panel approval card, status badge, run controls)

## Self-Check: PASSED

- approval-service.ts: FOUND
- agent-runtime-service.ts contains `this.approvalService.requestApproval`: FOUND
- agent-runtime-service.ts contains `getApprovalService()`: FOUND
- service-worker.ts contains `AGENT_RUN_APPROVAL_RESOLVE`: FOUND
- contracts.ts contains `ApprovalTargetContext`: FOUND
- schemas.ts contains `ApprovalTargetContextSchema`: FOUND
- 35 tests pass: CONFIRMED

---
*Phase: 09-human-in-the-loop-control-layer*
*Completed: 2026-03-30*
