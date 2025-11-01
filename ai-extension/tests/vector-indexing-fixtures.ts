/**
 * Vector Indexing Test Fixtures
 *
 * Reusable fixtures and utilities for testing the RAG pipeline
 */

import type {
  CapturedContent,
  Embedding,
  Pocket,
} from "../src/background/indexeddb-manager.js";
import type { TextChunk } from "../src/background/text-chunker.js";

/**
 * Generate mock content for testing
 */
export function createMockContent(
  overrides?: Partial<CapturedContent>,
): CapturedContent {
  return {
    id: `content_${Date.now()}_${Math.random()}`,
    pocketId: "pocket_1",
    type: "text" as any,
    content: "This is sample content for testing embeddings and vector search.",
    metadata: {
      title: "Test Content",
      timestamp: Date.now(),
    },
    capturedAt: Date.now(),
    sourceUrl: "https://example.com/test",
    processingStatus: "completed" as any,
    ...overrides,
  };
}

/**
 * Generate mock large content for chunking tests
 */
export function createLargeContent(size: number = 5000): CapturedContent {
  const content = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. "
    .repeat(Math.ceil(size / 57))
    .slice(0, size);

  return createMockContent({ content });
}

/**
 * Generate mock pocket
 */
export function createMockPocket(overrides?: Partial<Pocket>): Pocket {
  return {
    id: `pocket_${Date.now()}`,
    name: "Test Pocket",
    description: "Test pocket description",
    tags: ["test", "mock"],
    color: "#ff0000",
    contentIds: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

/**
 * Generate mock embedding
 */
export function createMockEmbedding(
  contentId: string,
  dimension: number = 768,
  overrides?: Partial<Embedding>,
): Embedding {
  return {
    id: `emb_${Date.now()}_${Math.random()}`,
    contentId,
    vector: Array.from({ length: dimension }, () => Math.random()),
    model: "gemini",
    createdAt: Date.now(),
    ...overrides,
  };
}

/**
 * Generate normalized mock embedding (for similarity testing)
 */
export function createNormalizedEmbedding(
  contentId: string,
  dimension: number = 768,
): Embedding {
  const vector = Array.from({ length: dimension }, () => Math.random() - 0.5);
  const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
  const normalized = vector.map((val) => val / magnitude);

  return createMockEmbedding(contentId, dimension, { vector: normalized });
}

/**
 * Generate similar embeddings (for testing similarity search)
 */
export function createSimilarEmbeddings(
  count: number,
  dimension: number = 768,
  similarity: number = 0.9,
): Embedding[] {
  const base = createNormalizedEmbedding("base", dimension);
  const embeddings: Embedding[] = [base];

  for (let i = 1; i < count; i++) {
    // Create similar vector by mixing base vector with some noise
    const vector = base.vector.map(
      (val) => val * similarity + (Math.random() - 0.5) * (1 - similarity),
    );

    // Normalize
    const magnitude = Math.sqrt(
      vector.reduce((sum, val) => sum + val * val, 0),
    );
    const normalized = vector.map((val) => val / magnitude);

    embeddings.push(
      createMockEmbedding(`content_${i}`, dimension, { vector: normalized }),
    );
  }

  return embeddings;
}

/**
 * Generate mock text chunks
 */
export function createMockChunks(
  count: number,
  textLength: number = 500,
): TextChunk[] {
  const chunks: TextChunk[] = [];

  for (let i = 0; i < count; i++) {
    const text = `Chunk ${i}: ${"Lorem ipsum dolor sit amet. ".repeat(
      Math.ceil(textLength / 27),
    )}`.slice(0, textLength);

    chunks.push({
      id: `chunk_${i}`,
      text,
      startIndex: i * textLength,
      endIndex: (i + 1) * textLength,
      chunkIndex: i,
      totalChunks: count,
    });
  }

  return chunks;
}

/**
 * Mock embedding generator for testing
 */
export class MockEmbeddingGenerator {
  private callCount = 0;
  private embeddings: Map<string, number[]> = new Map();
  private shouldFail = false;
  private failAfterCalls = -1;
  private latency = 0;

  async generate(text: string, dimension: number = 768): Promise<number[]> {
    this.callCount++;

    // Simulate latency
    if (this.latency > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.latency));
    }

    // Simulate failure
    if (
      this.shouldFail ||
      (this.failAfterCalls > 0 && this.callCount > this.failAfterCalls)
    ) {
      throw new Error("Mock embedding generation failed");
    }

    // Return cached embedding if exists
    if (this.embeddings.has(text)) {
      return this.embeddings.get(text)!;
    }

    // Generate new embedding
    const embedding = Array.from({ length: dimension }, () => Math.random());
    this.embeddings.set(text, embedding);
    return embedding;
  }

  setLatency(ms: number): void {
    this.latency = ms;
  }

  setShouldFail(fail: boolean): void {
    this.shouldFail = fail;
  }

  setFailAfterCalls(count: number): void {
    this.failAfterCalls = count;
  }

  getCallCount(): number {
    return this.callCount;
  }

  reset(): void {
    this.callCount = 0;
    this.embeddings.clear();
    this.shouldFail = false;
    this.failAfterCalls = -1;
    this.latency = 0;
  }
}

