import { afterEach, beforeEach, describe, expect, it } from "vitest";
import "fake-indexeddb/auto";
import { openDB } from "idb";
import type { AiPocketDBSchema } from "../src/storage/schema.js";

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

describe("browser action recovery", () => {
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

  it("records recoverable failures as canonical retry-planned state", async () => {
    const run = await service.startRun({
      mode: "browser-action",
      metadata: {
        task: "Inspect the cart page",
        providerId: "provider-openai",
        providerType: "openai",
        modelId: "gpt-4.1-mini",
        tabId: 21,
      },
    });

    const updated = await service.recordBrowserActionToolFailure(run.runId, {
      toolName: "click_element",
      error: "Selector not found",
      code: "SELECTOR_MISS",
      recoverable: true,
      retryCount: 1,
    });

    expect(updated.status).toBe("running");
    expect(updated.phase).toBe("planning");
    expect(updated.metadata).toMatchObject({
      lastToolName: "click_element",
      lastError: "Selector not found",
      retryCount: 1,
    });

    const timeline = await service.getTimeline(run.runId);
    const eventTypes = timeline!.events.map((event) => event.eventType);
    expect(eventTypes).toContain("tool.failed");
    expect(eventTypes).toContain("run.phase_changed");

    const retryCheckpoint = timeline!.events.find(
      (event) =>
        event.eventType === "checkpoint.created" &&
        (event.payload as { boundary?: string }).boundary === "retry-planned",
    );
    expect(retryCheckpoint).toBeDefined();
  });

  it("surfaces blocked sensitive tools instead of silently executing them", async () => {
    const run = await service.startRun({
      mode: "browser-action",
      metadata: {
        task: "Fill the payment form",
        providerId: "provider-google",
        providerType: "google",
        modelId: "gemini-2.5-flash",
        tabId: 22,
      },
    });

    const blocked = await service.beginBrowserActionToolCall(
      run.runId,
      "type_text",
      { selector: "#card-number", text: "4111" },
      { requiresHumanApproval: true },
    );

    expect(blocked.status).toBe("running");
    expect(blocked.metadata.currentIntent).toBe(
      "Blocked type_text; select safer action",
    );

    const timeline = await service.getTimeline(run.runId);
    const blockedEvent = timeline!.events.find(
      (event) => event.eventType === "tool.failed",
    );
    expect(blockedEvent?.payload).toMatchObject({
      type: "tool.failed",
      toolName: "type_text",
      blockedByPolicy: true,
    });
  });

  it("terminates cleanly when failures are not recoverable", async () => {
    const run = await service.startRun({
      mode: "browser-action",
      metadata: {
        task: "Extract checkout summary",
        providerId: "provider-google",
        providerType: "google",
        modelId: "gemini-2.5-pro",
        tabId: 23,
      },
    });

    const failed = await service.recordBrowserActionToolFailure(run.runId, {
      toolName: "extract_page_data",
      error: "Page crashed",
      code: "PAGE_CRASHED",
      recoverable: false,
    });

    expect(failed.status).toBe("failed");
    expect(failed.terminalOutcome?.status).toBe("failed");
    expect(failed.terminalOutcome?.reason).toBe("Page crashed");
  });
});
