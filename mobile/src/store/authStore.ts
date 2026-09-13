import { isAxiosError } from 'axios';
import { create } from 'zustand';
import { getCurrentUser } from '../features/auth/api/authApi';
import { tokenStorage } from '../services/tokenStorage';
import { getLogger } from '../utils/logger';
import { startupTrace } from '../utils/startupTrace';
import { withTimeout } from '../utils/withTimeout';
import type { TokenPair } from '../types/token';
import type { User } from '../types/user';
import { useSessionStore } from './sessionStore';
import { useUserStore } from './userStore';

const logger = getLogger('auth-store');

export type AuthStatus = 'idle' | 'validating' | 'authenticated' | 'unauthenticated';

/**
 * Observable outcome of the background `GET /users/me` revalidation. The
 * navigation-driving `status` flips to `authenticated` optimistically the
 * moment a stored token + cached profile are found; this secondary field
 * tracks whether the server has since confirmed (`valid`), is still checking
 * (`validating`), or the check failed for a non-auth reason (`error`, session
 * kept — a definitive 401/403 instead clears the session outright). Screens
 * can surface a subtle "reconnecting…" hint off this without it ever gating
 * the first frame.
 */
export type SessionValidation = 'idle' | 'validating' | 'valid' | 'error';

/** Per-attempt ceiling for the `GET /users/me` validation call. A timeout
 *  actively aborts the request (see `withTimeout` + AbortController). */
const VALIDATE_TIMEOUT_MS = 12000;
/** Hard cap on how long the *blocking* (no cached profile) splash path may
 *  spend validating before it proceeds into the app trusting the stored
 *  token — the request interceptor still enforces real auth from there. */
const VALIDATE_BLOCKING_BUDGET_MS = 9000;

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
  /** Background revalidation outcome — never gates navigation. */
  sessionValidation: SessionValidation;
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
  sessionValidation: 'idle',
  isRefreshing: false,
  accessToken: null,
  refreshToken: null,
  epoch: 0,
  authLaunchRoute: 'Welcome',

  hydrate: async () => {
    startupTrace.mark('authStore.hydrate:enter');
    try {
      const pair = await tokenStorage.getTokenPair();
      startupTrace.mark('authStore.hydrate:getTokenPair-returned', { hasToken: Boolean(pair) });
      const cachedUser = useUserStore.getState().user;
      startupTrace.mark('authStore.hydrate:cached-user-read', { hasCachedUser: Boolean(cachedUser) });

      if (!pair) {
        startupTrace.mark('authStore.hydrate:set-unauthenticated:start');
        set({ status: 'unauthenticated', sessionValidation: 'idle', accessToken: null, refreshToken: null });
        startupTrace.mark('authStore.hydrate:set-unauthenticated:end');
        return;
      }

      set({ accessToken: pair.accessToken, refreshToken: pair.refreshToken });

      // Optimistic restoration: with BOTH a stored token and a cached profile
      // from a previous session, go straight to the authenticated app shell —
      // the dashboard paints in well under a second. The token is revalidated
      // in the *background* (`validateSession`); only a definitive 401/403
      // downgrades the session. Without a cached profile there is no shell to
      // render, so fall back to a (short, bounded) blocking validation.
      if (cachedUser) {
        set({ status: 'authenticated', sessionValidation: 'validating' });
        startupTrace.mark('authStore:status', { value: 'authenticated (optimistic)' });
        void get().validateSession();
      } else {
        set({ status: 'validating', sessionValidation: 'validating' });
        startupTrace.mark('authStore:status', { value: 'validating (no cache — blocking)' });
      }
    } catch (error) {
      logger.warn('Failed to hydrate auth store', error);
      set({ status: 'unauthenticated', sessionValidation: 'idle', accessToken: null, refreshToken: null });
    } finally {
      // `:done` is a synchronous mark taken the instant the body finishes.
      // Compare its `+Nms` to the `⏱ hydrate:auth = Nms` line: any large gap
      // is the `measure()` continuation being starved behind the JS-thread
      // block that follows (AuthStack / NavigationContainer mount), NOT real
      // auth-hydration cost.
      startupTrace.mark('authStore.hydrate:done');
    }
  },

  validateSession: async () => {
    const { status, epoch } = get();
    if (status !== 'validating' && status !== 'authenticated') return;
    // `blocking` = the splash is still on screen waiting for us (no cached
    // profile). `background` = the app shell is already visible and this is
    // pure revalidation.
    const blocking = status === 'validating';
    const perAttemptMs = blocking ? VALIDATE_BLOCKING_BUDGET_MS : VALIDATE_TIMEOUT_MS;

    /** One `GET /users/me`, hard-aborted at `perAttemptMs`. Returns:
     *  'ok' | 'invalid' (401/403) | 'transient' (network/timeout/5xx). */
    const attempt = async (): Promise<'ok' | 'invalid' | 'transient'> => {
      const controller = new AbortController();
      startupTrace.mark('validateSession:request-start');
      try {
        const user = await withTimeout(
          getCurrentUser(controller.signal),
          perAttemptMs,
          () => controller.abort(),
        );
        if (get().epoch !== epoch) return 'ok';
        useUserStore.getState().setUser(user);
        return 'ok';
      } catch (error) {
        const code = isAxiosError(error) ? error.response?.status : undefined;
        if (code === 401 || code === 403) return 'invalid';
        return 'transient';
      }
    };

    startupTrace.mark('validateSession:start', { mode: blocking ? 'blocking' : 'background' });
    const first = await attempt();
    if (get().epoch !== epoch) return;

    if (first === 'invalid') {
      logger.warn('Token validation failed (401/403) — clearing session');
      startupTrace.mark('validateSession:done', { result: 'invalid -> logout' });
      get().clearSession();
      return;
    }

    if (first === 'ok') {
      set({ status: 'authenticated', sessionValidation: 'valid' });
      startupTrace.mark('validateSession:done', { result: 'ok' });
      return;
    }

    // Transient failure. Never keep the user on the splash for it: proceed
    // into the app trusting the stored token (the request interceptor still
    // enforces real auth — 401 -> refresh -> retry once -> logout only on a
    // definitive 401 from /auth/refresh). One bounded background retry then
    // tries to turn `sessionValidation` green without the user waiting.
    set({ status: 'authenticated', sessionValidation: 'error' });
    startupTrace.mark('validateSession:transient', { note: 'proceeding, will retry in background' });

    await new Promise((resolve) => setTimeout(resolve, 2000));
    if (get().epoch !== epoch) return;
    const second = await attempt();
    if (get().epoch !== epoch) return;
    if (second === 'invalid') {
      startupTrace.mark('validateSession:done', { result: 'invalid on retry -> logout' });
      get().clearSession();
    } else {
      set({ sessionValidation: second === 'ok' ? 'valid' : 'error' });
      startupTrace.mark('validateSession:done', { result: second });
    }
  },

  setSession: (tokens, user) => {
    void tokenStorage.save(tokens);
    useUserStore.getState().setUser(user);
    set({
      status: 'authenticated',
      sessionValidation: 'valid',
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

  activateSession: () => set({ status: 'authenticated', sessionValidation: 'valid' }),

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
      sessionValidation: 'idle',
      isRefreshing: false,
      accessToken: null,
      refreshToken: null,
      authLaunchRoute: 'Login',
      epoch: get().epoch + 1,
    });
  },
}));