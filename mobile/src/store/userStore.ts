import { create } from 'zustand';
import { StorageKeys } from '../constants/storageKeys';
import { initStorage } from '../services/storage';
import { getLogger } from '../utils/logger';
import type { User } from '../types/user';

const logger = getLogger('userStore');

/** Cache of the authenticated user's profile within the session.
 *
 * The profile is also mirrored to local KV storage (non-sensitive fields
 * only — same data `GET /users/me` returns) so that on the next cold start
 * the root navigator can render the role-correct dashboard shell
 * immediately, without waiting for a network round-trip against a
 * possibly-sleeping backend. The stored copy is refreshed on every
 * `setUser` and wiped on `clearUser` (sign-out / hard 401). */
interface UserState {
  user: User | null;
  /** True once a hydration attempt from storage has completed. */
  hydrated: boolean;
  setUser: (user: User) => void;
  clearUser: () => void;
  /** Loads the cached profile from storage. Call once during bootstrap. */
  hydrate: () => Promise<void>;
}

const persist = (user: User | null): void => {
  initStorage()
    .then((kv) => {
      if (user) {
        kv.set(StorageKeys.cachedUser, JSON.stringify(user));
      } else {
        kv.remove(StorageKeys.cachedUser);
      }
    })
    .catch((error) => logger.warn('[User] Failed to persist cached profile', error));
};

export const useUserStore = create<UserState>((set) => ({
  user: null,
  hydrated: false,
  setUser: (user) => {
    set({ user });
    persist(user);
  },
  clearUser: () => {
    set({ user: null });
    persist(null);
  },
  hydrate: async () => {
    try {
      const kv = await initStorage();
      const raw = kv.getString(StorageKeys.cachedUser);
      if (raw) {
        set({ user: JSON.parse(raw) as User });
      }
    } catch (error) {
      logger.warn('[User] Failed to hydrate cached profile', error);
    } finally {
      set({ hydrated: true });
    }
  },
}));
