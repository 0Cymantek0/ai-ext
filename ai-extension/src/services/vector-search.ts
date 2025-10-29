/**
 * Vector Search Service
 *
 * Provides semantic search utilities backed by the IndexedDB vector stores and
 * the new tiered storage pipeline. The service mirrors the behaviour of the
 * background vector search module but exposes a dependency-injected, testable
 * implementation that can be consumed from UI surfaces.
 */

import type {
  Pocket,
  CapturedContent,
  Embedding,
  StoredChunk,
} from "../background/indexeddb-manager.js";
import type { ChunkMetadata } from "../background/vector-chunk-types.js";
import type { SearchResult } from "../shared/types/index.d.ts";

/**
 * Lightweight logger abstraction so callers can supply structured loggers
 * without forcing this module to depend on the background monitoring service.
 */
export interface LoggerLike {
  debug?: (...args: unknown[]) => void;
  info?: (...args: unknown[]) => void;
  warn?: (...args: unknown[]) => void;
  error?: (...args: unknown[]) => void;
}

const defaultLogger: LoggerLike =
  typeof console !== "undefined"
    ? {
        debug: console.debug?.bind(console),
        info: console.info?.bind(console),
        warn: console.warn?.bind(console),
        error: console.error?.bind(console),
      }
    : {};

/**
 * Minimal database manager contract required by the vector search engine.
 * Mirrors the subset of {@link IndexedDBManager} that the service uses.
 */
export interface DatabaseManagerLike {
  listPockets(): Promise<Pocket[]>;
  getPocket(id: string): Promise<Pocket | null>;
  getContent(id: string): Promise<CapturedContent | null>;
  getContentByPocket(pocketId: string): Promise<CapturedContent[]>;
  getChunksByPocket(pocketId: string): Promise<StoredChunk[]>;
  getAllChunks?(): Promise<StoredChunk[]>;
  getEmbeddingByContentId?(contentId: string): Promise<Embedding | null>;
  saveEmbedding?(embedding: {
    contentId: string;
    vector: number[];
    model: string;
  }): Promise<unknown>;
}

export interface EmbeddingGenerator {
  (text: string): Promise<number[]>;
}

export type SearchScope = "pockets" | "pocket-contents" | "all-pockets";

export interface SearchMetricsEvent {
  query: string;
  scope: SearchScope;
  durationMs: number;
  candidateCount: number;
  resultCount: number;
  fallback: "none" | "keyword" | "empty";
}

export interface SearchMetricsRecorder {
  recordSearch(event: SearchMetricsEvent): void;
}

export interface VectorSearchDependencies {
  database: DatabaseManagerLike;
  embeddingGenerator: EmbeddingGenerator;
  logger?: LoggerLike;
  metrics?: SearchMetricsRecorder;
}

export interface VectorSearchConfig {
  /** Maximum number of cached query embeddings. Defaults to 64. */
  queryCacheSize?: number;
  /** Maximum number of cached document/pocket embeddings. Defaults to 256. */
  documentCacheSize?: number;
  /** Default relevance threshold when one is not supplied. Defaults to 0.32. */
  defaultMinRelevance?: number;
  /** Default result limit when not provided. Defaults to 20. */
  defaultLimit?: number;
}

export interface BaseSearchOptions {
  limit?: number;
  minRelevance?: number;
  /** When true (default) deduplicates results by contentId keeping the best match. */
  dedupeByContentId?: boolean;
}

export interface PocketSearchOptions extends BaseSearchOptions {
  pocketIds?: string[];
}

export interface ContentSearchOptions extends BaseSearchOptions {
  pocketIds?: string[];
}

export interface VectorChunkMatch {
  id: string;
  text: string;
  metadata: ChunkMetadata;
}

export interface VectorContentMatch {
  contentId: string;
  pocketId: string;
  pocket?: Pocket;
  content?: CapturedContent;
  chunk?: VectorChunkMatch;
}

export interface SearchEngine<TItem, TOptions extends BaseSearchOptions> {
  search(query: string, options?: TOptions): Promise<SearchResult<TItem>[]>;
}

export interface VectorSearchService {
  searchPockets(
    query: string,
    options?: PocketSearchOptions,
  ): Promise<SearchResult<Pocket>[]>;
  searchPocketContents(
    pocketId: string,
    query: string,
    options?: ContentSearchOptions,
  ): Promise<SearchResult<VectorContentMatch>[]>;
  searchAllPockets(
    query: string,
    options?: ContentSearchOptions,
  ): Promise<SearchResult<VectorContentMatch>[]>;
  clearCaches(): void;
}

