import { useEffect, useState, useCallback, type ComponentProps } from 'react';
import { Animated, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/useAppTheme';
import { useAuthStore } from '../../store/authStore';
import { useUserStore } from '../../store/userStore';
import { api } from '../../api/client';
import { ENDPOINTS } from '../../api/endpoints';
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
  userName?: string;
}

export const AdminDashboardScreen = () => {
  const { colors, spacing, radii, fonts, shadows } = useAppTheme();
  const accessToken = useAuthStore((state) => state.accessToken);
  const isSuperAdmin = useUserStore((state) => state.user?.role === 'super_admin');
  const { openDrawer, goToNotifications, navigation } = useAppNav();

  const styles = createStyles({ colors, spacing, radii, fonts, shadows });

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [activities, setActivities] = useState<RecentActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fadeAnim] = useState(new Animated.Value(0));
  const [slideAnim] = useState(new Animated.Value(50));

  const fetchDashboardData = useCallback(async () => {
    if (!accessToken) return;
    try {
const [statsRes, activitiesRes] = await Promise.all([
        api.get('/admin/dashboard/stats', { headers: { Authorization: `Bearer ${accessToken}` } }),
        api.get('/admin/dashboard/activity', { headers: { Authorization: `Bearer ${accessToken}` }, params: { limit: 10 } }),
      ]);
setStats(statsRes.data.data);
      const activityData = activitiesRes.data?.data;
      setActivities(
        Array.isArray(activityData)
          ? activityData.map((item: any) => ({
              id: item.id,
              type: item.type,
              title: item.message ?? item.action ?? item.entityType ?? 'Activity',
              description: item.description ?? '',
              timestamp: item.time ?? item.createdAt ?? '',
              userName: item.userName,
            }))
          : [],
      );
    } catch (error) {
      console.error('Failed to fetch admin dashboard:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [accessToken]);

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
          <Header title="Admin Dashboard" leftAction={{ icon: 'menu', onPress: openDrawer }} rightAction={{ icon: 'notifications-outline', onPress: goToNotifications }} />
        </View>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.statsGrid}>
            {[1,2,3,4,5,6].map((i) => <ShimmerCard key={i} style={styles.statCard} />)}
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

  const getHealthConfig = (health: string): { color: string; label: string; icon: ComponentProps<typeof Ionicons>['name'] } => {
    switch (health) {
      case 'healthy': return { color: '#10B981', label: 'Healthy', icon: 'checkmark-circle' };
      case 'degraded': return { color: '#F59E0B', label: 'Degraded', icon: 'alert-circle' };
      case 'critical': return { color: '#EF4444', label: 'Critical', icon: 'close-circle' };
      default: return { color: colors.textMuted, label: 'Unknown', icon: 'help-circle' };
    }
  };

  const healthConfig = getHealthConfig(stats?.systemHealth || 'healthy');

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <Animated.View style={styles.headerContainer}>
        <View style={styles.header}>
          <Header title="Admin Dashboard" leftAction={{ icon: 'menu', onPress: openDrawer }} rightAction={{ icon: 'notifications-outline', onPress: goToNotifications }} />
        </View>
        <Animated.View
          style={{
            transform: [{ translateY: slideAnim }],
            opacity: fadeAnim,
          }}
        >
          <View style={styles.welcomeSection}>
            <Text style={styles.welcomeTitle}>System Overview</Text>
            <Text style={styles.welcomeSubtitle}>Monitor platform health and key metrics</Text>
          </View>
        </Animated.View>
      </Animated.View>

      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#635BFF']}
            progressBackgroundColor={colors.surface}
          />
        }
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View
          style={{
            transform: [{ translateY: slideAnim }],
            opacity: fadeAnim,
          }}
        >
          <View style={styles.statsGrid}>
            <StatCard
              title="Total Users"
              value={stats?.totalUsers ? stats.totalUsers.toLocaleString() : '0'}
              icon="people-outline"
              color="#635BFF"
            />
            <StatCard
              title="Companies"
              value={stats?.totalCompanies ? stats.totalCompanies.toLocaleString() : '0'}
              icon="business-outline"
              color="#06B6D4"
            />
            <StatCard
              title="Drivers"
              value={stats?.totalDrivers ? stats.totalDrivers.toLocaleString() : '0'}
              icon="person-outline"
              color="#8B5CF6"
            />
            <StatCard
              title="Vehicles"
              value={stats?.totalVehicles ? stats.totalVehicles.toLocaleString() : '0'}
              icon="car-outline"
              color="#F97316"
            />
            <StatCard
              title="Total Orders"
              value={stats?.totalOrders ? stats.totalOrders.toLocaleString() : '0'}
              icon="clipboard-outline"
              color="#10B981"
            />
            {isSuperAdmin ? (
              <StatCard
                title="Pending Approvals"
                value={stats?.pendingApprovals ? stats.pendingApprovals.toLocaleString() : '0'}
                icon="time-outline"
                color="#F59E0B"
                trend={{ value: stats?.pendingApprovals || 0, label: 'need review' }}
              />
            ) : null}
          </View>

          <View style={styles.systemHealthCard}>
            <View style={styles.healthHeader}>
              <View style={[styles.healthIcon, { backgroundColor: `${healthConfig.color}15`, borderRadius: radii.md }]}>
                <Ionicons name={healthConfig.icon} size={24} color={healthConfig.color} />
              </View>
              <View style={styles.healthInfo}>
                <Text style={[styles.healthLabel, { color: colors.textMuted }]}>System Health</Text>
                <Text style={[styles.healthValue, { color: healthConfig.color }]}>{healthConfig.label}</Text>
              </View>
              <View style={[styles.onlineBadge, { backgroundColor: '#10B98115', borderRadius: radii.pill }]}>
                <View style={styles.onlineDot} />
                <Text style={[styles.onlineText, { color: '#10B981' }]}>{stats?.onlineUsers || 0} Online</Text>
              </View>
            </View>
          </View>

          <View style={styles.quickActions}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Quick Actions</Text>
            <View style={styles.actionsGrid}>
              {isSuperAdmin ? (
                <AdminActionCard icon="person-add-outline" label="Pending Approvals" color="#10B981" badge={stats?.pendingApprovals || 0} onPress={() => navigation.navigate('PendingApprovals' as never)} />
              ) : null}
              <AdminActionCard icon="people-outline" label="User Management" color="#635BFF" onPress={() => navigation.navigate('UserManagement' as never)} />
              <AdminActionCard icon="person-outline" label="Driver Management" color="#8B5CF6" onPress={() => navigation.navigate('DriverManagement' as never)} />
              <AdminActionCard icon="car-outline" label="Vehicle Management" color="#F97316" onPress={() => navigation.navigate('VehicleManagement' as never)} />
              <AdminActionCard icon="clipboard-outline" label="Order Management" color="#06B6D4" onPress={() => navigation.navigate('OrderManagement' as never)} />
              <AdminActionCard icon="document-text-outline" label="Audit Logs" color="#6B7280" onPress={() => navigation.navigate('AuditLogs' as never)} />
              <AdminActionCard icon="analytics-outline" label="Analytics" color="#F59E0B" onPress={() => navigation.navigate('Analytics' as never)} />
              <AdminActionCard icon="settings-outline" label="System Settings" color="#EF4444" onPress={() => navigation.navigate('Settings' as never)} />
            </View>
          </View>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Activity</Text>
          </View>

          {activities.length === 0 ? (
            <EmptyState icon="time-outline" title="No recent activity" subtitle="System activity will appear here" />
          ) : (
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

const AdminActionCard = ({ icon, label, color, badge, onPress }: { icon: ComponentProps<typeof Ionicons>['name']; label: string; color: string; badge?: number; onPress: () => void }) => {
  const { colors, spacing, radii, fonts, shadows } = useAppTheme();
  const styles = createStyles({ colors, spacing, radii, fonts, shadows });
  return (
    <TouchableOpacity
      style={[styles.actionCard, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <View style={[styles.actionIcon, { backgroundColor: `${color}15`, borderRadius: radii.md }]}>
        <Ionicons name={icon} size={24} color={color} />
      </View>
      <Text style={[styles.actionLabel, { color: colors.textPrimary, fontSize: fonts.size.sm }]}>{label}</Text>
      {badge && badge > 0 && (
        <View style={[styles.badge, { backgroundColor: color, borderRadius: radii.pill }]}>
          <Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

const createStyles = (theme: Pick<AppTheme, 'colors' | 'spacing' | 'radii' | 'fonts' | 'shadows'>) =>
  StyleSheet.create({
    safe: { flex: 1 },
    headerContainer: { paddingTop: 8 },
    header: { paddingHorizontal: theme.spacing.lg, paddingBottom: 8 },
    welcomeSection: { paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.lg, gap: 4 },
    welcomeTitle: { fontSize: theme.fonts.size.xl, fontWeight: '800', color: theme.colors.textPrimary, letterSpacing: -0.5 },
    welcomeSubtitle: { fontSize: theme.fonts.size.sm, fontWeight: '500', color: theme.colors.textSecondary },
    scrollContent: { paddingBottom: 40, paddingHorizontal: theme.spacing.lg },
    statsGrid: { paddingHorizontal: theme.spacing.lg, gap: theme.spacing.md, marginBottom: theme.spacing.lg },
    statCard: { borderRadius: theme.radii.lg },
    systemHealthCard: { backgroundColor: theme.colors.surface, borderRadius: theme.radii.xl, padding: 20, marginHorizontal: theme.spacing.lg, marginBottom: theme.spacing.xl, ...theme.shadows.md },
    healthHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    healthIcon: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
    healthInfo: { flex: 1, gap: 4 },
    healthLabel: { fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, fontSize: theme.fonts.size.xs },
    healthValue: { fontSize: theme.fonts.size.xl, fontWeight: '800' },
    onlineBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6 },
    onlineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#10B981' },
    onlineText: { fontWeight: '700', fontSize: theme.fonts.size.sm },
    quickActions: { marginTop: theme.spacing.lg },
    sectionTitle: { fontSize: theme.fonts.size.lg, fontWeight: '800', color: theme.colors.textPrimary, marginBottom: theme.spacing.md },
    actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.md },
    actionCard: { flex: 1, minWidth: '45%', padding: 16, alignItems: 'center', gap: 8, position: 'relative' },
    actionIcon: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
    actionLabel: { fontWeight: '700', textAlign: 'center' },
    badge: { position: 'absolute', top: -6, right: -6, minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
    badgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
    sectionHeader: { paddingHorizontal: theme.spacing.lg, marginTop: theme.spacing.xl, marginBottom: theme.spacing.md },
    sectionTitleShimmer: { width: 150, height: 24, borderRadius: theme.radii.sm },
    activityCardShimmer: { marginHorizontal: theme.spacing.lg, height: 80, borderRadius: theme.radii.lg, marginBottom: theme.spacing.md },
    activityList: { paddingHorizontal: theme.spacing.lg, gap: theme.spacing.sm },
  });

export default AdminDashboardScreen;
