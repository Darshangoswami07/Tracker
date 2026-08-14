import axios, { AxiosError } from 'axios';
import { ENV } from '../config/env';
import { sessionEvents } from '../services/sessionEvents';
import { tokenStorage } from '../services/tokenStorage';
import type { TokenPair } from '../types/token';
import { getLogger } from '../utils/logger';
import { unwrap } from './envelope';

const logger = getLogger('api');

/** Base axios instance used by every request in the app. */
export const apiClient = axios.create({
  baseURL: `${ENV.apiBaseUrl}/api/v1`,
  timeout: ENV.requestTimeoutMs,
  headers: {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  },
});

export const api = apiClient;

/** Raw axios client used for the refresh call (no interceptors). */
const refreshClient = axios.create({
  baseURL: `${ENV.apiBaseUrl}/api/v1`,
  timeout: ENV.refreshTimeoutMs,
  headers: {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  },
});

let refreshPromise: Promise<TokenPair> | null = null;

const doRefresh = async (): Promise<TokenPair> => {
  const refreshToken = await tokenStorage.getRefreshToken();
  if (!refreshToken) {
    throw new AxiosError('Missing refresh token', 'ERR_BAD_RESPONSE');
  }
  const response = await refreshClient.post('/auth/refresh', { refreshToken });
  const tokens = unwrap<{ tokens: TokenPair }>(response).tokens;
  await tokenStorage.save(tokens);
  return tokens;
};

/** Ensures only one refresh request is in flight at any given time. */
export const refreshTokens = (): Promise<TokenPair> => {
  if (!refreshPromise) {
    refreshPromise = doRefresh().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
};

/** Attaches the access token to every outgoing request. */
apiClient.interceptors.request.use(async (config) => {
  const accessToken = await tokenStorage.getAccessToken();
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

/** Transparently refreshes the access token once and retries the request. */
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as (import('axios').InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;
    const status = error.response?.status;
    const isAuthUrl = original?.url?.includes('/auth/');

    if (status === 401 && original && !original._retry && !isAuthUrl) {
      original._retry = true;
      try {
        const tokens = await refreshTokens();
        original.headers.Authorization = `Bearer ${tokens.accessToken}`;
        return apiClient(original);
      } catch (refreshError) {
        logger.warn('[API] Token refresh failed; session expired', refreshError);
        await tokenStorage.clear();
        // The navigation layer subscribes and redirects to the login screen.
        sessionEvents.emitExpired();
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  },
);