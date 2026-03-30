# Phase 9: Human-in-the-Loop Control Layer - Research

**Researched:** 2026-03-30
**Domain:** Agent approval gates, run governance, safety-aware action visibility
**Confidence:** HIGH

## Summary

Phase 9 adds human-in-the-loop control boundaries to the browser agent runtime established in Phases 7 and 8. The codebase already has significant scaffolding for approvals in place from Phase 7: the canonical contracts define `AgentPendingApproval`, the reducer handles `approval.requested` and `approval.resolved` events, the `AgentRunStatus` includes `"waiting_approval"`, the IndexedDB store has an `agentApprovals` object store with `runId` and `status` indexes, and the `AgentOrchestrator` already has a working (but legacy) approval flow that pauses workflows and sends `BROWSER_AGENT_APPROVAL_REQUEST` messages to the UI.

The gap is not structural -- it is integration and completeness. The canonical `AgentRuntimeService` has a `beginBrowserActionToolCall` method that blocks on `requiresHumanApproval` but records a failure instead of requesting approval. The side panel has no approval UI components yet. The approval payload lacks target page context (CTRL-02). Timeline entries for approval events are projected but not actually wired to UI display. The run status display does not distinguish `waiting_approval` visually from other states (CTRL-04).

**Primary recommendation:** Extend the canonical runtime to actually request and resolve approvals through the existing event/reducer pipeline, build targeted approval UI components in the side panel using shadcn/ui, and wire the existing selectors (`selectLatestAgentApproval`, `selectAgentTimeline`) to a live run status display.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CTRL-01 | User is prompted to approve sensitive browser actions before execution | `requiresHumanApproval: true` already set on click_element, type_text, close_tab tools. Reducer already handles `approval.requested` -> status `waiting_approval`. Gap: AgentRuntimeService.beginBrowserActionToolCall blocks but does not emit approval.requested event. |
| CTRL-02 | User can inspect the exact pending action, target page context, and reason for the approval request | `AgentPendingApproval` has `reason` but lacks toolArgs, page context, tab info. Need to extend the approval payload with target context fields. Selectors already project approval data to UI shape. |
| CTRL-03 | System records approvals, rejections, pauses, resumes, and cancellations in the run timeline | Reducer already handles all event types. Selectors already map approval.requested/approval.resolved to timeline labels. Gap: pauses/resumes/cancellations are handled in AgentRuntimeService but not all emit timeline-visible events consistently. |
| CTRL-04 | Agent UI clearly distinguishes autonomous execution, waiting-for-user state, and terminal outcomes | `AgentRunStatus` includes all needed states. `isTerminalStatus()` selector exists. `AgentPanelState.isTerminal` is computed. Gap: No side panel React components render these states yet. Need status badge + intent display components. |
</phase_requirements>

## Standard Stack

### Core (already installed, no new packages needed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 19.2.0 | UI components for approval panel, status display | Project standard |
| shadcn/ui | (new-york style) | Alert, Badge, Button, Card components for approval UI | Project component library |
| Radix UI | @radix-ui/react-dialog | Approval dialog with focus trap and a11y | Already used for dropdowns/selects |
| zod | 3.25.76 | Runtime validation of approval payloads | Project standard |
| idb | 8.0.3 | IndexedDB persistence for approval records | Already in use via AgentRuntimeStore |

### Supporting (already installed)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| lucide-react | 0.545.0 | Status icons (Shield, AlertTriangle, Check, X, Pause) | Approval UI and status badges |
| framer-motion | 12.23.24 | Animated transitions between run states | Status changes, approval prompt appearance |
| tailwind-merge | 3.3.1 | Conditional styling for status-specific CSS | Status-dependent color schemes |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom approval dialog | Chrome native dialog | Native dialogs block the extension; custom allows rich context display |
| Server-side approval policy | Client-side tool metadata | No server in MV3; tool-level `requiresHumanApproval` is the right pattern |

