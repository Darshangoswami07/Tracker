'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getAuthToken } from '@/lib/auth';

/**
 * Live GR-change feed for the admin dashboard.
 *
 * One WebSocket to `GET /admin/orders/ws` (same backend channel the mobile
 * app uses). When staff / another admin changes a GR's status or deletes one,
 * the affected TanStack Query caches are invalidated so the currently-shown
 * (filtered / searched / paginated) GR list refetches once — no page reload,
 * no polling. The browser `WebSocket` auto-reconnect is handled here with a
 * capped backoff; on (re)connect the list is refreshed so nothing missed
 * while disconnected stays stale.
 */
export function useGREvents() {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const base = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1').replace(
      /^http/i,
      'ws',
    );

    let ws: WebSocket | null = null;
    let retries = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    let debounce: ReturnType<typeof setTimeout> | null = null;

    const refresh = () => {
      if (debounce) return;
      debounce = setTimeout(() => {
        debounce = null;
        queryClient.invalidateQueries({ queryKey: ['gr-list'] });
        queryClient.invalidateQueries({ queryKey: ['gr-detail'] });
      }, 300);
    };

    const connect = () => {
      const token = getAuthToken();
      if (!token || stopped) {
        scheduleReconnect();
        return;
      }
      ws = new WebSocket(`${base}/admin/orders/ws?token=${encodeURIComponent(token)}`);
      ws.onopen = () => {
        retries = 0;
        refresh(); // catch up on anything missed while disconnected
      };
      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data?.type && data.type !== 'ping') refresh();
        } catch {
          /* ignore */
        }
      };
      ws.onclose = () => {
        ws = null;
        if (!stopped) scheduleReconnect();
      };
      ws.onerror = () => ws?.close();
    };

    const scheduleReconnect = () => {
      if (stopped || reconnectTimer) return;
      const delay = Math.min(30_000, 1000 * 2 ** retries) + Math.random() * 500;
      retries += 1;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, delay);
    };

    connect();
    return () => {
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (debounce) clearTimeout(debounce);
      ws?.close();
    };
  }, [queryClient]);
}
