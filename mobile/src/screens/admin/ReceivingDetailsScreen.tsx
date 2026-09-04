import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, BackHandler, LayoutAnimation, Modal, Platform, Pressable,
  RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, UIManager, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/useAppTheme';
import { orderRepository } from '../../database/repositories/orderRepository';
import type { PaymentReceiver, ReceivingListItem, ReceivingOverview, ReceivingPaymentHistoryItem } from '../../database/repositories/orderRepository';
import { Header } from '../../components/Header';
import { ShimmerCard } from '../../components/ShimmerCard';
import { EmptyState } from '../../components/EmptyState';
import { FilterChips } from '../../components/FilterChips';
import { formatPaymentMode } from '../../constants/paymentModes';
import { grRealtime } from '../../services/grRealtime';
import { useAppNav } from '../../hooks/useAppNav';
import { useTranslation } from 'react-i18next';
import type { AppTheme } from '../../theme/types';

// Subtle content-swap animation when switching Admin Direct <-> Staff
// Received (LayoutAnimation, not a new animation dependency). Android needs
// this experimental flag enabled once; iOS/New Architecture ignore it.
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const PAGE_SIZE = 20;
const RECEIVER_PAGE_SIZE = 10;
const MODE_FILTERS = ['All', 'Cash', 'UPI', 'Bank Transfer', 'Cheque'];
const MODE_FILTER_TO_VALUE: Record<string, string | undefined> = {
  All: undefined,
  Cash: 'cash',
  UPI: 'upi',
  'Bank Transfer': 'bank_transfer',
  Cheque: 'cheque',
};

const PAYMENT_STATUS_FILTERS = ['All', 'Unpaid', 'Partial', 'Paid', 'Overpaid'];
const FILTER_TO_STATUS: Record<string, string | undefined> = {
  All: undefined,
  Unpaid: 'unpaid',
  Partial: 'partial',
  Paid: 'paid',
  Overpaid: 'overpaid',
};

const DELIVERY_STATUS_FILTERS = ['All', 'Cleared', 'Uncleared'];
type DeliveryFilter = 'All' | 'Cleared' | 'Uncleared';

