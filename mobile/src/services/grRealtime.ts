/**
 * Live GR-change feed for the Admin / Staff GR list screens.
 *
 * One process-wide WebSocket to `GET /admin/orders/ws` (React Native ships a
 * global `WebSocket`, no dependency). The backend pushes `gr.status` /
 * `gr.deleted` / `gr.created` events the instant a change commits — the GR
 * list patches its own cache from them instead of polling.
 *
 * - Auth: the access token in the query string (a WebSocket can't set an
 *   Authorization header). Reconnects with the current token.
 * - Reconnect: exponential backoff, capped. Closed while the app is
 *   backgrounded; reopened on foreground with a one-shot `resync` so a
 *   screen can do a single catch-up refetch.
 * - It is NOT a data store: events are hints to update/refetch, the REST
 *   API remains the source of truth.
 */
import { AppState, type AppStateStatus } from 'react-native';
import { ENV } from '../config/env';
import { tokenStorage } from './tokenStorage';
import { getLogger } from '../utils/logger';

const logger = getLogger('grRealtime');

export interface GrEvent {
  type: 'gr.status' | 'gr.deleted' | 'gr.created' | 'resync';
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

const wsUrl = (token: string): string => {
  const base = ENV.apiBaseUrl.replace(/^http/i, 'ws').replace(/\/+$/, '');
  return `${base}/api/v1/admin/orders/ws?token=${encodeURIComponent(token)}`;
};

class GrRealtime {
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private retries = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private appStateSub: { remove: () => void } | null = null;
  private closedByUs = false;

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
    this.retries = 0;
  }

  private onAppState = (state: AppStateStatus) => {
    if (this.listeners.size === 0) return;
    if (state === 'active') {
      // Reconnect and let screens do one catch-up fetch for anything missed
      // while backgrounded.
      if (!this.ws || this.ws.readyState > WebSocket.OPEN) void this.connect();
      this.emit({ type: 'resync' });
    } else if (state === 'background') {
      this.ws?.close();
      this.ws = null;
    }
  };

  private async connect() {
    if (this.ws && this.ws.readyState <= WebSocket.OPEN) return;
    const token = await tokenStorage.getAccessToken();
    if (!token) {
      this.scheduleReconnect();
      return;
    }
    try {
      const ws = new WebSocket(wsUrl(token));
      this.ws = ws;
      ws.onopen = () => {
        this.retries = 0;
        logger.info('connected');
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
        /* onclose will follow and handle the retry */
      };
      ws.onclose = () => {
        this.ws = null;
        if (!this.closedByUs && this.listeners.size > 0) this.scheduleReconnect();
      };
    } catch (err) {
      logger.warn('connect failed', err);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.closedByUs || this.listeners.size === 0 || this.reconnectTimer) return;
    const delay = Math.min(30_000, 1000 * 2 ** this.retries) + Math.random() * 500;
    this.retries += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
      // A gap in the feed means the list may be behind — trigger one refetch.
      this.emit({ type: 'resync' });
    }, delay);
  }
}

export const grRealtime = new GrRealtime();
