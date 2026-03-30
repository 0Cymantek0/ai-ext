/**
 * Agent Runtime Selectors — Phase 07-03
 *
 * Pure selector functions that project canonical AgentRun state
 * into shapes consumed by the side panel UI.
 *
 * These selectors are the ONLY way the UI reads agent runtime state.
 * They decouple the UI from the internal state shape.
 *
 * @module shared/agent-runtime/selectors
 */

import type {
  AgentRun,
  AgentRunStatus,
  AgentTodoItem,
  AgentPendingApproval,
  AgentArtifactRef,
  AgentRunPhase,
  AgentRunMode,
} from "./contracts.js";

// ─── Timeline Entry ──────────────────────────────────────────────────────────

/** A projected timeline entry for display in the side panel. */
export interface AgentTimelineEntry {
  eventId: string;
  runId: string;
  type: string;
  timestamp: number;
  label: string;
  detail?: string;
}

/** The full projected state for the side panel agent view. */
export interface AgentPanelState {
  runId: string;
  mode: AgentRunMode;
  status: AgentRunStatus;
  phase: AgentRunPhase;
  todoItems: AgentTodoItem[];
  pendingApproval: AgentPendingApproval | null;
  artifactRefs: AgentArtifactRef[];
  progress: number; // 0-100
  updatedAt: number;
  isTerminal: boolean;
}

// ─── Selectors ──────────────────────────────────────────────────────────────

/**
 * Select the panel-friendly projection of an agent run.
 */
export function selectAgentPanelState(run: AgentRun): AgentPanelState {
  const totalTodos = run.todoItems.length;
  const doneTodos = run.todoItems.filter((t) => t.done).length;
  const progress = totalTodos > 0 ? Math.round((doneTodos / totalTodos) * 100) : 0;

  return {
    runId: run.runId,
    mode: run.mode,
    status: run.status,
    phase: run.phase,
    todoItems: run.todoItems,
    pendingApproval: run.pendingApproval,
    artifactRefs: run.artifactRefs,
    progress,
    updatedAt: run.updatedAt,
    isTerminal: isTerminalStatus(run.status),
  };
}

/**
 * Select the todo items for display.
 */
export function selectAgentTodo(run: AgentRun): AgentTodoItem[] {
  return run.todoItems;
}

/**
 * Select the latest pending approval, if any.
 */
export function selectLatestAgentApproval(run: AgentRun): AgentPendingApproval | null {
  return run.pendingApproval;
}

/**
 * Select timeline entries from raw event records.
 * Maps internal event types to human-readable labels.
 */
export function selectAgentTimeline(
  events: Array<{ eventId: string; runId: string; type: string; timestamp: number; payload?: Record<string, unknown> }>
): AgentTimelineEntry[] {
  return events.map((e) => {
    const detail = extractEventDetail(e.type, e.payload);
    const entry: AgentTimelineEntry = {
      eventId: e.eventId,
      runId: e.runId,
      type: e.type,
      timestamp: e.timestamp,
      label: eventTypeToLabel(e.type),
    };
    if (detail !== undefined) {
      entry.detail = detail;
    }
    return entry;
  });
}

/**
 * Check if a run has any active (non-terminal) status.
 */
export function isActiveRun(run: AgentRun): boolean {
  return !isTerminalStatus(run.status);
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

function isTerminalStatus(status: AgentRunStatus): boolean {
  return status === "completed" || status === "failed" || status === "cancelled";
}

function eventTypeToLabel(type: string): string {
  const labels: Record<string, string> = {
    "run.started": "Run started",
    "run.imported": "Run imported",
    "run.phase_changed": "Phase changed",
    "todo.replaced": "Todo list updated",
    "todo.item_upserted": "Todo item updated",
    "tool.called": "Tool called",
    "tool.completed": "Tool completed",
    "tool.failed": "Tool failed",
    "approval.requested": "Approval requested",
    "approval.resolved": "Approval resolved",
    "artifact.projected": "Artifact projected",
    "checkpoint.created": "Checkpoint created",
    "run.completed": "Run completed",
    "run.failed": "Run failed",
    "run.cancelled": "Run cancelled",
  };
  return labels[type] ?? type;
}

function extractEventDetail(
  type: string,
  payload?: Record<string, unknown>
): string | undefined {
  if (!payload) return undefined;

  switch (type) {
    case "tool.called":
      return `Tool: ${payload.toolName ?? "unknown"}`;
    case "tool.failed":
      return `Error: ${payload.error ?? "unknown error"}`;
    case "run.phase_changed":
      return `${payload.fromPhase ?? "?"} → ${payload.toPhase ?? "?"}`;
    case "approval.requested":
      return (payload.approval as Record<string, unknown>)?.reason as string | undefined;
    case "artifact.projected":
      return (payload.artifact as Record<string, unknown>)?.label as string | undefined;
    default:
      return undefined;
  }
}
