import { useEffect, useState, useCallback, type ComponentProps } from 'react';
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
import { useAppNav } from '../../hooks/useAppNav';
import type { AppTheme } from '../../theme/types';

interface AdminStats {
  totalUsers: number;
  totalCompanies: number;
  totalDrivers: number;
  totalVehicles: number;
  totalOrders: number;
  pendingApprovals: number;
  onlineUsers: number;
  systemHealth: 'healthy' | 'degraded' | 'critical';
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
  assigned: 'Assigned',
  pickup: 'Picked Up',
  in_transit: 'In Transit',
  delivered: 'Delivered',
  failed: 'Failed',
  returned: 'Returned',
  cancelled: 'Cancelled',
};

const ACTIVITY_TYPE_FOR_STATUS: Record<string, string> = {
  pending: 'order_pending',
  assigned: 'order_assigned',
  pickup: 'order_picked_up',
  in_transit: 'order_in_transit',
  delivered: 'order_delivered',
  failed: 'order_failed',
  returned: 'order_returned',
  cancelled: 'order_cancelled',
};

const TITLE_FOR_STATUS: Record<string, string> = {
  pending: 'GR Pending',
  assigned: 'Shipment Assigned',
  pickup: 'Shipment Picked Up',
  in_transit: 'Shipment In Transit',
  delivered: 'Shipment Delivered',
  failed: 'Delivery Failed',
  returned: 'Shipment Returned',
  cancelled: 'Shipment Cancelled',
};

const humanizeStatus = (status: string): string => STATUS_LABELS[status] ?? status.replace(/_/g, ' ');

/** Turns a real GR/shipment event (status history row or slip upload) into
 * the title/description shape `ActivityItem` renders. */
