import { AgentRuntimeService } from "../agent-runtime/agent-runtime-service.js";
import type {
  AgentRun,
  AgentRunEvent,
  DeepResearchFinding,
  DeepResearchQuestion,
  DeepResearchRunMetadata,
} from "../../shared/agent-runtime/contracts.js";
import { ResearchPlanService } from "./research-plan-service.js";
import {
  ResearchFindingService,
  type ResearchFindingInput,
} from "./research-finding-service.js";

export interface DeepResearchCollectionContext {
  runId: string;
  iteration: number;
  topic: string;
  goal: string;
  question: DeepResearchQuestion;
  metadata: DeepResearchRunMetadata;
}

export type DeepResearchCollector = (
  context: DeepResearchCollectionContext,
) => Promise<ResearchFindingInput[]>;

export interface DeepResearchOrchestratorOptions {
  collector?: DeepResearchCollector;
  onRunUpdated?: (runId: string) => Promise<void> | void;
}

const DEFAULT_MAX_ITERATIONS = 12;

export class DeepResearchOrchestrator {
  private readonly activeRuns = new Map<string, Promise<void>>();
  private readonly planService = new ResearchPlanService();
  private readonly findingService = new ResearchFindingService();

  constructor(private readonly runtimeService: AgentRuntimeService) {}

