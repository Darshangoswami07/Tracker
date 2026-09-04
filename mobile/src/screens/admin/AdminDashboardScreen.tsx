import { useEffect, useRef, useState, useCallback, type ComponentProps } from 'react';
import { Animated, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/useAppTheme';
import { useAuthStore } from '../../store/authStore';
import { useUserStore } from '../../store/userStore';
import { api } from '../../api/client';
import { orderRepository, type ActivityEvent } from '../../database/repositories/orderRepository';
import { StatCard } from '../../components/StatCard';
import { Header } from '../../components/Header';
import { ShimmerCard } from '../../components/ShimmerCard';
import { ActivityItem } from '../../components/ActivityItem';
import { EmptyState } from '../../components/EmptyState';
import { StatusBadge } from '../../components/StatusBadge';
import { useAppNav } from '../../hooks/useAppNav';
import { useTranslation } from 'react-i18next';
import { grRealtime, type GrEvent } from '../../services/grRealtime';
import type { AppTheme } from '../../theme/types';

interface RevenueOverview {
  today: number;
  yesterday: number;
  week: number;
  prevWeek: number;
  month: number;
  prevMonth: number;
  totalCollected: number;
  // Money paid straight to the Admin/owner via UPI (receivedBy=ADMIN,
  // paymentMode=UPI) — never counted as staff collection. Replaces "Total
  // Collected" on this card row.
  directUpiReceived: number;
  outstandingAmount: number;
  collectedGRCount: number;
  outstandingGRCount: number;
  collectedThisMonth: number;
  collectedPrevMonth: number;
}

interface AdminStats {
  totalOrders: number;
  pendingApprovals: number;
  onlineUsers: number;
  systemHealth: 'healthy' | 'degraded' | 'critical';
}

interface ShipmentOverview {
  total: number;
  pending: number;
  cleared: number;
  uncleared: number;
  delivered: number;
}

interface RecentActivity {
  id: string;
  type: string;
  title: string;
  description: string;
  timestamp: string;
}

/** Human-readable GR status labels, matching `StaffGRPanelScreen`/`StatusBadge`. */
const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  cleared: 'Cleared',
  uncleared: 'Uncleared',
  delivered: 'Delivered',
};

const ACTIVITY_TYPE_FOR_STATUS: Record<string, string> = {
  pending: 'order_pending',
  cleared: 'order_cleared',
  uncleared: 'order_uncleared',
  delivered: 'order_delivered',
};

const TITLE_FOR_STATUS: Record<string, string> = {
  pending: 'GR Pending',
  cleared: 'GR Cleared',
  uncleared: 'GR Uncleared',
  delivered: 'GR Delivered',
};

const humanizeStatus = (status: string): string => STATUS_LABELS[status] ?? status.replace(/_/g, ' ');

/** Turns a real GR/shipment event (status history row or slip upload) into
 * the title/description shape `ActivityItem` renders. */
const describeActivity = (event: ActivityEvent, t: (key: string) => string): RecentActivity => {
  if (event.kind === 'created') {
    return {
      id: event.id,
      type: 'order_created',
      title: t('dashboard.grCreated'),
      description: `GR #${event.orderNumber} was created`,
      timestamp: event.createdAt,
    };
  }
  if (event.kind === 'upload') {
    return {
      id: event.id,
      type: 'slip_uploaded',
      title: t('dashboard.slipUploaded'),
      description: `Slip uploaded for GR #${event.orderNumber}`,
      timestamp: event.createdAt,
    };
  }
  const status = event.status ?? 'pending';
  const label = humanizeStatus(status);
  const prevLabel = event.previousStatus ? humanizeStatus(event.previousStatus) : null;
  return {
    id: event.id,
    type: ACTIVITY_TYPE_FOR_STATUS[status] ?? 'order_pending',
    title: TITLE_FOR_STATUS[status] ?? `GR ${label}`,
    description:
      prevLabel && prevLabel !== label
        ? `GR #${event.orderNumber} changed from ${prevLabel} → ${label}`
        : `GR #${event.orderNumber} status updated to ${label}`,
    timestamp: event.createdAt,
  };
};

