import { describe, it, expect } from "vitest";
import {
  ContentType,
  ProcessingStatus,
  type CapturedContent,
  type Pocket,
} from "../../background/indexeddb-manager.js";
import { formatSearchResults } from "../result-formatter.js";

describe("formatSearchResults", () => {
  it("highlights snippets and titles using the provided query", () => {
    const captured: CapturedContent = {
      id: "content-1",
      pocketId: "pocket-1",
      type: ContentType.TEXT,
      content:
        "Deep learning techniques continue to reshape information retrieval and search experiences across industries.",
      metadata: {
        timestamp: 1,
        title: "Deep Learning for Search",
        summary:
          "A primer on how deep learning models improve semantic understanding for search results.",
      },
      capturedAt: 1700000000000,
      sourceUrl: "https://example.com/deep-learning",
      processingStatus: ProcessingStatus.COMPLETED,
    };

    const [formatted] = formatSearchResults(
      [
        {
          item: captured,
          relevanceScore: 0.82,
          matchedFields: ["summary"],
        },
      ],
      { query: "deep learning" },
    );

    expect(formatted.title.text).toBe("Deep Learning for Search");
    const highlightedTitleSegments = formatted.title.segments.filter(
      (segment) => segment.highlight,
    );
    expect(highlightedTitleSegments.map((segment) => segment.text.toLowerCase())).toEqual([
      "deep",
      "learning",
    ]);

    expect(formatted.snippet).not.toBeNull();
    const snippet = formatted.snippet!;
    expect(snippet.text.toLowerCase()).toContain("deep");
    expect(snippet.text.toLowerCase()).toContain("learning");
    expect(
      snippet.segments.filter((segment) => segment.highlight).length,
    ).toBeGreaterThanOrEqual(2);

    expect(formatted.scoreLabel).toBe("82%");
    expect(formatted.normalizedScore).toBeCloseTo(0.82, 2);
  });

  it("normalizes arbitrary score ranges to percentages", () => {
    const pockets: Pocket[] = [
      {
        id: "a",
        name: "Alpha",
        description: "",
        createdAt: 1,
        updatedAt: 1,
        contentIds: [],
        tags: [],
        color: "#000000",
      },
      {
        id: "b",
        name: "Beta",
        description: "",
        createdAt: 1,
        updatedAt: 1,
        contentIds: [],
        tags: [],
        color: "#000000",
      },
      {
        id: "c",
        name: "Gamma",
        description: "",
        createdAt: 1,
        updatedAt: 1,
        contentIds: [],
        tags: [],
        color: "#000000",
      },
    ];

    const formatted = formatSearchResults(
      [
        { item: pockets[0], relevanceScore: 40 },
        { item: pockets[1], relevanceScore: 90 },
        { item: pockets[2], relevanceScore: 65 },
      ],
      { query: "alpha" },
    );

    expect(formatted.map((result) => result.scorePercentage)).toEqual([0, 100, 50]);
    expect(formatted.map((result) => result.scoreLabel)).toEqual([
      "0%",
      "100%",
      "50%",
    ]);
  });

  it("falls back to pocket descriptions when snippets are missing", () => {
    const pocket: Pocket = {
      id: "pocket-snippet",
      name: "Research",
      description:
        "Collection covering signal processing, embeddings, and neural network innovations across years.",
      createdAt: 1,
      updatedAt: 1,
      contentIds: [],
      tags: ["ai", "ml"],
      color: "#123456",
    };

    const [formatted] = formatSearchResults(
      [{ item: pocket, relevanceScore: 0.4 }],
      { query: "neural" },
    );

    expect(formatted.snippet).not.toBeNull();
    expect(formatted.snippet?.text).toContain("neural network");
  });

  it("returns null snippets when no textual metadata is available", () => {
    const captured: CapturedContent = {
      id: "content-empty",
      pocketId: "pocket-1",
      type: ContentType.IMAGE,
      content: new ArrayBuffer(2),
      metadata: {
        timestamp: 1,
      },
      capturedAt: 1700000000000,
      sourceUrl: "https://example.com/asset",
      processingStatus: ProcessingStatus.COMPLETED,
    };

    const [formatted] = formatSearchResults([{ item: captured }], {});

    expect(formatted.snippet).toBeNull();
  });

  it("avoids highlighting when query is empty", () => {
    const pocket: Pocket = {
      id: "no-query",
      name: "Empty Query",
      description: "A description that should remain un-highlighted.",
      createdAt: 1,
      updatedAt: 1,
      contentIds: [],
      tags: [],
      color: "#ffffff",
    };

    const [formatted] = formatSearchResults([{ item: pocket }], { query: "" });

    expect(
      formatted.title.segments.every((segment) => segment.highlight === false),
    ).toBe(true);
    expect(
      formatted.snippet?.segments.every((segment) => segment.highlight === false),
    ).toBe(true);
  });

  it("normalizes identical non-zero scores to 100%", () => {
    const pockets: Pocket[] = [
      {
        id: "a",
        name: "Alpha",
        description: "",
        createdAt: 1,
        updatedAt: 1,
        contentIds: [],
        tags: [],
        color: "#000000",
      },
      {
        id: "b",
        name: "Beta",
        description: "",
        createdAt: 1,
        updatedAt: 1,
        contentIds: [],
        tags: [],
        color: "#000000",
      },
      {
        id: "c",
        name: "Gamma",
        description: "",
        createdAt: 1,
        updatedAt: 1,
        contentIds: [],
        tags: [],
        color: "#000000",
      },
    ];

    const formatted = formatSearchResults(
      [
        { item: pockets[0], relevanceScore: 0.85 },
        { item: pockets[1], relevanceScore: 0.85 },
        { item: pockets[2], relevanceScore: 0.85 },
      ],
      { query: "" },
    );

    // When all scores are identical and non-zero, they should all normalize to 100%
    expect(formatted.map((result) => result.scorePercentage)).toEqual([100, 100, 100]);
    expect(formatted.map((result) => result.scoreLabel)).toEqual([
      "100%",
      "100%",
      "100%",
    ]);
  });

  it("normalizes identical zero scores to 0%", () => {
    const pockets: Pocket[] = [
      {
        id: "a",
        name: "Alpha",
        description: "",
        createdAt: 1,
        updatedAt: 1,
        contentIds: [],
        tags: [],
        color: "#000000",
      },
      {
        id: "b",
        name: "Beta",
        description: "",
        createdAt: 1,
        updatedAt: 1,
        contentIds: [],
        tags: [],
        color: "#000000",
      },
    ];

    const formatted = formatSearchResults(
      [
        { item: pockets[0], relevanceScore: 0 },
        { item: pockets[1], relevanceScore: 0 },
      ],
      { query: "" },
    );

    // When all scores are zero, they should all normalize to 0%
    expect(formatted.map((result) => result.scorePercentage)).toEqual([0, 0]);
    expect(formatted.map((result) => result.scoreLabel)).toEqual(["0%", "0%"]);
  });
});
