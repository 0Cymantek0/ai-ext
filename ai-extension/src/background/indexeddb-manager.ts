/**
 * IndexedDB Manager
 * Provides database schema, CRUD operations, and transaction management
 * Requirements: 2.6, 7.1, 7.2
 */

import { logger } from "./monitoring.js";
import { ContentType, ProcessingStatus } from "../types/content.js";
import type {
  MessageMetadata,
  ProviderExecutionMetadata,
} from "../shared/types/index.d";
import type {
  ContentMetadata,
  ContentStorageReference,
  ContentChunk,
} from "../types/content.js";
import type { FileArchiveDescriptor } from "./storage/tiered-storage-types.js";

const DB_NAME = "ai-pocket-db";
const DB_VERSION = 6; // Synced with DatabaseManager to prevent version conflicts

export enum StoreName {
  POCKETS = "pockets",
  CAPTURED_CONTENT = "capturedContent",
  METADATA = "metadata",
  CONVERSATIONS = "conversations",
  AI_RESPONSES = "aiResponses",
  EMBEDDINGS = "embeddings",
  VECTOR_CHUNKS = "vectorChunks",
  SEARCH_INDEX = "searchIndex",
  SYNC_QUEUE = "syncQueue",
  BROWSER_AGENT_WORKFLOWS = "browserAgentWorkflows",
  BROWSER_AGENT_CHECKPOINTS = "browserAgentCheckpoints",
  // Canonical agent runtime stores (v5)
  AGENT_RUNS = "agentRuns",
  AGENT_RUN_EVENTS = "agentRunEvents",
  AGENT_CHECKPOINTS = "agentCheckpoints",
  AGENT_APPROVALS = "agentApprovals",
  AGENT_ARTIFACTS = "agentArtifacts",
  AGENT_MIGRATIONS = "agentMigrations",
  GENERATED_REPORTS = "generatedReports",
  REPORT_SUPPORT_MAPS = "reportSupportMaps",
}

