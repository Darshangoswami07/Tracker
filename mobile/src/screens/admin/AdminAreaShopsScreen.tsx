import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/useAppTheme';
import { Header } from '../../components/Header';
import { ShimmerCard } from '../../components/ShimmerCard';
import { EmptyState } from '../../components/EmptyState';
import { useAppNav } from '../../hooks/useAppNav';
import { orderRepository, type ShopCount } from '../../database/repositories/orderRepository';
import type { AppTheme } from '../../theme/types';

/**
 * All Shops → tap an area (Bageshwar/Almora/Garur Someshwar) → this screen.
 *
 * Lists every shop (distinct `consignorName`) with at least one active GR in
 * THIS area — however that GR was created (manual entry, slip upload, or
 * Excel import all stamp `consignorName`), so the list always reflects
 * exactly what's in the data, live. Area scoping happens server-side in
 * `orderRepository.getShopsWithCounts` (via `resolveAreaScope`), so this is
 * never wider than the area the admin tapped into.
 *
 * Tapping a shop opens `ShopHistory` pinned to that shop + area — that
 * screen's own list query is scoped the same way, so a shop's GR list can
 * never include another area's rows even if two areas happen to share a
 * shop/consignor name.
 */
export const AdminAreaShopsScreen = ({ route }: any) => {
  const { area } = (route?.params as { area: string }) ?? { area: '' };
  const { colors, spacing, radii, fonts, shadows } = useAppTheme();
  const { navigate, goBack } = useAppNav();
  const styles = createStyles({ colors, spacing, radii, fonts, shadows });

  const [shops, setShops] = useState<ShopCount[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
      if (mode === 'refresh') setRefreshing(true);
      else setLoading(true);
      try {
        const rows = await orderRepository.getShopsWithCounts(search || undefined, area);
        setShops(rows);
        setError(null);
      } catch {
        setError('Could not load shops for this area.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [area, search]
  );

  // Debounced — avoids a query per keystroke while searching.
  useEffect(() => {
    const id = setTimeout(() => load(), 250);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, area]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <Header title={area} leftAction={{ icon: 'chevron-back', onPress: goBack }} />

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

      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load('refresh')} colors={['#635BFF']} progressBackgroundColor={colors.surface} />}
      >
        {loading ? (
          <View style={styles.shopList}>
            {[0, 1, 2, 3].map((i) => (
              <ShimmerCard key={i} style={styles.shimmerBlock} height={72} />
            ))}
          </View>
        ) : error ? (
          <EmptyState
            icon="cloud-offline-outline"
            title="Something went wrong"
            subtitle={error}
            actionLabel="Retry"
            onActionPress={() => load()}
            iconColor={colors.error}
          />
        ) : shops.length === 0 ? (
          <EmptyState
            icon="storefront-outline"
            title={search ? 'No shops found' : 'No shops yet'}
            subtitle={search ? `No shops in ${area} match your search.` : `There are no shops with GRs in ${area} yet.`}
          />
        ) : (
          <View style={styles.shopList}>
            {shops.map((shop) => (
              <TouchableOpacity
                key={shop.name}
                style={[styles.shopCard, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}
                onPress={() => navigate('ShopHistory', { shopName: shop.name, area })}
                activeOpacity={0.85}
                accessibilityRole="button"
              >
                <View style={[styles.shopIconWrap, { backgroundColor: `${colors.primary}15`, borderRadius: radii.md }]}>
                  <Ionicons name="storefront-outline" size={22} color={colors.primary} />
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
    container: { paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.md, paddingBottom: 40, gap: theme.spacing.sm },
    shopList: { gap: theme.spacing.sm },
    shimmerBlock: { borderRadius: theme.radii.lg },
    shopCard: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, padding: theme.spacing.lg },
    shopIconWrap: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    shopNameBlock: { flex: 1, gap: 2 },
    shopName: { fontSize: theme.fonts.size.md, fontWeight: '700' },
    shopSubtext: { fontSize: theme.fonts.size.xs, fontWeight: '600' },
  });

export default AdminAreaShopsScreen;
