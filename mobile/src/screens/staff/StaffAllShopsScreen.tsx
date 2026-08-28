import { useCallback, useEffect, useState } from 'react';
import {
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
import { useUserStore } from '../../store/userStore';
import { orderRepository, type ShopCount } from '../../database/repositories/orderRepository';
import { matchArea } from '../../constants/areas';
import type { AppTheme } from '../../theme/types';

/**
 * Staff Dashboard → "All Shops".
 *
 * Lists every shop (i.e. distinct `consignorName`) that has at least one
 * active GR in the signed-in Staff member's OWN assigned area, with a live
 * GR count per shop. The area restriction is enforced server-side in
 * `orderRepository.getShopsWithCounts` via `resolveAreaScope`, so a Staff
 * user can never see shops from another area, and an unassigned Staff member
 * (no area) sees the "No area assigned" state instead of any data.
 *
 * Tapping a shop opens `StaffShopHistory` pinned to that shop — which again
 * forces the Staff area at the repository level.
 */
export const StaffAllShopsScreen = () => {
  const { colors, spacing, radii, fonts, shadows } = useAppTheme();
  const { navigate } = useAppNav();
  const user = useUserStore((state) => state.user);
  const styles = createStyles({ colors, spacing, radii, fonts, shadows });

  const area = user?.area ? matchArea(user.area) : null;

  const [shops, setShops] = useState<ShopCount[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    // No area assigned → nothing to query (security: never return all shops).
    if (!area) {
      setShops([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    if (mode === 'initial') setLoading(true);
    if (mode === 'refresh') setRefreshing(true);
    try {
      const rows = await orderRepository.getShopsWithCounts(search);
      setShops(rows);
    } catch (error) {
      console.error('Failed to load Staff All Shops:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [area, search]);

  useEffect(() => {
    if (!area) return;
    load('initial');
  }, [area, load]);

  if (!area) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <Header title="All Shops" />
        <View style={styles.unassignedWrap}>
          <Ionicons name="location-outline" size={48} color={colors.textMuted} />
          <Text style={[styles.unassignedTitle, { color: colors.textPrimary }]}>No area assigned</Text>
          <Text style={[styles.unassignedText, { color: colors.textSecondary }]}>
            Your account has no delivery area yet. Ask an admin to assign one so you can view shops.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <Header title="All Shops" />

      <View style={[styles.searchBar, { backgroundColor: colors.surface, borderRadius: radii.lg }]}>
        <Ionicons name="search-outline" size={18} color={colors.textMuted} />
        <TextInput
          style={[styles.searchInput, { color: colors.textPrimary }]}
          placeholder="Search shops"
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

      <View style={styles.areaPill}>
        <Ionicons name="location-outline" size={14} color={colors.primary} />
        <Text style={[styles.areaPillText, { color: colors.textSecondary }]}>Current Area: {area}</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load('refresh')}
            colors={['#635BFF']}
            progressBackgroundColor={colors.surface}
          />
        }
      >
        {loading ? (
          <View style={styles.shopList}>
            {[0, 1, 2, 3].map((i) => (
              <ShimmerCard key={i} style={styles.shimmerBlock} height={72} />
            ))}
          </View>
        ) : shops.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Ionicons name="storefront-outline" size={48} color={colors.textMuted} />
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
              {search ? 'No shops found' : 'No shops yet'}
            </Text>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              {search
                ? `No shops in ${area} match "${search}".`
                : `There are no shops with GRs in ${area} yet.`}
            </Text>
          </View>
        ) : (
          <View style={styles.shopList}>
            {shops.map((shop) => (
              <TouchableOpacity
                key={shop.name}
                style={[styles.shopCard, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}
                onPress={() => navigate('StaffShopHistory', { shopName: shop.name })}
                activeOpacity={0.85}
                accessibilityRole="button"
              >
                <View style={[styles.shopIconWrap, { backgroundColor: `${colors.primary}15`, borderRadius: radii.md }]}>
                  <Ionicons name="storefront-outline" size={24} color={colors.primary} />
                </View>
                <View style={styles.shopNameBlock}>
                  <Text style={[styles.shopName, { color: colors.textPrimary }]} numberOfLines={1}>
                    {shop.name}
                  </Text>
                  <Text style={[styles.shopSubtext, { color: colors.textMuted }]}>
                    {shop.grCount} {shop.grCount === 1 ? 'GR' : 'GRs'}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const createStyles = (theme: Pick<AppTheme, 'colors' | 'spacing' | 'radii' | 'fonts' | 'shadows'>) =>
  StyleSheet.create({
    safe: { flex: 1 },
    container: { paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.md, paddingBottom: 40, gap: theme.spacing.sm },
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
    shopList: { gap: theme.spacing.sm },
    shimmerBlock: { borderRadius: theme.radii.lg },
    shopCard: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, padding: theme.spacing.lg },
    shopIconWrap: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    shopNameBlock: { flex: 1, gap: 2 },
    shopName: { fontSize: theme.fonts.size.md, fontWeight: '700' },
    shopSubtext: { fontSize: theme.fonts.size.xs, fontWeight: '600' },
    emptyWrap: { alignItems: 'center', gap: 8, paddingVertical: 60, paddingHorizontal: theme.spacing.lg },
    emptyTitle: { fontSize: theme.fonts.size.lg, fontWeight: '700' },
    emptyText: { fontSize: theme.fonts.size.sm, textAlign: 'center', lineHeight: 20 },
    unassignedWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: theme.spacing.lg },
    unassignedTitle: { fontSize: theme.fonts.size.lg, fontWeight: '800' },
    unassignedText: { fontSize: theme.fonts.size.sm, textAlign: 'center', lineHeight: 20, maxWidth: 280 },
  });

export default StaffAllShopsScreen;
