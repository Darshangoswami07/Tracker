import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { AppStateStatus } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAppTheme } from '../../theme/useAppTheme';
import { useAppNav } from '../../hooks/useAppNav';
import { useUserStore } from '../../store/userStore';
import { useAuthStore } from '../../store/authStore';
import { orderRepository } from '../../database/repositories/orderRepository';
import { grRealtime } from '../../services/grRealtime';
import { Header } from '../../components/Header';
import type { AppTheme } from '../../theme/types';

interface Overview {
  assigned: number;
  pending: number;
  delivered: number;
  cleared: number;
  uncleared: number;
  outstanding: number;
  todayCollection: number;
}

/** The five clickable status cards. `status` is the value handed to My Slips
 * (`'all'` = All Statuses); order matches the canonical reporting buckets. */
const STAT_CARDS = [
  { key: 'assigned', status: 'all', color: '#635BFF' },
  { key: 'pending', status: 'pending', color: '#F59E0B' },
  { key: 'delivered', status: 'delivered', color: '#10B981' },
  { key: 'cleared', status: 'cleared', color: '#0EA5E9' },
  { key: 'uncleared', status: 'uncleared', color: '#EF4444' },
] as const;

const formatCurrency = (amount: number): string =>
  `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

/**
 * Staff's home screen — welcome header, today's delivery overview (counts
 * derived from the same local `orderRepository` the Deliveries tab reads),
 * and quick actions that jump straight into the Deliveries tab.
 */
export const StaffDashboardScreen = () => {
  const { t } = useTranslation();
  const { colors, spacing, radii, fonts, shadows } = useAppTheme();
  const { navigate, navigation } = useAppNav();
  const user = useUserStore((state) => state.user);
  const refreshUser = useAuthStore((state) => state.refreshUser);
  const styles = createStyles({ colors, spacing, radii, fonts, shadows });

  const [overview, setOverview] = useState<Overview>({ assigned: 0, pending: 0, delivered: 0, cleared: 0, uncleared: 0, outstanding: 0, todayCollection: 0 });
  const [refreshing, setRefreshing] = useState(false);

  // Counts come from ONE server-side aggregate (`GET
  // /admin/orders/meta/status-counts`), scoped by the auth token to *this*
  // Staff member's own GRs — assignment (`Order.assignedStaffId`) OR area
  // routing, matching "My Slips" exactly (backend `resolve_gr_staff_scope`).
  // `assigned` is the unfiltered total of the staff's GRs; `pending` /
  // `delivered` / `cleared` / `uncleared` are the canonical reporting buckets
  // (backend `gr_status_service`). Independent of any list search/filter/
  // pagination and of today's date — never `slips.length`.
  const loadOverview = useCallback(async () => {
    if (!user?.id) return;
    try {
      const [counts, receiving, dailyCollection] = await Promise.all([
        orderRepository.getStatusCounts(),
        orderRepository.getReceivingOverview(),
        orderRepository.getStaffDailyCollection(user.id, new Date().toISOString()),
      ]);
      setOverview({
        assigned: counts.total,
        pending: counts.pending,
        delivered: counts.delivered,
        cleared: counts.cleared,
        uncleared: counts.uncleared,
        outstanding: receiving.outstanding,
        todayCollection: dailyCollection.totalCollection,
      });
    } catch (error) {
      // Keep the last good counts on a transient failure — never overwrite
      // real numbers with zeros. The next focus/foreground/pull refreshes.
      console.error('Failed to load Staff dashboard overview:', error);
    }
  }, [user?.id]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadOverview();
      // Backend (not the login-time cache) is the source of truth for the
      // staff's current area assignment — an Admin can reassign it at any
      // time from the web/admin portal while this session stays logged in.
      void refreshUser();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadOverview, refreshUser]);

  // Re-load every time this screen regains focus — e.g. coming back here
  // after receiving a payment (which can flip a GR from Pending to
  // Delivered) on another screen. Without this, the stats stayed frozen at
  // whatever they were on the last mount/pull-to-refresh, showing stale
  // Pending/Completed counts instead of the current real ones. Also
  // refreshes the user profile here so a location reassignment made by an
  // Admin while Staff was on another tab/screen shows up as soon as they
  // return to the Dashboard. `didMount` skips the first 'focus' (React
  // Navigation fires it on initial mount too, which would otherwise double
  // the mount effect's own load).
  const didMount = useRef(false);
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      if (!didMount.current) {
        didMount.current = true;
        return;
      }
      loadOverview();
      void refreshUser();
    });
    return unsubscribe;
  }, [navigation, loadOverview, refreshUser]);

  // Also refresh on app foreground — covers the case where an Admin
  // reassigns GRs / changes the staff's location while this device's app is
  // backgrounded (not just navigated away from within the app), without
  // resorting to polling. Re-pulls both the profile and the dashboard counts.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        void refreshUser();
        void loadOverview();
      }
    });
    return () => subscription.remove();
  }, [refreshUser, loadOverview]);

  // Live counts: a GR assignment/deletion (`gr.deleted`), a status change, or
  // a payment that flips Delivered → Cleared arrives on the shared realtime
  // feed → one debounced re-pull of the same aggregate. No polling.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsub = grRealtime.subscribe(() => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        void loadOverview();
      }, 400);
    });
    return () => {
      unsub();
      if (timer) clearTimeout(timer);
    };
  }, [loadOverview]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadOverview();
    setRefreshing(false);
  };

  // Open "My Slips" with a status pre-selected. `filterNonce` forces the
  // target screen (kept mounted by the tab navigator) to re-apply the filter
  // even on a repeat tap of the same card.
  const openMySlips = (status: string, label: string) =>
    navigate('StaffDeliveries', { statusFilter: status, title: label, filterNonce: Date.now() });

  const firstName = user?.fullName?.split(' ')[0] || t('staff.there');

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
      <Header title={t('staff.dashboard')} />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#635BFF']} progressBackgroundColor={colors.surface} />}
      >
        <Text style={[styles.welcome, { color: colors.textPrimary }]}>{t('staff.welcome', { name: firstName })}</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{t('staff.todaysOverview')}</Text>

        <View style={styles.statsGrid}>
          {STAT_CARDS.map((card) => {
            const label = t(`staff.${card.key}`);
            const title = card.key === 'assigned' ? t('staff.mySlips') : `${label} Slips`;
            return (
              <TouchableOpacity
                key={card.key}
                style={[styles.statCard, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}
                onPress={() => openMySlips(card.status, title)}
                accessibilityRole="button"
                accessibilityLabel={`${overview[card.key]} ${label}. Open in My Slips.`}
                activeOpacity={0.7}
              >
                <Text style={[styles.statValue, { color: card.color }]}>{overview[card.key]}</Text>
                <View style={styles.statLabelRow}>
                  <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{label}</Text>
                  <Ionicons name="chevron-forward" size={12} color={colors.textMuted} />
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {user?.area && (
          <View style={[styles.outstandingCard, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}>
            <View style={styles.outstandingLeft}>
              <Ionicons name="location-outline" size={16} color={colors.primary} />
              <Text style={[styles.outstandingArea, { color: colors.textSecondary }]}>{user.area}</Text>
            </View>
            <View>
              <Text style={[styles.outstandingValue, { color: '#F97316' }]}>{formatCurrency(overview.outstanding)}</Text>
              <Text style={[styles.outstandingLabel, { color: colors.textMuted }]}>{t('staff.outstanding')}</Text>
            </View>
          </View>
        )}

        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{t('staff.quickActions')}</Text>
        <View style={styles.actionsGrid}>
          <TouchableOpacity
            style={[styles.actionCard, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}
            onPress={() => navigate('StaffAllShops')}
            accessibilityRole="button"
          >
            <View style={[styles.actionIcon, { backgroundColor: '#635BFF18' }]}>
              <Ionicons name="storefront-outline" size={22} color="#635BFF" />
            </View>
            <Text style={[styles.actionLabel, { color: colors.textPrimary }]}>{t('staff.allShops')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionCard, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}
            onPress={() => openMySlips('all', t('staff.mySlips'))}
            accessibilityRole="button"
          >
            <View style={[styles.actionIcon, { backgroundColor: '#06B6D418' }]}>
              <Ionicons name="documents-outline" size={22} color="#06B6D4" />
            </View>
            <Text style={[styles.actionLabel, { color: colors.textPrimary }]}>{t('staff.mySlips')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionCard, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}
            onPress={() => openMySlips('pending', t('staff.pendingSlip'))}
            accessibilityRole="button"
          >
            <View style={[styles.actionIcon, { backgroundColor: '#F59E0B18' }]}>
              <Ionicons name="time-outline" size={22} color="#F59E0B" />
            </View>
            <Text style={[styles.actionLabel, { color: colors.textPrimary }]}>{t('staff.pendingSlip')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionCard, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}
            onPress={() => openMySlips('delivered', t('staff.deliveredSlip'))}
            accessibilityRole="button"
          >
            <View style={[styles.actionIcon, { backgroundColor: '#10B98118' }]}>
              <Ionicons name="checkmark-done-outline" size={22} color="#10B981" />
            </View>
            <Text style={[styles.actionLabel, { color: colors.textPrimary }]}>{t('staff.deliveredSlip')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionCard, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}
            onPress={() => navigate('StaffDailyCollection')}
            accessibilityRole="button"
          >
            <View style={[styles.actionIcon, { backgroundColor: '#10B98118' }]}>
              <Ionicons name="wallet-outline" size={22} color="#10B981" />
            </View>
            <Text style={[styles.actionValue, { color: '#10B981' }]}>{formatCurrency(overview.todayCollection)}</Text>
            <Text style={[styles.actionLabel, { color: colors.textPrimary }]}>{t('staff.dailyCollection')}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const createStyles = (theme: Pick<AppTheme, 'colors' | 'spacing' | 'radii' | 'fonts' | 'shadows'>) =>
  StyleSheet.create({
    safe: { flex: 1 },
    scrollContent: { padding: theme.spacing.lg, paddingBottom: theme.spacing.huge, gap: theme.spacing.lg },
    welcome: { fontSize: theme.fonts.size.xl, fontWeight: '800', letterSpacing: -0.3 },
    subtitle: { fontSize: theme.fonts.size.sm, marginTop: -theme.spacing.sm },
    statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.md },
    statCard: {
      flexGrow: 1, flexBasis: '46%', minWidth: 150,
      alignItems: 'center', paddingVertical: theme.spacing.lg, gap: 4,
    },
    statValue: { fontSize: theme.fonts.size.xxl, fontWeight: '900' },
    statLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    statLabel: { fontSize: theme.fonts.size.xs, fontWeight: '600' },
    outstandingCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.md },
    outstandingLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    outstandingArea: { fontSize: theme.fonts.size.sm, fontWeight: '700' },
    outstandingValue: { fontSize: theme.fonts.size.lg, fontWeight: '800', textAlign: 'right' },
    outstandingLabel: { fontSize: theme.fonts.size.xs, fontWeight: '600', textAlign: 'right' },
    sectionTitle: { fontSize: theme.fonts.size.md, fontWeight: '800' },
    actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.md },
    actionCard: { flexGrow: 1, minWidth: 140, alignItems: 'center', paddingVertical: theme.spacing.lg, gap: theme.spacing.sm },
    actionIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    actionLabel: { fontSize: theme.fonts.size.sm, fontWeight: '700', textAlign: 'center' },
    actionValue: { fontSize: theme.fonts.size.md, fontWeight: '800', marginTop: -4 },
  });

export default StaffDashboardScreen;
