import { describe, it, expect } from "vitest";
import {
  AgentRunSchema,
  AgentCheckpointSchema,
  AgentRunEventSchema,
  AgentPendingApprovalSchema,
  AgentArtifactRefSchema,
  AgentRunModeSchema,
} from "../src/shared/agent-runtime/schemas.js";
import type {
  AgentRun,
  AgentRunEvent,
  AgentCheckpoint,
  AgentRunMode,
} from "../src/shared/agent-runtime/contracts.js";

describe("agent runtime contracts", () => {
  // ── Mode literals ─────────────────────────────────────────────────────

  it("accepts browser-action and deep-research as valid run modes", () => {
    expect(AgentRunModeSchema.parse("browser-action")).toBe("browser-action");
    expect(AgentRunModeSchema.parse("deep-research")).toBe("deep-research");
  });

  it("rejects invalid run modes", () => {
    const result = AgentRunModeSchema.safeParse("unknown-mode");
    expect(result.success).toBe(false);
  });

  // ── AgentRun schema ───────────────────────────────────────────────────

  it("parses a valid browser-action AgentRun", () => {
    const run: AgentRun = {
      runId: "run-001",
      mode: "browser-action",
      status: "pending",
      phase: "init",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      todoItems: [],
      pendingApproval: null,
      artifactRefs: [],
      latestCheckpointId: null,
      terminalOutcome: null,
      metadata: {},
    };
    expect(AgentRunSchema.parse(run)).toEqual(run);
  });

  it("parses a valid deep-research AgentRun", () => {
    const run: AgentRun = {
      runId: "run-002",
      mode: "deep-research",
      status: "running",
      phase: "executing",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      todoItems: [
        { id: "t1", label: "Research topic", done: false, createdAt: Date.now(), updatedAt: Date.now() },
      ],
      pendingApproval: null,
      artifactRefs: [
        { artifactId: "a1", artifactType: "todo", label: "Todo list", createdAt: Date.now() },
        { artifactId: "a2", artifactType: "state", label: "Run state", createdAt: Date.now() },
      ],
      latestCheckpointId: "cp-001",
      terminalOutcome: null,
      metadata: { pocketId: "pocket-123" },
    };
    expect(AgentRunSchema.parse(run)).toEqual(run);
  });

  it("rejects an AgentRun missing required fields", () => {
    const malformed = { runId: "run-bad" };
    const result = AgentRunSchema.safeParse(malformed);
    expect(result.success).toBe(false);
  });

  // ── AgentRunEvent schema (discriminated union) ────────────────────────

  it("parses a run.started event", () => {
    const event: AgentRunEvent = {
      eventId: "evt-001",
      runId: "run-001",
      timestamp: Date.now(),
      type: "run.started",
      mode: "browser-action",
    };
    expect(AgentRunEventSchema.parse(event)).toEqual(event);
  });

  it("parses a run.imported event (migration provenance)", () => {
    const event: AgentRunEvent = {
      eventId: "evt-002",
      runId: "run-001",
      timestamp: Date.now(),
      type: "run.imported",
      sourceRunId: "legacy-run-001",
      sourceMode: "deep-research",
      migratedFields: ["todoItems", "artifactRefs"],
    };
    expect(AgentRunEventSchema.parse(event)).toEqual(event);
  });

  it("parses an approval.requested event", () => {
    const event: AgentRunEvent = {
      eventId: "evt-003",
      runId: "run-001",
      timestamp: Date.now(),
      type: "approval.requested",
      approval: {
        approvalId: "apv-001",
        reason: "Confirm navigation to external site",
        requestedAt: Date.now(),
      },
    };
    expect(AgentRunEventSchema.parse(event)).toEqual(event);
  });

  it("parses an artifact.projected event", () => {
    const event: AgentRunEvent = {
      eventId: "evt-004",
      runId: "run-001",
      timestamp: Date.now(),
      type: "artifact.projected",
      artifact: {
        artifactId: "art-001",
        artifactType: "evidence",
        label: "Screenshot capture",
        uri: "blob://screenshot-001",
        createdAt: Date.now(),
      },
    };
    expect(AgentRunEventSchema.parse(event)).toEqual(event);
  });

  it("parses a run.completed event", () => {
    const event: AgentRunEvent = {
      eventId: "evt-005",
      runId: "run-001",
      timestamp: Date.now(),
      type: "run.completed",
      outcome: {
        status: "completed",
        reason: "All steps executed successfully",
        finishedAt: Date.now(),
      },
    };
    expect(AgentRunEventSchema.parse(event)).toEqual(event);
  });

  it("rejects a malformed event missing discriminant fields", () => {
    const malformed = {
      eventId: "evt-bad",
      runId: "run-001",
      timestamp: Date.now(),
      // missing `type` discriminant
    };
    const result = AgentRunEventSchema.safeParse(malformed);
    expect(result.success).toBe(false);
  });

  it("rejects an event with invalid type discriminant", () => {
    const malformed = {
      eventId: "evt-bad",
      runId: "run-001",
      timestamp: Date.now(),
      type: "nonexistent.event",
    };
    const result = AgentRunEventSchema.safeParse(malformed);
    expect(result.success).toBe(false);
  });

  // ── Checkpoint ────────────────────────────────────────────────────────

  it("parses a valid AgentCheckpoint", () => {
    const checkpoint: AgentCheckpoint = {
      checkpointId: "cp-001",
      runId: "run-001",
      snapshot: {
        runId: "run-001",
        mode: "browser-action",
        status: "running",
        phase: "executing",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        todoItems: [],
        pendingApproval: null,
        artifactRefs: [],
        latestCheckpointId: null,
        terminalOutcome: null,
        metadata: {},
      },
      timestamp: Date.now(),
      trigger: "auto",
    };
    expect(AgentCheckpointSchema.parse(checkpoint)).toEqual(checkpoint);
  });

  // ── Artifact type literals ────────────────────────────────────────────

  it("validates all artifact type values", () => {
    const types = ["todo", "state", "evidence", "report-input"] as const;
    for (const t of types) {
      const ref = {
        artifactId: `art-${t}`,
        artifactType: t,
        label: `Artifact ${t}`,
        createdAt: Date.now(),
      };
      expect(AgentArtifactRefSchema.parse(ref).artifactType).toBe(t);
    }
  });

  // ── Deep-research artifact refs include pocket-linked refs ────────────

  it("deep-research runs support pocket-linked todo and state artifact refs", () => {
    const todoRef = {
      artifactId: "art-todo-pocket",
      artifactType: "todo" as const,
      label: "Pocket todo list",
      uri: "pocket://pocket-123/todos",
      createdAt: Date.now(),
    };
    const stateRef = {
      artifactId: "art-state-pocket",
      artifactType: "state" as const,
      label: "Pocket state snapshot",
      uri: "pocket://pocket-123/state",
      createdAt: Date.now(),
    };
    expect(AgentArtifactRefSchema.parse(todoRef).artifactType).toBe("todo");
    expect(AgentArtifactRefSchema.parse(stateRef).artifactType).toBe("state");
  });

  // ── Approval schema ──────────────────────────────────────────────────

  it("parses a pending approval with resolution", () => {
    const approval = {
      approvalId: "apv-001",
      reason: "Confirm action",
      requestedAt: Date.now(),
      resolvedAt: Date.now(),
      resolution: "approved" as const,
    };
    expect(AgentPendingApprovalSchema.parse(approval)).toEqual(approval);
  });
});
