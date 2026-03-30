/**
 * Canonical Agent Runtime Reducer — Phase 07
 *
 * Pure function that applies AgentRunEvents to an AgentRun snapshot.
 * This is the single source of truth for runtime state transitions.
 *
 * Design: The reducer treats `run.imported` as a valid migration provenance
 * event that can be reduced without changing runtime correctness — it records
 * provenance metadata but does not alter the run's operational state.
 */

import type {
  AgentRun,
  AgentRunEvent,
  AgentRunMode,
} from "./contracts.js";

// ─── Factory ───────────────────────────────────────────────────────────────────

/** Create a fresh AgentRun snapshot with sensible defaults. */
export function createAgentRun(
  runId: string,
  mode: AgentRunMode,
  now: number = Date.now()
): AgentRun {
  return {
    runId,
    mode,
    status: "pending",
    phase: "init",
    createdAt: now,
    updatedAt: now,
    todoItems: [],
    pendingApproval: null,
    artifactRefs: [],
    latestCheckpointId: null,
    terminalOutcome: null,
    metadata: {},
  };
}

// ─── Reducer ───────────────────────────────────────────────────────────────────

/**
 * Apply a single AgentRunEvent to an AgentRun snapshot, returning a new snapshot.
 * This is a pure function — the input snapshot is not mutated.
 */
export function reduceAgentRunEvent(
  snapshot: AgentRun,
  event: AgentRunEvent
): AgentRun {
  const base: AgentRun = {
    ...snapshot,
    updatedAt: event.timestamp,
    todoItems: [...(snapshot.todoItems ?? [])],
    artifactRefs: [...(snapshot.artifactRefs ?? [])],
    metadata: { ...(snapshot.metadata ?? {}) },
  };

  switch (event.type) {
    case "run.started":
      return {
        ...base,
        status: "running",
        phase: "init",
      };

    case "run.imported":
      // Migration provenance: record the import in metadata but don't change
      // operational state, preserving runtime correctness.
      return {
        ...base,
        metadata: {
          ...base.metadata,
          importedFrom: {
            sourceRunId: event.sourceRunId,
            sourceMode: event.sourceMode,
            migratedFields: event.migratedFields,
            importedAt: event.timestamp,
          },
        },
      };

    case "run.phase_changed":
      return {
        ...base,
        phase: event.toPhase,
      };

    case "todo.replaced":
      return {
        ...base,
        todoItems: [...event.items],
      };

    case "todo.item_upserted": {
      const existing = base.todoItems.findIndex(
        (t) => t.id === event.item.id
      );
      const items = [...base.todoItems];
      if (existing >= 0) {
        items[existing] = event.item;
      } else {
        items.push(event.item);
      }
      return { ...base, todoItems: items };
    }

    case "tool.called":
      return {
        ...base,
        status: "running",
      };

    case "tool.completed":
      return base;

    case "tool.failed":
      return base;

    case "approval.requested":
      return {
        ...base,
        status: "waiting_approval",
        pendingApproval: event.approval,
      };

    case "approval.resolved": {
      const approval = base.pendingApproval;
      return {
        ...base,
        status: "running",
        pendingApproval: approval
          ? {
              ...approval,
              resolvedAt: event.timestamp,
              resolution: event.resolution,
            }
          : null,
      };
    }

    case "artifact.projected":
      return {
        ...base,
        artifactRefs: [...base.artifactRefs, event.artifact],
      };

    case "evidence.recorded":
      return base;

    case "checkpoint.created":
      return {
        ...base,
        latestCheckpointId: event.checkpointId,
      };

    case "run.completed":
      return {
        ...base,
        status: "completed",
        terminalOutcome: event.outcome,
      };

    case "run.failed":
      return {
        ...base,
        status: "failed",
        terminalOutcome: event.outcome,
      };

    case "run.cancelled":
      return {
        ...base,
        status: "cancelled",
        terminalOutcome: event.outcome,
      };

    default: {
      // Exhaustive check — if this errors, a new event type was added
      // to AgentRunEvent but not handled here.
      const _exhaustive: never = event;
      return _exhaustive;
    }
  }
}