/**
 * Simple LRU cache implementation backed by Map iteration order.
 */
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
}

/**
 * Compute cosine similarity between two vectors.
 */
export function cosineSimilarity(vecA: readonly number[], vecB: readonly number[]): number {
  if (vecA.length !== vecB.length) {
    throw new Error("Vectors must have the same length");
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    const a = vecA[i]!;
    const b = vecB[i]!;
    dot += a * b;
    normA += a * a;
    normB += b * b;
  }
  if (normA === 0 || normB === 0) {
    return 0;
  }
  return dot / Math.sqrt(normA * normB);
}

function normalizeQuery(query: string): string {
  return query.trim();
}

function buildPocketSearchText(pocket: Pocket): string {
  const buffer: string[] = [pocket.name, pocket.description];
  if (Array.isArray(pocket.tags)) {
    buffer.push(pocket.tags.join(" "));
  }
  return buffer.join(" ");
}

function extractContentText(content: CapturedContent): string {
  if (typeof content.content === "string" && content.content.trim().length > 0) {
    return content.content;
  }
  const metadata = content.metadata ?? ({} as CapturedContent["metadata"]);
  const candidates = [
    metadata.summary,
    metadata.excerpt,
    metadata.preview,
    metadata.fallbackPreview,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate;
    }
  }
  return "";
}

function toChunkMatch(chunk: StoredChunk): VectorChunkMatch {
  const metadata = chunk.metadata as ChunkMetadata;
  return {
    id: chunk.id,
    text: chunk.text,
    metadata,
  };
}

function limitResults<T>(results: T[], limit: number | undefined, fallback: number): T[] {
  const resolvedLimit = limit ?? fallback;
  if (resolvedLimit <= 0) {
    return [];
  }
  return results.slice(0, resolvedLimit);
}

