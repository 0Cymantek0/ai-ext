/**
 * Agent Runtime Service — Phase 07-03 Unified Facade
 *
 * Wraps the canonical AgentRuntimeStore and reducer into a high-level
 * service that the service worker message handlers consume.
 *
 * This is the SINGLE runtime authority for all agent runs.
 * Legacy AriaController and AgentOrchestrator are adapted through this facade.
 *
 * @module background/agent-runtime/agent-runtime-service
 */

import { AgentRuntimeStore } from "./store.js";
import { PocketArtifactService } from "./pocket-artifact-service.js";
import { createAgentRun, reduceAgentRunEvent } from "../../shared/agent-runtime/reducer.js";
import type {
  AgentRun,
  AgentRunEvent,
  AgentRunMode,
  AgentRunStatus,
  AgentRunPhase,
  AgentTodoItem,
  AgentPendingApproval,
  AgentArtifactRef,
  AgentTerminalOutcome,
} from "../../shared/agent-runtime/contracts.js";
import type {
  AgentRunRecord,
  AgentRunEventRecord,
  AgentCheckpointRecord,
} from "../../storage/schema.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface StartRunOptions {
  mode: AgentRunMode;
  metadata?: Record<string, unknown> | undefined;
}

export interface AgentRunTimeline {
  run: AgentRun;
  events: AgentRunEventRecord[];
  checkpoints: AgentCheckpointRecord[];
}

// ─── Service ────────────────────────────────────────────────────────────────

export class AgentRuntimeService {
  private store: AgentRuntimeStore;
  private artifacts: PocketArtifactService;

  /** In-memory cache of active runs for fast reads. */
  private activeRuns = new Map<string, AgentRun>();

