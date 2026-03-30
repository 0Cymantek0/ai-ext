/**
 * Embedding Generator Service
 *
 * Provides a dependency-injected wrapper around the background {@link EmbeddingEngine}
 * so UI surfaces can deterministically generate embeddings, batch large requests, and
 * perform text chunking without duplicating background logic.
 *
 * The service favours local (Gemini Nano / TensorFlow.js USE) embeddings while
 * falling back to cloud generation through the engine's hybrid strategy. It layers
 * additional client-side rate limiting, retry, caching, and instrumentation hooks to
 * keep usage within quota budgets from UI-triggered operations.
 *
 * Environment requirements:
 * - Gemini Nano availability (Chromium + chrome://flags/#prompt-api-for-gemini-nano)
 * - Optional Google AI API key for cloud fallbacks (see README credentials section)
 */

import {
  embeddingEngine as defaultEmbeddingEngine,
  type EmbeddingEngine,
} from "../background/embedding-engine.js";
import {
  textChunker as defaultTextChunker,
  type TextChunk,
  type ChunkOptions as BackgroundChunkOptions,
  type TextChunker,
} from "../background/text-chunker.js";

export interface LoggerLike {
  debug?: (...args: unknown[]) => void;
  info?: (...args: unknown[]) => void;
  warn?: (...args: unknown[]) => void;
  error?: (...args: unknown[]) => void;
}

const consoleLogger: LoggerLike =
  typeof console !== "undefined"
    ? {
        debug: console.debug?.bind(console),
        info: console.info?.bind(console),
        warn: console.warn?.bind(console),
        error: console.error?.bind(console),
      }
    : {};

export interface EmbeddingRequestStartEvent {
  id: string;
  attempt: number;
  requestType: "single" | "batch";
  timestamp: number;
  texts: readonly string[];
}

export interface EmbeddingRequestSuccessEvent {
  id: string;
  attempt: number;
  requestType: "single" | "batch";
  timestamp: number;
  durationMs: number;
  textCount: number;
}

export interface EmbeddingRequestErrorEvent
  extends EmbeddingRequestSuccessEvent {
  error: unknown;
}

export interface EmbeddingRequestRetryEvent extends EmbeddingRequestErrorEvent {
  nextDelayMs: number;
}

export interface EmbeddingGeneratorInstrumentation {
  onRequestStart?(event: EmbeddingRequestStartEvent): void;
  onRequestSuccess?(event: EmbeddingRequestSuccessEvent): void;
  onRequestError?(event: EmbeddingRequestErrorEvent): void;
  onRetry?(event: EmbeddingRequestRetryEvent): void;
}

export interface ChunkingOptions {
  /** Target number of words per chunk (default 160 ≈ 700 chars). */
  wordsPerChunk?: number;
  /** Number of words to overlap between chunks (default 40 ≈ 100 chars). */
  overlapWords?: number;
  /** Preserve sentence boundaries when possible (default true). */
  respectSentences?: boolean;
  /** Preserve paragraph boundaries when possible (default true). */
  respectParagraphs?: boolean;
}

export interface GenerateEmbeddingOptions {
  /** When true (default) caches embedding results for identical text inputs. */
  useCache?: boolean;
  /** Prefer Gemini Nano/local embeddings when available (default true). */
  preferNano?: boolean;
}

export interface GenerateEmbeddingsOptions extends GenerateEmbeddingOptions {
  /** Maximum number of texts processed per batch (default derived from config). */
  batchSize?: number;
  /** Abort signal allowing callers to cancel long running generation. */
  signal?: AbortSignal;
}

export interface EmbeddingGeneratorConfig {
  /** Default batch size for bulk generation. */
  batchSize?: number;
  /** Default preference for Gemini Nano/local generation. */
  preferNano?: boolean;
  /** Maximum cached embeddings retained in-memory (LRU). */
  cacheSize?: number;
  /** Maximum retry attempts for transient failures (default 2). */
  maxRetries?: number;
  /** Initial retry delay in milliseconds (default 250ms). */
  retryDelayMs?: number;
  /** Maximum retry backoff delay (default 4000ms). */
  maxRetryDelayMs?: number;
  /** Rolling interval window in ms for service-level rate limiting (default 60s). */
  rateLimitIntervalMs?: number;
  /** Maximum requests allowed per rate limit window (default 60). */
  maxRequestsPerInterval?: number;
  /** Global chunking defaults applied when none supplied per call. */
  chunking?: ChunkingOptions;
  /** Optional instrumentation callbacks for analytics/quota tracking. */
  instrumentation?: EmbeddingGeneratorInstrumentation;
}

