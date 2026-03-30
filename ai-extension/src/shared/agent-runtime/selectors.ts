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
  AgentRunEvent,
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
  currentIntent?: string;
  todoItems: AgentTodoItem[];
  pendingApproval: AgentPendingApproval | null;
  artifactRefs: AgentArtifactRef[];
  progress: number; // 0-100
  updatedAt: number;
  isTerminal: boolean;
}

// ─── Status Display ──────────────────────────────────────────────────────────

/** Display metadata for each run status, used by side panel UI badges. */
export const STATUS_DISPLAY: Record<AgentRunStatus, { label: string; color: string; icon: string }> = {
  pending:           { label: "Starting...",            color: "text-muted-foreground", icon: "Loader" },
  running:           { label: "Working",                color: "text-blue-500",          icon: "Play" },
  paused:            { label: "Paused",                 color: "text-yellow-500",        icon: "Pause" },
  waiting_approval:  { label: "Needs Your Approval",    color: "text-orange-500",        icon: "ShieldAlert" },
  completed:         { label: "Done",                   color: "text-green-500",         icon: "CheckCircle" },
  failed:            { label: "Failed",                 color: "text-red-500",           icon: "XCircle" },
  cancelled:         { label: "Cancelled",              color: "text-muted-foreground",  icon: "Ban" },
};

// ─── Selectors ──────────────────────────────────────────────────────────────

/**
 * Select the panel-friendly projection of an agent run.
 */
export function selectAgentPanelState(
  run: AgentRun,
  events: AgentRunEvent[] = [],
): AgentPanelState {
  const totalTodos = run.todoItems.length;
  const doneTodos = run.todoItems.filter((t) => t.done).length;
  const progress = totalTodos > 0 ? Math.round((doneTodos / totalTodos) * 100) : 0;
  const currentIntent = selectCurrentIntent(run, events);

  const panelState: AgentPanelState = {
    runId: run.runId,
    mode: run.mode,
    status: run.status,
    phase: run.phase,
    todoItems: selectAgentTodo(run),
    pendingApproval: run.pendingApproval,
    artifactRefs: run.artifactRefs,
    progress,
    updatedAt: run.updatedAt,
    isTerminal: isTerminalStatus(run.status),
  };

  if (currentIntent) {
    panelState.currentIntent = currentIntent;
  }

  return panelState;
}

/**
 * Select the todo items for display.
 */
