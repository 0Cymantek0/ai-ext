import { generateObject } from "ai";
import { z } from "zod";
import { indexedDBManager, type Pocket } from "../indexeddb-manager.js";
import { ProviderRouter } from "../routing/provider-router.js";
import {
  normalizePocketEvidence,
  type NormalizePocketEvidenceInput,
} from "./evidence-normalizer.js";
import { buildReportSupportMap } from "./report-provenance.js";
import {
  assembleGeneratedReport,
  buildCitationCatalog,
  resolveClaimSupport,
} from "./report-assembler.js";
import type {
  GeneratedReportPayload,
  NormalizedReportEvidence,
  ReportClaim,
  ReportClaimSupport,
  ReportSection,
} from "../../shared/reporting/contracts.js";
import { GeneratedReportPayloadSchema } from "../../shared/reporting/schemas.js";

const outlineSchema = z.object({
  title: z.string().min(1),
  subtitle: z.string().min(1),
  sections: z
    .array(
      z.object({
        sectionId: z.string().min(1),
        title: z.string().min(1),
        summary: z.string().min(1),
        evidenceIds: z.array(z.string().min(1)).min(1),
      }),
    )
    .min(1),
});

const claimDraftSchema = z.object({
  claimId: z.string().min(1),
  text: z.string().min(1),
  support: z.enum(["grounded", "weak", "conflicted"]).optional(),
  evidenceIds: z.array(z.string().min(1)).min(1),
  unresolvedReason: z.string().optional(),
});

type Outline = z.infer<typeof outlineSchema>;
type ClaimDraft = z.infer<typeof claimDraftSchema>;

interface ReportGenerationDependencies {
  providerRouter?: ProviderRouter;
  indexedDb?: typeof indexedDBManager;
  generateObjectImpl?: typeof generateObject;
  now?: () => number;
}

function summarizeEvidence(evidence: NormalizedReportEvidence[]): string {
  return evidence
    .slice(0, 12)
    .map(
      (item) =>
        [
          `evidenceId=${item.evidenceId}`,
          `title=${item.sourceTitle || "Untitled"}`,
          `sourceUrl=${item.sourceUrl || "n/a"}`,
          `excerpt=${item.excerpt}`,
          `tags=${item.tags.join(", ") || "none"}`,
        ].join(" | "),
    )
    .join("\n");
}

function createFallbackOutline(
  pocket: Pocket | null,
  evidence: NormalizedReportEvidence[],
): Outline {
  const title = pocket?.name ? `${pocket.name} report` : "Research report";
  const subtitle =
    "Citation-backed research synthesis built from the pocket's captured evidence.";
  const sectionCount = Math.min(3, Math.max(1, evidence.length));
  const size = Math.ceil(evidence.length / sectionCount);

  return {
    title,
    subtitle,
    sections: Array.from({ length: sectionCount }).map((_, index) => {
      const slice = evidence.slice(index * size, (index + 1) * size);
      return {
        sectionId: `section-${String(index + 1).padStart(2, "0")}`,
        title:
          index === 0
            ? "Overview"
            : index === 1
              ? "Findings"
              : "Open Questions",
        summary:
          index === 0
            ? "Key themes and strongest supporting evidence."
            : index === 1
              ? "Detailed findings grounded in captured sources."
              : "Weak or conflicting areas that need more evidence.",
        evidenceIds: slice.map((item) => item.evidenceId).slice(0, Math.max(1, slice.length)),
      };
    }),
  };
}

function enforceDensity(outline: Outline, evidence: NormalizedReportEvidence[]): Outline {
  if (outline.sections.length >= 3 || evidence.length < 3) {
    return outline;
  }

  return createFallbackOutline(null, evidence);
}

function buildOutlinePrompt(pocketId: string, evidence: NormalizedReportEvidence[]): string {
  return [
    `Create a dense citation-backed report outline for pocket ${pocketId}.`,
    "Return 3-5 sections when evidence volume allows.",
    "Every section must reference explicit evidenceIds from the provided evidence list.",
    "Prefer research-style sections over generic summaries.",
    "",
    "Evidence:",
    summarizeEvidence(evidence),
  ].join("\n");
}

function buildClaimsPrompt(
  section: Outline["sections"][number],
  evidence: NormalizedReportEvidence[],
): string {
  return [
    `Draft claim objects for section ${section.sectionId} (${section.title}).`,
    "Return 2-4 substantive claims that stay grounded in the provided evidence.",
    "Only use evidenceIds from the section evidence list.",
    "Set support to weak when a claim has uncertainty and conflicted when evidence disagrees.",
    "",
    `Section summary: ${section.summary}`,
    `Allowed evidenceIds: ${section.evidenceIds.join(", ")}`,
    "",
    "Evidence:",
    summarizeEvidence(evidence),
  ].join("\n");
}

export class ReportGenerationService {
  private readonly providerRouter: ProviderRouter;
  private readonly indexedDb: typeof indexedDBManager;
  private readonly generateObjectImpl: typeof generateObject;
  private readonly now: () => number;

  constructor(dependencies: ReportGenerationDependencies = {}) {
    this.providerRouter = dependencies.providerRouter ?? new ProviderRouter();
    this.indexedDb = dependencies.indexedDb ?? indexedDBManager;
    this.generateObjectImpl = dependencies.generateObjectImpl ?? generateObject;
    this.now = dependencies.now ?? (() => Date.now());
  }

