/**
 * Canonical Agent Runtime Zod Schemas — Phase 07
 *
 * Validation schemas for all canonical runtime types defined in contracts.ts.
 * These schemas are the shared contract for the side panel, service worker,
 * and persistence layer.
 *
 * SHADOW VALIDATION RULE: These schemas are defined for the new contracts and
 * test coverage only. Active service-worker and side-panel listeners are NOT
 * required to enforce these schemas in Plan 01.
 */

import { z } from "zod";

// ─── Primitives ────────────────────────────────────────────────────────────────

export const AgentRunModeSchema = z.enum(["browser-action", "deep-research"]);
export const BrowserActionCheckpointBoundarySchema = z.enum([
  "plan-created",
  "tool-dispatch",
  "tool-result",
  "retry-planned",
  "paused",
  "resumed",
  "terminal",
]);

export const AgentRunStatusSchema = z.enum([
  "pending",
  "running",
  "paused",
  "waiting_approval",
  "completed",
  "failed",
  "cancelled",
]);

export const AgentRunPhaseSchema = z.enum([
  "init",
  "planning",
  "executing",
  "validating",
  "finalizing",
]);

// ─── Sub-objects ───────────────────────────────────────────────────────────────

export const AgentTodoItemSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  done: z.boolean(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export const AgentPendingApprovalSchema = z.object({
  approvalId: z.string().min(1),
  reason: z.string().min(1),
  requestedAt: z.number(),
  resolvedAt: z.number().optional(),
  resolution: z.enum(["approved", "rejected"]).optional(),
});

export const AgentArtifactRefSchema = z.object({
  artifactId: z.string().min(1),
  artifactType: z.enum(["todo", "state", "evidence", "report-input"]),
  label: z.string().min(1),
  uri: z.string().optional(),
  createdAt: z.number(),
});

export const AgentTerminalOutcomeSchema = z.object({
  status: z.enum(["completed", "failed", "cancelled"]),
  reason: z.string().optional(),
  finishedAt: z.number(),
});

// ─── AgentRun ──────────────────────────────────────────────────────────────────

export const AgentRunSchema = z.object({
  runId: z.string().min(1),
  mode: AgentRunModeSchema,
  status: AgentRunStatusSchema,
  phase: AgentRunPhaseSchema,
  createdAt: z.number(),
  updatedAt: z.number(),
  todoItems: z.array(AgentTodoItemSchema),
  pendingApproval: AgentPendingApprovalSchema.nullable(),
  artifactRefs: z.array(AgentArtifactRefSchema),
  latestCheckpointId: z.string().nullable(),
  terminalOutcome: AgentTerminalOutcomeSchema.nullable(),
  metadata: z.record(z.unknown()),
});

// ─── Agent Run Events ──────────────────────────────────────────────────────────

const eventBase = {
  eventId: z.string().min(1),
  runId: z.string().min(1),
  timestamp: z.number(),
};

export const RunStartedEventSchema = z.object({
  ...eventBase,
  type: z.literal("run.started"),
  mode: AgentRunModeSchema,
});

export const RunImportedEventSchema = z.object({
  ...eventBase,
  type: z.literal("run.imported"),
  sourceRunId: z.string().min(1),
  sourceMode: AgentRunModeSchema,
  migratedFields: z.array(z.string()),
});

export const RunPhaseChangedEventSchema = z.object({
  ...eventBase,
  type: z.literal("run.phase_changed"),
  fromPhase: AgentRunPhaseSchema,
  toPhase: AgentRunPhaseSchema,
  reason: z.string().optional(),
  detail: z.string().optional(),
});

export const TodoReplacedEventSchema = z.object({
  ...eventBase,
  type: z.literal("todo.replaced"),
  items: z.array(AgentTodoItemSchema),
});

export const TodoItemUpsertedEventSchema = z.object({
  ...eventBase,
  type: z.literal("todo.item_upserted"),
  item: AgentTodoItemSchema,
});

export const ToolCalledEventSchema = z.object({
  ...eventBase,
  type: z.literal("tool.called"),
  toolName: z.string().min(1),
  toolArgs: z.record(z.unknown()),
  checkpointBoundary: BrowserActionCheckpointBoundarySchema.optional(),
  requiresHumanApproval: z.boolean().optional(),
});

export const ToolCompletedEventSchema = z.object({
  ...eventBase,
  type: z.literal("tool.completed"),
  toolName: z.string().min(1),
  result: z.unknown(),
  durationMs: z.number(),
  checkpointBoundary: BrowserActionCheckpointBoundarySchema.optional(),
});

export const ToolFailedEventSchema = z.object({
  ...eventBase,
  type: z.literal("tool.failed"),
  toolName: z.string().min(1),
  error: z.string(),
  durationMs: z.number(),
  checkpointBoundary: BrowserActionCheckpointBoundarySchema.optional(),
  code: z.string().optional(),
  recoverable: z.boolean().optional(),
  blockedByPolicy: z.boolean().optional(),
});

export const ApprovalRequestedEventSchema = z.object({
  ...eventBase,
  type: z.literal("approval.requested"),
  approval: AgentPendingApprovalSchema,
});

export const ApprovalResolvedEventSchema = z.object({
  ...eventBase,
  type: z.literal("approval.resolved"),
  approvalId: z.string().min(1),
  resolution: z.enum(["approved", "rejected"]),
});

export const ArtifactProjectedEventSchema = z.object({
  ...eventBase,
  type: z.literal("artifact.projected"),
  artifact: AgentArtifactRefSchema,
});

export const CheckpointCreatedEventSchema = z.object({
  ...eventBase,
  type: z.literal("checkpoint.created"),
  checkpointId: z.string().min(1),
  boundary: BrowserActionCheckpointBoundarySchema.optional(),
});

export const RunCompletedEventSchema = z.object({
  ...eventBase,
  type: z.literal("run.completed"),
  outcome: AgentTerminalOutcomeSchema,
});

export const RunFailedEventSchema = z.object({
  ...eventBase,
  type: z.literal("run.failed"),
  outcome: AgentTerminalOutcomeSchema,
});

export const RunCancelledEventSchema = z.object({
  ...eventBase,
  type: z.literal("run.cancelled"),
  outcome: AgentTerminalOutcomeSchema,
});

/** Discriminated union schema for all canonical agent run events. */
export const AgentRunEventSchema = z.discriminatedUnion("type", [
  RunStartedEventSchema,
  RunImportedEventSchema,
  RunPhaseChangedEventSchema,
  TodoReplacedEventSchema,
  TodoItemUpsertedEventSchema,
  ToolCalledEventSchema,
  ToolCompletedEventSchema,
  ToolFailedEventSchema,
  ApprovalRequestedEventSchema,
  ApprovalResolvedEventSchema,
  ArtifactProjectedEventSchema,
  CheckpointCreatedEventSchema,
  RunCompletedEventSchema,
  RunFailedEventSchema,
  RunCancelledEventSchema,
]);

// ─── Checkpoint ────────────────────────────────────────────────────────────────

export const AgentCheckpointSchema = z.object({
  checkpointId: z.string().min(1),
  runId: z.string().min(1),
  snapshot: AgentRunSchema,
  timestamp: z.number(),
  trigger: z.enum(["auto", "manual", "pre-approval", "terminal"]),
  boundary: BrowserActionCheckpointBoundarySchema.optional(),
});