// Re-export types from shared types for backward compatibility
export { ContentType, ProcessingStatus };
export type { ContentMetadata, ContentStorageReference };

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
  metadata?: MessageMetadata & {
    providerExecution?: ProviderExecutionMetadata;
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
  attachedPocketId?: string; // Legacy: single pocket (for migration)
  attachedPocketIds?: string[]; // Multiple pockets attached for RAG context retrieval
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

/**
 * Re-export StoredChunk from shared types for backward compatibility
 * The type alias allows existing code to continue working while
 * future code can use the shared ContentChunk type from src/types/
 */
export type StoredChunk = ContentChunk;

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

    // Version 1: Baseline stores
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
    if (!db.objectStoreNames.contains(StoreName.SYNC_QUEUE)) {
      const store = db.createObjectStore(StoreName.SYNC_QUEUE, {
        keyPath: "id",
      });
      store.createIndex("timestamp", "timestamp", { unique: false });
      store.createIndex("operation", "operation", { unique: false });
      store.createIndex("storeName", "storeName", { unique: false });
    }

    // Version 2: Vector chunks for RAG
    if (!db.objectStoreNames.contains(StoreName.VECTOR_CHUNKS)) {
      const store = db.createObjectStore(StoreName.VECTOR_CHUNKS, {
        keyPath: "id",
      });
      store.createIndex("pocketId", "pocketId", { unique: false });
      store.createIndex("contentId", "contentId", { unique: false });
      store.createIndex("pocketId_contentId", ["pocketId", "contentId"], {
        unique: false,
      });
      store.createIndex("createdAt", "createdAt", { unique: false });
    }

    // Version 3: Metadata and search index stores
    if (!db.objectStoreNames.contains(StoreName.METADATA)) {
      const store = db.createObjectStore(StoreName.METADATA, {
        keyPath: "contentId",
      });
      store.createIndex("pocketId", "pocketId", { unique: false });
      store.createIndex("timestamp", "timestamp", { unique: false });
      store.createIndex("updatedAt", "updatedAt", { unique: false });
      store.createIndex("tags", "tags", { unique: false, multiEntry: true });
      store.createIndex("category", "category", { unique: false });
    }
    if (!db.objectStoreNames.contains(StoreName.SEARCH_INDEX)) {
      const store = db.createObjectStore(StoreName.SEARCH_INDEX, {
        keyPath: "id",
      });
      store.createIndex("contentId", "contentId", { unique: false });
      store.createIndex("pocketId", "pocketId", { unique: false });
      store.createIndex("term", "term", { unique: false });
      store.createIndex("term_pocket", ["term", "pocketId"], { unique: false });
      store.createIndex("contentId_term", ["contentId", "term"], {
        unique: true,
      });
      store.createIndex("weight", "weight", { unique: false });
    }

    // Version 4: Browser agent workflow stores
    if (!db.objectStoreNames.contains(StoreName.BROWSER_AGENT_WORKFLOWS)) {
      const store = db.createObjectStore(StoreName.BROWSER_AGENT_WORKFLOWS, {
        keyPath: "workflowId",
      });
      store.createIndex("status", "status", { unique: false });
      store.createIndex("startTime", "startTime", { unique: false });
      store.createIndex("lastUpdate", "lastUpdate", { unique: false });
      store.createIndex("userId", "userId", { unique: false });
    }
    if (!db.objectStoreNames.contains(StoreName.BROWSER_AGENT_CHECKPOINTS)) {
      const store = db.createObjectStore(StoreName.BROWSER_AGENT_CHECKPOINTS, {
        keyPath: "checkpointId",
      });
      store.createIndex("workflowId", "workflowId", { unique: false });
      store.createIndex("timestamp", "timestamp", { unique: false });
      store.createIndex("step", "step", { unique: false });
      store.createIndex("workflowId_timestamp", ["workflowId", "timestamp"], {
        unique: false,
      });
    }

    // Version 5: Canonical agent runtime stores
    if (!db.objectStoreNames.contains(StoreName.AGENT_RUNS)) {
      const store = db.createObjectStore(StoreName.AGENT_RUNS, {
        keyPath: "runId",
      });
      store.createIndex("status", "status", { unique: false });
      store.createIndex("mode", "mode", { unique: false });
      store.createIndex("updatedAt", "updatedAt", { unique: false });
      store.createIndex("createdAt", "createdAt", { unique: false });
      store.createIndex("conversationId", "conversationId", { unique: false });
      store.createIndex("pocketId", "pocketId", { unique: false });
    }
    if (!db.objectStoreNames.contains(StoreName.AGENT_RUN_EVENTS)) {
      const store = db.createObjectStore(StoreName.AGENT_RUN_EVENTS, {
        keyPath: "eventId",
      });
      store.createIndex("runId", "runId", { unique: false });
      store.createIndex("sequence", "sequence", { unique: false });
      store.createIndex("eventType", "eventType", { unique: false });
      store.createIndex("timestamp", "timestamp", { unique: false });
      store.createIndex("runId_sequence", ["runId", "sequence"], {
        unique: false,
      });
      store.createIndex("runId_timestamp", ["runId", "timestamp"], {
        unique: false,
      });
    }
    if (!db.objectStoreNames.contains(StoreName.AGENT_CHECKPOINTS)) {
      const store = db.createObjectStore(StoreName.AGENT_CHECKPOINTS, {
        keyPath: "checkpointId",
      });
      store.createIndex("runId", "runId", { unique: false });
      store.createIndex("checkpointSequence", "checkpointSequence", {
        unique: false,
      });
      store.createIndex("timestamp", "timestamp", { unique: false });
      store.createIndex("phase", "phase", { unique: false });
      store.createIndex(
        "runId_checkpointSequence",
        ["runId", "checkpointSequence"],
        { unique: false },
      );
    }
    if (!db.objectStoreNames.contains(StoreName.AGENT_APPROVALS)) {
      const store = db.createObjectStore(StoreName.AGENT_APPROVALS, {
        keyPath: "approvalId",
      });
      store.createIndex("runId", "runId", { unique: false });
      store.createIndex("status", "status", { unique: false });
      store.createIndex("createdAt", "createdAt", { unique: false });
      store.createIndex("resolvedAt", "resolvedAt", { unique: false });
    }
    if (!db.objectStoreNames.contains(StoreName.AGENT_ARTIFACTS)) {
      const store = db.createObjectStore(StoreName.AGENT_ARTIFACTS, {
        keyPath: "artifactId",
      });
      store.createIndex("runId", "runId", { unique: false });
      store.createIndex("artifactType", "artifactType", { unique: false });
      store.createIndex("targetKind", "targetKind", { unique: false });
      store.createIndex("targetId", "targetId", { unique: false });
      store.createIndex("runId_artifactType", ["runId", "artifactType"], {
        unique: false,
      });
      store.createIndex("runId_targetId", ["runId", "targetId"], {
        unique: false,
      });
      store.createIndex("updatedAt", "updatedAt", { unique: false });
    }
    if (!db.objectStoreNames.contains(StoreName.AGENT_MIGRATIONS)) {
      const store = db.createObjectStore(StoreName.AGENT_MIGRATIONS, {
        keyPath: "migrationKey",
      });
      store.createIndex("appliedAt", "appliedAt", { unique: false });
    }

    if (!db.objectStoreNames.contains(StoreName.GENERATED_REPORTS)) {
      const store = db.createObjectStore(StoreName.GENERATED_REPORTS, {
        keyPath: "reportId",
      });
      store.createIndex("pocketId", "pocketId", { unique: false });
      store.createIndex("generatedAt", "generatedAt", { unique: false });
    }

    if (!db.objectStoreNames.contains(StoreName.REPORT_SUPPORT_MAPS)) {
      const store = db.createObjectStore(StoreName.REPORT_SUPPORT_MAPS, {
        keyPath: "entryId",
      });
      store.createIndex("reportId", "reportId", { unique: false });
      store.createIndex("claimId", "claimId", { unique: false });
      store.createIndex("sectionId", "sectionId", { unique: false });
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

        // Check if message with same ID already exists
        const messageExists = existing.messages.some(
          (m: Message) => m.id === message.id,
        );

        logger.info("IndexedDBManager", "updateConversation check", {
          conversationId: id,
          messageId: message.id,
          messageExists,
          existingMessageCount: existing.messages.length,
          messageRole: message.role,
        });

        // Only add message if it doesn't already exist
        const updatedMessages = messageExists
          ? existing.messages.map((m: Message) =>
              m.id === message.id ? message : m,
            ) // Update existing message
          : [...existing.messages, message]; // Add new message

        const updated: Conversation = {
          ...existing,
          messages: updatedMessages,
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
          await metadataQueueManager.enqueueConversation(
            conversationId,
            "normal",
          );
          logger.debug("IndexedDBManager", "Queued metadata regeneration", {
            conversationId,
          });
        }
      } catch (error) {
        logger.warn(
          "IndexedDBManager",
          "Failed to queue metadata regeneration",
          {
            conversationId,
            error,
          },
        );
      }
    }, 0);
  }

  async updateConversationMetadata(
    id: string,
    metadata: ConversationMetadata,
  ): Promise<void> {
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

  async saveChunksBatch(
    chunks: Omit<StoredChunk, "createdAt">[],
  ): Promise<void> {
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
        const index = tx
          .objectStore(StoreName.VECTOR_CHUNKS)
          .index("contentId");
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

  // Conversation Pocket Attachment Operations

  /**
   * Attach a pocket to a conversation for RAG context retrieval
   * @param conversationId - ID of the conversation
   * @param pocketId - ID of the pocket to attach
   * @throws IndexedDBError if conversation or pocket not found
   */
  async attachPocketToConversation(
    conversationId: string,
    pocketId: string,
  ): Promise<void> {
    await this.executeTransaction(
      [StoreName.CONVERSATIONS, StoreName.POCKETS],
      "readwrite",
      async (tx) => {
        // Verify conversation exists
        const conversationStore = tx.objectStore(StoreName.CONVERSATIONS);
        const conversation = await this.promisifyRequest(
          conversationStore.get(conversationId),
        );

        if (!conversation) {
          throw new IndexedDBError(
            IndexedDBErrorType.NOT_FOUND,
            `Conversation ${conversationId} not found`,
          );
        }

        // Verify pocket exists
        const pocketStore = tx.objectStore(StoreName.POCKETS);
        const pocket = await this.promisifyRequest(pocketStore.get(pocketId));

        if (!pocket) {
          throw new IndexedDBError(
            IndexedDBErrorType.NOT_FOUND,
            `Pocket ${pocketId} not found`,
          );
        }

        // Migrate legacy attachedPocketId to attachedPocketIds if needed
        const attachedPocketIds = conversation.attachedPocketIds || [];
        if (
          conversation.attachedPocketId &&
          !attachedPocketIds.includes(conversation.attachedPocketId)
        ) {
          attachedPocketIds.push(conversation.attachedPocketId);
        }

        // Add new pocket if not already attached
        if (!attachedPocketIds.includes(pocketId)) {
          attachedPocketIds.push(pocketId);
        }

        // Update conversation with attached pockets
        const updated: Conversation = {
          ...conversation,
          attachedPocketIds,
          attachedPocketId: undefined, // Clear legacy field
          updatedAt: Date.now(),
        };

        await this.promisifyRequest(conversationStore.put(updated));
      },
    );

    logger.info("IndexedDBManager", "Pocket attached to conversation", {
      conversationId,
      pocketId,
    });
  }

  /**
   * Detach a specific pocket from a conversation
   * @param conversationId - ID of the conversation
   * @param pocketId - ID of the pocket to detach (optional, if not provided detaches all)
   * @throws IndexedDBError if conversation not found
   */
  async detachPocketFromConversation(
    conversationId: string,
    pocketId?: string,
  ): Promise<void> {
    await this.executeTransaction(
      StoreName.CONVERSATIONS,
      "readwrite",
      async (tx) => {
        const store = tx.objectStore(StoreName.CONVERSATIONS);
        const conversation = await this.promisifyRequest(
          store.get(conversationId),
        );

        if (!conversation) {
          throw new IndexedDBError(
            IndexedDBErrorType.NOT_FOUND,
            `Conversation ${conversationId} not found`,
          );
        }

        // Migrate legacy attachedPocketId to attachedPocketIds if needed
        let attachedPocketIds = conversation.attachedPocketIds || [];
        if (
          conversation.attachedPocketId &&
          !attachedPocketIds.includes(conversation.attachedPocketId)
        ) {
          attachedPocketIds.push(conversation.attachedPocketId);
        }

        // Remove specific pocket or all pockets
        if (pocketId) {
          attachedPocketIds = attachedPocketIds.filter((id) => id !== pocketId);
        } else {
          attachedPocketIds = [];
        }

        // Update conversation
        const updated: Conversation = {
          ...conversation,
          attachedPocketIds,
          attachedPocketId: undefined, // Clear legacy field
          updatedAt: Date.now(),
        };

        await this.promisifyRequest(store.put(updated));
      },
    );

    logger.info("IndexedDBManager", "Pocket detached from conversation", {
      conversationId,
      pocketId: pocketId || "all",
    });
  }

  /**
   * Get all pockets attached to a conversation
   * @param conversationId - ID of the conversation
   * @returns Array of attached pockets or empty array if no pockets attached
   */
  async getAttachedPockets(conversationId: string): Promise<Pocket[]> {
    return this.executeTransaction(
      [StoreName.CONVERSATIONS, StoreName.POCKETS],
      "readonly",
      async (tx) => {
        const conversationStore = tx.objectStore(StoreName.CONVERSATIONS);
        const conversation = await this.promisifyRequest(
          conversationStore.get(conversationId),
        );

        if (!conversation) {
          return [];
        }

        // Migrate legacy attachedPocketId to attachedPocketIds if needed
        const attachedPocketIds = conversation.attachedPocketIds || [];
        if (
          conversation.attachedPocketId &&
          !attachedPocketIds.includes(conversation.attachedPocketId)
        ) {
          attachedPocketIds.push(conversation.attachedPocketId);
        }

        if (attachedPocketIds.length === 0) {
          return [];
        }

        // Fetch all attached pockets
        const pocketStore = tx.objectStore(StoreName.POCKETS);
        const pockets: Pocket[] = [];

        for (const pocketId of attachedPocketIds) {
          const pocket = await this.promisifyRequest(pocketStore.get(pocketId));
          if (pocket) {
            pockets.push(pocket);
          }
        }

        return pockets;
      },
    );
  }

  /**
   * Get the first pocket attached to a conversation (for backward compatibility)
   * @param conversationId - ID of the conversation
   * @returns Attached pocket or null if no pocket attached or conversation not found
   */
  async getAttachedPocket(conversationId: string): Promise<Pocket | null> {
    return this.executeTransaction(
      [StoreName.CONVERSATIONS, StoreName.POCKETS],
      "readonly",
      async (tx) => {
        const conversationStore = tx.objectStore(StoreName.CONVERSATIONS);
        const conversation = await this.promisifyRequest(
          conversationStore.get(conversationId),
        );

        if (!conversation) {
          return null;
        }

        // Migrate legacy attachedPocketId to attachedPocketIds if needed
        const attachedPocketIds = conversation.attachedPocketIds || [];
        if (
          conversation.attachedPocketId &&
          !attachedPocketIds.includes(conversation.attachedPocketId)
        ) {
          attachedPocketIds.push(conversation.attachedPocketId);
        }

        if (attachedPocketIds.length === 0) {
          return null;
        }

        // Return the first attached pocket for backward compatibility
        const pocketStore = tx.objectStore(StoreName.POCKETS);
        const pocket = await this.promisifyRequest(
          pocketStore.get(attachedPocketIds[0]),
        );

        return pocket || null;
      },
    );
  }

  /**
   * Get all attached pocket IDs for a conversation (lightweight version)
   * @param conversationId - ID of the conversation
   * @returns Array of attached pocket IDs or empty array
   */
  async getAttachedPocketIds(conversationId: string): Promise<string[]> {
    return this.executeTransaction(
      StoreName.CONVERSATIONS,
      "readonly",
      async (tx) => {
        const store = tx.objectStore(StoreName.CONVERSATIONS);
        const conversation = await this.promisifyRequest(
          store.get(conversationId),
        );

        if (!conversation) {
          return [];
        }

        // Migrate legacy attachedPocketId to attachedPocketIds if needed
        const attachedPocketIds = conversation.attachedPocketIds || [];
        if (
          conversation.attachedPocketId &&
          !attachedPocketIds.includes(conversation.attachedPocketId)
        ) {
          attachedPocketIds.push(conversation.attachedPocketId);
        }

        return attachedPocketIds;
      },
    );
  }

  /**
   * Get the first attached pocket ID for a conversation (for backward compatibility)
   * @param conversationId - ID of the conversation
   * @returns Attached pocket ID or null
   */
  async getAttachedPocketId(conversationId: string): Promise<string | null> {
    return this.executeTransaction(
      StoreName.CONVERSATIONS,
      "readonly",
      async (tx) => {
        const store = tx.objectStore(StoreName.CONVERSATIONS);
        const conversation = await this.promisifyRequest(
          store.get(conversationId),
        );

        if (!conversation) {
          return null;
        }

        // Migrate legacy attachedPocketId to attachedPocketIds if needed
        const attachedPocketIds = conversation.attachedPocketIds || [];
        if (
          conversation.attachedPocketId &&
          !attachedPocketIds.includes(conversation.attachedPocketId)
        ) {
          attachedPocketIds.push(conversation.attachedPocketId);
        }

        return attachedPocketIds.length > 0 ? attachedPocketIds[0] : null;
      },
    );
  }
}

export const indexedDBManager = new IndexedDBManager();
