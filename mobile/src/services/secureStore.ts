import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { startupTrace } from '../utils/startupTrace';

/**
 * Thin wrapper around Expo SecureStore. Used to protect JWT tokens and any
 * other genuinely sensitive values. Web has no SecureStore, so we degrade
 * gracefully to in-memory storage there.
 */
const memory = new Map<string, string>();

const isSupported = () => Platform.OS !== 'web';

export const secureStoreService = {
  async get(key: string): Promise<string | null> {
    if (!isSupported()) return memory.get(key) ?? null;
    // TEMP INSTRUMENTATION — measures the native Keystore round-trip per key.
    startupTrace.mark('SecureStore.getItemAsync:start', { key });
    const value = await SecureStore.getItemAsync(key);
    startupTrace.mark('SecureStore.getItemAsync:end', { key });
    return value;
  },

  async set(key: string, value: string): Promise<void> {
    if (!isSupported()) {
      memory.set(key, value);
      return;
    }
    await SecureStore.setItemAsync(key, value, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  },

  async delete(key: string): Promise<void> {
    if (!isSupported()) {
      memory.delete(key);
      return;
    }
    await SecureStore.deleteItemAsync(key);
  },
};