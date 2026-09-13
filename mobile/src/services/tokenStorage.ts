import { StorageKeys } from '../constants/storageKeys';
import type { TokenPair } from '../types/token';
import { startupTrace } from '../utils/startupTrace';
import { secureStoreService } from './secureStore';

/**
 * Persists and clears JWT tokens inside the OS secure store (Keychain/Keystore).
 * Only the token pair lives here — passwords are never stored. On web, where
 * SecureStore is unavailable, the underlying service degrades to in-memory so
 * the app stays runnable; both token persistence and session restoration keep
 * working.
 *
 * In-memory cache: this is the single source of truth the API client's
 * request interceptor reads on EVERY outgoing request. Without it, every
 * request paid a real native SecureStore round-trip (Keychain/Keystore) just
 * to re-read the exact same token already sitting in `authStore.accessToken`
 * — under the concurrent requests a dashboard fires on open, those native
 * calls compete with each other and add real, measurable latency to every
 * one of them. Once `cachedAccess`/`cachedRefresh` are populated (by the one
 * real hydration read, or by any `save`), every subsequent read is
 * synchronous — no native call, no await cost.
 */
let cachedAccess: string | undefined;
let cachedRefresh: string | undefined;
/** False only before the very first hydration read (cold start, pre-`hydrate()`). */
let hydratedFromStore = false;

export const tokenStorage = {
  async save(tokens: TokenPair): Promise<void> {
    cachedAccess = tokens.accessToken;
    cachedRefresh = tokens.refreshToken;
    hydratedFromStore = true;
    // Independent writes to two different keys — no reason to serialize them.
    await Promise.all([
      secureStoreService.set(StorageKeys.accessToken, tokens.accessToken),
      secureStoreService.set(StorageKeys.refreshToken, tokens.refreshToken),
    ]);
  },

  async getAccessToken(): Promise<string | undefined> {
    if (hydratedFromStore) return cachedAccess;
    return (await this.getTokenPair())?.accessToken;
  },

  async getRefreshToken(): Promise<string | undefined> {
    if (hydratedFromStore) return cachedRefresh;
    return (await this.getTokenPair())?.refreshToken;
  },

  async getTokenPair(): Promise<TokenPair | null> {
    if (hydratedFromStore) {
      if (!cachedAccess || !cachedRefresh) return null;
      return { accessToken: cachedAccess, refreshToken: cachedRefresh, expiresIn: 0, tokenType: 'Bearer' };
    }
    // The one legitimate SecureStore round-trip per app session: reading
    // both keys concurrently (not sequentially) roughly halves this
    // one-time cost.
    startupTrace.mark('tokenStorage.getTokenPair:start');
    const [accessToken, refreshToken] = await Promise.all([
      secureStoreService.get(StorageKeys.accessToken),
      secureStoreService.get(StorageKeys.refreshToken),
    ]);
    startupTrace.mark('tokenStorage.getTokenPair:reads-done', {
      hasAccess: Boolean(accessToken),
      hasRefresh: Boolean(refreshToken),
    });
    cachedAccess = accessToken ?? undefined;
    cachedRefresh = refreshToken ?? undefined;
    hydratedFromStore = true;
    if (!accessToken || !refreshToken) return null;
    return { accessToken, refreshToken, expiresIn: 0, tokenType: 'Bearer' };
  },

  async clear(): Promise<void> {
    cachedAccess = undefined;
    cachedRefresh = undefined;
    // Hydrated-but-empty: a read right after logout must resolve to "no
    // token" instantly, not fall through to another SecureStore round-trip.
    hydratedFromStore = true;
    await Promise.all([
      secureStoreService.delete(StorageKeys.accessToken),
      secureStoreService.delete(StorageKeys.refreshToken),
    ]);
  },

  async hasTokens(): Promise<boolean> {
    const pair = await this.getTokenPair();
    return pair !== null;
  },
};
