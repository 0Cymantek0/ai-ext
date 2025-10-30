/**
 * IndexedDB Schema Module
 *
 * Provides a centralized definition of the AI Pocket IndexedDB schema along with
 * a typed DatabaseManager implementation that satisfies the StorageManager
 * contract. The module encapsulates database configuration, versioned upgrade
 * handling, and CRUD helpers while remaining compatible with the legacy
 * `indexeddb-manager.ts` implementation.
 *
 * Migration strategy:
 * - Reuses the existing database name (`ai-pocket-db`) and introduces version 3.
 * - Version 1 matches the original schema shipped with the extension.
 * - Version 2 added the `vectorChunks` object store for chunk-level RAG support.
 * - Version 3 adds dedicated `metadata` and `searchIndex` stores plus secondary
 *   indexes to accelerate tag lookups and search workflows. Upgrades run
 *   in-place without data loss.
 */

import {
  openDB,
  type DBSchema,
  type IDBPDatabase,
  type IDBPTransaction,
  type IDBPObjectStore,
} from "idb";
import { logger } from "../background/monitoring.js";
import type {
  Pocket,
  CapturedContent,
  Conversation,
  AIResponse,
  Embedding,
  StoredChunk,
  SyncQueueItem,
  ContentMetadata,
} from "../background/indexeddb-manager.js";
import type {
  DatabaseManager as StorageDatabaseContract,
} from "../services/storage-manager.js";

const DB_NAME = "ai-pocket-db";
const DB_VERSION = 3;

/**
 * Object store names used throughout the database schema.
 */
export const STORE_NAMES = {
  POCKETS: "pockets",
  CAPTURED_CONTENT: "capturedContent",
  METADATA: "metadata",
  CONVERSATIONS: "conversations",
  AI_RESPONSES: "aiResponses",
  EMBEDDINGS: "embeddings",
  VECTOR_CHUNKS: "vectorChunks",
  SEARCH_INDEX: "searchIndex",
  SYNC_QUEUE: "syncQueue",
} as const;

export type StoreName = (typeof STORE_NAMES)[keyof typeof STORE_NAMES];

interface StoreIndexConfig {
  name: string;
  keyPath: string | string[];
  options?: IDBIndexParameters;
}

interface StoreConfig {
  keyPath: string | string[];
  autoIncrement?: boolean;
  indexes?: ReadonlyArray<StoreIndexConfig>;
}

const STORE_CONFIGS: Record<StoreName, StoreConfig> = {
  [STORE_NAMES.POCKETS]: {
    keyPath: "id",
    indexes: [
      { name: "name", keyPath: "name" },
      { name: "createdAt", keyPath: "createdAt" },
      { name: "updatedAt", keyPath: "updatedAt" },
      { name: "tags", keyPath: "tags", options: { multiEntry: true } },
    ],
  },
  [STORE_NAMES.CAPTURED_CONTENT]: {
    keyPath: "id",
    indexes: [
      { name: "pocketId", keyPath: "pocketId" },
      { name: "type", keyPath: "type" },
      { name: "capturedAt", keyPath: "capturedAt" },
      { name: "sourceUrl", keyPath: "sourceUrl" },
      { name: "processingStatus", keyPath: "processingStatus" },
      {
        name: "pocketId_capturedAt",
        keyPath: ["pocketId", "capturedAt"],
      },
    ],
  },
  [STORE_NAMES.METADATA]: {
    keyPath: "contentId",
    indexes: [
      { name: "pocketId", keyPath: "pocketId" },
      { name: "timestamp", keyPath: "timestamp" },
      { name: "updatedAt", keyPath: "updatedAt" },
      { name: "tags", keyPath: "tags", options: { multiEntry: true } },
      { name: "category", keyPath: "category" },
    ],
  },
  [STORE_NAMES.CONVERSATIONS]: {
    keyPath: "id",
    indexes: [
      { name: "pocketId", keyPath: "pocketId" },
      { name: "createdAt", keyPath: "createdAt" },
      { name: "updatedAt", keyPath: "updatedAt" },
    ],
  },
  [STORE_NAMES.AI_RESPONSES]: {
    keyPath: "id",
    indexes: [
      { name: "contentId", keyPath: "contentId" },
      { name: "taskType", keyPath: "taskType" },
      { name: "source", keyPath: "source" },
      { name: "createdAt", keyPath: "createdAt" },
    ],
  },
  [STORE_NAMES.EMBEDDINGS]: {
    keyPath: "id",
    indexes: [
      { name: "contentId", keyPath: "contentId", options: { unique: true } },
      { name: "model", keyPath: "model" },
      { name: "createdAt", keyPath: "createdAt" },
    ],
  },
  [STORE_NAMES.VECTOR_CHUNKS]: {
    keyPath: "id",
    indexes: [
      { name: "pocketId", keyPath: "pocketId" },
      { name: "contentId", keyPath: "contentId" },
      {
        name: "pocketId_contentId",
        keyPath: ["pocketId", "contentId"],
      },
      { name: "createdAt", keyPath: "createdAt" },
    ],
  },
  [STORE_NAMES.SEARCH_INDEX]: {
    keyPath: "id",
    indexes: [
      { name: "contentId", keyPath: "contentId" },
      { name: "pocketId", keyPath: "pocketId" },
      { name: "term", keyPath: "term" },
      {
        name: "term_pocket",
        keyPath: ["term", "pocketId"],
      },
      {
        name: "contentId_term",
        keyPath: ["contentId", "term"],
        options: { unique: true },
      },
      { name: "weight", keyPath: "weight" },
    ],
  },
  [STORE_NAMES.SYNC_QUEUE]: {
    keyPath: "id",
    indexes: [
      { name: "timestamp", keyPath: "timestamp" },
      { name: "operation", keyPath: "operation" },
      { name: "storeName", keyPath: "storeName" },
    ],
  },
};

