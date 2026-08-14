import { create } from 'zustand';
import { StorageKeys } from '../constants/storageKeys';
import { initStorage } from '../services/storage';
import { getLogger } from '../utils/logger';

const logger = getLogger('themeStore');

/**
 * The user's preferred theme: an explicit light/dark selection or "system"
 * which follows the OS appearance. The provider resolves "system" to a
 * concrete mode at render time. The preference is persisted so it survives
 * app reloads.
 */
export type ThemePreference = 'light' | 'dark' | 'system';

const PREFERENCES: readonly ThemePreference[] = ['light', 'dark', 'system'];
const DEFAULT_PREFERENCE: ThemePreference = 'light';

interface ThemeState {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
  /** Loads the persisted preference from storage. Call once during bootstrap. */
  hydrate: () => Promise<void>;
}

export const useThemeStore = create<ThemeState>((set) => ({
  preference: DEFAULT_PREFERENCE,
  setPreference: (preference) => {
    set({ preference });
    initStorage()
      .then((kv) => kv.set(StorageKeys.themeMode, preference))
      .catch((error) => logger.warn('[Theme] Failed to persist preference', error));
  },
  hydrate: async () => {
    try {
      const kv = await initStorage();
      const stored = kv.getString(StorageKeys.themeMode);
      if (stored && (PREFERENCES as readonly string[]).includes(stored)) {
        set({ preference: stored as ThemePreference });
      }
    } catch (error) {
      logger.warn('[Theme] Failed to hydrate preference', error);
    }
  },
}));