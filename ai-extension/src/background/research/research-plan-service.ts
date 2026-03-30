import type {
  AgentRun,
  AgentTodoItem,
  DeepResearchFinding,
  DeepResearchGap,
  DeepResearchQuestion,
  DeepResearchRunMetadata,
} from "../../shared/agent-runtime/contracts.js";

export class ResearchPlanService {
  getMetadata(run: AgentRun): DeepResearchRunMetadata {
    return run.metadata as unknown as DeepResearchRunMetadata;
  }

  getActiveQuestion(metadata: DeepResearchRunMetadata): DeepResearchQuestion | undefined {
    return metadata.questions?.find(
      (question) => question.id === metadata.activeQuestionId,
    );
  }

  activateNextQuestion(
    metadata: DeepResearchRunMetadata,
    now: number = Date.now(),
  ): DeepResearchRunMetadata {
    const questions = (metadata.questions ?? []).map((question) => ({
      ...question,
    }));
    const active = questions.find((question) => question.status === "active");

    if (active) {
      return {
        ...metadata,
        questions,
      };
    }

    const nextQuestion = questions.find((question) => question.status === "pending");
    if (!nextQuestion) {
      const { activeQuestionId: _activeQuestionId, ...rest } = metadata;
      return {
        ...rest,
        questions,
      };
    }

    nextQuestion.status = "active";
    nextQuestion.updatedAt = now;

    return {
      ...metadata,
      activeQuestionId: nextQuestion.id,
      currentIntent: `Researching: ${nextQuestion.question}`,
      questions,
    };
  }

  integrateFindings(
    metadata: DeepResearchRunMetadata,
    findings: DeepResearchFinding[],
  ): DeepResearchRunMetadata {
    if (findings.length === 0) {
      return metadata;
    }

    const nextFindings = [...(metadata.findings ?? []), ...findings];
    const latestFinding = findings[findings.length - 1];

    return {
      ...metadata,
      findings: nextFindings,
      ...(latestFinding ? { latestFindingId: latestFinding.id } : {}),
    };
  }

  applySynthesis(
    metadata: DeepResearchRunMetadata,
    input: {
      questionId: string;
      summary: string;
      findingsCount: number;
      gapNote?: string;
    },
    now: number = Date.now(),
  ): DeepResearchRunMetadata {
    const questions = (metadata.questions ?? []).map((question) => {
      if (question.id !== input.questionId) {
        return { ...question };
      }

      const status: DeepResearchQuestion["status"] =
        input.findingsCount > 0 ? "answered" : "blocked";

      return {
        ...question,
        status,
        updatedAt: now,
        summary: input.summary,
        ...(input.findingsCount > 0 ? { lastAnsweredAt: now } : {}),
      };
    });

    const activeQuestion = questions.find((question) => question.id === input.questionId);
    const existingGaps = (metadata.gaps ?? []).map((gap) => ({ ...gap }));

    if (input.findingsCount === 0 && input.gapNote) {
      existingGaps.push({
        id: `gap-${input.questionId}-${now}`,
        questionId: input.questionId,
        note: input.gapNote,
        status: "open",
        createdAt: now,
        updatedAt: now,
      });
    } else {
      for (const gap of existingGaps) {
        if (gap.questionId === input.questionId && gap.status === "open") {
          gap.status = "resolved";
          gap.updatedAt = now;
          gap.resolvedAt = now;
        }
      }
    }

    let nextMetadata: DeepResearchRunMetadata = {
      ...metadata,
      questions,
      gaps: existingGaps,
      questionsAnswered: questions.filter((question) => question.status === "answered").length,
      openGapCount: existingGaps.filter((gap) => gap.status === "open").length,
      latestSynthesis: input.summary,
      currentIntent:
        input.findingsCount > 0
          ? `Synthesis complete for ${activeQuestion?.question ?? "question"}`
          : `Gap detected for ${activeQuestion?.question ?? "question"}`,
    };

    if ("activeQuestionId" in nextMetadata) {
      delete nextMetadata.activeQuestionId;
    }

    nextMetadata = this.activateNextQuestion(nextMetadata, now);

    const nextActiveQuestion = this.getActiveQuestion(nextMetadata);
    if (nextActiveQuestion) {
      nextMetadata.currentIntent = `Researching: ${nextActiveQuestion.question}`;
    }

    return nextMetadata;
  }

  buildTodoItems(
    runId: string,
    metadata: DeepResearchRunMetadata,
    now: number = Date.now(),
  ): AgentTodoItem[] {
    return (metadata.questions ?? []).map((question) => ({
      id: `${runId}-research-todo-${question.id}`,
      label: question.question,
      done: question.status === "answered",
      createdAt: question.createdAt ?? now,
      updatedAt: question.updatedAt ?? now,
    }));
  }

  isPlanComplete(metadata: DeepResearchRunMetadata): boolean {
    const questions = metadata.questions ?? [];
    return (
      questions.length > 0 &&
      questions.every(
        (question) =>
          question.status === "answered" || question.status === "blocked",
      )
    );
  }

  getOpenGaps(metadata: DeepResearchRunMetadata): DeepResearchGap[] {
    return (metadata.gaps ?? []).filter((gap) => gap.status === "open");
  }
}