/**
 * Wait for condition to be true
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeout: number = 5000,
  interval: number = 100,
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error(`Timeout waiting for condition after ${timeout}ms`);
}

/**
 * Mock message router for testing UI events
 */
export class MockMessageRouter {
  private messages: any[] = [];
  private listeners: Map<string, Function[]> = new Map();

  send(message: any): void {
    this.messages.push(message);
    const listeners = this.listeners.get(message.type) || [];
    listeners.forEach((listener) => listener(message));
  }

  on(type: string, listener: Function): void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    this.listeners.get(type)!.push(listener);
  }

  getMessages(type?: string): any[] {
    if (type) {
      return this.messages.filter((m) => m.type === type);
    }
    return this.messages;
  }

  clear(): void {
    this.messages = [];
    this.listeners.clear();
  }

  getMessageCount(type?: string): number {
    return this.getMessages(type).length;
  }
}

/**
 * Create mock rate limit error
 */
export function createRateLimitError(): Error {
  const error = new Error("Rate limit exceeded");
  (error as any).code = 429;
  return error;
}

/**
 * Calculate cosine similarity for testing
 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    throw new Error("Vectors must have same length");
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i]! * vecB[i]!;
    normA += vecA[i]! * vecA[i]!;
    normB += vecB[i]! * vecB[i]!;
  }

  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);

  if (normA === 0 || normB === 0) return 0;

  return dotProduct / (normA * normB);
}

/**
 * Assert embedding is valid
 */
export function assertValidEmbedding(
  embedding: Embedding,
  expectedDimension?: number,
): void {
  if (!embedding.id) {
    throw new Error("Embedding missing id");
  }
  if (!embedding.contentId) {
    throw new Error("Embedding missing contentId");
  }
  if (!Array.isArray(embedding.vector)) {
    throw new Error("Embedding vector is not an array");
  }
  if (embedding.vector.length === 0) {
    throw new Error("Embedding vector is empty");
  }
  if (expectedDimension && embedding.vector.length !== expectedDimension) {
    throw new Error(
      `Embedding dimension mismatch: expected ${expectedDimension}, got ${embedding.vector.length}`,
    );
  }
  if (embedding.vector.some((v) => typeof v !== "number" || isNaN(v))) {
    throw new Error("Embedding vector contains non-numeric or NaN values");
  }
}

/**
 * Mock IndexedDB operations
 */
export class MockIndexedDBManager {
  private contents: Map<string, CapturedContent> = new Map();
  private embeddings: Map<string, Embedding> = new Map();
  private pockets: Map<string, Pocket> = new Map();

  async init(): Promise<void> {
    // No-op for mock
  }

  async saveContent(content: CapturedContent): Promise<void> {
    this.contents.set(content.id, content);
  }

  async getContent(id: string): Promise<CapturedContent | undefined> {
    return this.contents.get(id);
  }

  async saveEmbedding(
    embedding: Omit<Embedding, "id" | "createdAt">,
  ): Promise<string> {
    const id = `emb_${Date.now()}_${Math.random()}`;
    const fullEmbedding: Embedding = {
      id,
      ...embedding,
      createdAt: Date.now(),
    };
    this.embeddings.set(id, fullEmbedding);
    return id;
  }

  async getAllEmbeddings(): Promise<Embedding[]> {
    return Array.from(this.embeddings.values());
  }

  async deleteEmbeddingByContentId(contentId: string): Promise<void> {
    const toDelete = Array.from(this.embeddings.entries())
      .filter(([_, emb]) => emb.contentId === contentId)
      .map(([id, _]) => id);

    for (const id of toDelete) {
      this.embeddings.delete(id);
    }
  }

  // Helper method for tests
  async deleteEmbedding(id: string): Promise<void> {
    this.embeddings.delete(id);
  }

  async getContentByPocket(pocketId: string): Promise<CapturedContent[]> {
    return Array.from(this.contents.values()).filter(
      (c) => c.pocketId === pocketId,
    );
  }

  async listPockets(): Promise<Pocket[]> {
    return Array.from(this.pockets.values());
  }

  async savePocket(pocket: Pocket): Promise<void> {
    this.pockets.set(pocket.id, pocket);
  }

  clear(): void {
    this.contents.clear();
    this.embeddings.clear();
    this.pockets.clear();
  }

  getEmbeddingCount(): number {
    return this.embeddings.size;
  }

  getContentCount(): number {
    return this.contents.size;
  }
}
