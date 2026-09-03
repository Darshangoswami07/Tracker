import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/useAppTheme';
import { orderRepository } from '../../database/repositories/orderRepository';
import type { LocalGRListItem } from '../../database/repositories/orderRepository';
import { Header } from '../../components/Header';
import { ShimmerCard } from '../../components/ShimmerCard';
import { EmptyState } from '../../components/EmptyState';
import { StatusBadge } from '../../components/StatusBadge';
import { FilterChips } from '../../components/FilterChips';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { useAppNav } from '../../hooks/useAppNav';
import { useUserStore } from '../../store/userStore';
import { useTranslation } from 'react-i18next';
import { canDeleteGR as roleCanDeleteGR, canImportExcel as roleCanImportExcel } from '../../constants/roles';
import { AREAS } from '../../constants/areas';
import { grRealtime, type GrEvent } from '../../services/grRealtime';
import type { AppTheme } from '../../theme/types';

const PAGE_SIZE = 20;

const STATUS_FILTERS = ['All', 'Pending', 'Cleared', 'Uncleared', 'Delivered'];
const FILTER_TO_STATUS: Record<string, string | undefined> = {
  All: undefined,
  Pending: 'pending',
  Cleared: 'cleared',
  Uncleared: 'uncleared',
  Delivered: 'delivered',
};

/** Converts the Date Range filter chip into an inclusive lower-bound ISO
 * timestamp for `orderRepository.list({ dateFrom })`. `null` for "all". */
const dateFilterToIso = (filter: 'all' | 'today' | 'week' | 'month'): string | undefined => {
  if (filter === 'all') return undefined;
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (filter === 'week') start.setDate(start.getDate() - 6);
  if (filter === 'month') start.setDate(start.getDate() - 29);
  return start.toISOString();
};