/**
 * Exported configuration describing the database.
 */
export const DB_CONFIG = Object.freeze({
  name: DB_NAME,
  version: DB_VERSION,
  stores: STORE_CONFIGS,
});

/**
 * Canonical metadata record persisted in the dedicated metadata store.
 */
export interface ContentMetadataRecord {
  contentId: string;
  pocketId: string;
  timestamp: number;
  updatedAt: number;
  tags: string[];
  category?: string;
  title?: string;
  metadata: ContentMetadata;
}

/**
 * Supplemental information stored with each search index entry.
 */
export interface SearchIndexMetadata {
  snippet?: string;
  field?: string;
}

/**
 * Persisted search index entry linking terms to content.
 */
export interface SearchIndexEntry {
  id: string;
  contentId: string;
  pocketId: string;
  term: string;
  weight: number;
  createdAt: number;
  metadata?: SearchIndexMetadata;
}

/**
 * Upsert payload accepted by the search index helper.
 */
export type SearchIndexUpsert = Omit<SearchIndexEntry, "id" | "createdAt"> & {
  id?: string;
  createdAt?: number;
};

/**
 * Typed database schema used by the `idb` helper.
 */
export interface AiPocketDBSchema extends DBSchema {
  pockets: {
    key: string;
    value: Pocket;
    indexes: {
      name: string;
      createdAt: number;
      updatedAt: number;
      tags: string;
    };
  };
  capturedContent: {
    key: string;
    value: CapturedContent;
    indexes: {
      pocketId: string;
      type: string;
      capturedAt: number;
      sourceUrl: string;
      processingStatus: string;
      pocketId_capturedAt: [string, number];
    };
  };
  metadata: {
    key: string;
    value: ContentMetadataRecord;
    indexes: {
      pocketId: string;
      timestamp: number;
      updatedAt: number;
      tags: string;
      category: string;
    };
  };
  conversations: {
    key: string;
    value: Conversation;
    indexes: {
      pocketId: string;
      createdAt: number;
      updatedAt: number;
    };
  };
  aiResponses: {
    key: string;
    value: AIResponse;
    indexes: {
      contentId: string;
      taskType: string;
      source: string;
      createdAt: number;
    };
  };
  embeddings: {
    key: string;
    value: Embedding;
    indexes: {
      contentId: string;
      model: string;
      createdAt: number;
    };
  };
  vectorChunks: {
    key: string;
    value: StoredChunk;
    indexes: {
      pocketId: string;
      contentId: string;
      pocketId_contentId: [string, string];
      createdAt: number;
    };
  };
  searchIndex: {
    key: string;
    value: SearchIndexEntry;
    indexes: {
      contentId: string;
      pocketId: string;
      term: string;
      term_pocket: [string, string];
      contentId_term: [string, string];
      weight: number;
    };
  };
  syncQueue: {
    key: string;
    value: SyncQueueItem;
    indexes: {
      timestamp: number;
      operation: string;
      storeName: string;
    };
  };
}

