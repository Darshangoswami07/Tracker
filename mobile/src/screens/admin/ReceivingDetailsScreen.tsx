import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/useAppTheme';
import { orderRepository } from '../../database/repositories/orderRepository';
import type { ReceivingListItem, ReceivingOverview } from '../../database/repositories/orderRepository';
import { Header } from '../../components/Header';
import { ShimmerCard } from '../../components/ShimmerCard';
import { EmptyState } from '../../components/EmptyState';
import { FilterChips } from '../../components/FilterChips';
import { useAppNav } from '../../hooks/useAppNav';
import { useTranslation } from 'react-i18next';
import type { AppTheme } from '../../theme/types';

const PAGE_SIZE = 20;

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

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      handleBack();
      return true;
    });
    return () => subscription.remove();
  }, [handleBack]);

  const styles = createStyles({ colors, spacing, radii, fonts, shadows });

  const [items, setItems] = useState<ReceivingListItem[]>([]);
  const [overview, setOverview] = useState<ReceivingOverview>({
    totalToPay: 0, totalPaid: 0, outstanding: 0, totalTransactions: 0,
    unpaidCount: 0, partialCount: 0, paidCount: 0, overpaidCount: 0, grCount: 0,
  });
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
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchData(1, 'reload');
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, statusTab, dateFilter, deliveryFilter, customDateFrom, customDateTo]);

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
          if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 200) loadMore();
        }}
        scrollEventThrottle={200}
      >
        {/* Summary Cards */}
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

        {/* Search + Filter */}
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