  async generateReportFromPocket(input: {
    pocketId: string;
    modelId: string;
    providerId?: string;
    providerType?: string;
  }): Promise<GeneratedReportPayload> {
    const pocket = await this.indexedDb.getPocket(input.pocketId);
    const contents = await this.indexedDb.getContentByPocket(input.pocketId);
    const chunks = await this.indexedDb.getChunksByPocket(input.pocketId);

    const evidence = normalizePocketEvidence({
      pocketId: input.pocketId,
      contents: contents.map((content) => ({
        id: content.id,
        pocketId: content.pocketId,
        type: content.type,
        capturedAt: content.capturedAt,
        content: content.content,
        ...(content.sourceUrl ? { sourceUrl: content.sourceUrl } : {}),
        ...(content.metadata ? { metadata: content.metadata } : {}),
      })) satisfies NormalizePocketEvidenceInput["contents"],
      chunks: chunks.map((chunk) => ({
        id: chunk.id,
        contentId: chunk.contentId,
        pocketId: chunk.pocketId,
        text: chunk.text,
        ...(typeof chunk.metadata.chunkIndex === "number"
          ? { chunkIndex: chunk.metadata.chunkIndex }
          : {}),
        ...(typeof chunk.relevanceScore === "number"
          ? { similarity: chunk.relevanceScore }
          : {}),
      })),
      artifacts: [],
    });

    if (evidence.length === 0) {
      throw new Error(`No reportable evidence found for pocket ${input.pocketId}`);
    }

    const resolved = await this.providerRouter.resolveCapability(
      "chat",
      `Generate a citation-backed report for pocket ${input.pocketId}`,
      undefined,
      input.providerId,
      input.modelId,
    );
    const model = resolved.adapter.getLanguageModel(
      input.modelId || resolved.metadata.modelId,
    );

    let outline = createFallbackOutline(pocket, evidence);
    try {
      const response = await this.generateObjectImpl({
        model,
        prompt: buildOutlinePrompt(input.pocketId, evidence),
        schema: outlineSchema,
      });
      outline = enforceDensity(response.object, evidence);
    } catch {
      outline = createFallbackOutline(pocket, evidence);
    }

    const evidenceById = new Map(evidence.map((item) => [item.evidenceId, item]));
    const sections: ReportSection[] = [];
    const allClaims: ReportClaim[] = [];

    for (const section of outline.sections) {
      const sectionEvidence = section.evidenceIds
        .map((evidenceId) => evidenceById.get(evidenceId))
        .filter((item): item is NormalizedReportEvidence => Boolean(item));

      let claimDrafts: ClaimDraft[] = [];
      try {
        const response = await this.generateObjectImpl({
          model,
          prompt: buildClaimsPrompt(section, sectionEvidence),
          output: "array",
          schema: claimDraftSchema,
        });
        claimDrafts = response.object;
      } catch {
        claimDrafts = sectionEvidence.slice(0, 2).map((item, index) => ({
          claimId: `${section.sectionId}-claim-${String(index + 1).padStart(2, "0")}`,
          text: item.excerpt,
          support: "grounded",
          evidenceIds: [item.evidenceId],
        }));
      }

      const claims: ReportClaim[] = claimDrafts.map((draft) => ({
        claimId: draft.claimId,
        text: draft.text,
        support: resolveClaimSupport({
          citationIds: draft.evidenceIds,
          evidenceIds: draft.evidenceIds,
          evidence,
          ...(draft.support ? { support: draft.support as ReportClaimSupport } : {}),
        }),
        citationIds: [],
        evidenceIds: draft.evidenceIds.filter((evidenceId) => evidenceById.has(evidenceId)),
        ...(draft.unresolvedReason ? { unresolvedReason: draft.unresolvedReason } : {}),
      }));

      sections.push({
        sectionId: section.sectionId,
        title: section.title,
        summary: section.summary,
        claims,
        citationIds: [],
        evidenceIds: [],
      });
      allClaims.push(...claims);
    }

    const citations = buildCitationCatalog(allClaims, evidenceById);
    for (const section of sections) {
      section.citationIds = [...new Set(section.claims.flatMap((claim) => claim.citationIds))];
      section.evidenceIds = [...new Set(section.claims.flatMap((claim) => claim.evidenceIds))];
      for (const claim of section.claims) {
        claim.support = resolveClaimSupport({
          citationIds: claim.citationIds,
          evidenceIds: claim.evidenceIds,
          evidence,
          ...(claim.support ? { support: claim.support } : {}),
        });
      }
    }

    const reportId = `report-${crypto.randomUUID()}`;
    const supportMap = buildReportSupportMap(sections, citations).map((entry) => ({
      ...entry,
      reportId,
    }));
    const payload = assembleGeneratedReport({
      reportId,
      pocketId: input.pocketId,
      title: outline.title,
      subtitle: outline.subtitle,
      generatedAt: this.now(),
      sections,
      citations,
      supportMap,
      evidence,
      modelId: resolved.metadata.modelId,
    });

    return GeneratedReportPayloadSchema.parse(payload) as GeneratedReportPayload;
  }
}