/**
 * Error categories surfaced by the database manager.
 */
export enum DatabaseErrorType {
  DATABASE_ERROR = "DATABASE_ERROR",
  TRANSACTION_ERROR = "TRANSACTION_ERROR",
  NOT_FOUND = "NOT_FOUND",
  CONSTRAINT_ERROR = "CONSTRAINT_ERROR",
  QUOTA_EXCEEDED = "QUOTA_EXCEEDED",
  UNKNOWN = "UNKNOWN",
}

/**
 * Custom error used for all IndexedDB failures handled by this module.
 */
export class DatabaseError extends Error {
  constructor(
    public readonly type: DatabaseErrorType,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "DatabaseError";
  }

  static wrap(
    error: unknown,
    fallback: DatabaseErrorType = DatabaseErrorType.UNKNOWN,
  ): DatabaseError {
    if (error instanceof DatabaseError) {
      return error;
    }

    if (error instanceof DOMException) {
      switch (error.name) {
        case "QuotaExceededError":
        case "NS_ERROR_DOM_QUOTA_REACHED":
          return new DatabaseError(
            DatabaseErrorType.QUOTA_EXCEEDED,
            error.message || "Storage quota exceeded",
            error,
          );
        case "ConstraintError":
          return new DatabaseError(
            DatabaseErrorType.CONSTRAINT_ERROR,
            error.message || "Constraint violation",
            error,
          );
        case "AbortError":
          return new DatabaseError(
            DatabaseErrorType.TRANSACTION_ERROR,
            error.message || "Transaction aborted",
            error,
          );
        default:
          return new DatabaseError(
            DatabaseErrorType.DATABASE_ERROR,
            error.message || "IndexedDB error",
            error,
          );
      }
    }

    if (error instanceof Error) {
      return new DatabaseError(fallback, error.message, error);
    }

    return new DatabaseError(fallback, String(error), error);
  }
}

/**
 * Database manager implementing the StorageManager contract using the schema
 * defined above. Provides lifecycle management, migrations, and typed CRUD
 * helpers required by higher level services.
 */
export class DatabaseManager implements StorageDatabaseContract {
  private db: IDBPDatabase<AiPocketDBSchema> | null = null;
  private dbPromise: Promise<IDBPDatabase<AiPocketDBSchema>> | null = null;

  /**
    * Lazily open the IndexedDB connection, upgrading the schema when needed.
    */
  async open(): Promise<IDBPDatabase<AiPocketDBSchema>> {
    if (this.db) {
      return this.db;
    }

    if (this.dbPromise) {
      return this.dbPromise;
    }

    this.dbPromise = openDB<AiPocketDBSchema>(DB_CONFIG.name, DB_CONFIG.version, {
      upgrade: (database, oldVersion, _newVersion, transaction) => {
        this.handleUpgrade(database, transaction, oldVersion);
      },
      blocked: () => {
        logger.warn("DatabaseManager", "Database upgrade blocked by another context");
      },
      blocking: () => {
        logger.info("DatabaseManager", "Closing older database connection to allow upgrade");
        this.db?.close();
      },
      terminated: () => {
        logger.error(
          "DatabaseManager",
          "Database connection terminated unexpectedly. Resetting state.",
        );
        this.db?.close();
        this.db = null;
        this.dbPromise = null;
      },
    });

    try {
      this.db = await this.dbPromise;
      logger.info("DatabaseManager", "Database opened", { version: this.db.version });
      return this.db;
    } catch (error) {
      this.dbPromise = null;
      throw DatabaseError.wrap(error);
    }
  }

  /**
   * Close the underlying database connection and clear cached promises.
   */
  async close(): Promise<void> {
    const pendingDb = this.dbPromise
      ? await this.dbPromise.catch(() => null)
      : null;

    const dbToClose = this.db ?? pendingDb;

    this.db = null;
    this.dbPromise = null;

    if (dbToClose) {
      dbToClose.close();
      logger.info("DatabaseManager", "Database closed");
    }
  }

  // ---------------------------------------------------------------------------
  // StorageManager contract
  // ---------------------------------------------------------------------------

