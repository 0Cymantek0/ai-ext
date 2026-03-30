/**
 * Agent Runtime Migration, Checkpoint, and Pocket-Artifact Tests
 *
 * Covers:
 *  - Schema v5 upgrade (canonical stores exist)
 *  - Import-once migration from legacy browserAgentWorkflows
 *  - Migration idempotency (second run is a no-op)
 *  - Checkpoint service event persistence and sequencing
 *  - Resume context reconstruction
 *  - Pocket artifact service projection
 *  - Cascade delete
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import "fake-indexeddb/auto";
import { openDB } from "idb";
import type { AiPocketDBSchema } from "../src/storage/schema";
import {
  STORE_NAMES,
  type AgentRunRecord,
  type AgentRunEventRecord,
  type AgentCheckpointRecord,
} from "../src/storage/schema";
import { AgentRuntimeStore } from "../src/background/agent-runtime/store";
import { CheckpointService } from "../src/background/agent-runtime/checkpoint-service";
import { PocketArtifactService } from "../src/background/agent-runtime/pocket-artifact-service";
import {
  runAgentRuntimeMigration,
  isMigrationApplied,
} from "../src/background/agent-runtime/migration";
import { createAgentRun } from "../src/shared/agent-runtime/reducer";
import type {
  AgentRun,
  AgentRunEvent,
  RunStartedEvent,
  RunPhaseChangedEvent,
  TodoReplacedEvent,
} from "../src/shared/agent-runtime/contracts";

// ─── Helpers ────────────────────────────────────────────────────────────────

const DB_NAME = "ai-pocket-db";
const DB_VERSION = 5;

/**
 * Open the DB with full schema for tests.
 * Uses fake-indexeddb so each test gets a fresh DB via beforeEach deleteDatabase.
 */
