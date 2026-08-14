import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

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
    return SecureStore.getItemAsync(key);
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