  async saveContent(
    content: Omit<CapturedContent, "id" | "capturedAt">,
  ): Promise<string> {
    const id = crypto.randomUUID();
    const capturedAt = Date.now();
    const record: CapturedContent = {
      id,
      capturedAt,
      ...content,
    };

    const metadataRecord = this.createMetadataRecord(record);

    await this.runTransaction(
      [STORE_NAMES.CAPTURED_CONTENT, STORE_NAMES.METADATA],
      "readwrite",
      async (tx) => {
        await tx.objectStore(STORE_NAMES.CAPTURED_CONTENT).add(record);
        await tx.objectStore(STORE_NAMES.METADATA).put(metadataRecord);
      },
    );

    return id;
  }

  async getContent(id: string): Promise<CapturedContent | null> {
    try {
      const db = await this.open();
      return (await db.get(STORE_NAMES.CAPTURED_CONTENT, id)) ?? null;
    } catch (error) {
      throw DatabaseError.wrap(error);
    }
  }

  async updateContent(
    id: string,
    updates: Partial<Omit<CapturedContent, "id" | "capturedAt">>,
  ): Promise<void> {
    await this.runTransaction(
      [STORE_NAMES.CAPTURED_CONTENT, STORE_NAMES.METADATA],
      "readwrite",
      async (tx) => {
        const store = tx.objectStore(STORE_NAMES.CAPTURED_CONTENT);
        const existing = await store.get(id);
        if (!existing) {
          throw new DatabaseError(
            DatabaseErrorType.NOT_FOUND,
            `Content ${id} not found`,
          );
        }

        const next: CapturedContent = {
          ...existing,
          ...updates,
          id: existing.id,
          capturedAt: existing.capturedAt,
        };

        if (updates.metadata) {
          next.metadata = {
            ...existing.metadata,
            ...updates.metadata,
          };
        }

        await store.put(next);
        await tx
          .objectStore(STORE_NAMES.METADATA)
          .put(this.createMetadataRecord(next));
      },
    );
  }

  async deleteContent(id: string): Promise<void> {
    await this.runTransaction(
      [
        STORE_NAMES.CAPTURED_CONTENT,
        STORE_NAMES.METADATA,
        STORE_NAMES.EMBEDDINGS,
        STORE_NAMES.VECTOR_CHUNKS,
        STORE_NAMES.SEARCH_INDEX,
      ],
      "readwrite",
      async (tx) => {
        await tx.objectStore(STORE_NAMES.CAPTURED_CONTENT).delete(id);
        await tx.objectStore(STORE_NAMES.METADATA).delete(id);
        await this.removeLinkedData(tx, id);
      },
    );
  }

  async getContentByPocket(pocketId: string): Promise<CapturedContent[]> {
    return this.runTransaction(
      [STORE_NAMES.CAPTURED_CONTENT],
      "readonly",
      async (tx) => {
        const index = tx.objectStore(STORE_NAMES.CAPTURED_CONTENT).index("pocketId");
        return index.getAll(pocketId);
      },
    );
  }

  async getPocket(id: string): Promise<Pocket | null> {
    try {
      const db = await this.open();
      return (await db.get(STORE_NAMES.POCKETS, id)) ?? null;
    } catch (error) {
      throw DatabaseError.wrap(error);
    }
  }

  async saveChunk(chunk: Omit<StoredChunk, "createdAt">): Promise<string> {
    const id = chunk.id ?? crypto.randomUUID();
    const record: StoredChunk = {
      ...chunk,
      id,
      createdAt: Date.now(),
    };

    await this.runTransaction(
      [STORE_NAMES.VECTOR_CHUNKS],
      "readwrite",
      async (tx) => {
        await tx.objectStore(STORE_NAMES.VECTOR_CHUNKS).put(record);
      },
    );

    return id;
  }

  async getChunksByContent(contentId: string): Promise<StoredChunk[]> {
    return this.runTransaction(
      [STORE_NAMES.VECTOR_CHUNKS],
      "readonly",
      async (tx) => {
        const index = tx.objectStore(STORE_NAMES.VECTOR_CHUNKS).index("contentId");
        return index.getAll(contentId);
      },
    );
  }

  async deleteChunksByContent(contentId: string): Promise<void> {
    await this.runTransaction(
      [STORE_NAMES.VECTOR_CHUNKS],
      "readwrite",
      async (tx) => {
        const index = tx.objectStore(STORE_NAMES.VECTOR_CHUNKS).index("contentId");
        let cursor = await index.openCursor(contentId);
        while (cursor) {
          await cursor.delete();
          cursor = await cursor.continue();
        }
      },
    );
  }

