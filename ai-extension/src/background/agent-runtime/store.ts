/**
 * Agent Runtime Store — Canonical Persistence Layer
 *
 * Typed CRUD operations for all 6 canonical agent runtime IndexedDB stores.
 * This is the single authoritative persistence surface for the unified runtime;
 * all reads/writes MUST go through this module (or the services that wrap it).
 *
 * @module background/agent-runtime/store
 */

import type { IDBPDatabase } from "idb";
import {
  STORE_NAMES,
  createDatabaseManager,
  type AiPocketDBSchema,
  type AgentRunRecord,
  type AgentRunEventRecord,
  type AgentCheckpointRecord,
  type AgentApprovalRecord,
  type AgentArtifactRecord,
  type AgentMigrationRecord,
} from "../../storage/schema.js";

// ─── AgentRuntimeStore ──────────────────────────────────────────────────────

/**
 * Low-level, typed CRUD adapter for the 6 canonical agent runtime stores.
 *
 * Design notes:
 *  - Uses a single cached connection for efficiency.
 *  - Call `close()` to release the connection (important for test teardown).
 *  - No caching of data — callers (checkpoint-service, migration) own cache.
 *  - All writes are atomic within their own transaction scope.
 */
export class AgentRuntimeStore {
  private dbPromise: Promise<IDBPDatabase<AiPocketDBSchema>> | null = null;
  private readonly databaseManager = createDatabaseManager();

  /**
   * Get (or lazily open) the shared database connection.
   */
  private getDb(): Promise<IDBPDatabase<AiPocketDBSchema>> {
    if (!this.dbPromise) {
      this.dbPromise = this.databaseManager.open();
    }
    return this.dbPromise;
  }

  /**
   * Close the database connection. Call this during teardown or shutdown.
   */
  async close(): Promise<void> {
    if (this.dbPromise) {
      await this.databaseManager.close();
      this.dbPromise = null;
    }
  }

  // ── AgentRuns ───────────────────────────────────────────────────────────

  async putRun(record: AgentRunRecord): Promise<void> {
    const db = await this.getDb();
    await db.put(STORE_NAMES.AGENT_RUNS, record);
  }

  async getRun(runId: string): Promise<AgentRunRecord | undefined> {
    const db = await this.getDb();
    return db.get(STORE_NAMES.AGENT_RUNS, runId);
  }

  async deleteRun(runId: string): Promise<void> {
    const db = await this.getDb();
    await db.delete(STORE_NAMES.AGENT_RUNS, runId);
  }

  async listRunsByStatus(status: string): Promise<AgentRunRecord[]> {
    const db = await this.getDb();
    return db.getAllFromIndex(STORE_NAMES.AGENT_RUNS, "status", status);
  }

  async listRunsByMode(mode: string): Promise<AgentRunRecord[]> {
    const db = await this.getDb();
    return db.getAllFromIndex(STORE_NAMES.AGENT_RUNS, "mode", mode);
  }

  async listAllRuns(): Promise<AgentRunRecord[]> {
    const db = await this.getDb();
    return db.getAll(STORE_NAMES.AGENT_RUNS);
  }

  // ── AgentRunEvents ──────────────────────────────────────────────────────

  async putEvent(record: AgentRunEventRecord): Promise<void> {
    const db = await this.getDb();
    await db.put(STORE_NAMES.AGENT_RUN_EVENTS, record);
  }

  async getEvent(eventId: string): Promise<AgentRunEventRecord | undefined> {
    const db = await this.getDb();
    return db.get(STORE_NAMES.AGENT_RUN_EVENTS, eventId);
  }

  async getEventsByRun(runId: string): Promise<AgentRunEventRecord[]> {
    const db = await this.getDb();
    return db.getAllFromIndex(STORE_NAMES.AGENT_RUN_EVENTS, "runId", runId);
  }

