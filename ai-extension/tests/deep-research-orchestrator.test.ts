import { afterEach, beforeEach, describe, expect, it } from "vitest";
import "fake-indexeddb/auto";
import { AgentRuntimeService } from "../src/background/agent-runtime/agent-runtime-service.js";
import { DeepResearchOrchestrator } from "../src/background/research/deep-research-orchestrator.js";

const DB_NAME = "ai-pocket-db";

describe("deep research orchestrator", () => {
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

  it("executes more than one research cycle before completion", async () => {
    const run = await service.startRun({
      mode: "deep-research",
      metadata: {
        topic: "Deep research runtimes",
        goal: "Verify iterative collection",
        providerId: "provider-openai",
        providerType: "openai",
        modelId: "gpt-4.1-mini",
      },
    });

    await orchestrator.start(run.runId, {
      collector: async ({ question, iteration }) => [
        {
          summary: `Finding ${iteration} for ${question.question}`,
          supportedQuestionIds: [question.id],
          sourceUrl: `https://example.com/source-${iteration}`,
          title: `Source ${iteration}`,
          contentType: "article",
        },
      ],
    });

    const finalRun = await service.getRun(run.runId);
    const timeline = await service.getTimeline(run.runId);

    expect(finalRun?.status).toBe("completed");
    expect(
      timeline?.events.filter((event) => event.eventType === "tool.called").length,
    ).toBeGreaterThan(1);
    expect(
      timeline?.events.filter((event) => event.eventType === "tool.completed").length,
    ).toBeGreaterThan(1);

    const metadata = finalRun?.metadata as Record<string, unknown>;
    const findings = metadata.findings as Array<Record<string, unknown>>;
    expect(Array.isArray(findings)).toBe(true);
    expect(findings.length).toBeGreaterThan(1);
  });
});
