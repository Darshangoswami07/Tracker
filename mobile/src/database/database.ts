import { Platform } from 'react-native';
import * as SQLite from 'expo-sqlite';
import { runMigrations } from './migrations';

const DB_NAME = 'deliveryhub.db';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;
let initPromise: Promise<void> | null = null;

/**
 * expo-sqlite on web backs onto OPFS `createSyncAccessHandle`, which the
 * browser allows only ONE open handle for at a time *per origin* — not per
 * tab. A second tab (or a reload that doesn't get a clean unload signal,
 * e.g. Fast Refresh replacing this module) trips
 * `NoModificationAllowedError` opening the same `deliveryhub.db` file until
 * the first handle is released. Two mitigations, web-only:
 *
 *  1. Release our handle on `pagehide` so navigating away/closing the tab
 *     frees it for whoever opens next (most common real-world trigger: the
 *     user had the app open in another tab).
 *  2. If opening still races a not-yet-released handle, retry with backoff
 *     for a few seconds instead of surfacing a dead-end error — the other
 *     handle is very often already mid-release.
 */
if (Platform.OS === 'web' && typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    void closeDatabase();
  });
}

const isSyncAccessHandleLockError = (err: unknown): boolean =>
  err instanceof Error && err.name === 'NoModificationAllowedError';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Deletes everything expo-sqlite has written to OPFS for this origin. Used
 * only as a last-resort self-heal (see below) when the database can't be
 * opened at all — a crashed/killed tab can leave the OPFS access-handle
 * pool in a state where wa-sqlite reports `Invalid VFS state` on open no
 * matter how many times it's retried, and there is no in-browser API to
 * repair that pool, only to discard and recreate it. Safe here because the
 * on-device DB only holds this device's own GR data with no server copy to
 * reconcile against — a device stuck in this state has already lost access
 * to that data either way.
 */
const wipeWebSqliteStorage = async (): Promise<void> => {
  if (typeof navigator === 'undefined' || !navigator.storage?.getDirectory) return;
  try {
    const root = await navigator.storage.getDirectory();
    const names: string[] = [];
    for await (const name of root.keys()) names.push(name);
    await Promise.all(names.map((name) => root.removeEntry(name, { recursive: true }).catch(() => {})));
  } catch {
    // Best-effort — if this fails there's nothing more we can do client-side.
  }
};

// Guards the reload-based recovery below to at most once per tab session,
// so a problem a reload genuinely can't fix (another live tab holding the
// lock) fails with a clear message instead of reload-looping forever.
const RELOAD_GUARD_KEY = 'deliveryhub_db_recovery_reload';

const clearReloadGuard = (): void => {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.sessionStorage?.removeItem(RELOAD_GUARD_KEY);
  }
};

const openDatabaseWithRetry = async (): Promise<SQLite.SQLiteDatabase> => {
  const maxLockAttempts = Platform.OS === 'web' ? 6 : 1;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxLockAttempts; attempt++) {
    try {
      const db = await SQLite.openDatabaseAsync(DB_NAME);
      clearReloadGuard();
      return db;
    } catch (err) {
      lastError = err;
      if (!isSyncAccessHandleLockError(err)) break; // not a lock timing issue — fall through to self-heal
      if (attempt < maxLockAttempts) await sleep(500 * attempt);
    }
  }

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    await wipeWebSqliteStorage();

    // A broken OPFS access-handle pool (`Invalid VFS state`, or a lock that
    // never cleared) is often cached in *this tab's own* SQLite worker —
    // handles it already opened during the attempts above, which a
    // same-page retry can't release. A full reload gets a fresh worker
    // that reads the now-wiped, clean OPFS storage. Try that at most once
    // per tab session before giving up with an actionable message.
    if (window.sessionStorage?.getItem(RELOAD_GUARD_KEY) !== '1') {
      window.sessionStorage?.setItem(RELOAD_GUARD_KEY, '1');
      window.location.reload();
      // The reload is about to tear down this page — never resolve/reject
      // into it, just wait.
      return new Promise<SQLite.SQLiteDatabase>(() => {});
    }

    try {
      const db = await SQLite.openDatabaseAsync(DB_NAME);
      clearReloadGuard();
      return db;
    } catch (err) {
      lastError = err;
    }
  }

  throw new Error(
    'The local database could not be opened. Close other DeliveryHub browser tabs and reload this page.'
  );
};

/**
 * Opens (once) and migrates the on-device business database. Every repository
 * and screen goes through this singleton so the whole app shares one
 * connection and one schema version.
 */
export const getDatabase = (): Promise<SQLite.SQLiteDatabase> => {
  if (!dbPromise) {
    dbPromise = openDatabaseWithRetry().catch((err) => {
      // Let the next call retry from scratch instead of caching a rejection.
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
};

/** Ensures migrations have run before any repository call. Idempotent. */
export const ensureDatabaseReady = (): Promise<void> => {
  if (!initPromise) {
    initPromise = getDatabase()
      .then((db) => runMigrations(db))
      .catch((err) => {
        // Let the next call retry from scratch instead of caching a rejection.
        initPromise = null;
        throw err;
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