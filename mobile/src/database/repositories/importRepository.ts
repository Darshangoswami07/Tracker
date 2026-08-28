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
  area: string | null;
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
 * Shop/area assignment: each row's `resolvedArea` (matched off its
 * Consignee Name — see `services/excelImport.ts#validateRows`) is used when
 * present; the `area` param (picked manually on the Areas screen, if any) is
 * only a fallback for rows whose consignee name didn't match a known area.
 * This lets a single file mix GRs from multiple shops.
 *
 * Duplicate-handling rules (must be consistent with `orderRepository.create`):
 * - Active GR (`isDeleted = 0`) with same orderNumber → "Already Existing",
 *   skip the row.
 * - Soft-deleted GR (`isDeleted = 1`) with same orderNumber → physically
 *   delete the stale row (CASCADE cleans up status history + attachments),
 *   then INSERT the fresh GR. This allows re-importing a GR that was
 *   previously deleted via the UI.
 * - No existing row → INSERT as new.
 *
 * Safety:
 * - Each row's GR insert + its status-history insert happen together; if a
 *   single row throws unexpectedly it's counted as "failed" and the loop
 *   continues, so one bad record never blocks or corrupts the rest of the
 *   batch.
 * - Writes exactly one `import_history` row summarizing the whole batch.
 */
export const importRepository = {
  async bulkImportGRs(rows: ValidGRRow[], fileName: string, importedByName: string | null, area?: string): Promise<ImportSummary> {
    await ensureDatabaseReady();
    const db = await getDatabase();

    // Ensure foreign keys (including ON DELETE CASCADE) are enforced on
    // this connection.  `PRAGMA foreign_keys = ON` in CREATE_SCHEMA_SQL only
    // applies to the connection that ran it (fresh installs); existing
    // databases never re-run that pragma.
    await db.runAsync('PRAGMA foreign_keys = ON');

    // Fetch ALL existing order numbers — both active and soft-deleted — so
    // the import can correctly classify each row.
    const allExisting = await db.getAllAsync<{ orderNumber: string; isDeleted: number; id: string }>(
      'SELECT orderNumber, isDeleted, id FROM orders'
    );

    const activeNumbers = new Set(
      allExisting.filter((r) => r.isDeleted === 0).map((r) => r.orderNumber),
    );
    // Map from orderNumber → row id for soft-deleted rows, so we can
    // physically delete them before re-inserting.
    const deletedRowIds = new Map(
      allExisting.filter((r) => r.isDeleted === 1).map((r) => [r.orderNumber, r.id]),
    );

    let importedRows = 0;
    let failedRows = 0;
    const duplicateGRNumbers: string[] = [];

    for (const row of rows) {
      // Scenario B — active GR already exists: skip (count as duplicate).
      if (activeNumbers.has(row.grNumber)) {
        duplicateGRNumbers.push(row.grNumber);
        continue;
      }

      try {
        // Scenario C — soft-deleted GR exists: physically remove the stale
        // row so the UNIQUE constraint on `orderNumber` is freed.  Because
        // `PRAGMA foreign_keys = ON` and the child tables declare
        // `ON DELETE CASCADE`, `order_status_history` and
        // `order_attachments` rows for this order are cleaned up
        // automatically.
        if (deletedRowIds.has(row.grNumber)) {
          const staleId = deletedRowIds.get(row.grNumber)!;
          await db.runAsync('DELETE FROM orders WHERE id = ?', [staleId]);
          deletedRowIds.delete(row.grNumber);
        }

        const id = uuid();
        const createdAt = nowIso();
        const fallbackAddress = '—';
        await db.runAsync(
          `INSERT INTO orders (
            id, orderNumber, companyId, consignorName, consigneeName, particulars,
            packageCount, pickupAddress, deliveryAddress, pickupTime, weight,
            priority, status, trackingCode, notes, hasSlip, slipData, source,
            grDate, fromLocation, toLocation, paymentMode, toPay,
            chalaanNo, chalaanDate, transportGrn, grSourceLabel, area,
            createdAt, updatedAt, isDeleted
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            row.grNumber,
            null,
            row.consignorName,
            row.consigneeName,
            row.particulars,
            row.packageCount ?? 1,
            row.fromLocation || fallbackAddress,
            row.toLocation || fallbackAddress,
            nowIso(),
            row.weight ?? null,
            null,
            'pending',
            null,
            null,
            0,
            null,
            'excel',
            row.grDateIso ?? null,
            row.fromLocation ?? null,
            row.toLocation ?? null,
            row.paymentMode ?? null,
            row.toPay ?? null,
            row.chalaanNo ?? null,
            row.chalaanDate ?? null,
            row.transportGrn ?? null,
            row.grSourceLabel ?? null,
            row.resolvedArea ?? area ?? null,
            createdAt,
            createdAt,
            0,
          ],
        );
        await db.runAsync(
          'INSERT INTO order_status_history (id, orderId, status, note, createdAt) VALUES (?, ?, ?, ?, ?)',
          [uuid(), id, 'pending', 'Imported from Excel', createdAt]
        );
        // `paymentAmount` (Paid_Amt) reuses the pre-existing column, set via
        // a second statement so the INSERT column list above stays aligned
        // with `orderRepository.create`'s statement shape for readability.
        await db.runAsync('UPDATE orders SET paymentAmount = ? WHERE id = ?', [row.paymentAmount, id]);

        activeNumbers.add(row.grNumber);
        importedRows += 1;
      } catch (err) {
        console.warn('[Excel Import] Failed to import row', row.rowNumber, err);
        failedRows += 1;
      }
    }

    await db.runAsync(
      `INSERT INTO import_history (id, fileName, importedAt, importedByName, area, totalRows, importedRows, duplicateRows, failedRows)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [uuid(), fileName, nowIso(), importedByName, area ?? null, rows.length, importedRows, duplicateGRNumbers.length, failedRows]
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
