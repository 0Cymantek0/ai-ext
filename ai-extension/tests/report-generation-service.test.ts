import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ContentType, ProcessingStatus } from "../src/types/content.js";
import { indexedDBManager } from "../src/background/indexeddb-manager.js";
import { ReportGenerationService } from "../src/background/reporting/report-generation-service.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serviceWorkerPath = path.resolve(
  __dirname,
  "../src/background/service-worker.ts",
);

const serviceWorkerSource = readFileSync(serviceWorkerPath, "utf8");

describe("ReportGenerationService", () => {
  afterEach(async () => {
    await indexedDBManager.close();
    indexedDB.deleteDatabase("ai-pocket-db");
    vi.unstubAllGlobals();
  });

  it("generates sections, citations, and supportMap from deterministic mocks", async () => {
    const randomIds = ["pocket-01", "content-01", "content-02", "01"];
    vi.stubGlobal("crypto", {
      ...crypto,
      randomUUID: () => randomIds.shift() ?? "fallback-id",
    });

    const pocketId = await indexedDBManager.createPocket({
      name: "Pocket research",
      description: "Research pocket",
      contentIds: [],
      tags: ["research"],
      color: "#000000",
    });

    await indexedDBManager.saveContent({
      pocketId,
      type: ContentType.TEXT,
      content: "Primary evidence for the report.",
      metadata: {
        timestamp: 100,
        title: "Source one",
        tags: ["evidence"],
      },
      sourceUrl: "https://example.com/source-1",
      processingStatus: ProcessingStatus.COMPLETED,
    });

    await indexedDBManager.saveContent({
      pocketId,
      type: ContentType.TEXT,
      content: "Secondary evidence reinforcing the same conclusion.",
      metadata: {
        timestamp: 110,
        title: "Source two",
        tags: ["evidence"],
      },
      sourceUrl: "https://example.com/source-2",
      processingStatus: ProcessingStatus.COMPLETED,
    });

    const outputs = [
      {
        title: "Research report",
        subtitle: "Dense synthesis",
        sections: [
          {
            sectionId: "section-01",
            title: "Overview",
            summary: "Summary for section one",
            evidenceIds: ["evidence-content-content-01"],
          },
        ],
      },
      [
        {
          claimId: "claim-01",
          text: "A grounded claim from explicit evidence.",
          support: "grounded",
          evidenceIds: ["evidence-content-content-01"],
        },
      ],
    ];

    const service = new ReportGenerationService({
      providerRouter: {
        resolveCapability: vi.fn().mockResolvedValue({
          adapter: { getLanguageModel: () => ({}) },
          metadata: {
            providerId: "provider-1",
            providerType: "openai",
            modelId: "model-1",
            attemptedProviderIds: ["provider-1"],
            fallbackOccurred: false,
          },
        }),
      } as any,
      generateObjectImpl: vi.fn().mockImplementation(async () => ({
        object: outputs.shift(),
      })) as any,
    });

    const payload = await service.generateReportFromPocket({
      pocketId,
      modelId: "model-1",
    });

    expect(payload.reportId).toBe("report-01");
    expect(payload.sections[0]?.sectionId).toBe("section-01");
    expect(payload.sections.length).toBeGreaterThan(0);
    expect(payload.citations.length).toBeGreaterThan(0);
    expect(payload.supportMap.length).toBeGreaterThan(0);
    expect(payload.sections.some((section) =>
      section.claims.some((claim) => claim.support === "grounded"),
    )).toBe(true);
    expect(payload.metadata.evidenceCount).toBe(2);
  });

  it("stabilizes the GENERATE_REPORT response envelope", () => {
    expect(serviceWorkerSource).toContain("success: true");
    expect(serviceWorkerSource).toContain("success: false");
  });
});