  async saveEmbedding(
    embedding: Omit<Embedding, "id" | "createdAt">,
  ): Promise<string> {
    return this.runTransaction(
      [STORE_NAMES.EMBEDDINGS],
      "readwrite",
      async (tx) => {
        const store = tx.objectStore(STORE_NAMES.EMBEDDINGS);
        const index = store.index("contentId");
        const existing = await index.get(embedding.contentId);
        const now = Date.now();

        if (existing) {
          const updated: Embedding = {
            ...existing,
            ...embedding,
            id: existing.id,
            createdAt: existing.createdAt ?? now,
          };
          await store.put(updated);
          return updated.id;
        }

        const id = crypto.randomUUID();
        await store.add({
          ...embedding,
          id,
          createdAt: now,
        });
        return id;
      },
    );
  }

  async getEmbeddingByContentId(contentId: string): Promise<Embedding | null> {
    return this.runTransaction(
      [STORE_NAMES.EMBEDDINGS],
      "readonly",
      async (tx) => {
        const index = tx.objectStore(STORE_NAMES.EMBEDDINGS).index("contentId");
        return (await index.get(contentId)) ?? null;
      },
    );
  }

  async deleteEmbeddingByContentId(contentId: string): Promise<void> {
    await this.runTransaction(
      [STORE_NAMES.EMBEDDINGS],
      "readwrite",
      async (tx) => {
        const index = tx.objectStore(STORE_NAMES.EMBEDDINGS).index("contentId");
        const cursor = await index.openCursor(contentId);
        if (cursor) {
          await cursor.delete();
        }
      },
    );
  }

  // ---------------------------------------------------------------------------
  // Extended helpers (metadata & search index)
  // ---------------------------------------------------------------------------

  async getMetadata(contentId: string): Promise<ContentMetadataRecord | null> {
    return this.runTransaction(
      [STORE_NAMES.METADATA],
      "readonly",
      async (tx) => {
        return (await tx.objectStore(STORE_NAMES.METADATA).get(contentId)) ?? null;
      },
    );
  }

  async queryMetadataByTag(tag: string): Promise<ContentMetadataRecord[]> {
    return this.runTransaction(
      [STORE_NAMES.METADATA],
      "readonly",
      async (tx) => {
        const index = tx.objectStore(STORE_NAMES.METADATA).index("tags");
        return index.getAll(tag);
      },
    );
  }

  async replaceSearchIndex(
    contentId: string,
    entries: SearchIndexUpsert[],
  ): Promise<void> {
    await this.runTransaction(
      [STORE_NAMES.SEARCH_INDEX],
      "readwrite",
      async (tx) => {
        const store = tx.objectStore(STORE_NAMES.SEARCH_INDEX);
        const index = store.index("contentId");

        let cursor = await index.openCursor(contentId);
        while (cursor) {
          await cursor.delete();
          cursor = await cursor.continue();
        }

        const now = Date.now();
        for (const entry of entries) {
          const term = entry.term.toLowerCase();
          const record: SearchIndexEntry = {
            id: entry.id ?? crypto.randomUUID(),
            contentId,
            pocketId: entry.pocketId,
            term,
            weight: entry.weight ?? 1,
            createdAt: entry.createdAt ?? now,
            ...(entry.metadata ? { metadata: { ...entry.metadata } } : {}),
          };
          await store.put(record);
        }
      },
    );
  }

  async search(
    term: string,
    options: { pocketId?: string; limit?: number; offset?: number } = {},
  ): Promise<SearchIndexEntry[]> {
    const normalized = term.toLowerCase();
    const { pocketId, limit, offset } = options;

    return this.runTransaction(
      [STORE_NAMES.SEARCH_INDEX],
      "readonly",
      async (tx) => {
        const store = tx.objectStore(STORE_NAMES.SEARCH_INDEX);
        let results: SearchIndexEntry[];

        if (pocketId) {
          const index = store.index("term_pocket");
          const range = IDBKeyRange.only([normalized, pocketId]);
          results = await index.getAll(range, limit);
        } else {
          const index = store.index("term");
          results = await index.getAll(normalized, limit);
        }

        if (offset && offset > 0) {
          return results.slice(offset);
        }
        return results;
      },
    );
  }

