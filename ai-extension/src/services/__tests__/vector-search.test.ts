import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  TieredVectorSearchService,
  cosineSimilarity,
  type VectorContentMatch,
  type VectorSearchDependencies,
  type DatabaseManagerLike,
} from "../vector-search.js";
import {
  ContentType,
  ProcessingStatus,
  type CapturedContent,
  type Pocket,
  type StoredChunk,
  type Embedding,
} from "../../background/indexeddb-manager.js";

function createPocket(overrides: Partial<Pocket> = {}): Pocket {
  return {
    id: overrides.id ?? `pocket-${Math.random().toString(36).slice(2)}`,
    name: overrides.name ?? "Untitled",
    description: overrides.description ?? "",
    tags: overrides.tags ?? [],
    color: overrides.color ?? "#000000",
    contentIds: overrides.contentIds ?? [],
    createdAt: overrides.createdAt ?? Date.now(),
    updatedAt: overrides.updatedAt ?? Date.now(),
    icon: overrides.icon,
  };
}

function createContent(overrides: Partial<CapturedContent> = {}): CapturedContent {
  return {
    id: overrides.id ?? `content-${Math.random().toString(36).slice(2)}`,
    pocketId: overrides.pocketId ?? "pocket-unknown",
    type: overrides.type ?? ContentType.TEXT,
    content: overrides.content ?? "",
    metadata: overrides.metadata ?? { timestamp: Date.now() },
    capturedAt: overrides.capturedAt ?? Date.now(),
    sourceUrl: overrides.sourceUrl ?? "https://example.com",
    processingStatus: overrides.processingStatus ?? ProcessingStatus.COMPLETED,
    embedding: overrides.embedding,
    pdfMetadata: overrides.pdfMetadata,
  };
}

function createChunk(overrides: Partial<StoredChunk> & {
  embedding: number[];
}): StoredChunk {
  const chunkId = overrides.id ?? `chunk-${Math.random().toString(36).slice(2)}`;
  return {
    id: chunkId,
    contentId: overrides.contentId ?? "content-unknown",
    pocketId: overrides.pocketId ?? "pocket-unknown",
    text: overrides.text ?? "chunk text",
    embedding: overrides.embedding,
    metadata:
      overrides.metadata ??
      ({
        contentId: overrides.contentId ?? "content-unknown",
        pocketId: overrides.pocketId ?? "pocket-unknown",
        sourceType: ContentType.TEXT,
        sourceUrl: overrides.metadata?.sourceUrl ?? "https://example.com/article",
        chunkIndex: overrides.metadata?.chunkIndex ?? 0,
        totalChunks: overrides.metadata?.totalChunks ?? 1,
        startOffset: overrides.metadata?.startOffset ?? 0,
        endOffset: overrides.metadata?.endOffset ?? (overrides.text?.length ?? 0),
        capturedAt: overrides.metadata?.capturedAt ?? Date.now(),
        chunkedAt: overrides.metadata?.chunkedAt ?? Date.now(),
        title: overrides.metadata?.title ?? "Chunk",
        category: overrides.metadata?.category,
        textPreview: overrides.metadata?.textPreview ?? (overrides.text ?? "chunk"),
      }),
    createdAt: overrides.createdAt ?? Date.now(),
  };
}

class InMemoryDatabase implements DatabaseManagerLike {
  private readonly pockets: Pocket[];
  private readonly contentsById: Map<string, CapturedContent>;
  private readonly contentsByPocket: Map<string, CapturedContent[]>;
  private readonly chunksByPocket: Map<string, StoredChunk[]>;

  constructor(
    pockets: Pocket[],
    contents: CapturedContent[],
    chunks: StoredChunk[],
  ) {
    this.pockets = pockets;
    this.contentsById = new Map(contents.map((item) => [item.id, item]));
    this.contentsByPocket = new Map();
    for (const content of contents) {
      const existing = this.contentsByPocket.get(content.pocketId);
      if (existing) {
        existing.push(content);
      } else {
        this.contentsByPocket.set(content.pocketId, [content]);
      }
    }

    this.chunksByPocket = new Map();
    for (const chunk of chunks) {
      const existing = this.chunksByPocket.get(chunk.pocketId);
      if (existing) {
        existing.push(chunk);
      } else {
        this.chunksByPocket.set(chunk.pocketId, [chunk]);
      }
    }
  }

  async listPockets(): Promise<Pocket[]> {
    return [...this.pockets];
  }

  async getPocket(id: string): Promise<Pocket | null> {
    return this.pockets.find((pocket) => pocket.id === id) ?? null;
  }

  async getContent(id: string): Promise<CapturedContent | null> {
    return this.contentsById.get(id) ?? null;
  }

  async getContentByPocket(pocketId: string): Promise<CapturedContent[]> {
    return [...(this.contentsByPocket.get(pocketId) ?? [])];
  }

  async getChunksByPocket(pocketId: string): Promise<StoredChunk[]> {
    return [...(this.chunksByPocket.get(pocketId) ?? [])];
  }

  async getAllChunks(): Promise<StoredChunk[]> {
    return [...this.chunksByPocket.values()].flat();
  }

  async getEmbeddingByContentId(): Promise<Embedding | null> {
    return null;
  }

  async saveEmbedding(): Promise<void> {
    // noop for tests
  }
}

