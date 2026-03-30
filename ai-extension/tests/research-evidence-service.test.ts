import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AgentRuntimeService } from "../src/background/agent-runtime/agent-runtime-service.js";
import { indexedDBManager } from "../src/background/indexeddb-manager.js";

const DB_NAME = "ai-pocket-db";

describe("research evidence service", () => {
  let runtimeService: AgentRuntimeService;

  beforeEach(() => {
    runtimeService = new AgentRuntimeService();
  });

  afterEach(async () => {
    await runtimeService.close();
    await indexedDBManager.close();
    indexedDB.deleteDatabase(DB_NAME);
  });

  async function createRun() {
    return runtimeService.startRun({
      mode: "deep-research",
      metadata: {
        topic: "Evidence service",
        goal: "Verify runtime wiring",
        providerId: "provider-openai",
        providerType: "openai",
        modelId: "gpt-4.1-mini",
      },
    });
  }

  it("provisions one dedicated research pocket and reuses it on hydration", async () => {
    const run = await createRun();
    const first = await runtimeService.ensureDeepResearchPocket(run.runId);
    const second = await runtimeService.ensureDeepResearchPocket(run.runId);

    expect(first.metadata.pocketId).toBeTruthy();
    expect(second.metadata.pocketId).toBe(first.metadata.pocketId);

    const pocket = await indexedDBManager.getPocket(first.metadata.pocketId as string);
    expect(pocket?.tags).toContain("research-pocket");
    expect(pocket?.tags).toContain(`run:${run.runId}`);
  });

  it("writes evidence into the linked research pocket and records canonical artifacts", async () => {
    const run = await createRun();
    const result = await runtimeService.recordResearchEvidence(run.runId, {
      summary: "Primary source confirms the architecture shift.",
      excerpt: "The runtime now stores evidence inside pockets.",
      source: {
        url: "https://example.com/architecture",
        title: "Architecture notes",
      },
      questionId: "question-1",
      question: "What confirms the architecture shift?",
      tags: ["architecture", "phase-11"],
    });

    expect(result.disposition).toBe("created");

    const stored = await indexedDBManager.getContent(result.contentId);
    expect(stored?.pocketId).toBe(result.pocketId);
    expect(stored?.metadata.researchEvidence?.evidenceId).toBe(result.evidenceId);
    expect(stored?.metadata.researchEvidence?.source.title).toBe("Architecture notes");

    const timeline = await runtimeService.getTimeline(run.runId);
    expect(
      timeline?.events.some((event) => event.eventType === "evidence.recorded"),
    ).toBe(true);
    expect(
      timeline?.run.artifactRefs.some((artifact) => artifact.artifactType === "evidence"),
    ).toBe(true);
  });

  it("updates duplicate metadata instead of creating indistinguishable duplicate content", async () => {
    const run = await createRun();

    const first = await runtimeService.recordResearchEvidence(run.runId, {
      summary: "Primary source confirms the architecture shift.",
      excerpt: "The runtime now stores evidence inside pockets.",
      source: {
        url: "https://example.com/architecture",
        title: "Architecture notes",
      },
      tags: ["architecture"],
    });
    const second = await runtimeService.recordResearchEvidence(run.runId, {
      summary: "Primary source confirms the architecture shift.",
      excerpt: "The runtime now stores evidence inside pockets.",
      source: {
        url: "https://example.com/architecture?utm_source=test",
        title: "Architecture notes",
      },
      tags: ["architecture"],
    });

    expect(second.contentId).toBe(first.contentId);
    expect(second.disposition).toBe("updated-as-duplicate");
    expect(second.duplicateCount).toBe(2);

    const allPocketContent = await indexedDBManager.getContentByPocket(first.pocketId);
    const evidenceEntries = allPocketContent.filter(
      (content) => content.metadata.category === "research-evidence",
    );
    expect(evidenceEntries).toHaveLength(1);
    expect(evidenceEntries[0]?.metadata.researchEvidence?.duplicateCount).toBe(2);
  });
});
