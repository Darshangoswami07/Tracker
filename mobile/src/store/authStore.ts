import { isAxiosError } from 'axios';
import { create } from 'zustand';
import { getCurrentUser } from '../features/auth/api/authApi';
import { tokenStorage } from '../services/tokenStorage';
import { getLogger } from '../utils/logger';
import { withTimeout } from '../utils/withTimeout';
import type { TokenPair } from '../types/token';
import type { User } from '../types/user';
import { useSessionStore } from './sessionStore';
import { useUserStore } from './userStore';

const logger = getLogger('auth-store');

export type AuthStatus = 'idle' | 'validating' | 'authenticated' | 'unauthenticated';

/** How long to wait for the server before treating validation as degraded. */
const VALIDATE_TIMEOUT_MS = 15000;

/**
 * Single source of truth for the authentication session. Exposes a status
 * state machine that drives the root navigator:
 *
 *   idle | validating  -> Splash (token check)
 *   unauthenticated    -> Auth stack
 *   authenticated      -> App stack
 */
interface AuthState {
  status: AuthStatus;
  isRefreshing: boolean;
  accessToken: string | null;
  refreshToken: string | null;
  /** Monotonic guard bumped when the session is cleared, so a stale in-flight
   *  validation result can never resurrect a wiped session. */
  epoch: number;
  /** Route the Auth stack opens on when rendering unauthenticated. Login after
   *  an explicit sign-out / expired session, Welcome for a fresh install. */
  authLaunchRoute: 'Login' | 'Welcome';

  /** Reads persisted tokens from storage and derives the initial status. */
  hydrate: () => Promise<void>;
  /** Calls GET /users/me to confirm the stored token is still valid. */
  validateSession: () => Promise<void>;
  setSession: (tokens: TokenPair, user: User) => void;
  /** Persists tokens + user without activating the authenticated state. Used to
   *  pass through the "account activated" success screen before switching. */
  stageSession: (tokens: TokenPair, user: User) => void;
  /** Flips a staged session to authenticated (picks the role dashboard). */
  activateSession: () => void;
  updateTokens: (tokens: TokenPair) => void;
  setUser: (user: User) => void;
  /** Re-fetches GET /users/me and refreshes the shared user store in place —
   *  used to pick up server-side changes made outside this session (e.g. an
   *  Admin reassigning a Staff member's area) without requiring logout/login.
   *  Never throws: on failure the previously-loaded user is left untouched
   *  so a transient network error can't blank out a valid profile. */
  refreshUser: () => Promise<void>;
  setRefreshing: (isRefreshing: boolean) => void;
  clearSession: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  status: 'idle',
  isRefreshing: false,
  accessToken: null,
  refreshToken: null,
  epoch: 0,
  authLaunchRoute: 'Welcome',

  hydrate: async () => {
    try {
      const pair = await tokenStorage.getTokenPair();
      set({
        status: pair ? 'validating' : 'unauthenticated',
        accessToken: pair?.accessToken ?? null,
        refreshToken: pair?.refreshToken ?? null,
      });
    } catch (error) {
      logger.warn('Failed to hydrate auth store', error);
      set({ status: 'unauthenticated', accessToken: null, refreshToken: null });
    }
  },

  validateSession: async () => {
    const { status, epoch } = get();
    if (status !== 'validating') return;

    const attempt = async (isRetry: boolean): Promise<void> => {
      try {
        const user = await withTimeout(getCurrentUser(), VALIDATE_TIMEOUT_MS);
        if (get().epoch !== epoch) return;
        useUserStore.getState().setUser(user);
        set({ status: 'authenticated' });
      } catch (error) {
        if (get().epoch !== epoch) return;
        const statusCode = isAxiosError(error) ? error.response?.status : undefined;
        if (statusCode === 401 || statusCode === 403) {
          logger.warn('Token validation failed', error);
          get().clearSession();
          return;
        }
        // Network/timeout/server problem: this proves nothing about whether
        // the token is actually valid, so it must NOT be treated as "session
        // expired". A single bounded retry (never more) covers a momentary
        // blip — a dev-server reload, a slow cold start — without an
        // infinite loop.
        if (!isRetry) {
          logger.warn('Session validation failed transiently — retrying once', error);
          await new Promise((resolve) => setTimeout(resolve, 1500));
          if (get().epoch !== epoch || get().status !== 'validating') return;
          await attempt(true);
          return;
        }
        // Retry also failed for a non-auth reason: still don't treat this as
        // "session expired". Keep the stored credentials AND in-memory
        // tokens intact and proceed into the app trusting the token we
        // already have — if it's actually invalid, the normal request
        // interceptor (401 -> refresh -> retry once -> logout only on a
        // definitive 401 from the refresh endpoint) takes over from there.
        logger.warn('Session validation skipped after retry (temporary network issue) — keeping session', error);
        set({ status: 'authenticated' });
      }
    };

    await attempt(false);
  },

  setSession: (tokens, user) => {
    void tokenStorage.save(tokens);
    useUserStore.getState().setUser(user);
    set({
      status: 'authenticated',
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      authLaunchRoute: 'Welcome',
    });
  },

  stageSession: (tokens, user) => {
    void tokenStorage.save(tokens);
    useUserStore.getState().setUser(user);
    set({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken });
  },

  activateSession: () => set({ status: 'authenticated' }),

  updateTokens: (tokens) => {
    void tokenStorage.save(tokens);
    set({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken });
  },

  setUser: (user) => {
    useUserStore.getState().setUser(user);
  },

  refreshUser: async () => {
    const { status, epoch } = get();
    if (status !== 'authenticated') return;
    try {
      const user = await getCurrentUser();
      if (get().epoch !== epoch) return;
      useUserStore.getState().setUser(user);
    } catch (error) {
      logger.warn('Failed to refresh current user', error);
    }
  },

  setRefreshing: (isRefreshing) => set({ isRefreshing }),

  clearSession: () => {
    useUserStore.getState().clearUser();
    useSessionStore.getState().reset();
    void tokenStorage.clear();
    set({
      status: 'unauthenticated',
      isRefreshing: false,
      accessToken: null,
      refreshToken: null,
      authLaunchRoute: 'Login',
      epoch: get().epoch + 1,
    });
  },
}));