  /**
   * Returns all events for a run, ordered by sequence ascending.
   * Uses the compound index `runId_sequence` for efficient retrieval.
   */
  async getOrderedEventsByRun(runId: string): Promise<AgentRunEventRecord[]> {
    const db = await this.getDb();
    const tx = db.transaction(STORE_NAMES.AGENT_RUN_EVENTS, "readonly");
    const index = tx.store.index("runId_sequence");
    const results: AgentRunEventRecord[] = [];

    const range = IDBKeyRange.bound([runId, 0], [runId, Number.MAX_SAFE_INTEGER]);
    let cursor = await index.openCursor(range);

    while (cursor) {
      results.push(cursor.value);
      cursor = await cursor.continue();
    }

    return results;
  }

  /**
   * Returns the next available sequence number for a run.
   */
  async getNextSequence(runId: string): Promise<number> {
    const db = await this.getDb();
    const tx = db.transaction(STORE_NAMES.AGENT_RUN_EVENTS, "readonly");
    const index = tx.store.index("runId_sequence");

    const range = IDBKeyRange.bound([runId, 0], [runId, Number.MAX_SAFE_INTEGER]);
    const cursor = await index.openCursor(range, "prev");

    if (cursor) {
      return cursor.value.sequence + 1;
    }
    return 0;
  }

  // ── AgentCheckpoints ────────────────────────────────────────────────────

  async putCheckpoint(record: AgentCheckpointRecord): Promise<void> {
    const db = await this.getDb();
    await db.put(STORE_NAMES.AGENT_CHECKPOINTS, record);
  }

  async getCheckpoint(
    checkpointId: string,
  ): Promise<AgentCheckpointRecord | undefined> {
    const db = await this.getDb();
    return db.get(STORE_NAMES.AGENT_CHECKPOINTS, checkpointId);
  }

  async getCheckpointsByRun(runId: string): Promise<AgentCheckpointRecord[]> {
    const db = await this.getDb();
    return db.getAllFromIndex(STORE_NAMES.AGENT_CHECKPOINTS, "runId", runId);
  }

  /**
   * Returns the latest checkpoint for a run (highest checkpointSequence).
   */
  async getLatestCheckpoint(
    runId: string,
  ): Promise<AgentCheckpointRecord | undefined> {
    const db = await this.getDb();
    const tx = db.transaction(STORE_NAMES.AGENT_CHECKPOINTS, "readonly");
    const index = tx.store.index("runId_checkpointSequence");

    const range = IDBKeyRange.bound(
      [runId, 0],
      [runId, Number.MAX_SAFE_INTEGER],
    );
    const cursor = await index.openCursor(range, "prev");
    return cursor?.value;
  }

  /**
   * Returns the next checkpoint sequence for a run.
   */
  async getNextCheckpointSequence(runId: string): Promise<number> {
    const latest = await this.getLatestCheckpoint(runId);
    return latest ? latest.checkpointSequence + 1 : 0;
  }

  // ── AgentApprovals ──────────────────────────────────────────────────────

  async putApproval(record: AgentApprovalRecord): Promise<void> {
    const db = await this.getDb();
    await db.put(STORE_NAMES.AGENT_APPROVALS, record);
  }

  async getApproval(
    approvalId: string,
  ): Promise<AgentApprovalRecord | undefined> {
    const db = await this.getDb();
    return db.get(STORE_NAMES.AGENT_APPROVALS, approvalId);
  }

  async getApprovalsByRun(runId: string): Promise<AgentApprovalRecord[]> {
    const db = await this.getDb();
    return db.getAllFromIndex(STORE_NAMES.AGENT_APPROVALS, "runId", runId);
  }

  async getPendingApprovals(): Promise<AgentApprovalRecord[]> {
    const db = await this.getDb();
    return db.getAllFromIndex(STORE_NAMES.AGENT_APPROVALS, "status", "pending");
  }

  // ── AgentArtifacts ──────────────────────────────────────────────────────