const formatINR = (amount: number): string => {
  const absAmount = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  const formatted = absAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 });
  return `${sign}₹${formatted}`;
};

/** A plain rupee difference ("+₹150", "-₹50") instead of a percentage.
 * Percentage change swings wildly and misleadingly when the comparison base
 * is small or zero (e.g. ₹0 → ₹50 reads as "+100%", ₹50 → ₹0 as "-100%",
 * neither of which tells an admin anything useful) — an absolute amount is
 * immediately understandable without doing math. Returns null when there's
 * nothing meaningful to compare (both periods are zero). */
const getAmountDelta = (current: number, previous: number): { value: number; displayText: string } | null => {
  const diff = current - previous;
  if (current === 0 && previous === 0) return null;
  const sign = diff > 0 ? '+' : diff < 0 ? '-' : '';
  return { value: diff, displayText: `${sign}${formatINR(Math.abs(diff))}` };
};

const getGreeting = (t: (key: string) => string): string => {
  const hour = new Date().getHours();
  if (hour < 12) return t('dashboard.greeting.morning');
  if (hour < 18) return t('dashboard.greeting.afternoon');
  return t('dashboard.greeting.evening');
};

const firstNameOf = (fullName?: string): string => (fullName ?? '').trim().split(/\s+/)[0] || 'there';

