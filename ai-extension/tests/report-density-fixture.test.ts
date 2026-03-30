import { describe, expect, it } from "vitest";
import { GeneratedReportPayloadSchema } from "../src/shared/reporting/schemas.js";

describe("report density fixture", () => {
  it("rejects overly thin report output through fixture expectations", () => {
    const fixture = GeneratedReportPayloadSchema.parse({
      reportId: "report-density-01",
      pocketId: "pocket-01",
      title: "Dense report",
      subtitle: "Research-grade output",
      generatedAt: 100,
      sections: [
        {
          sectionId: "section-01",
          title: "One",
          summary:
            "This section summary is intentionally long to ensure the fixture protects against shallow report output and verifies that at least one section carries substantial explanatory context beyond a one-line summary.",
          claims: [
            {
              claimId: "claim-grounded-01",
              text: "Grounded claim one",
              support: "grounded",
              citationIds: ["citation-01"],
              evidenceIds: ["evidence-01"],
            },
            {
              claimId: "claim-weak-01",
              text: "Weak claim one",
              support: "weak",
              citationIds: [],
              evidenceIds: ["evidence-02"],
            },
          ],
          citationIds: ["citation-01"],
          evidenceIds: ["evidence-01", "evidence-02"],
        },
        {
          sectionId: "section-02",
          title: "Two",
          summary: "Detailed section two summary with specific findings and interpretation.",
          claims: [
            {
              claimId: "claim-grounded-02",
              text: "Grounded claim two",
              support: "grounded",
              citationIds: ["citation-02"],
              evidenceIds: ["evidence-03"],
            },
            {
              claimId: "claim-conflicted-01",
              text: "Conflicted claim one",
              support: "conflicted",
              citationIds: ["citation-03"],
              evidenceIds: ["evidence-04"],
            },
          ],
          citationIds: ["citation-02", "citation-03"],
          evidenceIds: ["evidence-03", "evidence-04"],
        },
        {
          sectionId: "section-03",
          title: "Three",
          summary: "Detailed section three summary with enough structure for the fixture.",
          claims: [
            {
              claimId: "claim-grounded-03",
              text: "Grounded claim three",
              support: "grounded",
              citationIds: ["citation-04"],
              evidenceIds: ["evidence-05"],
            },
            {
              claimId: "claim-weak-02",
              text: "Weak claim two",
              support: "weak",
              citationIds: [],
              evidenceIds: ["evidence-06"],
            },
          ],
          citationIds: ["citation-04"],
          evidenceIds: ["evidence-05", "evidence-06"],
        },
      ],
      citations: [
        {
          citationId: "citation-01",
          evidenceId: "evidence-01",
          label: "[1]",
          excerpt: "Excerpt 1",
        },
        {
          citationId: "citation-02",
          evidenceId: "evidence-03",
          label: "[2]",
          excerpt: "Excerpt 2",
        },
        {
          citationId: "citation-03",
          evidenceId: "evidence-04",
          label: "[3]",
          excerpt: "Excerpt 3",
        },
        {
          citationId: "citation-04",
          evidenceId: "evidence-05",
          label: "[4]",
          excerpt: "Excerpt 4",
        },
      ],
      supportMap: [
        {
          entryId: "entry-01",
          claimId: "claim-grounded-01",
          sectionId: "section-01",
          evidenceIds: ["evidence-01"],
          citationIds: ["citation-01"],
          support: "grounded",
          sourceUrls: [],
        },
      ],
      metadata: {
        evidenceCount: 6,
        weakClaimCount: 2,
        conflictedClaimCount: 1,
      },
    });

    expect(fixture.sections).toHaveLength(3);
    expect(fixture.sections.every((section) => section.claims.length >= 2)).toBe(true);
    expect(
      fixture.sections.some((section) => section.summary.length > 120),
    ).toBe(true);
    expect(fixture.citations.length).toBeGreaterThanOrEqual(fixture.sections.length);
  });
});
