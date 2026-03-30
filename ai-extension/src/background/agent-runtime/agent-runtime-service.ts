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
import { CheckpointService } from "./checkpoint-service.js";
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
  BrowserActionRunMetadata,
  BrowserActionCheckpointBoundary,
  AgentCheckpoint,
} from "../../shared/agent-runtime/contracts.js";
import type {
  AgentRunRecord,
  AgentRunEventRecord,
  AgentCheckpointRecord,
} from "../../storage/schema.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface StartRunOptions {
  runId?: string | undefined;
  mode: AgentRunMode;
  metadata?: Record<string, unknown> | undefined;
}

export interface AgentRunTimeline {
  run: AgentRun;
  events: AgentRunEventRecord[];
  checkpoints: AgentCheckpointRecord[];
}

export interface BrowserToolStartOptions {
  requiresHumanApproval?: boolean | undefined;
}

export interface BrowserToolFailureOptions {
  toolName: string;
  error: string;
  durationMs?: number | undefined;
  code?: string | undefined;
  recoverable?: boolean | undefined;
  blockedByPolicy?: boolean | undefined;
  retryCount?: number | undefined;
}

// ─── Service ────────────────────────────────────────────────────────────────

export class AgentRuntimeService {
  private store: AgentRuntimeStore;
  private artifacts: PocketArtifactService;
  private checkpoints: CheckpointService;

  /** In-memory cache of active runs for fast reads. */
  private activeRuns = new Map<string, AgentRun>();

