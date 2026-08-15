import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/useAppTheme';
import { orderRepository } from '../../database/repositories/orderRepository';
import { Header } from '../../components/Header';
import { ShimmerCard } from '../../components/ShimmerCard';
import { EmptyState } from '../../components/EmptyState';
import { StatusBadge } from '../../components/StatusBadge';
import { FilterChips } from '../../components/FilterChips';
import { useAppNav } from '../../hooks/useAppNav';
import type { AppTheme } from '../../theme/types';

/** GR/Shipment row shape returned by `GET /admin/orders` — matches
 * `admin/src/types/gr.ts` `GRListItem` on the web reference exactly. */
interface GRListItem {
  id: string;
  orderNumber: string;
  consignorName: string | null;
  consigneeName: string | null;
  pickupAddress: string;
  deliveryAddress: string;
  driverId: string | null;
  assignedStaffId: string | null;
  status: string;
  createdAt: string;
  hasSlip: boolean;
}

const PAGE_SIZE = 20;

const STATUS_FILTERS = ['All', 'Pending', 'Assigned', 'Pickup', 'In Transit', 'Delivered', 'Failed', 'Returned', 'Cancelled'];
const FILTER_TO_STATUS: Record<string, string | undefined> = {
  All: undefined,
  Pending: 'pending',
  Assigned: 'assigned',
  Pickup: 'pickup',
  'In Transit': 'in_transit',
  Delivered: 'delivered',
  Failed: 'failed',
  Returned: 'returned',
  Cancelled: 'cancelled',
};

