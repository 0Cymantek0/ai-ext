import { z } from "zod";

export const ReportClaimSupportSchema = z.enum([
  "grounded",
  "weak",
  "conflicted",
]);

export const NormalizedReportEvidenceSchema = z.object({
  evidenceId: z.string().min(1),
  pocketId: z.string().min(1),
  contentId: z.string().min(1),
  sourceUrl: z.string().optional(),
  sourceTitle: z.string().optional(),
  sourceType: z.string().min(1),
  capturedAt: z.number(),
  excerpt: z.string().min(1),
  snippet: z.string().optional(),
  tags: z.array(z.string()),
  chunkId: z.string().optional(),
  chunkIndex: z.number().int().optional(),
  relevanceScore: z.number().optional(),
  provenance: z.object({
    origin: z.enum(["captured-content", "vector-chunk", "runtime-artifact"]),
    artifactId: z.string().optional(),
    extractionMethod: z.string().min(1),
  }),
});

export const ReportCitationSchema = z.object({
  citationId: z.string().min(1),
  evidenceId: z.string().min(1),
  label: z.string().min(1),
  sourceUrl: z.string().optional(),
  sourceTitle: z.string().optional(),
  excerpt: z.string().min(1),
  note: z.string().optional(),
});

export const ReportClaimSchema = z.object({
  claimId: z.string().min(1),
  text: z.string().min(1),
  support: ReportClaimSupportSchema,
  citationIds: z.array(z.string().min(1)),
  evidenceIds: z.array(z.string().min(1)),
  unresolvedReason: z.string().optional(),
});

export const ReportSectionSchema = z.object({
  sectionId: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  claims: z.array(ReportClaimSchema),
  citationIds: z.array(z.string().min(1)),
  evidenceIds: z.array(z.string().min(1)),
});

export const ReportSupportMapEntrySchema = z.object({
  entryId: z.string().min(1),
  reportId: z.string().optional(),
  claimId: z.string().min(1),
  sectionId: z.string().min(1),
  evidenceIds: z.array(z.string().min(1)).min(1),
  citationIds: z.array(z.string().min(1)),
  support: ReportClaimSupportSchema,
  sourceUrls: z.array(z.string()),
});

export const GeneratedReportPayloadSchema = z.object({
  reportId: z.string().min(1),
  pocketId: z.string().min(1),
  title: z.string().min(1),
  subtitle: z.string().min(1),
  generatedAt: z.number(),
  sections: z.array(ReportSectionSchema),
  citations: z.array(ReportCitationSchema),
  supportMap: z.array(ReportSupportMapEntrySchema),
  metadata: z.object({
    evidenceCount: z.number().int().nonnegative(),
    weakClaimCount: z.number().int().nonnegative(),
    conflictedClaimCount: z.number().int().nonnegative(),
    modelId: z.string().optional(),
  }),
});

export type ReportClaimSupport = z.infer<typeof ReportClaimSupportSchema>;
export type NormalizedReportEvidence = z.infer<
  typeof NormalizedReportEvidenceSchema
>;
export type ReportCitation = z.infer<typeof ReportCitationSchema>;
export type ReportClaim = z.infer<typeof ReportClaimSchema>;
export type ReportSection = z.infer<typeof ReportSectionSchema>;
export type ReportSupportMapEntry = z.infer<
  typeof ReportSupportMapEntrySchema
>;
export type GeneratedReportPayload = z.infer<
  typeof GeneratedReportPayloadSchema
>;
