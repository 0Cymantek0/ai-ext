import type { CapturedContent } from "../indexeddb-manager.js";
import type { ContentChunk } from "../../types/content.js";
import {
  normalizeEvidenceText,
  type ResearchEvidenceMetadata,
} from "../../types/content.js";
import type { NormalizedReportEvidence } from "../../shared/reporting/contracts.js";

export interface ReportArtifactReference {
  artifactId: string;
  artifactType: string;
  targetKind: string;
  targetId: string;
  label: string;
  uri?: string;
}

export interface NormalizePocketEvidenceInput {
  pocketId: string;
  contents: Array<{
    id: string;
    pocketId: string;
    type: string;
    capturedAt: number;
    sourceUrl?: string;
    content: unknown;
    metadata?: unknown;
  }>;
  chunks?: Array<{
    id: string;
    contentId: string;
    pocketId: string;
    text: string;
    chunkIndex?: number;
    similarity?: number;
  }>;
  artifacts?: Array<{
    artifactId: string;
    artifactType: string;
    targetKind: string;
    targetId: string;
    label: string;
    uri?: string;
  }>;
}

function asResearchEvidenceMetadata(
  value: unknown,
): ResearchEvidenceMetadata | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const candidate = value as { researchEvidence?: ResearchEvidenceMetadata };
  return candidate.researchEvidence;
}

function deriveSourceTitle(
  metadata: Record<string, unknown> | undefined,
  researchEvidence?: ResearchEvidenceMetadata,
): string | undefined {
  if (researchEvidence?.source.title) {
    return researchEvidence.source.title;
  }

  return typeof metadata?.title === "string" ? metadata.title : undefined;
}

function deriveTags(metadata: Record<string, unknown> | undefined): string[] {
  const tags = Array.isArray(metadata?.tags) ? metadata.tags : [];
  return tags.filter((tag): tag is string => typeof tag === "string");
}

function tryExtractStringContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (
    content &&
    typeof content === "object" &&
    "text" in content &&
    typeof (content as { text?: unknown }).text === "string"
  ) {
    return (content as { text: string }).text;
  }

  return "";
}

function trimExcerpt(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function deriveContentExcerpt(
  content: unknown,
  metadata: Record<string, unknown> | undefined,
  researchEvidence?: ResearchEvidenceMetadata,
): string {
  const metadataExcerpt =
    typeof metadata?.excerpt === "string" ? metadata.excerpt : undefined;
  const metadataSummary =
    typeof metadata?.summary === "string" ? metadata.summary : undefined;
  const sourceText =
    researchEvidence?.excerpt ||
    researchEvidence?.claim ||
    metadataExcerpt ||
    metadataSummary ||
    tryExtractStringContent(content);

  return trimExcerpt(sourceText);
}

function dedupeKey(
  sourceUrl: string | undefined,
  excerpt: string,
  origin: NormalizedReportEvidence["provenance"]["origin"],
): string | undefined {
  if (!sourceUrl || !excerpt) {
    return undefined;
  }

  return `${origin}::${sourceUrl}::${normalizeEvidenceText(excerpt)}`;
}

export function normalizePocketEvidence(
  input: NormalizePocketEvidenceInput,
): NormalizedReportEvidence[] {
  const evidence: NormalizedReportEvidence[] = [];
  const contentById = new Map(input.contents.map((content) => [content.id, content]));
  const seenPairs = new Set<string>();
  const artifactsByTarget = new Map<string, ReportArtifactReference>();

  for (const artifact of input.artifacts ?? []) {
    artifactsByTarget.set(artifact.targetId, artifact);
  }

  const pushEvidence = (candidate: NormalizedReportEvidence): void => {
    if (!candidate.excerpt) {
      return;
    }

    const pairKey = dedupeKey(
      candidate.sourceUrl,
      candidate.excerpt,
      candidate.provenance.origin,
    );
    if (pairKey && seenPairs.has(pairKey)) {
      return;
    }

    if (pairKey) {
      seenPairs.add(pairKey);
    }

    evidence.push(candidate);
  };

  for (const content of input.contents) {
    const metadata =
      content.metadata && typeof content.metadata === "object"
        ? (content.metadata as Record<string, unknown>)
        : undefined;
    const researchEvidence = asResearchEvidenceMetadata(metadata);
    const excerpt = deriveContentExcerpt(content.content, metadata, researchEvidence);
    const sourceUrl = content.sourceUrl || researchEvidence?.source.url;
    const sourceTitle = deriveSourceTitle(metadata, researchEvidence);
    if (!excerpt) {
      continue;
    }

    pushEvidence({
      evidenceId: `evidence-content-${content.id}`,
      pocketId: content.pocketId,
      contentId: content.id,
      sourceType:
        researchEvidence?.source.type ||
        (typeof content.type === "string" ? content.type : "unknown"),
      capturedAt:
        researchEvidence?.capturedAt ||
        (typeof content.capturedAt === "number" ? content.capturedAt : Date.now()),
      excerpt,
      tags: deriveTags(metadata),
      provenance: {
        origin: "captured-content",
        extractionMethod: researchEvidence?.excerpt
          ? "research-evidence-excerpt"
          : "captured-content-text",
      },
      ...(typeof sourceUrl === "string" ? { sourceUrl } : {}),
      ...(typeof sourceTitle === "string" ? { sourceTitle } : {}),
    });
  }

  for (const chunk of input.chunks ?? []) {
    const content = contentById.get(chunk.contentId);
    const metadata =
      content?.metadata && typeof content.metadata === "object"
        ? (content.metadata as Record<string, unknown>)
        : undefined;
    const researchEvidence = asResearchEvidenceMetadata(metadata);
    const excerpt = trimExcerpt(chunk.text);
    const sourceUrl = content?.sourceUrl || researchEvidence?.source.url;
    const sourceTitle = deriveSourceTitle(metadata, researchEvidence);
    if (!excerpt) {
      continue;
    }

    const artifact = artifactsByTarget.get(chunk.id) ?? artifactsByTarget.get(chunk.contentId);
    pushEvidence({
      evidenceId: `evidence-chunk-${chunk.id}`,
      pocketId: chunk.pocketId,
      contentId: chunk.contentId,
      sourceType:
        researchEvidence?.source.type ||
        (typeof content?.type === "string" ? content.type : "chunk"),
      capturedAt:
        researchEvidence?.capturedAt ||
        (typeof content?.capturedAt === "number" ? content.capturedAt : Date.now()),
      excerpt,
      snippet: excerpt,
      tags: deriveTags(metadata),
      provenance: {
        origin: artifact ? "runtime-artifact" : "vector-chunk",
        extractionMethod: artifact ? "artifact-linked-chunk" : "vector-chunk-text",
        ...(artifact?.artifactId ? { artifactId: artifact.artifactId } : {}),
      },
      ...(typeof sourceUrl === "string" ? { sourceUrl } : {}),
      ...(typeof sourceTitle === "string" ? { sourceTitle } : {}),
      ...(chunk.id ? { chunkId: chunk.id } : {}),
      ...(typeof chunk.chunkIndex === "number" ? { chunkIndex: chunk.chunkIndex } : {}),
      ...(typeof chunk.similarity === "number"
        ? { relevanceScore: chunk.similarity }
        : {}),
    });
  }

  return evidence;
}
