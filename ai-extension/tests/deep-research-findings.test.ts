import { afterEach, beforeEach, describe, expect, it } from "vitest";
import "fake-indexeddb/auto";
import { AgentRuntimeService } from "../src/background/agent-runtime/agent-runtime-service.js";
import { DeepResearchOrchestrator } from "../src/background/research/deep-research-orchestrator.js";

const DB_NAME = "ai-pocket-db";

describe("deep research findings", () => {
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

  it("preserves citation-ready source metadata across persistence", async () => {
    const run = await service.startRun({
      mode: "deep-research",
      metadata: {
        topic: "Deep research findings",
        goal: "Preserve sourceUrl and title",
        providerId: "provider-openai",
        providerType: "openai",
        modelId: "gpt-4.1-mini",
      },
    });

    await orchestrator.start(run.runId, {
      collector: async ({ question, iteration }) => [
        {
          summary: `Finding ${iteration}A`,
          excerpt: "Primary excerpt",
          supportedQuestionIds: [question.id],
          sourceUrl: `https://example.com/a-${iteration}`,
          title: `Source A${iteration}`,
          contentType: "article",
        },
        {
          summary: `Finding ${iteration}B`,
          excerpt: "Secondary excerpt",
          supportedQuestionIds: [question.id],
          sourceUrl: `https://example.com/b-${iteration}`,
          title: `Source B${iteration}`,
          contentType: "tab-context",
        },
      ],
    });

    const persistedRun = await service.getRun(run.runId);
    const timeline = await service.getTimeline(run.runId);
    const findings = (persistedRun?.metadata as Record<string, unknown>)
      .findings as Array<Record<string, any>>;

    expect(findings.length).toBeGreaterThanOrEqual(2);
    expect(findings[0]?.source.sourceUrl).toContain("https://example.com/");
    expect(findings[0]?.source.title).toContain("Source");
    expect(findings[0]?.source.capturedAt).toBeTypeOf("number");
    expect(findings[0]?.supportedQuestionIds.length).toBeGreaterThan(0);

    const evidenceArtifacts = timeline?.events.filter(
      (event) => event.eventType === "artifact.projected",
    );
    expect(evidenceArtifacts?.length).toBeGreaterThan(0);
  });
});
