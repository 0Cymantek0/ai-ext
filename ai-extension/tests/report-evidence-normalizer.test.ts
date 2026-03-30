import { describe, expect, it } from "vitest";
import { normalizePocketEvidence } from "../src/background/reporting/evidence-normalizer.js";

describe("normalizePocketEvidence", () => {
  it("normalizes content, chunks, dedupes, and drops empty excerpts", () => {
    const result = normalizePocketEvidence({
      pocketId: "pocket-1",
      contents: [
        {
          id: "content-1",
          pocketId: "pocket-1",
          type: "text",
          capturedAt: 100,
          sourceUrl: "https://example.com/article-a",
          content: "Excerpt A",
          metadata: {
            title: "Article A",
            tags: ["reporting"],
          },
        },
        {
          id: "content-2",
          pocketId: "pocket-1",
          type: "text",
          capturedAt: 110,
          sourceUrl: "https://example.com/article-a",
          content: "Excerpt A",
          metadata: {
            title: "Article A duplicate",
          },
        },
        {
          id: "content-3",
          pocketId: "pocket-1",
          type: "text",
          capturedAt: 120,
          sourceUrl: "https://example.com/article-b",
          content: "   ",
          metadata: {},
        },
      ],
      chunks: [
        {
          id: "chunk-1",
          contentId: "content-1",
          pocketId: "pocket-1",
          text: "Excerpt A",
          chunkIndex: 2,
          similarity: 0.91,
        },
      ],
    });

    expect(result.some((item) => item.evidenceId === "evidence-content-content-1")).toBe(true);
    expect(result.some((item) => item.evidenceId === "evidence-chunk-chunk-1")).toBe(true);
    expect(
      result.filter(
        (item) =>
          item.provenance.origin === "captured-content" &&
          item.sourceUrl === "https://example.com/article-a" &&
          item.excerpt === "Excerpt A",
      ),
    ).toHaveLength(1);
    expect(result.some((item) => item.contentId === "content-3")).toBe(false);

    const chunk = result.find((item) => item.evidenceId === "evidence-chunk-chunk-1");
    expect(chunk?.chunkIndex).toBe(2);
    expect(chunk?.relevanceScore).toBe(0.91);
  });
});
