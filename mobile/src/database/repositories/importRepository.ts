import { ensureDatabaseReady, getDatabase } from '../database';
import { uuid } from '../../utils/uuid';
import type { ValidGRRow } from '../../services/excelImport';

export interface ImportSummary {
  totalRows: number;
  importedRows: number;
  duplicateRows: number;
  failedRows: number;
  /** GR numbers skipped because they already exist — surfaced in the
   * post-import summary ("GR 6993 already exists — skipped."). */
  duplicateGRNumbers: string[];
}

export interface ImportHistoryRow {
  id: string;
  fileName: string;
  importedAt: string;
  importedByName: string | null;
  totalRows: number;
  importedRows: number;
  duplicateRows: number;
  failedRows: number;
}

const nowIso = (): string => new Date().toISOString();

/**
 * Bulk-inserts already-validated Excel rows into the on-device `orders`
 * table. Mirrors `orderRepository.create`'s column set and "one GR + one
 * initial status-history row" invariant, extended with the Excel-only
 * fields (`chalaanNo`, `paymentMode`, ...) and `source = 'excel'`.
 *
 * Safety:
 * - An existing GR number is NEVER overwritten/updated/deleted — it's
 *   simply skipped and counted as a duplicate, exactly like
 *   `orderRepository.create`'s own duplicate check.
 * - Each row's GR insert + its status-history insert happen together; if a
 *   single row throws unexpectedly it's counted as "failed" and the loop
 *   continues, so one bad record never blocks or corrupts the rest of the
 *   batch.
 * - Writes exactly one `import_history` row summarizing the whole batch.
 */
export const importRepository = {
  async bulkImportGRs(rows: ValidGRRow[], fileName: string, importedByName: string | null): Promise<ImportSummary> {
    await ensureDatabaseReady();
    const db = await getDatabase();

    const existing = await db.getAllAsync<{ orderNumber: string }>('SELECT orderNumber FROM orders');
    const existingNumbers = new Set(existing.map((r) => r.orderNumber));

    let importedRows = 0;
    let failedRows = 0;
    const duplicateGRNumbers: string[] = [];

    for (const row of rows) {
      if (existingNumbers.has(row.grNumber)) {
        duplicateGRNumbers.push(row.grNumber);
        continue;
      }

      try {
        const id = uuid();
        const createdAt = nowIso();
        const fallbackAddress = '—';
        await db.runAsync(
          `INSERT INTO orders (
            id, orderNumber, companyId, consignorName, consigneeName, particulars,
            packageCount, pickupAddress, deliveryAddress, pickupTime, weight,
            priority, status, trackingCode, notes, hasSlip, slipData, source,
            grDate, fromLocation, toLocation, paymentMode, toPay,
            chalaanNo, chalaanDate, transportGrn, grSourceLabel,
            createdAt, updatedAt, isDeleted
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            row.grNumber,
            null,
            row.consignorName,
            row.consigneeName,
            row.particulars,
            row.packageCount,
            row.fromLocation || fallbackAddress,
            row.toLocation || fallbackAddress,
            row.grDateIso,
            row.weight,
            'normal',
            'pending',
            null,
            null,
            0,
            null,
            'excel',
            row.grDateIso,
            row.fromLocation,
            row.toLocation,
            row.paymentMode,
            row.toPay,
            row.chalaanNo,
            row.chalaanDate,
            row.transportGrn,
            row.grSourceLabel,
            createdAt,
            createdAt,
            0,
          ]
        );
        await db.runAsync(
          'INSERT INTO order_status_history (id, orderId, status, note, createdAt) VALUES (?, ?, ?, ?, ?)',
          [uuid(), id, 'pending', 'Imported from Excel', createdAt]
        );
        // `paymentAmount` (Paid_Amt) reuses the pre-existing column, set via
        // a second statement so the INSERT column list above stays aligned
        // with `orderRepository.create`'s statement shape for readability.
        await db.runAsync('UPDATE orders SET paymentAmount = ? WHERE id = ?', [row.paymentAmount, id]);

        existingNumbers.add(row.grNumber);
        importedRows += 1;
      } catch (err) {
        console.warn('[Excel Import] Failed to import row', row.rowNumber, err);
        failedRows += 1;
      }
    }

    await db.runAsync(
      `INSERT INTO import_history (id, fileName, importedAt, importedByName, totalRows, importedRows, duplicateRows, failedRows)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [uuid(), fileName, nowIso(), importedByName, rows.length, importedRows, duplicateGRNumbers.length, failedRows]
    );

    return {
      totalRows: rows.length,
      importedRows,
      duplicateRows: duplicateGRNumbers.length,
      failedRows,
      duplicateGRNumbers,
    };
  },

  async listImportHistory(): Promise<ImportHistoryRow[]> {
    await ensureDatabaseReady();
    const db = await getDatabase();
    return db.getAllAsync<ImportHistoryRow>('SELECT * FROM import_history ORDER BY importedAt DESC');
  },
};
