import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLogger } from '../utils/logger';

const logger = getLogger('storage');

/**
 * Non-sensitive persistent application state, backed by AsyncStorage so it works
 * in Expo Go on Android and in the web browser alike.
 *
 * Values are cached in memory after initialisation so the synchronous `KV`
 * surface callers rely on keeps working; every mutation is also persisted to
 * AsyncStorage in a serialised write chain so writes are never lost or
 * reordered. JWT access/refresh tokens are never stored here — they live in
 * SecureStore via the token storage service.
 */

export interface KV {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
  remove(key: string): void;
}

class AsyncStorageKV implements KV {
  private readonly cache = new Map<string, string>();
  private writeChain: Promise<void> = Promise.resolve();

  constructor(entries: readonly (readonly [string, string])[]) {
    for (const [key, value] of entries) {
      this.cache.set(key, value);
    }
  }

  getString(key: string): string | undefined {
    return this.cache.get(key);
  }

  set(key: string, value: string): void {
    this.cache.set(key, value);
    this.enqueue(() => AsyncStorage.setItem(key, value));
  }

  remove(key: string): void {
    this.cache.delete(key);
    this.enqueue(() => AsyncStorage.removeItem(key));
  }

  private enqueue(task: () => Promise<void>): void {
    this.writeChain = this.writeChain
      .then(task)
      .catch((error) => {
        logger.error('[Storage] Write failed', error);
      });
  }
}

class MemoryKV implements KV {
  private readonly store = new Map<string, string>();
  getString(key: string): string | undefined {
    return this.store.get(key);
  }
  set(key: string, value: string): void {
    this.store.set(key, value);
  }
  remove(key: string): void {
    this.store.delete(key);
  }
}

let instancePromise: Promise<KV> | null = null;

/** Initialises the storage engine once and returns the shared instance. */
export const initStorage = (): Promise<KV> => {
  if (!instancePromise) {
    instancePromise = (async () => {
      const keys = await AsyncStorage.getAllKeys();
      const pairs = keys.length > 0 ? await AsyncStorage.multiGet(keys) : [];
      const entries = pairs
        .filter((pair) => pair[1] !== null)
        .map(([key, value]) => [key, value as string] as const);
      return new AsyncStorageKV(entries);
    })().catch((error) => {
      logger.error('[Storage] Initialisation failed, falling back to memory', error);
      return new MemoryKV();
    });
  }
  return instancePromise;
};