const describeActivity = (event: ActivityEvent): RecentActivity => {
  if (event.kind === 'created') {
    return {
      id: event.id,
      type: 'order_created',
      title: 'GR Created',
      description: `GR #${event.orderNumber} was created`,
      timestamp: event.createdAt,
    };
  }
  if (event.kind === 'upload') {
    return {
      id: event.id,
      type: 'slip_uploaded',
      title: 'Slip Uploaded',
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

const getGreeting = (): string => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
};

const firstNameOf = (fullName?: string): string => (fullName ?? '').trim().split(/\s+/)[0] || 'there';

export const AdminDashboardScreen = () => {
  const { colors, spacing, radii, fonts, shadows } = useAppTheme();
  const accessToken = useAuthStore((state) => state.accessToken);
  const user = useUserStore((state) => state.user);
  const isSuperAdmin = user?.role === 'super_admin';
  const { goToNotifications, navigate } = useAppNav();

  const styles = createStyles({ colors, spacing, radii, fonts, shadows });

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [activities, setActivities] = useState<RecentActivity[]>([]);
  const [activityStatus, setActivityStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fadeAnim] = useState(new Animated.Value(0));
  const [slideAnim] = useState(new Animated.Value(50));

  const fetchStats = useCallback(async () => {
    if (!accessToken) return;
    try {
      const statsRes = await api.get('/admin/dashboard/stats', { headers: { Authorization: `Bearer ${accessToken}` } });
      setStats(statsRes.data.data);
    } catch (error) {
      console.error('Failed to fetch admin dashboard stats:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [accessToken]);

  // Recent Activity is real GR/shipment history (status transitions + slip
  // uploads) read from the on-device SQLite database — the same source the
  // GR list / Customer Tracking / GR Tracker screens use — not the backend's
  // email-notification log, which isn't meaningful operational activity.
  const fetchActivity = useCallback(async () => {
    setActivityStatus('loading');
    try {
      const events = await orderRepository.listRecentActivity(8);
      setActivities(events.map(describeActivity));
      setActivityStatus('success');
    } catch (error) {
      console.error('Failed to load recent activity:', error);
      setActivityStatus('error');
    }
  }, []);

  const fetchDashboardData = useCallback(() => {
    void fetchStats();
    void fetchActivity();
  }, [fetchStats, fetchActivity]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchDashboardData();
  }, [fetchDashboardData]);

  useEffect(() => {
    fetchDashboardData();
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(slideAnim, { toValue: 0, duration: 600, useNativeDriver: Platform.OS !== 'web' }),
    ]).start();
  }, [fetchDashboardData, fadeAnim, slideAnim]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <Header title="Dashboard" rightAction={{ icon: 'notifications-outline', onPress: goToNotifications }} />
        </View>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.statsGrid}>
            <View style={styles.statsRow}>
              <ShimmerCard style={styles.statCardHalf} height={104} />
              <ShimmerCard style={styles.statCardHalf} height={104} />
            </View>
            <View style={styles.statsRow}>
              <ShimmerCard style={styles.statCardHalf} height={104} />
              <ShimmerCard style={styles.statCardHalf} height={104} />
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
      case 'healthy': return { color: colors.success, label: 'Healthy' };
      case 'degraded': return { color: colors.warning, label: 'Degraded' };
      case 'critical': return { color: colors.error, label: 'Critical' };
      default: return { color: colors.textMuted, label: 'Unknown' };
    }
  };

  const healthConfig = getHealthConfig(stats?.systemHealth || 'healthy');

  const metrics: { title: string; value: string; icon: ComponentProps<typeof Ionicons>['name']; color: string }[] = [
    { title: 'Total Orders', value: (stats?.totalOrders ?? 0).toLocaleString(), icon: 'clipboard-outline', color: '#10B981' },
    { title: 'Drivers', value: (stats?.totalDrivers ?? 0).toLocaleString(), icon: 'person-outline', color: '#8B5CF6' },
    { title: 'Vehicles', value: (stats?.totalVehicles ?? 0).toLocaleString(), icon: 'car-outline', color: '#F97316' },
    { title: 'Companies', value: (stats?.totalCompanies ?? 0).toLocaleString(), icon: 'business-outline', color: '#06B6D4' },
    { title: 'Total Users', value: (stats?.totalUsers ?? 0).toLocaleString(), icon: 'people-outline', color: '#635BFF' },
  ];
  if (isSuperAdmin) {
    metrics.push({ title: 'Pending Approvals', value: (stats?.pendingApprovals ?? 0).toLocaleString(), icon: 'time-outline', color: '#F59E0B' });
  }
  const metricRows: (typeof metrics)[] = [];
  for (let i = 0; i < metrics.length; i += 2) metricRows.push(metrics.slice(i, i + 2));

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <Animated.View style={styles.headerContainer}>
        <View style={styles.header}>
          <Header
            title="Dashboard"
            leftAction={{ icon: 'person-circle-outline', onPress: () => navigate('Profile'), accessibilityLabel: 'Profile' }}
            rightAction={{ icon: 'notifications-outline', onPress: goToNotifications }}
          />
        </View>
        <Animated.View style={{ transform: [{ translateY: slideAnim }], opacity: fadeAnim }}>
          <View style={styles.welcomeSection}>
            <Text style={styles.welcomeTitle}>{getGreeting()}, {firstNameOf(user?.fullName)} 👋</Text>
            <View style={styles.summaryRow}>
              <View style={[styles.healthDot, { backgroundColor: healthConfig.color }]} />
              <Text style={styles.welcomeSubtitle}>
                {(stats?.totalOrders ?? 0).toLocaleString()} orders · {stats?.onlineUsers ?? 0} online · System {healthConfig.label}
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
          <View style={styles.statsGrid}>
            {metricRows.map((row, rowIndex) => (
              <View key={rowIndex} style={styles.statsRow}>
                {row.map((metric) => (
                  <View key={metric.title} style={styles.statCardHalf}>
                    <StatCard title={metric.title} value={metric.value} icon={metric.icon} color={metric.color} />
                  </View>
                ))}
                {row.length === 1 && <View style={styles.statCardHalf} />}
              </View>
            ))}
          </View>

          <View style={styles.quickActions}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Quick Actions</Text>
            <TouchableOpacity
              style={[styles.primaryAction, { backgroundColor: colors.primary, borderRadius: radii.lg }]}
              onPress={() => navigate('CreateGR')}
              activeOpacity={0.9}
            >
              <View style={styles.primaryActionIcon}>
                <Ionicons name="add-circle-outline" size={22} color={colors.onPrimary} />
              </View>
              <Text style={[styles.primaryActionLabel, { color: colors.onPrimary }]}>Create GR / Shipment</Text>
              <Ionicons name="chevron-forward" size={20} color={colors.onPrimary} />
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
                <Text style={[styles.secondaryActionLabel, { color: colors.textPrimary }]}>Pending Approvals</Text>
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
              <Text style={[styles.secondaryActionLabel, { color: colors.textPrimary }]}>Staff Approvals</Text>
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
              <Text style={[styles.secondaryActionLabel, { color: colors.textPrimary }]}>All Staff</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Activity</Text>
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
              title="Unable to load recent activity"
              subtitle="Pull down to refresh and try again."
              iconColor={colors.error}
            />
          )}

          {activityStatus === 'success' && activities.length === 0 && (
            <EmptyState
              icon="time-outline"
              title="No recent activity"
              subtitle="Shipment and GR activity will appear here when available."
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
    statsGrid: { gap: theme.spacing.md, marginBottom: theme.spacing.lg },
    statsRow: { flexDirection: 'row', gap: theme.spacing.md },
    statCardHalf: { flex: 1 },
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
  });

export default AdminDashboardScreen;
