import {
  indexedDBManager,
  ContentType,
  ProcessingStatus,
  type CapturedContent,
} from "../indexeddb-manager.js";
import { PocketArtifactService } from "../agent-runtime/pocket-artifact-service.js";
import type { ResearchEvidenceWriteResult } from "../../shared/agent-runtime/contracts.js";
import type { ContentMetadata } from "../../types/content.js";
import {
  createResearchEvidenceFingerprint,
  getEvidenceSourceDomain,
  normalizeEvidenceSourceUrl,
  type ResearchEvidenceMetadata,
} from "../../types/content.js";

export interface ResearchEvidenceWriteInput {
  runId: string;
  pocketId: string;
  topic: string;
  goal?: string;
  questionId?: string;
  question?: string;
  query?: string;
  stepId?: string;
  tags?: string[];
  source: {
    url: string;
    title?: string;
    type?: "web" | "pdf" | "note" | "manual";
    locator?: string;
  };
  excerpt?: string;
  claim?: string;
  body?: string;
  summary?: string;
  capturedAt?: number;
}

function buildEvidenceBody(input: ResearchEvidenceWriteInput): string {
  const primary = input.body || input.claim || input.excerpt || input.summary || "";
  const sourceTitle = input.source.title?.trim();
  const question = input.question?.trim();

  return [sourceTitle, question ? `Question: ${question}` : undefined, primary]
    .filter((value): value is string => Boolean(value && value.trim()))
    .join("\n\n");
}

function buildEvidenceMetadata(
  input: ResearchEvidenceWriteInput,
  now: number,
  fingerprint: string,
  existing?: ResearchEvidenceMetadata,
): ContentMetadata {
  const evidenceId = existing?.evidenceId ?? `evidence-${now}-${fingerprint}`;
  const capturedAt = input.capturedAt ?? now;
  const tags = [...new Set(["research-evidence", ...(input.tags ?? [])])];
  const bodyPreview = input.claim || input.excerpt || input.summary || "";
  const source: ResearchEvidenceMetadata["source"] = {
    url: input.source.url,
    normalizedUrl: normalizeEvidenceSourceUrl(input.source.url),
    type: input.source.type ?? "web",
  };
  const domain = getEvidenceSourceDomain(input.source.url);
  if (input.source.title) {
    source.title = input.source.title;
  }
  if (domain) {
    source.domain = domain;
  }
  if (input.source.locator) {
    source.locator = input.source.locator;
  }

  const context: ResearchEvidenceMetadata["context"] = {
    topic: input.topic,
    tags,
  };
  if (input.goal) {
    context.goal = input.goal;
  }
  if (input.questionId) {
    context.questionId = input.questionId;
  }
  if (input.question) {
    context.question = input.question;
  }
  if (input.query) {
    context.query = input.query;
  }
  if (input.stepId) {
    context.stepId = input.stepId;
  }

  return {
    timestamp: existing?.firstCapturedAt ?? capturedAt,
    updatedAt: now,
    title: input.source.title || input.summary || "Research evidence",
    tags,
    category: "research-evidence",
    excerpt: bodyPreview,
    preview: bodyPreview,
    ...(input.summary ? { summary: input.summary } : {}),
    researchEvidence: {
      evidenceId,
      runId: input.runId,
      pocketId: input.pocketId,
      capturedAt,
      firstCapturedAt: existing?.firstCapturedAt ?? capturedAt,
      lastSeenAt: now,
      fingerprint,
      duplicateCount: existing ? existing.duplicateCount + 1 : 1,
      source,
      context,
      ...(input.excerpt ? { excerpt: input.excerpt } : {}),
      ...(input.claim ? { claim: input.claim } : {}),
    },
  };
}

export class ResearchEvidenceService {
  constructor(private readonly artifacts: PocketArtifactService) {}

  async writeEvidence(
    input: ResearchEvidenceWriteInput,
  ): Promise<ResearchEvidenceWriteResult> {
    await indexedDBManager.init();

    const fingerprint = createResearchEvidenceFingerprint({
      sourceUrl: input.source.url,
      ...(input.source.locator ? { locator: input.source.locator } : {}),
      ...(input.excerpt ? { excerpt: input.excerpt } : {}),
      ...(input.claim ? { claim: input.claim } : {}),
    });
    const existing = await this.findExistingEvidence(input.pocketId, fingerprint);
    const now = Date.now();
    const body = buildEvidenceBody(input);
    const metadata = buildEvidenceMetadata(
      input,
      now,
      fingerprint,
      existing?.metadata.researchEvidence,
    );

    let contentId: string;
    let disposition: ResearchEvidenceWriteResult["disposition"];

    if (existing) {
      await indexedDBManager.updateContent(existing.id, {
        content: body,
        metadata,
        sourceUrl: input.source.url,
        processingStatus: ProcessingStatus.COMPLETED,
      });
      contentId = existing.id;
      disposition =
        existing.metadata.researchEvidence?.duplicateCount ?? 0
          ? "updated-as-duplicate"
          : "refreshed";
    } else {
      contentId = await indexedDBManager.saveContent({
        pocketId: input.pocketId,
        type: ContentType.TEXT,
        content: body,
        metadata,
        sourceUrl: input.source.url,
        processingStatus: ProcessingStatus.COMPLETED,
      });
      disposition = "created";
    }

    const evidence = metadata.researchEvidence;
    if (!evidence) {
      throw new Error("Research evidence metadata was not created");
    }

    await this.artifacts.ensureEvidenceArtifact({
      runId: input.runId,
      pocketId: input.pocketId,
      contentId,
      evidenceId: evidence.evidenceId,
      fingerprint,
      label: metadata.title || input.summary || "Research evidence",
      sourceUrl: input.source.url,
    });

    return {
      runId: input.runId,
      pocketId: input.pocketId,
      contentId,
      evidenceId: evidence.evidenceId,
      fingerprint,
      disposition,
      duplicateCount: evidence.duplicateCount,
      capturedAt: evidence.capturedAt,
      lastSeenAt: evidence.lastSeenAt,
      sourceUrl: input.source.url,
      ...(input.source.title ? { sourceTitle: input.source.title } : {}),
      ...(input.questionId ? { questionId: input.questionId } : {}),
      ...(input.question ? { question: input.question } : {}),
    };
  }

  private async findExistingEvidence(
    pocketId: string,
    fingerprint: string,
  ): Promise<CapturedContent | undefined> {
    const contents = await indexedDBManager.getContentByPocket(pocketId);
    return contents.find(
      (content) => content.metadata.researchEvidence?.fingerprint === fingerprint,
    );
  }
}
