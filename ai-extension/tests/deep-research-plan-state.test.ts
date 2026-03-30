import { afterEach, beforeEach, describe, expect, it } from "vitest";
import "fake-indexeddb/auto";
import { AgentRuntimeService } from "../src/background/agent-runtime/agent-runtime-service.js";

const DB_NAME = "ai-pocket-db";

describe("deep-research plan bootstrap", () => {
  let service: AgentRuntimeService;

  beforeEach(() => {
    service = new AgentRuntimeService();
  });

  afterEach(async () => {
    await service.close();
    indexedDB.deleteDatabase(DB_NAME);
  });

  it("bootstraps subquestions, progress metadata, and a named checkpoint boundary", async () => {
    const run = await service.startRun({
      mode: "deep-research",
      metadata: {
        topic: "Autonomous research agents",
        goal: "Map subquestions, progress, and gaps",
        providerId: "provider-openai",
        providerType: "openai",
        modelId: "gpt-4.1-mini",
        conversationId: "conv-research",
      },
    });

    expect(run.mode).toBe("deep-research");
    expect(run.phase).toBe("planning");
    expect(run.todoItems.length).toBeGreaterThan(0);
    expect(run.latestCheckpointId).toBeTruthy();

    const metadata = run.metadata as Record<string, unknown>;
    expect(metadata.topic).toBe("Autonomous research agents");
    expect(metadata.goal).toBe("Map subquestions, progress, and gaps");
    expect(metadata.questionsTotal).toBeGreaterThanOrEqual(1);
    expect(metadata.openGapCount).toBe(0);

    const questions = metadata.questions as Array<Record<string, unknown>>;
    expect(Array.isArray(questions)).toBe(true);
    expect(questions[0]?.status).toBe("active");

    const timeline = await service.getTimeline(run.runId);
    expect(timeline).toBeDefined();
    expect(
      timeline?.checkpoints.some(
        (checkpoint) => checkpoint.boundary === "research-plan-created",
      ),
    ).toBe(true);
  });
});