async function openTestDb() {
  return openDB<AiPocketDBSchema>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Create all stores that would exist in production
      // Legacy stores
      if (!db.objectStoreNames.contains("pockets")) {
        db.createObjectStore("pockets", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("capturedContent")) {
        const store = db.createObjectStore("capturedContent", {
          keyPath: "id",
        });
        store.createIndex("pocketId", "pocketId");
      }
      if (!db.objectStoreNames.contains("conversations")) {
        db.createObjectStore("conversations", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("aiResponses")) {
        db.createObjectStore("aiResponses", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("embeddings")) {
        const store = db.createObjectStore("embeddings", { keyPath: "id" });
        store.createIndex("contentId", "contentId");
      }
      if (!db.objectStoreNames.contains("syncQueue")) {
        db.createObjectStore("syncQueue", {
          keyPath: "id",
          autoIncrement: true,
        });
      }
      if (!db.objectStoreNames.contains("vectorChunks")) {
        const store = db.createObjectStore("vectorChunks", { keyPath: "id" });
        store.createIndex("contentId", "contentId");
        store.createIndex("pocketId", "pocketId");
      }
      if (!db.objectStoreNames.contains("metadata")) {
        const store = db.createObjectStore("metadata", {
          keyPath: "contentId",
        });
        store.createIndex("pocketId", "pocketId");
        store.createIndex("timestamp", "timestamp");
      }
      if (!db.objectStoreNames.contains("searchIndex")) {
        const store = db.createObjectStore("searchIndex", { keyPath: "id" });
        store.createIndex("term", "term");
        store.createIndex("contentId", "contentId");
      }

      // Legacy browser agent stores
      if (!db.objectStoreNames.contains("browserAgentWorkflows")) {
        const store = db.createObjectStore("browserAgentWorkflows", {
          keyPath: "workflowId",
        });
        store.createIndex("status", "status");
        store.createIndex("startTime", "startTime");
        store.createIndex("lastUpdate", "lastUpdate");
        store.createIndex("userId", "userId");
      }
      if (!db.objectStoreNames.contains("browserAgentCheckpoints")) {
        const store = db.createObjectStore("browserAgentCheckpoints", {
          keyPath: "checkpointId",
        });
        store.createIndex("workflowId", "workflowId");
        store.createIndex("timestamp", "timestamp");
        store.createIndex("step", "step");
        store.createIndex("workflowId_timestamp", [
          "workflowId",
          "timestamp",
        ]);
      }

      // Canonical agent runtime stores
      if (!db.objectStoreNames.contains("agentRuns")) {
        const store = db.createObjectStore("agentRuns", { keyPath: "runId" });
        store.createIndex("status", "status");
        store.createIndex("mode", "mode");
        store.createIndex("updatedAt", "updatedAt");
        store.createIndex("createdAt", "createdAt");
        store.createIndex("conversationId", "conversationId");
        store.createIndex("pocketId", "pocketId");
      }
      if (!db.objectStoreNames.contains("agentRunEvents")) {
        const store = db.createObjectStore("agentRunEvents", {
          keyPath: "eventId",
        });
        store.createIndex("runId", "runId");
        store.createIndex("sequence", "sequence");
        store.createIndex("eventType", "eventType");
        store.createIndex("timestamp", "timestamp");
        store.createIndex("runId_sequence", ["runId", "sequence"]);
        store.createIndex("runId_timestamp", ["runId", "timestamp"]);
      }
      if (!db.objectStoreNames.contains("agentCheckpoints")) {
        const store = db.createObjectStore("agentCheckpoints", {
          keyPath: "checkpointId",
        });
        store.createIndex("runId", "runId");
        store.createIndex("checkpointSequence", "checkpointSequence");
        store.createIndex("timestamp", "timestamp");
        store.createIndex("phase", "phase");
        store.createIndex("runId_checkpointSequence", [
          "runId",
          "checkpointSequence",
        ]);
      }
      if (!db.objectStoreNames.contains("agentApprovals")) {
        const store = db.createObjectStore("agentApprovals", {
          keyPath: "approvalId",
        });
        store.createIndex("runId", "runId");
        store.createIndex("status", "status");
        store.createIndex("createdAt", "createdAt");
        store.createIndex("resolvedAt", "resolvedAt");
      }
      if (!db.objectStoreNames.contains("agentArtifacts")) {
        const store = db.createObjectStore("agentArtifacts", {
          keyPath: "artifactId",
        });
        store.createIndex("runId", "runId");
        store.createIndex("artifactType", "artifactType");
        store.createIndex("targetKind", "targetKind");
        store.createIndex("targetId", "targetId");
        store.createIndex("updatedAt", "updatedAt");
      }
      if (!db.objectStoreNames.contains("agentMigrations")) {
        const store = db.createObjectStore("agentMigrations", {
          keyPath: "migrationKey",
        });
        store.createIndex("appliedAt", "appliedAt");
      }
    },
  });
}

/**
 * Seed a legacy workflow into the browserAgentWorkflows store.
 */
async function seedLegacyWorkflow(
  workflowId: string,
  status: string = "completed",
) {
  const db = await openTestDb();
  const tx = db.transaction("browserAgentWorkflows", "readwrite");
  await tx.store.put({
    workflowId,
    currentStep: "END",
    status,
    startTime: Date.now() - 60_000,
    lastUpdate: Date.now() - 30_000,
    completedSteps: ["START", "NAVIGATE", "EXTRACT_DOM", "END"],
    errors: [],
    variables: { targetUrl: "https://example.com" },
    paused: false,
    retryCount: 0,
    maxRetries: 3,
    backoffMs: 1000,
  } as any);
  await tx.done;
  db.close();
}

// ─── Test Setup ─────────────────────────────────────────────────────────────

afterEach(() => {
  // Delete the database between tests for clean state
  indexedDB.deleteDatabase(DB_NAME);
});

// ─── Schema v5 Tests ────────────────────────────────────────────────────────

