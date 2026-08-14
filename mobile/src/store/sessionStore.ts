import { create } from 'zustand';
import { StorageKeys } from '../constants/storageKeys';
import { initStorage } from '../services/storage';
import { getLogger } from '../utils/logger';

const logger = getLogger('session');

/**
 * Session-level UI state. Tracks the "Remember Me" preference (persisting only
 * the email — never a password) and transient bootstrap flags.
 */
interface SessionState {
  rememberMe: boolean;
  rememberedEmail: string;
  isBootstrapping: boolean;

  setRememberMe: (remember: boolean, email?: string) => void;
  setBootstrapping: (value: boolean) => void;
  reset: () => void;
  hydrate: () => Promise<void>;
}

export const useSessionStore = create<SessionState>((set) => ({
  rememberMe: false,
  rememberedEmail: '',
  isBootstrapping: true,

  setRememberMe: (remember, email) => {
    set({ rememberMe: remember, rememberedEmail: remember ? (email ?? '') : '' });
    initStorage()
      .then((kv) => {
        if (remember && email) {
          kv.set(StorageKeys.rememberedEmail, email);
        } else {
          kv.remove(StorageKeys.rememberedEmail);
        }
      })
      .catch((error) => logger.warn('Failed to update remembered email', error));
  },

  setBootstrapping: (value) => set({ isBootstrapping: value }),

  reset: () => set({ rememberMe: false, rememberedEmail: '' }),

  hydrate: async () => {
    try {
      const kv = await initStorage();
      const email = kv.getString(StorageKeys.rememberedEmail);
      set({
        rememberMe: Boolean(email),
        rememberedEmail: email ?? '',
      });
    } catch (error) {
      logger.warn('Failed to hydrate session store', error);
    }
  },
}));