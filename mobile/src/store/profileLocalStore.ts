import { create } from 'zustand';
import { StorageKeys } from '../constants/storageKeys';
import { initStorage } from '../services/storage';
import { getLogger } from '../utils/logger';

const logger = getLogger('profileLocalStore');

/**
 * On-device-only profile edits (avatar, name/email/phone overrides). There is
 * no backend endpoint to update the logged-in user's profile — `GET /users/me`
 * is read-only — so these are stored locally only, same precedent as
 * `settingsStore.ts`'s notification/privacy toggles. They are display
 * overrides layered on top of the real account data, never sent anywhere.
 */
export interface ProfileLocalValues {
  avatarUri: string | null;
  nameOverride: string | null;
  emailOverride: string | null;
  phoneOverride: string | null;
}

const DEFAULTS: ProfileLocalValues = {
  avatarUri: null,
  nameOverride: null,
  emailOverride: null,
  phoneOverride: null,
};

interface ProfileLocalState extends ProfileLocalValues {
  setAvatarUri: (value: string | null) => void;
  setOverrides: (values: { name: string; email: string; phone: string }) => void;
  /** Loads persisted overrides from storage. Call once during bootstrap. */
  hydrate: () => Promise<void>;
}

const sanitize = (raw: string): ProfileLocalValues => {
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch (error) {
    logger.warn('[ProfileLocal] Stored overrides are not valid JSON, using defaults', error);
    return DEFAULTS;
  }
  const asStringOrNull = (value: unknown): string | null => (typeof value === 'string' ? value : null);
  return {
    avatarUri: asStringOrNull(parsed.avatarUri),
    nameOverride: asStringOrNull(parsed.nameOverride),
    emailOverride: asStringOrNull(parsed.emailOverride),
    phoneOverride: asStringOrNull(parsed.phoneOverride),
  };
};

const persist = (values: ProfileLocalValues): void => {
  const payload = JSON.stringify(values);
  initStorage()
    .then((kv) => kv.set(StorageKeys.profileLocalOverrides, payload))
    .catch((error) => logger.warn('[ProfileLocal] Failed to persist overrides', error));
};

export const useProfileLocalStore = create<ProfileLocalState>((set, get) => ({
  ...DEFAULTS,

  setAvatarUri: (value) => {
    set({ avatarUri: value });
    persist(get());
  },
  setOverrides: ({ name, email, phone }) => {
    set({ nameOverride: name, emailOverride: email, phoneOverride: phone });
    persist(get());
  },

  hydrate: async () => {
    try {
      const kv = await initStorage();
      const raw = kv.getString(StorageKeys.profileLocalOverrides);
      if (!raw) return;
      set(sanitize(raw));
    } catch (error) {
      logger.warn('[ProfileLocal] Failed to hydrate overrides', error);
    }
  },
}));
