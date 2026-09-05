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
          // `consignor` is the historical param name for the shop-identity
          // filter; the backend matches it against the GR's consignee (the
          // shop), case-insensitively. `shopName` is a normalized consignee.
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
          <Text style={[styles.grNumber, { color: colors.textPrimary }]} numberOfLines={1}>{item.orderNumber}</Text>
          <View style={[styles.badge, { backgroundColor: `${statusColor}18` }]}>
            <Text style={[styles.badgeText, { color: statusColor }]} numberOfLines={1}>{item.status}</Text>
          </View>
        </View>
        {/* Shop/owner name gets its own row and is allowed to wrap onto a
         * second line — `numberOfLines` + `wordBreak` keep an unbroken long
         * word (e.g. an Excel-imported name with no spaces) from overflowing
         * the card horizontally on web instead of just ellipsizing it. */}
        <Text
          style={[styles.consignee, { color: colors.textSecondary }]}
          numberOfLines={2}
          ellipsizeMode="tail"
        >
          {item.consigneeName || '—'}
        </Text>
        <View style={styles.rowBottom}>
          <View style={styles.amountsGroup}>
            <View style={styles.amountPair}>
              <Text style={[styles.amountLabel, { color: colors.textMuted }]}>To Pay</Text>
              <Text style={[styles.amountValue, { color: colors.textPrimary }]} numberOfLines={1}>{formatCurrency(Number(item.toPay ?? 0))}</Text>
            </View>
            {outstanding > 0 && (
              <View style={styles.amountPair}>
                <Text style={[styles.amountLabel, { color: colors.textMuted }]}>Outstanding</Text>
                <Text style={[styles.amountValue, { color: '#F97316' }]} numberOfLines={1}>{formatCurrency(outstanding)}</Text>
              </View>
            )}
          </View>
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

      {/* `listArea` is a normal in-flow flex:1 sibling that starts right
       * after the tabs — it's the ONLY thing the loading shimmer is
       * absolutely-positioned against (`top: 0` inside it), never the whole
       * screen. Previously the shimmer used a hardcoded `top: 110` guessed
       * to match Header + location + search + tabs — correct only for a
       * single-line shop name at one font scale; a wrapped (2-line) title or
       * any other height difference pushed real content down while the
       * shimmer stayed pinned at 110, so it landed over the tabs / first
       * card instead of below them. Anchoring to `listArea` instead removes
       * the guess entirely: whatever height the header/search/tabs actually
       * render at, `listArea` (and anything absolute inside it) always
       * starts right after them. */}
      <View style={styles.listArea}>
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
            style={styles.list}
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
          <View style={[styles.shimmerWrap, { backgroundColor: colors.background }]}>
            {[0, 1, 2].map((i) => (
              <ShimmerCard key={i} style={styles.shimmerBlock} height={96} />
            ))}
          </View>
        )}
      </View>
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
    // `paddingBottom` clears the bottom tab bar (60px + safe-area inset) so
    // the last card in the list is never left partially hidden behind it.
    listContent: { padding: theme.spacing.lg, gap: theme.spacing.sm, paddingBottom: 100 },
    row: { padding: theme.spacing.lg, gap: 6 },
    // `gap` (not `justifyContent: 'space-between'` alone) keeps the badge a
    // fixed distance from the GR number even if the number were ever wider
    // than expected; `flexShrink`/`minWidth: 0` on the number and
    // `flexShrink: 0` on the badge mean a width squeeze shrinks the number,
    // never the badge — the status must always stay fully visible.
    rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    grNumber: { fontSize: theme.fonts.size.md, fontWeight: '800', flexShrink: 1, minWidth: 0 },
    badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: theme.radii.pill, flexShrink: 0 },
    badgeText: { fontSize: theme.fonts.size.xxs, fontWeight: '800', textTransform: 'capitalize' },
    // Own row, allowed to wrap to 2 lines (see `numberOfLines` on the Text) —
    // never competes with the GR number/badge row or the amount row below.
    // `wordBreak`/`overflowWrap` are no-ops on native and only take effect on
    // web (react-native-web passes unknown Text style props straight through
    // as CSS) — without them, an unbroken long word (no spaces) overflows
    // the card horizontally on web instead of breaking inside itself.
    consignee: { fontSize: theme.fonts.size.sm, lineHeight: 18, wordBreak: 'break-word', overflowWrap: 'anywhere' } as any,
    // `justifyContent: 'space-between'` + `flexShrink: 0` on the chevron
    // keeps the arrow pinned and always visible; `amountsGroup` takes the
    // remaining space and is allowed to wrap so large amounts / long labels
    // never push the chevron off the card or overlap it.
    rowBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginTop: 4 },
    amountsGroup: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', flexShrink: 1, flexGrow: 1, gap: 12, rowGap: 4 },
    amountPair: { flexDirection: 'row', alignItems: 'baseline', gap: 6, flexShrink: 1 },
    amountLabel: { fontSize: theme.fonts.size.xs, fontWeight: '600' },
    amountValue: { fontSize: theme.fonts.size.sm, fontWeight: '800' },
    rowChevron: { flexShrink: 0 },
    // `flex: 1` + `position: 'relative'` — this is the positioning context
    // the loading shimmer overlay anchors to (see `shimmerWrap`), and what
    // gives the FlatList/empty-state a real bounded height to scroll within
    // instead of an unbounded/intrinsic one inside the column-flex screen.
    listArea: { flex: 1, position: 'relative' },
    list: { flex: 1 },
    emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: theme.spacing.lg, paddingBottom: 80 },
    emptyTitle: { fontSize: theme.fonts.size.lg, fontWeight: '700' },
    emptyText: { fontSize: theme.fonts.size.sm, textAlign: 'center', lineHeight: 20, maxWidth: 300 },
    // Anchored to `listArea` (its nearest positioned ancestor), not the
    // whole screen — `top: 0` here always lines up right after the tabs, no
    // matter how tall the header/search/tabs actually render.
    shimmerWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, padding: theme.spacing.lg, gap: theme.spacing.sm },
    shimmerBlock: { borderRadius: theme.radii.lg },
  });

export default AdminShopHistoryScreen;
