import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
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
import { useTranslation } from 'react-i18next';
import { useAppTheme } from '../../theme/useAppTheme';
import { Header } from '../../components/Header';
import { ShimmerCard } from '../../components/ShimmerCard';
import { useAppNav } from '../../hooks/useAppNav';
import { useUserStore } from '../../store/userStore';
import { orderRepository, type ShopCount } from '../../database/repositories/orderRepository';
import { matchArea } from '../../constants/areas';
import type { AppTheme } from '../../theme/types';

interface ShopFilters {
  minGr: number | null;
}

const NO_FILTERS: ShopFilters = { minGr: null };

const MIN_GR_OPTIONS: { value: number | null }[] = [
  { value: null },
  { value: 1 },
  { value: 5 },
  { value: 10 },
];

/** Display label for a minimum-GR option — only "Any" is localised; the rest
 *  ("1+", "5+"…) are numeric and language-neutral. */
const minGrLabel = (value: number | null, anyLabel: string): string =>
  value == null ? anyLabel : `${value}+`;

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
 * Search runs server-side (LIKE on `consignorName`). The Filter sheet offers
 * A Minimum-GR filter is applied client-side over the already area-scoped
 * results — no invented fields, counts always come from the query.
 *
 * Tapping a shop opens `StaffShopHistory` pinned to that shop — which again
 * forces the Staff area at the repository level.
 */
