import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  EmbeddingGeneratorService,
  type EmbeddingGeneratorInstrumentation,
} from "../embedding-generator.js";

function createMockEngine() {
  return {
    generateEmbedding: vi.fn<[string, unknown?], Promise<number[]>>(async (text: string) => {
      const value = text.length % 10;
      return [value + 0.1, value + 0.2, value + 0.3];
    }),
    generateEmbeddingsBatch: vi.fn<[string[], unknown?], Promise<number[][]>>(async (
      texts: string[],
    ) => {
      return texts.map((text, index) => {
        const base = (text.length + index) % 10;
        return [base + 0.1, base + 0.2, base + 0.3];
      });
    }),
  };
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

describe("EmbeddingGeneratorService", () => {
  let engine: ReturnType<typeof createMockEngine>;

  beforeEach(() => {
    engine = createMockEngine();
    vi.clearAllMocks();
  });

  it("caches single embeddings by default", async () => {
    const service = new EmbeddingGeneratorService({ cacheSize: 32 }, { engine });

    const first = await service.generateEmbedding("  hello world  ");
    const second = await service.generateEmbedding("hello world");

    expect(engine.generateEmbedding).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
  });

  it("deduplicates batched texts and respects batch size", async () => {
    const service = new EmbeddingGeneratorService(
      {
        cacheSize: 0,
        batchSize: 2,
      },
      { engine },
    );

    const result = await service.generateEmbeddings([
      "alpha",
      "beta",
      "alpha",
      "gamma",
    ]);

    expect(engine.generateEmbeddingsBatch).toHaveBeenCalledTimes(2);
    expect(engine.generateEmbeddingsBatch).toHaveBeenNthCalledWith(
      1,
      ["alpha", "beta"],
      expect.objectContaining({ batchSize: 2 }),
    );
    expect(engine.generateEmbeddingsBatch).toHaveBeenNthCalledWith(
      2,
      ["gamma"],
      expect.objectContaining({ batchSize: 2 }),
    );
    expect(result).toHaveLength(4);
    expect(result[0]).toEqual(result[2]);
  });

  it("retries transient failures and emits instrumentation", async () => {
    const instrumentation: EmbeddingGeneratorInstrumentation = {
      onRetry: vi.fn(),
      onRequestError: vi.fn(),
      onRequestSuccess: vi.fn(),
    };

    let attempt = 0;
    engine.generateEmbedding.mockImplementation(async () => {
      attempt++;
      if (attempt === 1) {
        const error = new Error("Rate limit exceeded");
        return Promise.reject(error);
      }
      return [0.5, 0.6, 0.7];
    });

    const waitSpy = vi.fn(async () => Promise.resolve());
    const service = new EmbeddingGeneratorService(
      {
        cacheSize: 0,
        maxRetries: 2,
        retryDelayMs: 5,
        instrumentation,
      },
      { engine, wait: waitSpy },
    );

    const embedding = await service.generateEmbedding("retry me");

    expect(embedding).toEqual([0.5, 0.6, 0.7]);
    expect(engine.generateEmbedding).toHaveBeenCalledTimes(2);
    expect(waitSpy).toHaveBeenCalledTimes(1);
    expect(instrumentation.onRetry).toHaveBeenCalledTimes(1);
    expect(instrumentation.onRequestError).toHaveBeenCalledTimes(1);
    expect(instrumentation.onRequestSuccess).toHaveBeenCalledTimes(1);
  });

  it("enforces service-level rate limiting", async () => {
    let currentTime = 0;
    const waitSpy = vi.fn(async (ms: number) => {
      currentTime += ms;
    });

    const service = new EmbeddingGeneratorService(
      {
        cacheSize: 0,
        maxRequestsPerInterval: 1,
        rateLimitIntervalMs: 1000,
      },
      {
        engine,
        now: () => currentTime,
        wait: waitSpy,
      },
    );

    await service.generateEmbedding("first");
    await service.generateEmbedding("second");

    expect(waitSpy).toHaveBeenCalledTimes(1);
    const waited = waitSpy.mock.calls[0]?.[0] ?? 0;
    expect(waited).toBeGreaterThanOrEqual(1000);
  });

  it("chunks text by words while preserving metadata", () => {
    const service = new EmbeddingGeneratorService({}, { engine });

    const sentence = "In context chunking keeps embeddings coherent.";
    const text = Array.from({ length: 180 }, (_, index) => `${index}:${sentence}`).join(" ");
    const totalWords = countWords(text);

    const chunks = service.chunkText(text, {
      wordsPerChunk: 40,
      overlapWords: 10,
    });

    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((chunk, index) => {
      expect(chunk.text).toBeTruthy();
      expect(chunk.wordCount).toBeGreaterThan(0);
      expect(chunk.wordCount).toBeLessThanOrEqual(70);
      if (index > 0) {
        expect(chunk.wordStart).toBeLessThan(chunk.wordEnd);
        expect(chunk.wordStart).toBeLessThanOrEqual(chunks[index - 1]!.wordEnd);
      }
    });

    const lastChunk = chunks[chunks.length - 1]!;
    expect(lastChunk.wordEnd).toBe(totalWords);
  });
});
