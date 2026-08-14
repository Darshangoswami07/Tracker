import * as SQLite from 'expo-sqlite';
import { runMigrations } from './migrations';

const DB_NAME = 'deliveryhub.db';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;
let initPromise: Promise<void> | null = null;

/**
 * Opens (once) and migrates the on-device business database. Every repository
 * and screen goes through this singleton so the whole app shares one
 * connection and one schema version.
 */
export const getDatabase = (): Promise<SQLite.SQLiteDatabase> => {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync(DB_NAME);
  }
  return dbPromise;
};

/** Ensures migrations have run before any repository call. Idempotent. */
export const ensureDatabaseReady = (): Promise<void> => {
  if (!initPromise) {
    initPromise = getDatabase().then((db) => runMigrations(db));
  }
  return initPromise;
};

/** Closes the shared connection (useful for tests / hot reloads). */
export const closeDatabase = async (): Promise<void> => {
  if (dbPromise) {
    const db = await dbPromise;
    await db.closeAsync();
  }
  dbPromise = null;
  initPromise = null;
};