export interface EmbeddingGeneratorDependencies {
  engine?: Pick<
    EmbeddingEngine,
    "generateEmbedding" | "generateEmbeddingsBatch"
  >;
  chunker?: Pick<TextChunker, "chunkText">;
  logger?: LoggerLike;
  now?: () => number;
  wait?: (ms: number) => Promise<void>;
}

export interface ChunkedText extends TextChunk {
  /** Inclusive start index of the first word contained in the chunk. */
  wordStart: number;
  /** Exclusive end index of the final word contained in the chunk. */
  wordEnd: number;
  /** Total words present in this chunk. */
  wordCount: number;
}

export interface EmbeddingGenerator {
  generateEmbedding(
    text: string,
    options?: GenerateEmbeddingOptions,
  ): Promise<number[]>;
  generateEmbeddings(
    texts: readonly string[],
    options?: GenerateEmbeddingsOptions,
  ): Promise<number[][]>;
  chunkText(text: string, options?: ChunkingOptions): ChunkedText[];
  clearCache(): void;
  getCacheStats(): { size: number; capacity: number };
}

type RequiredConfigFields = Required<
  Pick<
    EmbeddingGeneratorConfig,
    | "batchSize"
    | "preferNano"
    | "cacheSize"
    | "maxRetries"
    | "retryDelayMs"
    | "maxRetryDelayMs"
    | "rateLimitIntervalMs"
    | "maxRequestsPerInterval"
  >
>;

type ResolvedConfig = RequiredConfigFields & {
  chunking: Required<ChunkingOptions>;
  instrumentation?: EmbeddingGeneratorInstrumentation;
};

const DEFAULT_CONFIG: ResolvedConfig = {
  batchSize: 16,
  preferNano: true,
  cacheSize: 256,
  maxRetries: 2,
  retryDelayMs: 250,
  maxRetryDelayMs: 4000,
  rateLimitIntervalMs: 60_000,
  maxRequestsPerInterval: 60,
  chunking: {
    wordsPerChunk: 160,
    overlapWords: 40,
    respectSentences: true,
    respectParagraphs: true,
  },
};

class LRUCache<K, V> {
  private readonly capacity: number;
  private readonly map = new Map<K, V>();

  constructor(capacity: number) {
    this.capacity = Math.max(0, capacity);
  }

  get(key: K): V | undefined {
    if (this.capacity === 0) {
      return undefined;
    }
    const existing = this.map.get(key);
    if (existing !== undefined) {
      this.map.delete(key);
      this.map.set(key, existing);
    }
    return existing;
  }

  set(key: K, value: V): void {
    if (this.capacity === 0) {
      return;
    }
    if (this.map.has(key)) {
      this.map.delete(key);
    }
    this.map.set(key, value);
    if (this.map.size > this.capacity) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) {
        this.map.delete(oldest);
      }
    }
  }

  clear(): void {
    this.map.clear();
  }

  size(): number {
    return this.map.size;
  }

  capacityValue(): number {
    return this.capacity;
  }
}

interface RequestContext {
  type: "single" | "batch";
  texts: readonly string[];
}

export class EmbeddingGeneratorService implements EmbeddingGenerator {
  private readonly config: ResolvedConfig;
  private readonly engine: Pick<
    EmbeddingEngine,
    "generateEmbedding" | "generateEmbeddingsBatch"
  >;
  private readonly chunker: Pick<TextChunker, "chunkText">;
  private readonly logger: LoggerLike;
  private readonly nowFn: () => number;
  private readonly waitFn: (ms: number) => Promise<void>;
  private readonly cache: LRUCache<string, number[]>;
  private readonly requestLog: number[] = [];
  private requestCounter = 0;

  constructor(
    config: EmbeddingGeneratorConfig = {},
    dependencies: EmbeddingGeneratorDependencies = {},
  ) {
    const { chunking: chunkOverrides, instrumentation, ...restConfig } = config;

    const mergedConfig: ResolvedConfig = {
      ...DEFAULT_CONFIG,
      ...restConfig,
      chunking: {
        ...DEFAULT_CONFIG.chunking,
        ...chunkOverrides,
      },
    };

    if (instrumentation !== undefined) {
      mergedConfig.instrumentation = instrumentation;
    }

    this.config = mergedConfig;
    this.engine = dependencies.engine ?? defaultEmbeddingEngine;
    this.chunker = dependencies.chunker ?? defaultTextChunker;
    this.logger = dependencies.logger ?? consoleLogger;
    this.nowFn = dependencies.now ?? (() => Date.now());
    this.waitFn =
      dependencies.wait ??
      ((ms: number) => new Promise((res) => setTimeout(res, ms)));
    this.cache = new LRUCache<string, number[]>(mergedConfig.cacheSize);
  }