  constructor(store?: AgentRuntimeStore) {
    this.store = store ?? new AgentRuntimeStore();
    this.artifacts = new PocketArtifactService(this.store);
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────

  /**
   * Start a new canonical agent run.
   * Creates the run record, emits a `run.started` event, and persists both.
   */
  async startRun(options: StartRunOptions): Promise<AgentRun> {
    const now = Date.now();
    const runId = this.generateRunId();

    // Create run via reducer factory
    let run = createAgentRun(runId, options.mode, now);
    if (options.metadata) {
      run = { ...run, metadata: { ...run.metadata, ...options.metadata } };
    }

    // Emit the `run.started` event
    const startEvent: AgentRunEvent = {
      eventId: `evt-${runId}-0`,
      runId,
      timestamp: now,
      type: "run.started",
      mode: options.mode,
    };

    run = reduceAgentRunEvent(run, startEvent);

    // Persist run record
    await this.store.putRun(this.toRunRecord(run));

    // Persist event record
    await this.store.putEvent({
      eventId: startEvent.eventId,
      runId,
      timestamp: now,
      sequence: 0,
      eventType: startEvent.type,
      payload: startEvent,
    });

    this.activeRuns.set(runId, run);
    return run;
  }

  /**
   * Apply a canonical event to a run, persist it, and return the updated run.
   */
  async applyEvent(event: AgentRunEvent): Promise<AgentRun> {
    let run = this.activeRuns.get(event.runId);

    if (!run) {
      // Try loading from store
      const record = await this.store.getRun(event.runId);
      if (!record) {
        throw new Error(`Run not found: ${event.runId}`);
      }
      run = this.fromRunRecord(record);
    }

    // Apply reducer
    const nextRun = reduceAgentRunEvent(run, event);

    // Persist event
    const nextSeq = await this.store.getNextSequence(event.runId);
    await this.store.putEvent({
      eventId: event.eventId,
      runId: event.runId,
      timestamp: event.timestamp,
      sequence: nextSeq,
      eventType: event.type,
      payload: event,
    });

    // Persist updated run
    await this.store.putRun(this.toRunRecord(nextRun));
    this.activeRuns.set(event.runId, nextRun);

    return nextRun;
  }

  // ── Control ─────────────────────────────────────────────────────────────

  /**
   * Pause a running agent run.
   */
  async pauseRun(runId: string): Promise<AgentRun> {
    const run = await this.getRunOrThrow(runId);
    if (run.status !== "running") {
      throw new Error(`Cannot pause run in status: ${run.status}`);
    }

    const now = Date.now();
    const event: AgentRunEvent = {
      eventId: `evt-${runId}-pause-${now}`,
      runId,
      timestamp: now,
      type: "run.phase_changed",
      fromPhase: run.phase,
      toPhase: run.phase, // Phase doesn't change on pause
    };

    const updated = reduceAgentRunEvent(run, event);
    const paused: AgentRun = { ...updated, status: "paused" };

    await this.store.putRun(this.toRunRecord(paused));
    this.activeRuns.set(runId, paused);
    return paused;
  }

  /**
   * Resume a paused agent run.
   */
  async resumeRun(runId: string): Promise<AgentRun> {
    const run = await this.getRunOrThrow(runId);
    if (run.status !== "paused") {
      throw new Error(`Cannot resume run in status: ${run.status}`);
    }

    const resumed: AgentRun = { ...run, status: "running", updatedAt: Date.now() };
    await this.store.putRun(this.toRunRecord(resumed));
    this.activeRuns.set(runId, resumed);
    return resumed;
  }

  /**
   * Cancel a running or paused agent run.
   */
  async cancelRun(runId: string, reason?: string): Promise<AgentRun> {
    const run = await this.getRunOrThrow(runId);
    if (run.status === "completed" || run.status === "cancelled" || run.status === "failed") {
      return run; // Already terminal
    }

    const now = Date.now();
    const outcome: AgentTerminalOutcome = {
      status: "cancelled",
      reason: reason ?? "User cancelled",
      finishedAt: now,
    };

    const event: AgentRunEvent = {
      eventId: `evt-${runId}-cancel-${now}`,
      runId,
      timestamp: now,
      type: "run.cancelled",
      outcome,
    };

    return this.applyEvent(event);
  }

  // ── Queries ─────────────────────────────────────────────────────────────

  /**
   * Get a run by ID (from cache or store).
   */
  async getRun(runId: string): Promise<AgentRun | undefined> {
    const cached = this.activeRuns.get(runId);
    if (cached) return cached;

    const record = await this.store.getRun(runId);
    if (!record) return undefined;

    const run = this.fromRunRecord(record);
    this.activeRuns.set(runId, run);
    return run;
  }

  /**
   * Get the full timeline for a run (run state + ordered events + checkpoints).
   */
  async getTimeline(runId: string): Promise<AgentRunTimeline | undefined> {
    const run = await this.getRun(runId);
    if (!run) return undefined;

    const events = await this.store.getOrderedEventsByRun(runId);
    const checkpoints = await this.store.getCheckpointsByRun(runId);

    return { run, events, checkpoints };
  }

  /**
   * List all runs, optionally filtered by status.
   */
  async listRuns(status?: AgentRunStatus): Promise<AgentRun[]> {
    const records = status
      ? await this.store.listRunsByStatus(status)
      : await this.store.listAllRuns();

    return records.map((r) => this.fromRunRecord(r));
  }

  /**
   * List runs by mode.
   */
  async listRunsByMode(mode: AgentRunMode): Promise<AgentRun[]> {
    const records = await this.store.listRunsByMode(mode);
    return records.map((r) => this.fromRunRecord(r));
  }

  // ── Artifact Access ─────────────────────────────────────────────────────

  /** Get the underlying PocketArtifactService for artifact projection. */
  getArtifactService(): PocketArtifactService {
    return this.artifacts;
  }

  // ── Cleanup ─────────────────────────────────────────────────────────────

  /** Close the underlying database connection. */
  async close(): Promise<void> {
    await this.store.close();
    this.activeRuns.clear();
  }

  // ── Internal Helpers ──────────────────────────────────────────────────

  private async getRunOrThrow(runId: string): Promise<AgentRun> {
    const run = await this.getRun(runId);
    if (!run) throw new Error(`Run not found: ${runId}`);
    return run;
  }

  private toRunRecord(run: AgentRun): AgentRunRecord {
    return {
      runId: run.runId,
      mode: run.mode,
      status: run.status,
      phase: run.phase,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
      todoItems: run.todoItems,
      pendingApproval: run.pendingApproval,
      artifactRefs: run.artifactRefs,
      latestCheckpointId: run.latestCheckpointId,
      terminalOutcome: run.terminalOutcome,
      metadata: run.metadata,
    };
  }

  private fromRunRecord(record: AgentRunRecord): AgentRun {
    return {
      runId: record.runId,
      mode: record.mode as AgentRunMode,
      status: record.status as AgentRunStatus,
      phase: record.phase as AgentRunPhase,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      todoItems: (record.todoItems ?? []) as AgentTodoItem[],
      pendingApproval: (record.pendingApproval ?? null) as AgentPendingApproval | null,
      artifactRefs: (record.artifactRefs ?? []) as AgentArtifactRef[],
      latestCheckpointId: (record.latestCheckpointId ?? null) as string | null,
      terminalOutcome: (record.terminalOutcome ?? null) as AgentTerminalOutcome | null,
      metadata: (record.metadata ?? {}) as Record<string, unknown>,
    };
  }

  private generateRunId(): string {
    const globalCrypto = globalThis.crypto as Crypto | undefined;
    if (globalCrypto && typeof globalCrypto.randomUUID === "function") {
      return globalCrypto.randomUUID();
    }
    return `run-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
  }
}
