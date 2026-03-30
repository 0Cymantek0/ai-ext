import { describe, expect, it } from "vitest";
import { ResearchPlanService } from "../src/background/research/research-plan-service.js";
import type { DeepResearchRunMetadata } from "../src/shared/agent-runtime/contracts.js";

describe("deep research synthesis", () => {
  it("updates active-question and gap state after synthesis", () => {
    const service = new ResearchPlanService();
    const metadata: DeepResearchRunMetadata = {
      topic: "Deep research",
      goal: "Check synthesis transitions",
      providerId: "provider-openai",
      providerType: "openai",
      modelId: "gpt-4.1-mini",
      questionsTotal: 2,
      questionsAnswered: 0,
      openGapCount: 0,
      activeQuestionId: "question-1",
      questions: [
        {
          id: "question-1",
          question: "What is the first question?",
          status: "active",
          order: 0,
          createdAt: 100,
          updatedAt: 100,
        },
        {
          id: "question-2",
          question: "What is the follow-up question?",
          status: "pending",
          order: 1,
          createdAt: 100,
          updatedAt: 100,
        },
      ],
      gaps: [],
      findings: [],
    };

    const next = service.applySynthesis(
      metadata,
      {
        questionId: "question-1",
        summary: "No grounded answer yet",
        findingsCount: 0,
        gapNote: "Need another source",
      },
      200,
    );

    expect(next.questions?.[0]?.status).toBe("blocked");
    expect(next.gaps?.[0]?.note).toContain("Need another source");
    expect(next.activeQuestionId).toBe("question-2");
    expect(next.currentIntent).toContain("What is the follow-up question?");
    expect(next.openGapCount).toBe(1);
  });
});