  async putArtifact(record: AgentArtifactRecord): Promise<void> {
    const db = await this.getDb();
    await db.put(STORE_NAMES.AGENT_ARTIFACTS, record);
  }

  async getArtifact(
    artifactId: string,
  ): Promise<AgentArtifactRecord | undefined> {
    const db = await this.getDb();
    return db.get(STORE_NAMES.AGENT_ARTIFACTS, artifactId);
  }

  async getArtifactsByRun(runId: string): Promise<AgentArtifactRecord[]> {
    const db = await this.getDb();
    return db.getAllFromIndex(STORE_NAMES.AGENT_ARTIFACTS, "runId", runId);
  }

  async getArtifactsByType(
    artifactType: string,
  ): Promise<AgentArtifactRecord[]> {
    const db = await this.getDb();
    return db.getAllFromIndex(
      STORE_NAMES.AGENT_ARTIFACTS,
      "artifactType",
      artifactType,
    );
  }

  // ── AgentMigrations (ledger) ────────────────────────────────────────────

  async putMigration(record: AgentMigrationRecord): Promise<void> {
    const db = await this.getDb();
    await db.put(STORE_NAMES.AGENT_MIGRATIONS, record);
  }

  async getMigration(
    migrationKey: string,
  ): Promise<AgentMigrationRecord | undefined> {
    const db = await this.getDb();
    return db.get(STORE_NAMES.AGENT_MIGRATIONS, migrationKey);
  }

  async listMigrations(): Promise<AgentMigrationRecord[]> {
    const db = await this.getDb();
    return db.getAll(STORE_NAMES.AGENT_MIGRATIONS);
  }

  /**
   * Check whether a migration key has already been applied.
   */
  async isMigrationApplied(migrationKey: string): Promise<boolean> {
    const record = await this.getMigration(migrationKey);
    return record !== undefined;
  }

  // ── Bulk operations ─────────────────────────────────────────────────────

  /**
   * Delete all data for a run across all canonical stores in a single transaction.
   * Used for cleanup and test teardown.
   */
  async deleteRunCascade(runId: string): Promise<void> {
    const db = await this.getDb();
    const storeNames = [
      STORE_NAMES.AGENT_RUNS,
      STORE_NAMES.AGENT_RUN_EVENTS,
      STORE_NAMES.AGENT_CHECKPOINTS,
      STORE_NAMES.AGENT_APPROVALS,
      STORE_NAMES.AGENT_ARTIFACTS,
    ] as const;

    const tx = db.transaction([...storeNames], "readwrite");

    // Delete the run itself
    await tx.objectStore(STORE_NAMES.AGENT_RUNS).delete(runId);

    // Delete events by runId index
    const eventIndex = tx
      .objectStore(STORE_NAMES.AGENT_RUN_EVENTS)
      .index("runId");
    let eventCursor = await eventIndex.openCursor(runId);
    while (eventCursor) {
      await eventCursor.delete();
      eventCursor = await eventCursor.continue();
    }

    // Delete checkpoints by runId index
    const cpIndex = tx
      .objectStore(STORE_NAMES.AGENT_CHECKPOINTS)
      .index("runId");
    let cpCursor = await cpIndex.openCursor(runId);
    while (cpCursor) {
      await cpCursor.delete();
      cpCursor = await cpCursor.continue();
    }

    // Delete approvals by runId index
    const apIndex = tx
      .objectStore(STORE_NAMES.AGENT_APPROVALS)
      .index("runId");
    let apCursor = await apIndex.openCursor(runId);
    while (apCursor) {
      await apCursor.delete();
      apCursor = await apCursor.continue();
    }

    // Delete artifacts by runId index
    const artIndex = tx
      .objectStore(STORE_NAMES.AGENT_ARTIFACTS)
      .index("runId");
    let artCursor = await artIndex.openCursor(runId);
    while (artCursor) {
      await artCursor.delete();
      artCursor = await artCursor.continue();
    }

    await tx.done;
  }
}