  async start(runId: string, options: DeepResearchOrchestratorOptions = {}): Promise<void> {
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

  async resume(runId: string, options: DeepResearchOrchestratorOptions = {}): Promise<void> {
    await this.start(runId, options);
  }

  private async runLoop(
    runId: string,
    options: DeepResearchOrchestratorOptions,
  ): Promise<void> {
    const collector = options.collector ?? (async () => []);

    for (let iteration = 1; iteration <= DEFAULT_MAX_ITERATIONS; iteration += 1) {
      const run = await this.runtimeService.getRun(runId);
      if (!run || run.status === "paused" || run.status === "cancelled") {
        return;
      }

      if (run.status === "completed" || run.status === "failed") {
        return;
      }

      const metadata = this.planService.activateNextQuestion(
        this.planService.getMetadata(run),
      );

      if (this.planService.isPlanComplete(metadata)) {
        await this.finishRun(run, metadata, options);
        return;
      }

      const activeQuestion = this.planService.getActiveQuestion(metadata);
      if (!activeQuestion) {
        await this.finishRun(run, metadata, options);
        return;
      }

      await this.runtimeService.updateRun(runId, (currentRun) => ({
        ...currentRun,
        metadata: metadata as unknown as Record<string, unknown>,
      }));
      await this.runtimeService.replaceTodoItems(
        runId,
        this.planService.buildTodoItems(runId, metadata),
      );
      await this.runtimeService.transitionPhase(
        runId,
        "executing",
        "question-activated",
        `Activate research question: ${activeQuestion.question}`,
      );
      await this.runtimeService.saveCheckpoint(runId, "question-activated");
      await this.emitStatus(runId, options);

      await this.runtimeService.applyEvent(this.createToolCalledEvent(runId, {
        iteration,
        question: activeQuestion,
      }));

      const findingInputs = await collector({
        runId,
        iteration,
        topic: metadata.topic,
        goal: metadata.goal,
        question: activeQuestion,
        metadata,
      });

      const findings = findingInputs.map((findingInput, index) =>
        this.findingService.createFinding(
          findingInput,
          Date.now() + index,
        ),
      );

      for (let index = 0; index < findingInputs.length; index += 1) {
        const findingInput = findingInputs[index]!;
        const finding = findings[index]!;
        const supportedQuestionId = findingInput.supportedQuestionIds[0];
        const sourceType: "pdf" | "web" =
          finding.source.contentType === "pdf" ? "pdf" : "web";
        const evidenceInput = {
          summary: finding.summary,
          claim: finding.summary,
          source: {
            url: finding.source.sourceUrl,
            type: sourceType,
            ...(finding.source.title ? { title: finding.source.title } : {}),
          },
          question: activeQuestion.question,
          query: activeQuestion.question,
          tags: ["deep-research", activeQuestion.id],
          ...(finding.excerpt ? { excerpt: finding.excerpt } : {}),
          ...(supportedQuestionId ? { questionId: supportedQuestionId } : {}),
        };
        await this.runtimeService.recordResearchEvidence(runId, evidenceInput);
      }

      await this.runtimeService.applyEvent(
        this.createToolCompletedEvent(runId, {
          iteration,
          question: activeQuestion,
          findings,
        }),
      );

      let nextMetadata = this.planService.integrateFindings(metadata, findings);

      await this.runtimeService.updateRun(runId, (currentRun) => ({
        ...currentRun,
        metadata: nextMetadata as unknown as Record<string, unknown>,
      }));
      await this.runtimeService.saveCheckpoint(runId, "finding-captured");

      const synthesis = this.summarizeQuestionOutcome(activeQuestion, findings);
      nextMetadata = this.planService.applySynthesis(
        nextMetadata,
        {
          questionId: activeQuestion.id,
          summary: synthesis.summary,
          findingsCount: findings.length,
          ...(synthesis.gapNote ? { gapNote: synthesis.gapNote } : {}),
        },
      );

      await this.runtimeService.updateRun(runId, (currentRun) => ({
        ...currentRun,
        metadata: nextMetadata as unknown as Record<string, unknown>,
      }));
      await this.runtimeService.replaceTodoItems(
        runId,
        this.planService.buildTodoItems(runId, nextMetadata),
      );
      await this.runtimeService.saveCheckpoint(runId, "synthesis-updated");
      await this.emitStatus(runId, options);

      if (this.planService.isPlanComplete(nextMetadata)) {
        const completedRun = await this.runtimeService.getRun(runId);
        if (completedRun) {
          await this.finishRun(completedRun, nextMetadata, options);
        }
        return;
      }
    }
  }

  private async finishRun(
    run: AgentRun,
    metadata: DeepResearchRunMetadata,
    options: DeepResearchOrchestratorOptions,
  ): Promise<void> {
    await this.runtimeService.transitionPhase(
      run.runId,
      "finalizing",
      "synthesis-updated",
      "Finalize deep-research run",
    );
    await this.runtimeService.updateRun(run.runId, (currentRun) => ({
      ...currentRun,
      metadata: {
        ...currentRun.metadata,
        ...metadata,
        currentIntent: "Deep research complete",
      },
    }));
    await this.runtimeService.applyEvent({
      eventId: `evt-${run.runId}-completed-${Date.now()}`,
      runId: run.runId,
      timestamp: Date.now(),
      type: "run.completed",
      outcome: {
        status: "completed",
        reason:
          this.planService.getOpenGaps(metadata).length > 0
            ? "Deep research completed with open gaps recorded"
            : "Deep research completed",
        finishedAt: Date.now(),
      },
    });
    await this.runtimeService.saveCheckpoint(run.runId, "terminal", "terminal");
    await this.emitStatus(run.runId, options);
  }

  private summarizeQuestionOutcome(
    question: DeepResearchQuestion,
    findings: DeepResearchFinding[],
  ): { summary: string; gapNote?: string } {
    if (findings.length === 0) {
      return {
        summary: `No grounded findings captured yet for "${question.question}".`,
        gapNote: `Need stronger evidence for "${question.question}".`,
      };
    }

    const findingSummary = this.findingService.summarizeFindings(findings);
    return {
      summary: `Answered "${question.question}" with ${findings.length} finding(s). ${findingSummary}`,
    };
  }

  private createToolCalledEvent(
    runId: string,
    input: { iteration: number; question: DeepResearchQuestion },
  ): AgentRunEvent {
    return {
      eventId: `evt-${runId}-tool-called-${Date.now()}-${input.iteration}`,
      runId,
      timestamp: Date.now(),
      type: "tool.called",
      toolName: "deep_research_collect",
      toolArgs: {
        iteration: input.iteration,
        questionId: input.question.id,
        question: input.question.question,
      },
      checkpointBoundary: "question-activated",
      requiresHumanApproval: false,
    };
  }

  private createToolCompletedEvent(
    runId: string,
    input: {
      iteration: number;
      question: DeepResearchQuestion;
      findings: DeepResearchFinding[];
    },
  ): AgentRunEvent {
    return {
      eventId: `evt-${runId}-tool-completed-${Date.now()}-${input.iteration}`,
      runId,
      timestamp: Date.now(),
      type: "tool.completed",
      toolName: "deep_research_collect",
      result: {
        iteration: input.iteration,
        questionId: input.question.id,
        findingsCount: input.findings.length,
      },
      durationMs: 0,
      checkpointBoundary: "finding-captured",
    };
  }

  private async emitStatus(
    runId: string,
    options: DeepResearchOrchestratorOptions,
  ): Promise<void> {
    if (options.onRunUpdated) {
      await options.onRunUpdated(runId);
    }
  }
}
