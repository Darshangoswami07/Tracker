import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/useAppTheme';
import { Header } from '../../components/Header';
import { ShimmerCard } from '../../components/ShimmerCard';
import { useAppNav } from '../../hooks/useAppNav';
import { orderRepository, type LocalGRListItem } from '../../database/repositories/orderRepository';
import type { AppTheme } from '../../theme/types';

const PAGE_SIZE = 100;

const STATUS_TABS: { key: string; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'uncleared', label: 'Uncleared' },
  { key: 'cleared', label: 'Cleared' },
  { key: 'delivered', label: 'Delivered' },
];

const STATUS_COLORS: Record<string, string> = {
  pending: '#F59E0B',
  uncleared: '#F97316',
  cleared: '#10B981',
  delivered: '#10B981',
};

const formatCurrency = (amount: number): string =>
  `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

/**
 * Admin: All Shops → Area → Shop → this screen.
 *
 * Shows every GR for exactly one shop (`consignorName`) within exactly one
 * area — both passed explicitly via route params rather than inferred from
 * the signed-in user, since Admin browses every area (unlike the Staff
 * equivalent, `StaffShopHistoryScreen`, which is always the Staff member's
 * own area). `orderRepository.list({ area, consignor })` applies both
 * filters together, so a shop that happens to share a name across two areas
 * can never leak the other area's GRs into this list.
 *
 * Status tabs (Pending/Uncleared/Cleared/Delivered) sit right under the
 * search bar — tap one to filter in place, matching the Staff screen's
 * layout so the two feel like the same product.
 */
export const AdminShopHistoryScreen = ({ route }: any) => {
  const { shopName, area } = (route?.params as { shopName: string; area: string }) ?? { shopName: '', area: '' };
  const { colors, spacing, radii, fonts, shadows } = useAppTheme();
  const { navigate, goBack } = useAppNav();
  const styles = createStyles({ colors, spacing, radii, fonts, shadows });

  const [items, setItems] = useState<LocalGRListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(
    async (pageNum: number, mode: 'replace' | 'append') => {
      if (mode === 'replace') setLoading(true);
      else setLoadingMore(true);
      try {
        const result = await orderRepository.list({
          page: pageNum,
          pageSize: PAGE_SIZE,
          status: statusFilter === 'all' ? undefined : statusFilter,
          search: search || undefined,
          area,
          consignor: shopName,
        });
        setTotal(result.total);
        setItems((prev) => (mode === 'append' ? [...prev, ...result.items] : result.items));
        setPage(pageNum);
      } catch (error) {
        console.error('Failed to load shop GR history:', error);
      } finally {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    },
    [area, statusFilter, search, shopName]
  );

  // Status tab is a discrete tap, not typing — reload immediately so the
  // list never visibly lags behind the tab that's already highlighted.
  useEffect(() => {
    load(1, 'replace');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, area, shopName]);

  // Search IS typing — debounce so it's not a query per keystroke. Skips
  // its own first run since the effect above already covers the initial
  // mount load.
  const didMountSearch = useRef(false);
  useEffect(() => {
    if (!didMountSearch.current) {
      didMountSearch.current = true;
      return;
    }
    const id = setTimeout(() => {
      load(1, 'replace');
    }, 250);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const onRefresh = () => {
    setRefreshing(true);
    load(1, 'replace');
  };

  const onLoadMore = () => {
    if (loadingMore || items.length >= total) return;
    setLoadingMore(true);
    load(page + 1, 'append');
  };

  const renderItem = ({ item }: { item: LocalGRListItem }) => {
    const outstanding = Number(item.toPay ?? 0) - Number(item.paymentAmount ?? 0);
    const statusColor = STATUS_COLORS[item.status] ?? colors.textMuted;
    return (
      <TouchableOpacity
        style={[styles.row, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}
        onPress={() => navigate('GRDetails', { orderId: item.id })}
        activeOpacity={0.85}
        accessibilityRole="button"
      >
        <View style={styles.rowTop}>
          <Text style={[styles.grNumber, { color: colors.textPrimary }]}>{item.orderNumber}</Text>
          <View style={[styles.badge, { backgroundColor: `${statusColor}18` }]}>
            <Text style={[styles.badgeText, { color: statusColor }]}>{item.status}</Text>
          </View>
        </View>
        <Text style={[styles.consignee, { color: colors.textSecondary }]} numberOfLines={1}>
          {item.consigneeName || '—'}
        </Text>
        <View style={styles.rowBottom}>
          <Text style={[styles.amountLabel, { color: colors.textMuted }]}>To Pay</Text>
          <Text style={[styles.amountValue, { color: colors.textPrimary }]}>{formatCurrency(Number(item.toPay ?? 0))}</Text>
          {outstanding > 0 && (
            <>
              <Text style={[styles.amountLabel, { color: colors.textMuted }]}>Outstanding</Text>
              <Text style={[styles.amountValue, { color: '#F97316' }]}>{formatCurrency(outstanding)}</Text>
            </>
          )}
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} style={styles.rowChevron} />
        </View>
      </TouchableOpacity>
    );
  };

  const listEmpty = !loading && items.length === 0;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <Header title={shopName} leftAction={{ icon: 'chevron-back', onPress: goBack }} />
      <View style={styles.areaPill}>
        <Ionicons name="location-outline" size={14} color={colors.primary} />
        <Text style={[styles.areaPillText, { color: colors.textSecondary }]}>{area}</Text>
      </View>

      <View style={[styles.searchBar, { backgroundColor: colors.surface, borderRadius: radii.lg }]}>
        <Ionicons name="search-outline" size={18} color={colors.textMuted} />
        <TextInput
          style={[styles.searchInput, { color: colors.textPrimary }]}
          placeholder="Search GR number / consignee"
          placeholderTextColor={colors.textMuted}
          value={search}
          onChangeText={setSearch}
          autoCorrect={false}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')} accessibilityRole="button">
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsScroll} contentContainerStyle={styles.tabs}>
        {STATUS_TABS.map((tab) => {
          const activeTab = statusFilter === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tab, activeTab && { backgroundColor: colors.primary }]}
              onPress={() => setStatusFilter(tab.key)}
              accessibilityRole="button"
            >
              <Text style={[styles.tabText, { color: activeTab ? '#fff' : colors.textSecondary }]}>{tab.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {listEmpty ? (
        <View style={styles.emptyWrap}>
          <Ionicons name="document-text-outline" size={48} color={colors.textMuted} />
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No GRs found</Text>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            {search || statusFilter !== 'all'
              ? `No GRs match your filters for ${shopName} in ${area}.`
              : `No GRs for ${shopName} in ${area} yet.`}
          </Text>
        </View>
      ) : (
        <FlatList
          data={items}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#635BFF']} progressBackgroundColor={colors.surface} />}
          ListFooterComponent={
            loadingMore ? <ActivityIndicator style={{ padding: 16 }} color={colors.primary} /> : null
          }
          onEndReached={onLoadMore}
          onEndReachedThreshold={0.3}
        />
      )}

      {loading && (
        <View style={styles.shimmerWrap}>
          {[0, 1, 2].map((i) => (
            <ShimmerCard key={i} style={styles.shimmerBlock} height={96} />
          ))}
        </View>
      )}
    </SafeAreaView>
  );
};

const createStyles = (theme: Pick<AppTheme, 'colors' | 'spacing' | 'radii' | 'fonts' | 'shadows'>) =>
  StyleSheet.create({
    safe: { flex: 1 },
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginHorizontal: theme.spacing.lg,
      marginTop: theme.spacing.sm,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: 10,
    },
    searchInput: { flex: 1, fontSize: theme.fonts.size.md },
    areaPill: { flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: theme.spacing.lg, marginTop: theme.spacing.sm },
    areaPillText: { fontSize: theme.fonts.size.xs, fontWeight: '700' },
    tabsScroll: { maxHeight: 48 },
    tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.sm },
    tab: { paddingHorizontal: theme.spacing.md, paddingVertical: 8, borderRadius: theme.radii.pill, backgroundColor: theme.colors.surface },
    tabText: { fontSize: theme.fonts.size.xs, fontWeight: '700' },
    listContent: { padding: theme.spacing.lg, gap: theme.spacing.sm, paddingBottom: 40 },
    row: { padding: theme.spacing.lg, gap: 6 },
    rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    grNumber: { fontSize: theme.fonts.size.md, fontWeight: '800' },
    badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: theme.radii.pill },
    badgeText: { fontSize: theme.fonts.size.xxs, fontWeight: '800', textTransform: 'capitalize' },
    consignee: { fontSize: theme.fonts.size.sm },
    rowBottom: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
    amountLabel: { fontSize: theme.fonts.size.xs, fontWeight: '600' },
    amountValue: { fontSize: theme.fonts.size.sm, fontWeight: '800', marginRight: 8 },
    rowChevron: { marginLeft: 'auto' },
    emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: theme.spacing.lg, paddingBottom: 80 },
    emptyTitle: { fontSize: theme.fonts.size.lg, fontWeight: '700' },
    emptyText: { fontSize: theme.fonts.size.sm, textAlign: 'center', lineHeight: 20, maxWidth: 300 },
    shimmerWrap: { position: 'absolute', top: 110, left: 0, right: 0, padding: theme.spacing.lg, gap: theme.spacing.sm },
    shimmerBlock: { borderRadius: theme.radii.lg },
  });

export default AdminShopHistoryScreen;
