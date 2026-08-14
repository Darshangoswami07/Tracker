import { useEffect, useState, useCallback } from 'react';
import { Animated, RefreshControl, ScrollView, StyleSheet, Text, View, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/useAppTheme';
import { useAuthStore } from '../../store/authStore';
import { useUserStore } from '../../store/userStore';
import { formatCurrency, formatNumber } from '../../utils/format';
import { api } from '../../api/client';
import { ENDPOINTS } from '../../api/endpoints';
import { StatCard } from '../../components/StatCard';
import { OrderCard } from '../../components/OrderCard';
import { ActivityItem } from '../../components/ActivityItem';
import { FloatingActionButton } from '../../components/FloatingActionButton';
import { ShimmerCard } from '../../components/ShimmerCard';
import { Header } from '../../components/Header';
import { useAppNav } from '../../hooks/useAppNav';
import type { AppTheme } from '../../theme/types';

interface DashboardStats {
  todayOrders: number;
  pendingOrders: number;
  completedOrders: number;
  revenue: number;
  driversOnline: number;
  vehiclesActive: number;
}

interface RecentOrder {
  id: string;
  orderNumber: string;
  customerName: string;
  status: string;
  amount: number;
  createdAt: string;
  pickupAddress: string;
  deliveryAddress: string;
}

interface RecentActivity {
  id: string;
  type: string;
  title: string;
  description: string;
  timestamp: string;
}

export const BusinessDashboardScreen = () => {
  const { colors, spacing, radii, fonts, shadows } = useAppTheme();
  const user = useUserStore((state) => state.user);
  const accessToken = useAuthStore((state) => state.accessToken);
  const { navigation, openDrawer, goToNotifications } = useAppNav();

  const styles = createStyles({ colors, spacing, radii, fonts, shadows });

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);
  const [activities, setActivities] = useState<RecentActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fadeAnim] = useState(new Animated.Value(0));
  const [slideAnim] = useState(new Animated.Value(50));

  const fetchDashboardData = useCallback(async () => {
    if (!accessToken) return;
    try {
      const [statsRes, ordersRes] = await Promise.all([
        api.get(`${ENDPOINTS.business}/dashboard/stats`, { headers: { Authorization: `Bearer ${accessToken}` } }),
        api.get(`${ENDPOINTS.business}/orders`, { 
          headers: { Authorization: `Bearer ${accessToken}` },
          params: { page: 1, pageSize: 5, sort: '-createdAt' }
        }),
      ]);
      
      setStats(statsRes.data.data);
      const items: RecentOrder[] = ordersRes.data.data.items || [];
      setRecentOrders(items);
      setActivities(items.map((order) => ({
        id: order.id,
        type: 'order',
        title: order.orderNumber,
        description: `${order.customerName} · ${order.status}`,
        timestamp: order.createdAt,
      })));
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
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

  const greeting = `Good ${new Date().getHours() < 12 ? 'Morning' : new Date().getHours() < 17 ? 'Afternoon' : 'Evening'}, ${user?.fullName?.split(' ')[0] ?? 'there'}`;

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <Header title="Dashboard" leftAction={{ icon: 'menu', onPress: openDrawer }} rightAction={{ icon: 'notifications-outline', onPress: goToNotifications }} />
        </View>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.greetingSection}>
            <Animated.Text style={[styles.greeting, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>{greeting}</Animated.Text>
          </View>
          <View style={styles.statsGrid}>
            {[1,2,3,4,5,6].map((i) => (
              <ShimmerCard key={i} style={styles.statCard} />
            ))}
          </View>
          <View style={styles.sectionHeader}>
            <ShimmerCard style={styles.sectionTitleShimmer} />
          </View>
          <ShimmerCard style={styles.orderCardShimmer} />
          <ShimmerCard style={styles.orderCardShimmer} />
          <ShimmerCard style={styles.orderCardShimmer} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <Animated.View style={styles.headerContainer}>
        <View style={styles.header}>
          <Header title="Dashboard" leftAction={{ icon: 'menu', onPress: openDrawer }} rightAction={{ icon: 'notifications-outline', onPress: goToNotifications }} />
        </View>
        <Animated.View
          style={{
            transform: [{ translateY: slideAnim }],
            opacity: fadeAnim,
          }}
        >
          <View style={styles.greetingSection}>
            <Text style={styles.greeting}>{greeting}</Text>
            <Text style={styles.subtitle}>Here's what's happening with your business today</Text>
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
              title="Today's Orders"
              value={formatNumber(stats?.todayOrders || 0)}
              icon="clipboard-outline"
              color="#635BFF"
              trend={{ value: 12, label: 'vs yesterday' }}
            />
            <StatCard
              title="Pending"
              value={formatNumber(stats?.pendingOrders || 0)}
              icon="time-outline"
              color="#F59E0B"
              trend={{ value: 3, label: 'need attention' }}
            />
            <StatCard
              title="Completed"
              value={formatNumber(stats?.completedOrders || 0)}
              icon="checkmark-circle-outline"
              color="#10B981"
              trend={{ value: 8, label: 'vs yesterday' }}
            />
            <StatCard
              title="Revenue"
              value={formatCurrency(stats?.revenue || 0)}
              icon="cash-outline"
              color="#8B5CF6"
              trend={{ value: 15.2, label: 'vs last week', isPercentage: true }}
            />
            <StatCard
              title="Drivers Online"
              value={formatNumber(stats?.driversOnline || 0)}
              icon="people-outline"
              color="#06B6D4"
            />
            <StatCard
              title="Active Vehicles"
              value={formatNumber(stats?.vehiclesActive || 0)}
              icon="car-outline"
              color="#F97316"
            />
          </View>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Orders</Text>
            <Text style={styles.sectionAction} onPress={() => navigation.navigate('Orders' as never)}>View All</Text>
          </View>

          {recentOrders.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="cube-outline" size={48} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>No orders yet</Text>
              <Text style={styles.emptySubtitle}>Create your first order to get started</Text>
            </View>
          ) : (
            <View style={styles.ordersList}>
              {recentOrders.map((order) => (
                <OrderCard key={order.id} order={order} compact />
              ))}
            </View>
          )}

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Activity</Text>
          </View>

          {activities.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="time-outline" size={48} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>No recent activity</Text>
            </View>
          ) : (
            <View style={styles.activityList}>
              {activities.map((activity) => (
                <ActivityItem key={activity.id} activity={activity} />
              ))}
            </View>
          )}
        </Animated.View>
      </ScrollView>

      <FloatingActionButton
        icon="add"
        onPress={() => navigation.navigate('CreateOrder' as never)}
        label="New Order"
      />
    </SafeAreaView>
  );
};