**Installation:**
```bash
# No new packages needed -- all dependencies are already installed
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── shared/agent-runtime/
│   ├── contracts.ts          # EXTEND: enrich AgentPendingApproval with context fields
│   ├── reducer.ts            # NO CHANGE: already handles approval events
│   ├── selectors.ts          # EXTEND: add status label/color selectors
│   └── schemas.ts            # EXTEND: update AgentPendingApprovalSchema
├── background/agent-runtime/
│   ├── agent-runtime-service.ts  # MODIFY: replace block-on-approval with actual approval flow
│   └── approval-service.ts       # NEW: dedicated approval request/resolve service
├── sidepanel/
│   ├── components/
│   │   ├── AgentApprovalCard.tsx  # NEW: approval prompt with context display
│   │   ├── AgentRunStatus.tsx     # NEW: status badge + intent display
│   │   └── AgentTimeline.tsx      # NEW: timeline of run events
│   └── hooks/
│       └── useAgentRun.ts         # NEW: hook for subscribing to run state
├── browser-agent/
│   └── tools/
│       └── *.ts               # NO CHANGE: requiresHumanApproval already correct
```

### Pattern 1: Approval Gate via Canonical Event Pipeline
**What:** When a tool requires approval, the runtime emits `approval.requested`, the reducer sets `status: "waiting_approval"`, the UI renders an approval prompt, the user responds, and `approval.resolved` resumes the run.
**When to use:** Every tool execution where `requiresHumanApproval === true`.
**Example:**
```typescript
// Source: contracts.ts + reducer.ts (already exist)

// 1. Runtime detects approval needed
const tool = registry.getTool(toolName);
if (tool?.requiresHumanApproval) {
  // 2. Emit approval.requested event
  await runtimeService.applyEvent({
    eventId: `evt-${runId}-approval-req-${Date.now()}`,
    runId,
    timestamp: Date.now(),
    type: "approval.requested",
    approval: {
      approvalId: `apr-${runId}-${Date.now()}`,
      reason: `The agent wants to ${tool.description}`,
      requestedAt: Date.now(),
      // NEW fields for CTRL-02:
      toolName,
      toolArgs,
      targetContext: {
        tabId: run.metadata.tabId,
        tabUrl: run.metadata.tabUrl,
        tabTitle: run.metadata.tabTitle,
      },
    },
  });
  // Reducer sets status to "waiting_approval"
  // Execution loop pauses waiting for resolution
}

// 3. User approves/rejects in UI -> sends message to service worker
// 4. Service worker emits approval.resolved
await runtimeService.applyEvent({
  eventId: `evt-${runId}-approval-res-${Date.now()}`,
  runId,
  timestamp: Date.now(),
  type: "approval.resolved",
  approvalId: approval.approvalId,
  resolution: "approved", // or "rejected"
});
// Reducer sets status back to "running" (approved) or records rejection
```

### Pattern 2: Status-Derived UI State (CTRL-04)
**What:** The side panel derives all visual state from `AgentPanelState` computed by selectors. No separate state tracking.
**When to use:** All agent run UI rendering.
**Example:**
```typescript
// Source: selectors.ts (already exists, extend for display)

const STATUS_DISPLAY: Record<AgentRunStatus, { label: string; color: string; icon: string }> = {
  pending:      { label: "Starting...",    color: "text-muted-foreground", icon: "Loader" },
  running:      { label: "Working",        color: "text-blue-500",         icon: "Play" },
  paused:       { label: "Paused",         color: "text-yellow-500",       icon: "Pause" },
  waiting_approval: { label: "Needs Your Approval", color: "text-orange-500", icon: "ShieldAlert" },
  completed:    { label: "Done",           color: "text-green-500",        icon: "CheckCircle" },
  failed:       { label: "Failed",         color: "text-red-500",          icon: "XCircle" },
  cancelled:    { label: "Cancelled",      color: "text-muted-foreground", icon: "Ban" },
};
```