const formatCurrency = (amount: number): string => {
  return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

const formatDate = (iso: string): string => {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

/** Date + time, device locale/timezone — same building blocks `formatDate`
 * and the Staff Work screen already use throughout the app. */
const formatDateTime = (iso: string): string => {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const day = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${day}, ${time}`;
};

type LoadStatus = 'loading' | 'success' | 'error';

/**
 * Receiving Details — mobile equivalent of the legacy desktop "Customer Tracking"
 * payment/collection management page. Shows a summary of all GR payments,
 * filterable list of GRs with their payment status, and allows receiving
 * payments against individual GRs.
 */
export const ReceivingDetailsScreen = () => {
  const { colors, spacing, radii, fonts, shadows } = useAppTheme();
  const { t } = useTranslation();
  const { navigate, navigation } = useAppNav();

  const handleBack = useCallback(() => {
    navigate('AdminDashboard');
  }, [navigate]);

  // useFocusEffect, not plain useEffect — see AdminGRShipmentsScreen for why
  // (native-stack keeps this screen mounted under anything pushed on top, so
  // an unconditional listener would keep hijacking Android back there too).
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

  const [items, setItems] = useState<ReceivingListItem[]>([]);
  const [overview, setOverview] = useState<ReceivingOverview>({
    totalToPay: 0, totalPaid: 0, outstanding: 0, totalTransactions: 0,
    unpaidCount: 0, partialCount: 0, paidCount: 0, overpaidCount: 0, grCount: 0,
    directUpiReceived: 0, directAdminTotal: 0, directAdminCount: 0,
    staffReceivedTotal: 0, staffReceivedCount: 0,
  });

  // "Admin Direct" / "Staff Received" history tabs — independent of the GR
  // list's own search/status/date filters (a fixed financial record, not a
  // view over the same filtered GR set), so it gets its own fetch/pagination.
  const [receiverTab, setReceiverTab] = useState<PaymentReceiver>('ADMIN');
  const [modeFilter, setModeFilter] = useState<string>('All');
  const [receiverItems, setReceiverItems] = useState<ReceivingPaymentHistoryItem[]>([]);
  const [receiverPage, setReceiverPage] = useState(1);
  const [receiverHasMore, setReceiverHasMore] = useState(true);
  const [receiverLoading, setReceiverLoading] = useState(true);
  const [receiverLoadingMore, setReceiverLoadingMore] = useState(false);
  const receiverInFlight = useRef(false);
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [search, setSearch] = useState('');
  const [statusTab, setStatusTab] = useState('All');
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month' | 'custom'>('all');
  const [deliveryFilter, setDeliveryFilter] = useState<DeliveryFilter>('All');
  const [customDateFrom, setCustomDateFrom] = useState('');
  const [customDateTo, setCustomDateTo] = useState('');

  const inFlightRef = useRef(false);

  const getDateRange = useCallback(() => {
    if (dateFilter === 'custom' && customDateFrom) {
      const fmt = (d: Date) => d.toISOString().slice(0, 10);
      const dayEnd = (y: number, m: number, d: number) => fmt(new Date(Date.UTC(y, m, d + 1)));
      const from = customDateFrom;
      const to = customDateTo || dayEnd(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate());
      return { from, to };
    }

    const now = new Date();
    const yyyy = now.getUTCFullYear();
    const mm = now.getUTCMonth();
    const dd = now.getUTCDate();

    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const dayStart = (y: number, m: number, d: number) => fmt(new Date(Date.UTC(y, m, d)));
    const dayEnd = (y: number, m: number, d: number) => fmt(new Date(Date.UTC(y, m, d + 1)));

    switch (dateFilter) {
      case 'today':
        return { from: dayStart(yyyy, mm, dd), to: dayEnd(yyyy, mm, dd) };
      case 'week': {
        const dayOfWeek = now.getUTCDay();
        const weekDay = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        return { from: dayStart(yyyy, mm, dd - weekDay), to: dayEnd(yyyy, mm, dd) };
      }
      case 'month':
        return { from: dayStart(yyyy, mm, 1), to: dayEnd(yyyy, mm, dd) };
      default:
        return undefined;
    }
  }, [dateFilter, customDateFrom, customDateTo]);

  const fetchData = useCallback(
    async (pageNum: number, mode: 'initial' | 'refresh' | 'more' | 'reload' = 'initial') => {
      if (inFlightRef.current && mode !== 'more') return;
      inFlightRef.current = true;
      if (mode === 'initial') setStatus('loading');
      if (mode === 'refresh') setRefreshing(true);
      if (mode === 'more') setLoadingMore(true);

      try {
        const dateRange = getDateRange();
        const paymentStatus = FILTER_TO_STATUS[statusTab];

        const [listResult, overviewResult] = await Promise.all([
          orderRepository.listReceiving({
            page: pageNum,
            pageSize: PAGE_SIZE,
            search: search || undefined,
            paymentStatus,
            dateFrom: dateRange?.from,
            dateTo: dateRange?.to,
          }),
          mode !== 'more' ? orderRepository.getReceivingOverview() : null,
        ]);

        let newItems = listResult.items;

        if (deliveryFilter !== 'All') {
          newItems = newItems.filter((item) => {
            if (deliveryFilter === 'Cleared') return item.paymentStatus === 'paid' || item.paymentStatus === 'overpaid';
            return item.paymentStatus === 'unpaid' || item.paymentStatus === 'partial';
          });
        }

        setItems((prev) => (mode === 'more' ? [...prev, ...newItems] : newItems));
        setHasMore(newItems.length === PAGE_SIZE);
        setPage(pageNum);
        setError(null);
        setStatus('success');

        if (overviewResult) setOverview(overviewResult);
      } catch {
        setError(t('receiving.couldNotLoad'));
        setStatus('error');
      } finally {
        inFlightRef.current = false;
        setRefreshing(false);
        setLoadingMore(false);
      }
    },
    [search, statusTab, deliveryFilter, getDateRange, t]
  );

  // "Admin Direct" / "Staff Received" history — receivedBy (never enteredBy,
  // never the logged-in user, never payment mode) is the ONLY thing that
  // decides which tab a transaction belongs to; the backend enforces this,
  // the tab switch just changes which `receivedBy` value gets requested.
  const fetchReceiverHistory = useCallback(
    async (pageNum: number, mode: 'initial' | 'more' | 'refresh' = 'initial') => {
      if (receiverInFlight.current) return;
      receiverInFlight.current = true;
      if (mode === 'initial') setReceiverLoading(true);
      if (mode === 'more') setReceiverLoadingMore(true);
      try {
        const res = await orderRepository.getReceivingPaymentHistory({
          receivedBy: receiverTab,
          paymentMethod: MODE_FILTER_TO_VALUE[modeFilter],
          page: pageNum,
          pageSize: RECEIVER_PAGE_SIZE,
        });
        setReceiverItems((prev) => (mode === 'more' ? [...prev, ...res.items] : res.items));
        setReceiverPage(pageNum);
        setReceiverHasMore(pageNum * RECEIVER_PAGE_SIZE < res.total);
      } catch {
        // Non-fatal — the primary GR list/overview above stays usable even
        // if this secondary section fails to load.
      } finally {
        receiverInFlight.current = false;
        setReceiverLoading(false);
        setReceiverLoadingMore(false);
      }
    },
    [receiverTab, modeFilter]
  );

  const receiverFetchRef = useRef(fetchReceiverHistory);
  useEffect(() => {
    receiverFetchRef.current = fetchReceiverHistory;
  });

  // Tab / payment-mode-filter change → refetch page 1 immediately (a
  // discrete tap, not typing).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchReceiverHistory(1, 'initial');
  }, [fetchReceiverHistory]);

  const loadMoreReceiver = () => {
    if (!receiverInFlight.current && !receiverLoadingMore && receiverHasMore) {
      fetchReceiverHistory(receiverPage + 1, 'more');
    }
  };

  // Live updates: a payment recorded anywhere (Receive Payment modal, any
  // GR) can move the Admin Direct / Staff Received totals and history shown
  // here — subscribe ONCE for the screen's lifetime and debounce-refetch
  // just the overview + current tab's page 1 (not the filtered GR list,
  // which the user may be actively scrolling/searching).
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsub = grRealtime.subscribe(() => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        orderRepository.getReceivingOverview().then(setOverview).catch(() => undefined);
        void receiverFetchRef.current(1, 'refresh');
      }, 400);
    });
    return () => {
      unsub();
      if (timer) clearTimeout(timer);
    };
  }, []);

  const didMount = useRef(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData(1, 'initial');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      if (!didMount.current) {
        didMount.current = true;
        return;
      }
      fetchData(1, 'refresh');
      void receiverFetchRef.current(1, 'refresh');
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation]);

  // Status tab / date-range / delivery-filter are discrete taps, not typing
  // — reload immediately so the list never visibly lags behind whichever
  // chip is already highlighted (the debounce here made every tap look
  // like it silently failed for 400ms).
  const didMountFilters = useRef(false);
  useEffect(() => {
    if (!didMountFilters.current) {
      didMountFilters.current = true;
      return;
    }
    fetchData(1, 'reload');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusTab, dateFilter, deliveryFilter, customDateFrom, customDateTo]);

  // Search IS typing — keep this one debounced.
  const didMountSearch = useRef(false);
  useEffect(() => {
    if (!didMountSearch.current) {
      didMountSearch.current = true;
      return;
    }
    const timer = setTimeout(() => {
      fetchData(1, 'reload');
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const onRefresh = () => fetchData(1, 'refresh');

  const loadMore = () => {
    if (!inFlightRef.current && !loadingMore && hasMore) fetchData(page + 1, 'more');
  };

  const showSkeleton = status === 'loading' && items.length === 0;

  if (showSkeleton) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <Header
          title={t('receiving.title')}
          leftAction={{ icon: 'chevron-back', onPress: handleBack }}
        />
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <ShimmerCard style={styles.shimmerBlock} height={100} />
          <ShimmerCard style={styles.shimmerBlock} height={44} />
          <ShimmerCard style={styles.shimmerBlock} height={36} />
          {[1, 2, 3, 4, 5].map((i) => (
            <ShimmerCard key={i} style={styles.shimmerBlock} height={140} />
          ))}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <Header
        title={t('receiving.title')}
        leftAction={{ icon: 'chevron-back', onPress: handleBack }}
      />

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#635BFF']} progressBackgroundColor={colors.surface} />}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onScroll={({ nativeEvent }) => {
          const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
          if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 200) {
            // Only paginate the tab actually on screen — never fetch the
            // other tab's data in the background.
            if (receiverTab === 'ADMIN') loadMoreReceiver();
            else loadMore();
          }
        }}
        scrollEventThrottle={200}
      >
        {/* Admin Direct / Staff Received — a real content switch (not a CSS
            hide): each tab renders its OWN section below, never both at
            once. "Staff Received" is the pre-existing Receiving Details flow
            (search/status/delivery filters + GR cards) unchanged; "Admin
            Direct" is the payments-by-receiver view. Both read the same
            `overview`/history endpoints — no duplicate data fetching. */}
        <View style={[styles.receiverTabRow, { backgroundColor: colors.surface, borderRadius: radii.lg, borderColor: colors.border }]}>
          <TouchableOpacity
            style={[styles.receiverTab, receiverTab === 'ADMIN' && { backgroundColor: colors.primary, borderRadius: radii.md }]}
            onPress={() => {
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              setReceiverTab('ADMIN');
            }}
            activeOpacity={0.8}
          >
            <Text style={[styles.receiverTabText, { color: receiverTab === 'ADMIN' ? '#fff' : colors.textSecondary }]}>
              {t('receiving.adminDirect')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.receiverTab, receiverTab === 'STAFF' && { backgroundColor: colors.primary, borderRadius: radii.md }]}
            onPress={() => {
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              setReceiverTab('STAFF');
            }}
            activeOpacity={0.8}
          >
            <Text style={[styles.receiverTabText, { color: receiverTab === 'STAFF' ? '#fff' : colors.textSecondary }]}>
              {t('receiving.staffReceived')}
            </Text>
          </TouchableOpacity>
        </View>

        {receiverTab === 'ADMIN' ? (
          <>
            {/* ===== ADMIN DIRECT — ONLY this section renders ===== */}
            <View style={[styles.receiverTotalCard, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}>
              <Text style={[styles.receiverTotalLabel, { color: colors.textMuted }]}>{t('receiving.totalAdminDirect')}</Text>
              <Text style={[styles.receiverTotalValue, { color: '#14B8A6' }]}>{formatCurrency(overview.directAdminTotal)}</Text>
            </View>

            <View style={styles.filters}>
              <FilterChips filters={MODE_FILTERS} activeFilter={modeFilter} onFilterChange={setModeFilter} />
            </View>

            {receiverLoading ? (
              <>
                <ShimmerCard style={styles.shimmerBlock} height={100} />
                <ShimmerCard style={styles.shimmerBlock} height={100} />
              </>
            ) : receiverItems.length === 0 ? (
              <View style={styles.directAdminEmpty}>
                <EmptyState icon="wallet-outline" title={t('receiving.noAdminDirectPayments')} subtitle="" />
              </View>
            ) : (
              <View style={[styles.list, styles.directAdminList]}>
                {receiverItems.map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.card, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}
                    onPress={() => navigate('ReceivingDetail', { orderId: item.orderId })}
                    activeOpacity={0.85}
                  >
                    <View style={styles.cardHeader}>
                      <Text style={[styles.grNo, { color: colors.textPrimary }]}>{item.orderNumber}</Text>
                      <Text style={[styles.directAdminAmount, { color: '#14B8A6' }]}>{formatCurrency(item.amount)}</Text>
                    </View>
                    <Text style={[styles.consigneeLine, { color: colors.textSecondary }]}>
                      {item.consigneeName || item.consignorName || '—'}
                    </Text>
                    <View style={styles.directAdminMetaRow}>
                      <View style={[styles.directAdminModeBadge, { backgroundColor: '#14B8A615' }]}>
                        <Text style={[styles.directAdminModeText, { color: '#14B8A6' }]}>{formatPaymentMode(item.paymentMethod)}</Text>
                      </View>
                      <Text style={[styles.dateText, { color: colors.textMuted }]}>{formatDateTime(item.createdAt)}</Text>
                    </View>
                    <Text style={[styles.directAdminCollectedBy, { color: colors.textSecondary }]}>
                      {t('receiving.receivedByAdminLabel')}
                    </Text>
                    {item.enteredByName && (
                      <Text style={[styles.directAdminCollectedBy, { color: colors.textMuted }]}>
                        {t('receiving.enteredBy')}: {item.enteredByName}
                      </Text>
                    )}
                    {item.notes && (
                      <Text style={[styles.directAdminCollectedBy, { color: colors.textMuted }]} numberOfLines={2}>
                        {item.notes}
                      </Text>
                    )}
                  </TouchableOpacity>
                ))}
                {receiverHasMore && (
                  <TouchableOpacity
                    style={[styles.loadMoreBtn, { borderColor: colors.border, borderRadius: radii.md }]}
                    onPress={loadMoreReceiver}
                    disabled={receiverLoadingMore}
                  >
                    {receiverLoadingMore ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <Text style={[styles.loadMoreText, { color: colors.primary }]}>{t('receiving.loadMore')}</Text>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            )}
          </>
        ) : (
          <>
            {/* ===== STAFF RECEIVED — the pre-existing Receiving Details
                flow, unchanged. ONLY this section renders. ===== */}
            <View style={styles.summaryRow}>
              <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}>
                <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>{formatCurrency(overview.totalToPay)}</Text>
                <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>{t('receiving.totalToCollect')}</Text>
              </View>
              <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}>
                <Text style={[styles.summaryValue, { color: '#10B981' }]}>{formatCurrency(overview.totalPaid)}</Text>
                <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>{t('receiving.totalCollected')}</Text>
              </View>
            </View>

            <View style={styles.summaryRow}>
              <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}>
                <Text style={[styles.summaryValue, { color: '#F97316' }]}>{formatCurrency(overview.outstanding)}</Text>
                <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>{t('receiving.outstanding')}</Text>
              </View>
              <View style={[styles.summaryCard, { backgroundColor: '#D1FAE5', borderRadius: radii.lg, ...shadows.sm }]}>
                <Text style={[styles.summaryValue, { color: '#059669' }]}>{overview.paidCount + overview.overpaidCount}</Text>
                <Text style={[styles.summaryLabel, { color: '#059669' }]}>{t('receiving.cleared')}</Text>
              </View>
            </View>

            <View style={styles.summaryRow}>
              <View style={[styles.summaryCard, { backgroundColor: '#FEF3C7', borderRadius: radii.lg, ...shadows.sm }]}>
                <Text style={[styles.summaryValue, { color: '#D97706' }]}>{overview.unpaidCount + overview.partialCount}</Text>
                <Text style={[styles.summaryLabel, { color: '#D97706' }]}>{t('receiving.uncleared')}</Text>
              </View>
              <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}>
                <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>{overview.totalTransactions}</Text>
                <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>{t('receiving.transactions')}</Text>
              </View>
            </View>

            <View style={styles.searchBar}>
              <Ionicons name="search" size={18} color={colors.textMuted} style={styles.searchIcon} />
              <TextInput
                placeholder={t('receiving.searchPlaceholder')}
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

            <View style={styles.filters}>
              <FilterChips filters={PAYMENT_STATUS_FILTERS} activeFilter={statusTab} onFilterChange={setStatusTab} />
            </View>

            <View style={styles.filters}>
              <FilterChips filters={DELIVERY_STATUS_FILTERS} activeFilter={deliveryFilter} onFilterChange={(f) => setDeliveryFilter(f as DeliveryFilter)} />
            </View>

            {status === 'error' && items.length === 0 && (
              <EmptyState
                icon="cloud-offline-outline"
                title={t('receiving.couldNotLoad')}
                subtitle={error ?? t('receiving.somethingWrong')}
                actionLabel={t('common.retry')}
                onActionPress={() => fetchData(1, 'initial')}
                iconColor={colors.error}
              />
            )}

            {status === 'success' && items.length === 0 && (
              <EmptyState
                icon="wallet-outline"
                title={t('receiving.noEntries')}
                subtitle={search || statusTab !== 'All' ? t('receiving.searchResultsEmpty') : t('receiving.noPaymentsYet')}
              />
            )}

            {items.length > 0 && (
              <View style={styles.list}>
                {items.map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.card, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}
                    onPress={() => navigate('ReceivingDetail', { orderId: item.id })}
                    activeOpacity={0.85}
                  >
                    <View style={styles.cardHeader}>
                      <Text style={[styles.grNo, { color: colors.textPrimary }]}>{item.orderNumber}</Text>
                      <View style={styles.cardHeaderRight}>
                        <PaymentStatusBadge status={item.paymentStatus} colors={colors} fonts={fonts} />
                      </View>
                    </View>

                    <Text style={[styles.consigneeLine, { color: colors.textSecondary }]}>
                      {item.consigneeName || '—'}
                    </Text>

                    <View style={styles.amountsRow}>
                      <View style={styles.amountBlock}>
                        <Text style={[styles.amountLabel, { color: colors.textMuted }]}>{t('receiving.toPay')}</Text>
                        <Text style={[styles.amountValue, { color: colors.textPrimary }]}>{formatCurrency(item.toPay)}</Text>
                      </View>
                      <View style={styles.amountBlock}>
                        <Text style={[styles.amountLabel, { color: colors.textMuted }]}>{t('receiving.paid')}</Text>
                        <Text style={[styles.amountValue, { color: '#10B981' }]}>{formatCurrency(item.totalPaid)}</Text>
                      </View>
                      <View style={styles.amountBlock}>
                        <Text style={[styles.amountLabel, { color: colors.textMuted }]}>{t('receiving.balance')}</Text>
                        <Text style={[styles.amountValue, { color: item.balance > 0 ? '#F97316' : '#10B981' }]}>
                          {formatCurrency(item.balance)}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.cardFooter}>
                      <View style={styles.paymentInfo}>
                        <Ionicons name="time-outline" size={14} color={colors.textMuted} />
                        <Text style={[styles.paymentCount, { color: colors.textMuted }]}>
                          {item.paymentCount} {item.paymentCount === 1 ? t('receiving.payment') : t('receiving.payments')}
                        </Text>
                      </View>
                      <Text style={[styles.dateText, { color: colors.textMuted }]}>{formatDate(item.createdAt)}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
                {loadingMore && <ShimmerCard style={styles.shimmerBlock} height={140} />}
              </View>
            )}
          </>
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
              {(['all', 'today', 'week', 'month', 'custom'] as const).map((opt) => (
                <TouchableOpacity
                  key={opt}
                  style={[styles.sheetChip, { borderRadius: radii.pill }, dateFilter === opt ? styles.sheetChipActive : { borderColor: colors.border }]}
                  onPress={() => setDateFilter(opt)}
                >
                  <Text style={[styles.sheetChipText, { fontSize: fonts.size.sm }, dateFilter === opt ? styles.sheetChipTextActive : { color: colors.textMuted }]}>
                    {opt === 'all' ? t('filters.all') : opt === 'today' ? t('filters.today') : opt === 'week' ? t('filters.thisWeek') : opt === 'month' ? t('filters.thisMonth') : t('receivingDetails.customDateRange')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {dateFilter === 'custom' && (
              <View style={styles.customDateRow}>
                <View style={styles.customDateField}>
                  <Text style={[styles.customDateLabel, { color: colors.textMuted }]}>{t('receivingDetails.from')}</Text>
                  <TextInput
                    placeholder="YYYY-MM-DD"
                    value={customDateFrom}
                    onChangeText={setCustomDateFrom}
                    style={[styles.customDateInput, { color: colors.textPrimary, borderColor: colors.border, borderRadius: radii.md }]}
                    placeholderTextColor={colors.textMuted}
                    keyboardType="default"
                  />
                </View>
                <View style={styles.customDateField}>
                  <Text style={[styles.customDateLabel, { color: colors.textMuted }]}>{t('receivingDetails.to')}</Text>
                  <TextInput
                    placeholder="YYYY-MM-DD"
                    value={customDateTo}
                    onChangeText={setCustomDateTo}
                    style={[styles.customDateInput, { color: colors.textPrimary, borderColor: colors.border, borderRadius: radii.md }]}
                    placeholderTextColor={colors.textMuted}
                    keyboardType="default"
                  />
                </View>
              </View>
            )}

            <TouchableOpacity
              style={[styles.sheetApplyBtn, { backgroundColor: colors.primary, borderRadius: radii.lg }]}
              onPress={() => setFilterSheetOpen(false)}
            >
              <Text style={[styles.sheetApplyText, { color: '#fff' }]}>{t('filters.applyFilters')}</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
};

/** Inline payment status pill — distinct from the GR delivery StatusBadge. */
const PaymentStatusBadge = ({ status, colors, fonts }: { status: string; colors: AppTheme['colors']; fonts: AppTheme['fonts'] }) => {
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    unpaid: { bg: '#FEE2E2', fg: '#DC2626', label: 'Unpaid' },
    partial: { bg: '#FEF3C7', fg: '#D97706', label: 'Partial' },
    paid: { bg: '#D1FAE5', fg: '#059669', label: 'Paid' },
    overpaid: { bg: '#DBEAFE', fg: '#2563EB', label: 'Overpaid' },
  };
  const s = map[status] ?? map.unpaid;
  return (
    <View style={[{ backgroundColor: s.bg, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3 }]}>
      <Text style={{ color: s.fg, fontSize: fonts.size.xs, fontWeight: '700' }}>{s.label}</Text>
    </View>
  );
};

const createStyles = (theme: Pick<AppTheme, 'colors' | 'spacing' | 'radii' | 'fonts' | 'shadows'>) =>
  StyleSheet.create({
    safe: { flex: 1 },
    scrollContent: { paddingBottom: 40, paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.md },
    shimmerBlock: { marginBottom: theme.spacing.md, borderRadius: theme.radii.lg },
    summaryRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
    summaryCard: { flex: 1, padding: 12, alignItems: 'center', gap: 2 },
    summaryValue: { fontSize: theme.fonts.size.lg, fontWeight: '800' },
    summaryLabel: { fontSize: theme.fonts.size.xs, fontWeight: '600', textAlign: 'center' },
    searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: theme.spacing.md, marginTop: theme.spacing.sm },
    searchIcon: { position: 'absolute', left: 14, zIndex: 1 },
    searchInput: { flex: 1, borderRadius: theme.radii.lg, paddingHorizontal: 40, paddingVertical: 12, fontSize: theme.fonts.size.md },
    filterBtn: { paddingHorizontal: 12, paddingVertical: 12, borderWidth: 1, borderColor: theme.colors.border },
    filters: { marginBottom: theme.spacing.lg },
    list: { gap: theme.spacing.md },
    card: { padding: 16, gap: 6 },
    cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    cardHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    grNo: { fontSize: theme.fonts.size.md, fontWeight: '800' },
    consigneeLine: { fontSize: theme.fonts.size.sm, fontWeight: '600' },
    amountsRow: { flexDirection: 'row', gap: 12, marginTop: 6, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.border },
    amountBlock: { flex: 1, alignItems: 'center' },
    amountLabel: { fontSize: theme.fonts.size.xs, fontWeight: '600', marginBottom: 2 },
    amountValue: { fontSize: theme.fonts.size.sm, fontWeight: '800' },
    cardFooter: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      marginTop: 6, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.border,
    },
    paymentInfo: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    paymentCount: { fontSize: theme.fonts.size.xs, fontWeight: '600' },
    dateText: { fontSize: theme.fonts.size.xs, fontWeight: '600' },
    receiverTabRow: { flexDirection: 'row', padding: 4, borderWidth: 1, marginBottom: theme.spacing.sm },
    receiverTab: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 10 },
    receiverTabText: { fontSize: theme.fonts.size.sm, fontWeight: '700' },
    receiverTotalCard: { padding: 16, alignItems: 'center', gap: 2, marginBottom: theme.spacing.md },
    receiverTotalLabel: { fontSize: theme.fonts.size.sm, fontWeight: '600' },
    receiverTotalValue: { fontSize: theme.fonts.size.xxl, fontWeight: '800' },
    directAdminList: { marginBottom: theme.spacing.lg },
    directAdminEmpty: { marginBottom: theme.spacing.lg },
    directAdminAmount: { fontSize: theme.fonts.size.md, fontWeight: '800' },
    directAdminMetaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
    directAdminModeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
    directAdminModeText: { fontSize: theme.fonts.size.xs, fontWeight: '700' },
    directAdminCollectedBy: { fontSize: theme.fonts.size.xs, fontWeight: '600', marginTop: 4 },
    loadMoreBtn: { alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderWidth: 1 },
    loadMoreText: { fontSize: theme.fonts.size.sm, fontWeight: '700' },
    menuBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
    bottomSheet: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 24, paddingBottom: 40, paddingTop: 8 },
    sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: theme.colors.border, alignSelf: 'center', marginBottom: 16 },
    sheetTitle: { fontSize: theme.fonts.size.lg, fontWeight: '800', marginBottom: 16 },
    sheetLabel: { fontSize: theme.fonts.size.sm, fontWeight: '700', marginBottom: 8 },
    sheetChipRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
    sheetChip: { paddingHorizontal: 16, paddingVertical: 8, borderWidth: 1 },
    sheetChipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
    sheetChipText: { fontWeight: '700' },
    sheetChipTextActive: { color: '#fff' },
    customDateRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
    customDateField: { flex: 1 },
    customDateLabel: { fontSize: theme.fonts.size.xs, fontWeight: '600', marginBottom: 4 },
    customDateInput: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, fontSize: theme.fonts.size.sm },
    sheetApplyBtn: { paddingVertical: 14, alignItems: 'center' },
    sheetApplyText: { fontSize: theme.fonts.size.md, fontWeight: '800' },
  });

export default ReceivingDetailsScreen;
