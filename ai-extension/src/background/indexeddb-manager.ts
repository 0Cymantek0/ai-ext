/**
 * IndexedDB Manager
 * Provides database schema, CRUD operations, and transaction management
 * Requirements: 2.6, 7.1, 7.2
 */

import { logger } from "./monitoring.js";

const DB_NAME = "ai-pocket-db";
const DB_VERSION = 2; // Bumped for vectorChunks store

export enum StoreName {
  POCKETS = "pockets",
  CAPTURED_CONTENT = "capturedContent",
  CONVERSATIONS = "conversations",
  AI_RESPONSES = "aiResponses",
  EMBEDDINGS = "embeddings",
  VECTOR_CHUNKS = "vectorChunks", // New store for chunk-level RAG
  SYNC_QUEUE = "syncQueue",
}

export enum ContentType {
  TEXT = "text",
  SNIPPET = "snippet",
  IMAGE = "image",
  AUDIO = "audio",
  VIDEO = "video",
  ELEMENT = "element",
  PAGE = "page",
  NOTE = "note",
  PDF = "pdf",
  DOCUMENT = "document",
  SPREADSHEET = "spreadsheet",
  FILE = "file",
}

export enum ProcessingStatus {
  PENDING = "pending",
  PROCESSING = "processing",
  COMPLETED = "completed",
  FAILED = "failed",
}

export type AISource = "gemini-nano" | "gemini-flash" | "gemini-pro";

export interface Pocket {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  updatedAt: number;
  contentIds: string[];
  tags: string[];
  color: string;
  icon?: string;
}

export interface ContentMetadata {
  timestamp: number;
  title?: string;
  tags?: string[];
  category?: string;
  updatedAt?: number;
  selectionContext?: string;
  elementSelector?: string;
  dimensions?: { width: number; height: number };
  fileSize?: number;
  fileType?: string;
  fileExtension?: string;
}

export interface CapturedContent {
  id: string;
  pocketId: string;
  type: ContentType;
  content: string | ArrayBuffer;
  metadata: ContentMetadata;
  embedding?: number[];
  capturedAt: number;
  sourceUrl: string;
  processingStatus: ProcessingStatus;
  pdfMetadata?: {
    text: string;
    structuredContent: {
      headings: Array<{ level: number; text: string }>;
      paragraphs: string[];
      lists: string[];
      tables: string[];
    };
    images: Array<{
      data: string;
      width: number;
      height: number;
      pageNumber: number;
    }>;
    pageCount: number;
    extractedAt: number;
    tokenCount: number;
  };
}

export interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  source: AISource;
  metadata?: {
    processingTime?: number;
    confidence?: number;
    tokensUsed?: number;
  };
}

export interface ConversationMetadata {
  summary: string;
  keywords: string[];
  topics: string[];
  entities: string[];
  mainQuestions: string[];
  generatedAt: number;
}

export interface Conversation {
  id: string;
  pocketId?: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
  model: string;
  tokensUsed: number;
  metadata?: ConversationMetadata;
}

export interface AIResponse {
  id: string;
  contentId: string;
  taskType: string;
  result: string;
  source: AISource;
  confidence: number;
  processingTime: number;
  tokensUsed: number;
  createdAt: number;
}

export interface Embedding {
  id: string;
  contentId: string;
  vector: number[];
  model: string;
  createdAt: number;
}

export interface StoredChunk {
  id: string;
  contentId: string;
  pocketId: string;
  text: string;
  embedding: number[];
  metadata: {
    contentId: string;
    pocketId: string;
    sourceType: ContentType;
    sourceUrl: string;
    chunkIndex: number;
    totalChunks: number;
    startOffset: number;
    endOffset: number;
    capturedAt: number;
    chunkedAt: number;
    title?: string | undefined;
    category?: string | undefined;
    textPreview: string;
  };
  createdAt: number;
}

