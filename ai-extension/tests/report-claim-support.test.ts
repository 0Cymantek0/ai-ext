import { describe, expect, it } from "vitest";
import { resolveClaimSupport } from "../src/background/reporting/report-assembler.js";

describe("resolveClaimSupport", () => {
  it("marks zero citations as weak", () => {
    expect(
      resolveClaimSupport({
        citationIds: [],
        evidenceIds: ["evidence-01"],
        evidence: [],
      }),
    ).toBe("weak");
  });

  it("marks populated citations and evidence as grounded", () => {
    expect(
      resolveClaimSupport({
        citationIds: ["citation-01"],
        evidenceIds: ["evidence-01"],
        evidence: [
          {
            evidenceId: "evidence-01",
            pocketId: "pocket-01",
            contentId: "content-01",
            sourceUrl: "https://example.com/source",
            sourceType: "web",
            capturedAt: 1,
            excerpt: "Grounded excerpt",
            tags: [],
            provenance: {
              origin: "captured-content",
              extractionMethod: "test",
            },
          },
        ],
      }),
    ).toBe("grounded");
  });

  it("can yield conflicted for contradictory evidence bundles", () => {
    expect(
      resolveClaimSupport({
        citationIds: ["citation-01", "citation-02"],
        evidenceIds: ["evidence-01", "evidence-02"],
        evidence: [
          {
            evidenceId: "evidence-01",
            pocketId: "pocket-01",
            contentId: "content-01",
            sourceUrl: "https://example.com/source-a",
            sourceType: "web",
            capturedAt: 1,
            excerpt: "Claim one",
            tags: ["contradictory"],
            provenance: {
              origin: "captured-content",
              extractionMethod: "test",
            },
          },
          {
            evidenceId: "evidence-02",
            pocketId: "pocket-01",
            contentId: "content-02",
            sourceUrl: "https://example.com/source-b",
            sourceType: "web",
            capturedAt: 1,
            excerpt: "Claim two",
            tags: ["contradictory"],
            provenance: {
              origin: "captured-content",
              extractionMethod: "test",
            },
          },
        ],
      }),
    ).toBe("conflicted");
  });
});