describe("Schema v5 — Canonical Stores", () => {
  it("creates all 6 canonical stores on upgrade", async () => {
    const db = await openTestDb();

    expect(db.objectStoreNames.contains("agentRuns")).toBe(true);
    expect(db.objectStoreNames.contains("agentRunEvents")).toBe(true);
    expect(db.objectStoreNames.contains("agentCheckpoints")).toBe(true);
    expect(db.objectStoreNames.contains("agentApprovals")).toBe(true);
    expect(db.objectStoreNames.contains("agentArtifacts")).toBe(true);
    expect(db.objectStoreNames.contains("agentMigrations")).toBe(true);

    db.close();
  });

  it("preserves legacy stores alongside canonical stores", async () => {
    const db = await openTestDb();

    expect(db.objectStoreNames.contains("browserAgentWorkflows")).toBe(true);
    expect(db.objectStoreNames.contains("browserAgentCheckpoints")).toBe(true);
    expect(db.objectStoreNames.contains("pockets")).toBe(true);
    expect(db.objectStoreNames.contains("capturedContent")).toBe(true);

    db.close();
  });

  it("STORE_NAMES contains all canonical store entries", () => {
    expect(STORE_NAMES.AGENT_RUNS).toBe("agentRuns");
    expect(STORE_NAMES.AGENT_RUN_EVENTS).toBe("agentRunEvents");
    expect(STORE_NAMES.AGENT_CHECKPOINTS).toBe("agentCheckpoints");
    expect(STORE_NAMES.AGENT_APPROVALS).toBe("agentApprovals");
    expect(STORE_NAMES.AGENT_ARTIFACTS).toBe("agentArtifacts");
    expect(STORE_NAMES.AGENT_MIGRATIONS).toBe("agentMigrations");
  });
});

// ─── AgentRuntimeStore CRUD Tests ───────────────────────────────────────────

