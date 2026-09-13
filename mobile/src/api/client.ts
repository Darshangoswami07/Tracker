import axios, { AxiosError } from 'axios';
import { ENV } from '../config/env';
import { sessionEvents } from '../services/sessionEvents';
import { tokenStorage } from '../services/tokenStorage';
import type { TokenPair } from '../types/token';
import { getLogger } from '../utils/logger';
import { unwrap } from './envelope';

const logger = getLogger('api');

const API_BASE_URL = `${ENV.apiBaseUrl}/api/v1`;

/** Base axios instance used by every request in the app. */
export const apiClient = axios.create({
  baseURL: API_BASE_URL,
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

/**
 * Best-effort "wake the server" ping.
 *
 * The backend runs on a free hosting tier that suspends the instance after a
 * period of inactivity; the first request after a suspend pays a 30-55s
 * cold-start penalty (measured). Firing this cheap, unauthenticated GET as
 * early as possible — at app launch and again when the Login screen mounts —
 * lets that cold start happen *while the user is still reading the UI / typing
 * credentials*, instead of on the critical login / session-validation
 * request. It never blocks anything and silently ignores every failure.
 */
let warmInFlight: Promise<void> | null = null;
export const warmBackend = (): Promise<void> => {
  if (!warmInFlight) {
    warmInFlight = axios
      .get(`${ENV.apiBaseUrl}/health`, { timeout: 60_000 })
      .then(() => undefined)
      .catch(() => undefined)
      .finally(() => {
        warmInFlight = null;
      });
  }
  return warmInFlight;
};

// Kick the server awake the moment the JS bundle loads.
void warmBackend();

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
        // Only a definitive "this token is invalid/expired" (401) response
        // from the refresh endpoint itself means the session is genuinely
        // over. A transient failure — network blip, 5xx, the dev server
        // mid-restart — is not proof of that, and force-logging the user
        // out on one of those throws away an otherwise-valid session for a
        // problem that resolves itself on the next request.
        const refreshStatus = (refreshError as AxiosError)?.response?.status;
        if (refreshStatus === 401) {
          logger.warn('[API] Token refresh failed; session expired', refreshError);
          await tokenStorage.clear();
          // The navigation layer subscribes and redirects to the login screen.
          sessionEvents.emitExpired();
        } else {
          logger.warn('[API] Token refresh failed transiently; keeping session', refreshError);
        }
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  },
);