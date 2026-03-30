/**
 * Canonical Agent Runtime Contracts — Phase 07
 *
 * These types unify browser-action and deep-research workflows into a single
 * runtime contract. Both workflow modes share the same AgentRun, AgentRunEvent,
 * and AgentCheckpoint types.
 *
 * IMPORTANT: Legacy types (BrowserAgentState, AriaRunState) remain in
 * shared/types/index.d.ts until Plan 03 compatibility removal.
 */

// ─── Run Mode ──────────────────────────────────────────────────────────────────

/** The two canonical agent workflow modes. */
export type AgentRunMode = "browser-action" | "deep-research";

// ─── Run Status ────────────────────────────────────────────────────────────────

/** Lifecycle status of an agent run. */
export type AgentRunStatus =
  | "pending"
  | "running"
  | "paused"
  | "waiting_approval"
  | "completed"
  | "failed"
  | "cancelled";

// ─── Run Phase ─────────────────────────────────────────────────────────────────

/** High-level phase within a run (mode-agnostic). */
export type AgentRunPhase =
  | "init"
  | "planning"
  | "executing"
  | "validating"
  | "finalizing";

// ─── Todo Items ────────────────────────────────────────────────────────────────

/** A todo item tracked within a run. */
export interface AgentTodoItem {
  id: string;
  label: string;
  done: boolean;
  createdAt: number;
  updatedAt: number;
}

// ─── Pending Approval ──────────────────────────────────────────────────────────

/** An approval gate that blocks run progress until resolved. */
export interface AgentPendingApproval {
  approvalId: string;
  reason: string;
  requestedAt: number;
  resolvedAt?: number;
  resolution?: "approved" | "rejected";
}

// ─── Artifact Ref ──────────────────────────────────────────────────────────────

/** Reference to an artifact produced or consumed by a run. */
export interface AgentArtifactRef {
  artifactId: string;
  artifactType: "todo" | "state" | "evidence" | "report-input";
  label: string;
  uri?: string;
  createdAt: number;
}

// ─── Terminal Outcome ──────────────────────────────────────────────────────────

/** Terminal outcome recorded when a run reaches a final state. */
export interface AgentTerminalOutcome {
  status: "completed" | "failed" | "cancelled";
  reason?: string;
  finishedAt: number;
}

// ─── Agent Run (root state) ────────────────────────────────────────────────────

/**
 * The canonical root state for any agent run.
 * Both browser-action and deep-research workflows share this shape.
 */
export interface AgentRun {
  runId: string;
  mode: AgentRunMode;
  status: AgentRunStatus;
  phase: AgentRunPhase;

  // Timestamps
  createdAt: number;
  updatedAt: number;

  // Runtime data
  todoItems: AgentTodoItem[];
  pendingApproval: AgentPendingApproval | null;
  artifactRefs: AgentArtifactRef[];
  latestCheckpointId: string | null;

  // Terminal
  terminalOutcome: AgentTerminalOutcome | null;

  // Extension metadata
  metadata: Record<string, unknown>;
}

// ─── Agent Run Events (discriminated union) ────────────────────────────────────

/** All possible event type discriminants. */
export type AgentRunEventType =
  | "run.started"
  | "run.imported"
  | "run.phase_changed"
  | "todo.replaced"
  | "todo.item_upserted"
  | "tool.called"
  | "tool.completed"
  | "tool.failed"
  | "approval.requested"
  | "approval.resolved"
  | "artifact.projected"
  | "checkpoint.created"
  | "run.completed"
  | "run.failed"
  | "run.cancelled";

/** Base fields shared by every event. */
interface AgentRunEventBase {
  eventId: string;
  runId: string;
  timestamp: number;
}

// ── Individual event shapes ─────────────────────────────────────────────────

export interface RunStartedEvent extends AgentRunEventBase {
  type: "run.started";
  mode: AgentRunMode;
}

export interface RunImportedEvent extends AgentRunEventBase {
  type: "run.imported";
  sourceRunId: string;
  sourceMode: AgentRunMode;
  migratedFields: string[];
}

export interface RunPhaseChangedEvent extends AgentRunEventBase {
  type: "run.phase_changed";
  fromPhase: AgentRunPhase;
  toPhase: AgentRunPhase;
}

export interface TodoReplacedEvent extends AgentRunEventBase {
  type: "todo.replaced";
  items: AgentTodoItem[];
}

export interface TodoItemUpsertedEvent extends AgentRunEventBase {
  type: "todo.item_upserted";
  item: AgentTodoItem;
}

export interface ToolCalledEvent extends AgentRunEventBase {
  type: "tool.called";
  toolName: string;
  toolArgs: Record<string, unknown>;
}

export interface ToolCompletedEvent extends AgentRunEventBase {
  type: "tool.completed";
  toolName: string;
  result: unknown;
  durationMs: number;
}

export interface ToolFailedEvent extends AgentRunEventBase {
  type: "tool.failed";
  toolName: string;
  error: string;
  durationMs: number;
}

export interface ApprovalRequestedEvent extends AgentRunEventBase {
  type: "approval.requested";
  approval: AgentPendingApproval;
}

export interface ApprovalResolvedEvent extends AgentRunEventBase {
  type: "approval.resolved";
  approvalId: string;
  resolution: "approved" | "rejected";
}

export interface ArtifactProjectedEvent extends AgentRunEventBase {
  type: "artifact.projected";
  artifact: AgentArtifactRef;
}

export interface CheckpointCreatedEvent extends AgentRunEventBase {
  type: "checkpoint.created";
  checkpointId: string;
}

export interface RunCompletedEvent extends AgentRunEventBase {
  type: "run.completed";
  outcome: AgentTerminalOutcome;
}

export interface RunFailedEvent extends AgentRunEventBase {
  type: "run.failed";
  outcome: AgentTerminalOutcome;
}

export interface RunCancelledEvent extends AgentRunEventBase {
  type: "run.cancelled";
  outcome: AgentTerminalOutcome;
}

/** Discriminated union of all canonical agent run events. */
export type AgentRunEvent =
  | RunStartedEvent
  | RunImportedEvent
  | RunPhaseChangedEvent
  | TodoReplacedEvent
  | TodoItemUpsertedEvent
  | ToolCalledEvent
  | ToolCompletedEvent
  | ToolFailedEvent
  | ApprovalRequestedEvent
  | ApprovalResolvedEvent
  | ArtifactProjectedEvent
  | CheckpointCreatedEvent
  | RunCompletedEvent
  | RunFailedEvent
  | RunCancelledEvent;

// ─── Checkpoint ────────────────────────────────────────────────────────────────

/** A point-in-time snapshot of an AgentRun for persistence and recovery. */
export interface AgentCheckpoint {
  checkpointId: string;
  runId: string;
  snapshot: AgentRun;
  timestamp: number;
  trigger: "auto" | "manual" | "pre-approval" | "terminal";
}
