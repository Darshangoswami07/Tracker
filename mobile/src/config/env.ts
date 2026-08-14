import { Platform } from 'react-native';

/**
 * Application environment configuration.
 *
 * Secrets are never committed to the repository for the backend. The values
 * below are non-sensitive runtime settings. The API base URL can be overridden
 * via the `EXPO_PUBLIC_API_URL` environment variable (see `.env.example`).
 */

const getApiBaseUrl = (): string => {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) {
    return fromEnv.replace(/\/+$/, '');
  }

  if (Platform.OS === 'android') {
    // 10.0.2.2 is the Android emulator alias for the host machine's localhost.
    return 'http://10.0.2.2:8000';
  }
  return 'http://localhost:8000';
};

export const ENV = {
  apiBaseUrl: getApiBaseUrl(),
  appName: 'DeliveryHub',
  // Timeouts in milliseconds.
  requestTimeoutMs: 15000,
  refreshTimeoutMs: 10000,
  tokenRefreshGraceMs: 60_000,
  isDev: __DEV__,
} as const;