### Pattern 3: Approval Context Enrichment (CTRL-02)
**What:** When requesting approval, gather and attach target page context so the user can make an informed decision.
**When to use:** Every `approval.requested` event emission.
**Example:**
```typescript
// Source: new enrichment in approval-service.ts
interface ApprovalTargetContext {
  tabId: number;
  tabUrl?: string;
  tabTitle?: string;
  selector?: string;    // for click/type tools
  textToType?: string;  // for type_text tool (truncated)
  pageSnippet?: string; // brief DOM context around target element
}
```

### Anti-Patterns to Avoid
- **Never bypass the canonical event pipeline:** Do not add ad-hoc approval state outside the reducer. The reducer is the single source of truth.
- **Never block the service worker thread waiting for approval:** Use the event-driven approach -- emit `approval.requested`, save checkpoint, let execution return. Resume when `approval.resolved` arrives.
- **Never store approval state only in memory:** The approval must be persisted to `agentApprovals` IndexedDB store so it survives service worker termination.
- **Never reject-and-cancel on every rejection:** CTRL-03 requires recording rejections, but a rejection does not always mean cancel the run. The agent may replan with a different action.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Approval state transitions | Custom approval state machine | Existing reducer `approval.requested` / `approval.resolved` handlers | Already correctly transitions `waiting_approval` -> `running`, already persists via event pipeline |
| Approval persistence | Custom IndexedDB writes | `AgentRuntimeStore.putApproval()` with `agentApprovals` store | Already has `runId` and `status` indexes |
| Status-to-UI mapping | Imperative status checks in JSX | `selectAgentPanelState()` selector | Already computes `isTerminal`, `pendingApproval`, `progress` |
| Timeline rendering | Custom event formatting | `selectAgentTimeline()` selector | Already maps all event types to human-readable labels |
| Dialog accessibility | Custom modal with focus management | shadcn/ui AlertDialog (built on Radix Dialog) | Focus trap, keyboard dismiss, screen reader announcements |

**Key insight:** The canonical runtime contracts from Phase 7 were designed with approvals in mind. The types, reducer, selectors, and store all have approval support already. The implementation gap is wiring, not architecture.

## Common Pitfalls

### Pitfall 1: Service Worker Termination During Approval Wait
**What goes wrong:** The service worker can be terminated by Chrome after 30 seconds of inactivity while waiting for user approval. When the user responds, the service worker is gone and the approval is lost.
**Why it happens:** MV3 service workers are ephemeral. Approval wait time is unbounded.
**How to avoid:** (1) Persist approval state to IndexedDB before pausing. (2) Use the heartbeat system to keep alive during short waits. (3) On service worker restart, check for pending approvals and re-notify the UI. (4) The `resumeIncompleteWorkflows()` pattern in WorkflowManager already handles this -- adapt for approval recovery.
**Warning signs:** Approval dialog appears but never resolves; run stuck in `waiting_approval` after closing/reopening side panel.

### Pitfall 2: Race Condition Between Approval Resolution and Execution
**What goes wrong:** User approves while the execution loop is still in a different state, causing the approval to be applied to the wrong step.
**Why it happens:** The execution loop and message handler run on different microtasks.
**How to avoid:** The canonical event pipeline is inherently serial -- events are applied in sequence via the reducer. Always apply approval.resolved through `applyEvent()` which acquires the next sequence number atomically. Do not try to "skip" the event pipeline and directly call the tool handler.
**Warning signs:** Tool executes twice; approval applied to wrong tool call.

### Pitfall 3: Approval Payload Too Sparse (CTRL-02 Non-Compliance)
**What goes wrong:** The existing `AgentPendingApproval` only has `approvalId`, `reason`, `requestedAt`. Without `toolName`, `toolArgs`, and page context, the user cannot make an informed decision.
**Why it happens:** The contract was designed in Phase 7 but not enriched for the actual approval UX.
**How to avoid:** Extend `AgentPendingApproval` with `toolName`, `toolArgs`, and a `targetContext` object. Update the schema, selector, and UI components. Backward-compatible because the new fields are optional in the Zod schema.
**Warning signs:** Approval dialog shows "Approval required" with no detail about what action is pending.