const formatDate = (iso: string): string => {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

type LoadStatus = 'loading' | 'success' | 'error';

/**
 * Mobile equivalent of the web Admin "GR / Shipments" page
 * (`admin/src/app/dashboard/orders/page.tsx`). In the local-first
 * architecture the GR list is read from the on-device SQLite repository
 * (`orderRepository.list`) instead of `GET /admin/orders`, so it works fully
 * offline. Search, status filter, and pagination behave the same as before;
 * tapping a card opens `AdminGRDetailsScreen` for the full record.
 *
 * The screen uses ONE load path (`fetchGRs`) guarded by an in-flight ref so
 * the mount effect, focus listener, and the search/filter debounce can never
 * run concurrently and leave `loading` stuck true. The skeleton is only shown
 * while the first load is in flight and there is no data yet; every later
 * reload (pull-to-refresh, search/filter change, return-from-detail) keeps the
 * existing list visible and swaps in fresh rows, so the screen never hangs on
 * a spinner.
 */
export const AdminGRShipmentsScreen = () => {
  const { colors, spacing, radii, fonts, shadows } = useAppTheme();
  const { goBack, navigate, navigation } = useAppNav();

  const styles = createStyles({ colors, spacing, radii, fonts, shadows });

  const [items, setItems] = useState<GRListItem[]>([]);
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [search, setSearch] = useState('');
  const [statusTab, setStatusTab] = useState('All');

  // Guards against overlapping fetches from mount/focus/debounce. When a
  // request is already in flight, a new trigger is ignored — the in-flight
  // one will render the latest data anyway because it reads the current
  // `search`/`statusTab` values.
  const inFlightRef = useRef(false);

  const fetchGRs = useCallback(
    async (pageNum: number, mode: 'initial' | 'refresh' | 'more' | 'reload' = 'initial') => {
      if (inFlightRef.current && mode !== 'more') return;
      inFlightRef.current = true;
      if (mode === 'initial') setStatus('loading');
      if (mode === 'refresh') setRefreshing(true);
      if (mode === 'more') setLoadingMore(true);
      try {
        const result = await orderRepository.list({
          page: pageNum,
          pageSize: PAGE_SIZE,
          status: FILTER_TO_STATUS[statusTab],
          search: search || undefined,
        });
        const newItems: GRListItem[] = result.items;
        setItems((prev) => (mode === 'more' ? [...prev, ...newItems] : newItems));
        setHasMore(newItems.length === PAGE_SIZE);
        setPage(pageNum);
        setError(null);
        setStatus('success');
      } catch (err: any) {
        setError(err?.message ?? 'Could not load GR entries. Please try again.');
        setStatus('error');
      } finally {
        inFlightRef.current = false;
        setRefreshing(false);
        setLoadingMore(false);
      }
    },
    [search, statusTab]
  );

  const didMount = useRef(false);

  // Initial load.
  useEffect(() => {
    fetchGRs(1, 'initial');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refetch when returning from Create GR / GR Details so mutations made
  // there (creation, status change, assignment, slip upload) are reflected in
  // the list without a manual pull-to-refresh. Skips the first (mount) focus
  // event since the effect above already fetches on mount.
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      if (!didMount.current) {
        didMount.current = true;
        return;
      }
      fetchGRs(1, 'refresh');
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation]);

  // Debounced reload on search / status filter changes. Keeps the existing
  // list visible instead of showing the skeleton again, so typing never
  // produces a stuck loading state.
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchGRs(1, 'reload');
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, statusTab]);

  const onRefresh = () => {
    fetchGRs(1, 'refresh');
  };

  const loadMore = () => {
    if (!inFlightRef.current && !loadingMore && hasMore) {
      fetchGRs(page + 1, 'more');
    }
  };

  // Skeleton only while the very first load is in flight and nothing is shown.
  const showSkeleton = status === 'loading' && items.length === 0;

  if (showSkeleton) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <Header
          title="GR / Shipments"
          leftAction={{ icon: 'chevron-back', onPress: goBack }}
          rightAction={{ icon: 'add', onPress: () => navigate('CreateGR'), accessibilityLabel: 'Create GR' }}
        />
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <ShimmerCard style={styles.searchShimmer} height={44} />
          <ShimmerCard style={styles.filterShimmer} height={36} />
          {[1, 2, 3, 4, 5].map((i) => (
            <ShimmerCard key={i} style={styles.cardShimmer} height={110} />
          ))}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <Header
        title="GR / Shipments"
        leftAction={{ icon: 'chevron-back', onPress: goBack }}
        rightAction={{ icon: 'add', onPress: () => navigate('CreateGR'), accessibilityLabel: 'Create GR' }}
      />

      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#635BFF']} progressBackgroundColor={colors.surface} />
        }
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onScroll={({ nativeEvent }) => {
          const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
          if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 200) {
            loadMore();
          }
        }}
        scrollEventThrottle={200}
      >
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={colors.textMuted} style={styles.searchIcon} />
          <TextInput
            placeholder="Search GR number, consignor, consignee…"
            value={search}
            onChangeText={setSearch}
            style={[styles.searchInput, { color: colors.textPrimary, backgroundColor: colors.surface }]}
            placeholderTextColor={colors.textMuted}
            returnKeyType="search"
          />
        </View>

        <View style={styles.filters}>
          <FilterChips filters={STATUS_FILTERS} activeFilter={statusTab} onFilterChange={setStatusTab} />
        </View>

        {status === 'error' && items.length === 0 && (
          <EmptyState
            icon="cloud-offline-outline"
            title="Could not load GRs"
            subtitle={error ?? 'Something went wrong while reading your shipments.'}
            actionLabel="Retry"
            onActionPress={() => fetchGRs(1, 'initial')}
            iconColor={colors.error}
          />
        )}

        {status === 'success' && items.length === 0 && (
          <EmptyState
            icon="reader-outline"
            title="No GR entries"
            subtitle={
              search || statusTab !== 'All'
                ? 'No GRs match your search or filter.'
                : 'Shipments will appear here once created.'
            }
            actionLabel="Create GR"
            onActionPress={() => navigate('CreateGR')}
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
                  <StatusBadge status={gr.status} size="sm" />
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
                <View style={styles.cardFooter}>
                  <View style={styles.slipInfo}>
                    <Ionicons
                      name={gr.hasSlip ? 'document-attach' : 'document-outline'}
                      size={14}
                      color={gr.hasSlip ? '#10B981' : colors.textMuted}
                    />
                    <Text style={[styles.slipText, { color: gr.hasSlip ? '#10B981' : colors.textMuted }]}>
                      {gr.hasSlip ? 'Slip uploaded' : 'No slip'}
                    </Text>
                  </View>
                  <Text style={[styles.dateText, { color: colors.textMuted }]}>{formatDate(gr.createdAt)}</Text>
                </View>
              </TouchableOpacity>
            ))}
            {loadingMore && <ShimmerCard style={styles.cardShimmer} height={110} />}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const createStyles = (theme: Pick<AppTheme, 'colors' | 'spacing' | 'radii' | 'fonts' | 'shadows'>) =>
  StyleSheet.create({
    safe: { flex: 1 },
    scrollContent: { paddingBottom: 40, paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.md },
    searchBar: { position: 'relative', justifyContent: 'center', marginBottom: theme.spacing.md },
    searchIcon: { position: 'absolute', left: 14, zIndex: 1 },
    searchInput: { borderRadius: theme.radii.lg, paddingHorizontal: 40, paddingVertical: 12, fontSize: theme.fonts.size.md },
    searchShimmer: { marginBottom: theme.spacing.md, borderRadius: theme.radii.lg },
    filters: { marginBottom: theme.spacing.lg },
    filterShimmer: { width: 200, borderRadius: theme.radii.pill, marginBottom: theme.spacing.lg },
    list: { gap: theme.spacing.md },
    cardShimmer: { marginBottom: theme.spacing.md, borderRadius: theme.radii.lg },
    card: { padding: 16, gap: 6 },
    cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    grNo: { fontSize: theme.fonts.size.md, fontWeight: '800' },
    consignorLine: { fontSize: theme.fonts.size.sm, fontWeight: '600' },
    routeRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    routeLine: { fontSize: theme.fonts.size.xs, flex: 1 },
    cardFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 6,
      paddingTop: 8,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.border,
    },
    slipInfo: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    slipText: { fontSize: theme.fonts.size.xs, fontWeight: '700' },
    dateText: { fontSize: theme.fonts.size.xs, fontWeight: '600' },
  });

export default AdminGRShipmentsScreen;