export const StaffAllShopsScreen = () => {
  const { t } = useTranslation();
  const { colors, spacing, radii, fonts, shadows } = useAppTheme();
  const { navigate, goBack } = useAppNav();
  const user = useUserStore((state) => state.user);
  const styles = createStyles({ colors, spacing, radii, fonts, shadows });

  const area = user?.area ? matchArea(user.area) : null;

  const [shops, setShops] = useState<ShopCount[]>([]);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<ShopFilters>(NO_FILTERS);
  const [tempFilters, setTempFilters] = useState<ShopFilters>(NO_FILTERS);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
      // No area assigned → nothing to query (security: never return all shops).
      if (!area) {
        setShops([]);
        setLoading(false);
        setRefreshing(false);
        return;
      }
      if (mode === 'refresh') setRefreshing(true);
      else setLoading(true);
      try {
        const rows = await orderRepository.getShopsWithCounts(search);
        if (mounted.current) setShops(rows);
      } catch (error) {
        console.error('Failed to load Staff All Shops:', error);
      } finally {
        if (mounted.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [area, search]
  );

  // Debounced load — avoids a network hit on every keystroke and keeps the
  // initial mount fetch (which sets state only inside the async call) out of
  // the synchronous effect body.
  useEffect(() => {
    const id = setTimeout(() => {
      load();
    }, 250);
    return () => clearTimeout(id);
  }, [load]);

  const displayedShops = useMemo(
    () =>
      shops.filter((s) => {
        if (filters.minGr != null && s.grCount < filters.minGr) return false;
        return true;
      }),
    [shops, filters]
  );

  const filtersActive = filters.minGr !== null;

  const closeSheet = () => setSheetVisible(false);

  const openSheet = () => {
    setTempFilters(filters);
    setSheetVisible(true);
  };

  const onApplyFilters = (next: ShopFilters) => {
    setFilters(next);
    closeSheet();
  };

  const onClearFilters = () => {
    setFilters(NO_FILTERS);
    closeSheet();
  };

  const clearOne = (key: keyof ShopFilters) =>
    setFilters((prev) => ({ ...prev, [key]: NO_FILTERS[key] }));

  if (!area) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <Header title={t('shops.title')} showBack onBack={goBack} />
        <View style={styles.unassignedWrap}>
          <Ionicons name="location-outline" size={48} color={colors.textMuted} />
          <Text style={[styles.unassignedTitle, { color: colors.textPrimary }]}>{t('staff.noAreaAssigned')}</Text>
          <Text style={[styles.unassignedText, { color: colors.textSecondary }]}>
            {t('staff.noAreaAssignedDesc')}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <Header title={t('shops.title')} showBack onBack={goBack} />

      <View style={styles.searchRow}>
        <View style={[styles.searchBar, { backgroundColor: colors.surface, borderRadius: radii.lg }]}>
          <Ionicons name="search-outline" size={18} color={colors.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: colors.textPrimary }]}
            placeholder={t('shops.search')}
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
        <TouchableOpacity
          style={[
            styles.filterBtn,
            { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm },
            filtersActive && { backgroundColor: colors.primary },
          ]}
          onPress={openSheet}
          accessibilityRole="button"
          accessibilityLabel={t('shops.filterA11y')}
        >
          <Ionicons name="filter-outline" size={20} color={filtersActive ? '#fff' : colors.primary} />
          {filtersActive && <View style={styles.filterDot} />}
        </TouchableOpacity>
      </View>

      <View style={styles.areaPill}>
        <Ionicons name="location-outline" size={14} color={colors.primary} />
        <Text style={[styles.areaPillText, { color: colors.textSecondary }]}>{t('staff.currentArea', { area })}</Text>
      </View>

      {filtersActive && (
        <View style={styles.activeFilters}>
          {filters.minGr != null && (
            <TouchableOpacity style={[styles.activeChip, { backgroundColor: `${colors.primary}15` }]} onPress={() => clearOne('minGr')}>
              <Text style={[styles.activeChipText, { color: colors.primary }]}>{t('shops.minGRsChip', { count: filters.minGr })}</Text>
              <Ionicons name="close" size={14} color={colors.primary} />
            </TouchableOpacity>
          )}
        </View>
      )}

      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load()}
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
        ) : displayedShops.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Ionicons name="storefront-outline" size={48} color={colors.textMuted} />
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
              {search || filtersActive ? t('shops.noShopsFound') : t('shops.noShopsYet')}
            </Text>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              {search || filtersActive
                ? t('shops.noShopsMatch', { area })
                : t('shops.noShopsInArea', { area })}
            </Text>
          </View>
        ) : (
          <View style={styles.shopList}>
            {displayedShops.map((shop) => (
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
                    {t('shops.totalGRs', { count: shop.grCount })}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>

      <ShopFilterSheet
        visible={sheetVisible}
        temp={tempFilters}
        onTempChange={setTempFilters}
        onApply={onApplyFilters}
        onClear={onClearFilters}
        onClose={closeSheet}
      />
    </SafeAreaView>
  );
};

const createStyles = (theme: Pick<AppTheme, 'colors' | 'spacing' | 'radii' | 'fonts' | 'shadows'>) =>
  StyleSheet.create({
    safe: { flex: 1 },
    container: { paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.md, paddingBottom: 40, gap: theme.spacing.sm },
    searchRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, marginHorizontal: theme.spacing.lg, marginTop: theme.spacing.sm },
    searchBar: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: theme.spacing.md, paddingVertical: 10 },
    searchInput: { flex: 1, fontSize: theme.fonts.size.md },
    filterBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    filterDot: { position: 'absolute', top: 8, right: 9, width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' },
    areaPill: { flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: theme.spacing.lg, marginTop: theme.spacing.sm },
    areaPillText: { fontSize: theme.fonts.size.xs, fontWeight: '700' },
    activeFilters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginHorizontal: theme.spacing.lg, marginTop: 4 },
    activeChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: theme.radii.pill },
    activeChipText: { fontSize: theme.fonts.size.xs, fontWeight: '700' },
    shopList: { gap: theme.spacing.sm },
    shimmerBlock: { borderRadius: theme.radii.lg },
    shopCard: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, padding: theme.spacing.lg },
    shopIconWrap: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    shopNameBlock: { flex: 1, gap: 2 },
    shopName: { fontSize: theme.fonts.size.md, fontWeight: '700' },
    shopSubtext: { fontSize: theme.fonts.size.xs, fontWeight: '600' },
    emptyWrap: { alignItems: 'center', gap: 8, paddingVertical: 60, paddingHorizontal: theme.spacing.lg },
    emptyTitle: { fontSize: theme.fonts.size.lg, fontWeight: '700' },
    emptyText: { fontSize: theme.fonts.size.sm, textAlign: 'center', lineHeight: 20, maxWidth: 300 },
    unassignedWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: theme.spacing.lg },
    unassignedTitle: { fontSize: theme.fonts.size.lg, fontWeight: '800' },
    unassignedText: { fontSize: theme.fonts.size.sm, textAlign: 'center', lineHeight: 20, maxWidth: 280 },
  });

