import * as SQLite from 'expo-sqlite';
import { runMigrations } from './migrations';

const DB_NAME = 'deliveryhub.db';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;
let initPromise: Promise<void> | null = null;

/**
 * TEMP DEV TRACE (remove before shipping): logs a warning if the given promise
 * does not settle within `ms`, WITHOUT altering its resolution/rejection. This
 * turns a silent hang into a visible "[DB] TIMEOUT ..." line so we can pin
 * exactly which async boundary stalls at runtime.
 */
const warnIfSlow = <T,>(label: string, promise: Promise<T>, ms = 5000): Promise<T> => {
  const timer = setTimeout(() => {
    console.warn(`[DB] TIMEOUT ${label} did not settle within ${ms}ms`);
  }, ms);
  return promise.finally(() => clearTimeout(timer));
};

/**
 * Opens (once) and migrates the on-device business database. Every repository
 * and screen goes through this singleton so the whole app shares one
 * connection and one schema version.
 */
export const getDatabase = (): Promise<SQLite.SQLiteDatabase> => {
  if (!dbPromise) {
    console.log('[DB] getDatabase START: openDatabaseAsync');
    dbPromise = warnIfSlow(
      'openDatabaseAsync',
      SQLite.openDatabaseAsync(DB_NAME).then((db) => {
        console.log('[DB] openDatabaseAsync COMPLETE', db.databasePath);
        return db;
      })
    );
  }
  return dbPromise;
};

/** Ensures migrations have run before any repository call. Idempotent. */
export const ensureDatabaseReady = (): Promise<void> => {
  if (!initPromise) {
    console.log('[DB] ensureDatabaseReady START');
    initPromise = getDatabase()
      .then((db) => runMigrations(db))
      .then(() => {
        console.log('[DB] ensureDatabaseReady COMPLETE');
      });
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