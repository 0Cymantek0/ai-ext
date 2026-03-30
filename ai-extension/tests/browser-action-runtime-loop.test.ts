import { afterEach, beforeEach, describe, expect, it } from "vitest";
import "fake-indexeddb/auto";
import { openDB } from "idb";
import type { AiPocketDBSchema } from "../src/storage/schema.js";
import { BrowserActionOrchestrator } from "../src/background/agent-runtime/browser-action-orchestrator.js";

const DB_NAME = "ai-pocket-db";
const DB_VERSION = 5;

async function openTestDb() {
  return openDB<AiPocketDBSchema>(DB_NAME, DB_VERSION, {
    upgrade(db) {
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

describe("browser action runtime loop", () => {
  let store: import("../src/background/agent-runtime/store.js").AgentRuntimeStore;
  let service: import("../src/background/agent-runtime/agent-runtime-service.js").AgentRuntimeService;

  beforeEach(async () => {
    global.chrome = {
      storage: {
        local: {
          get: async () => ({}),
          set: async () => undefined,
        },
      },
    } as typeof chrome;

    const db = await openTestDb();
    db.close();
    const [{ AgentRuntimeStore }, { AgentRuntimeService }] = await Promise.all([
      import("../src/background/agent-runtime/store.js"),
      import("../src/background/agent-runtime/agent-runtime-service.js"),
    ]);
    store = new AgentRuntimeStore();
    service = new AgentRuntimeService(store);
  });

  afterEach(async () => {
    await service.close();
    indexedDB.deleteDatabase(DB_NAME);
    delete (global as { chrome?: typeof chrome }).chrome;
  });

  it("creates a canonical browser-action run with metadata and loop bootstrap events", async () => {
    const run = await service.startRun({
      mode: "browser-action",
      metadata: {
        task: "Check the hero CTA",
        providerId: "provider-openai",
        providerType: "openai",
        modelId: "gpt-4.1-mini",
        conversationId: "conv-loop",
        tabId: 11,
        tabUrl: "https://example.com",
        tabTitle: "Example",
      },
    });

    expect(run.mode).toBe("browser-action");
    expect(run.metadata).toMatchObject({
      providerId: "provider-openai",
      modelId: "gpt-4.1-mini",
      conversationId: "conv-loop",
      tabId: 11,
    });
    expect(run.todoItems.length).toBeGreaterThan(0);
    expect(run.latestCheckpointId).toBeTruthy();

    const timeline = await service.getTimeline(run.runId);
    expect(timeline).toBeDefined();

    const eventTypes = timeline!.events.map((event) => event.eventType);
    expect(eventTypes).toContain("run.started");
    expect(eventTypes).toContain("run.phase_changed");
    expect(eventTypes).toContain("todo.replaced");
    expect(eventTypes).toContain("checkpoint.created");

    const checkpointEvent = timeline!.events.find(
      (event) => event.eventType === "checkpoint.created",
    );
    expect(checkpointEvent?.payload).toMatchObject({
      type: "checkpoint.created",
      boundary: "plan-created",
    });
  });

  it("persists named checkpoints for pause and resume", async () => {
    const started = await service.startRun({
      mode: "browser-action",
      metadata: {
        task: "Review the signup form",
        providerId: "provider-google",
        providerType: "google",
        modelId: "gemini-2.5-flash",
        tabId: 19,
      },
    });

    const paused = await service.pauseRun(started.runId);
    expect(paused.status).toBe("paused");

    const resumed = await service.resumeRun(started.runId);
    expect(resumed.status).toBe("running");

    const timeline = await service.getTimeline(started.runId);
    const checkpointBoundaries = timeline!.events
      .filter((event) => event.eventType === "checkpoint.created")
      .map((event) => (event.payload as { boundary?: string }).boundary);

    expect(checkpointBoundaries).toContain("plan-created");
    expect(checkpointBoundaries).toContain("paused");
    expect(checkpointBoundaries).toContain("resumed");
  });

  describe("BrowserActionOrchestrator Execution", () => {
    let orchestrator: BrowserActionOrchestrator;
    let testRunId: string;

    beforeEach(async () => {
      orchestrator = new BrowserActionOrchestrator(service);
      const run = await service.startRun({
        mode: "browser-action",
        metadata: {
          task: "Test browser action loop",
          providerId: "test-provider",
          providerType: "test",
          modelId: "test-model",
          tabId: 1,
        },
      });
      testRunId = run.runId;
    });

    it("should execute the loop until the executor returns false and properly set breakpoints", async () => {
      let callCount = 0;
      
      await orchestrator.start(testRunId, {
        executor: async (context) => {
          callCount++;
          if (callCount >= 2) {
            return false;
          }
          await service.saveCheckpoint(context.runId, "tool-result");
          return true;
        }
      });
  
      const finalRun = await service.getRun(testRunId);
      expect(finalRun).not.toBeNull();
      expect(finalRun?.status).toBe("completed");
      expect(finalRun?.phase).toBe("finalizing");
      expect(callCount).toBe(2);

      const timeline = await service.getTimeline(testRunId);
      const checkpointBoundaries = timeline!.events
        .filter((event) => event.eventType === "checkpoint.created")
        .map((event) => (event.payload as { boundary?: string }).boundary);

      expect(checkpointBoundaries).toContain("tool-dispatch"); // Before execution
      expect(checkpointBoundaries).toContain("tool-result");   // Manual execution checkpoint
      expect(checkpointBoundaries).toContain("terminal");      // End checkpoint
    });

    it("should pause execution if pending approval", async () => {
      let callCount = 0;
      
      await orchestrator.start(testRunId, {
        executor: async (context) => {
          callCount++;
          await service.getApprovalService().requestApproval(
            context.runId,
            "test-tool",
            {},
            "Need user click",
            { tabId: 1 }
          );
          return true;
        }
      });
  
      const pausedRun = await service.getRun(testRunId);
      expect(pausedRun).not.toBeNull();
      expect(pausedRun?.status).not.toBe("completed");
      expect(callCount).toBe(1);
      
      const pendingApproval = pausedRun?.pendingApproval;
      if (pendingApproval) {
          await service.getApprovalService().resolveApproval(testRunId, pendingApproval.approvalId, "approved");
      }
  
      await orchestrator.resume(testRunId, {
          executor: async () => {
            callCount++;
            return false;
          }
      });
  
      const finalRun = await service.getRun(testRunId);
      expect(finalRun?.status).toBe("completed");
      expect(callCount).toBe(2);
    });
  });
});
