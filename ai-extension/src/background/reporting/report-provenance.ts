import type {
  ReportCitation,
  ReportSection,
  ReportSupportMapEntry,
} from "../../shared/reporting/contracts.js";

export function buildReportSupportMap(
  sections: ReportSection[],
  citations: ReportCitation[],
): ReportSupportMapEntry[] {
  const citationsById = new Map(citations.map((citation) => [citation.citationId, citation]));

  return sections.flatMap((section) =>
    section.claims.flatMap((claim) => {
      if (claim.evidenceIds.length === 0) {
        return [];
      }

      const sourceUrls = claim.citationIds
        .map((citationId) => citationsById.get(citationId)?.sourceUrl)
        .filter((value): value is string => Boolean(value));

      return [
        {
          entryId: `${section.sectionId}-${claim.claimId}`,
          claimId: claim.claimId,
          sectionId: section.sectionId,
          evidenceIds: [...claim.evidenceIds],
          citationIds: [...claim.citationIds],
          support: claim.support,
          sourceUrls: [...new Set(sourceUrls)],
        },
      ];
    }),
  );
}

export function getEvidenceUsage(
  supportMap: ReportSupportMapEntry[],
  evidenceId: string,
): ReportSupportMapEntry[] {
  return supportMap.filter((entry) => entry.evidenceIds.includes(evidenceId));
}

export function getSectionSupport(
  supportMap: ReportSupportMapEntry[],
  sectionId: string,
): ReportSupportMapEntry[] {
  return supportMap.filter((entry) => entry.sectionId === sectionId);
}
