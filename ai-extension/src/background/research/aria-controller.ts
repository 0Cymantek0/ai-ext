import { logger } from "../monitoring.js";

export type AriaRunStatus = "running" | "paused" | "cancelled" | "completed";
export type AriaRunPhase =
  | "initializing"
  | "planning"
  | "researching"
  | "synthesizing"
  | "paused"
  | "cancelled"
  | "completed";

export interface AriaRunMetrics {
  progress: number;
  stepsCompleted: number;
  stepsTotal?: number;
}

export interface AriaRunConfig {
  mode: string;
  query?: string;
  phase?: AriaRunPhase;
  stepsTotal?: number;
  metadata?: Record<string, unknown>;
  context?: Record<string, unknown>;
}

export interface AriaRunState {
  runId: string;
  mode: string;
  phase: AriaRunPhase;
  status: AriaRunStatus;
  createdAt: number;
  updatedAt: number;
  metrics: AriaRunMetrics;
  context?: Record<string, unknown>;
  lastEvent?: AriaControllerEventType;
  lastMessage?: string;
}

export type AriaControllerEventType =
  | "started"
  | "paused"
  | "resumed"
  | "cancelled"
  | "progress";

export interface AriaControllerEventDetail {
  type: AriaControllerEventType;
  run: AriaRunState;
  message: string;
  timestamp: number;
}

export const ARIA_CONTROLLER_EVENT = "aria-controller:event" as const;

class AriaControllerDispatchEvent extends Event {
  readonly detail: AriaControllerEventDetail;

  constructor(detail: AriaControllerEventDetail) {
    super(ARIA_CONTROLLER_EVENT);
    this.detail = detail;
  }
}

export type AriaRunFailureReason =
  | "NOT_FOUND"
  | "INVALID_STATE"
  | "INVALID_CONFIG";

export interface AriaRunSuccess {
  success: true;
  run: AriaRunState;
  message: string;
}

export interface AriaRunFailure {
  success: false;
  error: string;
  reason: AriaRunFailureReason;
}

export type AriaRunResult = AriaRunSuccess | AriaRunFailure;

interface InternalAriaRunState extends AriaRunState {}

function cloneContext(context?: Record<string, unknown>):
  | Record<string, unknown>
  | undefined {
  if (!context) {
    return undefined;
  }

  return { ...context };
}

export class AriaController {
  private readonly runs = new Map<string, InternalAriaRunState>();
  private readonly eventTarget = new EventTarget();

  /**
   * Subscribe to controller events. Returns an unsubscribe function.
   */
  onEvent(
    listener: (detail: AriaControllerEventDetail) => void,
  ): () => void {
    const handler = (event: Event): void => {
      listener((event as AriaControllerDispatchEvent).detail);
    };

    this.eventTarget.addEventListener(
      ARIA_CONTROLLER_EVENT,
      handler as EventListener,
    );

    return () => {
      this.eventTarget.removeEventListener(
        ARIA_CONTROLLER_EVENT,
        handler as EventListener,
      );
    };
  }

  /**
   * Start a new ARIA run using the provided configuration.
   */
  startRun(config: AriaRunConfig): AriaRunResult {
    const mode = typeof config.mode === "string" ? config.mode.trim() : "";
    if (!mode) {
      logger.error(
        "AriaController",
        "Invalid run configuration: mode is required",
        {
          config,
        },
      );
      return this.makeInvalidConfigError("Run configuration must include a mode");
    }

    const runId = this.generateRunId();
    const timestamp = Date.now();

    const initialPhase: AriaRunPhase = config.phase ?? "initializing";
    const initialMetrics: AriaRunMetrics = {
      progress: 0,
      stepsCompleted: 0,
      ...(config.stepsTotal ? { stepsTotal: config.stepsTotal } : {}),
    };

    const run: InternalAriaRunState = {
      runId,
      mode,
      phase: initialPhase,
      status: "running",
      createdAt: timestamp,
      updatedAt: timestamp,
      metrics: initialMetrics,
      context: cloneContext(config.context ?? config.metadata),
      lastEvent: "started",
      lastMessage: "ARIA run started",
    };

    this.runs.set(runId, run);

    logger.info("AriaController", "Run started", {
      runId,
      mode: run.mode,
      phase: run.phase,
    });

    this.emitEvent("started", run, "ARIA run started");
    this.emitPlaceholderProgress(run, "Run initialization scheduled");

    return {
      success: true,
      run: this.cloneRun(run),
      message: "ARIA run started",
    };
  }