describe("AgentRuntimeStore — CRUD", () => {
  let store: AgentRuntimeStore;

  beforeEach(async () => {
    // Ensure DB exists
    const db = await openTestDb();
    db.close();
    store = new AgentRuntimeStore();
  });

  afterEach(async () => {
    await store.close();
  });

  it("puts and gets a run record", async () => {
    const run = createAgentRun("test-run-1", "browser-action");
    const record: AgentRunRecord = { ...run, conversationId: "conv-1" };

    await store.putRun(record);
    const loaded = await store.getRun("test-run-1");

    expect(loaded).toBeDefined();
    expect(loaded!.runId).toBe("test-run-1");
    expect(loaded!.mode).toBe("browser-action");
    expect(loaded!.conversationId).toBe("conv-1");
  });

  it("lists runs by status", async () => {
    const run1: AgentRunRecord = {
      ...createAgentRun("r1", "browser-action"),
      status: "running",
    };
    const run2: AgentRunRecord = {
      ...createAgentRun("r2", "deep-research"),
      status: "completed",
    };
    const run3: AgentRunRecord = {
      ...createAgentRun("r3", "browser-action"),
      status: "running",
    };

    await store.putRun(run1);
    await store.putRun(run2);
    await store.putRun(run3);

    const running = await store.listRunsByStatus("running");
    expect(running).toHaveLength(2);
    expect(running.map((r) => r.runId).sort()).toEqual(["r1", "r3"]);
  });

  it("puts and retrieves events with ordered sequences", async () => {
    const db = await openTestDb();
    db.close();

    const evt1: AgentRunEventRecord = {
      eventId: "e1",
      runId: "run-1",
      timestamp: 1000,
      sequence: 0,
      eventType: "run.started",
      payload: {
        eventId: "e1",
        runId: "run-1",
        timestamp: 1000,
        type: "run.started",
        mode: "browser-action",
      } as RunStartedEvent,
    };

    const evt2: AgentRunEventRecord = {
      eventId: "e2",
      runId: "run-1",
      timestamp: 2000,
      sequence: 1,
      eventType: "run.phase_changed",
      payload: {
        eventId: "e2",
        runId: "run-1",
        timestamp: 2000,
        type: "run.phase_changed",
        fromPhase: "init",
        toPhase: "planning",
      } as RunPhaseChangedEvent,
    };

    await store.putEvent(evt1);
    await store.putEvent(evt2);

    const events = await store.getOrderedEventsByRun("run-1");
    expect(events).toHaveLength(2);
    expect(events[0].sequence).toBe(0);
    expect(events[1].sequence).toBe(1);
  });

  it("getNextSequence returns correct next value", async () => {
    const db = await openTestDb();
    db.close();

    // No events yet
    expect(await store.getNextSequence("run-empty")).toBe(0);

    // Add one event
    await store.putEvent({
      eventId: "e1",
      runId: "run-seq",
      timestamp: 1000,
      sequence: 0,
      eventType: "run.started",
      payload: {
        eventId: "e1",
        runId: "run-seq",
        timestamp: 1000,
        type: "run.started",
        mode: "browser-action",
      } as RunStartedEvent,
    });

    expect(await store.getNextSequence("run-seq")).toBe(1);
  });

  it("cascade deletes all run data", async () => {
    const db = await openTestDb();
    db.close();

    const runId = "cascade-test";
    await store.putRun(createAgentRun(runId, "browser-action") as AgentRunRecord);
    await store.putEvent({
      eventId: "e1",
      runId,
      timestamp: 1000,
      sequence: 0,
      eventType: "run.started",
      payload: {
        eventId: "e1",
        runId,
        timestamp: 1000,
        type: "run.started",
        mode: "browser-action",
      } as RunStartedEvent,
    });
    await store.putCheckpoint({
      checkpointId: "cp1",
      runId,
      snapshot: createAgentRun(runId, "browser-action"),
      timestamp: 1000,
      trigger: "auto",
      checkpointSequence: 0,
      phase: "init",
    });
    await store.putApproval({
      approvalId: "ap1",
      runId,
      status: "pending",
      reason: "test",
      createdAt: 1000,
    });
    await store.putArtifact({
      artifactId: "art1",
      runId,
      artifactType: "todo",
      targetKind: "pocket-content",
      targetId: "content-1",
      label: "test",
      createdAt: 1000,
      updatedAt: 1000,
    });

    // Verify everything exists
    expect(await store.getRun(runId)).toBeDefined();
    expect(await store.getEventsByRun(runId)).toHaveLength(1);
    expect(await store.getCheckpointsByRun(runId)).toHaveLength(1);
    expect(await store.getApprovalsByRun(runId)).toHaveLength(1);
    expect(await store.getArtifactsByRun(runId)).toHaveLength(1);

    // Cascade delete
    await store.deleteRunCascade(runId);

    // Verify everything is gone
    expect(await store.getRun(runId)).toBeUndefined();
    expect(await store.getEventsByRun(runId)).toHaveLength(0);
    expect(await store.getCheckpointsByRun(runId)).toHaveLength(0);
    expect(await store.getApprovalsByRun(runId)).toHaveLength(0);
    expect(await store.getArtifactsByRun(runId)).toHaveLength(0);
  });
});

// ─── CheckpointService Tests ────────────────────────────────────────────────

