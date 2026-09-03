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
  // Excel GR imports are a single synchronous request that creates every row
  // in Neon (see backend `bulk_import`). A large sheet legitimately takes
  // minutes, so this ONE request opts out of `requestTimeoutMs` and uses a
  // generous 10-minute ceiling instead (finite, so a truly hung socket still
  // fails eventually). Applied per-request in `importRepository` — every
  // other endpoint keeps `requestTimeoutMs`.
  excelImportTimeoutMs: 10 * 60_000,
  // The admin GR/orders list joins payments + attachments per page and can
  // legitimately take longer than the default budget once a company has a
  // large order history. Give it its own finite ceiling instead of raising
  // `requestTimeoutMs` for every other (small, fast) request.
  ordersListTimeoutMs: 30_000,
  tokenRefreshGraceMs: 60_000,
  isDev: __DEV__,
} as const;