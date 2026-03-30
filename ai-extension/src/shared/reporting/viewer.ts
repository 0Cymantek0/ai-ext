export interface ReportViewerUrlInput {
  reportId?: string;
  pocketId?: string;
  generate?: boolean;
}

export function buildReportViewerUrl(
  extensionBaseUrl: string,
  input: ReportViewerUrlInput,
): string {
  const url = new URL("src/reports/report-viewer.html", extensionBaseUrl);

  if (input.reportId) {
    url.searchParams.set("reportId", input.reportId);
  }

  if (input.pocketId) {
    url.searchParams.set("pocketId", input.pocketId);
  }

  if (input.generate) {
    url.searchParams.set("generate", "1");
  }

  return url.toString();
}