const formatDate = (iso: string): string => {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

type LoadStatus = 'loading' | 'success' | 'error';

const formatCurrency = (amount: number): string => {
  return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

interface SummaryCounts {
  total: number;
  pending: number;
  cleared: number;
  uncleared: number;
  delivered: number;
  totalToPay: number;
  totalReceived: number;
  totalOutstanding: number;
  todayCollection: number;
}

interface GRCardItem extends LocalGRListItem {
  toPay: number;
  totalPaid: number;
  outstanding: number;
  paymentCount: number;
  paymentStatus: string;
}

/**
 * Mobile equivalent of the web Admin "GR / Shipments" page.
 * Adds summary overview, financial info on cards, and a filter bottom sheet.
 */
export const AdminGRShipmentsScreen = ({ route }: any) => {
  const { colors, spacing, radii, fonts, shadows } = useAppTheme();
  const { t } = useTranslation();
  const { navigate, navigation } = useAppNav();

  // When opened as a shop's detail page (All Shops → <shop name>), the area
  // is fixed by the route param instead of user-selectable — reuses this
  // same screen/list instead of a separate "Shop Detail" implementation.
  const fixedArea = (route?.params as { fixedArea?: string } | undefined)?.fixedArea ?? null;
  // Status Overview cards on the Admin Dashboard (Pending/Cleared/Uncleared/
  // Delivered) deep-link here with a `status` param so the list opens
  // pre-filtered to exactly that status instead of showing everything.
  const routeStatus = (route?.params as { status?: string } | undefined)?.status ?? null;

  const handleBack = useCallback(() => {
    navigate(fixedArea ? 'AllShops' : 'AdminDashboard');
  }, [navigate, fixedArea]);

  // Registered/torn down via useFocusEffect (not a plain useEffect) so this
  // listener is only live while THIS screen is the focused one. Native-stack
  // keeps prior screens mounted when pushing a new one, so a plain useEffect
  // here would never clean up and would keep intercepting Android back for
  // every screen pushed on top (GR Details, Edit GR, ...), hijacking it to
  // jump straight to the dashboard instead of popping one screen.
  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        handleBack();
        return true;
      });
      return () => subscription.remove();
    }, [handleBack])
  );

  const styles = createStyles({ colors, spacing, radii, fonts, shadows });

  const [items, setItems] = useState<GRCardItem[]>([]);
  const [summary, setSummary] = useState<SummaryCounts>({ total: 0, pending: 0, cleared: 0, uncleared: 0, delivered: 0, totalToPay: 0, totalReceived: 0, totalOutstanding: 0, todayCollection: 0 });
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [search, setSearch] = useState('');
  const [statusTab, setStatusTab] = useState(
    routeStatus && STATUS_FILTERS.includes(routeStatus) ? routeStatus : 'All'
  );
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');
  const [consignorFilter, setConsignorFilter] = useState<string | null>(null);
  const [consignorOptions, setConsignorOptions] = useState<string[]>([]);
  const [consignorSheetOpen, setConsignorSheetOpen] = useState(false);
  const [areaFilter, setAreaFilter] = useState<string | null>(fixedArea);
  const [areaSheetOpen, setAreaSheetOpen] = useState(false);

  const role = useUserStore((state) => state.user?.role);
  const userArea = useUserStore((state) => state.user?.area ?? null);
  const canDeleteGR = roleCanDeleteGR(role);
  const canImportExcel = roleCanImportExcel(role);

  // Admin/Owner/SuperAdmin can choose any area; staff is locked to their area
  const isAdmin = role === 'admin' || role === 'business_owner' || role === 'super_admin';
  const effectiveArea = fixedArea ?? (isAdmin ? areaFilter : userArea);

  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [menuTarget, setMenuTarget] = useState<GRCardItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<GRCardItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  // Checkbox multi-select for bulk delete (Admin-tier only — same gate as the
  // single/all delete). Holds the REAL database GR ids; independent of the
  // current page/filter so a selection survives search/status/shop/location
  // changes (a hidden-but-selected GR still deletes). `canDeleteGR` from
  // `constants/roles` — Staff never sees the checkboxes or the action bar,
  // and the backend `POST /bulk-delete` enforces the same admin-only rule.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  // "Delete All GRs" — Admin-only, gated by the same role check as the
  // per-card delete action. A second explicit step (typing DELETE) is
  // required before the destructive request fires, since this removes
  // every GR in scope rather than one.
  const [deleteAllOpen, setDeleteAllOpen] = useState(false);
  const [deleteAllConfirmText, setDeleteAllConfirmText] = useState('');
  const [deletingAll, setDeletingAll] = useState(false);
  // Admin-only header entry point (⋮) — separate from the "+" add menu so
  // Delete All is directly visible/reachable from this page's header
  // instead of buried inside Create-GR/Import-Excel options.
  const [adminMenuOpen, setAdminMenuOpen] = useState(false);
  // The TRUE unfiltered GR total in scope — independent of whatever
  // search/status/shop-owner/location filter is currently applied on this
  // screen, since Delete All always deletes every authorized GR regardless
  // of what's on screen. `null` while it's being fetched.
  const [deleteAllTotalCount, setDeleteAllTotalCount] = useState<number | null>(null);

  useEffect(() => {
    if (!actionMessage) return;
    const timer = setTimeout(() => setActionMessage(null), 4000);
    return () => clearTimeout(timer);
  }, [actionMessage]);

  const confirmDeleteGR = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      await orderRepository.delete(deleteTarget.id);
      setItems((prev) => prev.filter((gr) => gr.id !== deleteTarget.id));
      // Keep the summary cards (counts + financial totals) in sync with the
      // delete instead of only updating the list — otherwise they stay
      // stale (showing the deleted GR's numbers) until the next full
      // refetch (e.g. navigating away and back).
      setSummary((prev) => ({
        ...prev,
        total: Math.max(0, prev.total - 1),
        pending: deleteTarget.status === 'pending' ? Math.max(0, prev.pending - 1) : prev.pending,
        cleared: deleteTarget.status === 'cleared' ? Math.max(0, prev.cleared - 1) : prev.cleared,
        uncleared: deleteTarget.status === 'uncleared' ? Math.max(0, prev.uncleared - 1) : prev.uncleared,
        delivered: deleteTarget.status === 'delivered' ? Math.max(0, prev.delivered - 1) : prev.delivered,
        totalToPay: Math.max(0, prev.totalToPay - deleteTarget.toPay),
        totalReceived: Math.max(0, prev.totalReceived - deleteTarget.totalPaid),
        totalOutstanding: Math.max(0, prev.totalOutstanding - deleteTarget.outstanding),
      }));
      setActionMessage({ kind: 'success', text: t('gr.deletedSuccess') });
      setDeleteTarget(null);
    } catch {
      setActionMessage({ kind: 'error', text: t('gr.unableToDelete') });
    } finally {
      setDeleting(false);
    }
  };

  const inFlightRef = useRef(false);
  // Monotonic id of the most recent list fetch — a response whose id no
  // longer matches is stale (a newer filter/search fetch superseded it).
  const reqIdRef = useRef(0);

  const fetchGRs = useCallback(
    async (pageNum: number, mode: 'initial' | 'refresh' | 'more' | 'reload' = 'initial') => {
      // Stale-response guard: a filter/search change fires a fresh fetch; if
      // the older (slower) one lands after it, its results must be discarded,
      // not painted over the newer ones. `mode === 'more'` keeps its own lane.
      const reqId = ++reqIdRef.current;
      const isStale = () => mode !== 'more' && reqId !== reqIdRef.current;

      if (inFlightRef.current && mode === 'more') return;
      inFlightRef.current = true;
      if (mode === 'initial') setStatus('loading');
      if (mode === 'refresh') setRefreshing(true);
      if (mode === 'more') setLoadingMore(true);
      try {
        const dateFrom = dateFilterToIso(dateFilter);
        // Fire the list AND the summary aggregates together (they are
        // independent) so the ~2s list request overlaps the counts request
        // instead of running after it. The list is awaited first and rendered
        // immediately; the counts settle a moment later without blocking it.
        const listPromise = orderRepository.list({
          page: pageNum,
          pageSize: PAGE_SIZE,
          status: FILTER_TO_STATUS[statusTab],
          search: search || undefined,
          area: effectiveArea || undefined,
          consignor: consignorFilter || undefined,
          dateFrom,
        });
        const summaryPromise =
          mode === 'more'
            ? null
            : Promise.all([
                orderRepository.getStatusCounts({
                  search: search || undefined,
                  area: effectiveArea || undefined,
                  consignor: consignorFilter || undefined,
                  dateFrom,
                }),
                orderRepository.getTodayCollection(),
              ]);

        const result = await listPromise;
        if (isStale()) return;
        const rawItems: LocalGRListItem[] = result.items;

        // `GET /admin/orders` already returns `toPay` + `totalPaid` per row
        // (one grouped payment query server-side — see `list_grs`), so the
        // card's money blocks need NO per-GR request. This map is pure and
        // synchronous: it was the ~1-request-per-card N+1 that made the page
        // fire hundreds of XHRs. `paymentCount` / `paymentStatus` aren't shown
        // on the list card (the GR detail screen fetches its own).
        const enrichedItems: GRCardItem[] = rawItems.map((item) => ({
          ...item,
          toPay: item.toPay ?? 0,
          totalPaid: item.totalPaid ?? 0,
          outstanding: (item.toPay ?? 0) - (item.totalPaid ?? 0),
          paymentCount: 0,
          paymentStatus: 'unpaid',
        }));

        setItems((prev) => (mode === 'more' ? [...prev, ...enrichedItems] : enrichedItems));
        setHasMore(enrichedItems.length === PAGE_SIZE);
        setPage(pageNum);
        setError(null);
        setStatus('success');

        // Summary counts + money totals — ONE server-side aggregate over the
        // full filtered dataset. Already in flight (see `summaryPromise`); a
        // failure here must NOT wipe the list that just rendered.
        if (summaryPromise) {
          try {
            const [sc, todayCollection] = await summaryPromise;
            if (isStale()) return;
            setSummary({
              total: sc.total,
              pending: sc.pending,
              cleared: sc.cleared,
              uncleared: sc.uncleared,
              delivered: sc.delivered,
              totalToPay: sc.totalToPay,
              totalReceived: sc.totalReceived,
              totalOutstanding: sc.totalOutstanding,
              todayCollection,
            });
          } catch {
            /* leave the previous counts in place */
          }
        }
    } catch {
        if (!isStale()) {
          setError(t('gr.couldNotLoadEntries'));
          setStatus('error');
        }
      } finally {
        if (!isStale()) {
          inFlightRef.current = false;
          setRefreshing(false);
          setLoadingMore(false);
        }
      }
    },
    [search, statusTab, consignorFilter, effectiveArea, dateFilter]
  );

  const didMount = useRef(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchGRs(1, 'initial');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      if (!didMount.current) {
        didMount.current = true;
        return;
      }
      // A status card on the Dashboard can re-navigate here with a new
      // `status` param while this screen is already mounted in the
      // Shipments tab stack (native-stack keeps it alive rather than
      // remounting) — pick up the new filter on focus instead of leaving
      // the tab showing whatever status was selected last time.
      const paramStatus = (route?.params as { status?: string } | undefined)?.status ?? null;
      if (paramStatus && STATUS_FILTERS.includes(paramStatus) && paramStatus !== statusTab) {
        setStatusTab(paramStatus);
        return;
      }
      fetchGRs(1, 'refresh');
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation, route?.params, statusTab]);

  // Text search is debounced (typing fires this on every keystroke — without
  // a delay that's a query per character). Status tab / shop-owner / area /
  // date-range are discrete taps, not typing: a tab visually highlights the
  // instant it's tapped (synchronous state), so debouncing the list refetch
  // behind it made the list look stale/unreliable for 400ms after every tap
  // — the exact "Pending doesn't immediately show Pending GRs" symptom.
  // Split so only `search` waits; every other filter refetches immediately.
  const didMountSearch = useRef(false);
  useEffect(() => {
    if (!didMountSearch.current) {
      didMountSearch.current = true;
      return;
    }
    const timer = setTimeout(() => {
      fetchGRs(1, 'reload');
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const didMountFilters = useRef(false);
  useEffect(() => {
    if (!didMountFilters.current) {
      didMountFilters.current = true;
      return;
    }
    fetchGRs(1, 'reload');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusTab, consignorFilter, effectiveArea, dateFilter]);

  // ── Live GR updates ──────────────────────────────────────────────────────
  // One shared WebSocket (see `services/grRealtime`). When staff/another
  // admin changes a GR's status (or deletes one), we (a) patch the affected
  // card + the five counters IMMEDIATELY from the event so the badge flips
  // and "Pending -1 / Delivered +1" happen with no round trip, then (b)
  // schedule ONE debounced refetch so the list + counters land on the
  // authoritative server numbers and any filter add/remove is handled. Never
  // reloads the app, never loops (the refetch is coalesced).
  const rtReloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleRtReload = useCallback(() => {
    if (rtReloadTimer.current) return;
    rtReloadTimer.current = setTimeout(() => {
      rtReloadTimer.current = null;
      fetchGRs(1, 'reload');
    }, 350);
  }, [fetchGRs]);

  useEffect(() => {
    // Mirror of backend `gr_status_service.classify` — a delivered GR with
    // nothing left to pay is `cleared` (incl. toPay <= 0: nothing owed).
    const reportBucket = (rawStatus: string, toPay: number, totalPaid: number): string => {
      const EPS = 0.005;
      if (rawStatus === 'pending') return 'pending';
      if (toPay > 0) {
        if (totalPaid >= toPay - EPS) return 'cleared';
        if (totalPaid > 0) return 'uncleared';
        return 'delivered';
      }
      return 'cleared';
    };

    const onEvent = (evt: GrEvent) => {
      if (evt.type === 'resync') {
        scheduleRtReload();
        return;
      }
      if (evt.type === 'gr.deleted') {
        const ids = new Set(evt.ids ?? (evt.id ? [evt.id] : []));
        setItems((prev) => {
          const removed = prev.filter((g) => ids.has(g.id));
          if (removed.length === 0) return prev;
          setSummary((s) => {
            const next = { ...s, total: Math.max(0, s.total - removed.length) };
            removed.forEach((g) => {
              const b = g.status as 'pending' | 'cleared' | 'uncleared' | 'delivered';
              if (b in next) (next as any)[b] = Math.max(0, (next as any)[b] - 1);
            });
            return next;
          });
          return prev.filter((g) => !ids.has(g.id));
        });
        setSelectedIds((prev) => {
          if (![...ids].some((i) => prev.has(i))) return prev;
          const n = new Set(prev);
          ids.forEach((i) => n.delete(i));
          return n;
        });
        scheduleRtReload();
        return;
      }
      if (evt.type === 'gr.status' && evt.id && evt.status) {
        setItems((prev) => {
          const idx = prev.findIndex((g) => g.id === evt.id);
          if (idx < 0) return prev; // card not on screen — the refetch handles it
          const card = prev[idx];
          const newBucket = reportBucket(
            evt.status!,
            evt.toPay ?? card.toPay,
            // payment events carry the fresh ledger total; status events don't
            // (the card's cached value is still current for those).
            evt.totalPaid ?? card.totalPaid,
          );
          if (newBucket === card.status) return prev;
          const oldBucket = card.status;
          setSummary((s) => {
            const next = { ...s } as any;
            if (oldBucket in next) next[oldBucket] = Math.max(0, next[oldBucket] - 1);
            if (newBucket in next) next[newBucket] = next[newBucket] + 1;
            return next;
          });
          const activeFilter = FILTER_TO_STATUS[statusTab];
          const copy = prev.slice();
          if (activeFilter && activeFilter !== newBucket) {
            copy.splice(idx, 1); // no longer matches the active tab — drop it
          } else {
            copy[idx] = { ...card, status: newBucket };
          }
          return copy;
        });
        scheduleRtReload();
        return;
      }
      // gr.created
      scheduleRtReload();
    };

    const unsub = grRealtime.subscribe(onEvent);
    return () => {
      unsub();
      if (rtReloadTimer.current) clearTimeout(rtReloadTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusTab, scheduleRtReload]);

  // Shop-owner (consignee) dropdown options — LAZY: this list is only needed
  // when the user actually opens the "Shop Owner" filter sheet, so it no
  // longer costs a request on every initial page load. Re-fetched when the
  // sheet is (re)opened for a different area; cached otherwise.
  const consignorOptsAreaRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!consignorSheetOpen) return;
    if (consignorOptsAreaRef.current === (effectiveArea || null) && consignorOptions.length > 0) return;
    let cancelled = false;
    orderRepository.getDistinctConsignors(effectiveArea || undefined).then((names) => {
      if (!cancelled) {
        setConsignorOptions(names);
        consignorOptsAreaRef.current = effectiveArea || null;
      }
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consignorSheetOpen, effectiveArea]);

  const onRefresh = () => fetchGRs(1, 'refresh');

  const confirmDeleteAllGRs = async () => {
    if (deletingAll || deleteAllConfirmText.trim().toUpperCase() !== 'DELETE') return;
    setDeletingAll(true);
    try {
      const deletedCount = await orderRepository.deleteAll();
      setDeleteAllOpen(false);
      setDeleteAllConfirmText('');
      setActionMessage({ kind: 'success', text: t('gr.deleteAllSuccess', { count: deletedCount }) });
      // Re-fetch from the server rather than zeroing state locally — this
      // is the same authoritative aggregate query the initial load uses, so
      // every card (counts, financial totals, today's collection) and the
      // list itself land on the real post-delete numbers in one shot.
      await fetchGRs(1, 'initial');
    } catch {
      setActionMessage({ kind: 'error', text: t('gr.deleteAllError') });
    } finally {
      setDeletingAll(false);
    }
  };

  const confirmBulkDelete = async () => {
    if (bulkDeleting || selectedIds.size === 0) return;
    setBulkDeleting(true);
    const ids = [...selectedIds];
    try {
      const res = await orderRepository.bulkDelete(ids);
      setBulkConfirmOpen(false);
      setSelectedIds(new Set());
      if (res.skipped.length > 0) {
        setActionMessage({
          kind: 'error',
          text: `${res.deletedCount} GR${res.deletedCount === 1 ? '' : 's'} deleted, ${res.skipped.length} could not be deleted.`,
        });
      } else {
        setActionMessage({
          kind: 'success',
          text: `${res.deletedCount} GR${res.deletedCount === 1 ? '' : 's'} deleted.`,
        });
      }
      // Refetch from the authoritative aggregate so the list, all five status
      // counts and the money totals land on the real post-delete numbers.
      await fetchGRs(1, 'reload');
    } catch {
      setActionMessage({ kind: 'error', text: t('gr.unableToDelete') });
    } finally {
      setBulkDeleting(false);
    }
  };

  const onAddPress = () => {
    if (canImportExcel) setAddMenuOpen(true);
    else navigate('CreateGR');
  };

  const onAdminMenuPress = () => setAdminMenuOpen(true);

  const loadMore = () => {
    if (!inFlightRef.current && !loadingMore && hasMore) fetchGRs(page + 1, 'more');
  };

  const showSkeleton = status === 'loading' && items.length === 0;

  if (showSkeleton) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <Header
          title={fixedArea ?? t('gr.grShipments')}
          leftAction={{ icon: 'chevron-back', onPress: handleBack }}
          rightAction={{ icon: 'add', onPress: onAddPress, accessibilityLabel: 'Create GR' }}
        />
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <ShimmerCard style={styles.shimmerBlock} height={100} />
          <ShimmerCard style={styles.shimmerBlock} height={44} />
          <ShimmerCard style={styles.shimmerBlock} height={36} />
          {[1, 2, 3, 4, 5].map((i) => (
            <ShimmerCard key={i} style={styles.shimmerBlock} height={130} />
          ))}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <Header
        title={fixedArea ?? t('gr.grShipments')}
        leftAction={{ icon: 'chevron-back', onPress: handleBack }}
        rightAction={{ icon: 'add', onPress: onAddPress, accessibilityLabel: 'Create GR' }}
        secondaryRightAction={
          canDeleteGR
            ? { icon: 'ellipsis-vertical', onPress: onAdminMenuPress, accessibilityLabel: t('gr.deleteAllGRs') }
            : undefined
        }
      />

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#635BFF']} progressBackgroundColor={colors.surface} />}
        contentContainerStyle={[styles.scrollContent, canDeleteGR && selectedIds.size > 0 && { paddingBottom: 110 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onScroll={({ nativeEvent }) => {
          const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
          if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 200) loadMore();
        }}
        scrollEventThrottle={200}
      >
        {actionMessage && (
          <View style={[styles.actionBanner, { backgroundColor: actionMessage.kind === 'success' ? colors.successSoft : colors.errorSoft, borderRadius: radii.lg }]}>
            <Ionicons name={actionMessage.kind === 'success' ? 'checkmark-circle-outline' : 'alert-circle-outline'} size={18} color={actionMessage.kind === 'success' ? colors.success : colors.error} />
            <Text style={[styles.actionBannerText, { color: actionMessage.kind === 'success' ? colors.success : colors.error }]}>{actionMessage.text}</Text>
          </View>
        )}

        {/* Summary Cards — canonical reporting buckets (server-classified).
            Split across two rows so all five counts stay legible on a phone. */}
        <View style={styles.summaryRow}>
          <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}>
            <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>{summary.total}</Text>
            <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>{t('summary.totalGRs')}</Text>
          </View>
          <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}>
            <Text style={[styles.summaryValue, { color: '#6B7280' }]}>{summary.pending}</Text>
            <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>{t('summary.pending')}</Text>
          </View>
        </View>
        <View style={styles.summaryRow}>
          <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}>
            <Text style={[styles.summaryValue, { color: '#10B981' }]}>{summary.cleared}</Text>
            <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>{t('summary.cleared')}</Text>
          </View>
          <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}>
            <Text style={[styles.summaryValue, { color: '#F97316' }]}>{summary.uncleared}</Text>
            <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>{t('summary.uncleared')}</Text>
          </View>
          <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}>
            <Text style={[styles.summaryValue, { color: '#10B981' }]}>{summary.delivered}</Text>
            <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>{t('summary.delivered')}</Text>
          </View>
        </View>

        {/* Financial Summary */}
        <View style={styles.summaryRow}>
          <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}>
            <Text style={[styles.summaryValue, { color: '#10B981' }]}>{formatCurrency(summary.todayCollection)}</Text>
            <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>{t('adminGRShipments.todayCollection')}</Text>
          </View>
          {fixedArea && (
            <>
              <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}>
                <Text style={[styles.summaryValue, { color: '#10B981' }]}>{formatCurrency(summary.totalReceived)}</Text>
                <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>{t('summary.totalCollected', 'Total Collected')}</Text>
              </View>
              <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}>
                <Text style={[styles.summaryValue, { color: summary.totalOutstanding > 0 ? '#F97316' : '#10B981' }]}>{formatCurrency(summary.totalOutstanding)}</Text>
                <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>{t('summary.outstanding', 'Outstanding')}</Text>
              </View>
            </>
          )}
        </View>

        {/* Location Filter — hidden on a fixed-shop detail page, where the
            area is already pinned by the route param. */}
        {!fixedArea && (
          <TouchableOpacity
            style={[styles.consignorFilterBtn, { backgroundColor: colors.surface, borderRadius: radii.md, borderColor: effectiveArea ? colors.primary : colors.border }]}
            onPress={() => isAdmin ? setAreaSheetOpen(true) : undefined}
            activeOpacity={isAdmin ? 0.7 : 1}
            disabled={!isAdmin}
          >
            <Ionicons name="location-outline" size={16} color={effectiveArea ? colors.primary : colors.textMuted} />
            <Text
              style={[styles.consignorFilterText, { color: effectiveArea ? colors.primary : colors.textMuted }]}
              numberOfLines={1}
            >
              {effectiveArea || t('gr.allLocations')}
            </Text>
            {effectiveArea && isAdmin ? (
              <TouchableOpacity onPress={() => setAreaFilter(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close-circle" size={16} color={colors.primary} />
              </TouchableOpacity>
            ) : isAdmin ? (
              <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
            ) : null}
          </TouchableOpacity>
        )}

        {/* Search + Filter */}
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={colors.textMuted} style={styles.searchIcon} />
          <TextInput
            placeholder={t('gr.searchPlaceholder')}
            value={search}
            onChangeText={setSearch}
            style={[styles.searchInput, { color: colors.textPrimary, backgroundColor: colors.surface }]}
            placeholderTextColor={colors.textMuted}
            returnKeyType="search"
          />
          <TouchableOpacity onPress={() => setFilterSheetOpen(true)} style={[styles.filterBtn, { backgroundColor: colors.surface, borderRadius: radii.md }]}>
            <Ionicons name="options-outline" size={18} color={colors.primary} />
          </TouchableOpacity>
        </View>

        {/* Shop Owner Filter */}
        <TouchableOpacity
          style={[styles.consignorFilterBtn, { backgroundColor: colors.surface, borderRadius: radii.md, borderColor: consignorFilter ? colors.primary : colors.border }]}
          onPress={() => setConsignorSheetOpen(true)}
          activeOpacity={0.7}
        >
          <Ionicons name="person-outline" size={16} color={consignorFilter ? colors.primary : colors.textMuted} />
          <Text
            style={[styles.consignorFilterText, { color: consignorFilter ? colors.primary : colors.textMuted }]}
            numberOfLines={1}
          >
            {consignorFilter || t('gr.allShopOwners')}
          </Text>
          {consignorFilter ? (
            <TouchableOpacity onPress={() => setConsignorFilter(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={16} color={colors.primary} />
            </TouchableOpacity>
          ) : (
            <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
          )}
        </TouchableOpacity>

        {/* Result count */}
        <View style={styles.resultCountRow}>
          <Text style={[styles.resultCountText, { color: colors.textMuted }]}>
            {summary.total} {summary.total === 1 ? t('gr.grShipmentsSingular') : t('gr.grShipmentsPlural')}
          </Text>
        </View>

        <View style={styles.filters}>
          <FilterChips filters={STATUS_FILTERS} activeFilter={statusTab} onFilterChange={setStatusTab} />
        </View>

        {status === 'error' && items.length === 0 && (
          <EmptyState
            icon="cloud-offline-outline"
            title={t('gr.couldNotLoad')}
            subtitle={error ?? t('gr.somethingWrong')}
            actionLabel={t('common.retry')}
            onActionPress={() => fetchGRs(1, 'initial')}
            iconColor={colors.error}
          />
        )}

        {status === 'success' && items.length === 0 && (
          <EmptyState
            icon="reader-outline"
            title={t('gr.noEntries')}
            subtitle={search || statusTab !== 'All' || consignorFilter || (!fixedArea && effectiveArea) ? t('gr.searchResultsEmpty') : t('gr.shipmentsWillAppear')}
            actionLabel={consignorFilter || (!fixedArea && effectiveArea) ? t('gr.clearFilter') : t('gr.createGR')}
            onActionPress={consignorFilter || (!fixedArea && effectiveArea) ? () => { setConsignorFilter(null); setAreaFilter(null); } : () => navigate('CreateGR')}
          />
        )}

        {items.length > 0 && (
          <View style={styles.list}>
            {items.map((gr) => (
              <TouchableOpacity
                key={gr.id}
                style={[styles.card, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}
                onPress={() => navigate('GRDetails', { orderId: gr.id })}
                activeOpacity={0.85}
              >
                <View style={styles.cardHeader}>
                  <View style={styles.cardHeaderLeft}>
                    {canDeleteGR && (
                      <TouchableOpacity
                        onPress={() => toggleSelect(gr.id)}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        style={styles.checkbox}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: selectedIds.has(gr.id) }}
                        accessibilityLabel={`Select GR ${gr.orderNumber}`}
                      >
                        <Ionicons
                          name={selectedIds.has(gr.id) ? 'checkbox' : 'square-outline'}
                          size={20}
                          color={selectedIds.has(gr.id) ? colors.primary : colors.textMuted}
                        />
                      </TouchableOpacity>
                    )}
                    <Text style={[styles.grNo, { color: colors.textPrimary }]}>{gr.orderNumber}</Text>
                  </View>
                  <View style={styles.cardHeaderRight}>
                    <StatusBadge status={gr.status} size="sm" />
                    {canDeleteGR && (
                      <TouchableOpacity onPress={() => setMenuTarget(gr)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={styles.menuButton}>
                        <Ionicons name="ellipsis-vertical" size={16} color={colors.textMuted} />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
                <Text style={[styles.consignorLine, { color: colors.textSecondary }]}>
                  {gr.consignorName || '—'} <Text style={{ color: colors.textMuted }}>→</Text> {gr.consigneeName || '—'}
                </Text>
                <View style={styles.routeRow}>
                  <Ionicons name="location-outline" size={13} color={colors.textMuted} />
                  <Text style={[styles.routeLine, { color: colors.textMuted }]} numberOfLines={1}>
                    {gr.pickupAddress} → {gr.deliveryAddress}
                  </Text>
                </View>

                {gr.toPay > 0 && (
                  <View style={styles.financialRow}>
                    <View style={styles.financialBlock}>
                      <Text style={[styles.financialLabel, { color: colors.textMuted }]}>{t('receiving.toPay')}</Text>
                      <Text style={[styles.financialValue, { color: colors.textPrimary }]}>{formatCurrency(gr.toPay)}</Text>
                    </View>
                    <View style={styles.financialBlock}>
                      <Text style={[styles.financialLabel, { color: colors.textMuted }]}>{t('receiving.paid')}</Text>
                      <Text style={[styles.financialValue, { color: '#10B981' }]}>{formatCurrency(gr.totalPaid)}</Text>
                    </View>
                    <View style={styles.financialBlock}>
                      <Text style={[styles.financialLabel, { color: colors.textMuted }]}>{t('receiving.balance')}</Text>
                      <Text style={[styles.financialValue, { color: gr.outstanding > 0 ? '#F97316' : '#10B981' }]}>
                        {formatCurrency(gr.outstanding)}
                      </Text>
                    </View>
                  </View>
                )}
                <View style={styles.cardFooter}>
                  <View style={styles.slipInfo}>
                    <Ionicons
                      name={gr.source === 'excel' ? 'grid-outline' : gr.hasSlip ? 'document-attach' : 'document-outline'}
                      size={14}
                      color={gr.source === 'excel' ? '#635BFF' : gr.hasSlip ? '#10B981' : colors.textMuted}
                    />
                    <Text style={[styles.slipText, { color: gr.source === 'excel' ? '#635BFF' : gr.hasSlip ? '#10B981' : colors.textMuted }]}>
                      {gr.source === 'excel' ? t('gr.excelImported') : gr.hasSlip ? t('gr.slipUploaded') : t('gr.noSlip')}
                    </Text>
                  </View>
                  <Text style={[styles.dateText, { color: colors.textMuted }]}>{formatDate(gr.createdAt)}</Text>
                </View>
              </TouchableOpacity>
            ))}
            {loadingMore && <ShimmerCard style={styles.shimmerBlock} height={130} />}
          </View>
        )}
      </ScrollView>

      {/* Filter Bottom Sheet */}
      <Modal visible={filterSheetOpen} transparent animationType="slide" onRequestClose={() => setFilterSheetOpen(false)}>
        <Pressable style={[styles.menuBackdrop, { backgroundColor: colors.overlay }]} onPress={() => setFilterSheetOpen(false)}>
          <View style={[styles.bottomSheet, { backgroundColor: colors.surface, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl }]}>
            <View style={styles.sheetHandle} />
            <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>{t('common.filter')}</Text>

            <Text style={[styles.sheetLabel, { color: colors.textMuted }]}>{t('filters.dateRange')}</Text>
            <View style={styles.sheetChipRow}>
              {(['all', 'today', 'week', 'month'] as const).map((opt) => (
                <TouchableOpacity
                  key={opt}
                  style={[styles.sheetChip, { borderRadius: radii.pill }, dateFilter === opt ? styles.sheetChipActive : { borderColor: colors.border }]}
                  onPress={() => setDateFilter(opt)}
                >
                  <Text style={[styles.sheetChipText, { fontSize: fonts.size.sm }, dateFilter === opt ? styles.sheetChipTextActive : { color: colors.textMuted }]}>
                    {opt === 'all' ? t('filters.all') : opt === 'today' ? t('filters.today') : opt === 'week' ? t('filters.thisWeek') : t('filters.thisMonth')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={[styles.sheetApplyBtn, { backgroundColor: colors.primary, borderRadius: radii.lg }]}
              onPress={() => setFilterSheetOpen(false)}
            >
              <Text style={[styles.sheetApplyText, { color: '#fff' }]}>{t('filters.applyFilters')}</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* Shop Owner Filter Bottom Sheet */}
      <Modal visible={consignorSheetOpen} transparent animationType="slide" onRequestClose={() => setConsignorSheetOpen(false)}>
        <Pressable style={[styles.menuBackdrop, { backgroundColor: colors.overlay }]} onPress={() => setConsignorSheetOpen(false)}>
          <View style={[styles.bottomSheet, { backgroundColor: colors.surface, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl }]}>
            <View style={styles.sheetHandle} />
            <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>{t('gr.filterByShopOwner')}</Text>

            <ScrollView style={styles.consignorList} showsVerticalScrollIndicator={false}>
              {/* All Shop Owners option */}
              <TouchableOpacity
                style={[styles.consignorOption, { borderColor: !consignorFilter ? colors.primary : colors.border, backgroundColor: !consignorFilter ? `${colors.primary}10` : 'transparent' }]}
                onPress={() => { setConsignorFilter(null); setConsignorSheetOpen(false); }}
              >
                <View style={[styles.consignorRadio, { borderColor: !consignorFilter ? colors.primary : colors.border }]}>
                  {!consignorFilter && <View style={[styles.consignorRadioInner, { backgroundColor: colors.primary }]} />}
                </View>
                <Text style={[styles.consignorOptionText, { color: !consignorFilter ? colors.primary : colors.textPrimary }]}>
                  {t('gr.allShopOwners')}
                </Text>
              </TouchableOpacity>

              {/* Individual consignor options */}
              {consignorOptions.map((name) => (
                <TouchableOpacity
                  key={name}
                  style={[styles.consignorOption, { borderColor: consignorFilter === name ? colors.primary : colors.border, backgroundColor: consignorFilter === name ? `${colors.primary}10` : 'transparent' }]}
                  onPress={() => { setConsignorFilter(name); setConsignorSheetOpen(false); }}
                >
                  <View style={[styles.consignorRadio, { borderColor: consignorFilter === name ? colors.primary : colors.border }]}>
                    {consignorFilter === name && <View style={[styles.consignorRadioInner, { backgroundColor: colors.primary }]} />}
                  </View>
                  <Text style={[styles.consignorOptionText, { color: consignorFilter === name ? colors.primary : colors.textPrimary }]}>
                    {name}
                  </Text>
                </TouchableOpacity>
              ))}

              {consignorOptions.length === 0 && (
                <Text style={[styles.consignorEmpty, { color: colors.textMuted }]}>{t('gr.noShopOwners')}</Text>
              )}
            </ScrollView>

            <TouchableOpacity
              style={[styles.sheetApplyBtn, { backgroundColor: colors.primary, borderRadius: radii.lg }]}
              onPress={() => setConsignorSheetOpen(false)}
            >
              <Text style={[styles.sheetApplyText, { color: '#fff' }]}>{t('filters.applyFilters')}</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* Location Filter Bottom Sheet */}
      <Modal visible={areaSheetOpen} transparent animationType="slide" onRequestClose={() => setAreaSheetOpen(false)}>
        <Pressable style={[styles.menuBackdrop, { backgroundColor: colors.overlay }]} onPress={() => setAreaSheetOpen(false)}>
          <View style={[styles.bottomSheet, { backgroundColor: colors.surface, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl }]}>
            <View style={styles.sheetHandle} />
            <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>{t('gr.filterByLocation')}</Text>

            <ScrollView style={styles.consignorList} showsVerticalScrollIndicator={false}>
              {/* All Locations option */}
              <TouchableOpacity
                style={[styles.consignorOption, { borderColor: !areaFilter ? colors.primary : colors.border, backgroundColor: !areaFilter ? `${colors.primary}10` : 'transparent' }]}
                onPress={() => { setAreaFilter(null); setAreaSheetOpen(false); }}
              >
                <View style={[styles.consignorRadio, { borderColor: !areaFilter ? colors.primary : colors.border }]}>
                  {!areaFilter && <View style={[styles.consignorRadioInner, { backgroundColor: colors.primary }]} />}
                </View>
                <Text style={[styles.consignorOptionText, { color: !areaFilter ? colors.primary : colors.textPrimary }]}>
                  {t('gr.allLocations')}
                </Text>
              </TouchableOpacity>

              {/* Individual area options */}
              {AREAS.map((area) => (
                <TouchableOpacity
                  key={area}
                  style={[styles.consignorOption, { borderColor: areaFilter === area ? colors.primary : colors.border, backgroundColor: areaFilter === area ? `${colors.primary}10` : 'transparent' }]}
                  onPress={() => { setAreaFilter(area); setAreaSheetOpen(false); }}
                >
                  <View style={[styles.consignorRadio, { borderColor: areaFilter === area ? colors.primary : colors.border }]}>
                    {areaFilter === area && <View style={[styles.consignorRadioInner, { backgroundColor: colors.primary }]} />}
                  </View>
                  <Text style={[styles.consignorOptionText, { color: areaFilter === area ? colors.primary : colors.textPrimary }]}>
                    {area}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <TouchableOpacity
              style={[styles.sheetApplyBtn, { backgroundColor: colors.primary, borderRadius: radii.lg }]}
              onPress={() => setAreaSheetOpen(false)}
            >
              <Text style={[styles.sheetApplyText, { color: '#fff' }]}>{t('filters.applyFilters')}</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* Per-card menu */}
      <Modal visible={!!menuTarget} transparent animationType="fade" onRequestClose={() => setMenuTarget(null)}>
        <Pressable style={[styles.menuBackdrop, { backgroundColor: colors.overlay }]} onPress={() => setMenuTarget(null)}>
          <View style={[styles.menuCard, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.lg }]}>
            <Text style={[styles.menuTitle, { color: colors.textMuted }]}>GR {menuTarget?.orderNumber}</Text>
            <TouchableOpacity style={styles.menuRow} onPress={() => { if (menuTarget) navigate('GRDetails', { orderId: menuTarget.id }); setMenuTarget(null); }}>
              <Ionicons name="eye-outline" size={18} color={colors.textPrimary} />
              <Text style={[styles.menuRowText, { color: colors.textPrimary }]}>{t('gr.viewGR')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuRow} onPress={() => { setDeleteTarget(menuTarget); setMenuTarget(null); }}>
              <Ionicons name="trash-outline" size={18} color={colors.error} />
              <Text style={[styles.menuRowText, { color: colors.error }]}>{t('gr.deleteGR')}</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* Add menu */}
      <Modal visible={addMenuOpen} transparent animationType="fade" onRequestClose={() => setAddMenuOpen(false)}>
        <Pressable style={[styles.menuBackdrop, { backgroundColor: colors.overlay }]} onPress={() => setAddMenuOpen(false)}>
          <View style={[styles.menuCard, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.lg }]}>
            <Text style={[styles.menuTitle, { color: colors.textMuted }]}>GR / Shipments</Text>
            <TouchableOpacity style={styles.menuRow} onPress={() => { setAddMenuOpen(false); navigate('CreateGR'); }}>
              <Ionicons name="add-circle-outline" size={18} color={colors.textPrimary} />
              <Text style={[styles.menuRowText, { color: colors.textPrimary }]}>Create GR</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuRow} onPress={() => { setAddMenuOpen(false); navigate('ExcelImport'); }}>
              <Ionicons name="cloud-upload-outline" size={18} color={colors.textPrimary} />
              <Text style={[styles.menuRowText, { color: colors.textPrimary }]}>Import from Excel</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* Admin actions menu — opened from the header's "⋮" icon (always
          visible on this page for Admin/Super Admin, separate from the "+"
          Create/Import menu above so this destructive action isn't buried
          behind an unrelated affordance). */}
      {canDeleteGR && (
        <Modal visible={adminMenuOpen} transparent animationType="fade" onRequestClose={() => setAdminMenuOpen(false)}>
          <Pressable style={[styles.menuBackdrop, { backgroundColor: colors.overlay }]} onPress={() => setAdminMenuOpen(false)}>
            <View style={[styles.menuCard, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.lg }]}>
              <Text style={[styles.menuTitle, { color: colors.textMuted }]}>{t('gr.adminActions')}</Text>
              <TouchableOpacity
                style={styles.menuRow}
                onPress={() => {
                  setAdminMenuOpen(false);
                  setDeleteAllConfirmText('');
                  setDeleteAllTotalCount(null);
                  setDeleteAllOpen(true);
                  // Always the true, unfiltered total — never the current
                  // search/status/shop-owner/location-filtered `summary.total`.
                  orderRepository.getStatusCounts().then((sc) => setDeleteAllTotalCount(sc.total)).catch(() => setDeleteAllTotalCount(null));
                }}
              >
                <Ionicons name="trash-bin-outline" size={18} color={colors.error} />
                <Text style={[styles.menuRowText, { color: colors.error }]}>{t('gr.deleteAllGRs')}</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Modal>
      )}

      {/* Delete All GRs — Admin-only, requires typing DELETE before the
          confirm button is enabled (extra safeguard on top of the plain
          Cancel/Confirm dialog, since this affects every GR in scope). */}
      <Modal visible={deleteAllOpen} transparent animationType="fade" onRequestClose={() => { if (!deletingAll) { setDeleteAllOpen(false); setDeleteAllConfirmText(''); } }}>
        <Pressable
          style={[styles.menuBackdrop, { backgroundColor: colors.overlay }]}
          onPress={() => { if (!deletingAll) { setDeleteAllOpen(false); setDeleteAllConfirmText(''); } }}
        >
          <Pressable style={[styles.deleteAllCard, { backgroundColor: colors.surface, borderRadius: radii.xl, ...shadows.lg }]} onPress={() => {}}>
            <Text style={[styles.deleteAllTitle, { color: colors.textPrimary, fontFamily: fonts.family }]}>
              {deleteAllTotalCount ? t('gr.deleteAllTitleCount', { count: deleteAllTotalCount }) : t('gr.deleteAllTitle')}
            </Text>
            <Text style={[styles.deleteAllMessage, { color: colors.textSecondary, fontFamily: fonts.family }]}>{t('gr.deleteAllMessage')}</Text>
            <Text style={[styles.deleteAllPrompt, { color: colors.textMuted, fontFamily: fonts.family }]}>{t('gr.deleteAllTypePrompt')}</Text>
            <TextInput
              value={deleteAllConfirmText}
              onChangeText={setDeleteAllConfirmText}
              placeholder={t('gr.deleteAllTypePlaceholder')}
              placeholderTextColor={colors.textMuted}
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!deletingAll}
              style={[styles.deleteAllInput, { color: colors.textPrimary, borderColor: colors.borderStrong, backgroundColor: colors.background }]}
            />
            <View style={styles.deleteAllActions}>
              <TouchableOpacity
                style={[styles.deleteAllBtn, styles.deleteAllCancelBtn, { borderColor: colors.borderStrong }]}
                onPress={() => { if (!deletingAll) { setDeleteAllOpen(false); setDeleteAllConfirmText(''); } }}
                disabled={deletingAll}
              >
                <Text style={[styles.deleteAllBtnText, { color: colors.textPrimary }]}>{t('gr.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.deleteAllBtn,
                  { backgroundColor: colors.error },
                  (deletingAll || deleteAllConfirmText.trim().toUpperCase() !== 'DELETE') && styles.deleteAllBtnDisabled,
                ]}
                onPress={confirmDeleteAllGRs}
                disabled={deletingAll || deleteAllConfirmText.trim().toUpperCase() !== 'DELETE'}
              >
                <Text style={[styles.deleteAllBtnText, { color: '#fff' }]}>
                  {deletingAll ? t('gr.deleteAllDeleting') : t('gr.deleteAllConfirm')}
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <ConfirmDialog
        visible={!!deleteTarget}
        title={t('gr.deleteTitle', { number: deleteTarget?.orderNumber ?? '' })}
        message={t('gr.deleteConfirmMessage')}
        confirmLabel={deleting ? t('gr.deleting') : t('gr.delete')}
        cancelLabel={t('gr.cancel')}
        destructive
        confirmDisabled={deleting}
        onConfirm={confirmDeleteGR}
        onCancel={() => { if (!deleting) setDeleteTarget(null); }}
      />

      {/* Bulk-selection action bar — only while at least one GR is ticked.
          Sits above the tab bar, doesn't disturb the card list layout. */}
      {canDeleteGR && selectedIds.size > 0 && (
        <View style={[styles.selectionBar, { backgroundColor: colors.surface, borderTopColor: colors.border, ...shadows.lg }]}>
          <TouchableOpacity onPress={clearSelection} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} disabled={bulkDeleting} accessibilityLabel={t('gr.cancel')}>
            <Ionicons name="close" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.selectionCount, { color: colors.textPrimary }]}>
            {selectedIds.size} {selectedIds.size === 1 ? 'GR selected' : 'GRs selected'}
          </Text>
          <TouchableOpacity
            style={[styles.selectionDeleteBtn, { backgroundColor: colors.error }, bulkDeleting && { opacity: 0.6 }]}
            onPress={() => setBulkConfirmOpen(true)}
            disabled={bulkDeleting}
            accessibilityRole="button"
          >
            <Ionicons name="trash-outline" size={16} color="#fff" />
            <Text style={styles.selectionDeleteText}>{bulkDeleting ? t('gr.deleting') : 'Delete Selected'}</Text>
          </TouchableOpacity>
        </View>
      )}

      <ConfirmDialog
        visible={bulkConfirmOpen}
        title={selectedIds.size === 1 ? 'Delete this GR?' : `Delete ${selectedIds.size} GRs?`}
        message="This will permanently delete the selected GR shipment(s). This cannot be undone."
        confirmLabel={bulkDeleting ? t('gr.deleting') : t('gr.delete')}
        cancelLabel={t('gr.cancel')}
        destructive
        confirmDisabled={bulkDeleting}
        onConfirm={confirmBulkDelete}
        onCancel={() => { if (!bulkDeleting) setBulkConfirmOpen(false); }}
      />
    </SafeAreaView>
  );
};

