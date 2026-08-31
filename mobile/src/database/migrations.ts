import type { SQLiteDatabase } from 'expo-sqlite';
import { CREATE_SCHEMA_SQL, DROP_SCHEMA_SQL, SCHEMA_VERSION } from './schema';

/**
 * Applies schema migrations by tracking `PRAGMA user_version`. New databases
 * (version 0) get the full schema; future schema changes add versioned steps
 * here without wiping existing on-device data.
 */
export const runMigrations = async (db: SQLiteDatabase): Promise<void> => {
  // Ensure foreign keys are enforced on every connection.  PRAGMA
  // foreign_keys is per-connection and resets to OFF on each new connection;
  // CREATE_SCHEMA_SQL only sets it for fresh installs (version 0).  Existing
  // databases need it re-applied here so ON DELETE CASCADE and other FK
  // constraints work in every repository.
  await db.runAsync('PRAGMA foreign_keys = ON');

  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;

  if (version > SCHEMA_VERSION) {
    throw new Error(`Local database is newer (v${version}) than this app supports (v${SCHEMA_VERSION}).`);
  }

  if (version === 0) {
    await db.execAsync(CREATE_SCHEMA_SQL);
    version = SCHEMA_VERSION;
  }

  // v1 -> v2: add the OCR slip-data column to existing installs without
  // touching any existing rows (ALTER TABLE ADD COLUMN never destroys data).
  if (version === 1) {
    await db.execAsync('ALTER TABLE orders ADD COLUMN slipData TEXT');
    version = 2;
  }

  // v2 -> v3: add the extended GR/slip fields (mirrors
  // `backend/app/models/order.py`'s 010_gr_slip_extended_fields migration)
  // to existing installs without touching any existing rows.
  if (version === 2) {
    await db.execAsync(`
      ALTER TABLE orders ADD COLUMN grDate TEXT;
      ALTER TABLE orders ADD COLUMN transportCompanyName TEXT;
      ALTER TABLE orders ADD COLUMN transportGstin TEXT;
      ALTER TABLE orders ADD COLUMN ewbNumber TEXT;
      ALTER TABLE orders ADD COLUMN billType TEXT;
      ALTER TABLE orders ADD COLUMN specialService TEXT;
      ALTER TABLE orders ADD COLUMN fromLocation TEXT;
      ALTER TABLE orders ADD COLUMN toLocation TEXT;
      ALTER TABLE orders ADD COLUMN deliveryAt TEXT;
      ALTER TABLE orders ADD COLUMN rate REAL;
      ALTER TABLE orders ADD COLUMN goodsValue REAL;
      ALTER TABLE orders ADD COLUMN grCharge REAL;
      ALTER TABLE orders ADD COLUMN freight REAL;
      ALTER TABLE orders ADD COLUMN labour REAL;
      ALTER TABLE orders ADD COLUMN pf REAL;
      ALTER TABLE orders ADD COLUMN doorDelivery REAL;
      ALTER TABLE orders ADD COLUMN taxGst REAL;
      ALTER TABLE orders ADD COLUMN netAmount REAL;
      ALTER TABLE orders ADD COLUMN proprietorName TEXT;
    `);
    version = 3;
  }

  // v3 -> v4: add To Pay, package type, and consignor/consignee GSTIN+phone
  // (mirrors backend/app/models/order.py's 011_gr_parties_and_charges_fields
  // migration) to existing installs without touching any existing rows.
  if (version === 3) {
    await db.execAsync(`
      ALTER TABLE orders ADD COLUMN toPay REAL;
      ALTER TABLE orders ADD COLUMN packageType TEXT;
      ALTER TABLE orders ADD COLUMN consignorGstin TEXT;
      ALTER TABLE orders ADD COLUMN consignorPhone TEXT;
      ALTER TABLE orders ADD COLUMN consigneeGstin TEXT;
      ALTER TABLE orders ADD COLUMN consigneePhone TEXT;
    `);
    version = 4;
  }

  // v4 -> v5: add proprietorPhone (mirrors backend's 012_gr_proprietor_phone
  // migration) to existing installs without touching any existing rows.
  if (version === 4) {
    await db.execAsync('ALTER TABLE orders ADD COLUMN proprietorPhone TEXT');
    version = 5;
  }

  // v5 -> v6: Excel bulk-import support. Adds `source` (defaults existing
  // rows to 'manual' — never touches their actual data) plus the GR fields
  // the Excel format carries that had no existing column, and a new
  // `import_history` table for the Excel Import History screen. Additive
  // only: no existing row in any table is modified or removed.
  //
  // Written to be safely re-runnable: if a prior attempt at this step got
  // interrupted partway (e.g. by the web build's OPFS single-writer-lock
  // self-heal in `database.ts`, which can reload the page mid-migration),
  // `PRAGMA user_version` never advanced past 5, so the app retries this
  // exact step on every subsequent load. A plain multi-statement
  // `ALTER TABLE ... ADD COLUMN` batch would then throw "duplicate column
  // name" on the columns that already got added, aborting before
  // `import_history` (later in that same batch) ever got created —
  // permanently stuck. Creating the table first (unconditionally safe via
  // `IF NOT EXISTS`) and checking `PRAGMA table_info` before each column add
  // makes every part of this step idempotent, so it always completes and
  // advances the version regardless of how far a previous attempt got.
  if (version === 5) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS import_history (
        id              TEXT PRIMARY KEY NOT NULL,
        fileName        TEXT NOT NULL,
        importedAt      TEXT NOT NULL,
        importedByName  TEXT,
        totalRows       INTEGER NOT NULL DEFAULT 0,
        importedRows    INTEGER NOT NULL DEFAULT 0,
        duplicateRows   INTEGER NOT NULL DEFAULT 0,
        failedRows      INTEGER NOT NULL DEFAULT 0
      );
    `);

    const existingColumns = new Set(
      (await db.getAllAsync<{ name: string }>('PRAGMA table_info(orders)')).map((c) => c.name)
    );
    const addColumnIfMissing = async (name: string, ddl: string) => {
      if (existingColumns.has(name)) return;
      await db.execAsync(`ALTER TABLE orders ADD COLUMN ${ddl}`);
    };
    await addColumnIfMissing('source', "source TEXT NOT NULL DEFAULT 'manual'");
    await addColumnIfMissing('chalaanNo', 'chalaanNo TEXT');
    await addColumnIfMissing('chalaanDate', 'chalaanDate TEXT');
    await addColumnIfMissing('transportGrn', 'transportGrn TEXT');
    await addColumnIfMissing('paymentMode', 'paymentMode TEXT');
    await addColumnIfMissing('grSourceLabel', 'grSourceLabel TEXT');

    version = 6;
  }

  // v6 -> v7: unconditional self-heal, independent of exactly what v5 -> v6
  // above managed to do. An earlier build of that step ran every statement
  // (columns + `import_history`) as one multi-statement `execAsync` call; on
  // the web/OPFS backend that could silently stop partway through without
  // throwing, so some installs ended up with `PRAGMA user_version` already
  // at 6 — permanently skipping the `version === 5` branch above forever —
  // while `import_history` was never actually created (surfaced as
  // "no such table: import_history" the next time anything touched it).
  // This step re-verifies the same idempotent way (`IF NOT EXISTS` /
  // `PRAGMA table_info` checks) regardless of whether v5 -> v6 already
  // "completed", so any install stuck in that state gets healed here.
  if (version === 6) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS import_history (
        id              TEXT PRIMARY KEY NOT NULL,
        fileName        TEXT NOT NULL,
        importedAt      TEXT NOT NULL,
        importedByName  TEXT,
        totalRows       INTEGER NOT NULL DEFAULT 0,
        importedRows    INTEGER NOT NULL DEFAULT 0,
        duplicateRows   INTEGER NOT NULL DEFAULT 0,
        failedRows      INTEGER NOT NULL DEFAULT 0
      );
    `);

    const existingColumns = new Set(
      (await db.getAllAsync<{ name: string }>('PRAGMA table_info(orders)')).map((c) => c.name)
    );
    const addColumnIfMissing = async (name: string, ddl: string) => {
      if (existingColumns.has(name)) return;
      await db.execAsync(`ALTER TABLE orders ADD COLUMN ${ddl}`);
    };
    await addColumnIfMissing('source', "source TEXT NOT NULL DEFAULT 'manual'");
    await addColumnIfMissing('chalaanNo', 'chalaanNo TEXT');
    await addColumnIfMissing('chalaanDate', 'chalaanDate TEXT');
    await addColumnIfMissing('transportGrn', 'transportGrn TEXT');
    await addColumnIfMissing('paymentMode', 'paymentMode TEXT');
    await addColumnIfMissing('grSourceLabel', 'grSourceLabel TEXT');

    version = 7;
  }

  // v7 -> v8: Add payments table for tracking individual payment records
  // against GR/Orders. Additive only: no existing rows touched.
  if (version === 7) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS payments (
        id              TEXT PRIMARY KEY NOT NULL,
        orderId         TEXT NOT NULL,
        amount          REAL NOT NULL,
        paymentMethod   TEXT,
        notes           TEXT,
        recordedBy      TEXT,
        createdAt       TEXT NOT NULL,
        FOREIGN KEY (orderId) REFERENCES orders(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_payments_orderId ON payments(orderId);
    `);
    version = 8;
  }

  // Unconditional final self-heal, independent of `version`. A version-0
  // install that ran `CREATE_SCHEMA_SQL` (which, before this table was added
  // to it, jumped straight from 0 to SCHEMA_VERSION) never passed through
  // the `version === 5`/`=== 6` branches above, so it could reach version 7
  // — the terminal state, never re-entering this function's branches again
  // — without `import_history` ever having been created. Runs on every call
  // but is a no-op once the table exists (`IF NOT EXISTS`).
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS import_history (
      id              TEXT PRIMARY KEY NOT NULL,
      fileName        TEXT NOT NULL,
      importedAt      TEXT NOT NULL,
      importedByName  TEXT,
      totalRows       INTEGER NOT NULL DEFAULT 0,
      importedRows    INTEGER NOT NULL DEFAULT 0,
      duplicateRows   INTEGER NOT NULL DEFAULT 0,
      failedRows      INTEGER NOT NULL DEFAULT 0
    );
  `);

  // v8 -> v9: Add `area` column to orders and import_history for area-based
  // staff access control. Additive only: existing rows get NULL (no area assigned).
  if (version === 8) {
    const orderColumns = new Set(
      (await db.getAllAsync<{ name: string }>('PRAGMA table_info(orders)')).map((c) => c.name)
    );
    if (!orderColumns.has('area')) {
      await db.execAsync('ALTER TABLE orders ADD COLUMN area TEXT');
    }
    const importColumns = new Set(
      (await db.getAllAsync<{ name: string }>('PRAGMA table_info(import_history)')).map((c) => c.name)
    );
    if (!importColumns.has('area')) {
      await db.execAsync('ALTER TABLE import_history ADD COLUMN area TEXT');
    }
    version = 9;
  }

  // v9 -> v10: GR Details payment tracking. `payments` (the running,
  // multi-transaction ledger) becomes the single source of truth for "Paid
  // Amount" — `orders.paymentAmount` was a static column set once at
  // creation/Excel-import and never updated by `addPayment`, so an order
  // with a nonzero legacy `paymentAmount` but zero `payments` rows would
  // otherwise show "Paid: 0" once the UI switches to reading the ledger.
  // Backfilling it as one real payment record (idempotent — only touches
  // orders that have no payments rows yet) preserves that history instead
  // of losing it, without ever double-counting a GR that already has real
  // payment rows.
  if (version === 9) {
    await db.execAsync(`
      INSERT INTO payments (id, orderId, amount, paymentMethod, notes, recordedBy, createdAt)
      SELECT lower(hex(randomblob(16))), o.id, o.paymentAmount, o.paymentMode,
             'Initial payment (migrated from GR record)', NULL, o.createdAt
      FROM orders o
      WHERE COALESCE(o.paymentAmount, 0) > 0
        AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.orderId = o.id)
    `);
    version = 10;
  }

  // v10 -> v11: Reconcile status for GRs that were already fully paid
  // *before* `orderRepository.addPayment` started auto-flipping status to
  // "delivered" once totalPaid >= toPay (added this session). Those GRs'
  // payment totals already satisfied the rule, but nothing ever re-checked
  // them, so they were stuck showing "Remaining ₹0" yet still "Pending"
  // forever. This only ever raises status toward "delivered" for orders that
  // demonstrably meet the paid-in-full rule right now — it never touches
  // amounts, never deletes anything, and is idempotent (an order already
  // "delivered", or with insufficient payments, is excluded by the WHERE
  // clause and simply doesn't match on a re-run).
  if (version === 10) {
    await db.execAsync(`
      INSERT INTO order_status_history (id, orderId, status, note, createdAt)
      SELECT lower(hex(randomblob(16))), o.id, 'delivered',
             'Auto-marked delivered (migration): payment already received in full',
             datetime('now')
      FROM orders o
      WHERE o.isDeleted = 0
        AND COALESCE(o.toPay, 0) > 0
        AND o.status != 'delivered'
        AND (SELECT COALESCE(SUM(p.amount), 0) FROM payments p WHERE p.orderId = o.id) >= o.toPay - 0.005;

      UPDATE orders SET status = 'delivered', updatedAt = datetime('now')
      WHERE isDeleted = 0
        AND COALESCE(toPay, 0) > 0
        AND status != 'delivered'
        AND (SELECT COALESCE(SUM(p.amount), 0) FROM payments p WHERE p.orderId = orders.id) >= toPay - 0.005;
    `);
    version = 11;
  }

  // v11 -> v12: Fix mis-bucketed shop/area assignment for existing
  // Excel-imported GRs. `resolvedArea` used to be matched only against
  // `consigneeName`, which in real transport-slip data is a business/person
  // name (e.g. "Bhagwan Book Depot") that never equals an area — so it
  // always fell through to whatever "fallback shop" area was picked for
  // that import, even when the row's actual destination (`toLocation`, e.g.
  // "Bageshwar") clearly indicated a different area. `excelImport.ts` now
  // checks `toLocation` first for new imports; this one-time pass corrects
  // existing rows the same way. Only ever reassigns `area` to a value
  // literally present in the row's own `toLocation` — never touches
  // consignor/consignee/amounts/status, and only applies to `source =
  // 'excel'` rows (manually-created/staff-stamped areas are untouched).
  if (version === 11) {
    await db.execAsync(`
      UPDATE orders
      SET area = CASE LOWER(TRIM(toLocation))
                   WHEN 'bageshwar' THEN 'Bageshwar'
                   WHEN 'almora' THEN 'Almora'
                   WHEN 'garur someshwar' THEN 'Garur Someshwar'
                 END,
          updatedAt = datetime('now')
      WHERE source = 'excel'
        AND isDeleted = 0
        AND LOWER(TRIM(toLocation)) IN ('bageshwar', 'almora', 'garur someshwar');
    `);
    version = 12;
  }

  // v12 -> v13: The v11->v12 pass above only caught exact-spelled area names
  // in `toLocation`. Real data has spelling variants of the same place name
  // ("Bageshawar" for "Bageshwar") that an exact match still misses — the
  // TS-side `matchArea()` (used for every future import from now on) was
  // widened to tolerate small edit-distance differences; this one-time pass
  // applies the same specific known variant to existing rows. Same
  // safety properties as v11->v12: only reassigns `area` for `source =
  // 'excel'` rows whose own `toLocation` is one of these known spellings,
  // nothing else touched.
  if (version === 12) {
    await db.execAsync(`
      UPDATE orders
      SET area = 'Bageshwar', updatedAt = datetime('now')
      WHERE source = 'excel'
        AND isDeleted = 0
        AND LOWER(TRIM(toLocation)) IN ('bageshawar', 'bageshwer', 'bagheshwar');
    `);
    version = 13;
  }

  // v13 -> v14: The v10->v11 pass only reconciled orders where `toPay > 0`
  // and fully paid. It never covered `toPay` being 0/unset (a GR with
  // nothing owed) — those could sit "Pending" forever despite having
  // nothing outstanding, since nothing ever triggers `addPayment` for a
  // zero-balance GR. `orderRepository`'s write paths (create/update/import/
  // addPayment) all now funnel through a shared reconciliation check for
  // this going forward; this one-time pass catches existing rows the same
  // way. Only ever raises status toward "delivered" for orders that
  // demonstrably have nothing outstanding right now — never touches
  // amounts, never deletes anything.
  if (version === 13) {
    await db.execAsync(`
      INSERT INTO order_status_history (id, orderId, status, note, createdAt)
      SELECT lower(hex(randomblob(16))), o.id, 'delivered',
             'Auto-marked delivered (migration): nothing outstanding',
             datetime('now')
      FROM orders o
      WHERE o.isDeleted = 0
        AND o.status != 'delivered'
        AND COALESCE(o.toPay, 0) <= 0;

      UPDATE orders SET status = 'delivered', updatedAt = datetime('now')
      WHERE isDeleted = 0
        AND status != 'delivered'
        AND COALESCE(toPay, 0) <= 0;
    `);
    version = 14;
  }

  // v14 -> v15: Daily Collection / money settlement feature. Adds
  // `staff_settlements` for owner/labour/driver cash handovers a staff
  // member records against their own day's collection — additive only, no
  // existing table/row touched.
  if (version === 14) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS staff_settlements (
        id         TEXT PRIMARY KEY NOT NULL,
        staffId    TEXT NOT NULL,
        type       TEXT NOT NULL,
        amount     REAL NOT NULL,
        notes      TEXT,
        createdBy  TEXT,
        createdAt  TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_staff_settlements_staffId ON staff_settlements(staffId);
      CREATE INDEX IF NOT EXISTS idx_staff_settlements_createdAt ON staff_settlements(createdAt);
    `);
    version = 15;
  }

  // Unconditional self-heal for staff_settlements. A v14->v15 migration that
  // got interrupted on web (OPFS single-writer lock) could leave the version
  // at 15 without the table ever being created. Re-runnable via IF NOT EXISTS.
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS staff_settlements (
      id         TEXT PRIMARY KEY NOT NULL,
      staffId    TEXT NOT NULL,
      type       TEXT NOT NULL,
      amount     REAL NOT NULL,
      notes      TEXT,
      createdBy  TEXT,
      createdAt  TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_staff_settlements_staffId ON staff_settlements(staffId);
    CREATE INDEX IF NOT EXISTS idx_staff_settlements_createdAt ON staff_settlements(createdAt);
  `);

  await db.execAsync(`PRAGMA user_version = ${version}`);
};

/** Test/utility helper — clears the entire local schema. */
export const resetDatabase = async (db: SQLiteDatabase): Promise<void> => {
  await db.execAsync(DROP_SCHEMA_SQL);
  await runMigrations(db);
};