import type {
  GeneratedReportPayload,
  NormalizedReportEvidence,
  ReportCitation,
  ReportClaim,
  ReportClaimSupport,
  ReportSection,
  ReportSupportMapEntry,
} from "../../shared/reporting/contracts.js";

export function resolveClaimSupport(input: {
  support?: ReportClaimSupport;
  citationIds: string[];
  evidenceIds: string[];
  evidence: NormalizedReportEvidence[];
}): ReportClaimSupport {
  if (input.citationIds.length === 0 || input.evidenceIds.length === 0) {
    return "weak";
  }

  if (input.support === "conflicted") {
    return "conflicted";
  }

  const matchingEvidence = input.evidence.filter((item) =>
    input.evidenceIds.includes(item.evidenceId),
  );
  const conflictingSignals = matchingEvidence.filter((item) =>
    item.tags.some((tag) => {
      const normalized = tag.toLowerCase();
      return normalized.includes("conflict") || normalized.includes("contradict");
    }),
  );

  if (conflictingSignals.length > 0 && new Set(matchingEvidence.map((item) => item.sourceUrl)).size > 1) {
    return "conflicted";
  }

  return "grounded";
}

export function flattenUniqueCitations(
  sections: ReportSection[],
  citations: ReportCitation[],
): ReportCitation[] {
  const citationIds = new Set(
    sections.flatMap((section) => section.citationIds),
  );

  return citations.filter((citation) => citationIds.has(citation.citationId));
}

export function assembleGeneratedReport(input: {
  reportId: string;
  pocketId: string;
  title: string;
  subtitle: string;
  generatedAt: number;
  sections: ReportSection[];
  citations: ReportCitation[];
  supportMap: ReportSupportMapEntry[];
  evidence: NormalizedReportEvidence[];
  modelId?: string;
}): GeneratedReportPayload {
  const citations = flattenUniqueCitations(input.sections, input.citations);
  const sections: ReportSection[] = input.sections.map((section) => ({
    sectionId: section.sectionId,
    title: section.title,
    summary: section.summary,
    claims: section.claims.map((claim) => ({
      claimId: claim.claimId,
      text: claim.text,
      support: claim.support,
      citationIds: [...claim.citationIds],
      evidenceIds: [...claim.evidenceIds],
      ...(claim.unresolvedReason
        ? { unresolvedReason: claim.unresolvedReason }
        : {}),
    })),
    citationIds: [...new Set(section.claims.flatMap((claim) => claim.citationIds))],
    evidenceIds: [...new Set(section.claims.flatMap((claim) => claim.evidenceIds))],
  }));
  const weakClaimCount = input.sections.reduce(
    (count, section) =>
      count +
      section.claims.filter((claim) => claim.support === "weak").length,
    0,
  );
  const conflictedClaimCount = input.sections.reduce(
    (count, section) =>
      count +
      section.claims.filter((claim) => claim.support === "conflicted").length,
    0,
  );

  return {
    reportId: input.reportId,
    pocketId: input.pocketId,
    title: input.title,
    subtitle: input.subtitle,
    generatedAt: input.generatedAt,
    sections,
    citations,
    supportMap: input.supportMap,
    metadata: {
      evidenceCount: input.evidence.length,
      weakClaimCount,
      conflictedClaimCount,
      ...(input.modelId ? { modelId: input.modelId } : {}),
    },
  };
}

export function buildCitationCatalog(
  claims: ReportClaim[],
  evidenceById: Map<string, NormalizedReportEvidence>,
): ReportCitation[] {
  const citations: ReportCitation[] = [];
  const citationIdsByEvidence = new Map<string, string>();

  for (const claim of claims) {
    const nextCitationIds: string[] = [];

    for (const evidenceId of claim.evidenceIds) {
      const evidence = evidenceById.get(evidenceId);
      if (!evidence) {
        continue;
      }

      let citationId = citationIdsByEvidence.get(evidenceId);
      if (!citationId) {
        citationId = `citation-${String(citations.length + 1).padStart(2, "0")}`;
        citationIdsByEvidence.set(evidenceId, citationId);
        citations.push({
          citationId,
          evidenceId,
          label: `[${citations.length + 1}]`,
          excerpt: evidence.excerpt,
          ...(evidence.sourceUrl ? { sourceUrl: evidence.sourceUrl } : {}),
          ...(evidence.sourceTitle ? { sourceTitle: evidence.sourceTitle } : {}),
        });
      }

      nextCitationIds.push(citationId);
    }

    claim.citationIds = [...new Set(nextCitationIds)];
  }

  return citations;
}