  // ---------------------------------------------------------------------------
  // Pocket helpers (parity with legacy manager)
  // ---------------------------------------------------------------------------

  async savePocket(
    pocket: Omit<Pocket, "id" | "createdAt" | "updatedAt">,
  ): Promise<string> {
    const id = crypto.randomUUID();
    const timestamp = Date.now();
    const record: Pocket = {
      ...pocket,
      id,
      createdAt: timestamp,
      updatedAt: timestamp,
      contentIds: pocket.contentIds ?? [],
    };

    await this.runTransaction([STORE_NAMES.POCKETS], "readwrite", async (tx) => {
      await tx.objectStore(STORE_NAMES.POCKETS).add(record);
    });

    return id;
  }

  async updatePocket(
    id: string,
    updates: Partial<Omit<Pocket, "id" | "createdAt">>,
  ): Promise<void> {
    await this.runTransaction([STORE_NAMES.POCKETS], "readwrite", async (tx) => {
      const store = tx.objectStore(STORE_NAMES.POCKETS);
      const existing = await store.get(id);
      if (!existing) {
        throw new DatabaseError(DatabaseErrorType.NOT_FOUND, `Pocket ${id} not found`);
      }

      await store.put({
        ...existing,
        ...updates,
        id: existing.id,
        createdAt: existing.createdAt,
        updatedAt: Date.now(),
      });
    });
  }

  async deletePocket(id: string): Promise<void> {
    await this.runTransaction(
      [
        STORE_NAMES.POCKETS,
        STORE_NAMES.CAPTURED_CONTENT,
        STORE_NAMES.METADATA,
        STORE_NAMES.EMBEDDINGS,
        STORE_NAMES.VECTOR_CHUNKS,
        STORE_NAMES.SEARCH_INDEX,
      ],
      "readwrite",
      async (tx) => {
        await tx.objectStore(STORE_NAMES.POCKETS).delete(id);

        const contentIndex = tx.objectStore(STORE_NAMES.CAPTURED_CONTENT).index("pocketId");
        let cursor = await contentIndex.openCursor(id);
        while (cursor) {
          const contentId = cursor.value.id;
          await cursor.delete();
          await tx.objectStore(STORE_NAMES.METADATA).delete(contentId);
          await this.removeLinkedData(tx, contentId);
          cursor = await cursor.continue();
        }
      },
    );
  }

