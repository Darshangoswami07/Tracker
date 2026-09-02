/**
 * Excel bulk-import data access — **API-backed**.
 *
 * The Excel file is still parsed/validated on-device (`services/excelImport.ts`),
 * but the validated rows are now sent to the FastAPI backend, which creates the
 * GRs in Neon and records the `import_history` row. No on-device database.
 */
import { api } from '../../api/client';
import { ENDPOINTS } from '../../api/endpoints';
import { ENV } from '../../config/env';
import type { ValidGRRow } from '../../services/excelImport';

const body = <T>(res: { data: { data: T } }): T => res.data.data;

export interface ImportFailure {
  rowNumber: number;
  grNumber: string;
  message: string;
}

export interface ImportSummary {
  totalRows: number;
  importedRows: number;
  duplicateRows: number;
  failedRows: number;
  duplicateGRNumbers: string[];
  failures: ImportFailure[];
}

export interface ImportHistoryRow {
  id: string;
  fileName: string;
  importedAt: string;
  importedByName: string | null;
  area: string | null;
  totalRows: number;
  importedRows: number;
  duplicateRows: number;
  failedRows: number;
}

export const importRepository = {
  async bulkImportGRs(
    rows: ValidGRRow[],
    fileName: string,
    importedByName: string | null,
    area?: string
  ): Promise<ImportSummary> {
    // Excel imports run for as long as the backend needs (each row is created
    // in Neon in one synchronous request). Override the default 15s client
    // timeout for THIS request only — see `ENV.excelImportTimeoutMs`. Nothing
    // retries or re-sends: the one request stays open until the backend
    // returns its real summary (or the socket genuinely fails).
    const res = await api.post(ENDPOINTS.admin.orders.import, {
      fileName,
      importedByName,
      area: area ?? null,
      rows: rows.map((r) => ({
        rowNumber: r.rowNumber,
        grNumber: r.grNumber,
        grDateIso: r.grDateIso ?? null,
        consignorName: r.consignorName,
        consigneeName: r.consigneeName,
        fromLocation: r.fromLocation,
        toLocation: r.toLocation,
        particulars: r.particulars,
        packageCount: r.packageCount ?? null,
        weight: r.weight ?? null,
        paymentMode: r.paymentMode ?? null,
        paymentAmount: r.paymentAmount ?? null,
        toPay: r.toPay ?? null,
        chalaanNo: r.chalaanNo ?? null,
        chalaanDate: r.chalaanDate ?? null,
        transportGrn: r.transportGrn ?? null,
        grSourceLabel: r.grSourceLabel ?? null,
        resolvedArea: r.resolvedArea ?? null,
      })),
    }, { timeout: ENV.excelImportTimeoutMs });
    const d = body<any>(res);
    return {
      totalRows: Number(d.totalRows ?? rows.length),
      importedRows: Number(d.importedRows ?? 0),
      duplicateRows: Number(d.duplicateRows ?? 0),
      failedRows: Number(d.failedRows ?? 0),
      duplicateGRNumbers: d.duplicateGRNumbers ?? [],
      failures: d.failures ?? [],
    };
  },

  async listImportHistory(): Promise<ImportHistoryRow[]> {
    const res = await api.get(ENDPOINTS.admin.orders.importHistory);
    return body<ImportHistoryRow[]>(res);
  },
};
