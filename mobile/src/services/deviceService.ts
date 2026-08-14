import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { api } from '../api/client';
import { ENDPOINTS } from '../api/endpoints';
import { StorageKeys } from '../constants/storageKeys';
import { uuid } from '../utils/uuid';
import { secureStoreService } from './secureStore';

export interface LocalDeviceRecord {
  deviceId: string;
  deviceName: string;
  platform: 'ios' | 'android' | 'web';
  appVersion?: string;
  osVersion?: string;
  registeredAt?: string;
  licenseKey?: string;
}

const deviceName = Constants.deviceName ?? Constants.platform?.android?.model ?? 'DeliveryHub Mobile';

const buildPayload = (deviceId: string) => ({
  deviceId,
  deviceName,
  platform: Platform.OS as 'ios' | 'android' | 'web',
  appVersion: Constants.expoConfig?.version ?? undefined,
  osVersion: Platform.Version ? String(Platform.Version) : undefined,
});

/**
 * Device identity + license binding (control plane). The device id is a stable
 * per-install uuid persisted in SecureStore so the same device keeps its
 * license across restarts; the license key is received once at registration
 * and persisted for later heartbeats.
 */
export const deviceService = {
  /** Stable id for this install — created once and reused forever after. */
  async getOrCreateDeviceId(): Promise<string> {
    const existing = await secureStoreService.get(StorageKeys.deviceId);
    if (existing) return existing;
    const id = uuid();
    await secureStoreService.set(StorageKeys.deviceId, id);
    return id;
  },

  /** Registers the physical device and stores its license. Best-effort — never
   * throws; returns the registration payload or null if the call failed. */
  async registerCurrentDevice(): Promise<{ deviceId: string; licenseKey: string } | null> {
    try {
      const deviceId = await this.getOrCreateDeviceId();
      const res = await api.post(ENDPOINTS.devices.register, buildPayload(deviceId));
      const data = res.data?.data;
      const licenseKey: string | undefined = data?.licenseKey;
      await secureStoreService.set(
        StorageKeys.deviceRecord,
        JSON.stringify({
          deviceId,
          deviceName,
          platform: (Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : 'web') as LocalDeviceRecord['platform'],
          appVersion: Constants.expoConfig?.version,
          osVersion: Platform.Version ? String(Platform.Version) : undefined,
          registeredAt: new Date().toISOString(),
        } satisfies LocalDeviceRecord)
      );
      if (licenseKey) {
        await secureStoreService.set(StorageKeys.deviceLicenseKey, licenseKey);
      }
      return licenseKey ? { deviceId, licenseKey } : { deviceId, licenseKey: '' };
    } catch {
      return null;
    }
  },

  /** Persisted local device record, or null before the first registration. */
  async getLocalDeviceRecord(): Promise<LocalDeviceRecord | null> {
    const raw = await secureStoreService.get(StorageKeys.deviceRecord);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as LocalDeviceRecord;
    } catch {
      return null;
    }
  },

  /** Whether this install has completed a successful registration. */
  async isRegistered(): Promise<boolean> {
    return Boolean(await secureStoreService.get(StorageKeys.deviceLicenseKey));
  },

  async clear(): Promise<void> {
    await secureStoreService.delete(StorageKeys.deviceRecord);
    await secureStoreService.delete(StorageKeys.deviceLicenseKey);
  },
};