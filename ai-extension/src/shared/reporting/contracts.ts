export type ReportClaimSupport = "grounded" | "weak" | "conflicted";

export interface NormalizedReportEvidence {
  evidenceId: string;
  pocketId: string;
  contentId: string;
  sourceUrl?: string;
  sourceTitle?: string;
  sourceType: string;
  capturedAt: number;
  excerpt: string;
  snippet?: string;
  tags: string[];
  chunkId?: string;
  chunkIndex?: number;
  relevanceScore?: number;
  provenance: {
    origin: "captured-content" | "vector-chunk" | "runtime-artifact";
    artifactId?: string;
    extractionMethod: string;
  };
}

export interface ReportCitation {
  citationId: string;
  evidenceId: string;
  label: string;
  sourceUrl?: string;
  sourceTitle?: string;
  excerpt: string;
  note?: string;
}

export interface ReportClaim {
  claimId: string;
  text: string;
  support: ReportClaimSupport;
  citationIds: string[];
  evidenceIds: string[];
  unresolvedReason?: string;
}

export interface ReportSection {
  sectionId: string;
  title: string;
  summary: string;
  claims: ReportClaim[];
  citationIds: string[];
  evidenceIds: string[];
}

export interface ReportSupportMapEntry {
  entryId: string;
  reportId?: string;
  claimId: string;
  sectionId: string;
  evidenceIds: string[];
  citationIds: string[];
  support: ReportClaimSupport;
  sourceUrls: string[];
}

export interface GeneratedReportPayload {
  reportId: string;
  pocketId: string;
  title: string;
  subtitle: string;
  generatedAt: number;
  sections: ReportSection[];
  citations: ReportCitation[];
  supportMap: ReportSupportMapEntry[];
  metadata: {
    evidenceCount: number;
    weakClaimCount: number;
    conflictedClaimCount: number;
    modelId?: string;
  };
}
