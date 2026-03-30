import { describe, expect, it } from "vitest";
import {
  createResearchEvidenceFingerprint,
  normalizeEvidenceSourceUrl,
} from "../src/types/content.js";

describe("research evidence dedupe", () => {
  it("uses the same fingerprint for the same normalized URL and claim", () => {
    const first = createResearchEvidenceFingerprint({
      sourceUrl: "https://Example.com/article/?utm_source=test#one",
      excerpt: "A repeated claim with extra   whitespace.",
    });
    const second = createResearchEvidenceFingerprint({
      sourceUrl: "https://example.com/article",
      excerpt: "a repeated claim with extra whitespace.",
    });

    expect(first).toBe(second);
    expect(normalizeEvidenceSourceUrl("https://Example.com/article/?utm_source=test#one")).toBe(
      "https://example.com/article",
    );
  });

  it("uses a different fingerprint when the claim changes", () => {
    const first = createResearchEvidenceFingerprint({
      sourceUrl: "https://example.com/article",
      excerpt: "First claim",
    });
    const second = createResearchEvidenceFingerprint({
      sourceUrl: "https://example.com/article",
      excerpt: "Second claim",
    });

    expect(first).not.toBe(second);
  });

  it("uses a different fingerprint when the locator changes", () => {
    const first = createResearchEvidenceFingerprint({
      sourceUrl: "https://example.com/article",
      excerpt: "Same excerpt",
      locator: "section-1",
    });
    const second = createResearchEvidenceFingerprint({
      sourceUrl: "https://example.com/article",
      excerpt: "Same excerpt",
      locator: "section-2",
    });

    expect(first).not.toBe(second);
  });
});
