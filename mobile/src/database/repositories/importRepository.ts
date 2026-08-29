import { ensureDatabaseReady, getDatabase } from '../database';
import { uuid } from '../../utils/uuid';
import { useUserStore } from '../../store/userStore';
import { reconcileDeliveredStatus } from './orderRepository';
import type { ValidGRRow } from '../../services/excelImport';

/** Same sentinel/guard pattern as `orderRepository.ts` — matches no real
 * area, so a Staff account with no assigned area sees nothing rather than
 * everything. Duplicated locally rather than imported since
 * `orderRepository.ts` doesn't export these as a shared module. */
const STAFF_NO_AREA_SENTINEL = '__no_area_assigned__';

/** For a Staff user, always their own assigned area — a Staff account can
 * never import or browse import history for a different area, regardless
 * of what a file's own data (or a picked "fallback shop") says. Currently
 * dead code in practice (Excel Import isn't wired into Staff navigation —
 * see `StaffShell.tsx`), kept here as defense-in-depth so that stays true
 * even if a Staff-facing entry point is ever added. Non-Staff (Admin/Owner/
 * legacy Employee) pass through unchanged. */
const resolveAreaScope = (requestedArea?: string): string | undefined => {
  const user = useUserStore.getState().user;
  if (user?.role === 'staff') return user.area ?? STAFF_NO_AREA_SENTINEL;
  return requestedArea;
};

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
  /** GR numbers skipped because they already exist — surfaced in the
   * post-import summary ("GR 6993 already exists — skipped."). */
  duplicateGRNumbers: string[];
  /** Per-row failure reasons, so a future import failure can be diagnosed
   * without guessing. Never contains sensitive backend stack traces — only a
   * safe, human-readable reason for each row that could not be inserted. */
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

    // Staff-scoping guard (see `resolveAreaScope` above) — a Staff account
    // importing a file can only ever stamp its own assigned area onto every
    // row, regardless of what the file's own data resolves to or what
    // fallback area was picked. Non-Staff (Admin/Owner) unaffected — `area`
    // and each row's own `resolvedArea` are used exactly as before.
    const staffScopedArea = resolveAreaScope(area);
    const isStaffImport = useUserStore.getState().user?.role === 'staff';

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
    const failures: ImportFailure[] = [];

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
            'normal',
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
            (isStaffImport ? staffScopedArea : (row.resolvedArea ?? area)) ?? null,
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
        // A row can already be fully paid on import (Paid_Amt already covers
        // To Pay) or have To Pay = 0 — it should land straight in
        // "Delivered", not sit in "Pending" with nothing outstanding.
        await reconcileDeliveredStatus(db, id);

        activeNumbers.add(row.grNumber);
        importedRows += 1;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error while inserting this GR.';
        console.warn('[Excel Import] Failed to import row', row.rowNumber, err);
        failures.push({ rowNumber: row.rowNumber, grNumber: row.grNumber, message });
        failedRows += 1;
      }
    }

    await db.runAsync(
      `INSERT INTO import_history (id, fileName, importedAt, importedByName, area, totalRows, importedRows, duplicateRows, failedRows)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [uuid(), fileName, nowIso(), importedByName, (isStaffImport ? staffScopedArea : area) ?? null, rows.length, importedRows, duplicateGRNumbers.length, failedRows]
    );

    return {
      totalRows: rows.length,
      importedRows,
      duplicateRows: duplicateGRNumbers.length,
      failedRows,
      duplicateGRNumbers,
      failures,
    };
  },

  async listImportHistory(): Promise<ImportHistoryRow[]> {
    await ensureDatabaseReady();
    const db = await getDatabase();
    const scopedArea = resolveAreaScope(undefined);
    if (scopedArea) {
      return db.getAllAsync<ImportHistoryRow>(
        'SELECT * FROM import_history WHERE area = ? ORDER BY importedAt DESC',
        [scopedArea]
      );
    }
    return db.getAllAsync<ImportHistoryRow>('SELECT * FROM import_history ORDER BY importedAt DESC');
  },
};