export const AdminDashboardScreen = () => {
  const { colors, spacing, radii, fonts, shadows } = useAppTheme();
  const accessToken = useAuthStore((state) => state.accessToken);
  const user = useUserStore((state) => state.user);
  const isSuperAdmin = user?.role === 'super_admin';
  const { t } = useTranslation();
  const { goToNotifications, navigate, navigation } = useAppNav();

  const styles = createStyles({ colors, spacing, radii, fonts, shadows });

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [revenue, setRevenue] = useState<RevenueOverview>({
    today: 0,
    yesterday: 0,
    week: 0,
    prevWeek: 0,
    month: 0,
    prevMonth: 0,
    totalCollected: 0,
    directUpiReceived: 0,
    outstandingAmount: 0,
    collectedGRCount: 0,
    outstandingGRCount: 0,
    collectedThisMonth: 0,
    collectedPrevMonth: 0,
  });
  const [revenueStatus, setRevenueStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [activities, setActivities] = useState<RecentActivity[]>([]);
  const [activityStatus, setActivityStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [shipmentOverview, setShipmentOverview] = useState<ShipmentOverview>({ total: 0, pending: 0, cleared: 0, uncleared: 0, delivered: 0 });
  const [todayCollection, setTodayCollection] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fadeAnim] = useState(new Animated.Value(0));
  const [slideAnim] = useState(new Animated.Value(50));

  const fetchStats = useCallback(async () => {
    if (!accessToken) return;
    try {
      const statsRes = await api.get('/admin/dashboard/stats', { headers: { Authorization: `Bearer ${accessToken}` } });
      const d = statsRes.data.data;
      setStats({
        totalOrders: d.totalOrders ?? 0,
        pendingApprovals: d.pendingApprovals ?? 0,
        onlineUsers: d.onlineUsers ?? 0,
        systemHealth: d.systemHealth ?? 'healthy',
      });
    } catch (error) {
      console.error('Failed to fetch admin dashboard stats:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [accessToken]);

  const fetchRevenue = useCallback(async () => {
    setRevenueStatus('loading');
    try {
      const data = await orderRepository.getRevenueOverview();
      setRevenue(data);
      setRevenueStatus('success');
    } catch (error) {
      console.error('Failed to fetch revenue overview:', error);
      setRevenueStatus('error');
    }
  }, []);

  // Recent Activity is real GR/shipment history (status transitions + slip
  // uploads) read from the backend (`/admin/orders/meta/activity`, Neon) —
  // the same source the GR list / Customer Tracking / GR Tracker screens use
  // — not the backend's email-notification log, which isn't meaningful
  // operational activity.
  const fetchActivity = useCallback(async () => {
    setActivityStatus('loading');
    try {
      const events = await orderRepository.listRecentActivity(8);
      setActivities(events.map(e => describeActivity(e, t)));
      setActivityStatus('success');
    } catch (error) {
      console.error('Failed to load recent activity:', error);
      setActivityStatus('error');
    }
  }, [t]);

  // Guards against an in-flight request that resolves AFTER a newer one —
  // e.g. rapid consecutive status changes each trigger a refetch; only the
  // response for the most recently issued request is allowed to land.
  const shipmentOverviewReqId = useRef(0);
  const fetchShipmentOverview = useCallback(async () => {
    const reqId = ++shipmentOverviewReqId.current;
    try {
      // Canonical reporting counts from ONE server-side aggregate query over
      // Neon — the exact same classification the GR / Shipments screen shows
      // (backend `app/services/gr_status_service.py`). No client-side maths,
      // and not capped at one page.
      const sc = await orderRepository.getStatusCounts();
      if (reqId !== shipmentOverviewReqId.current) return; // superseded by a later fetch
      setShipmentOverview({
        total: sc.total,
        pending: sc.pending,
        cleared: sc.cleared,
        uncleared: sc.uncleared,
        delivered: sc.delivered,
      });
    } catch (error) {
      console.error('Failed to load shipment overview:', error);
    }
  }, []);

  const fetchTodayCollection = useCallback(async () => {
    try {
      const amount = await orderRepository.getTodayCollection();
      setTodayCollection(amount);
    } catch (error) {
      console.error('Failed to load today collection:', error);
    }
  }, []);

  const fetchDashboardData = useCallback(() => {
    void fetchStats();
    void fetchRevenue();
    void fetchActivity();
    void fetchShipmentOverview();
    void fetchTodayCollection();
  }, [fetchStats, fetchRevenue, fetchActivity, fetchShipmentOverview, fetchTodayCollection]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchDashboardData();
  }, [fetchDashboardData]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchDashboardData();
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(slideAnim, { toValue: 0, duration: 600, useNativeDriver: Platform.OS !== 'web' }),
    ]).start();
  }, [fetchDashboardData, fadeAnim, slideAnim]);

  // Re-fetch every time this screen regains focus (separate from the mount
  // effect above so the intro fade/slide animation only ever plays once,
  // not on every tab switch back to Dashboard). Without this, the shipment
  // status counts / revenue / activity stayed frozen at whatever they were
  // on the last mount or manual pull-to-refresh — e.g. a GR that got paid
  // off (Pending → Delivered) on another screen wouldn't show up here until
  // a manual refresh. `didMount` skips the first 'focus' (React Navigation
  // fires it on initial mount too, which would otherwise double the mount
  // effect's own fetch) — same pattern as `AdminGRShipmentsScreen`.
  const didMountDashboard = useRef(false);
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      if (!didMountDashboard.current) {
        didMountDashboard.current = true;
        return;
      }
      fetchDashboardData();
    });
    return unsubscribe;
  }, [navigation, fetchDashboardData]);

  // Live status-card sync: same shared WebSocket (`services/grRealtime`) the
  // GR / Shipments screen uses. Root cause this fixes — before this effect,
  // the four status cards only refreshed on mount / pull-to-refresh / tab
  // 'focus', so a status change made without leaving/re-entering this screen
  // (or made by someone else while it sat in the background) stayed stale
  // until a manual refresh.
  //
  // Deliberately NOT optimistic here (unlike `AdminGRShipmentsScreen`, which
  // patches a card instantly from the event): that screen already holds each
  // GR's current `toPay`/`totalPaid` in its item cache, so it can compute the
  // exact new bucket. This screen only holds aggregate counts, and a plain
  // status-change event's `totalPaid` is `null` (the backend only recomputes
  // it on the payment path) — guessing the bucket here could show a count
  // that's briefly wrong, which the spec explicitly rules out. Instead every
  // relevant event schedules ONE debounced authoritative refetch, so the
  // cards land on the exact backend numbers within a fraction of a second and
  // never display an incorrect value. The debounce coalesces bursts of rapid
  // changes into a single request (no request storm), and the request-id
  // guard in `fetchShipmentOverview` stops a slow, stale response from
  // clobbering a newer one.
  const rtOverviewReloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleOverviewReload = useCallback(() => {
    if (rtOverviewReloadTimer.current) return;
    rtOverviewReloadTimer.current = setTimeout(() => {
      rtOverviewReloadTimer.current = null;
      void fetchShipmentOverview();
    }, 350);
  }, [fetchShipmentOverview]);

  useEffect(() => {
    const onEvent = (evt: GrEvent) => {
      if (evt.type === 'gr.status' || evt.type === 'gr.created' || evt.type === 'gr.deleted' || evt.type === 'resync') {
        scheduleOverviewReload();
      }
    };
    const unsub = grRealtime.subscribe(onEvent);
    return () => {
      unsub();
      if (rtOverviewReloadTimer.current) clearTimeout(rtOverviewReloadTimer.current);
    };
  }, [scheduleOverviewReload]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <Header title={t('admin.dashboard')} rightAction={{ icon: 'notifications-outline', onPress: goToNotifications }} />
        </View>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.revenueSection}>
            <ShimmerCard style={styles.sectionTitleShimmer} />
            <View style={styles.revenueGrid}>
              <View style={styles.revenueRow}>
                <ShimmerCard style={styles.revenueCardHalf} height={104} />
                <ShimmerCard style={styles.revenueCardHalf} height={104} />
              </View>
              <View style={styles.revenueRow}>
                <ShimmerCard style={styles.revenueCardHalf} height={104} />
                <ShimmerCard style={styles.revenueCardHalf} height={104} />
              </View>
              <View style={styles.revenueRow}>
                <ShimmerCard style={styles.revenueCardHalf} height={104} />
              </View>
            </View>
          </View>
          <View style={styles.sectionHeader}>
            <ShimmerCard style={styles.sectionTitleShimmer} />
          </View>
          <ShimmerCard style={styles.activityCardShimmer} height={80} />
          <ShimmerCard style={styles.activityCardShimmer} height={80} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  const getHealthConfig = (health: string): { color: string; label: string } => {
    switch (health) {
      case 'healthy': return { color: colors.success, label: t('dashboard.healthy') };
      case 'degraded': return { color: colors.warning, label: t('dashboard.degraded') };
      case 'critical': return { color: colors.error, label: t('dashboard.critical') };
      default: return { color: colors.textMuted, label: t('dashboard.unknown') };
    }
  };

  const healthConfig = getHealthConfig(stats?.systemHealth || 'healthy');

  const revenueCards: {
    title: string;
    value: string;
    icon: ComponentProps<typeof Ionicons>['name'];
    color: string;
    trend?: { value: number; label: string; isPercentage?: boolean };
    subtitle?: string;
  }[] = revenueStatus === 'error'
    ? []
    : [
    {
      title: t('dashboard.todaysRevenue'),
      value: formatINR(revenue.today),
      icon: 'today-outline',
      color: '#3B82F6',
      trend: (() => {
        const delta = getAmountDelta(revenue.today, revenue.yesterday);
        return delta ? { value: delta.value, label: t('dashboard.fromYesterday'), displayText: delta.displayText } : undefined;
      })(),
    },
    {
      title: t('dashboard.thisWeek'),
      value: formatINR(revenue.week),
      icon: 'calendar-outline',
      color: '#10B981',
      trend: (() => {
        const delta = getAmountDelta(revenue.week, revenue.prevWeek);
        return delta ? { value: delta.value, label: t('dashboard.fromLastWeek'), displayText: delta.displayText } : undefined;
      })(),
    },
    {
      title: t('dashboard.thisMonth'),
      value: formatINR(revenue.month),
      icon: 'calendar-number-outline',
      color: '#8B5CF6',
      trend: (() => {
        const delta = getAmountDelta(revenue.month, revenue.prevMonth);
        return delta ? { value: delta.value, label: t('dashboard.fromLastMonth'), displayText: delta.displayText } : undefined;
      })(),
    },
    {
      // Replaces "Total Collected" — money paid straight to the Admin/owner
      // via UPI (receivedBy=ADMIN, paymentMode=UPI only; see
      // `/admin/orders/meta/revenue-overview`'s `directUpiReceived`). A
      // normal staff UPI collection, or an Admin payment via cash/bank/
      // cheque, never contributes to this figure.
      title: t('dashboard.directUpiReceived'),
      value: formatINR(revenue.directUpiReceived),
      icon: 'wallet-outline',
      color: '#14B8A6',
      subtitle: t('dashboard.paidDirectlyToAdmin'),
    },
    {
      title: t('dashboard.outstanding'),
      value: formatINR(revenue.outstandingAmount),
      icon: 'time-outline',
      color: '#F59E0B',
      subtitle: `${revenue.outstandingGRCount} ${revenue.outstandingGRCount === 1 ? 'GR' : 'GRs'} pending`,
    },
  ];
  const revenueRows: (typeof revenueCards)[] = [];
  for (let i = 0; i < revenueCards.length; i += 2) revenueRows.push(revenueCards.slice(i, i + 2));

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <Animated.View style={styles.headerContainer}>
        <View style={styles.header}>
          <Header
            title={t('admin.dashboard')}
            leftAction={{ icon: 'person-circle-outline', onPress: () => navigate('Profile'), accessibilityLabel: 'Profile' }}
            rightAction={{ icon: 'notifications-outline', onPress: goToNotifications }}
          />
        </View>
        <Animated.View style={{ transform: [{ translateY: slideAnim }], opacity: fadeAnim }}>
          <View style={styles.welcomeSection}>
            <Text style={styles.welcomeTitle}>{getGreeting(t)}, {firstNameOf(user?.fullName)} 👋</Text>
            <View style={styles.summaryRow}>
              <View style={[styles.healthDot, { backgroundColor: healthConfig.color }]} />
              <Text style={styles.welcomeSubtitle}>
                {shipmentOverview.total.toLocaleString()} {t('dashboard.ordersCount')} · {shipmentOverview.pending} pending · {shipmentOverview.delivered} delivered
              </Text>
            </View>
          </View>
        </Animated.View>
      </Animated.View>

      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} progressBackgroundColor={colors.surface} />
        }
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={{ transform: [{ translateY: slideAnim }], opacity: fadeAnim }}>
          <View style={styles.revenueSection}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{t('dashboard.revenueOverview')}</Text>
            {revenueStatus === 'error' ? (
              <View style={styles.revenueError}>
                <Ionicons name="cloud-offline-outline" size={28} color={colors.error} />
                <Text style={[styles.revenueErrorText, { color: colors.textSecondary }]}>
                  {t('dashboard.failedToLoadRevenue')}
                </Text>
                <TouchableOpacity onPress={fetchRevenue} style={[styles.retryButton, { backgroundColor: colors.primary }]}>
                  <Text style={{ color: colors.onPrimary, fontWeight: '700', fontSize: 13 }}>{t('common.retry')}</Text>
                </TouchableOpacity>
              </View>
            ) : (
            <View style={styles.revenueGrid}>
              {revenueRows.map((row, rowIndex) => (
                <View key={rowIndex} style={styles.revenueRow}>
                  {row.map((card) => (
                    <View key={card.title} style={styles.revenueCardHalf}>
                      <StatCard title={card.title} value={card.value} icon={card.icon} color={card.color} trend={card.trend} subtitle={card.subtitle} />
                    </View>
                  ))}
                  {row.length === 1 && <View style={styles.revenueCardHalf} />}
                </View>
              ))}
            </View>
            )}
          </View>

          <View style={styles.quickActions}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{t('dashboard.quickActions')}</Text>
            <TouchableOpacity
              style={[styles.primaryAction, { backgroundColor: colors.primary, borderRadius: radii.lg }]}
              onPress={() => navigate('CreateGR')}
              activeOpacity={0.9}
            >
              <View style={styles.primaryActionIcon}>
                <Ionicons name="add-circle-outline" size={22} color={colors.onPrimary} />
              </View>
              <Text style={[styles.primaryActionLabel, { color: colors.onPrimary }]}>{t('dashboard.createGR')}</Text>
              <Ionicons name="chevron-forward" size={20} color={colors.onPrimary} />
            </TouchableOpacity>

            {/* Excel bulk import — Admin-tier only (any Admin, not just Super
             * Admin), same reasoning as Staff Approvals/All Staff below. */}
            <TouchableOpacity
              style={[styles.secondaryAction, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}
              onPress={() => navigate('Areas')}
              activeOpacity={0.85}
            >
              <View style={[styles.secondaryActionIcon, { backgroundColor: '#635BFF15', borderRadius: radii.md }]}>
                <Ionicons name="cloud-upload-outline" size={20} color="#635BFF" />
              </View>
              <Text style={[styles.secondaryActionLabel, { color: colors.textPrimary }]}>{t('dashboard.importFromExcel')}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>

            {/* All Shops — Bageshwar / Almora / Garur Someshwar, grouped from
             * the same GRs Excel-imports already assign an area to. */}
            <TouchableOpacity
              style={[styles.secondaryAction, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}
              onPress={() => navigate('AllShops')}
              activeOpacity={0.85}
            >
              <View style={[styles.secondaryActionIcon, { backgroundColor: '#EC489915', borderRadius: radii.md }]}>
                <Ionicons name="storefront-outline" size={20} color="#EC4899" />
              </View>
              <Text style={[styles.secondaryActionLabel, { color: colors.textPrimary }]}>{t('dashboard.allShopsLabel')}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>

            {isSuperAdmin && (
              <TouchableOpacity
                style={[styles.secondaryAction, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}
                onPress={() => navigate('PendingApprovals')}
                activeOpacity={0.85}
              >
                <View style={[styles.secondaryActionIcon, { backgroundColor: '#F59E0B15', borderRadius: radii.md }]}>
                  <Ionicons name="time-outline" size={20} color="#F59E0B" />
                </View>
                <Text style={[styles.secondaryActionLabel, { color: colors.textPrimary }]}>{t('dashboard.pendingApprovalsLabel')}</Text>
                {(stats?.pendingApprovals ?? 0) > 0 && (
                  <View style={[styles.badge, { backgroundColor: '#F59E0B', borderRadius: radii.pill }]}>
                    <Text style={styles.badgeText}>{(stats?.pendingApprovals ?? 0) > 99 ? '99+' : stats?.pendingApprovals}</Text>
                  </View>
                )}
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            )}

            {/* Staff Approvals — the separate self-service Staff portal's own
             * queue (no OTP/email), available to every Admin, not just
             * Super Admin (unlike "Pending Approvals" above, which is the
             * existing OTP/registration-request flow). */}
            <TouchableOpacity
              style={[styles.secondaryAction, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}
              onPress={() => navigate('StaffApprovals')}
              activeOpacity={0.85}
            >
              <View style={[styles.secondaryActionIcon, { backgroundColor: '#06B6D415', borderRadius: radii.md }]}>
                <Ionicons name="checkmark-done-circle-outline" size={20} color="#06B6D4" />
              </View>
              <Text style={[styles.secondaryActionLabel, { color: colors.textPrimary }]}>{t('dashboard.staffApprovalsLabel')}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>

            {/* All Staff — every self-service Staff account, any status.
             * "Remove" suspends (never deletes) an account so it can no
             * longer sign in; "Reactivate" restores access. */}
            <TouchableOpacity
              style={[styles.secondaryAction, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}
              onPress={() => navigate('AllStaff')}
              activeOpacity={0.85}
            >
              <View style={[styles.secondaryActionIcon, { backgroundColor: '#635BFF15', borderRadius: radii.md }]}>
                <Ionicons name="people-outline" size={20} color="#635BFF" />
              </View>
              <Text style={[styles.secondaryActionLabel, { color: colors.textPrimary }]}>{t('dashboard.allStaffLabel')}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.secondaryAction, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}
              onPress={() => navigate('PaymentHistory')}
              activeOpacity={0.85}
            >
              <View style={[styles.secondaryActionIcon, { backgroundColor: '#10B98115', borderRadius: radii.md }]}>
                <Ionicons name="wallet-outline" size={20} color="#10B981" />
              </View>
              <Text style={[styles.secondaryActionLabel, { color: colors.textPrimary }]}>{t('payment.paymentHistory')}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <View style={styles.quickActions}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{t('summary.shipmentStatusOverview')}</Text>
            <View style={styles.statusOverviewRow}>
              <TouchableOpacity style={[styles.statusOverviewCard, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]} onPress={() => navigate('GRShipments', { status: 'Pending' })} activeOpacity={0.85}>
                <StatusBadge status="pending" size="md" />
                <Text style={[styles.statusOverviewCount, { color: colors.textPrimary }]}>{shipmentOverview.pending}</Text>
                <Text style={[styles.statusOverviewLabel, { color: colors.textMuted }]}>{t('summary.pending')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.statusOverviewCard, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]} onPress={() => navigate('GRShipments', { status: 'Cleared' })} activeOpacity={0.85}>
                <StatusBadge status="cleared" size="md" />
                <Text style={[styles.statusOverviewCount, { color: colors.textPrimary }]}>{shipmentOverview.cleared}</Text>
                <Text style={[styles.statusOverviewLabel, { color: colors.textMuted }]}>{t('summary.cleared')}</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.statusOverviewRow}>
              <TouchableOpacity style={[styles.statusOverviewCard, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]} onPress={() => navigate('GRShipments', { status: 'Uncleared' })} activeOpacity={0.85}>
                <StatusBadge status="uncleared" size="md" />
                <Text style={[styles.statusOverviewCount, { color: colors.textPrimary }]}>{shipmentOverview.uncleared}</Text>
                <Text style={[styles.statusOverviewLabel, { color: colors.textMuted }]}>{t('summary.uncleared')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.statusOverviewCard, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]} onPress={() => navigate('GRShipments', { status: 'Delivered' })} activeOpacity={0.85}>
                <StatusBadge status="delivered" size="md" />
                <Text style={[styles.statusOverviewCount, { color: colors.textPrimary }]}>{shipmentOverview.delivered}</Text>
                <Text style={[styles.statusOverviewLabel, { color: colors.textMuted }]}>{t('summary.delivered')}</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.statusOverviewRow}>
              <TouchableOpacity style={[styles.statusOverviewCard, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm, flex: 1 }]} onPress={() => navigate('GRShipments')} activeOpacity={0.85}>
                <Ionicons name="wallet-outline" size={22} color="#10B981" />
                <Text style={[styles.statusOverviewCount, { color: '#10B981' }]}>{formatINR(todayCollection)}</Text>
                <Text style={[styles.statusOverviewLabel, { color: colors.textMuted }]}>{t('adminDashboard.todayCollection')}</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('dashboard.recentActivity')}</Text>
          </View>

          {activityStatus === 'loading' && (
            <View style={styles.activityList}>
              <ShimmerCard style={styles.activityCardShimmer} height={72} />
              <ShimmerCard style={styles.activityCardShimmer} height={72} />
              <ShimmerCard style={styles.activityCardShimmer} height={72} />
            </View>
          )}

          {activityStatus === 'error' && (
            <EmptyState
              icon="cloud-offline-outline"
              title={t('dashboard.unableToLoadActivity')}
              subtitle={t('dashboard.pullToRefresh')}
              iconColor={colors.error}
            />
          )}

          {activityStatus === 'success' && activities.length === 0 && (
            <EmptyState
              icon="time-outline"
              title={t('dashboard.noRecentActivity')}
              subtitle={t('dashboard.activityWillAppear')}
            />
          )}

          {activityStatus === 'success' && activities.length > 0 && (
            <View style={styles.activityList}>
              {activities.map((activity) => (
                <ActivityItem key={activity.id} activity={activity} />
              ))}
            </View>
          )}
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
};