  async generateEmbedding(
    text: string,
    options: GenerateEmbeddingOptions = {},
  ): Promise<number[]> {
    const normalized = this.normalizeText(text);
    if (!normalized) {
      throw new Error("Embedding generation requires non-empty text input");
    }

    const preferNano = options.preferNano ?? this.config.preferNano;
    const useCache = options.useCache ?? true;

    if (useCache) {
      const cached = this.cache.get(normalized);
      if (cached) {
        this.logger.debug?.("EmbeddingGeneratorService", "Cache hit", {
          textLength: normalized.length,
        });
        return [...cached];
      }
    }

    await this.enforceRateLimit();

    const embedding = await this.withRetry<number[]>(
      { type: "single", texts: [normalized] },
      async () =>
        await this.engine.generateEmbedding(normalized, {
          preferNano,
        }),
      1,
    );

    if (!Array.isArray(embedding) || embedding.length === 0) {
      throw new Error("Embedding engine returned an invalid vector");
    }

    if (useCache) {
      this.cache.set(normalized, [...embedding]);
    }

    return [...embedding];
  }

  async generateEmbeddings(
    texts: readonly string[],
    options: GenerateEmbeddingsOptions = {},
  ): Promise<number[][]> {
    if (!Array.isArray(texts) || texts.length === 0) {
      return [];
    }

    const preferNano = options.preferNano ?? this.config.preferNano;
    const batchSize = Math.max(1, options.batchSize ?? this.config.batchSize);
    const useCache = options.useCache ?? true;
    const abortSignal = options.signal;

    const results: (number[] | null)[] = new Array(texts.length).fill(null);
    const pending = new Map<string, number[]>();

    texts.forEach((text, index) => {
      const normalized = this.normalizeText(text);
      if (!normalized) {
        throw new Error(
          `Embedding generation requires non-empty text at index ${index}`,
        );
      }

      if (useCache) {
        const cached = this.cache.get(normalized);
        if (cached) {
          results[index] = [...cached];
          return;
        }
      }

      const bucket = pending.get(normalized);
      if (bucket) {
        bucket.push(index);
      } else {
        pending.set(normalized, [index]);
      }
    });

    if (pending.size === 0) {
      return results as number[][];
    }

    const uniqueTexts = Array.from(pending.keys());
    let cursor = 0;

    while (cursor < uniqueTexts.length) {
      if (abortSignal?.aborted) {
        throw new DOMException("Embedding generation aborted", "AbortError");
      }

      const batch = uniqueTexts.slice(cursor, cursor + batchSize);
      cursor += batch.length;

      await this.enforceRateLimit();

      const embeddings = await this.withRetry<number[][]>(
        { type: "batch", texts: batch },
        async () =>
          await this.engine.generateEmbeddingsBatch(batch, {
            batchSize,
            preferNano,
          }),
        batch.length,
      );

      if (!Array.isArray(embeddings) || embeddings.length !== batch.length) {
        throw new Error("Embedding engine returned mismatched batch results");
      }

      embeddings.forEach((embedding, localIndex) => {
        const textKey = batch[localIndex]!;
        const targetIndices = pending.get(textKey) ?? [];

        if (!Array.isArray(embedding) || embedding.length === 0) {
          throw new Error(
            "Embedding engine returned an invalid vector in batch",
          );
        }

        if (useCache) {
          this.cache.set(textKey, [...embedding]);
        }

        targetIndices.forEach((originalIndex) => {
          results[originalIndex] = [...embedding];
        });
      });
    }

    return results.map((value) => {
      if (!value) {
        throw new Error("Failed to resolve embedding for one or more inputs");
      }
      return value;
    });
  }

  chunkText(text: string, options: ChunkingOptions = {}): ChunkedText[] {
    const normalized = this.normalizeText(text);
    if (!normalized) {
      return [];
    }

    const chunkConfig: Required<ChunkingOptions> = {
      wordsPerChunk:
        options.wordsPerChunk ?? this.config.chunking.wordsPerChunk,
      overlapWords: options.overlapWords ?? this.config.chunking.overlapWords,
      respectSentences:
        options.respectSentences ?? this.config.chunking.respectSentences,
      respectParagraphs:
        options.respectParagraphs ?? this.config.chunking.respectParagraphs,
    };

    const allWords = this.countWords(normalized);
    const avgWordLength = allWords > 0 ? normalized.length / allWords : 5;
    const maxChunkSize = Math.max(
      200,
      Math.round(chunkConfig.wordsPerChunk * avgWordLength),
    );
    const overlapSize = Math.max(
      0,
      Math.round(chunkConfig.overlapWords * avgWordLength),
    );

    const chunkOptions: BackgroundChunkOptions = {
      maxChunkSize,
      overlapSize,
      respectSentences: chunkConfig.respectSentences,
      respectParagraphs: chunkConfig.respectParagraphs,
    };

    const rawChunks = this.chunker.chunkText(normalized, chunkOptions);

    if (rawChunks.length === 0) {
      return [];
    }

    const chunks: ChunkedText[] = rawChunks.map((chunk) => {
      const prefix = normalized.slice(0, chunk.startIndex);
      const wordStart = this.countWords(prefix);
      const wordCount = this.countWords(chunk.text);
      const wordEnd = wordStart + wordCount;

      return {
        ...chunk,
        wordStart,
        wordEnd,
        wordCount,
      };
    });

    return chunks;
  }

