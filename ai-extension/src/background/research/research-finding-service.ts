import type {
  AgentArtifactRef,
  DeepResearchFinding,
  DeepResearchSourceMetadata,
} from "../../shared/agent-runtime/contracts.js";

export interface ResearchFindingInput {
  summary: string;
  excerpt?: string;
  supportedQuestionIds: string[];
  sourceUrl: string;
  title?: string;
  capturedAt?: number;
  contentType?: string;
}

export class ResearchFindingService {
  createFinding(
    input: ResearchFindingInput,
    now: number = Date.now(),
  ): DeepResearchFinding {
    const source: DeepResearchSourceMetadata = {
      sourceUrl: input.sourceUrl,
      capturedAt: input.capturedAt ?? now,
      ...(input.title ? { title: input.title } : {}),
      ...(input.contentType ? { contentType: input.contentType } : {}),
    };

    return {
      id: `finding-${now}-${Math.random().toString(36).slice(2, 8)}`,
      summary: input.summary,
      ...(input.excerpt ? { excerpt: input.excerpt } : {}),
      supportedQuestionIds: [...input.supportedQuestionIds],
      source,
      createdAt: now,
    };
  }

  createArtifactRef(runId: string, finding: DeepResearchFinding): AgentArtifactRef {
    return {
      artifactId: `artifact-${finding.id}`,
      artifactType: "evidence",
      label: finding.source.title || finding.summary,
      uri: finding.source.sourceUrl,
      createdAt: finding.createdAt,
    };
  }

  summarizeFindings(findings: DeepResearchFinding[]): string {
    if (findings.length === 0) {
      return "No durable findings captured in this cycle.";
    }

    return findings
      .map((finding) => finding.summary)
      .slice(0, 2)
      .join(" ");
  }
}
