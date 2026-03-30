import { describe, expect, it } from "vitest";
import {
  DeepResearchRunMetadataSchema,
  AgentRunSchema,
} from "../src/shared/agent-runtime/schemas.js";
import type {
  AgentRun,
  DeepResearchRunMetadata,
} from "../src/shared/agent-runtime/contracts.js";
import type { AgentRunStartPayload } from "../src/shared/types/index.d.ts";

describe("deep-research runtime contracts", () => {
  it("accepts a canonical deep-research launch payload", () => {
    const payload: AgentRunStartPayload = {
      mode: "deep-research",
      topic: "AI browser research agents",
      goal: "Compare current orchestration approaches",
      providerId: "provider-openai",
      providerType: "openai",
      modelId: "gpt-4.1-mini",
      conversationId: "conv-1",
      tabId: 7,
      tabUrl: "https://example.com",
      tabTitle: "Example",
      metadata: {
        deepResearch: true,
      },
    };

    expect(payload.mode).toBe("deep-research");
    expect(payload.topic).toBe("AI browser research agents");
    expect(payload.goal).toBe("Compare current orchestration approaches");
    expect(payload.providerId).toBe("provider-openai");
    expect(payload.modelId).toBe("gpt-4.1-mini");
  });

  it("validates typed deep-research metadata with source-ready fields", () => {
    const metadata: DeepResearchRunMetadata = {
      topic: "deep-research",
      goal: "Validate topic and goal wiring",
      providerId: "provider-openai",
      providerType: "openai",
      modelId: "gpt-4.1-mini",
      questionsTotal: 2,
      questionsAnswered: 1,
      openGapCount: 1,
      activeQuestionId: "question-2",
      questions: [
        {
          id: "question-1",
          question: "What is deep-research?",
          status: "answered",
          order: 0,
          createdAt: 100,
          updatedAt: 110,
        },
        {
          id: "question-2",
          question: "Which source supports the goal?",
          status: "active",
          order: 1,
          createdAt: 100,
          updatedAt: 120,
        },
      ],
      gaps: [
        {
          id: "gap-1",
          questionId: "question-2",
          note: "Need one more primary source",
          status: "open",
          createdAt: 130,
          updatedAt: 130,
        },
      ],
      findings: [
        {
          id: "finding-1",
          summary: "Primary source captured",
          supportedQuestionIds: ["question-1"],
          source: {
            sourceUrl: "https://example.com/source",
            title: "Example Source",
            capturedAt: 140,
            contentType: "article",
          },
          createdAt: 140,
        },
      ],
    };

    const parsed = DeepResearchRunMetadataSchema.parse(metadata);
    expect(parsed.topic).toBe("deep-research");
    expect(parsed.goal).toBe("Validate topic and goal wiring");
    expect(parsed.providerId).toBe("provider-openai");
    expect(parsed.modelId).toBe("gpt-4.1-mini");
    expect(parsed.findings?.[0]?.source.sourceUrl).toBe("https://example.com/source");
  });

  it("embeds deep-research metadata inside the canonical AgentRun root state", () => {
    const run: AgentRun = {
      runId: "run-deep-research",
      mode: "deep-research",
      status: "running",
      phase: "planning",
      createdAt: 100,
      updatedAt: 150,
      todoItems: [],
      pendingApproval: null,
      artifactRefs: [],
      latestCheckpointId: "cp-1",
      terminalOutcome: null,
      metadata: {
        topic: "deep-research",
        goal: "Preserve typed metadata",
        providerId: "provider-openai",
        providerType: "openai",
        modelId: "gpt-4.1-mini",
        questionsTotal: 1,
        openGapCount: 0,
      },
    };

    const parsed = AgentRunSchema.parse(run);
    expect(parsed.mode).toBe("deep-research");
    expect(parsed.metadata.topic).toBe("deep-research");
    expect(parsed.metadata.goal).toBe("Preserve typed metadata");
    expect(parsed.metadata.providerId).toBe("provider-openai");
    expect(parsed.metadata.modelId).toBe("gpt-4.1-mini");
  });
});