function createEmbeddingGenerator() {
  return vi.fn<[string], Promise<number[]>>(async (text: string) => {
    const lower = text.toLowerCase();
    if (lower.includes("alpha")) {
      return [0.98, 0.05];
    }
    if (lower.includes("beta")) {
      return [0.1, 0.95];
    }
    if (lower.includes("gamma")) {
      return [0.6, 0.6];
    }
    return [0.5, 0.5];
  });
}

describe("cosineSimilarity", () => {
  it("returns 1 for identical vectors", () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 5);
  });

  it("returns 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0, 0], [0, 1, 0])).toBeCloseTo(0, 5);
  });

  it("returns -1 for opposite vectors", () => {
    expect(cosineSimilarity([1, 1], [-1, -1])).toBeCloseTo(-1, 5);
  });
});

describe("TieredVectorSearchService", () => {
  let database: InMemoryDatabase;
  let embeddingGenerator: ReturnType<typeof createEmbeddingGenerator>;
  let service: TieredVectorSearchService;

  beforeEach(() => {
    const pocketAlpha = createPocket({
      id: "p-alpha",
      name: "Alpha Research",
      description: "Machine learning papers",
      tags: ["ml", "ai"],
      contentIds: ["c-alpha"],
    });
    const pocketBeta = createPocket({
      id: "p-beta",
      name: "Beta Docs",
      description: "Frontend reference",
      tags: ["web"],
      contentIds: ["c-beta"],
    });

    const contentAlpha = createContent({
      id: "c-alpha",
      pocketId: pocketAlpha.id,
      content: "Comprehensive alpha overview",
      metadata: {
        timestamp: Date.now(),
        title: "Alpha Deep Dive",
        excerpt: "Exploring alpha domain",
      },
    });
    const contentAlphaExtra = createContent({
      id: "c-alpha-extra",
      pocketId: pocketAlpha.id,
      content: "Supplemental alpha appendix",
      metadata: {
        timestamp: Date.now(),
        title: "Alpha Appendix",
        excerpt: "Auxiliary material",
      },
    });
    const contentBeta = createContent({
      id: "c-beta",
      pocketId: pocketBeta.id,
      content: "Beta component guidelines",
      metadata: {
        timestamp: Date.now(),
        title: "Beta Guide",
        excerpt: "Styling tips",
      },
    });

    const chunkAlphaMain = createChunk({
      id: "chunk-alpha-main",
      contentId: contentAlpha.id,
      pocketId: pocketAlpha.id,
      text: "Alpha chunk primary",
      embedding: [0.96, 0.08],
    });
    const chunkAlphaSecondary = createChunk({
      id: "chunk-alpha-secondary",
      contentId: contentAlpha.id,
      pocketId: pocketAlpha.id,
      text: "Alpha chunk secondary",
      embedding: [0.9, 0.1],
    });
    const chunkAlphaExtra = createChunk({
      id: "chunk-alpha-extra",
      contentId: contentAlphaExtra.id,
      pocketId: pocketAlpha.id,
      text: "Alpha supporting chunk",
      embedding: [0.8, 0.2],
    });
    const chunkBeta = createChunk({
      id: "chunk-beta",
      contentId: contentBeta.id,
      pocketId: pocketBeta.id,
      text: "Beta stack chunk",
      embedding: [0.15, 0.92],
    });

    database = new InMemoryDatabase(
      [pocketAlpha, pocketBeta],
      [contentAlpha, contentAlphaExtra, contentBeta],
      [chunkAlphaMain, chunkAlphaSecondary, chunkAlphaExtra, chunkBeta],
    );
    embeddingGenerator = createEmbeddingGenerator();

    const dependencies: VectorSearchDependencies = {
      database,
      embeddingGenerator: embeddingGenerator as unknown as (text: string) => Promise<number[]>,
    };
    service = new TieredVectorSearchService(dependencies, {
      defaultMinRelevance: 0.2,
      defaultLimit: 10,
    });
  });

  it("ranks pockets using semantic similarity", async () => {
    const results = await service.searchPockets("alpha insights");

    expect(results).toHaveLength(1);
    expect(results[0]?.item.id).toBe("p-alpha");
    expect(results[0]?.matchedFields).toContain("semantic");
  });

  it("deduplicates content matches by contentId", async () => {
    const results = await service.searchAllPockets("alpha research");

    const alphaMatches = results.filter(
      (result) => result.item.contentId === "c-alpha",
    );

    expect(alphaMatches).toHaveLength(1);
    expect(alphaMatches[0]?.matchedFields).toContain("semantic");
    expect(alphaMatches[0]?.item.chunk?.id).toBe("chunk-alpha-main");
    expect(results.every((result) => result.item.pocket)).toBe(true);
  });

  it("falls back to keyword search when embeddings fail", async () => {
    const failingService = new TieredVectorSearchService(
      {
        database,
        embeddingGenerator: vi
          .fn<[string], Promise<number[]>>()
          .mockRejectedValue(new Error("fail")) as unknown as (text: string) => Promise<number[]>,
      },
      {
        defaultMinRelevance: 0.2,
      },
    );

    const results = await failingService.searchPockets("beta");

    expect(results).toHaveLength(1);
    expect(results[0]?.item.id).toBe("p-beta");
    expect(results[0]?.matchedFields).toContain("name");
  });

  it("caches query and document embeddings between searches", async () => {
    await service.searchPockets("alpha overview");
    expect(embeddingGenerator).toHaveBeenCalledTimes(1 + 2); // query + two pockets

    embeddingGenerator.mockClear();
    await service.searchPockets("alpha overview");
    expect(embeddingGenerator).toHaveBeenCalledTimes(0);
  });
});