interface ShopFilterSheetProps {
  visible: boolean;
  temp: ShopFilters;
  onTempChange: (filters: ShopFilters) => void;
  onApply: (filters: ShopFilters) => void;
  onClear: () => void;
  onClose: () => void;
}

const ShopFilterSheet = ({ visible, temp, onTempChange, onApply, onClear, onClose }: ShopFilterSheetProps) => {
  const { t } = useTranslation();
  const { colors, spacing, radii, fonts } = useAppTheme();
  const sheetStyles = createSheetStyles({ colors, spacing, radii, fonts });

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={sheetStyles.backdrop} onPress={onClose}>
        <Pressable style={sheetStyles.sheet}>
          <View style={sheetStyles.handle} />
          <Text style={[sheetStyles.title, { color: colors.textPrimary }]}>{t('shops.filterTitle')}</Text>

          <Text style={[sheetStyles.sectionLabel, { color: colors.textSecondary }]}>{t('shops.minimumGRs')}</Text>
          <View style={sheetStyles.chips}>
            {MIN_GR_OPTIONS.map((opt) => (
              <SheetChip
                key={String(opt.value)}
                label={minGrLabel(opt.value, t('common.any'))}
                active={temp.minGr === opt.value}
                onPress={() => onTempChange({ ...temp, minGr: opt.value })}
              />
            ))}
          </View>

          <View style={sheetStyles.footer}>
            <TouchableOpacity style={sheetStyles.clearBtn} onPress={onClear} accessibilityRole="button">
              <Text style={[sheetStyles.clearText, { color: colors.textSecondary }]}>{t('common.clear')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[sheetStyles.applyBtn, { backgroundColor: colors.primary }]} onPress={() => onApply(temp)} accessibilityRole="button">
              <Text style={sheetStyles.applyText}>{t('common.apply')}</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const SheetChip = ({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) => {
  const { colors, spacing, radii, fonts } = useAppTheme();
  const sheetStyles = createSheetStyles({ colors, spacing, radii, fonts });
  return (
    <TouchableOpacity
      style={[sheetStyles.chip, { borderRadius: radii.pill }, active ? sheetStyles.chipActive : sheetStyles.chipInactive]}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
    >
      <Text style={[sheetStyles.chipText, { fontSize: fonts.size.sm }, active ? sheetStyles.chipTextActive : sheetStyles.chipTextInactive]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
};

const createSheetStyles = (theme: Pick<AppTheme, 'colors' | 'spacing' | 'radii' | 'fonts'>) =>
  StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.4)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: theme.colors.surface, borderTopLeftRadius: theme.radii.xl, borderTopRightRadius: theme.radii.xl, paddingHorizontal: theme.spacing.lg, paddingBottom: 28, paddingTop: 10, gap: theme.spacing.sm },
    handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: theme.colors.border, alignSelf: 'center', marginBottom: theme.spacing.sm },
    title: { fontSize: theme.fonts.size.lg, fontWeight: '800', marginBottom: theme.spacing.xs },
    sectionLabel: { fontSize: theme.fonts.size.xs, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: theme.spacing.sm },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { paddingHorizontal: 16, paddingVertical: 8, borderWidth: 1 },
    chipActive: { backgroundColor: '#635BFF', borderColor: '#635BFF' },
    chipInactive: { backgroundColor: 'transparent', borderColor: theme.colors.border },
    chipText: { fontWeight: '700' },
    chipTextActive: { color: '#FFFFFF' },
    chipTextInactive: { color: theme.colors.textSecondary },
    footer: { flexDirection: 'row', gap: theme.spacing.sm, marginTop: theme.spacing.lg },
    clearBtn: { flex: 1, paddingVertical: 14, borderRadius: theme.radii.lg, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.background },
    clearText: { fontSize: theme.fonts.size.md, fontWeight: '700' },
    applyBtn: { flex: 2, paddingVertical: 14, borderRadius: theme.radii.lg, alignItems: 'center', justifyContent: 'center' },
    applyText: { fontSize: theme.fonts.size.md, fontWeight: '800', color: '#FFFFFF' },
  });

export default StaffAllShopsScreen;