const createStyles = (theme: Pick<AppTheme, 'colors' | 'spacing' | 'radii' | 'fonts' | 'shadows'>) =>
  StyleSheet.create({
    safe: { flex: 1 },
    headerContainer: { paddingTop: 8 },
    header: { paddingHorizontal: theme.spacing.lg, paddingBottom: 8 },
    welcomeSection: { paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.lg, gap: 6 },
    welcomeTitle: { fontSize: theme.fonts.size.xl, fontWeight: '800', color: theme.colors.textPrimary, letterSpacing: -0.5 },
    summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    healthDot: { width: 8, height: 8, borderRadius: 4 },
    welcomeSubtitle: { fontSize: theme.fonts.size.sm, fontWeight: '500', color: theme.colors.textSecondary },
    scrollContent: { paddingBottom: 40, paddingHorizontal: theme.spacing.lg },
    revenueSection: { marginBottom: theme.spacing.lg },
    revenueGrid: { gap: theme.spacing.md },
    revenueRow: { flexDirection: 'row', gap: theme.spacing.md },
    revenueCardHalf: { flex: 1 },
    revenueError: { alignItems: 'center', justifyContent: 'center', paddingVertical: 32, gap: 8 },
    revenueErrorText: { fontSize: 14, fontWeight: '500' },
    retryButton: { paddingHorizontal: 20, paddingVertical: 8, borderRadius: 8, marginTop: 4 },
    quickActions: { marginTop: theme.spacing.sm, gap: theme.spacing.sm },
    sectionTitle: { fontSize: theme.fonts.size.lg, fontWeight: '800', color: theme.colors.textPrimary, marginBottom: theme.spacing.md },
    primaryAction: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, padding: theme.spacing.lg },
    primaryActionIcon: { alignItems: 'center', justifyContent: 'center' },
    primaryActionLabel: { flex: 1, fontWeight: '800', fontSize: theme.fonts.size.md },
    secondaryAction: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, padding: theme.spacing.md },
    secondaryActionIcon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    secondaryActionLabel: { flex: 1, fontWeight: '700' },
    badge: { minWidth: 22, height: 22, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
    badgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
    sectionHeader: { marginTop: theme.spacing.xl, marginBottom: theme.spacing.md },
    sectionTitleShimmer: { width: 150, height: 24, borderRadius: theme.radii.sm },
    activityCardShimmer: { height: 80, borderRadius: theme.radii.lg, marginBottom: theme.spacing.md },
    activityList: { gap: theme.spacing.sm },
    statusOverviewRow: { flexDirection: 'row', gap: theme.spacing.md, marginBottom: theme.spacing.md },
    statusOverviewCard: { flex: 1, padding: 14, alignItems: 'center', gap: 4 },
    statusOverviewCount: { fontSize: theme.fonts.size.xl, fontWeight: '800' },
    statusOverviewLabel: { fontSize: theme.fonts.size.xs, fontWeight: '600' },
  });

export default AdminDashboardScreen;
