import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AgentRuntimeService } from "../src/background/agent-runtime/agent-runtime-service.js";
import { PocketArtifactService } from "../src/background/agent-runtime/pocket-artifact-service.js";
import {
  AgentArtifactRefSchema,
  ResearchEvidenceWriteResultSchema,
} from "../src/shared/agent-runtime/schemas.js";
import {
  createResearchEvidenceFingerprint,
  normalizeEvidenceSourceUrl,
  type ContentMetadata,
} from "../src/types/content.js";

const DB_NAME = "ai-pocket-db";

describe("research pocket contracts", () => {
  let runtimeService: AgentRuntimeService;
  let artifactService: PocketArtifactService;

  beforeEach(() => {
    runtimeService = new AgentRuntimeService();
    artifactService = runtimeService.getArtifactService();
  });

  afterEach(async () => {
    await runtimeService.close();
    indexedDB.deleteDatabase(DB_NAME);
  });

  it("accepts a typed research evidence payload with canonical fields", () => {
    const fingerprint = createResearchEvidenceFingerprint({
      sourceUrl: "https://example.com/article?utm_source=test#fragment",
      excerpt: "A grounded claim about the topic.",
    });

    const metadata: ContentMetadata = {
      timestamp: 100,
      updatedAt: 110,
      title: "Primary source",
      tags: ["research-evidence", "policy"],
      category: "research-evidence",
      researchEvidence: {
        evidenceId: "evidence-1",
        runId: "run-1",
        pocketId: "pocket-1",
        capturedAt: 100,
        firstCapturedAt: 100,
        lastSeenAt: 110,
        fingerprint,
        duplicateCount: 1,
        source: {
          url: "https://example.com/article?utm_source=test#fragment",
          normalizedUrl: normalizeEvidenceSourceUrl(
            "https://example.com/article?utm_source=test#fragment",
          ),
          title: "Primary source",
          type: "web",
          domain: "example.com",
        },
        context: {
          topic: "Evidence pipeline",
          question: "What source supports the claim?",
          query: "evidence pipeline primary sources",
          tags: ["policy"],
        },
        excerpt: "A grounded claim about the topic.",
      },
    };

    expect(metadata.researchEvidence?.source.url).toBe(
      "https://example.com/article?utm_source=test#fragment",
    );
    expect(metadata.researchEvidence?.capturedAt).toBe(100);
    expect(metadata.researchEvidence?.fingerprint).toBe(fingerprint);
    expect(metadata.researchEvidence?.duplicateCount).toBe(1);
    expect(metadata.researchEvidence?.source.normalizedUrl).toBe(
      "https://example.com/article",
    );
  });

  it("validates evidence artifact refs and evidence results through canonical schemas", () => {
    const artifact = AgentArtifactRefSchema.parse({
      artifactId: "artifact-evidence-1",
      artifactType: "evidence",
      label: "Primary source",
      uri: "pocket://pocket-1/content/content-1",
      targetId: "content-1",
      createdAt: 100,
    });

    expect(artifact.artifactType).toBe("evidence");
    expect(artifact.targetId).toBe("content-1");

    const result = ResearchEvidenceWriteResultSchema.safeParse({
      runId: "run-1",
      pocketId: "pocket-1",
      contentId: "content-1",
      evidenceId: "evidence-1",
      fingerprint: "abc12345",
      disposition: "created",
      duplicateCount: 1,
      capturedAt: 100,
      lastSeenAt: 100,
      sourceUrl: "https://example.com",
    });

    expect(result.success).toBe(true);
    expect(
      ResearchEvidenceWriteResultSchema.safeParse({
        runId: "run-1",
        pocketId: "pocket-1",
        contentId: "content-1",
        evidenceId: "evidence-1",
        disposition: "created",
        duplicateCount: 1,
        lastSeenAt: 100,
        sourceUrl: "https://example.com",
      }).success,
    ).toBe(false);
  });

  it("lets one run own a research pocket artifact plus evidence artifacts without ambiguity", async () => {
    const run = await runtimeService.startRun({
      mode: "deep-research",
      metadata: {
        topic: "Pocket evidence",
        goal: "Verify linkage",
        providerId: "provider-openai",
        providerType: "openai",
        modelId: "gpt-4.1-mini",
      },
    });

    const hydratedRun = await runtimeService.ensureDeepResearchPocket(run.runId);
    const pocketId = (hydratedRun.metadata.pocketId as string) || "";

    expect(pocketId).not.toBe("");

    const pocketArtifacts = await artifactService.listArtifactsForRun(run.runId);
    expect(pocketArtifacts.some((artifact) => artifact.artifactType === "pocket")).toBe(true);

    const evidenceArtifact = await artifactService.ensureEvidenceArtifact({
      runId: run.runId,
      pocketId,
      contentId: "content-1",
      evidenceId: "evidence-1",
      fingerprint: "abc12345",
      label: "Primary evidence",
      sourceUrl: "https://example.com/source",
    });

    expect(evidenceArtifact.artifactType).toBe("evidence");
    expect(evidenceArtifact.targetId).toBe("content-1");

    const evidenceArtifacts = await artifactService.listEvidenceArtifactsForRun(
      run.runId,
    );
    expect(evidenceArtifacts).toHaveLength(1);
    expect(
      await artifactService.findEvidenceArtifactForTarget(run.runId, "content-1"),
    ).toMatchObject({
      artifactId: evidenceArtifact.artifactId,
      artifactType: "evidence",
    });
  });
});