describe("CheckpointService — Event Persistence & Resume", () => {
  let store: AgentRuntimeStore;
  let service: CheckpointService;

  beforeEach(async () => {
    const db = await openTestDb();
    db.close();
    store = new AgentRuntimeStore();
    service = new CheckpointService(store);
  });

  afterEach(async () => {
    await store.close();
  });

  it("appends events with auto-incrementing sequences", async () => {
    const runId = "cp-test-1";
    await store.putRun(createAgentRun(runId, "browser-action") as AgentRunRecord);

    const evt1: RunStartedEvent = {
      eventId: "e1",
      runId,
      timestamp: 1000,
      type: "run.started",
      mode: "browser-action",
    };

    const evt2: RunPhaseChangedEvent = {
      eventId: "e2",
      runId,
      timestamp: 2000,
      type: "run.phase_changed",
      fromPhase: "init",
      toPhase: "planning",
    };

    const r1 = await service.appendEvent(evt1);
    const r2 = await service.appendEvent(evt2);

    expect(r1.sequence).toBe(0);
    expect(r2.sequence).toBe(1);
    expect(r1.eventType).toBe("run.started");
    expect(r2.eventType).toBe("run.phase_changed");
  });

  it("saves and retrieves checkpoints with correct sequencing", async () => {
    const runId = "cp-seq-test";
    const run = createAgentRun(runId, "deep-research");
    await store.putRun(run as AgentRunRecord);

    const cp1 = await service.saveCheckpoint(run, "auto");
    expect(cp1.checkpointSequence).toBe(0);
    expect(cp1.phase).toBe("init");

    const updatedRun: AgentRun = { ...run, phase: "planning" };
    const cp2 = await service.saveCheckpoint(updatedRun, "manual");
    expect(cp2.checkpointSequence).toBe(1);
    expect(cp2.phase).toBe("planning");

    // Verify latest checkpoint
    const latest = await store.getLatestCheckpoint(runId);
    expect(latest).toBeDefined();
    expect(latest!.checkpointSequence).toBe(1);
  });

  it("updates run's latestCheckpointId on checkpoint save", async () => {
    const runId = "cp-update-run";
    const run = createAgentRun(runId, "browser-action");
    await store.putRun(run as AgentRunRecord);

    const cp = await service.saveCheckpoint(run, "auto");

    const updatedRun = await store.getRun(runId);
    expect(updatedRun!.latestCheckpointId).toBe(cp.checkpointId);
  });

  it("builds correct resume context with pending events", async () => {
    const runId = "resume-test";
    const run: AgentRunRecord = {
      ...createAgentRun(runId, "browser-action"),
      status: "running",
    };
    await store.putRun(run);

    // Add events
    const evt1: RunStartedEvent = {
      eventId: "r-e1",
      runId,
      timestamp: 1000,
      type: "run.started",
      mode: "browser-action",
    };
    await service.appendEvent(evt1);

    // Save checkpoint at t=1500
    const cpRun: AgentRun = { ...run, status: "running", phase: "executing" };
    await service.saveCheckpoint(cpRun, "auto");

    // Add more events after checkpoint
    const evt2: RunPhaseChangedEvent = {
      eventId: "r-e2",
      runId,
      timestamp: 3000,
      type: "run.phase_changed",
      fromPhase: "executing",
      toPhase: "validating",
    };
    await service.appendEvent(evt2);

    // Load resume context
    const ctx = await service.loadResumeContext(runId);
    expect(ctx).toBeDefined();
    expect(ctx!.isResumable).toBe(true);
    expect(ctx!.checkpoint).toBeDefined();
    expect(ctx!.pendingEvents.length).toBeGreaterThanOrEqual(1);
    // The pending event should be the one after the checkpoint
    expect(ctx!.pendingEvents.some((e) => e.eventId === "r-e2")).toBe(true);
  });

  it("reconstructRunState replays events through reducer", async () => {
    const runId = "reconstruct-test";
    const run: AgentRunRecord = {
      ...createAgentRun(runId, "browser-action"),
    };
    await store.putRun(run);

    // Append events
    await service.appendEvent({
      eventId: "rc-e1",
      runId,
      timestamp: 1000,
      type: "run.started",
      mode: "browser-action",
    } as RunStartedEvent);

    await service.appendEvent({
      eventId: "rc-e2",
      runId,
      timestamp: 2000,
      type: "run.phase_changed",
      fromPhase: "init",
      toPhase: "executing",
    } as RunPhaseChangedEvent);

    await service.appendEvent({
      eventId: "rc-e3",
      runId,
      timestamp: 3000,
      type: "todo.replaced",
      items: [
        { id: "t1", label: "Search for docs", done: false, createdAt: 3000, updatedAt: 3000 },
      ],
    } as TodoReplacedEvent);

    // Reconstruct current state
    const state = await service.reconstructRunState(runId);

    expect(state).toBeDefined();
    expect(state!.status).toBe("running");
    expect(state!.phase).toBe("executing");
    expect(state!.todoItems).toHaveLength(1);
    expect(state!.todoItems[0].label).toBe("Search for docs");
  });

  it("marks terminal runs as non-resumable", async () => {
    const runId = "terminal-test";
    const run: AgentRunRecord = {
      ...createAgentRun(runId, "browser-action"),
      status: "completed",
      terminalOutcome: {
        status: "completed",
        reason: "Done",
        finishedAt: Date.now(),
      },
    };
    await store.putRun(run);

    const ctx = await service.loadResumeContext(runId);
    expect(ctx).toBeDefined();
    expect(ctx!.isResumable).toBe(false);
  });
});

