import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AgentRuntimeService } from "../src/background/agent-runtime/agent-runtime-service.js";
import { vectorSearchService } from "../src/background/vector-search-service.js";
import { indexedDBManager } from "../src/background/indexeddb-manager.js";

const DB_NAME = "ai-pocket-db";

describe("research pocket indexing", () => {
  let runtimeService: AgentRuntimeService;

  beforeEach(() => {
    runtimeService = new AgentRuntimeService();
  });

  afterEach(async () => {
    await runtimeService.close();
    await indexedDBManager.close();
    vectorSearchService.clearCache();
    indexedDB.deleteDatabase(DB_NAME);
  });

  it("finds evidence by excerpt, title, source URL, and tags", async () => {
    const run = await runtimeService.startRun({
      mode: "deep-research",
      metadata: {
        topic: "Pocket indexing",
        goal: "Find evidence through the pocket search path",
        providerId: "provider-openai",
        providerType: "openai",
        modelId: "gpt-4.1-mini",
      },
    });

    const evidence = await runtimeService.recordResearchEvidence(run.runId, {
      summary: "Pocket evidence is now searchable.",
      excerpt: "Distinctive excerpt text for evidence lookup.",
      source: {
        url: "https://reports.example.com/research/findings",
        title: "Evidence report",
      },
      tags: ["grounded", "citation-ready"],
    });

    const byExcerpt = await vectorSearchService.searchContent(
      "Distinctive excerpt text for evidence lookup.",
      evidence.pocketId,
      10,
    );
    const byTitle = await vectorSearchService.searchContent(
      "Evidence report",
      evidence.pocketId,
      10,
    );
    const byUrl = await vectorSearchService.searchContent(
      "reports.example.com",
      evidence.pocketId,
      10,
    );
    const byTag = await vectorSearchService.searchContent(
      "citation-ready",
      evidence.pocketId,
      10,
    );

    expect(byExcerpt.some((result) => result.item.id === evidence.contentId)).toBe(true);
    expect(byTitle.some((result) => result.item.id === evidence.contentId)).toBe(true);
    expect(byUrl.some((result) => result.item.id === evidence.contentId)).toBe(true);
    expect(byTag.some((result) => result.item.id === evidence.contentId)).toBe(true);
  });

  it("keeps duplicate updates visible as evidence events", async () => {
    const run = await runtimeService.startRun({
      mode: "deep-research",
      metadata: {
        topic: "Duplicate visibility",
        goal: "Show duplicate updates in the runtime timeline",
        providerId: "provider-openai",
        providerType: "openai",
        modelId: "gpt-4.1-mini",
      },
    });

    await runtimeService.recordResearchEvidence(run.runId, {
      summary: "A repeated source is captured once.",
      excerpt: "Repeated claim text.",
      source: { url: "https://example.com/repeated", title: "Repeated source" },
      tags: ["duplicate"],
    });
    await runtimeService.recordResearchEvidence(run.runId, {
      summary: "A repeated source is captured once.",
      excerpt: "Repeated claim text.",
      source: {
        url: "https://example.com/repeated?utm_source=test",
        title: "Repeated source",
      },
      tags: ["duplicate"],
    });

    const timeline = await runtimeService.getTimeline(run.runId);
    const evidenceEvents =
      timeline?.events.filter((event) => event.eventType === "evidence.recorded") || [];

    expect(evidenceEvents).toHaveLength(2);
    expect(
      evidenceEvents.some(
        (event) =>
          (event.payload as { evidence: { disposition?: string } }).evidence
            ?.disposition === "updated-as-duplicate",
      ),
    ).toBe(true);
  });
});