  async listPockets(): Promise<Pocket[]> {
    return this.runTransaction([STORE_NAMES.POCKETS], "readonly", async (tx) => {
      return tx.objectStore(STORE_NAMES.POCKETS).getAll();
    });
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private handleUpgrade(
    db: IDBPDatabase<AiPocketDBSchema>,
    transaction: IDBPTransaction<AiPocketDBSchema, StoreName[], "versionchange">,
    oldVersion: number,
  ): void {
    if (oldVersion < 1) {
      // Create all baseline stores
      this.ensureStore(db, transaction, STORE_NAMES.POCKETS);
      this.ensureStore(db, transaction, STORE_NAMES.CAPTURED_CONTENT);
      this.ensureStore(db, transaction, STORE_NAMES.CONVERSATIONS);
      this.ensureStore(db, transaction, STORE_NAMES.AI_RESPONSES);
      this.ensureStore(db, transaction, STORE_NAMES.EMBEDDINGS);
      this.ensureStore(db, transaction, STORE_NAMES.SYNC_QUEUE);
    }

    if (oldVersion < 2) {
      this.ensureStore(db, transaction, STORE_NAMES.VECTOR_CHUNKS);
    }

    if (oldVersion < 3) {
      this.ensureStore(db, transaction, STORE_NAMES.METADATA);
      this.ensureStore(db, transaction, STORE_NAMES.SEARCH_INDEX);
    }

    // Ensure indexes stay up to date regardless of upgrade path
    this.ensureStore(db, transaction, STORE_NAMES.POCKETS);
    this.ensureStore(db, transaction, STORE_NAMES.CAPTURED_CONTENT);
    this.ensureStore(db, transaction, STORE_NAMES.CONVERSATIONS);
    this.ensureStore(db, transaction, STORE_NAMES.AI_RESPONSES);
    this.ensureStore(db, transaction, STORE_NAMES.EMBEDDINGS);
    this.ensureStore(db, transaction, STORE_NAMES.VECTOR_CHUNKS);
    this.ensureStore(db, transaction, STORE_NAMES.METADATA);
    this.ensureStore(db, transaction, STORE_NAMES.SEARCH_INDEX);
    this.ensureStore(db, transaction, STORE_NAMES.SYNC_QUEUE);
  }

  private ensureStore(
    db: IDBPDatabase<AiPocketDBSchema>,
    transaction: IDBPTransaction<AiPocketDBSchema, StoreName[], "versionchange">,
    storeName: StoreName,
  ): void {
    const config = STORE_CONFIGS[storeName];
    let store: IDBPObjectStore<AiPocketDBSchema, StoreName[], StoreName, "versionchange">;

    if (db.objectStoreNames.contains(storeName)) {
      store = transaction.objectStore(storeName);
    } else {
      const options =
        config.autoIncrement !== undefined
          ? { keyPath: config.keyPath, autoIncrement: config.autoIncrement }
          : { keyPath: config.keyPath };
      store = db.createObjectStore(storeName, options);
    }

    for (const index of config.indexes ?? []) {
      if (!store.indexNames.contains(index.name)) {
        store.createIndex(index.name, index.keyPath, index.options);
      }
    }
  }

  private createMetadataRecord(content: CapturedContent): ContentMetadataRecord {
    const metadata: ContentMetadata = {
      ...(content.metadata ?? {}),
    };

    const timestamp =
      typeof metadata.timestamp === "number" && !Number.isNaN(metadata.timestamp)
        ? metadata.timestamp
        : content.capturedAt;

    const updatedAt =
      typeof metadata.updatedAt === "number" && !Number.isNaN(metadata.updatedAt)
        ? metadata.updatedAt
        : Date.now();

    const tags = Array.isArray(metadata.tags)
      ? metadata.tags.filter((tag): tag is string => typeof tag === "string")
      : [];

    const normalizedMetadata: ContentMetadata = {
      ...metadata,
      timestamp,
      updatedAt,
      tags,
    };

    const record: ContentMetadataRecord = {
      contentId: content.id,
      pocketId: content.pocketId,
      timestamp,
      updatedAt,
      tags,
      metadata: normalizedMetadata,
    };

    if (normalizedMetadata.category !== undefined) {
      record.category = normalizedMetadata.category;
    }

    if (normalizedMetadata.title !== undefined) {
      record.title = normalizedMetadata.title;
    }

    return record;
  }

  private async removeLinkedData(
    tx: IDBPTransaction<AiPocketDBSchema, StoreName[], "readwrite">,
    contentId: string,
  ): Promise<void> {
    const embeddingIndex = tx
      .objectStore(STORE_NAMES.EMBEDDINGS)
      .index("contentId");
    let embeddingCursor = await embeddingIndex.openCursor(contentId);
    while (embeddingCursor) {
      await embeddingCursor.delete();
      embeddingCursor = await embeddingCursor.continue();
    }

    const chunkIndex = tx.objectStore(STORE_NAMES.VECTOR_CHUNKS).index("contentId");
    let chunkCursor = await chunkIndex.openCursor(contentId);
    while (chunkCursor) {
      await chunkCursor.delete();
      chunkCursor = await chunkCursor.continue();
    }

    const searchIndex = tx.objectStore(STORE_NAMES.SEARCH_INDEX).index("contentId");
    let searchCursor = await searchIndex.openCursor(contentId);
    while (searchCursor) {
      await searchCursor.delete();
      searchCursor = await searchCursor.continue();
    }
  }

  private async runTransaction<Mode extends IDBTransactionMode, Result>(
    storeNames: StoreName[],
    mode: Mode,
    handler: (
      tx: IDBPTransaction<AiPocketDBSchema, StoreName[], Mode>,
    ) => Promise<Result>,
  ): Promise<Result> {
    const db = await this.open();
    const tx = db.transaction(storeNames, mode);

    try {
      const result = await handler(tx);
      await tx.done;
      return result;
    } catch (error) {
      let err: unknown = error;
      try {
        await tx.done;
      } catch (doneError) {
        err = doneError;
      }
      throw DatabaseError.wrap(err);
    }
  }
}

/**
 * Factory helper mirroring the legacy manager export style.
 */
export function createDatabaseManager(): DatabaseManager {
  return new DatabaseManager();
}
