# Phase 13: Agentic Side Panel Experience - Context

**Gathered:** 2026-03-31
**Status:** Ready for planning
**Source:** User directive (skipped discuss-phase per user request)

<domain>
## Phase Boundary

Phase 13 delivers the complete user-facing experience for operating autonomous browser agents and deep research agents from the Chrome extension side panel. This is the final UX layer that makes all preceding infrastructure (Phases 7-12) usable by the end user.

**What this phase delivers:**
- Unified launch surface for browser-action and deep-research workflows
- Model selection integrated into both workflows
- Live run timeline showing all agent activity (planning, tool calls, approvals, evidence writes, errors)
- Historical run inspection (post-completion review)
- Non-blocking agent execution (side panel remains responsive during long runs)

**What this phase does NOT deliver:**
- New agent runtime capabilities (those are Phases 7-12)
- Report generation engine (Phase 12)
- Deep research orchestrator logic (Phase 10)
- Browser action tool execution (Phase 8)
</domain>

<decisions>
## Implementation Decisions

### Workflow Launch (UX-03)
- User must have a clear, obvious choice between browser-action and deep-research workflows from the side panel
- Both workflows must be accessible without navigating away from the current context
- Launch surfaces should be visually distinct and communicate what each workflow does

### Model Selection (UX-01)
- Model selection must use the existing configured providers from settings
- User should be able to select different models for browser-action vs deep-research
- Model selection should be visible and changeable before launch

### Live Timeline (UX-02)
- Side panel must show a real-time timeline of all agent activity
- Timeline must include: planning steps, tool calls, approvals, evidence writes, errors
- Timeline must update as events happen (not batched or delayed)
- Timeline entries should be human-readable, not raw JSON

### Historical Run Inspection (UX-04)
- Completed runs must remain accessible after the agent finishes
- User should be able to review: what happened, what was collected, how the run ended
- Historical runs should be browsable alongside conversations

### Responsiveness (UX-05)
- Agent execution must not block the side panel UI
- User must be able to browse pockets, chat, and do other tasks while agents run
- Long-running sessions (deep research) must not cause UI freezes or memory issues

### the agent's Discretion
- Exact component structure and decomposition strategy (monolithic ChatApp.tsx refactoring approach)
- Specific UI layout patterns (tabs, accordions, panels, etc.)
- Whether to introduce a state management layer beyond React useState
- How to structure the run history storage and retrieval
- Visual design specifics (colors, spacing, animations) — follow existing patterns
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Agent Runtime Contracts
- `ai-extension/src/shared/agent-runtime/contracts.ts` — AgentRun, AgentRunEvent, AgentRunStatus, AgentRunPhase types
- `ai-extension/src/shared/agent-runtime/selectors.ts` — AgentPanelState, AgentTimelineEntry selectors
- `ai-extension/src/shared/agent-runtime/reducer.ts` — reduceAgentRunEvent for event processing

### Service Worker Communication
- `ai-extension/src/shared/types/index.d.ts` — MessageKind union, all message payload types
- `ai-extension/src/background/agent-runtime/agent-runtime-service.ts` — AgentRuntimeService, run management
- `ai-extension/src/background/agent-runtime/store.ts` — IndexedDB stores for agent state

### Existing UI Components
- `ai-extension/src/sidepanel/ChatApp.tsx` — Current monolithic root component (3330 lines)
- `ai-extension/src/sidepanel/components/AgentRunStatusBadge.tsx` — Status badge component
- `ai-extension/src/sidepanel/components/AgentRunControls.tsx` — Pause/Resume/Cancel controls
- `ai-extension/src/sidepanel/components/AgentApprovalCard.tsx` — Approval request card
- `ai-extension/src/components/ui/ai-input-with-file.tsx` — Chat input with model selector

### UI Patterns & Styling
- `ai-extension/tailwind.config.js` — Tailwind configuration, theme, colors
- `ai-extension/src/sidepanel/sidepanel.css` or globals.css — Custom CSS classes
- `ai-extension/src/lib/utils.ts` — cn() utility, helper functions

### State & Storage
- `ai-extension/src/background/agent-runtime/store.ts` — Agent run persistence layer
- `ai-extension/src/shared/types/index.d.ts` — SidePanelState interface
</canonical_refs>

<specifics>
## Specific Ideas

### User's Vision
- **Autonomous browser agent**: Can perform tasks given by the user using any configured model
- **Deep research agent**: Uses pockets as a live evidence store during research
  - Finds articles → puts content into pocket
  - Finds PDFs → puts content into pocket
  - Pocket gets indexed → enables report generation
- The user trusts the AI to make architecture decisions
- Plans must be extremely detailed — "even a dumb AI agent can execute without problems"

### Current Architecture State
- ChatApp.tsx is 3330 lines — monolithic, all agent UI embedded inline
- Browser action and deep research UI are NOT extracted as separate components
- Agent components exist: AgentRunStatusBadge, AgentRunControls, AgentApprovalCard
- No dedicated run history component — runs are ephemeral in component state
- Model selector exists in ai-input-with-file but not workflow-specific
- AgentRuntimeService exists in background with proper persistence

### Technical Constraints
- Chrome Extension MV3 with service worker
- Side panel has limited viewport (~400px wide)
- No Redux/Zustand — pure React useState currently
- Tailwind CSS with custom theme
- React 19.2.0
- TypeScript 5.9.3
</specifics>

<deferred>
## Deferred Ideas

None explicitly deferred — scope defined by UX-01 through UX-05 requirements.
</deferred>

---

*Phase: 13-agentic-side-panel-experience*
*Context gathered: 2026-03-31 via user directive*