  /**
   * Pause an active ARIA run.
   */
  pauseRun(runId: string): AriaRunResult {
    const run = this.runs.get(runId);

    if (!run) {
      logger.warn("AriaController", "Pause requested for unknown run", {
        runId,
      });
      return this.makeNotFoundError(runId);
    }

    if (run.status === "cancelled" || run.status === "completed") {
      return this.makeInvalidStateError(
        run,
        "Cannot pause a run that is no longer active",
      );
    }

    if (run.status === "paused") {
      logger.info("AriaController", "Run already paused", { runId });
      return {
        success: true,
        run: this.cloneRun(run),
        message: "ARIA run already paused",
      };
    }

    run.status = "paused";
    run.phase = "paused";

    logger.info("AriaController", "Run paused", { runId });

    this.emitEvent("paused", run, "ARIA run paused");

    return {
      success: true,
      run: this.cloneRun(run),
      message: "ARIA run paused",
    };
  }

  /**
   * Resume a paused ARIA run.
   */
  resumeRun(runId: string): AriaRunResult {
    const run = this.runs.get(runId);

    if (!run) {
      logger.warn("AriaController", "Resume requested for unknown run", {
        runId,
      });
      return this.makeNotFoundError(runId);
    }

    if (run.status === "cancelled" || run.status === "completed") {
      return this.makeInvalidStateError(
        run,
        "Cannot resume a run that is no longer active",
      );
    }

    if (run.status === "running") {
      logger.info("AriaController", "Run already running", { runId });
      return {
        success: true,
        run: this.cloneRun(run),
        message: "ARIA run already running",
      };
    }

    run.status = "running";
    run.phase = run.phase === "paused" ? "researching" : run.phase;

    logger.info("AriaController", "Run resumed", { runId });

    this.emitEvent("resumed", run, "ARIA run resumed");
    this.emitPlaceholderProgress(run, "Run resumed");

    return {
      success: true,
      run: this.cloneRun(run),
      message: "ARIA run resumed",
    };
  }

  /**
   * Cancel an active ARIA run.
   */
  cancelRun(runId: string): AriaRunResult {
    const run = this.runs.get(runId);

    if (!run) {
      logger.warn("AriaController", "Cancel requested for unknown run", {
        runId,
      });
      return this.makeNotFoundError(runId);
    }

    if (run.status === "cancelled" || run.status === "completed") {
      logger.info("AriaController", "Run already inactive", {
        runId,
        status: run.status,
      });
      return {
        success: true,
        run: this.cloneRun(run),
        message: "ARIA run already inactive",
      };
    }

    run.status = "cancelled";
    run.phase = "cancelled";

    logger.info("AriaController", "Run cancelled", { runId });

    this.emitEvent("cancelled", run, "ARIA run cancelled");

    return {
      success: true,
      run: this.cloneRun(run),
      message: "ARIA run cancelled",
    };
  }

  /**
   * Retrieve the current status of a run.
   */
  getStatus(runId: string): AriaRunResult {
    const run = this.runs.get(runId);

    if (!run) {
      logger.warn("AriaController", "Status requested for unknown run", {
        runId,
      });
      return this.makeNotFoundError(runId);
    }

    return {
      success: true,
      run: this.cloneRun(run),
      message: "ARIA run status retrieved",
    };
  }

  private emitPlaceholderProgress(
    run: InternalAriaRunState,
    message: string,
  ): void {
    if (run.metrics.progress < 0.05) {
      run.metrics.progress = 0.05;
    }

    this.emitEvent("progress", run, message);
  }

  private emitEvent(
    type: AriaControllerEventType,
    run: InternalAriaRunState,
    message: string,
  ): void {
    const timestamp = Date.now();
    run.updatedAt = timestamp;
    run.lastEvent = type;
    run.lastMessage = message;

    const detail: AriaControllerEventDetail = {
      type,
      run: this.cloneRun(run),
      message,
      timestamp,
    };

    this.eventTarget.dispatchEvent(new AriaControllerDispatchEvent(detail));
  }

  private cloneRun(run: InternalAriaRunState): AriaRunState {
    return {
      runId: run.runId,
      mode: run.mode,
      phase: run.phase,
      status: run.status,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
      metrics: { ...run.metrics },
      context: cloneContext(run.context),
      lastEvent: run.lastEvent,
      lastMessage: run.lastMessage,
    };
  }

  private makeNotFoundError(runId: string): AriaRunFailure {
    return {
      success: false,
      reason: "NOT_FOUND",
      error: `No ARIA run found with ID: ${runId}`,
    };
  }

  private makeInvalidStateError(
    run: InternalAriaRunState,
    message: string,
  ): AriaRunFailure {
    return {
      success: false,
      reason: "INVALID_STATE",
      error: `${message} (current status: ${run.status})`,
    };
  }

  private makeInvalidConfigError(message: string): AriaRunFailure {
    return {
      success: false,
      reason: "INVALID_CONFIG",
      error: message,
    };
  }

  private generateRunId(): string {
    const globalCrypto = globalThis.crypto as Crypto | undefined;
    if (globalCrypto && typeof globalCrypto.randomUUID === "function") {
      return globalCrypto.randomUUID();
    }

    return `aria-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
  }
}
