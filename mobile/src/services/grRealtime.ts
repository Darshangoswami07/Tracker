/**
 * Live GR / payment change feed for the Admin / Staff screens.
 *
 * ONE process-wide WebSocket to `GET /admin/orders/ws` (React Native ships a
 * global `WebSocket`, no dependency). The backend pushes `gr.status` /
 * `gr.updated` / `gr.deleted` / `gr.created` events the instant a change
 * commits — screens patch their cache from them instead of polling.
 *
 * Design points that keep this from becoming a request storm:
 *  - `resync` (the "you may be behind, do ONE catch-up fetch" hint) is
 *    emitted ONLY when a socket genuinely (re)connects — never per failed
 *    reconnect attempt. A socket that can't connect emits nothing.
 *  - Auth is the access token in the query string (a WebSocket can't set an
 *    Authorization header). A close with an auth code refreshes the token
 *    ONCE via the shared single-flight `refreshTokens()`, then reconnects
 *    with the new one; a second auth failure ends the session cleanly.
 *  - Reconnect backoff is slow (3s → 60s) and gives up after a handful of
 *    consecutive failures until the app is foregrounded again.
 *  - Singleton, ref-counted: one socket regardless of how many screens
 *    subscribe; the socket closes when the last subscriber leaves.
 */
import { AppState, type AppStateStatus } from 'react-native';
import { ENV } from '../config/env';
import { refreshTokens } from '../api/client';
import { sessionEvents } from './sessionEvents';
import { tokenStorage } from './tokenStorage';
import { getLogger } from '../utils/logger';

const logger = getLogger('grRealtime');

export interface GrEvent {
  type: 'gr.status' | 'gr.updated' | 'gr.deleted' | 'gr.created' | 'resync';
  id?: string;
  ids?: string[];
  orderNumber?: string;
  status?: string;
  previousStatus?: string | null;
  toPay?: number;
  paymentAmount?: number;
  totalPaid?: number | null;
  area?: string | null;
  companyId?: string | null;
  updatedAt?: string;
  actorRole?: string | null;
}

type Listener = (event: GrEvent) => void;

const MAX_RECONNECT_ATTEMPTS = 6;
const BASE_BACKOFF_MS = 3_000;
const MAX_BACKOFF_MS = 60_000;

const wsUrl = (token: string): string => {
  const base = ENV.apiBaseUrl.replace(/^http/i, 'ws').replace(/\/+$/, '');
  return `${base}/api/v1/admin/orders/ws?token=${encodeURIComponent(token)}`;
};

class GrRealtime {
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private attempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private appStateSub: { remove: () => void } | null = null;
  private closedByUs = false;
  private everConnected = false;
  private refreshedForThisSocket = false;

  /** Subscribe to GR events. Opens the socket on the first subscriber and
   * closes it when the last one leaves. Returns an unsubscribe fn. */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    if (this.listeners.size === 1) this.start();
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) this.stop();
    };
  }

  private emit(event: GrEvent) {
    this.listeners.forEach((l) => {
      try {
        l(event);
      } catch (err) {
        logger.warn('listener threw', err);
      }
    });
  }

  private start() {
    this.closedByUs = false;
    if (!this.appStateSub) {
      this.appStateSub = AppState.addEventListener('change', this.onAppState);
    }
    void this.connect();
  }

  private stop() {
    this.closedByUs = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.appStateSub?.remove();
    this.appStateSub = null;
    this.ws?.close();
    this.ws = null;
    this.attempts = 0;
    this.everConnected = false;
  }

  private onAppState = (state: AppStateStatus) => {
    if (this.listeners.size === 0) return;
    if (state === 'active') {
      // Foreground: reset the give-up counter and reconnect if the socket
      // isn't live. The reconnect's `onopen` emits the single `resync` — we
      // never emit one here, so a still-broken connection makes no requests.
      this.attempts = 0;
      if (!this.ws || this.ws.readyState > WebSocket.OPEN) void this.connect();
    } else if (state === 'background') {
      this.ws?.close();
      this.ws = null;
    }
  };

  private async connect() {
    if (this.closedByUs || this.listeners.size === 0) return;
    if (this.ws && this.ws.readyState <= WebSocket.OPEN) return;

    const token = await tokenStorage.getAccessToken();
    if (!token) {
      // No session yet — wait for one rather than opening an unauthenticated
      // socket that will only bounce. A later `subscribe`/foreground retries.
      this.scheduleReconnect();
      return;
    }

    try {
      const ws = new WebSocket(wsUrl(token));
      this.ws = ws;
      this.refreshedForThisSocket = false;

      ws.onopen = () => {
        this.attempts = 0;
        const reconnected = this.everConnected;
        this.everConnected = true;
        logger.info('connected');
        // Only nudge screens to catch up on a RE-connect — on the very first
        // connect their own initial load already has fresh data.
        if (reconnected) this.emit({ type: 'resync' });
      };

      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(typeof e.data === 'string' ? e.data : '');
          if (data?.type && data.type !== 'ping') this.emit(data as GrEvent);
        } catch {
          /* ignore malformed frame */
        }
      };

      ws.onerror = () => {
        /* onclose fires next and drives the retry */
      };

      ws.onclose = (evt) => {
        this.ws = null;
        if (this.closedByUs || this.listeners.size === 0) return;
        // 4401 (bad/expired token) / 4403 (forbidden): try ONE token refresh
        // via the shared single-flight helper, then reconnect with the new
        // token. A second auth failure = the session is really over.
        const code = (evt as CloseEvent)?.code;
        if ((code === 4401 || code === 4403) && !this.refreshedForThisSocket) {
          this.refreshedForThisSocket = true;
          refreshTokens()
            .then(() => this.connect())
            .catch((err) => {
              const status = (err as { response?: { status?: number } })?.response?.status;
              if (status === 401) {
                logger.warn('realtime auth expired; ending session');
                sessionEvents.emitExpired();
              } else {
                this.scheduleReconnect();
              }
            });
          return;
        }
        this.scheduleReconnect();
      };
    } catch (err) {
      logger.warn('connect failed', err);
      this.ws = null;
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.closedByUs || this.listeners.size === 0 || this.reconnectTimer) return;
    if (this.attempts >= MAX_RECONNECT_ATTEMPTS) {
      // Give up quietly — the next app-foreground (onAppState) resets
      // `attempts` and tries again. No storm while the connection is down.
      logger.warn('realtime: giving up reconnecting until next foreground');
      return;
    }
    const delay =
      Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** this.attempts) + Math.random() * 1_000;
    this.attempts += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, delay);
  }
}

export const grRealtime = new GrRealtime();
