import { describe, expect, it } from "vitest";
import { GeneratedReportPayloadSchema } from "../src/shared/reporting/schemas.js";

const basePayload = {
  reportId: "report-01",
  pocketId: "pocket-01",
  title: "Grounded report",
  subtitle: "Structured and citation-backed.",
  generatedAt: 123,
  sections: [
    {
      sectionId: "section-01",
      title: "Section",
      summary: "Summary text",
      claims: [
        {
          claimId: "claim-01",
          text: "Grounded claim",
          support: "grounded",
          citationIds: ["citation-01"],
          evidenceIds: ["evidence-01"],
        },
        {
          claimId: "claim-02",
          text: "Weak claim",
          support: "weak",
          citationIds: ["citation-02"],
          evidenceIds: ["evidence-02"],
        },
        {
          claimId: "claim-03",
          text: "Conflicted claim",
          support: "conflicted",
          citationIds: ["citation-03"],
          evidenceIds: ["evidence-03"],
        },
      ],
      citationIds: ["citation-01", "citation-02", "citation-03"],
      evidenceIds: ["evidence-01", "evidence-02", "evidence-03"],
    },
  ],
  citations: [
    {
      citationId: "citation-01",
      evidenceId: "evidence-01",
      label: "[1]",
      sourceUrl: "https://example.com/source-1",
      excerpt: "Excerpt 1",
    },
    {
      citationId: "citation-02",
      evidenceId: "evidence-02",
      label: "[2]",
      sourceUrl: "https://example.com/source-2",
      excerpt: "Excerpt 2",
    },
    {
      citationId: "citation-03",
      evidenceId: "evidence-03",
      label: "[3]",
      sourceUrl: "https://example.com/source-3",
      excerpt: "Excerpt 3",
    },
  ],
  supportMap: [
    {
      entryId: "entry-01",
      claimId: "claim-01",
      sectionId: "section-01",
      evidenceIds: ["evidence-01"],
      citationIds: ["citation-01"],
      support: "grounded",
      sourceUrls: ["https://example.com/source-1"],
    },
  ],
  metadata: {
    evidenceCount: 3,
    weakClaimCount: 1,
    conflictedClaimCount: 1,
    modelId: "model-1",
  },
};

describe("GeneratedReportPayloadSchema", () => {
  it("parses grounded, weak, and conflicted payloads", () => {
    const result = GeneratedReportPayloadSchema.safeParse(basePayload);
    expect(result.success).toBe(true);
  });

  it("requires citationIds and evidenceIds on each claim", () => {
    const parsed = GeneratedReportPayloadSchema.parse(basePayload);
    expect(parsed.sections[0]?.claims[0]?.citationIds).toContain("citation-01");
    expect(parsed.sections[0]?.claims[0]?.evidenceIds).toContain("evidence-01");
  });

  it("requires claimId, sectionId, and evidenceIds on supportMap entries", () => {
    const entry = GeneratedReportPayloadSchema.parse(basePayload).supportMap[0];
    expect(entry?.claimId).toBe("claim-01");
    expect(entry?.sectionId).toBe("section-01");
    expect(entry?.evidenceIds).toContain("evidence-01");
  });

  it("fails when a claim omits support", () => {
    const invalid = structuredClone(basePayload);
    delete invalid.sections[0].claims[0].support;
    expect(GeneratedReportPayloadSchema.safeParse(invalid).success).toBe(false);
  });

  it("fails when a citation omits evidenceId", () => {
    const invalid = structuredClone(basePayload);
    delete invalid.citations[0].evidenceId;
    expect(GeneratedReportPayloadSchema.safeParse(invalid).success).toBe(false);
  });
});
