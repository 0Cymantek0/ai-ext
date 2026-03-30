/**
 * Agent Runtime Migration — Import-Once Grandfathering
 *
 * Reads legacy `browserAgentWorkflows` and `browserAgentCheckpoints` stores
 * (read-only) and creates minimal canonical `agentRuns` records with a
 * `run.imported` event for provenance tracking.
 *
 * Design decisions:
 *  - Grandfathering, not deep translation: we import minimal provenance
 *    (`run.imported`) rather than attempting lossy full-data translation.
 *  - Legacy stores are treated as READ-ONLY; never modified.
 *  - Idempotent: uses the `agentMigrations` ledger with key `agent-runtime-v1`.
 *  - If the ledger entry exists, migration is a no-op.
 *
 * @module background/agent-runtime/migration
 */

import { openDB, type IDBPDatabase } from "idb";
import { AgentRuntimeStore } from "./store.js";
import {
  STORE_NAMES,
  type AiPocketDBSchema,
  type AgentRunRecord,
  type AgentRunEventRecord,
} from "../../storage/schema.js";
import type {
  AgentRunMode,
  AgentRunEvent,
  RunImportedEvent,
  RunStartedEvent,
} from "../../shared/agent-runtime/contracts.js";

// ─── Constants ──────────────────────────────────────────────────────────────

const MIGRATION_KEY = "agent-runtime-v1";
const DB_NAME = "ai-pocket-db";
const DB_VERSION = 5;

// ─── Types ──────────────────────────────────────────────────────────────────

/** Summary of a migration run. */
export interface MigrationResult {
  /** Whether the migration was actually executed (false = already applied). */
  executed: boolean;
  /** Number of legacy workflows imported. */
  importedRunCount: number;
  /** IDs of newly created canonical runs. */
  importedRunIds: string[];
  /** Any errors encountered during migration (non-fatal). */
  errors: Array<{ legacyId: string; error: string }>;
}

// ─── Legacy Shape (read-only) ───────────────────────────────────────────────

/**
 * Minimal shape we read from the legacy `browserAgentWorkflows` store.
 * We only extract what we need for provenance — no full translation.
 */
interface LegacyWorkflow {
  workflowId: string;
  status: string;
  startTime: number;
  lastUpdate: number;
  currentStep: string;
  completedSteps: string[];
  variables?: Record<string, unknown>;
}

// ─── Migration Implementation ───────────────────────────────────────────────

/**
 * Runs the import-once migration from legacy browser-agent stores to
 * the canonical agent runtime stores.
 *
 * @param store - The canonical store to write to (defaults to new instance).
 * @returns A summary of what was migrated.
 */