export interface SyncQueueItem {
  id: string;
  operation: "create" | "update" | "delete";
  storeName: StoreName;
  data: any;
  timestamp: number;
  retryCount: number;
  lastError?: string;
}

export enum IndexedDBErrorType {
  DATABASE_ERROR = "DATABASE_ERROR",
  TRANSACTION_ERROR = "TRANSACTION_ERROR",
  NOT_FOUND = "NOT_FOUND",
  CONSTRAINT_ERROR = "CONSTRAINT_ERROR",
  QUOTA_EXCEEDED = "QUOTA_EXCEEDED",
  UNKNOWN = "UNKNOWN",
}

export class IndexedDBError extends Error {
  constructor(
    public type: IndexedDBErrorType,
    message: string,
    public originalError?: unknown,
  ) {
    super(message);
    this.name = "IndexedDBError";
  }
}
export class IndexedDBManager {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<IDBDatabase> | null = null;

  async init(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    if (this.initPromise) return this.initPromise;
    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = () =>
        reject(
          new IndexedDBError(
            IndexedDBErrorType.DATABASE_ERROR,
            "Failed to open database",
            request.error,
          ),
        );
      request.onsuccess = () => {
        this.db = request.result;
        logger.info("IndexedDBManager", "Database opened", {
          version: this.db.version,
        });
        resolve(this.db);
      };
      request.onupgradeneeded = (event) =>
        this.createSchema((event.target as IDBOpenDBRequest).result);
    });
    return this.initPromise;
  }

  private createSchema(db: IDBDatabase): void {
    logger.info("IndexedDBManager", "Creating schema", { version: DB_VERSION });
    if (!db.objectStoreNames.contains(StoreName.POCKETS)) {
      const store = db.createObjectStore(StoreName.POCKETS, { keyPath: "id" });
      store.createIndex("name", "name", { unique: false });
      store.createIndex("createdAt", "createdAt", { unique: false });
      store.createIndex("updatedAt", "updatedAt", { unique: false });
      store.createIndex("tags", "tags", { unique: false, multiEntry: true });
    }
    if (!db.objectStoreNames.contains(StoreName.CAPTURED_CONTENT)) {
      const store = db.createObjectStore(StoreName.CAPTURED_CONTENT, {
        keyPath: "id",
      });
      store.createIndex("pocketId", "pocketId", { unique: false });
      store.createIndex("type", "type", { unique: false });
      store.createIndex("capturedAt", "capturedAt", { unique: false });
      store.createIndex("sourceUrl", "sourceUrl", { unique: false });
      store.createIndex("processingStatus", "processingStatus", {
        unique: false,
      });
      store.createIndex("pocketId_capturedAt", ["pocketId", "capturedAt"], {
        unique: false,
      });
    }
    if (!db.objectStoreNames.contains(StoreName.CONVERSATIONS)) {
      const store = db.createObjectStore(StoreName.CONVERSATIONS, {
        keyPath: "id",
      });
      store.createIndex("pocketId", "pocketId", { unique: false });
      store.createIndex("createdAt", "createdAt", { unique: false });
      store.createIndex("updatedAt", "updatedAt", { unique: false });
    }
    if (!db.objectStoreNames.contains(StoreName.AI_RESPONSES)) {
      const store = db.createObjectStore(StoreName.AI_RESPONSES, {
        keyPath: "id",
      });
      store.createIndex("contentId", "contentId", { unique: false });
      store.createIndex("taskType", "taskType", { unique: false });
      store.createIndex("source", "source", { unique: false });
      store.createIndex("createdAt", "createdAt", { unique: false });
    }
    if (!db.objectStoreNames.contains(StoreName.EMBEDDINGS)) {
      const store = db.createObjectStore(StoreName.EMBEDDINGS, {
        keyPath: "id",
      });
      store.createIndex("contentId", "contentId", { unique: true });
      store.createIndex("model", "model", { unique: false });
      store.createIndex("createdAt", "createdAt", { unique: false });
    }
    if (!db.objectStoreNames.contains(StoreName.VECTOR_CHUNKS)) {
      const store = db.createObjectStore(StoreName.VECTOR_CHUNKS, {
        keyPath: "id",
      });
      store.createIndex("pocketId", "pocketId", { unique: false });
      store.createIndex("contentId", "contentId", { unique: false });
      store.createIndex("pocketId_contentId", ["pocketId", "contentId"], { unique: false });
      store.createIndex("createdAt", "createdAt", { unique: false });
    }
    if (!db.objectStoreNames.contains(StoreName.SYNC_QUEUE)) {
      const store = db.createObjectStore(StoreName.SYNC_QUEUE, {
        keyPath: "id",
      });
      store.createIndex("timestamp", "timestamp", { unique: false });
      store.createIndex("operation", "operation", { unique: false });
      store.createIndex("storeName", "storeName", { unique: false });
    }
    logger.info("IndexedDBManager", "Schema created");
  }
  private async executeTransaction<T>(
    storeNames: StoreName | StoreName[],
    mode: IDBTransactionMode,
    operation: (transaction: IDBTransaction) => Promise<T>,
  ): Promise<T> {
    const db = await this.init();
    const stores = Array.isArray(storeNames) ? storeNames : [storeNames];
    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction(stores, mode);
        let result: T;
        transaction.oncomplete = () => resolve(result);
        transaction.onerror = () =>
          reject(
            new IndexedDBError(
              IndexedDBErrorType.TRANSACTION_ERROR,
              "Transaction failed",
              transaction.error,
            ),
          );
        transaction.onabort = () =>
          reject(
            new IndexedDBError(
              IndexedDBErrorType.TRANSACTION_ERROR,
              "Transaction aborted",
              transaction.error,
            ),
          );
        operation(transaction)
          .then((res) => {
            result = res;
          })
          .catch((err) => {
            transaction.abort();
            reject(err);
          });
      } catch (error) {
        reject(
          new IndexedDBError(
            IndexedDBErrorType.TRANSACTION_ERROR,
            "Failed to create transaction",
            error,
          ),
        );
      }
    });
  }

  private promisifyRequest<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(
          new IndexedDBError(
            IndexedDBErrorType.DATABASE_ERROR,
            "Request failed",
            request.error,
          ),
        );
    });
  }

  async createPocket(
    pocket: Omit<Pocket, "id" | "createdAt" | "updatedAt">,
  ): Promise<string> {
    const id = crypto.randomUUID();
    const now = Date.now();
    const newPocket: Pocket = {
      id,
      ...pocket,
      createdAt: now,
      updatedAt: now,
      contentIds: pocket.contentIds || [],
    };
    await this.executeTransaction(
      StoreName.POCKETS,
      "readwrite",
      async (tx) => {
        await this.promisifyRequest(
          tx.objectStore(StoreName.POCKETS).add(newPocket),
        );
      },
    );
    logger.info("IndexedDBManager", "Pocket created", {
      id,
      name: pocket.name,
    });
    return id;
  }

  async getPocket(id: string): Promise<Pocket | null> {
    return this.executeTransaction(
      StoreName.POCKETS,
      "readonly",
      async (tx) => {
        const result = await this.promisifyRequest(
          tx.objectStore(StoreName.POCKETS).get(id),
        );
        return result || null;
      },
    );
  }

  async updatePocket(
    id: string,
    updates: Partial<Omit<Pocket, "id" | "createdAt">>,
  ): Promise<void> {
    await this.executeTransaction(
      StoreName.POCKETS,
      "readwrite",
      async (tx) => {
        const store = tx.objectStore(StoreName.POCKETS);
        const existing = await this.promisifyRequest(store.get(id));
        if (!existing)
          throw new IndexedDBError(
            IndexedDBErrorType.NOT_FOUND,
            `Pocket ${id} not found`,
          );
        await this.promisifyRequest(
          store.put({
            ...existing,
            ...updates,
            id,
            createdAt: existing.createdAt,
            updatedAt: Date.now(),
          }),
        );
      },
    );
    logger.info("IndexedDBManager", "Pocket updated", { id });
  }

  async deletePocket(id: string): Promise<void> {
    await this.executeTransaction(
      [StoreName.POCKETS, StoreName.CAPTURED_CONTENT],
      "readwrite",
      async (tx) => {
        await this.promisifyRequest(
          tx.objectStore(StoreName.POCKETS).delete(id),
        );
        const contentStore = tx.objectStore(StoreName.CAPTURED_CONTENT);
        const index = contentStore.index("pocketId");
        const request = index.openCursor(IDBKeyRange.only(id));
        await new Promise<void>((resolve, reject) => {
          request.onsuccess = () => {
            const cursor = request.result;
            if (cursor) {
              cursor.delete();
              cursor.continue();
            } else {
              resolve();
            }
          };
          request.onerror = () => reject(request.error);
        });
      },
    );
    logger.info("IndexedDBManager", "Pocket deleted", { id });
  }

  async listPockets(): Promise<Pocket[]> {
    return this.executeTransaction(
      StoreName.POCKETS,
      "readonly",
      async (tx) => {
        return await this.promisifyRequest(
          tx.objectStore(StoreName.POCKETS).getAll(),
        );
      },
    );
  }
  async saveContent(
    content: Omit<CapturedContent, "id" | "capturedAt">,
  ): Promise<string> {
    const id = crypto.randomUUID();
    const newContent: CapturedContent = {
      id,
      ...content,
      capturedAt: Date.now(),
    };
    await this.executeTransaction(
      [StoreName.CAPTURED_CONTENT, StoreName.POCKETS],
      "readwrite",
      async (tx) => {
        await this.promisifyRequest(
          tx.objectStore(StoreName.CAPTURED_CONTENT).add(newContent),
        );
        const pocket = await this.promisifyRequest(
          tx.objectStore(StoreName.POCKETS).get(content.pocketId),
        );
        if (pocket) {
          pocket.contentIds.push(id);
          pocket.updatedAt = Date.now();
          await this.promisifyRequest(
            tx.objectStore(StoreName.POCKETS).put(pocket),
          );
        }
      },
    );
    logger.info("IndexedDBManager", "Content saved", {
      id,
      pocketId: content.pocketId,
      type: content.type,
    });
    return id;
  }

  async getContent(id: string): Promise<CapturedContent | null> {
    return this.executeTransaction(
      StoreName.CAPTURED_CONTENT,
      "readonly",
      async (tx) => {
        const result = await this.promisifyRequest(
          tx.objectStore(StoreName.CAPTURED_CONTENT).get(id),
        );
        return result || null;
      },
    );
  }

  async updateContent(
    id: string,
    updates: Partial<Omit<CapturedContent, "id" | "capturedAt">>,
  ): Promise<void> {
    await this.executeTransaction(
      StoreName.CAPTURED_CONTENT,
      "readwrite",
      async (tx) => {
        const store = tx.objectStore(StoreName.CAPTURED_CONTENT);
        const existing = await this.promisifyRequest(store.get(id));
        if (!existing)
          throw new IndexedDBError(
            IndexedDBErrorType.NOT_FOUND,
            `Content ${id} not found`,
          );
        await this.promisifyRequest(
          store.put({
            ...existing,
            ...updates,
            id,
            capturedAt: existing.capturedAt,
          }),
        );
      },
    );
    logger.info("IndexedDBManager", "Content updated", { id });
  }

  async deleteContent(id: string): Promise<void> {
    await this.executeTransaction(
      [StoreName.CAPTURED_CONTENT, StoreName.POCKETS],
      "readwrite",
      async (tx) => {
        const contentStore = tx.objectStore(StoreName.CAPTURED_CONTENT);
        const content = await this.promisifyRequest(contentStore.get(id));
        if (content) {
          const pocket = await this.promisifyRequest(
            tx.objectStore(StoreName.POCKETS).get(content.pocketId),
          );
          if (pocket) {
            pocket.contentIds = pocket.contentIds.filter(
              (cid: string) => cid !== id,
            );
            pocket.updatedAt = Date.now();
            await this.promisifyRequest(
              tx.objectStore(StoreName.POCKETS).put(pocket),
            );
          }
        }
        await this.promisifyRequest(contentStore.delete(id));
      },
    );
    logger.info("IndexedDBManager", "Content deleted", { id });
  }

  async getContentByPocket(pocketId: string): Promise<CapturedContent[]> {
    return this.executeTransaction(
      StoreName.CAPTURED_CONTENT,
      "readonly",
      async (tx) => {
        const index = tx
          .objectStore(StoreName.CAPTURED_CONTENT)
          .index("pocketId");
        return await this.promisifyRequest(
          index.getAll(IDBKeyRange.only(pocketId)),
        );
      },
    );
  }
  async saveConversation(
    conversation: Omit<Conversation, "id" | "createdAt" | "updatedAt">,
    existingId?: string,
  ): Promise<string> {
    const id = existingId || crypto.randomUUID();
    const now = Date.now();
    const newConversation: Conversation = {
      id,
      ...conversation,
      createdAt: now,
      updatedAt: now,
    };
    await this.executeTransaction(
      StoreName.CONVERSATIONS,
      "readwrite",
      async (tx) => {
        await this.promisifyRequest(
          tx.objectStore(StoreName.CONVERSATIONS).add(newConversation),
        );
      },
    );
    logger.info("IndexedDBManager", "Conversation saved", { id });
    return id;
  }

  async getConversation(id: string): Promise<Conversation | null> {
    return this.executeTransaction(
      StoreName.CONVERSATIONS,
      "readonly",
      async (tx) => {
        const result = await this.promisifyRequest(
          tx.objectStore(StoreName.CONVERSATIONS).get(id),
        );
        return result || null;
      },
    );
  }

  async updateConversation(id: string, message: Message): Promise<void> {
    await this.executeTransaction(
      StoreName.CONVERSATIONS,
      "readwrite",
      async (tx) => {
        const store = tx.objectStore(StoreName.CONVERSATIONS);
        const existing = await this.promisifyRequest(store.get(id));
        if (!existing)
          throw new IndexedDBError(
            IndexedDBErrorType.NOT_FOUND,
            `Conversation ${id} not found`,
          );
        const updated: Conversation = {
          ...existing,
          messages: [...existing.messages, message],
          updatedAt: Date.now(),
          tokensUsed: existing.tokensUsed + (message.metadata?.tokensUsed || 0),
        };
        await this.promisifyRequest(store.put(updated));
      },
    );
    logger.info("IndexedDBManager", "Conversation updated", { id });
    
    // Trigger metadata regeneration in background
    // This ensures search stays accurate as conversations evolve
    this.triggerMetadataRegeneration(id);
  }

  /**
   * Trigger metadata regeneration for a conversation (non-blocking)
   */
  private triggerMetadataRegeneration(conversationId: string): void {
    // Use setTimeout to make this non-blocking
    setTimeout(async () => {
      try {
        // Import dynamically to avoid circular dependencies
        const { metadataQueueManager } = await import("./service-worker.js");
        if (metadataQueueManager) {
          await metadataQueueManager.enqueueConversation(conversationId, "normal");
          logger.debug("IndexedDBManager", "Queued metadata regeneration", { conversationId });
        }
      } catch (error) {
        logger.warn("IndexedDBManager", "Failed to queue metadata regeneration", { 
          conversationId, 
          error 
        });
      }
    }, 0);
  }

  async updateConversationMetadata(id: string, metadata: ConversationMetadata): Promise<void> {
    await this.executeTransaction(
      StoreName.CONVERSATIONS,
      "readwrite",
      async (tx) => {
        const store = tx.objectStore(StoreName.CONVERSATIONS);
        const existing = await this.promisifyRequest(store.get(id));
        if (!existing)
          throw new IndexedDBError(
            IndexedDBErrorType.NOT_FOUND,
            `Conversation ${id} not found`,
          );
        const updated: Conversation = {
          ...existing,
          metadata,
          updatedAt: Date.now(),
        };
        await this.promisifyRequest(store.put(updated));
      },
    );
    logger.info("IndexedDBManager", "Conversation metadata updated", { id });
  }

  async deleteConversation(id: string): Promise<void> {
    await this.executeTransaction(
      StoreName.CONVERSATIONS,
      "readwrite",
      async (tx) => {
        await this.promisifyRequest(
          tx.objectStore(StoreName.CONVERSATIONS).delete(id),
        );
      },
    );
    logger.info("IndexedDBManager", "Conversation deleted", { id });
  }

  async getConversationsByPocket(pocketId: string): Promise<Conversation[]> {
    return this.executeTransaction(
      StoreName.CONVERSATIONS,
      "readonly",
      async (tx) => {
        const index = tx.objectStore(StoreName.CONVERSATIONS).index("pocketId");
        return await this.promisifyRequest(
          index.getAll(IDBKeyRange.only(pocketId)),
        );
      },
    );
  }

  async listConversations(): Promise<Conversation[]> {
    return this.executeTransaction(
      StoreName.CONVERSATIONS,
      "readonly",
      async (tx) => {
        return await this.promisifyRequest(
          tx.objectStore(StoreName.CONVERSATIONS).getAll(),
        );
      },
    );
  }

  async saveEmbedding(
    embedding: Omit<Embedding, "id" | "createdAt">,
  ): Promise<string> {
    const id = crypto.randomUUID();
    const newEmbedding: Embedding = { id, ...embedding, createdAt: Date.now() };
    return this.executeTransaction(
      StoreName.EMBEDDINGS,
      "readwrite",
      async (tx) => {
        const store = tx.objectStore(StoreName.EMBEDDINGS);
        const index = store.index("contentId");
        const existing = await this.promisifyRequest(
          index.get(embedding.contentId),
        );
        if (existing) {
          await this.promisifyRequest(
            store.put({ ...newEmbedding, id: existing.id }),
          );
          logger.info("IndexedDBManager", "Embedding updated", {
            id: existing.id,
            contentId: embedding.contentId,
          });
          return existing.id;
        } else {
          await this.promisifyRequest(store.add(newEmbedding));
          logger.info("IndexedDBManager", "Embedding saved", {
            id,
            contentId: embedding.contentId,
          });
          return id;
        }
      },
    );
  }

  async getEmbeddingByContentId(contentId: string): Promise<Embedding | null> {
    return this.executeTransaction(
      StoreName.EMBEDDINGS,
      "readonly",
      async (tx) => {
        const index = tx.objectStore(StoreName.EMBEDDINGS).index("contentId");
        const result = await this.promisifyRequest(index.get(contentId));
        return result || null;
      },
    );
  }

  async getAllEmbeddings(): Promise<Embedding[]> {
    return this.executeTransaction(
      StoreName.EMBEDDINGS,
      "readonly",
      async (tx) => {
        return await this.promisifyRequest(
          tx.objectStore(StoreName.EMBEDDINGS).getAll(),
        );
      },
    );
  }

  async deleteEmbeddingByContentId(contentId: string): Promise<void> {
    await this.executeTransaction(
      StoreName.EMBEDDINGS,
      "readwrite",
      async (tx) => {
        const store = tx.objectStore(StoreName.EMBEDDINGS);
        const index = store.index("contentId");
        const cursor = await this.promisifyRequest(
          index.openCursor(IDBKeyRange.only(contentId)),
        );
        if (cursor) {
          await this.promisifyRequest(cursor.delete());
          logger.info("IndexedDBManager", "Embedding deleted", { contentId });
        }
      },
    );
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.initPromise = null;
      logger.info("IndexedDBManager", "Database closed");
    }
  }

  // Vector Chunks CRUD Operations

  async saveChunk(chunk: Omit<StoredChunk, "createdAt">): Promise<string> {
    const newChunk: StoredChunk = { ...chunk, createdAt: Date.now() };
    return this.executeTransaction(
      StoreName.VECTOR_CHUNKS,
      "readwrite",
      async (tx) => {
        await this.promisifyRequest(
          tx.objectStore(StoreName.VECTOR_CHUNKS).put(newChunk),
        );
        logger.debug("IndexedDBManager", "Chunk saved", {
          id: chunk.id,
          contentId: chunk.contentId,
          pocketId: chunk.pocketId,
        });
        return chunk.id;
      },
    );
  }

  async saveChunksBatch(chunks: Omit<StoredChunk, "createdAt">[]): Promise<void> {
    return this.executeTransaction(
      StoreName.VECTOR_CHUNKS,
      "readwrite",
      async (tx) => {
        const store = tx.objectStore(StoreName.VECTOR_CHUNKS);
        const createdAt = Date.now();
        
        for (const chunk of chunks) {
          const newChunk: StoredChunk = { ...chunk, createdAt };
          await this.promisifyRequest(store.put(newChunk));
        }
        
        logger.info("IndexedDBManager", "Chunks batch saved", {
          count: chunks.length,
        });
      },
    );
  }

  async getChunksByPocket(pocketId: string): Promise<StoredChunk[]> {
    return this.executeTransaction(
      StoreName.VECTOR_CHUNKS,
      "readonly",
      async (tx) => {
        const index = tx.objectStore(StoreName.VECTOR_CHUNKS).index("pocketId");
        return await this.promisifyRequest(index.getAll(pocketId));
      },
    );
  }

  async getChunksByContent(contentId: string): Promise<StoredChunk[]> {
    return this.executeTransaction(
      StoreName.VECTOR_CHUNKS,
      "readonly",
      async (tx) => {
        const index = tx.objectStore(StoreName.VECTOR_CHUNKS).index("contentId");
        return await this.promisifyRequest(index.getAll(contentId));
      },
    );
  }

  async deleteChunksByContent(contentId: string): Promise<void> {
    return this.executeTransaction(
      StoreName.VECTOR_CHUNKS,
      "readwrite",
      async (tx) => {
        const store = tx.objectStore(StoreName.VECTOR_CHUNKS);
        const index = store.index("contentId");
        const chunks = await this.promisifyRequest(index.getAll(contentId));
        
        for (const chunk of chunks) {
          await this.promisifyRequest(store.delete(chunk.id));
        }
        
        logger.info("IndexedDBManager", "Chunks deleted by content", {
          contentId,
          count: chunks.length,
        });
      },
    );
  }

  async deleteChunksByPocket(pocketId: string): Promise<void> {
    return this.executeTransaction(
      StoreName.VECTOR_CHUNKS,
      "readwrite",
      async (tx) => {
        const store = tx.objectStore(StoreName.VECTOR_CHUNKS);
        const index = store.index("pocketId");
        const chunks = await this.promisifyRequest(index.getAll(pocketId));
        
        for (const chunk of chunks) {
          await this.promisifyRequest(store.delete(chunk.id));
        }
        
        logger.info("IndexedDBManager", "Chunks deleted by pocket", {
          pocketId,
          count: chunks.length,
        });
      },
    );
  }

  async getAllChunks(): Promise<StoredChunk[]> {
    return this.executeTransaction(
      StoreName.VECTOR_CHUNKS,
      "readonly",
      async (tx) => {
        return await this.promisifyRequest(
          tx.objectStore(StoreName.VECTOR_CHUNKS).getAll(),
        );
      },
    );
  }
}

export const indexedDBManager = new IndexedDBManager();