  clearCache(): void {
    this.cache.clear();
  }

  getCacheStats(): { size: number; capacity: number } {
    return {
      size: this.cache.size(),
      capacity: this.cache.capacityValue(),
    };
  }

  private normalizeText(text: string): string {
    if (typeof text !== "string") {
      return "";
    }
    return text.trim();
  }

  private countWords(text: string): number {
    if (!text.trim()) {
      return 0;
    }
    return text.trim().split(/\s+/).length;
  }

  private async enforceRateLimit(): Promise<void> {
    const maxRequests = this.config.maxRequestsPerInterval;
    const interval = this.config.rateLimitIntervalMs;

    if (!maxRequests || maxRequests <= 0) {
      return;
    }

    const now = this.nowFn();
    this.pruneRequestLog(now, interval);

    if (this.requestLog.length < maxRequests) {
      this.requestLog.push(now);
      return;
    }

    const earliest = this.requestLog[0]!;
    const waitMs = Math.max(0, interval - (now - earliest));
    this.logger.warn?.("EmbeddingGeneratorService", "Rate limit reached", {
      waitMs,
      maxRequests,
    });

    await this.waitFn(waitMs);

    const postWait = this.nowFn();
    this.pruneRequestLog(postWait, interval);
    this.requestLog.push(postWait);
  }

  private pruneRequestLog(now: number, interval: number): void {
    while (
      this.requestLog.length > 0 &&
      now - this.requestLog[0]! >= interval
    ) {
      this.requestLog.shift();
    }
  }

  private async withRetry<T>(
    context: RequestContext,
    operation: () => Promise<T>,
    textCount: number,
  ): Promise<T> {
    const maxRetries = Math.max(0, this.config.maxRetries);
    const instrumentation = this.config.instrumentation;
    const requestId = `${context.type}-${this.requestCounter++}`;
    let attempt = 0;
    let delay = this.config.retryDelayMs;

    while (true) {
      attempt++;
      const startTime = this.nowFn();
      instrumentation?.onRequestStart?.({
        id: requestId,
        attempt,
        requestType: context.type,
        timestamp: startTime,
        texts: context.texts,
      });

      try {
        const result = await operation();
        const duration = this.nowFn() - startTime;
        instrumentation?.onRequestSuccess?.({
          id: requestId,
          attempt,
          requestType: context.type,
          timestamp: startTime,
          durationMs: duration,
          textCount,
        });
        return result;
      } catch (error) {
        const duration = this.nowFn() - startTime;
        instrumentation?.onRequestError?.({
          id: requestId,
          attempt,
          requestType: context.type,
          timestamp: startTime,
          durationMs: duration,
          textCount,
          error,
        });

        if (attempt > maxRetries || !this.isRetryableError(error)) {
          throw error;
        }

        const nextDelay = Math.min(delay, this.config.maxRetryDelayMs);
        instrumentation?.onRetry?.({
          id: requestId,
          attempt,
          requestType: context.type,
          timestamp: startTime,
          durationMs: duration,
          textCount,
          error,
          nextDelayMs: nextDelay,
        });

        await this.waitFn(nextDelay);
        delay = Math.min(nextDelay * 2, this.config.maxRetryDelayMs);
      }
    }
  }

  private isRetryableError(error: unknown): boolean {
    if (error && typeof error === "object" && "retryable" in error) {
      return Boolean((error as any).retryable);
    }

    const message = (
      error instanceof Error ? error.message : String(error ?? "")
    )
      .toLowerCase()
      .trim();

    if (!message) {
      return true;
    }

    const retryableKeywords = [
      "rate limit",
      "quota",
      "network",
      "timeout",
      "temporarily",
      "429",
      "503",
      "504",
      "fetch",
      "unavailable",
    ];

    return retryableKeywords.some((keyword) => message.includes(keyword));
  }
}

export const embeddingGeneratorService = new EmbeddingGeneratorService();

export default embeddingGeneratorService;