export function selectAgentTodo(run: AgentRun): AgentTodoItem[] {
  return [...run.todoItems].sort((left, right) => {
    if (left.done !== right.done) {
      return left.done ? 1 : -1;
    }

    return right.updatedAt - left.updatedAt;
  });
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
  events: AgentRunEvent[]
): AgentTimelineEntry[] {
  return [...events]
    .sort((left, right) => left.timestamp - right.timestamp)
    .map((event) => {
    const detail = extractEventDetail(event);
    const entry: AgentTimelineEntry = {
      eventId: event.eventId,
      runId: event.runId,
      type: event.type,
      timestamp: event.timestamp,
      label: eventTypeToLabel(event),
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

export function isTerminalStatus(status: AgentRunStatus): boolean {
  return status === "completed" || status === "failed" || status === "cancelled";
}

function eventTypeToLabel(event: AgentRunEvent): string {
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

  switch (event.type) {
    case "tool.called":
      return `Tool started: ${event.toolName}`;
    case "tool.completed":
      return `Tool completed: ${event.toolName}`;
    case "tool.failed":
      return event.blockedByPolicy
        ? `Action blocked: ${event.toolName}`
        : `Tool failed: ${event.toolName}`;
    case "todo.item_upserted":
      return event.item.done
        ? `Todo completed: ${event.item.label}`
        : `Todo updated: ${event.item.label}`;
    case "approval.requested":
      return "Approval required";
    case "approval.resolved":
      return event.resolution === "approved"
        ? "Approval granted"
        : "Approval rejected";
    case "run.phase_changed":
      return `Phase: ${event.toPhase}`;
    default:
      return labels[event.type] ?? event.type;
  }
}

function extractEventDetail(event: AgentRunEvent): string | undefined {
  switch (event.type) {
    case "run.started":
      return event.mode === "browser-action"
        ? "Browser action run launched"
        : "Agent run launched";
    case "run.phase_changed":
      return event.detail ?? event.reason ?? `${event.fromPhase} -> ${event.toPhase}`;
    case "todo.replaced":
      return `${event.items.length} todo item${event.items.length === 1 ? "" : "s"} in plan`;
    case "todo.item_upserted":
      return event.item.done ? "Marked done" : "Pending";
    case "tool.called":
      return event.requiresHumanApproval
        ? "Waiting for approval before execution"
        : summarizeToolArgs(event.toolArgs);
    case "tool.completed":
      return summarizeToolResult(event.result, event.durationMs);
    case "tool.failed": {
      const qualifiers = [
        event.blockedByPolicy ? "blocked by policy" : null,
        event.recoverable ? "recoverable" : null,
        event.code ?? null,
      ].filter(Boolean);

      return qualifiers.length > 0
        ? `${event.error} (${qualifiers.join(", ")})`
        : event.error;
    }
    case "approval.requested":
      return event.approval.reason;
    case "approval.resolved":
      return `Request ${event.resolution}`;
    case "artifact.projected":
      return event.artifact.label;
    case "checkpoint.created":
      return event.boundary ? `Boundary: ${event.boundary}` : undefined;
    case "run.completed":
    case "run.failed":
    case "run.cancelled":
      return event.outcome.reason;
    default:
      return undefined;
  }
}

function selectCurrentIntent(run: AgentRun, events: AgentRunEvent[]): string | undefined {
  const metadataIntent = readMetadataString(run.metadata, "currentIntent");
  if (metadataIntent) {
    return metadataIntent;
  }

  const task = readMetadataString(run.metadata, "task");
  const latestToolEvent = [...events]
    .reverse()
    .find(
      (event) =>
        event.type === "tool.called" ||
        event.type === "tool.completed" ||
        event.type === "tool.failed",
    );

  if (latestToolEvent?.type === "tool.called") {
    return `Running ${latestToolEvent.toolName}`;
  }

  if (latestToolEvent?.type === "tool.completed") {
    return `Completed ${latestToolEvent.toolName}`;
  }

  if (latestToolEvent?.type === "tool.failed") {
    return latestToolEvent.blockedByPolicy
      ? `Blocked on ${latestToolEvent.toolName}`
      : `Retrying ${latestToolEvent.toolName}`;
  }

  return task;
}

function summarizeToolArgs(toolArgs: Record<string, unknown>): string | undefined {
  const entries = Object.entries(toolArgs).slice(0, 2);
  if (entries.length === 0) {
    return undefined;
  }

  return entries
    .map(([key, value]) => `${key}: ${stringifyScalar(value)}`)
    .join(" | ");
}

function summarizeToolResult(result: unknown, durationMs: number): string {
  const duration = durationMs > 0 ? ` in ${durationMs}ms` : "";

  if (typeof result === "string" && result.trim().length > 0) {
    return `${truncate(result.trim(), 80)}${duration}`;
  }

  if (result && typeof result === "object") {
    const summary = Object.entries(result as Record<string, unknown>)
      .slice(0, 2)
      .map(([key, value]) => `${key}: ${stringifyScalar(value)}`)
      .join(" | ");

    if (summary) {
      return `${summary}${duration}`;
    }
  }

  return `Completed${duration}`;
}

function readMetadataString(
  metadata: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = metadata[key];
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function stringifyScalar(value: unknown): string {
  if (typeof value === "string") {
    return truncate(value, 40);
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null ||
    value === undefined
  ) {
    return String(value);
  }

  if (Array.isArray(value)) {
    return truncate(value.map((entry) => stringifyScalar(entry)).join(", "), 40);
  }

  return truncate(JSON.stringify(value), 40);
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1)}…`;
}
