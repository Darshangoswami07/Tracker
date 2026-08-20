import type { SQLiteDatabase } from 'expo-sqlite';
import { CREATE_SCHEMA_SQL, DROP_SCHEMA_SQL, SCHEMA_VERSION } from './schema';

/**
 * Applies schema migrations by tracking `PRAGMA user_version`. New databases
 * (version 0) get the full schema; future schema changes add versioned steps
 * here without wiping existing on-device data.
 */
export const runMigrations = async (db: SQLiteDatabase): Promise<void> => {
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

  await db.execAsync(`PRAGMA user_version = ${version}`);
};

/** Test/utility helper — clears the entire local schema. */
export const resetDatabase = async (db: SQLiteDatabase): Promise<void> => {
  await db.execAsync(DROP_SCHEMA_SQL);
  await runMigrations(db);
};