  constructor(store?: AgentRuntimeStore) {
    this.store = store ?? new AgentRuntimeStore();
    this.artifacts = new PocketArtifactService(this.store);
    this.checkpoints = new CheckpointService(this.store);
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────

  /**
   * Start a new canonical agent run.
   * Creates the run record, emits a `run.started` event, and persists both.
   */
  async startRun(options: StartRunOptions): Promise<AgentRun> {
    const now = Date.now();
    const runId = options.runId ?? this.generateRunId();

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

    if (options.mode === "browser-action") {
      run = await this.bootstrapBrowserActionRun(run);
    }

    return (await this.getRun(runId)) ?? run;
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

    await this.saveNamedCheckpoint(run, "paused", "manual");

    const paused: AgentRun = {
      ...run,
      status: "paused",
      updatedAt: Date.now(),
    };

    await this.persistRun(paused);
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

    const reconstructed =
      (await this.checkpoints.reconstructRunState(runId)) ?? run;
    const resumed: AgentRun = {
      ...reconstructed,
      status: "running",
      updatedAt: Date.now(),
    };

    await this.persistRun(resumed);

    const resumedWithIntent = this.updateBrowserMetadata(resumed, {
      currentIntent:
        (resumed.metadata.currentIntent as string | undefined) ?? "Resume browser-action run",
    });
    await this.persistRun(resumedWithIntent);
    await this.saveNamedCheckpoint(resumedWithIntent, "resumed", "manual");
    return resumedWithIntent;
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

  async appendBrowserToolEvent(
    event: Extract<
      AgentRunEvent,
      { type: "tool.called" | "tool.completed" | "tool.failed" }
    >,
  ): Promise<AgentRun> {
    const run = await this.applyEvent(event);

    if (event.checkpointBoundary) {
      await this.saveNamedCheckpoint(
        run,
        event.checkpointBoundary,
        event.type === "tool.failed" ? "manual" : "auto",
      );
    }

    return run;
  }

  async beginBrowserActionToolCall(
    runId: string,
    toolName: string,
    toolArgs: Record<string, unknown>,
    options: BrowserToolStartOptions = {},
  ): Promise<AgentRun> {
    if (options.requiresHumanApproval) {
      return this.recordBrowserActionToolFailure(runId, {
        toolName,
        error: `Blocked pending approval for ${toolName}`,
        code: "ACTION_BLOCKED",
        blockedByPolicy: true,
        recoverable: true,
      });
    }

    let run = await this.appendBrowserToolEvent({
      eventId: `evt-${runId}-tool-called-${Date.now()}`,
      runId,
      timestamp: Date.now(),
      type: "tool.called",
      toolName,
      toolArgs,
      checkpointBoundary: "tool-dispatch",
      requiresHumanApproval: false,
    });

    run = this.updateBrowserMetadata(run, {
      lastToolName: toolName,
      currentIntent: `Execute ${toolName}`,
    });
    await this.persistRun(run);
    return run;
  }

  async completeBrowserActionToolCall(
    runId: string,
    toolName: string,
    result: unknown,
    durationMs: number,
  ): Promise<AgentRun> {
    let run = await this.appendBrowserToolEvent({
      eventId: `evt-${runId}-tool-completed-${Date.now()}`,
      runId,
      timestamp: Date.now(),
      type: "tool.completed",
      toolName,
      result,
      durationMs,
      checkpointBoundary: "tool-result",
    });

    run = this.updateBrowserMetadata(run, {
      lastToolName: toolName,
      currentIntent: `Review result from ${toolName}`,
    });
    await this.persistRun(run);
    return run;
  }

  async recordBrowserActionToolFailure(
    runId: string,
    options: BrowserToolFailureOptions,
  ): Promise<AgentRun> {
    const failureEvent: Extract<AgentRunEvent, { type: "tool.failed" }> = {
      eventId: `evt-${runId}-tool-failed-${Date.now()}`,
      runId,
      timestamp: Date.now(),
      type: "tool.failed",
      toolName: options.toolName,
      error: options.error,
      durationMs: options.durationMs ?? 0,
      checkpointBoundary: "tool-result",
      ...(options.code ? { code: options.code } : {}),
      ...(options.recoverable !== undefined
        ? { recoverable: options.recoverable }
        : {}),
      ...(options.blockedByPolicy !== undefined
        ? { blockedByPolicy: options.blockedByPolicy }
        : {}),
    };

    let run = await this.appendBrowserToolEvent(failureEvent);

    const retryCount = options.retryCount ?? 0;
    run = this.updateBrowserMetadata(run, {
      lastToolName: options.toolName,
      lastError: options.error,
      retryCount,
      currentIntent:
        options.blockedByPolicy || options.recoverable
          ? `Retry or replan after ${options.toolName}`
          : `Terminal failure in ${options.toolName}`,
    });
    await this.persistRun(run);

    if (options.blockedByPolicy || options.recoverable) {
      run = await this.applyEvent({
        eventId: `evt-${runId}-retry-planned-${Date.now()}`,
        runId,
        timestamp: Date.now(),
        type: "run.phase_changed",
        fromPhase: run.phase,
        toPhase: "planning",
        reason: "retry-planned",
        detail: options.blockedByPolicy
          ? `Blocked ${options.toolName}; waiting for safer alternative`
          : `Retry planned for ${options.toolName}`,
      });

      run = this.updateBrowserMetadata(run, {
        retryCount,
        currentIntent: options.blockedByPolicy
          ? `Blocked ${options.toolName}; select safer action`
          : `Retry ${options.toolName}`,
      });
      await this.persistRun(run);
      await this.saveNamedCheckpoint(run, "retry-planned", "manual");
      return run;
    }

    return this.applyEvent({
      eventId: `evt-${runId}-run-failed-${Date.now()}`,
      runId,
      timestamp: Date.now(),
      type: "run.failed",
      outcome: {
        status: "failed",
        reason: options.error,
        finishedAt: Date.now(),
      },
    });
  }

  // ── Internal Helpers ──────────────────────────────────────────────────

  private async getRunOrThrow(runId: string): Promise<AgentRun> {
    const run = await this.getRun(runId);
    if (!run) throw new Error(`Run not found: ${runId}`);
    return run;
  }

  private async bootstrapBrowserActionRun(run: AgentRun): Promise<AgentRun> {
    const metadata = run.metadata as Partial<BrowserActionRunMetadata>;
    const task = metadata.task?.trim();

    if (!task) {
      return run;
    }

    const planningEvent: AgentRunEvent = {
      eventId: `evt-${run.runId}-phase-${Date.now()}`,
      runId: run.runId,
      timestamp: Date.now(),
      type: "run.phase_changed",
      fromPhase: run.phase,
      toPhase: "planning",
      reason: "plan-created",
      detail: `Plan browser action for ${task}`,
    };

    let updatedRun = await this.applyEvent(planningEvent);

    const now = Date.now();
    const initialTodos: AgentTodoItem[] = [
      {
        id: `${run.runId}-todo-plan`,
        label: "Create execution plan",
        done: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: `${run.runId}-todo-inspect`,
        label: "Inspect current page state",
        done: false,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: `${run.runId}-todo-execute`,
        label: `Execute browser task: ${task}`,
        done: false,
        createdAt: now,
        updatedAt: now,
      },
    ];

    updatedRun = await this.applyEvent({
      eventId: `evt-${run.runId}-todo-${Date.now()}`,
      runId: run.runId,
      timestamp: Date.now(),
      type: "todo.replaced",
      items: initialTodos,
    });

    updatedRun = this.updateBrowserMetadata(updatedRun, {
      currentIntent: `Plan browser action for ${task}`,
    });
    await this.persistRun(updatedRun);
    await this.saveNamedCheckpoint(updatedRun, "plan-created", "auto");

    return updatedRun;
  }

  private async saveNamedCheckpoint(
    run: AgentRun,
    boundary: BrowserActionCheckpointBoundary,
    trigger: AgentCheckpoint["trigger"],
  ): Promise<AgentRun> {
    const checkpoint = await this.checkpoints.saveCheckpoint(run, trigger, boundary);
    return this.applyEvent({
      eventId: `evt-${run.runId}-checkpoint-${Date.now()}`,
      runId: run.runId,
      timestamp: Date.now(),
      type: "checkpoint.created",
      checkpointId: checkpoint.checkpointId,
      boundary,
    });
  }

  private updateBrowserMetadata(
    run: AgentRun,
    updates: Partial<BrowserActionRunMetadata>,
  ): AgentRun {
    return {
      ...run,
      metadata: {
        ...run.metadata,
        ...updates,
      },
    };
  }

  private async persistRun(run: AgentRun): Promise<void> {
    await this.store.putRun(this.toRunRecord(run));
    this.activeRuns.set(run.runId, run);
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
