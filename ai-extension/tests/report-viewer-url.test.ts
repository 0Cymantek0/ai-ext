import { describe, expect, it } from "vitest";

import { buildReportViewerUrl } from "../src/shared/reporting/viewer";

describe("buildReportViewerUrl", () => {
  it("builds a direct report URL when reportId is provided", () => {
    const url = buildReportViewerUrl("chrome-extension://test/", {
      reportId: "report-123",
    });

    expect(url).toBe(
      "chrome-extension://test/src/reports/report-viewer.html?reportId=report-123",
    );
  });

  it("includes pocketId and generate flag for forced generation", () => {
    const url = buildReportViewerUrl("chrome-extension://test/", {
      pocketId: "pocket-456",
      generate: true,
    });

    expect(url).toBe(
      "chrome-extension://test/src/reports/report-viewer.html?pocketId=pocket-456&generate=1",
    );
  });
});