export class TieredVectorSearchService
  implements
    VectorSearchService,
    SearchEngine<VectorContentMatch, ContentSearchOptions>
{
  private readonly database: DatabaseManagerLike;
  private readonly embeddingGenerator: EmbeddingGenerator;
  private readonly logger: LoggerLike;
  private readonly metrics?: SearchMetricsRecorder;
  private readonly config: Required<VectorSearchConfig>;

  private readonly queryCache: LRUCache<string, number[]>;
  private readonly documentCache: LRUCache<string, number[]>;

  constructor(
    dependencies: VectorSearchDependencies,
    config: VectorSearchConfig = {},
  ) {
    if (!dependencies?.database) {
      throw new Error("Vector search service requires a database dependency.");
    }
    if (!dependencies?.embeddingGenerator) {
      throw new Error("Vector search service requires an embedding generator.");
    }
    this.database = dependencies.database;
    this.embeddingGenerator = dependencies.embeddingGenerator;
    this.logger = dependencies.logger ?? defaultLogger;
    this.metrics = dependencies.metrics;

    this.config = {
      queryCacheSize: config.queryCacheSize ?? 64,
      documentCacheSize: config.documentCacheSize ?? 256,
      defaultMinRelevance: config.defaultMinRelevance ?? 0.32,
      defaultLimit: config.defaultLimit ?? 20,
    };

    this.queryCache = new LRUCache(this.config.queryCacheSize);
    this.documentCache = new LRUCache(this.config.documentCacheSize);

    this.searchPockets = this.searchPockets.bind(this);
    this.searchPocketContents = this.searchPocketContents.bind(this);
    this.searchAllPockets = this.searchAllPockets.bind(this);
  }

  async search(
    query: string,
    options?: ContentSearchOptions,
  ): Promise<SearchResult<VectorContentMatch>[]> {
    return this.searchAllPockets(query, options);
  }

  async searchPockets(
    query: string,
    options: PocketSearchOptions = {},
  ): Promise<SearchResult<Pocket>[]> {
    const normalizedQuery = normalizeQuery(query);
    if (!normalizedQuery) {
      return [];
    }

    const start = Date.now();
    let fallback: "none" | "keyword" | "empty" = "none";

    try {
      const pockets = await this.resolvePockets(options.pocketIds);
      if (pockets.length === 0) {
        return [];
      }

      const queryEmbedding = await this.getQueryEmbedding(normalizedQuery);
      const minRelevance = options.minRelevance ?? this.config.defaultMinRelevance;

      const results: SearchResult<Pocket>[] = [];
      for (const pocket of pockets) {
        const embedding = await this.getDocumentEmbedding(
          `pocket:${pocket.id}`,
          buildPocketSearchText(pocket),
        );
        if (embedding.length !== queryEmbedding.length) {
          continue;
        }
        const score = cosineSimilarity(queryEmbedding, embedding);
        if (score >= minRelevance) {
          results.push({
            item: pocket,
            relevanceScore: score,
            matchedFields: ["semantic"],
          });
        }
      }

      if (results.length > 0) {
        const limited = limitResults(
          results.sort((a, b) => b.relevanceScore - a.relevanceScore),
          options.limit,
          this.config.defaultLimit,
        );
        this.recordMetrics(normalizedQuery, "pockets", pockets.length, limited.length, fallback, start);
        return limited;
      }

      fallback = "keyword";
      const keywordResults = this.keywordSearchPockets(pockets, normalizedQuery);
      const limitedKeyword = limitResults(
        keywordResults,
        options.limit,
        this.config.defaultLimit,
      );
      this.recordMetrics(
        normalizedQuery,
        "pockets",
        pockets.length,
        limitedKeyword.length,
        fallback,
        start,
      );
      return limitedKeyword;
    } catch (error) {
      fallback = "keyword";
      this.logger.warn?.("VectorSearchService", "Pocket search falling back", {
        error,
      });
      const pockets = await this.resolvePockets(options.pocketIds);
      const keywordResults = this.keywordSearchPockets(pockets, normalizedQuery);
      const limitedKeyword = limitResults(
        keywordResults,
        options.limit,
        this.config.defaultLimit,
      );
      this.recordMetrics(
        normalizedQuery,
        "pockets",
        pockets.length,
        limitedKeyword.length,
        fallback,
        start,
      );
      return limitedKeyword;
    }
  }

  async searchPocketContents(
    pocketId: string,
    query: string,
    options: ContentSearchOptions = {},
  ): Promise<SearchResult<VectorContentMatch>[]> {
    if (!pocketId) {
      return [];
    }
    return this.searchAcrossPockets(query, {
      ...options,
      pocketIds: [pocketId],
    });
  }

  async searchAllPockets(
    query: string,
    options: ContentSearchOptions = {},
  ): Promise<SearchResult<VectorContentMatch>[]> {
    return this.searchAcrossPockets(query, options);
  }

  clearCaches(): void {
    this.queryCache.clear();
    this.documentCache.clear();
  }

  private async searchAcrossPockets(
    query: string,
    options: ContentSearchOptions,
  ): Promise<SearchResult<VectorContentMatch>[]> {
    const normalizedQuery = normalizeQuery(query);
    if (!normalizedQuery) {
      return [];
    }

    const start = Date.now();
    let fallback: "none" | "keyword" | "empty" = "none";

    const pockets = await this.resolvePockets(options.pocketIds);
    if (pockets.length === 0) {
      this.recordMetrics(normalizedQuery, this.resolveScope(options), 0, 0, "empty", start);
      return [];
    }
    const pocketMap = new Map(pockets.map((pocket) => [pocket.id, pocket] as const));

    const contents = await this.fetchContents(pockets);
    const contentMap = new Map(contents.map((content) => [content.id, content] as const));

    try {
      const chunks = await this.fetchChunks(pockets, options.pocketIds);
      const vectorResults = await this.vectorSearchChunks(
        normalizedQuery,
        chunks,
        pocketMap,
        contentMap,
        options,
      );

      if (vectorResults.length > 0) {
        const limited = limitResults(
          vectorResults,
          options.limit,
          this.config.defaultLimit,
        );
        this.recordMetrics(
          normalizedQuery,
          this.resolveScope(options),
          chunks.length,
          limited.length,
          fallback,
          start,
        );
        return limited;
      }

      fallback = "keyword";
    } catch (error) {
      fallback = "keyword";
      this.logger.warn?.("VectorSearchService", "Content search fallback", {
        error,
      });
    }

    const keywordResults = this.keywordSearchContents(
      Array.from(contentMap.values()),
      normalizedQuery,
      pocketMap,
    );
    const limitedKeyword = limitResults(
      keywordResults,
      options.limit,
      this.config.defaultLimit,
    );
    this.recordMetrics(
      normalizedQuery,
      this.resolveScope(options),
      contentMap.size,
      limitedKeyword.length,
      fallback,
      start,
    );
    return limitedKeyword;
  }

  private async vectorSearchChunks(
    query: string,
    chunks: StoredChunk[],
    pocketMap: Map<string, Pocket>,
    contentMap: Map<string, CapturedContent>,
    options: ContentSearchOptions,
  ): Promise<SearchResult<VectorContentMatch>[]> {
    if (chunks.length === 0) {
      return [];
    }

    const queryEmbedding = await this.getQueryEmbedding(query);
    const minRelevance = options.minRelevance ?? this.config.defaultMinRelevance;
    const dedupe = options.dedupeByContentId ?? true;

    const bestByContent = new Map<string, SearchResult<VectorContentMatch>>();
    const results: SearchResult<VectorContentMatch>[] = [];

    for (const chunk of chunks) {
      if (chunk.embedding.length !== queryEmbedding.length) {
        continue;
      }
      const similarity = cosineSimilarity(queryEmbedding, chunk.embedding);
      if (similarity < minRelevance) {
        continue;
      }

      const pocket = pocketMap.get(chunk.pocketId);
      const content = contentMap.get(chunk.contentId);
      const match: VectorContentMatch = {
        contentId: chunk.contentId,
        pocketId: chunk.pocketId,
        ...(pocket ? { pocket } : {}),
        ...(content ? { content } : {}),
        chunk: toChunkMatch(chunk),
      };
      const candidate: SearchResult<VectorContentMatch> = {
        item: match,
        relevanceScore: similarity,
        matchedFields: ["semantic"],
      };

      if (dedupe) {
        const existing = bestByContent.get(chunk.contentId);
        if (!existing || similarity > existing.relevanceScore) {
          bestByContent.set(chunk.contentId, candidate);
        }
      } else {
        results.push(candidate);
      }
    }

    if (dedupe) {
      results.push(...bestByContent.values());
    }

    return results.sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  private keywordSearchPockets(
    pockets: Pocket[],
    query: string,
  ): SearchResult<Pocket>[] {
    const lowered = query.toLowerCase();
    const ranked: SearchResult<Pocket>[] = [];

    for (const pocket of pockets) {
      const matchedFields: string[] = [];
      let score = 0;

      if (pocket.name.toLowerCase().includes(lowered)) {
        score += 0.5;
        matchedFields.push("name");
      }

      if (pocket.description.toLowerCase().includes(lowered)) {
        score += 0.3;
        matchedFields.push("description");
      }

      const matchingTags = pocket.tags.filter((tag) =>
        tag.toLowerCase().includes(lowered),
      );
      if (matchingTags.length > 0) {
        score += 0.2 * (matchingTags.length / pocket.tags.length || 1);
        matchedFields.push("tags");
      }

      if (score > 0) {
        ranked.push({
          item: pocket,
          relevanceScore: score,
          matchedFields,
        });
      }
    }

    return ranked.sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  private keywordSearchContents(
    contents: CapturedContent[],
    query: string,
    pocketMap: Map<string, Pocket>,
  ): SearchResult<VectorContentMatch>[] {
    const lowered = query.toLowerCase();
    const results: SearchResult<VectorContentMatch>[] = [];

    for (const content of contents) {
      const matchedFields: string[] = [];
      let score = 0;
      const metadata = content.metadata ?? ({} as CapturedContent["metadata"]);

      const title = metadata.title?.toLowerCase();
      if (title && title.includes(lowered)) {
        score += 0.4;
        matchedFields.push("title");
      }

      const bodyText = extractContentText(content).toLowerCase();
      if (bodyText.includes(lowered)) {
        score += 0.4;
        matchedFields.push("content");
      }

      const sourceUrl = content.sourceUrl?.toLowerCase();
      if (sourceUrl && sourceUrl.includes(lowered)) {
        score += 0.1;
        matchedFields.push("sourceUrl");
      }

      const type = content.type?.toLowerCase();
      if (type && type.includes(lowered)) {
        score += 0.1;
        matchedFields.push("type");
      }

      if (score > 0) {
        const pocket = pocketMap.get(content.pocketId);
        const match: VectorContentMatch = {
          contentId: content.id,
          pocketId: content.pocketId,
          content,
          ...(pocket ? { pocket } : {}),
        };
        results.push({
          item: match,
          relevanceScore: score,
          matchedFields,
        });
      }
    }

    return results.sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  private async resolvePockets(pocketIds?: string[]): Promise<Pocket[]> {
    const allPockets = await this.database.listPockets();
    if (!pocketIds || pocketIds.length === 0) {
      return allPockets;
    }
    const ids = new Set(pocketIds);
    return allPockets.filter((pocket) => ids.has(pocket.id));
  }

  private async fetchContents(pockets: Pocket[]): Promise<CapturedContent[]> {
    const contents: CapturedContent[][] = await Promise.all(
      pockets.map((pocket) => this.database.getContentByPocket(pocket.id)),
    );
    return contents.flat();
  }

  private async fetchChunks(
    pockets: Pocket[],
    requestedPocketIds?: string[],
  ): Promise<StoredChunk[]> {
    if (requestedPocketIds && requestedPocketIds.length === 1) {
      return await this.database.getChunksByPocket(requestedPocketIds[0]!);
    }

    if (!requestedPocketIds || requestedPocketIds.length === 0) {
      if (typeof this.database.getAllChunks === "function") {
        return await this.database.getAllChunks();
      }
      const chunksByPocket = await Promise.all(
        pockets.map((pocket) => this.database.getChunksByPocket(pocket.id)),
      );
      return chunksByPocket.flat();
    }

    const uniqueIds = Array.from(new Set(requestedPocketIds));
    const chunksByPocket = await Promise.all(
      uniqueIds.map((id) => this.database.getChunksByPocket(id)),
    );
    return chunksByPocket.flat();
  }

  private async getQueryEmbedding(query: string): Promise<number[]> {
    const cached = this.queryCache.get(query);
    if (cached) {
      return cached;
    }
    const vector = await this.embeddingGenerator(query);
    const cloned = vector.slice();
    this.queryCache.set(query, cloned);
    return cloned;
  }

  private async getDocumentEmbedding(key: string, text: string): Promise<number[]> {
    const cached = this.documentCache.get(key);
    if (cached) {
      return cached;
    }
    const embedding = await this.embeddingGenerator(text);
    const cloned = embedding.slice();
    this.documentCache.set(key, cloned);
    return cloned;
  }

  private resolveScope(options: ContentSearchOptions): SearchScope {
    if (options.pocketIds && options.pocketIds.length === 1) {
      return "pocket-contents";
    }
    return "all-pockets";
  }

  private recordMetrics(
    query: string,
    scope: SearchScope,
    candidateCount: number,
    resultCount: number,
    fallback: "none" | "keyword" | "empty",
    startedAt: number,
  ): void {
    if (!this.metrics) {
      return;
    }
    const durationMs = Date.now() - startedAt;
    this.metrics.recordSearch({
      query,
      scope,
      durationMs,
      candidateCount,
      resultCount,
      fallback,
    });
  }
}

export function createVectorSearchService(
  dependencies: VectorSearchDependencies,
  config?: VectorSearchConfig,
): TieredVectorSearchService {
  return new TieredVectorSearchService(dependencies, config);
}

let sharedService: TieredVectorSearchService | null = null;
let sharedPromise: Promise<TieredVectorSearchService> | null = null;

async function resolveSharedService(): Promise<TieredVectorSearchService> {
  if (sharedService) {
    return sharedService;
  }
  if (!sharedPromise) {
    sharedPromise = Promise.all([
      import("../background/indexeddb-manager.js"),
      import("../background/embedding-engine.js"),
    ]).then(([{ indexedDBManager }, { embeddingEngine }]) => {
      const service = new TieredVectorSearchService({
        database: indexedDBManager,
        embeddingGenerator: (text) => embeddingEngine.generateEmbedding(text),
        logger: defaultLogger,
      });
      sharedService = service;
      return service;
    });
  }
  return sharedPromise;
}

export async function vectorSearchAllPockets(
  query: string,
  options?: ContentSearchOptions,
): Promise<SearchResult<VectorContentMatch>[]> {
  const service = await resolveSharedService();
  return service.searchAllPockets(query, options);
}

export function configureVectorSearchService(
  dependencies: VectorSearchDependencies,
  config?: VectorSearchConfig,
): TieredVectorSearchService {
  sharedService = new TieredVectorSearchService(dependencies, config);
  sharedPromise = Promise.resolve(sharedService);
  return sharedService;
}

export function resetVectorSearchService(): void {
  sharedService = null;
  sharedPromise = null;
}
