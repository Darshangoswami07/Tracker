import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/useAppTheme';
import { Header } from '../../components/Header';
import { ShimmerCard } from '../../components/ShimmerCard';
import { useAppNav } from '../../hooks/useAppNav';
import { useTranslation } from 'react-i18next';
import { AREAS, type Area } from '../../constants/areas';
import { orderRepository, type ShopSummary } from '../../database/repositories/orderRepository';
import type { AppTheme } from '../../theme/types';

const AREA_ICONS: Record<Area, keyof typeof Ionicons.glyphMap> = {
  Bageshwar: 'leaf-outline',
  Almora: 'business-outline',
  'Garur Someshwar': 'car-outline',
};

const AREA_COLORS: Record<Area, string> = {
  Bageshwar: '#635BFF',
  Almora: '#10B981',
  'Garur Someshwar': '#F59E0B',
};

const EMPTY_SUMMARY: Omit<ShopSummary, 'area'> = {
  total: 0, pending: 0, cleared: 0, uncleared: 0, delivered: 0,
  totalToPay: 0, totalCollected: 0, outstanding: 0,
};

const formatCurrency = (amount: number): string =>
  `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

/**
 * Dashboard → Quick Actions → All Shops.
 *
 * Lists the three fixed shop/area categories with live GR counts pulled from
 * the on-device `orders` table (grouped by the `area` column that Excel
 * import already assigns per-row from Consignee Name — see
 * `services/excelImport.ts`). Tapping a shop opens `GRShipments` pinned to
 * that area (`fixedArea`), reusing the existing GR list screen instead of a
 * separate implementation.
 */
export const AdminAllShopsScreen = () => {
  const { colors, spacing, radii, fonts, shadows } = useAppTheme();
  const { goBack, navigate, navigation } = useAppNav();
  const { t } = useTranslation();

  const styles = createStyles({ colors, spacing, radii, fonts, shadows });

  const [summaries, setSummaries] = useState<Record<string, ShopSummary>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    if (mode === 'initial') setLoading(true);
    if (mode === 'refresh') setRefreshing(true);
    try {
      const rows = await orderRepository.getShopsOverview();
      const byArea: Record<string, ShopSummary> = {};
      for (const row of rows) byArea[row.area] = row;
      setSummaries(byArea);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load('initial');
  }, [load]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => load('refresh'));
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <Header title={t('shops.title', 'All Shops')} leftAction={{ icon: 'chevron-back', onPress: goBack }} />

      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load('refresh')} colors={['#635BFF']} progressBackgroundColor={colors.surface} />}
      >
        <View style={[styles.infoCard, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}>
          <Ionicons name="information-circle-outline" size={20} color={colors.primary} />
          <Text style={[styles.infoText, { color: colors.textSecondary }]}>
            {t('shops.info', 'GRs are grouped by shop, matched automatically from the Consignee Name during Excel import.')}
          </Text>
        </View>

        {loading ? (
          <View style={styles.shopList}>
            {AREAS.map((area) => (
              <ShimmerCard key={area} style={styles.shimmerBlock} height={92} />
            ))}
          </View>
        ) : (
          <View style={styles.shopList}>
            {AREAS.map((area) => {
              const summary = summaries[area] ?? { area, ...EMPTY_SUMMARY };
              return (
                <TouchableOpacity
                  key={area}
                  style={[styles.shopCard, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}
                  onPress={() => navigate('GRShipments', { fixedArea: area })}
                  activeOpacity={0.85}
                >
                  <View style={styles.shopCardTop}>
                    <View style={[styles.shopIconWrap, { backgroundColor: `${AREA_COLORS[area]}15`, borderRadius: radii.md }]}>
                      <Ionicons name={AREA_ICONS[area]} size={26} color={AREA_COLORS[area]} />
                    </View>
                    <View style={styles.shopNameBlock}>
                      <Text style={[styles.shopName, { color: colors.textPrimary }]}>{area}</Text>
                      <Text style={[styles.shopSubtext, { color: colors.textMuted }]}>
                        {t('shops.totalGRs', '{{count}} GRs', { count: summary.total })}
                        {summary.pending > 0 ? ` · ${t('shops.pendingCount', '{{count}} pending', { count: summary.pending })}` : ''}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                  </View>

                  {summary.total > 0 && (
                    <View style={[styles.shopStatsRow, { borderTopColor: colors.border }]}>
                      <View style={styles.shopStat}>
                        <Text style={[styles.shopStatValue, { color: '#10B981' }]}>{formatCurrency(summary.totalCollected)}</Text>
                        <Text style={[styles.shopStatLabel, { color: colors.textMuted }]}>{t('summary.totalCollected', 'Total Collected')}</Text>
                      </View>
                      <View style={styles.shopStat}>
                        <Text style={[styles.shopStatValue, { color: summary.outstanding > 0 ? '#F97316' : '#10B981' }]}>{formatCurrency(summary.outstanding)}</Text>
                        <Text style={[styles.shopStatLabel, { color: colors.textMuted }]}>{t('summary.outstanding', 'Outstanding')}</Text>
                      </View>
                      <View style={styles.shopStat}>
                        <Text style={[styles.shopStatValue, { color: '#10B981' }]}>{summary.delivered}</Text>
                        <Text style={[styles.shopStatLabel, { color: colors.textMuted }]}>{t('status.delivered')}</Text>
                      </View>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const createStyles = (theme: Pick<AppTheme, 'colors' | 'spacing' | 'radii' | 'fonts' | 'shadows'>) =>
  StyleSheet.create({
    safe: { flex: 1 },
    container: { paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.md, paddingBottom: 40, gap: theme.spacing.md },
    infoCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 14 },
    infoText: { flex: 1, fontSize: theme.fonts.size.sm, lineHeight: 20 },
    shopList: { gap: theme.spacing.sm },
    shimmerBlock: { borderRadius: theme.radii.lg },
    shopCard: { padding: theme.spacing.lg, gap: 10 },
    shopCardTop: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
    shopIconWrap: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
    shopNameBlock: { flex: 1, gap: 2 },
    shopName: { fontSize: theme.fonts.size.lg, fontWeight: '700' },
    shopSubtext: { fontSize: theme.fonts.size.xs, fontWeight: '600' },
    shopStatsRow: { flexDirection: 'row', paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
    shopStat: { flex: 1, alignItems: 'center', gap: 2 },
    shopStatValue: { fontSize: theme.fonts.size.sm, fontWeight: '800' },
    shopStatLabel: { fontSize: theme.fonts.size.xs, fontWeight: '600' },
  });

export default AdminAllShopsScreen;
