import { StorageKeys } from '../constants/storageKeys';
import type { TokenPair } from '../types/token';
import { secureStoreService } from './secureStore';

/**
 * Persists and clears JWT tokens inside the OS secure store (Keychain/Keystore).
 * Only the token pair lives here — passwords are never stored. On web, where
 * SecureStore is unavailable, the underlying service degrades to in-memory so
 * the app stays runnable; both token persistence and session restoration keep
 * working.
 */
export const tokenStorage = {
  async save(tokens: TokenPair): Promise<void> {
    await secureStoreService.set(StorageKeys.accessToken, tokens.accessToken);
    await secureStoreService.set(StorageKeys.refreshToken, tokens.refreshToken);
  },

  async getAccessToken(): Promise<string | undefined> {
    return (await secureStoreService.get(StorageKeys.accessToken)) ?? undefined;
  },

  async getRefreshToken(): Promise<string | undefined> {
    return (await secureStoreService.get(StorageKeys.refreshToken)) ?? undefined;
  },

  async getTokenPair(): Promise<TokenPair | null> {
    const accessToken = await secureStoreService.get(StorageKeys.accessToken);
    const refreshToken = await secureStoreService.get(StorageKeys.refreshToken);
    if (!accessToken || !refreshToken) return null;
    return {
      accessToken,
      refreshToken,
      expiresIn: 0,
      tokenType: 'Bearer',
    };
  },

  async clear(): Promise<void> {
    await secureStoreService.delete(StorageKeys.accessToken);
    await secureStoreService.delete(StorageKeys.refreshToken);
  },

  async hasTokens(): Promise<boolean> {
    const pair = await this.getTokenPair();
    return pair !== null;
  },
};