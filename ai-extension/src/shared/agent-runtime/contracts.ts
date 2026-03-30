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

/** Named browser-action loop boundaries used for recovery and controls. */
export type BrowserActionCheckpointBoundary =
  | "plan-created"
  | "tool-dispatch"
  | "tool-result"
  | "retry-planned"
  | "paused"
  | "resumed"
  | "terminal";

/** Named deep-research loop boundaries used for recovery and controls. */
export type DeepResearchCheckpointBoundary =
  | "research-plan-created"
  | "question-activated"
  | "finding-captured"
  | "synthesis-updated"
  | "paused"
  | "resumed"
  | "terminal";

/** Shared checkpoint boundary surface across workflow modes. */
export type AgentCheckpointBoundary =
  | BrowserActionCheckpointBoundary
  | DeepResearchCheckpointBoundary;

/** Canonical browser-action launch metadata persisted on AgentRun.metadata. */
export interface BrowserActionRunMetadata {
  task: string;
  providerId: string;
  providerType: string;
  modelId: string;
  conversationId?: string;
  tabId: number;
  tabUrl?: string;
  tabTitle?: string;
  currentIntent?: string;
  retryCount?: number;
  lastToolName?: string;
  lastError?: string;
}

export type DeepResearchQuestionStatus =
  | "pending"
  | "active"
  | "answered"
  | "blocked";

export interface DeepResearchQuestion {
  id: string;
  question: string;
  status: DeepResearchQuestionStatus;
  order: number;
  createdAt: number;
  updatedAt: number;
  summary?: string;
  lastAnsweredAt?: number;
}

export type DeepResearchGapStatus = "open" | "resolved";

export interface DeepResearchGap {
  id: string;
  questionId?: string;
  note: string;
  status: DeepResearchGapStatus;
  createdAt: number;
  updatedAt: number;
  resolvedAt?: number;
}

export interface DeepResearchSourceMetadata {
  sourceUrl: string;
  title?: string;
  capturedAt: number;
  contentType?: string;
}

export interface DeepResearchFinding {
  id: string;
  summary: string;
  excerpt?: string;
  supportedQuestionIds: string[];
  source: DeepResearchSourceMetadata;
  createdAt: number;
}

/** Canonical deep-research launch and runtime metadata persisted on AgentRun.metadata. */
export interface DeepResearchRunMetadata {
  topic: string;
  goal: string;
  providerId: string;
  providerType: string;
  modelId: string;
  questionsTotal: number;
  openGapCount: number;
  questionsAnswered?: number;
  activeQuestionId?: string;
  currentIntent?: string;
  latestSynthesis?: string;
  latestFindingId?: string;
  conversationId?: string;
  pocketId?: string;
  tabId?: number;
  tabUrl?: string;
  tabTitle?: string;
  questions?: DeepResearchQuestion[];
  gaps?: DeepResearchGap[];
  findings?: DeepResearchFinding[];
}

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

/** Context about the target page and element for an approval request. */
export interface ApprovalTargetContext {
  tabId: number;
  tabUrl?: string;
  tabTitle?: string;
  /** For click/type tools: the CSS selector being targeted */
  selector?: string;
  /** For type_text: the text that will be entered (truncated to 200 chars) */
  textPreview?: string;
}

/** An approval gate that blocks run progress until resolved. */
export interface AgentPendingApproval {
  approvalId: string;
  reason: string;
  requestedAt: number;
  resolvedAt?: number;
  resolution?: "approved" | "rejected";
  // CTRL-02 context fields (Phase 9)
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  targetContext?: ApprovalTargetContext;
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
  reason?: string;
  detail?: string;
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
  checkpointBoundary?: AgentCheckpointBoundary;
  requiresHumanApproval?: boolean;
}

export interface ToolCompletedEvent extends AgentRunEventBase {
  type: "tool.completed";
  toolName: string;
  result: unknown;
  durationMs: number;
  checkpointBoundary?: AgentCheckpointBoundary;
}

export interface ToolFailedEvent extends AgentRunEventBase {
  type: "tool.failed";
  toolName: string;
  error: string;
  durationMs: number;
  checkpointBoundary?: AgentCheckpointBoundary;
  code?: string;
  recoverable?: boolean;
  blockedByPolicy?: boolean;
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
  boundary?: AgentCheckpointBoundary;
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
  boundary?: AgentCheckpointBoundary;
}
