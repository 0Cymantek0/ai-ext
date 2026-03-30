import type { GeneratedReportPayload } from "../shared/reporting/contracts.js";
import { ReportGenerationService } from "./reporting/report-generation-service.js";
import { ReportStorageService } from "./reporting/report-storage-service.js";

export class PocketReportGenerator {
  constructor(
    private readonly reportGenerationService: ReportGenerationService = new ReportGenerationService(),
    private readonly reportStorageService: ReportStorageService = new ReportStorageService(),
  ) {}

  async generateReport(pocketId?: string): Promise<GeneratedReportPayload> {
    if (!pocketId) {
      throw new Error("PocketReportGenerator.generateReport now requires a pocketId");
    }

    const payload = await this.reportGenerationService.generateReportFromPocket({
      pocketId,
      modelId: "auto",
    });

    await this.reportStorageService.saveGeneratedReport(payload);
    await this.reportStorageService.saveSupportMap(
      payload.reportId,
      payload.supportMap,
    );

    return payload;
  }
}
