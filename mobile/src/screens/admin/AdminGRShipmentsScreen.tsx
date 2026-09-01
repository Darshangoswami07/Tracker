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

  const fetchGRs = useCallback(
    async (pageNum: number, mode: 'initial' | 'refresh' | 'more' | 'reload' = 'initial') => {
      if (inFlightRef.current && mode !== 'more') return;
      inFlightRef.current = true;
      if (mode === 'initial') setStatus('loading');
      if (mode === 'refresh') setRefreshing(true);
      if (mode === 'more') setLoadingMore(true);
      try {
        const dateFrom = dateFilterToIso(dateFilter);
        const result = await orderRepository.list({
          page: pageNum,
          pageSize: PAGE_SIZE,
          status: FILTER_TO_STATUS[statusTab],
          search: search || undefined,
          area: effectiveArea || undefined,
          consignor: consignorFilter || undefined,
          dateFrom,
        });
        const rawItems: LocalGRListItem[] = result.items;

        // Fetch payment data for current page items
        const enrichedItems: GRCardItem[] = await Promise.all(
          rawItems.map(async (item) => {
            try {
              const summary = await orderRepository.getPaymentSummary(item.id);
              return {
                ...item,
                toPay: summary?.toPay ?? 0,
                totalPaid: summary?.totalPaid ?? 0,
                outstanding: (summary?.toPay ?? 0) - (summary?.totalPaid ?? 0),
                paymentCount: summary?.paymentCount ?? 0,
                paymentStatus: summary?.paymentStatus ?? 'unpaid',
              };
            } catch {
              return { ...item, toPay: 0, totalPaid: 0, outstanding: 0, paymentCount: 0, paymentStatus: 'unpaid' };
            }
          })
        );

        setItems((prev) => (mode === 'more' ? [...prev, ...enrichedItems] : enrichedItems));
        setHasMore(enrichedItems.length === PAGE_SIZE);
        setPage(pageNum);
        setError(null);
        setStatus('success');

        // Compute summary from all items (not just current page)
        if (mode !== 'more') {
          const allResults = await orderRepository.listAll({ search: search || undefined, area: effectiveArea || undefined, consignor: consignorFilter || undefined, dateFrom });
          const counts: SummaryCounts = { total: allResults.total, pending: 0, cleared: 0, uncleared: 0, delivered: 0, totalToPay: 0, totalReceived: 0, totalOutstanding: 0, todayCollection: 0 };
          for (const item of allResults.items) {
            if (item.status === 'pending') counts.pending++;
            else if (item.status === 'cleared') counts.cleared++;
            else if (item.status === 'uncleared') counts.uncleared++;
            else if (item.status === 'delivered') counts.delivered++;
          }

          // Financial totals computed from payment summaries (toPay isn't on LocalGRListItem)
          let totalToPay = 0, totalReceived = 0, totalOutstanding = 0;
          for (const item of allResults.items) {
            const ps = await orderRepository.getPaymentSummary(item.id);
            if (ps) {
              totalToPay += ps.toPay;
              totalReceived += ps.totalPaid;
              totalOutstanding += ps.balance;
            }
          }
          counts.totalToPay = totalToPay;
          counts.totalReceived = totalReceived;
          counts.totalOutstanding = totalOutstanding;

          const todayCollection = await orderRepository.getTodayCollection();
          counts.todayCollection = todayCollection;

          setSummary(counts);
        }
    } catch {
        setError(t('gr.couldNotLoadEntries'));
        setStatus('error');
      } finally {
        inFlightRef.current = false;
        setRefreshing(false);
        setLoadingMore(false);
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

  // Load distinct consignor names for the shop-owner filter dropdown.
  useEffect(() => {
    let cancelled = false;
    orderRepository.getDistinctConsignors(effectiveArea || undefined).then((names) => {
      if (!cancelled) setConsignorOptions(names);
    });
    return () => { cancelled = true; };
  }, [effectiveArea]);

  const onRefresh = () => fetchGRs(1, 'refresh');

  const onAddPress = () => {
    if (canImportExcel) setAddMenuOpen(true);
    else navigate('CreateGR');
  };

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
      />

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#635BFF']} progressBackgroundColor={colors.surface} />}
        contentContainerStyle={styles.scrollContent}
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

        {/* Summary Cards */}
        <View style={styles.summaryRow}>
          <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}>
            <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>{summary.total}</Text>
            <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>{t('summary.totalGRs')}</Text>
          </View>
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
                  <Text style={[styles.grNo, { color: colors.textPrimary }]}>{gr.orderNumber}</Text>
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
    cardHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    menuButton: { padding: 2 },
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
