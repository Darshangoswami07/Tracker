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

  await db.execAsync(`PRAGMA user_version = ${version}`);
};

/** Test/utility helper — clears the entire local schema. */
export const resetDatabase = async (db: SQLiteDatabase): Promise<void> => {
  await db.execAsync(DROP_SCHEMA_SQL);
  await runMigrations(db);
};