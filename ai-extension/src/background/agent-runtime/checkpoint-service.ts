/**
 * Agent Runtime Checkpoint Service
 *
 * High-level service for agent run checkpointing, event persistence,
 * and resume-state reconstruction. Builds on top of `AgentRuntimeStore`
 * and the canonical reducer from `shared/agent-runtime/reducer`.
 *
 * Key responsibilities:
 *  - Append events with auto-incrementing per-run sequence numbers.
 *  - Create checkpoints with proper sequencing and phase denormalization.
 *  - Reconstruct full run state from the latest checkpoint for resume.
 *  - Provide a clean "resume context" for the orchestrator to pick up.
 *
 * @module background/agent-runtime/checkpoint-service
 */

import { AgentRuntimeStore } from "./store.js";
import { reduceAgentRunEvent } from "../../shared/agent-runtime/reducer.js";
import type {
  AgentRun,
  AgentRunEvent,
  AgentCheckpoint,
  BrowserActionCheckpointBoundary,
} from "../../shared/agent-runtime/contracts.js";
import type {
  AgentRunRecord,
  AgentRunEventRecord,
  AgentCheckpointRecord,
} from "../../storage/schema.js";

// ─── Types ──────────────────────────────────────────────────────────────────

/** Full context needed to resume an interrupted run. */
export interface ResumeContext {
  /** The latest persisted run record. */
  run: AgentRunRecord;
  /** The latest checkpoint snapshot (if any). */
  checkpoint: AgentCheckpointRecord | undefined;
  /** Events that occurred after the latest checkpoint (for replay). */
  pendingEvents: AgentRunEventRecord[];
  /** Whether the run was previously in a resumable state. */
  isResumable: boolean;
}

// ─── Service ────────────────────────────────────────────────────────────────

export class CheckpointService {
  private store: AgentRuntimeStore;

  constructor(store?: AgentRuntimeStore) {
    this.store = store ?? new AgentRuntimeStore();
  }

  // ── Event Persistence ─────────────────────────────────────────────────

  /**
   * Persist a canonical event with an auto-incrementing per-run sequence.
   *
   * Also updates the run record's `updatedAt` timestamp.
   */
  async appendEvent(event: AgentRunEvent): Promise<AgentRunEventRecord> {
    const sequence = await this.store.getNextSequence(event.runId);

    const record: AgentRunEventRecord = {
      eventId: event.eventId,
      runId: event.runId,
      timestamp: event.timestamp,
      sequence,
      eventType: event.type,
      payload: event,
    };

    await this.store.putEvent(record);

    // Update run's updatedAt
    const run = await this.store.getRun(event.runId);
    if (run) {
      run.updatedAt = event.timestamp;
      await this.store.putRun(run);
    }

    return record;
  }

  /**
   * Persist multiple events atomically (batch append).
   * Sequences are assigned in the order provided.
   */
  async appendEvents(events: AgentRunEvent[]): Promise<AgentRunEventRecord[]> {
    const records: AgentRunEventRecord[] = [];

    for (const event of events) {
      const record = await this.appendEvent(event);
      records.push(record);
    }

    return records;
  }

  // ── Checkpoint Creation ───────────────────────────────────────────────

  /**
   * Create a checkpoint from the current run state.
   *
   * @param run - The current run snapshot to persist.
   * @param trigger - What triggered this checkpoint (auto, manual, etc.).
   * @returns The persisted checkpoint record.
   */
  async saveCheckpoint(
    run: AgentRun,
    trigger: AgentCheckpoint["trigger"],
    boundary?: BrowserActionCheckpointBoundary,
  ): Promise<AgentCheckpointRecord> {
    const checkpointId = `${run.runId}-cp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const checkpointSequence = await this.store.getNextCheckpointSequence(
      run.runId,
    );

    // Record the current max event sequence so we can identify pending events later.
    // nextSequence is the *next* unused value, so the last persisted is nextSequence - 1.
    const nextEventSeq = await this.store.getNextSequence(run.runId);
    const lastPersistedEventSeq = nextEventSeq > 0 ? nextEventSeq - 1 : -1;

    const checkpoint: AgentCheckpoint = {
      checkpointId,
      runId: run.runId,
      snapshot: { ...run },
      timestamp: Date.now(),
      trigger,
      ...(boundary ? { boundary } : {}),
    };

    const record: AgentCheckpointRecord = {
      ...checkpoint,
      checkpointSequence,
      phase: run.phase,
      eventSequenceAtCheckpoint: lastPersistedEventSeq,
    };

    await this.store.putCheckpoint(record);

    // Update the run's latestCheckpointId
    const existingRun = await this.store.getRun(run.runId);
    if (existingRun) {
      existingRun.latestCheckpointId = checkpointId;
      existingRun.updatedAt = Date.now();
      await this.store.putRun(existingRun);
    }

    return record;
  }

  // ── Run Snapshot ──────────────────────────────────────────────────────

  /**
   * Load the latest persisted run record.
   */
  async loadRunSnapshot(runId: string): Promise<AgentRunRecord | undefined> {
    return this.store.getRun(runId);
  }

  // ── Resume Context ────────────────────────────────────────────────────

  /**
   * Build a full resume context for an interrupted run.
   *
   * This provides everything the orchestrator needs to pick up where it left off:
   *  1. The run record (latest persisted state).
   *  2. The latest checkpoint (snapshot of the run at checkpoint time).
   *  3. Any events that arrived after the latest checkpoint (pending replay).
   *  4. Whether the run is in a resumable state.
   */
  async loadResumeContext(runId: string): Promise<ResumeContext | undefined> {
    const run = await this.store.getRun(runId);
    if (!run) return undefined;

    const checkpoint = await this.store.getLatestCheckpoint(runId);
    const allEvents = await this.store.getOrderedEventsByRun(runId);

    // Determine which events are pending (after the latest checkpoint).
    // Use sequence-based filtering for deterministic replay — timestamps
    // may not be monotonically ordered (e.g. synthetic test timestamps).
    let pendingEvents: AgentRunEventRecord[] = [];
    if (checkpoint) {
      const seqCutoff = checkpoint.eventSequenceAtCheckpoint ?? -1;
      pendingEvents = allEvents.filter(
        (e) => e.sequence > seqCutoff,
      );
    } else {
      // No checkpoint → all events are pending
      pendingEvents = allEvents;
    }

    // A run is resumable if it's not in a terminal state
    const terminalStatuses = new Set(["completed", "failed", "cancelled"]);
    const isResumable = !terminalStatuses.has(run.status);

    return {
      run,
      checkpoint,
      pendingEvents,
      isResumable,
    };
  }

  /**
   * Reconstruct the run state by replaying events from the latest checkpoint.
   *
   * Uses the canonical reducer: checkpoint.snapshot + pending events → current state.
   */
  async reconstructRunState(runId: string): Promise<AgentRun | undefined> {
    const ctx = await this.loadResumeContext(runId);
    if (!ctx) return undefined;

    // Start from checkpoint snapshot or the persisted run record
    const baseState = ctx.checkpoint?.snapshot ?? ctx.run;

    // Replay pending events through the reducer
    if (ctx.pendingEvents.length === 0) {
      return baseState;
    }

    const pendingPayloads = ctx.pendingEvents.map((e) => e.payload);
    return pendingPayloads.reduce(
      (state, event) => reduceAgentRunEvent(state, event),
      baseState,
    );
  }
}