export async function runAgentRuntimeMigration(
  store?: AgentRuntimeStore,
): Promise<MigrationResult> {
  const runtimeStore = store ?? new AgentRuntimeStore();

  // Check idempotency — skip if already applied
  const alreadyApplied = await runtimeStore.isMigrationApplied(MIGRATION_KEY);
  if (alreadyApplied) {
    return {
      executed: false,
      importedRunCount: 0,
      importedRunIds: [],
      errors: [],
    };
  }

  const result: MigrationResult = {
    executed: true,
    importedRunCount: 0,
    importedRunIds: [],
    errors: [],
  };

  // Read legacy workflows
  const legacyWorkflows = await readLegacyWorkflows();

  for (const legacy of legacyWorkflows) {
    try {
      await importLegacyWorkflow(runtimeStore, legacy);
      result.importedRunCount++;
      result.importedRunIds.push(legacy.workflowId);
    } catch (error) {
      result.errors.push({
        legacyId: legacy.workflowId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Write the ledger entry to mark migration as complete
  await runtimeStore.putMigration({
    migrationKey: MIGRATION_KEY,
    appliedAt: Date.now(),
    metadata: {
      importedCount: result.importedRunCount,
      errorCount: result.errors.length,
      legacyIds: result.importedRunIds,
    },
  });

  return result;
}

/**
 * Check whether the migration has already been applied.
 */
export async function isMigrationApplied(
  store?: AgentRuntimeStore,
): Promise<boolean> {
  const runtimeStore = store ?? new AgentRuntimeStore();
  return runtimeStore.isMigrationApplied(MIGRATION_KEY);
}

// ─── Internal Helpers ───────────────────────────────────────────────────────

/**
 * Read all legacy workflows from the browserAgentWorkflows store.
 */
async function readLegacyWorkflows(): Promise<LegacyWorkflow[]> {
  const db = await openDB<AiPocketDBSchema>(DB_NAME, DB_VERSION);

  try {
    // Check if legacy store exists
    if (!db.objectStoreNames.contains(STORE_NAMES.BROWSER_AGENT_WORKFLOWS)) {
      return [];
    }

    const tx = db.transaction(STORE_NAMES.BROWSER_AGENT_WORKFLOWS, "readonly");
    const store = tx.objectStore(STORE_NAMES.BROWSER_AGENT_WORKFLOWS);
    const all = await store.getAll();
    await tx.done;

    return all.map((record) => ({
      workflowId: record.workflowId,
      status: record.status,
      startTime: record.startTime,
      lastUpdate: record.lastUpdate,
      currentStep: record.currentStep,
      completedSteps: record.completedSteps,
      variables: record.variables,
    }));
  } finally {
    db.close();
  }
}

/**
 * Import a single legacy workflow as a canonical agent run.
 *
 * Creates:
 *  1. An AgentRunRecord with status mapped from legacy status.
 *  2. A `run.started` event marking the original creation.
 *  3. A `run.imported` event documenting the migration provenance.
 */
async function importLegacyWorkflow(
  store: AgentRuntimeStore,
  legacy: LegacyWorkflow,
): Promise<void> {
  const now = Date.now();
  const runId = legacy.workflowId; // Preserve the same ID for traceability

  // Check if this run was already imported (defensive)
  const existing = await store.getRun(runId);
  if (existing) return;

  // Map legacy status to canonical status
  const statusMap: Record<string, string> = {
    pending: "pending",
    running: "running",
    paused: "paused",
    completed: "completed",
    failed: "failed",
    cancelled: "cancelled",
  };
  const canonicalStatus = (statusMap[legacy.status] ?? "completed") as AgentRunRecord["status"];

  // Determine terminal outcome if applicable
  const terminalStatuses = new Set(["completed", "failed", "cancelled"]);
  const terminalOutcome = terminalStatuses.has(canonicalStatus)
    ? {
        status: canonicalStatus as "completed" | "failed" | "cancelled",
        reason: `Imported from legacy browserAgentWorkflows`,
        finishedAt: legacy.lastUpdate,
      }
    : null;

  // Create the canonical run record
  const runRecord: AgentRunRecord = {
    runId,
    mode: "browser-action" as AgentRunMode,
    status: canonicalStatus,
    phase: "finalizing", // Legacy workflows are treated as post-execution
    createdAt: legacy.startTime,
    updatedAt: now,
    todoItems: [],
    pendingApproval: null,
    artifactRefs: [],
    latestCheckpointId: null,
    terminalOutcome,
    metadata: {
      importedFrom: "browserAgentWorkflows",
      legacyCurrentStep: legacy.currentStep,
      legacyCompletedSteps: legacy.completedSteps,
    },
  };

  await store.putRun(runRecord);

  // Create a run.started event with the original timestamp
  const startedEvent: RunStartedEvent = {
    eventId: `${runId}-evt-started-${legacy.startTime}`,
    runId,
    timestamp: legacy.startTime,
    type: "run.started",
    mode: "browser-action",
  };

  const startedRecord: AgentRunEventRecord = {
    eventId: startedEvent.eventId,
    runId,
    timestamp: startedEvent.timestamp,
    sequence: 0,
    eventType: startedEvent.type,
    payload: startedEvent,
  };

  await store.putEvent(startedRecord);

  // Create a run.imported event for provenance
  const importedEvent: RunImportedEvent = {
    eventId: `${runId}-evt-imported-${now}`,
    runId,
    timestamp: now,
    type: "run.imported",
    sourceRunId: legacy.workflowId,
    sourceMode: "browser-action",
    migratedFields: [
      "status",
      "startTime",
      "lastUpdate",
      "currentStep",
      "completedSteps",
    ],
  };

  const importedRecord: AgentRunEventRecord = {
    eventId: importedEvent.eventId,
    runId,
    timestamp: importedEvent.timestamp,
    sequence: 1,
    eventType: importedEvent.type,
    payload: importedEvent,
  };

  await store.putEvent(importedRecord);
}
