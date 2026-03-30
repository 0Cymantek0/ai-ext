import { describe, it, expect } from "vitest";
import { createAgentRun, reduceAgentRunEvent } from "../src/shared/agent-runtime/reducer.js";
import type {
  AgentRun,
  AgentRunEvent,
  RunStartedEvent,
  RunImportedEvent,
  TodoItemUpsertedEvent,
  ApprovalRequestedEvent,
  ApprovalResolvedEvent,
  CheckpointCreatedEvent,
  ArtifactProjectedEvent,
  RunCompletedEvent,
} from "../src/shared/agent-runtime/contracts.js";

describe("agent runtime timeline reducer", () => {
  const NOW = 1700000000000;

  function makeEventId(n: number): string {
    return `evt-${String(n).padStart(3, "0")}`;
  }

  it("applies a full browser-action timeline to a canonical run snapshot", () => {
    // Start with a fresh run
    let run = createAgentRun("run-ba-001", "browser-action", NOW);
    expect(run.status).toBe("pending");
    expect(run.mode).toBe("browser-action");

    // 1. run.started
    const started: RunStartedEvent = {
      eventId: makeEventId(1),
      runId: "run-ba-001",
      timestamp: NOW + 100,
      type: "run.started",
      mode: "browser-action",
    };
    run = reduceAgentRunEvent(run, started);
    expect(run.status).toBe("running");

    // 2. todo.item_upserted
    const todoUpsert: TodoItemUpsertedEvent = {
      eventId: makeEventId(2),
      runId: "run-ba-001",
      timestamp: NOW + 200,
      type: "todo.item_upserted",
      item: {
        id: "todo-1",
        label: "Navigate to target page",
        done: false,
        createdAt: NOW + 200,
        updatedAt: NOW + 200,
      },
    };
    run = reduceAgentRunEvent(run, todoUpsert);
    expect(run.todoItems).toHaveLength(1);
    expect(run.todoItems[0].label).toBe("Navigate to target page");

    // 3. approval.requested
    const approvalReq: ApprovalRequestedEvent = {
      eventId: makeEventId(3),
      runId: "run-ba-001",
      timestamp: NOW + 300,
      type: "approval.requested",
      approval: {
        approvalId: "apv-001",
        reason: "Confirm navigation to external site",
        requestedAt: NOW + 300,
      },
    };
    run = reduceAgentRunEvent(run, approvalReq);
    expect(run.status).toBe("waiting_approval");
    expect(run.pendingApproval).not.toBeNull();
    expect(run.pendingApproval!.approvalId).toBe("apv-001");

    // 4. approval.resolved
    const approvalRes: AgentRunEvent = {
      eventId: makeEventId(4),
      runId: "run-ba-001",
      timestamp: NOW + 400,
      type: "approval.resolved",
      approvalId: "apv-001",
      resolution: "approved",
    };
    run = reduceAgentRunEvent(run, approvalRes);
    expect(run.status).toBe("running");
    expect(run.pendingApproval!.resolution).toBe("approved");

    // 5. checkpoint.created
    const checkpoint: CheckpointCreatedEvent = {
      eventId: makeEventId(5),
      runId: "run-ba-001",
      timestamp: NOW + 500,
      type: "checkpoint.created",
      checkpointId: "cp-001",
    };
    run = reduceAgentRunEvent(run, checkpoint);
    expect(run.latestCheckpointId).toBe("cp-001");

    // 6. run.completed
    const completed: RunCompletedEvent = {
      eventId: makeEventId(6),
      runId: "run-ba-001",
      timestamp: NOW + 600,
      type: "run.completed",
      outcome: {
        status: "completed",
        reason: "All steps executed successfully",
        finishedAt: NOW + 600,
      },
    };
    run = reduceAgentRunEvent(run, completed);
    expect(run.status).toBe("completed");
    expect(run.terminalOutcome).not.toBeNull();
    expect(run.terminalOutcome!.status).toBe("completed");
  });

  it("handles run.imported as migration provenance without changing operational state", () => {
    let run = createAgentRun("run-dr-001", "deep-research", NOW);

    // Start the run first
    const started: RunStartedEvent = {
      eventId: makeEventId(1),
      runId: "run-dr-001",
      timestamp: NOW + 100,
      type: "run.started",
      mode: "deep-research",
    };
    run = reduceAgentRunEvent(run, started);
    expect(run.status).toBe("running");

    // Apply run.imported — should preserve status as running
    const imported: RunImportedEvent = {
      eventId: makeEventId(2),
      runId: "run-dr-001",
      timestamp: NOW + 200,
      type: "run.imported",
      sourceRunId: "legacy-aria-001",
      sourceMode: "deep-research",
      migratedFields: ["todoItems", "artifactRefs"],
    };
    run = reduceAgentRunEvent(run, imported);

    // Status must not change from running
    expect(run.status).toBe("running");
    // Provenance must be recorded in metadata
    expect(run.metadata).toHaveProperty("importedFrom");
    const provenance = run.metadata.importedFrom as Record<string, unknown>;
    expect(provenance.sourceRunId).toBe("legacy-aria-001");
    expect(provenance.migratedFields).toEqual(["todoItems", "artifactRefs"]);
  });

  it("applies todo.item_upserted to update existing items", () => {
    let run = createAgentRun("run-003", "browser-action", NOW);

    // Add a todo
    const addTodo: TodoItemUpsertedEvent = {
      eventId: makeEventId(1),
      runId: "run-003",
      timestamp: NOW + 100,
      type: "todo.item_upserted",
      item: {
        id: "todo-1",
        label: "Step 1",
        done: false,
        createdAt: NOW + 100,
        updatedAt: NOW + 100,
      },
    };
    run = reduceAgentRunEvent(run, addTodo);
    expect(run.todoItems).toHaveLength(1);

    // Upsert the same todo (mark done)
    const updateTodo: TodoItemUpsertedEvent = {
      eventId: makeEventId(2),
      runId: "run-003",
      timestamp: NOW + 200,
      type: "todo.item_upserted",
      item: {
        id: "todo-1",
        label: "Step 1",
        done: true,
        createdAt: NOW + 100,
        updatedAt: NOW + 200,
      },
    };
    run = reduceAgentRunEvent(run, updateTodo);
    expect(run.todoItems).toHaveLength(1);
    expect(run.todoItems[0].done).toBe(true);
  });

  it("accumulates artifact refs via artifact.projected", () => {
    let run = createAgentRun("run-004", "deep-research", NOW);

    const art1: ArtifactProjectedEvent = {
      eventId: makeEventId(1),
      runId: "run-004",
      timestamp: NOW + 100,
      type: "artifact.projected",
      artifact: {
        artifactId: "art-001",
        artifactType: "evidence",
        label: "Screenshot",
        createdAt: NOW + 100,
      },
    };

    const art2: ArtifactProjectedEvent = {
      eventId: makeEventId(2),
      runId: "run-004",
      timestamp: NOW + 200,
      type: "artifact.projected",
      artifact: {
        artifactId: "art-002",
        artifactType: "report-input",
        label: "Research notes",
        createdAt: NOW + 200,
      },
    };

    run = reduceAgentRunEvent(run, art1);
    run = reduceAgentRunEvent(run, art2);
    expect(run.artifactRefs).toHaveLength(2);
    expect(run.artifactRefs[0].artifactType).toBe("evidence");
    expect(run.artifactRefs[1].artifactType).toBe("report-input");
  });

  it("transitions to failed via run.failed", () => {
    let run = createAgentRun("run-005", "browser-action", NOW);

    const started: RunStartedEvent = {
      eventId: makeEventId(1),
      runId: "run-005",
      timestamp: NOW + 100,
      type: "run.started",
      mode: "browser-action",
    };
    run = reduceAgentRunEvent(run, started);

    const failed: AgentRunEvent = {
      eventId: makeEventId(2),
      runId: "run-005",
      timestamp: NOW + 200,
      type: "run.failed",
      outcome: {
        status: "failed",
        reason: "Tool execution failed after max retries",
        finishedAt: NOW + 200,
      },
    };
    run = reduceAgentRunEvent(run, failed);
    expect(run.status).toBe("failed");
    expect(run.terminalOutcome!.status).toBe("failed");
  });

  it("is a pure function — does not mutate the input snapshot", () => {
    const original = createAgentRun("run-006", "browser-action", NOW);
    const originalCopy = JSON.parse(JSON.stringify(original));

    const started: RunStartedEvent = {
      eventId: makeEventId(1),
      runId: "run-006",
      timestamp: NOW + 100,
      type: "run.started",
      mode: "browser-action",
    };
    const result = reduceAgentRunEvent(original, started);

    // Original should be unchanged
    expect(original).toEqual(originalCopy);
    // Result should be different
    expect(result.status).toBe("running");
    expect(original.status).toBe("pending");
  });

  it("applies the full canonical event sequence: started, imported, todo, approval, checkpoint, completed", () => {
    let run = createAgentRun("run-full", "deep-research", NOW);

    // Sequence of events matching acceptance criteria
    const events: AgentRunEvent[] = [
      {
        eventId: makeEventId(1), runId: "run-full", timestamp: NOW + 100,
        type: "run.started", mode: "deep-research",
      },
      {
        eventId: makeEventId(2), runId: "run-full", timestamp: NOW + 200,
        type: "run.imported",
        sourceRunId: "legacy-001", sourceMode: "deep-research",
        migratedFields: ["todoItems"],
      },
      {
        eventId: makeEventId(3), runId: "run-full", timestamp: NOW + 300,
        type: "todo.item_upserted",
        item: { id: "t1", label: "Gather sources", done: false, createdAt: NOW + 300, updatedAt: NOW + 300 },
      },
      {
        eventId: makeEventId(4), runId: "run-full", timestamp: NOW + 400,
        type: "approval.requested",
        approval: { approvalId: "apv-f1", reason: "Approve source list", requestedAt: NOW + 400 },
      },
      {
        eventId: makeEventId(5), runId: "run-full", timestamp: NOW + 500,
        type: "checkpoint.created",
        checkpointId: "cp-full-001",
      },
      {
        eventId: makeEventId(6), runId: "run-full", timestamp: NOW + 600,
        type: "run.completed",
        outcome: { status: "completed", finishedAt: NOW + 600 },
      },
    ];

    for (const event of events) {
      run = reduceAgentRunEvent(run, event);
    }

    // Verify final state
    expect(run.todoItems.length).toBeGreaterThan(0);
    expect(run.latestCheckpointId).toBe("cp-full-001");
    expect(run.terminalOutcome).not.toBeNull();
    expect(run.terminalOutcome!.status).toBe("completed");
    expect(run.status).toBe("completed");
    expect(run.metadata).toHaveProperty("importedFrom");
  });
});
