import { describe, expect, it } from "vitest";
import {
  buildReportSupportMap,
  getEvidenceUsage,
  getSectionSupport,
} from "../src/background/reporting/report-provenance.js";

describe("report provenance helpers", () => {
  const sections = [
    {
      sectionId: "section-01",
      title: "Section 1",
      summary: "Summary",
      claims: [
        {
          claimId: "claim-01",
          text: "Claim",
          support: "grounded" as const,
          citationIds: ["citation-01"],
          evidenceIds: ["evidence-01"],
        },
      ],
      citationIds: ["citation-01"],
      evidenceIds: ["evidence-01"],
    },
  ];

  const citations = [
    {
      citationId: "citation-01",
      evidenceId: "evidence-01",
      label: "[1]",
      sourceTitle: "Primary source",
      sourceUrl: "https://example.com/source",
      excerpt: "Evidence excerpt",
    },
  ];

  it("creates one support-map entry per claim", () => {
    const result = buildReportSupportMap(sections, citations);
    expect(result).toHaveLength(1);
  });

  it("gets evidence usage for evidence-01", () => {
    const result = buildReportSupportMap(sections, citations);
    expect(getEvidenceUsage(result, "evidence-01")[0]?.claimId).toBe("claim-01");
  });

  it("gets section support only for section-01", () => {
    const result = buildReportSupportMap(sections, citations);
    expect(getSectionSupport(result, "section-01")).toHaveLength(1);
    expect(getSectionSupport(result, "section-99")).toHaveLength(0);
  });

  it("derives source URLs from matching citations", () => {
    const result = buildReportSupportMap(sections, citations);
    expect(result[0]?.sourceUrls).toEqual(["https://example.com/source"]);
  });
});
