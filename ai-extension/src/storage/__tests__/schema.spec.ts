/**
 * IndexedDB Schema Tests
 *
 * Comprehensive unit tests for the schema module covering:
 * - Database initialization and versioning
 * - CRUD operations for all entity types
 * - Index queries
 * - Error handling
 * - Connection lifecycle
 * - Metadata and search index operations
 *
 * Uses fake-indexeddb for isolated testing
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  DatabaseManager,
  createDatabaseManager,
  DatabaseError,
  DatabaseErrorType,
  DB_CONFIG,
  STORE_NAMES,
} from "../schema.js";
import {
  ContentType,
  ProcessingStatus,
  type CapturedContent,
  type Pocket,
  type StoredChunk,
  type Embedding,
} from "../../background/indexeddb-manager.js";

// Mock the logger
vi.mock("../../background/monitoring.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe("IndexedDB Schema Module", () => {
  let dbManager: DatabaseManager;

  beforeEach(async () => {
    dbManager = createDatabaseManager();
    await dbManager.open();
  });

  afterEach(async () => {
    await dbManager.close();

    const dbs = await indexedDB.databases?.();
    if (dbs) {
      for (const dbInfo of dbs) {
        if (dbInfo.name === DB_CONFIG.name) {
          indexedDB.deleteDatabase(dbInfo.name);
        }
      }
    }
  });

  describe("Database Initialization", () => {
    it("should open database with correct name and version", async () => {
      const db = await dbManager.open();
      expect(db.name).toBe(DB_CONFIG.name);
      expect(db.version).toBe(DB_CONFIG.version);
    });

    it("should create all required object stores", async () => {
      const db = await dbManager.open();
      const storeNames = Array.from(db.objectStoreNames);

      expect(storeNames).toContain(STORE_NAMES.POCKETS);
      expect(storeNames).toContain(STORE_NAMES.CAPTURED_CONTENT);
      expect(storeNames).toContain(STORE_NAMES.METADATA);
      expect(storeNames).toContain(STORE_NAMES.CONVERSATIONS);
      expect(storeNames).toContain(STORE_NAMES.AI_RESPONSES);
      expect(storeNames).toContain(STORE_NAMES.EMBEDDINGS);
      expect(storeNames).toContain(STORE_NAMES.VECTOR_CHUNKS);
      expect(storeNames).toContain(STORE_NAMES.SEARCH_INDEX);
      expect(storeNames).toContain(STORE_NAMES.SYNC_QUEUE);
    });

    it("should reuse existing connection on subsequent opens", async () => {
      const db1 = await dbManager.open();
      const db2 = await dbManager.open();
      expect(db1).toBe(db2);
    });
  });

  describe("Error Handling", () => {
    it("should wrap DOMException QuotaExceededError", () => {
      const error = new DOMException("Quota exceeded", "QuotaExceededError");
      const wrapped = DatabaseError.wrap(error);

      expect(wrapped.type).toBe(DatabaseErrorType.QUOTA_EXCEEDED);
    });

    it("should wrap DOMException ConstraintError", () => {
      const error = new DOMException("Constraint violated", "ConstraintError");
      const wrapped = DatabaseError.wrap(error);

      expect(wrapped.type).toBe(DatabaseErrorType.CONSTRAINT_ERROR);
    });

    it("should wrap DOMException AbortError", () => {
      const error = new DOMException("Transaction aborted", "AbortError");
      const wrapped = DatabaseError.wrap(error);

      expect(wrapped.type).toBe(DatabaseErrorType.TRANSACTION_ERROR);
    });

    it("should return DatabaseError unchanged", () => {
      const error = new DatabaseError(
        DatabaseErrorType.DATABASE_ERROR,
        "Test error",
      );
      const wrapped = DatabaseError.wrap(error);

      expect(wrapped).toBe(error);
    });

    it("should wrap generic errors", () => {
      const error = new Error("Generic error");
      const wrapped = DatabaseError.wrap(error);

      expect(wrapped.type).toBe(DatabaseErrorType.UNKNOWN);
    });
  });

  describe("Connection Lifecycle", () => {
    it("should close database connection", async () => {
      await dbManager.open();
      await dbManager.close();

      const db = await dbManager.open();
      expect(db).toBeDefined();
    });

    it("should handle close when not open", async () => {
      await expect(dbManager.close()).resolves.not.toThrow();
    });

    it("should allow reopening after close", async () => {
      await dbManager.open();
      await dbManager.close();

      const db = await dbManager.open();
      expect(db.name).toBe(DB_CONFIG.name);
    });
  });

  describe("Content Operations", () => {
    const mockContent: Omit<CapturedContent, "id" | "capturedAt"> = {
      pocketId: "pocket-1",
      type: ContentType.TEXT,
      content: "Test content",
      metadata: {
        timestamp: Date.now(),
        title: "Test Content",
      },
      sourceUrl: "https://example.com",
      processingStatus: ProcessingStatus.COMPLETED,
    };

    it("should save content and return ID", async () => {
      const id = await dbManager.saveContent(mockContent);
      expect(id).toBeDefined();
      expect(typeof id).toBe("string");
    });

    it("should retrieve content by ID", async () => {
      const id = await dbManager.saveContent(mockContent);
      const content = await dbManager.getContent(id);

      expect(content).toBeDefined();
      expect(content?.id).toBe(id);
      expect(content?.pocketId).toBe(mockContent.pocketId);
      expect(content?.content).toBe(mockContent.content);
    });

    it("should return null for non-existent content", async () => {
      const content = await dbManager.getContent("non-existent-id");
      expect(content).toBeNull();
    });

    it("should update existing content", async () => {
      const id = await dbManager.saveContent(mockContent);

      await dbManager.updateContent(id, {
        content: "Updated content",
        metadata: { timestamp: Date.now(), title: "Updated" },
      });

      const updated = await dbManager.getContent(id);
      expect(updated?.content).toBe("Updated content");
      expect(updated?.metadata.title).toBe("Updated");
    });

    it("should throw error when updating non-existent content", async () => {
      await expect(
        dbManager.updateContent("non-existent", { content: "test" }),
      ).rejects.toThrow(DatabaseError);
    });

    it("should delete content", async () => {
      const id = await dbManager.saveContent(mockContent);
      await dbManager.deleteContent(id);

      const content = await dbManager.getContent(id);
      expect(content).toBeNull();
    });

    it("should get content by pocket ID", async () => {
      const id1 = await dbManager.saveContent({
        ...mockContent,
        pocketId: "pocket-1",
      });
      const id2 = await dbManager.saveContent({
        ...mockContent,
        pocketId: "pocket-1",
      });
      const id3 = await dbManager.saveContent({
        ...mockContent,
        pocketId: "pocket-2",
      });

      const pocket1Content = await dbManager.getContentByPocket("pocket-1");
      expect(pocket1Content).toHaveLength(2);
      expect(pocket1Content.map((c) => c.id)).toContain(id1);
      expect(pocket1Content.map((c) => c.id)).toContain(id2);
      expect(pocket1Content.map((c) => c.id)).not.toContain(id3);
    });

    it("should save metadata record alongside content", async () => {
      const contentWithMetadata = {
        ...mockContent,
        metadata: {
          timestamp: Date.now(),
          title: "Test",
          tags: ["tag1", "tag2"],
          category: "test-category",
        },
      };

      const id = await dbManager.saveContent(contentWithMetadata);
      const metadata = await dbManager.getMetadata(id);

      expect(metadata).toBeDefined();
      expect(metadata?.contentId).toBe(id);
      expect(metadata?.tags).toEqual(["tag1", "tag2"]);
      expect(metadata?.category).toBe("test-category");
    });
  });

  describe("Pocket Operations", () => {
    const mockPocket: Omit<Pocket, "id" | "createdAt" | "updatedAt"> = {
      name: "Test Pocket",
      description: "Test description",
      contentIds: [],
      tags: ["tag1", "tag2"],
      color: "#FF0000",
    };

    it("should save pocket and return ID", async () => {
      const id = await dbManager.savePocket(mockPocket);
      expect(id).toBeDefined();
      expect(typeof id).toBe("string");
    });

    it("should retrieve pocket by ID", async () => {
      const id = await dbManager.savePocket(mockPocket);
      const pocket = await dbManager.getPocket(id);

      expect(pocket).toBeDefined();
      expect(pocket?.id).toBe(id);
      expect(pocket?.name).toBe(mockPocket.name);
      expect(pocket?.contentIds).toEqual([]);
    });

    it("should return null for non-existent pocket", async () => {
      const pocket = await dbManager.getPocket("non-existent-id");
      expect(pocket).toBeNull();
    });

    it("should update existing pocket", async () => {
      const id = await dbManager.savePocket(mockPocket);

      await dbManager.updatePocket(id, {
        name: "Updated Pocket",
        description: "Updated description",
      });

      const updated = await dbManager.getPocket(id);
      expect(updated?.name).toBe("Updated Pocket");
      expect(updated?.description).toBe("Updated description");
    });

    it("should update updatedAt timestamp on update", async () => {
      const id = await dbManager.savePocket(mockPocket);
      const original = await dbManager.getPocket(id);

      await new Promise((resolve) => setTimeout(resolve, 10));

      await dbManager.updatePocket(id, { name: "Updated" });
      const updated = await dbManager.getPocket(id);

      expect(updated?.updatedAt).toBeGreaterThan(original!.updatedAt);
    });

    it("should throw error when updating non-existent pocket", async () => {
      await expect(
        dbManager.updatePocket("non-existent", { name: "test" }),
      ).rejects.toThrow(DatabaseError);
    });

    it("should delete pocket", async () => {
      const id = await dbManager.savePocket(mockPocket);
      await dbManager.deletePocket(id);

      const pocket = await dbManager.getPocket(id);
      expect(pocket).toBeNull();
    });

    it("should delete pocket and associated content", async () => {
      const pocketId = await dbManager.savePocket(mockPocket);

      const contentId = await dbManager.saveContent({
        pocketId,
        type: ContentType.TEXT,
        content: "Test",
        metadata: { timestamp: Date.now() },
        sourceUrl: "https://example.com",
        processingStatus: ProcessingStatus.COMPLETED,
      });

      await dbManager.deletePocket(pocketId);

      const pocket = await dbManager.getPocket(pocketId);
      const content = await dbManager.getContent(contentId);

      expect(pocket).toBeNull();
      expect(content).toBeNull();
    });

    it("should list all pockets", async () => {
      const id1 = await dbManager.savePocket(mockPocket);
      const id2 = await dbManager.savePocket({
        ...mockPocket,
        name: "Pocket 2",
      });

      const pockets = await dbManager.listPockets();

      expect(pockets).toHaveLength(2);
      expect(pockets.map((p) => p.id)).toContain(id1);
      expect(pockets.map((p) => p.id)).toContain(id2);
    });
  });

  describe("Chunk Operations", () => {
    const mockChunk: Omit<StoredChunk, "createdAt"> = {
      id: "chunk-1",
      contentId: "content-1",
      pocketId: "pocket-1",
      text: "Test chunk text",
      embedding: new Array(768).fill(0.1),
      metadata: {
        contentId: "content-1",
        pocketId: "pocket-1",
        sourceType: ContentType.TEXT,
        sourceUrl: "https://example.com",
        chunkIndex: 0,
        totalChunks: 1,
        startOffset: 0,
        endOffset: 100,
        capturedAt: Date.now(),
        chunkedAt: Date.now(),
        textPreview: "Test chunk",
      },
    };

    it("should save chunk and return ID", async () => {
      const id = await dbManager.saveChunk(mockChunk);
      expect(id).toBe(mockChunk.id);
    });

    it("should get chunks by content ID", async () => {
      await dbManager.saveChunk({
        ...mockChunk,
        id: "chunk-1",
        contentId: "content-1",
      });
      await dbManager.saveChunk({
        ...mockChunk,
        id: "chunk-2",
        contentId: "content-1",
      });
      await dbManager.saveChunk({
        ...mockChunk,
        id: "chunk-3",
        contentId: "content-2",
      });

      const chunks = await dbManager.getChunksByContent("content-1");

      expect(chunks).toHaveLength(2);
      expect(chunks.map((c) => c.id)).toContain("chunk-1");
      expect(chunks.map((c) => c.id)).toContain("chunk-2");
      expect(chunks.map((c) => c.id)).not.toContain("chunk-3");
    });

    it("should delete chunks by content ID", async () => {
      await dbManager.saveChunk({
        ...mockChunk,
        id: "chunk-1",
        contentId: "content-1",
      });
      await dbManager.saveChunk({
        ...mockChunk,
        id: "chunk-2",
        contentId: "content-1",
      });

      await dbManager.deleteChunksByContent("content-1");

      const chunks = await dbManager.getChunksByContent("content-1");
      expect(chunks).toHaveLength(0);
    });
  });

  describe("Embedding Operations", () => {
    const mockEmbedding: Omit<Embedding, "id" | "createdAt"> = {
      contentId: "content-1",
      vector: new Array(768).fill(0.1),
      model: "test-model",
    };

    it("should save embedding and return ID", async () => {
      const id = await dbManager.saveEmbedding(mockEmbedding);
      expect(id).toBeDefined();
      expect(typeof id).toBe("string");
    });

    it("should get embedding by content ID", async () => {
      await dbManager.saveEmbedding(mockEmbedding);
      const embedding = await dbManager.getEmbeddingByContentId("content-1");

      expect(embedding).toBeDefined();
      expect(embedding?.contentId).toBe("content-1");
      expect(embedding?.model).toBe("test-model");
    });

    it("should return null for non-existent embedding", async () => {
      const embedding =
        await dbManager.getEmbeddingByContentId("non-existent");
      expect(embedding).toBeNull();
    });

    it("should update embedding if already exists (upsert)", async () => {
      const id1 = await dbManager.saveEmbedding(mockEmbedding);
      const id2 = await dbManager.saveEmbedding({
        ...mockEmbedding,
        vector: new Array(768).fill(0.2),
        model: "updated-model",
      });

      expect(id2).toBe(id1);

      const embedding = await dbManager.getEmbeddingByContentId("content-1");
      expect(embedding?.model).toBe("updated-model");
      expect(embedding?.vector[0]).toBe(0.2);
    });

    it("should delete embedding by content ID", async () => {
      await dbManager.saveEmbedding(mockEmbedding);
      await dbManager.deleteEmbeddingByContentId("content-1");

      const embedding = await dbManager.getEmbeddingByContentId("content-1");
      expect(embedding).toBeNull();
    });
  });

  describe("Metadata Operations", () => {
    it("should retrieve metadata by content ID", async () => {
      const contentId = await dbManager.saveContent({
        pocketId: "pocket-1",
        type: ContentType.TEXT,
        content: "Test",
        metadata: {
          timestamp: Date.now(),
          title: "Test",
          tags: ["tag1"],
          category: "test",
        },
        sourceUrl: "https://example.com",
        processingStatus: ProcessingStatus.COMPLETED,
      });

      const metadata = await dbManager.getMetadata(contentId);

      expect(metadata).toBeDefined();
      expect(metadata?.contentId).toBe(contentId);
      expect(metadata?.tags).toEqual(["tag1"]);
      expect(metadata?.category).toBe("test");
    });

    it("should query metadata by tag", async () => {
      await dbManager.saveContent({
        pocketId: "pocket-1",
        type: ContentType.TEXT,
        content: "Content 1",
        metadata: {
          timestamp: Date.now(),
          tags: ["important", "work"],
        },
        sourceUrl: "https://example.com",
        processingStatus: ProcessingStatus.COMPLETED,
      });

      await dbManager.saveContent({
        pocketId: "pocket-1",
        type: ContentType.TEXT,
        content: "Content 2",
        metadata: {
          timestamp: Date.now(),
          tags: ["important", "personal"],
        },
        sourceUrl: "https://example.com",
        processingStatus: ProcessingStatus.COMPLETED,
      });

      await dbManager.saveContent({
        pocketId: "pocket-1",
        type: ContentType.TEXT,
        content: "Content 3",
        metadata: {
          timestamp: Date.now(),
          tags: ["personal"],
        },
        sourceUrl: "https://example.com",
        processingStatus: ProcessingStatus.COMPLETED,
      });

      const importantMetadata =
        await dbManager.queryMetadataByTag("important");
      expect(importantMetadata).toHaveLength(2);

      const personalMetadata = await dbManager.queryMetadataByTag("personal");
      expect(personalMetadata).toHaveLength(2);
    });
  });

  describe("Search Index Operations", () => {
    it("should replace search index entries", async () => {
      const contentId = "content-1";
      const entries = [
        {
          pocketId: "pocket-1",
          term: "test",
          weight: 1.0,
        },
        {
          pocketId: "pocket-1",
          term: "search",
          weight: 0.8,
        },
      ];

      await dbManager.replaceSearchIndex(contentId, entries);

      const results = await dbManager.search("test");
      expect(results).toHaveLength(1);
      expect(results[0].term).toBe("test");
      expect(results[0].contentId).toBe(contentId);
    });

    it("should search by term", async () => {
      await dbManager.replaceSearchIndex("content-1", [
        { pocketId: "pocket-1", term: "javascript", weight: 1.0 },
        { pocketId: "pocket-1", term: "typescript", weight: 0.9 },
      ]);

      await dbManager.replaceSearchIndex("content-2", [
        { pocketId: "pocket-1", term: "javascript", weight: 0.8 },
        { pocketId: "pocket-1", term: "python", weight: 1.0 },
      ]);

      const jsResults = await dbManager.search("javascript");
      expect(jsResults).toHaveLength(2);

      const pythonResults = await dbManager.search("python");
      expect(pythonResults).toHaveLength(1);
    });

    it("should filter search by pocket ID", async () => {
      await dbManager.replaceSearchIndex("content-1", [
        { pocketId: "pocket-1", term: "test", weight: 1.0 },
      ]);

      await dbManager.replaceSearchIndex("content-2", [
        { pocketId: "pocket-2", term: "test", weight: 1.0 },
      ]);

      const pocket1Results = await dbManager.search("test", {
        pocketId: "pocket-1",
      });
      expect(pocket1Results).toHaveLength(1);
      expect(pocket1Results[0].pocketId).toBe("pocket-1");
    });

    it("should normalize search terms to lowercase", async () => {
      await dbManager.replaceSearchIndex("content-1", [
        { pocketId: "pocket-1", term: "JavaScript", weight: 1.0 },
      ]);

      const results = await dbManager.search("javascript");
      expect(results).toHaveLength(1);

      const uppercaseResults = await dbManager.search("JAVASCRIPT");
      expect(uppercaseResults).toHaveLength(1);
    });

    it("should replace existing entries on update", async () => {
      await dbManager.replaceSearchIndex("content-1", [
        { pocketId: "pocket-1", term: "old", weight: 1.0 },
      ]);

      let results = await dbManager.search("old");
      expect(results).toHaveLength(1);

      await dbManager.replaceSearchIndex("content-1", [
        { pocketId: "pocket-1", term: "new", weight: 1.0 },
      ]);

      results = await dbManager.search("old");
      expect(results).toHaveLength(0);

      results = await dbManager.search("new");
      expect(results).toHaveLength(1);
    });
  });

  describe("Integration Tests", () => {
    it("should handle complete workflow: pocket -> content -> chunks -> embeddings -> search", async () => {
      const pocketId = await dbManager.savePocket({
        name: "Integration Test",
        description: "Full workflow test",
        contentIds: [],
        tags: ["test"],
        color: "#00FF00",
      });

      const contentId = await dbManager.saveContent({
        pocketId,
        type: ContentType.TEXT,
        content: "Integration test content",
        metadata: {
          timestamp: Date.now(),
          title: "Integration",
          tags: ["important"],
        },
        sourceUrl: "https://example.com",
        processingStatus: ProcessingStatus.COMPLETED,
      });

      await dbManager.saveChunk({
        id: "chunk-1",
        contentId,
        pocketId,
        text: "Chunk 1",
        embedding: new Array(768).fill(0.1),
        metadata: {
          contentId,
          pocketId,
          sourceType: ContentType.TEXT,
          sourceUrl: "https://example.com",
          chunkIndex: 0,
          totalChunks: 2,
          startOffset: 0,
          endOffset: 50,
          capturedAt: Date.now(),
          chunkedAt: Date.now(),
          textPreview: "Chunk 1",
        },
      });

      await dbManager.saveEmbedding({
        contentId,
        vector: new Array(768).fill(0.1),
        model: "test-model",
      });

      await dbManager.replaceSearchIndex(contentId, [
        { pocketId, term: "integration", weight: 1.0 },
        { pocketId, term: "test", weight: 0.9 },
      ]);

      const pocket = await dbManager.getPocket(pocketId);
      const content = await dbManager.getContent(contentId);
      const chunks = await dbManager.getChunksByContent(contentId);
      const embedding = await dbManager.getEmbeddingByContentId(contentId);
      const metadata = await dbManager.getMetadata(contentId);
      const searchResults = await dbManager.search("integration");

      expect(pocket).toBeDefined();
      expect(content).toBeDefined();
      expect(chunks).toHaveLength(1);
      expect(embedding).toBeDefined();
      expect(metadata).toBeDefined();
      expect(searchResults).toHaveLength(1);
    });

    it("should handle concurrent operations", async () => {
      const pocketId = await dbManager.savePocket({
        name: "Concurrent Test",
        description: "Test",
        contentIds: [],
        tags: [],
        color: "#000",
      });

      const promises = Array.from({ length: 10 }, (_, i) =>
        dbManager.saveContent({
          pocketId,
          type: ContentType.TEXT,
          content: `Content ${i}`,
          metadata: { timestamp: Date.now() },
          sourceUrl: "https://example.com",
          processingStatus: ProcessingStatus.COMPLETED,
        }),
      );

      const ids = await Promise.all(promises);
      expect(ids).toHaveLength(10);
      expect(new Set(ids).size).toBe(10);

      const contents = await dbManager.getContentByPocket(pocketId);
      expect(contents).toHaveLength(10);
    });
  });

  describe("Factory Function", () => {
    it("should create DatabaseManager instance", () => {
      const manager = createDatabaseManager();
      expect(manager).toBeInstanceOf(DatabaseManager);
    });

    it("should create independent instances", async () => {
      const manager1 = createDatabaseManager();
      const manager2 = createDatabaseManager();

      expect(manager1).not.toBe(manager2);

      await manager1.open();
      await manager2.open();

      await manager1.close();
      await manager2.close();
    });
  });
});