### Pitfall 4: Rejection Always Cancels the Run
**What goes wrong:** Current `AgentOrchestrator.approveToolExecution()` cancels the entire workflow on rejection. This is too aggressive -- the agent should be able to replan.
**Why it happens:** Legacy code did not distinguish "reject this action" from "cancel the run."
**How to avoid:** In the canonical runtime, `approval.resolved` with `resolution: "rejected"` should transition back to `running` (not `cancelled`) so the agent can replan. The agent loop should detect the rejection and choose an alternative action. Only explicit user cancellation (pause/cancel buttons) should terminate the run.
**Warning signs:** Every rejected approval kills the entire run; user has no way to say "no, try something else."

### Pitfall 5: Approval UI Not Visible Enough
**What goes wrong:** Approval prompt is buried in a timeline or small card; user does not notice the agent is blocked.
**Why it happens:** Side panel has limited space; approval is easy to miss among other events.
**How to avoid:** Use a prominent, visually distinct approval card with an orange/amber warning color. Consider a badge count on the agent tab. The `AgentRunStatusBadge` should pulse or glow when `waiting_approval`. Include a brief summary of what the agent wants to do and why.
**Warning signs:** User reports agent "froze" -- it was actually waiting for approval they did not see.

## Code Examples

### Extending AgentPendingApproval for CTRL-02
```typescript
// Source: extension to contracts.ts

export interface ApprovalTargetContext {
  tabId: number;
  tabUrl?: string;
  tabTitle?: string;
  /** For click/type tools: the CSS selector being targeted */
  selector?: string;
  /** For type_text: the text that will be entered (truncated to 200 chars) */
  textPreview?: string;
}

export interface AgentPendingApproval {
  approvalId: string;
  reason: string;
  requestedAt: number;
  resolvedAt?: number;
  resolution?: "approved" | "rejected";
  // NEW: CTRL-02 context fields
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  targetContext?: ApprovalTargetContext;
}
```

### Approval Service Wiring
```typescript
// Source: new approval-service.ts

export class ApprovalService {
  constructor(
    private runtimeService: AgentRuntimeService,
    private store: AgentRuntimeStore,
  ) {}

  async requestApproval(
    runId: string,
    toolName: string,
    toolArgs: Record<string, unknown>,
    reason: string,
    targetContext: ApprovalTargetContext,
  ): Promise<AgentRun> {
    const approvalId = `apr-${runId}-${Date.now()}`;

    // Persist approval record to IndexedDB
    await this.store.putApproval({
      approvalId,
      runId,
      status: "pending",
      // ... other fields
    });

    // Emit canonical event (reducer sets status -> waiting_approval)
    return this.runtimeService.applyEvent({
      eventId: `evt-${runId}-approval-req-${Date.now()}`,
      runId,
      timestamp: Date.now(),
      type: "approval.requested",
      approval: {
        approvalId,
        reason,
        requestedAt: Date.now(),
        toolName,
        toolArgs,
        targetContext,
      },
    });
  }

  async resolveApproval(
    runId: string,
    approvalId: string,
    resolution: "approved" | "rejected",
  ): Promise<AgentRun> {
    // Update persisted approval record
    const record = await this.store.getApproval(approvalId);
    if (record) {
      await this.store.putApproval({
        ...record,
        status: resolution,
        resolvedAt: Date.now(),
      });
    }

    // Emit canonical event (reducer transitions back to running/cancels)
    return this.runtimeService.applyEvent({
      eventId: `evt-${runId}-approval-res-${Date.now()}`,
      runId,
      timestamp: Date.now(),
      type: "approval.resolved",
      approvalId,
      resolution,
    });
  }
}
```

