import { create } from 'zustand';
import { StorageKeys } from '../constants/storageKeys';
import { initStorage } from '../services/storage';
import type { RegistrationRequestResult } from '../features/auth/types';
import { getLogger } from '../utils/logger';

const logger = getLogger('registration');

/** Statuses that still need the user to wait on the pending screen. */
const IN_FLIGHT = new Set(['pending', 'approved_pending_otp']);

interface RegistrationState {
  /** The active, not-yet-activated registration request. */
  request: RegistrationRequestResult | null;
  /** True once the persisted request has been loaded from storage. */
  hydrated: boolean;

  /** Loads a persisted in-flight request after a cold start. */
  hydrate: () => Promise<void>;
  /** Persists a freshly submitted request and keeps it in memory. */
  save: (request: RegistrationRequestResult) => void;
  /** Clears the persisted request (activated, signed out or abandoned). */
  clear: () => void;
  /** Whether the persisted request still requires the pending screen. */
  isInFlight: () => boolean;
}

export const useRegistrationStore = create<RegistrationState>((set, get) => ({
  request: null,
  hydrated: false,

  hydrate: async () => {
    try {
      const kv = await initStorage();
      const raw = kv.getString(StorageKeys.registration);
      let request: RegistrationRequestResult | null = null;
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as RegistrationRequestResult;
          if (parsed?.id && IN_FLIGHT.has(parsed.status)) request = parsed;
        } catch {
          // Corrupt payloads are discarded; the user simply starts again.
        }
      }
      set({ request, hydrated: true });
    } catch (error) {
      logger.warn('Failed to hydrate registration store', error);
      set({ hydrated: true });
    }
  },

  save: (request) => {
    set({ request });
    void initStorage()
      .then((kv) => kv.set(StorageKeys.registration, JSON.stringify(request)))
      .catch((error) => logger.warn('Failed to persist registration request', error));
  },

  clear: () => {
    set({ request: null });
    void initStorage()
      .then((kv) => kv.remove(StorageKeys.registration))
      .catch((error) => logger.warn('Failed to clear registration request', error));
  },

  isInFlight: () => {
    const request = get().request;
    return Boolean(request?.id && IN_FLIGHT.has(request.status));
  },
}));