const createStyles = (theme: Pick<AppTheme, 'colors' | 'spacing' | 'radii' | 'fonts' | 'shadows'>) =>
  StyleSheet.create({
    safe: { flex: 1 },
    scrollContent: { paddingBottom: 40, paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.md },
    shimmerBlock: { marginBottom: theme.spacing.md, borderRadius: theme.radii.lg },
    summaryRow: { flexDirection: 'row', gap: 8, marginBottom: theme.spacing.lg },
    summaryCard: { flex: 1, padding: 12, alignItems: 'center', gap: 2 },
    summaryValue: { fontSize: theme.fonts.size.xl, fontWeight: '800' },
    summaryLabel: { fontSize: theme.fonts.size.xs, fontWeight: '600', textAlign: 'center' },
    searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: theme.spacing.md },
    searchIcon: { position: 'absolute', left: 14, zIndex: 1 },
    searchInput: { flex: 1, borderRadius: theme.radii.lg, paddingHorizontal: 40, paddingVertical: 12, fontSize: theme.fonts.size.md },
    filterBtn: { paddingHorizontal: 12, paddingVertical: 12, borderWidth: 1, borderColor: theme.colors.border },
    consignorFilterBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      paddingHorizontal: 14, paddingVertical: 10, marginBottom: theme.spacing.sm,
      borderWidth: 1,
    },
    consignorFilterText: { flex: 1, fontSize: theme.fonts.size.sm, fontWeight: '600' },
    resultCountRow: { marginBottom: theme.spacing.sm },
    resultCountText: { fontSize: theme.fonts.size.xs, fontWeight: '600' },
    consignorList: { maxHeight: 320, marginBottom: 16 },
    consignorOption: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingVertical: 12, paddingHorizontal: 14,
      borderWidth: 1, borderRadius: theme.radii.md, marginBottom: 8,
    },
    consignorRadio: {
      width: 18, height: 18, borderRadius: 9, borderWidth: 2,
      alignItems: 'center', justifyContent: 'center',
    },
    consignorRadioInner: { width: 10, height: 10, borderRadius: 5 },
    consignorOptionText: { fontSize: theme.fonts.size.md, fontWeight: '600', flex: 1 },
    consignorEmpty: { fontSize: theme.fonts.size.sm, fontWeight: '600', textAlign: 'center', paddingVertical: 20 },
    filters: { marginBottom: theme.spacing.lg },
    list: { gap: theme.spacing.md },
    card: { padding: 16, gap: 6 },
    cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    cardHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
    cardHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    checkbox: { padding: 2 },
    menuButton: { padding: 2 },
    selectionBar: {
      position: 'absolute', left: 0, right: 0, bottom: 0,
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingHorizontal: theme.spacing.lg, paddingTop: 14, paddingBottom: 28,
      borderTopWidth: StyleSheet.hairlineWidth,
    },
    selectionCount: { flex: 1, fontSize: theme.fonts.size.md, fontWeight: '800' },
    selectionDeleteBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      paddingHorizontal: 16, paddingVertical: 10, borderRadius: theme.radii.lg,
    },
    selectionDeleteText: { color: '#fff', fontSize: theme.fonts.size.sm, fontWeight: '800' },
    grNo: { fontSize: theme.fonts.size.md, fontWeight: '800' },
    consignorLine: { fontSize: theme.fonts.size.sm, fontWeight: '600' },
    routeRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    routeLine: { fontSize: theme.fonts.size.xs, flex: 1 },
    financialRow: {
      flexDirection: 'row', gap: 12, marginTop: 6, paddingTop: 8,
      borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.border,
    },
    financialBlock: { flex: 1, alignItems: 'center' },
    financialLabel: { fontSize: theme.fonts.size.xs, fontWeight: '600', marginBottom: 2 },
    financialValue: { fontSize: theme.fonts.size.sm, fontWeight: '800' },
    cardFooter: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      marginTop: 6, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.border,
    },
    slipInfo: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    slipText: { fontSize: theme.fonts.size.xs, fontWeight: '700' },
    dateText: { fontSize: theme.fonts.size.xs, fontWeight: '600' },
    actionBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, marginBottom: theme.spacing.md },
    actionBannerText: { flex: 1, fontSize: theme.fonts.size.sm, fontWeight: '600' },
    menuBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
    menuCard: { width: '100%', maxWidth: 320, paddingVertical: 8 },
    menuTitle: { fontSize: theme.fonts.size.xs, fontWeight: '700', paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4 },
    menuRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
    menuRowText: { fontSize: theme.fonts.size.md, fontWeight: '600' },
    deleteAllCard: { width: '100%', maxWidth: 400, padding: 24 },
    deleteAllTitle: { fontSize: theme.fonts.size.xl, fontWeight: '800' },
    deleteAllMessage: { fontSize: theme.fonts.size.md, fontWeight: '500', lineHeight: 22, marginTop: 12 },
    deleteAllPrompt: { fontSize: theme.fonts.size.sm, fontWeight: '600', marginTop: 16, marginBottom: 8 },
    deleteAllInput: {
      borderWidth: 1, borderRadius: theme.radii.md, paddingHorizontal: 14, paddingVertical: 12,
      fontSize: theme.fonts.size.md, fontWeight: '700',
    },
    deleteAllActions: { flexDirection: 'row', gap: 12, marginTop: 24 },
    deleteAllBtn: { flex: 1, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
    deleteAllCancelBtn: { borderWidth: 1 },
    deleteAllBtnDisabled: { opacity: 0.5 },
    deleteAllBtnText: { fontSize: theme.fonts.size.md, fontWeight: '700' },
    bottomSheet: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 24, paddingBottom: 40, paddingTop: 8 },
    sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: theme.colors.border, alignSelf: 'center', marginBottom: 16 },
    sheetTitle: { fontSize: theme.fonts.size.lg, fontWeight: '800', marginBottom: 16 },
    sheetLabel: { fontSize: theme.fonts.size.sm, fontWeight: '700', marginBottom: 8 },
    sheetChipRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
    sheetChip: { paddingHorizontal: 16, paddingVertical: 8, borderWidth: 1 },
    sheetChipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
    sheetChipText: { fontWeight: '700' },
    sheetChipTextActive: { color: '#fff' },
    sheetApplyBtn: { paddingVertical: 14, alignItems: 'center' },
    sheetApplyText: { fontSize: theme.fonts.size.md, fontWeight: '800' },
  });

export default AdminGRShipmentsScreen;