const createStyles = (theme: Pick<AppTheme, 'colors' | 'spacing' | 'radii' | 'fonts' | 'shadows'>) =>
  StyleSheet.create({
    safe: { flex: 1 },
    headerContainer: { paddingTop: 8 },
    header: { paddingHorizontal: theme.spacing.lg, paddingBottom: 8 },
    greetingSection: { paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.lg, gap: 4 },
    greeting: { fontSize: theme.fonts.size.xl, fontWeight: '800', color: theme.colors.textPrimary, letterSpacing: -0.5 },
    subtitle: { fontSize: theme.fonts.size.sm, fontWeight: '500', color: theme.colors.textSecondary },
    scrollContent: { paddingBottom: 100 },
    statsGrid: { paddingHorizontal: theme.spacing.lg, gap: theme.spacing.md },
    statCard: { borderRadius: theme.radii.lg },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: theme.spacing.lg, marginTop: theme.spacing.xl, marginBottom: theme.spacing.md },
    sectionTitle: { fontSize: theme.fonts.size.lg, fontWeight: '800', color: theme.colors.textPrimary },
    sectionAction: { fontSize: theme.fonts.size.sm, fontWeight: '600', color: theme.colors.primary },
    sectionTitleShimmer: { width: 150, height: 24, borderRadius: theme.radii.sm },
    ordersList: { paddingHorizontal: theme.spacing.lg, gap: theme.spacing.md },
    orderCardShimmer: { marginHorizontal: theme.spacing.lg, height: 100, borderRadius: theme.radii.lg, marginBottom: theme.spacing.md },
    activityList: { paddingHorizontal: theme.spacing.lg, gap: theme.spacing.sm },
    emptyState: { alignItems: 'center', paddingVertical: theme.spacing.xxl, gap: theme.spacing.sm },
    emptyTitle: { fontSize: theme.fonts.size.md, fontWeight: '700', color: theme.colors.textSecondary },
    emptySubtitle: { fontSize: theme.fonts.size.sm, color: theme.colors.textMuted, textAlign: 'center', paddingHorizontal: theme.spacing.xl },
  });

export default BusinessDashboardScreen;