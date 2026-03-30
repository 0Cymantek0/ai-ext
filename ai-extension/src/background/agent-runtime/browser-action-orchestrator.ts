import { AgentRuntimeService } from "./agent-runtime-service.js";
import type {
  AgentRun,
  BrowserActionRunMetadata,
} from "../../shared/agent-runtime/contracts.js";

export interface BrowserActionCollectionContext {
  runId: string;
  iteration: number;
  metadata: BrowserActionRunMetadata;
}

export type BrowserActionExecutor = (
  context: BrowserActionCollectionContext,
) => Promise<boolean>;

export interface BrowserActionOrchestratorOptions {
  executor?: BrowserActionExecutor;
  onRunUpdated?: (runId: string) => Promise<void> | void;
}

const DEFAULT_MAX_ITERATIONS = 20;

export class BrowserActionOrchestrator {
  private readonly activeRuns = new Map<string, Promise<void>>();

  constructor(private readonly runtimeService: AgentRuntimeService) {}

  async start(
    runId: string,
    options: BrowserActionOrchestratorOptions = {},
  ): Promise<void> {
    const active = this.activeRuns.get(runId);
    if (active) {
      await active;
      return;
    }

    const execution = this.runLoop(runId, options).finally(() => {
      this.activeRuns.delete(runId);
    });
    this.activeRuns.set(runId, execution);
    await execution;
  }

  async resume(
    runId: string,
    options: BrowserActionOrchestratorOptions = {},
  ): Promise<void> {
    await this.start(runId, options);
  }

  private async runLoop(
    runId: string,
    options: BrowserActionOrchestratorOptions,
  ): Promise<void> {
    const executor = options.executor ?? (async () => false);

    for (let iteration = 1; iteration <= DEFAULT_MAX_ITERATIONS; iteration += 1) {
      const run = await this.runtimeService.getRun(runId);
      if (!run || run.status === "paused" || run.status === "cancelled") {
        return;
      }

      if (run.status === "completed" || run.status === "failed") {
        return;
      }

      const metadata = run.metadata as unknown as BrowserActionRunMetadata;

      if (run.phase === "planning") {
        await this.runtimeService.transitionPhase(
          runId,
          "executing",
          "execution-started",
          "Beginning browser action execution loop",
        );
        await this.runtimeService.saveCheckpoint(runId, "tool-dispatch", "auto");
      }

      // Check for blocked approval
      if (run.pendingApproval && !run.pendingApproval.resolvedAt) {
        return; // Pause execution while waiting for approval
      }

      const shouldContinue = await executor({
        runId,
        iteration,
        metadata,
      });

      await this.emitStatus(runId, options);

      if (!shouldContinue) {
        const completedRun = await this.runtimeService.getRun(runId);
        if (completedRun && completedRun.status !== "completed" && completedRun.status !== "failed" && completedRun.status !== "cancelled") {
           await this.finishRun(completedRun, metadata, options);
        }
        return;
      }
    }
  }

  private async finishRun(
    run: AgentRun,
    metadata: BrowserActionRunMetadata,
    options: BrowserActionOrchestratorOptions,
  ): Promise<void> {
    if (run.phase !== "finalizing") {
        await this.runtimeService.transitionPhase(
            run.runId,
            "finalizing",
            "loop-completed",
            "Finalize browser-action run",
        );
    }

    if (run.status !== "completed") {
        await this.runtimeService.applyEvent({
            eventId: `evt-${run.runId}-completed-${Date.now()}`,
            runId: run.runId,
            timestamp: Date.now(),
            type: "run.completed",
            outcome: {
                status: "completed",
                reason: "Browser action completed",
                finishedAt: Date.now(),
            },
        });
        await this.runtimeService.saveCheckpoint(run.runId, "terminal", "terminal");
    }
    
    await this.emitStatus(run.runId, options);
  }

  private async emitStatus(
    runId: string,
    options: BrowserActionOrchestratorOptions,
  ): Promise<void> {
    if (options.onRunUpdated) {
      await options.onRunUpdated(runId);
    }
  }
}