### Approval Card Component Pattern
```typescript
// Source: sidepanel/components/AgentApprovalCard.tsx

// Uses shadcn/ui AlertDialog for accessibility
// Renders: tool name, target selector, page URL, reason
// Buttons: Approve / Reject
// On click: sends BROWSER_AGENT_APPROVAL_RESPONSE message to service worker

interface AgentApprovalCardProps {
  approval: AgentPendingApproval;
  onResolve: (resolution: "approved" | "rejected") => void;
}

function AgentApprovalCard({ approval, onResolve }: AgentApprovalCardProps) {
  const targetUrl = approval.targetContext?.tabUrl;
  const selector = approval.targetContext?.selector;

  return (
    <Card className="border-orange-300 bg-orange-50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-orange-700">
          <ShieldAlert className="h-5 w-5" />
          Action Requires Approval
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="font-medium">{approval.reason}</p>
        {approval.toolName && (
          <p className="text-sm text-muted-foreground">
            Tool: {approval.toolName}
          </p>
        )}
        {targetUrl && (
          <p className="text-sm text-muted-foreground">
            Target: {truncate(targetUrl, 60)}
          </p>
        )}
        {selector && (
          <p className="text-sm text-muted-foreground">
            Element: {selector}
          </p>
        )}
      </CardContent>
      <CardFooter className="flex gap-2">
        <Button variant="destructive" onClick={() => onResolve("rejected")}>
          Reject
        </Button>
        <Button onClick={() => onResolve("approved")}>
          Approve
        </Button>
      </CardFooter>
    </Card>
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| AgentOrchestrator in-memory approvals | Canonical event pipeline + IndexedDB persistence | Phase 7 | Approval state survives service worker restart |
| `pendingApprovals` Map (lost on SW restart) | `agentApprovals` IndexedDB store with indexes | Phase 7 | Durable approval records |
| Binary approve/cancel workflow | Approve/reject with replanning | Phase 9 target | Rejection does not kill the run |
| Approval with only `reason` text | Rich context with tool args, page URL, selector | Phase 9 target | User can make informed decisions |

**Deprecated/outdated:**
- `AgentOrchestrator.pendingApprovals` Map: In-memory only, will be superseded by canonical ApprovalService. The orchestrator's `approveToolExecution()` is a legacy path.
- `BROWSER_AGENT_APPROVAL_REQUEST` message kind: Legacy, will be superseded by canonical event-based approval flow via `AgentRuntimeService.applyEvent()`.

## Open Questions

1. **Approval timeout / auto-reject**
   - What we know: No timeout exists for pending approvals. A run could wait indefinitely.
   - What's unclear: Should there be an auto-reject after N minutes? What is a reasonable timeout?
   - Recommendation: Start without auto-timeout in Phase 9. Add as configurable setting in Phase 13 (UX polish). For now, runs blocked on approval persist until the user revisits or explicitly cancels.

2. **Rejection behavior: replan vs. cancel**
   - What we know: Current legacy code cancels on rejection. The canonical reducer transitions back to `running` on approval.resolved regardless of resolution.
   - What's unclear: Should `resolution: "rejected"` transition to `running` (for replanning) or to a different status like `paused`?
   - Recommendation: Rejection should transition to `running` so the agent can replan. The agent loop detects the rejection and chooses an alternative. Only `run.cancelled` (explicit user action) terminates.

3. **Side panel not open when approval arrives**
   - What we know: Service worker can send `chrome.runtime.sendMessage` but if no listener is active, the message is dropped.
   - What's unclear: Should we use `chrome.notifications` as a fallback?
   - Recommendation: On service worker restart, check for pending approvals via `store.getPendingApprovals()` and re-notify the UI when the side panel opens. Do NOT add desktop notifications in Phase 9 (deferred to Phase 13 UX).

## Environment Availability

Step 2.6: SKIPPED (no external dependencies identified -- this phase extends existing code within the Chrome extension and uses already-installed packages)

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 2.1.1 with jsdom environment |
| Config file | `ai-extension/vitest.config.ts` |
| Quick run command | `cd ai-extension && pnpm run test -- --reporter=verbose` |
| Full suite command | `cd ai-extension && pnpm run test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CTRL-01 | Sensitive tools require approval before execution | unit | `pnpm run test -- approval-service.test.ts` | No -- Wave 0 |
| CTRL-01 | Run transitions to waiting_approval on approval request | unit | `pnpm run test -- reducer.test.ts` | Partial -- reducer tests exist, need approval additions |
| CTRL-02 | Approval payload includes toolName, toolArgs, targetContext | unit | `pnpm run test -- approval-service.test.ts` | No -- Wave 0 |
| CTRL-02 | Selector projects approval context to UI shape | unit | `pnpm run test -- selectors.test.ts` | No -- Wave 0 |
| CTRL-03 | Timeline records approval.requested and approval.resolved | unit | `pnpm run test -- selectors.test.ts` | No -- Wave 0 |
| CTRL-03 | Pause/resume/cancel events appear in timeline | unit | `pnpm run test -- selectors.test.ts` | No -- Wave 0 |
| CTRL-04 | Status badge displays correct label per run status | unit | `pnpm run test -- AgentRunStatus.test.tsx` | No -- Wave 0 |
| CTRL-04 | Approval card renders with context when pendingApproval is non-null | unit | `pnpm run test -- AgentApprovalCard.test.tsx` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `cd ai-extension && pnpm run test -- --reporter=verbose`
- **Per wave merge:** `cd ai-extension && pnpm run test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `ai-extension/src/background/agent-runtime/__tests__/approval-service.test.ts` -- covers CTRL-01, CTRL-02, CTRL-03
- [ ] `ai-extension/src/shared/agent-runtime/__tests__/selectors.test.ts` -- covers CTRL-03, CTRL-04 timeline projection
- [ ] `ai-extension/src/sidepanel/components/__tests__/AgentRunStatus.test.tsx` -- covers CTRL-04
- [ ] `ai-extension/src/sidepanel/components/__tests__/AgentApprovalCard.test.tsx` -- covers CTRL-02, CTRL-04

## Sources

### Primary (HIGH confidence)
- Code analysis of `ai-extension/src/shared/agent-runtime/contracts.ts` -- canonical types with `AgentPendingApproval`, `AgentRunStatus`, event types
- Code analysis of `ai-extension/src/shared/agent-runtime/reducer.ts` -- pure reducer handling `approval.requested` and `approval.resolved`
- Code analysis of `ai-extension/src/shared/agent-runtime/selectors.ts` -- timeline and panel state projection
- Code analysis of `ai-extension/src/shared/agent-runtime/schemas.ts` -- Zod validation schemas
- Code analysis of `ai-extension/src/background/agent-runtime/agent-runtime-service.ts` -- runtime service with `beginBrowserActionToolCall`
- Code analysis of `ai-extension/src/background/agent-runtime/store.ts` -- `putApproval`, `getPendingApprovals` IndexedDB operations
- Code analysis of `ai-extension/src/browser-agent/tool-registry.ts` -- `BrowserToolDefinition.requiresHumanApproval` field
- Code analysis of `ai-extension/src/browser-agent/tools/interaction.ts` -- click/type tools with `requiresHumanApproval: true`
- Code analysis of `ai-extension/src/storage/schema.ts` -- `AgentApprovalRecord` with `approvalId`, `runId`, `status` indexes
- Code analysis of `ai-extension/src/background/agent-orchestrator.ts` -- legacy approval flow (reference for migration)

### Secondary (MEDIUM confidence)
- CLAUDE.md technology stack documentation -- confirms React 19.2.0, shadcn/ui, Radix UI, zod versions
- Phase 7 plan documents -- established the canonical runtime contracts

### Tertiary (LOW confidence)
- None needed -- all findings are based on direct code analysis

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new packages; all dependencies verified in package.json via CLAUDE.md
- Architecture: HIGH - canonical contracts already designed for approvals; gap is wiring, not structure
- Pitfalls: HIGH - based on direct analysis of service worker lifecycle constraints and existing code patterns
- Code examples: HIGH - derived from existing contracts and reducer patterns in the codebase

**Research date:** 2026-03-30
**Valid until:** 2026-04-30 (stable -- depends on existing codebase, not external APIs)
