import {
  type DatabaseManager,
  STORE_NAMES,
  createDatabaseManager,
  type GeneratedReportRecord,
  type ReportSupportMapRecord,
} from "../../storage/schema.js";
import type {
  GeneratedReportPayload,
  ReportSupportMapEntry,
} from "../../shared/reporting/contracts.js";

export class ReportStorageService {
  constructor(
    private readonly database: DatabaseManager = createDatabaseManager(),
  ) {}

  async saveGeneratedReport(payload: GeneratedReportPayload): Promise<void> {
    const db = await this.database.open();
    const tx = db.transaction([STORE_NAMES.GENERATED_REPORTS], "readwrite");
    const record: GeneratedReportRecord = {
      reportId: payload.reportId,
      pocketId: payload.pocketId,
      generatedAt: payload.generatedAt,
      title: payload.title,
      payload,
    };

    await tx.objectStore(STORE_NAMES.GENERATED_REPORTS).put(record);
    await tx.done;
  }

  async getGeneratedReport(
    reportId: string,
  ): Promise<GeneratedReportPayload | null> {
    const db = await this.database.open();
    const record = await db.get(STORE_NAMES.GENERATED_REPORTS, reportId);
    return (record?.payload as GeneratedReportPayload | undefined) ?? null;
  }

  async getLatestReportForPocket(
    pocketId: string,
  ): Promise<
    | {
        reportId: string;
        pocketId: string;
        generatedAt: number;
        title: string;
      }
    | null
  > {
    const reports = await this.listReportsForPocket(pocketId);
    return reports[0] ?? null;
  }

  async listReportsForPocket(
    pocketId: string,
  ): Promise<
    Array<{ reportId: string; pocketId: string; generatedAt: number; title: string }>
  > {
    const db = await this.database.open();
    const index = db
      .transaction([STORE_NAMES.GENERATED_REPORTS], "readonly")
      .objectStore(STORE_NAMES.GENERATED_REPORTS)
      .index("pocketId");
    const records = await index.getAll(pocketId);

    return records
      .map((record) => ({
        reportId: record.reportId,
        pocketId: record.pocketId,
        generatedAt: record.generatedAt,
        title: record.title,
      }))
      .sort((left, right) => right.generatedAt - left.generatedAt);
  }

  async saveSupportMap(
    reportId: string,
    supportMap: ReportSupportMapEntry[],
  ): Promise<void> {
    const db = await this.database.open();
    const tx = db.transaction([STORE_NAMES.REPORT_SUPPORT_MAPS], "readwrite");
    const store = tx.objectStore(STORE_NAMES.REPORT_SUPPORT_MAPS);

    for (const entry of supportMap) {
      const record: ReportSupportMapRecord = {
        entryId: entry.entryId,
        reportId,
        claimId: entry.claimId,
        sectionId: entry.sectionId,
        evidenceIds: entry.evidenceIds,
        support: entry.support,
        citationIds: entry.citationIds,
        sourceUrls: entry.sourceUrls,
      };

      await store.put(record);
    }

    await tx.done;
  }
}
