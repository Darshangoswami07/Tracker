import { create } from 'zustand';
import { StorageKeys } from '../constants/storageKeys';
import { initStorage } from '../services/storage';
import { getLogger } from '../utils/logger';

const logger = getLogger('settingsStore');

/**
 * App-level preferences backed by the shared KV storage (AsyncStorage), so
 * every toggle survives navigation and app reloads. These preferences are
 * client-side by design — features without a backend/native implementation
 * persist their intent locally instead of pretending a server setting changed.
 */
export type LanguageCode = 'en' | 'hi' | 'gu';

export interface SettingsValues {
  pushNotifications: boolean;
  emailNotifications: boolean;
  smsNotifications: boolean;
  locationAccess: boolean;
  backgroundRefresh: boolean;
  dataSaver: boolean;
  autoDownload: boolean;
  language: LanguageCode;
}

const DEFAULTS: SettingsValues = {
  pushNotifications: true,
  emailNotifications: false,
  smsNotifications: false,
  locationAccess: true,
  backgroundRefresh: true,
  dataSaver: false,
  autoDownload: true,
  language: 'en',
};

const LANGUAGES: readonly LanguageCode[] = ['en', 'hi', 'gu'];

interface SettingsState extends SettingsValues {
  setPushNotifications: (value: boolean) => void;
  setEmailNotifications: (value: boolean) => void;
  setSmsNotifications: (value: boolean) => void;
  setLocationAccess: (value: boolean) => void;
  setBackgroundRefresh: (value: boolean) => void;
  setDataSaver: (value: boolean) => void;
  setAutoDownload: (value: boolean) => void;
  setLanguage: (language: LanguageCode) => void;
  /** Loads persisted preferences from storage. Call once during bootstrap. */
  hydrate: () => Promise<void>;
}

const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean';

const sanitize = (raw: string): SettingsValues => {
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch (error) {
    logger.warn('[Settings] Stored preferences are not valid JSON, using defaults', error);
    return DEFAULTS;
  }
  return {
    pushNotifications: isBoolean(parsed.pushNotifications) ? parsed.pushNotifications : DEFAULTS.pushNotifications,
    emailNotifications: isBoolean(parsed.emailNotifications) ? parsed.emailNotifications : DEFAULTS.emailNotifications,
    smsNotifications: isBoolean(parsed.smsNotifications) ? parsed.smsNotifications : DEFAULTS.smsNotifications,
    locationAccess: isBoolean(parsed.locationAccess) ? parsed.locationAccess : DEFAULTS.locationAccess,
    backgroundRefresh: isBoolean(parsed.backgroundRefresh) ? parsed.backgroundRefresh : DEFAULTS.backgroundRefresh,
    dataSaver: isBoolean(parsed.dataSaver) ? parsed.dataSaver : DEFAULTS.dataSaver,
    autoDownload: isBoolean(parsed.autoDownload) ? parsed.autoDownload : DEFAULTS.autoDownload,
    language:
      typeof parsed.language === 'string' && (LANGUAGES as readonly string[]).includes(parsed.language)
        ? (parsed.language as LanguageCode)
        : DEFAULTS.language,
  };
};

const persist = (values: SettingsValues): void => {
  const payload = JSON.stringify({
    pushNotifications: values.pushNotifications,
    emailNotifications: values.emailNotifications,
    smsNotifications: values.smsNotifications,
    locationAccess: values.locationAccess,
    backgroundRefresh: values.backgroundRefresh,
    dataSaver: values.dataSaver,
    autoDownload: values.autoDownload,
    language: values.language,
  });
  initStorage()
    .then((kv) => kv.set(StorageKeys.settingsPreferences, payload))
    .catch((error) => logger.warn('[Settings] Failed to persist preferences', error));
};

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...DEFAULTS,

  setPushNotifications: (value) => {
    set({ pushNotifications: value });
    persist(get());
  },
  setEmailNotifications: (value) => {
    set({ emailNotifications: value });
    persist(get());
  },
  setSmsNotifications: (value) => {
    set({ smsNotifications: value });
    persist(get());
  },
  setLocationAccess: (value) => {
    set({ locationAccess: value });
    persist(get());
  },
  setBackgroundRefresh: (value) => {
    set({ backgroundRefresh: value });
    persist(get());
  },
  setDataSaver: (value) => {
    set({ dataSaver: value });
    persist(get());
  },
  setAutoDownload: (value) => {
    set({ autoDownload: value });
    persist(get());
  },
  setLanguage: (language) => {
    set({ language });
    persist(get());
  },

  hydrate: async () => {
    try {
      const kv = await initStorage();
      const raw = kv.getString(StorageKeys.settingsPreferences);
      if (!raw) return;
      set(sanitize(raw));
    } catch (error) {
      logger.warn('[Settings] Failed to hydrate preferences', error);
    }
  },
}));