// ─── Migration Tests ────────────────────────────────────────────────────────

describe("Migration — Import-Once Grandfathering", () => {
  let store: AgentRuntimeStore;

  beforeEach(async () => {
    const db = await openTestDb();
    db.close();
    store = new AgentRuntimeStore();
  });

  afterEach(async () => {
    await store.close();
  });

  it("imports legacy workflows into canonical runs", async () => {
    await seedLegacyWorkflow("legacy-wf-1", "completed");
    await seedLegacyWorkflow("legacy-wf-2", "failed");

    const result = await runAgentRuntimeMigration(store);

    expect(result.executed).toBe(true);
    expect(result.importedRunCount).toBe(2);
    expect(result.importedRunIds).toContain("legacy-wf-1");
    expect(result.importedRunIds).toContain("legacy-wf-2");
    expect(result.errors).toHaveLength(0);

    // Verify canonical runs exist
    const run1 = await store.getRun("legacy-wf-1");
    expect(run1).toBeDefined();
    expect(run1!.mode).toBe("browser-action");
    expect(run1!.status).toBe("completed");
    expect(run1!.metadata.importedFrom).toBe("browserAgentWorkflows");

    const run2 = await store.getRun("legacy-wf-2");
    expect(run2).toBeDefined();
    expect(run2!.status).toBe("failed");
  });

  it("creates run.started and run.imported events for each imported workflow", async () => {
    await seedLegacyWorkflow("legacy-evt-test", "completed");

    await runAgentRuntimeMigration(store);

    const events = await store.getEventsByRun("legacy-evt-test");
    expect(events.length).toBeGreaterThanOrEqual(2);

    const eventTypes = events.map((e) => e.eventType);
    expect(eventTypes).toContain("run.started");
    expect(eventTypes).toContain("run.imported");

    // Verify the imported event has provenance data
    const importedEvent = events.find((e) => e.eventType === "run.imported");
    expect(importedEvent).toBeDefined();
    const payload = importedEvent!.payload;
    if (payload.type === "run.imported") {
      expect(payload.sourceRunId).toBe("legacy-evt-test");
      expect(payload.sourceMode).toBe("browser-action");
      expect(payload.migratedFields).toContain("status");
    }
  });

  it("is idempotent — second run is a no-op", async () => {
    await seedLegacyWorkflow("idempotent-test", "completed");

    const first = await runAgentRuntimeMigration(store);
    expect(first.executed).toBe(true);
    expect(first.importedRunCount).toBe(1);

    const second = await runAgentRuntimeMigration(store);
    expect(second.executed).toBe(false);
    expect(second.importedRunCount).toBe(0);
    expect(second.importedRunIds).toHaveLength(0);
  });

  it("marks migration as applied in ledger", async () => {
    await seedLegacyWorkflow("ledger-test", "completed");

    expect(await isMigrationApplied(store)).toBe(false);

    await runAgentRuntimeMigration(store);

    expect(await isMigrationApplied(store)).toBe(true);

    const migration = await store.getMigration("agent-runtime-v1");
    expect(migration).toBeDefined();
    expect(migration!.appliedAt).toBeGreaterThan(0);
    expect(migration!.metadata).toHaveProperty("importedCount", 1);
  });

  it("handles empty legacy store gracefully", async () => {
    // No legacy workflows seeded
    const result = await runAgentRuntimeMigration(store);

    expect(result.executed).toBe(true);
    expect(result.importedRunCount).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it("does not modify legacy stores during migration", async () => {
    await seedLegacyWorkflow("readonly-test", "completed");

    await runAgentRuntimeMigration(store);

    // Verify legacy workflow still exists untouched
    const db = await openTestDb();
    const legacy = await db.get("browserAgentWorkflows", "readonly-test");
    expect(legacy).toBeDefined();
    expect((legacy as any).workflowId).toBe("readonly-test");
    db.close();
  });
});

// ─── PocketArtifactService Tests ────────────────────────────────────────────

describe("PocketArtifactService — Artifact Projection", () => {
  let store: AgentRuntimeStore;
  let artifactService: PocketArtifactService;

  beforeEach(async () => {
    const db = await openTestDb();
    db.close();
    store = new AgentRuntimeStore();
    artifactService = new PocketArtifactService(store);
  });

  afterEach(async () => {
    await store.close();
  });

  it("ensures a research pocket artifact (idempotent)", async () => {
    const runId = "pocket-test-run";
    const pocketId = "pocket-123";

    const first = await artifactService.ensureResearchPocket(
      runId,
      pocketId,
      "Research Pocket",
    );
    expect(first.artifactType).toBe("pocket");
    expect(first.targetKind).toBe("pocket-meta");
    expect(first.targetId).toBe(pocketId);

    // Second call returns the same artifact
    const second = await artifactService.ensureResearchPocket(
      runId,
      pocketId,
      "Research Pocket",
    );
    expect(second.artifactId).toBe(first.artifactId);
  });

  it("ensures a research todo artifact", async () => {
    const runId = "todo-art-test";
    const pocketId = "pocket-456";
    const contentId = "content-789";

    const artifact = await artifactService.ensureResearchTodoArtifact(
      runId,
      pocketId,
      contentId,
    );

    expect(artifact.artifactType).toBe("todo");
    expect(artifact.targetKind).toBe("pocket-content");
    expect(artifact.targetId).toBe(contentId);
    expect(artifact.uri).toContain(pocketId);
    expect(artifact.uri).toContain(contentId);
  });

  it("ensures a research state artifact", async () => {
    const runId = "state-art-test";
    const pocketId = "pocket-state";
    const contentId = "content-state";

    const artifact = await artifactService.ensureResearchStateArtifact(
      runId,
      pocketId,
      contentId,
    );

    expect(artifact.artifactType).toBe("state");
    expect(artifact.targetKind).toBe("pocket-content");
    expect(artifact.targetId).toBe(contentId);
  });

  it("lists all artifacts for a run", async () => {
    const runId = "list-arts-test";

    await artifactService.ensureResearchPocket(runId, "p1", "Pocket 1");
    await artifactService.ensureResearchTodoArtifact(runId, "p1", "c1");
    await artifactService.ensureResearchStateArtifact(runId, "p1", "c2");

    const all = await artifactService.listArtifactsForRun(runId);
    expect(all).toHaveLength(3);

    const types = all.map((a) => a.artifactType).sort();
    expect(types).toEqual(["pocket", "state", "todo"]);
  });

  it("touches an artifact to update timestamp", async () => {
    const runId = "touch-test";
    const artifact = await artifactService.ensureResearchPocket(
      runId,
      "p1",
      "Pocket",
    );
    const originalUpdated = artifact.updatedAt;

    // Small delay to ensure timestamp changes
    await new Promise((r) => setTimeout(r, 10));

    await artifactService.touchArtifact(artifact.artifactId, {
      uri: "updated://uri",
    });

    const updated = await artifactService.getArtifact(artifact.artifactId);
    expect(updated).toBeDefined();
    expect(updated!.updatedAt).toBeGreaterThanOrEqual(originalUpdated);
    expect(updated!.uri).toBe("updated://uri");
  });
});
