import { afterEach, beforeEach, describe, expect, it } from "vitest";
import "fake-indexeddb/auto";
import { AgentRuntimeService } from "../src/background/agent-runtime/agent-runtime-service.js";
import { DeepResearchOrchestrator } from "../src/background/research/deep-research-orchestrator.js";

const DB_NAME = "ai-pocket-db";

describe("deep research recovery", () => {
  let service: AgentRuntimeService;
  let orchestrator: DeepResearchOrchestrator;

  beforeEach(() => {
    service = new AgentRuntimeService();
    orchestrator = new DeepResearchOrchestrator(service);
  });

  afterEach(async () => {
    await service.close();
    indexedDB.deleteDatabase(DB_NAME);
  });

  it("retains checkpointed plan state across pause and resume", async () => {
    const run = await service.startRun({
      mode: "deep-research",
      metadata: {
        topic: "Recovery testing",
        goal: "Keep plan state after pause",
        providerId: "provider-openai",
        providerType: "openai",
        modelId: "gpt-4.1-mini",
      },
    });

    const pausedRun = await service.pauseRun(run.runId);
    expect(pausedRun.status).toBe("paused");

    const resumedRun = await service.resumeRun(run.runId);
    expect(resumedRun.status).toBe("running");

    await orchestrator.resume(run.runId, {
      collector: async ({ question, iteration }) => [
        {
          summary: `Recovered finding ${iteration}`,
          supportedQuestionIds: [question.id],
          sourceUrl: `https://example.com/recovery-${iteration}`,
          title: `Recovered ${iteration}`,
          contentType: "article",
        },
      ],
    });

    const finalRun = await service.getRun(run.runId);
    const timeline = await service.getTimeline(run.runId);
    const boundaries = timeline?.checkpoints.map((checkpoint) => checkpoint.boundary);

    expect(finalRun?.status).toBe("completed");
    expect(boundaries).toContain("research-plan-created");
    expect(boundaries).toContain("paused");
    expect(boundaries).toContain("resumed");
  });
});
