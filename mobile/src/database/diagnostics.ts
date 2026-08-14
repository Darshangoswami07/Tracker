import { ensureDatabaseReady, getDatabase } from './database';
import { orderRepository } from './repositories/orderRepository';

/**
 * TEMPORARY DEVELOPMENT-ONLY diagnostics. Proves that business data is stored
 * locally on the device by reporting SQLite connection state, schema version,
 * PRAGMA settings, table list, and row counts. Also runs a full create → read
 * → update → read → delete round-trip against the local `orders` table — all
 * against the on-device database only (never FastAPI / Neon). Remove this file
 * and its screen before shipping.
 */

export interface SqliteDiagnostics {
  initialized: boolean;
  databasePath: string | null;
  sqliteVersion: string;
  userVersion: number;
  journalMode: string;
  foreignKeys: number;
  tables: string[];
  rowCounts: { table: string; count: number }[];
}

/** Tables that drive the business domain; only these get row counts. */
const IMPORTANT_TABLES = [
  'orders',
  'order_status_history',
  'order_attachments',
  'companies',
  'drivers',
  'employees',
  'sync_meta',
] as const;

export const getSqliteDiagnostics = async (): Promise<SqliteDiagnostics> => {
  const db = await getDatabase();
  await ensureDatabaseReady();

  const version = await db.getFirstAsync<{ v: string }>('SELECT sqlite_version() AS v');
  const userVersion = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const journalMode = await db.getFirstAsync<{ journal_mode: string }>('PRAGMA journal_mode');
  const foreignKeys = await db.getFirstAsync<{ foreign_keys: number }>('PRAGMA foreign_keys');

  const tableRows = await db.getAllAsync<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`
  );
  const tables = tableRows.map((r) => r.name);

  const rowCounts: { table: string; count: number }[] = [];
  for (const table of IMPORTANT_TABLES) {
    if (!tables.includes(table)) continue;
    const row = await db.getFirstAsync<{ c: number }>(`SELECT COUNT(*) AS c FROM ${table}`);
    rowCounts.push({ table, count: row?.c ?? 0 });
  }

  return {
    initialized: true,
    databasePath: db.databasePath ?? null,
    sqliteVersion: version?.v ?? '',
    userVersion: userVersion?.user_version ?? 0,
    journalMode: journalMode?.journal_mode ?? '',
    foreignKeys: foreignKeys?.foreign_keys ?? 0,
    tables,
    rowCounts,
  };
};

export interface SqliteTestOrderResult {
  orderId: string;
  orderNumber: string;
  created: boolean;
  readBackAfterCreate: string | null;
  updated: boolean;
  readBackAfterUpdate: string | null;
  deleted: boolean;
  verifyDeleted: boolean;
}

/**
 * Full CRUD round-trip against the local `orders` table. No network call is
 * made — everything flows through `orderRepository` → SQLite. The row is
 * soft-deleted at the end so no test data lingers on the device.
 */
export const runSqliteTestOrder = async (): Promise<SqliteTestOrderResult> => {
  const orderNumber = `DIAG-${Date.now()}`;

  const created = await orderRepository.create({
    grNumber: orderNumber,
    consignorName: 'Diagnostics Sender',
    consigneeName: 'Diagnostics Receiver',
    pickupAddress: 'Test Pickup Address',
    deliveryAddress: 'Test Delivery Address',
    pickupTime: new Date().toISOString(),
    particulars: 'Temporary diagnostic test order',
  });

  const afterCreate = await orderRepository.getById(created.id);

  const updated = await orderRepository.update(created.id, {
    consigneeName: 'Diagnostics Receiver (Updated)',
    notes: 'updated by diagnostics',
  });
  const afterUpdate = await orderRepository.getById(created.id);

  await orderRepository.remove(created.id);
  const afterDelete = await orderRepository.getById(created.id);

  return {
    orderId: created.id,
    orderNumber,
    created: !!created,
    readBackAfterCreate: afterCreate?.consigneeName ?? null,
    updated: updated?.notes === 'updated by diagnostics',
    readBackAfterUpdate: afterUpdate?.consigneeName ?? null,
    deleted: afterDelete === null,
    verifyDeleted: afterDelete === null,
  };
};