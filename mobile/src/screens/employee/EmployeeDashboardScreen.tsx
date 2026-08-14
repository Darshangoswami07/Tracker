import { useEffect, useState } from 'react';
import type { ComponentProps } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View, ScrollView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/useAppTheme';
import { useAuthStore } from '../../store/authStore';
import { useUserStore } from '../../store/userStore';
import { api } from '../../api/client';
import { ENDPOINTS } from '../../api/endpoints';
import { Header } from '../../components/Header';
import { StatCard } from '../../components/StatCard';
import { ActionButton } from '../../components/ActionButton';
import { ShimmerCard } from '../../components/ShimmerCard';
import { EmptyState } from '../../components/EmptyState';
import { useAppNav } from '../../hooks/useAppNav';

export const EmployeeDashboardScreen = () => {
  const { colors, spacing, radii, fonts, shadows } = useAppTheme();
  const user = useUserStore((state) => state.user);
  const accessToken = useAuthStore((state) => state.accessToken);
  const { openDrawer, goToNotifications, navigation, navigate } = useAppNav();

  const styles = StyleSheet.create({
    safe: { flex: 1 },
    headerContainer: { paddingTop: 8 },
    header: { paddingHorizontal: spacing.lg, paddingBottom: 8 },
    greetingSection: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: 4 },
    greeting: { fontSize: fonts.size.xl, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.5 },
    subtitle: { fontSize: fonts.size.sm, fontWeight: '500', color: colors.textSecondary },
    scrollContent: { paddingBottom: 40, paddingHorizontal: spacing.lg },
    statsGrid: { paddingHorizontal: spacing.lg, gap: spacing.md, marginBottom: spacing.xl },
    statCard: { borderRadius: radii.lg },
    quickActions: { marginBottom: spacing.xl },
    sectionTitle: { fontSize: fonts.size.lg, fontWeight: '800', color: colors.textPrimary, marginBottom: spacing.md },
    actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
    sectionHeader: { paddingHorizontal: spacing.lg, marginTop: spacing.xl, marginBottom: spacing.md },
    emptyState: { alignItems: 'center', padding: 32, backgroundColor: colors.surface, borderRadius: radii.xl, marginHorizontal: spacing.lg, ...shadows.md, gap: 16 },
    emptyTitle: { fontSize: fonts.size.md, fontWeight: '700', color: colors.textSecondary },
    emptySubtitle: { fontSize: fonts.size.sm, color: colors.textMuted, textAlign: 'center' },
    ordersList: { gap: spacing.md },
    orderCard: { backgroundColor: colors.surface, borderRadius: radii.lg, padding: 16, ...shadows.sm },
    orderHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    orderNumber: { fontSize: fonts.size.md, fontWeight: '800', color: colors.textPrimary },
    orderStatus: { fontSize: fonts.size.sm, fontWeight: '600', color: '#635BFF' },
    orderRoute: { color: colors.textSecondary, fontSize: fonts.size.sm, marginBottom: 8 },
    orderFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    orderAmount: { fontSize: fonts.size.lg, fontWeight: '800', color: colors.textPrimary },
    orderDate: { fontSize: fonts.size.sm, color: colors.textMuted },
  });

  const [stats, setStats] = useState({
    totalOrders: 0,
    pendingOrders: 0,
    inProgressOrders: 0,
    completedOrders: 0,
    totalRevenue: 0,
    activeDrivers: 0,
  });
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [fadeAnim] = useState(new Animated.Value(0));
  const [slideAnim] = useState(new Animated.Value(50));

  const fetchDashboard = async () => {
    if (!accessToken) return;
    try {
      const [statsRes, ordersRes] = await Promise.all([
        api.get(`${ENDPOINTS.employee}/dashboard/stats`),
        api.get(`${ENDPOINTS.employee}/orders`, { params: { page: 1, pageSize: 5 } }),
      ]);
      setStats(statsRes.data.data);
      setRecentOrders(ordersRes.data.data.items || []);
    } catch (error) {
      console.error('Failed to fetch employee dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(slideAnim, { toValue: 0, duration: 600, useNativeDriver: Platform.OS !== 'web' }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <Header title="Dashboard" leftAction={{ icon: 'menu', onPress: openDrawer }} rightAction={{ icon: 'notifications-outline', onPress: goToNotifications }} />
        </View>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.greetingSection}>
            <Animated.Text style={[styles.greeting, { opacity: fadeAnim }]}>Loading...</Animated.Text>
          </View>
          <View style={styles.statsGrid}>
            {[1,2,3,4,5,6].map((i) => <ShimmerCard key={i} style={styles.statCard} />)}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const greeting = `Good ${new Date().getHours() < 12 ? 'Morning' : new Date().getHours() < 17 ? 'Afternoon' : 'Evening'}, ${user?.fullName?.split(' ')[0] ?? 'there'}`;

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
            <Text style={styles.subtitle}>Manage operations and track deliveries</Text>
          </View>
        </Animated.View>
      </Animated.View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Animated.View
          style={{
            transform: [{ translateY: slideAnim }],
            opacity: fadeAnim,
          }}
        >
          <View style={styles.statsGrid}>
            <StatCard title="Total Orders" value={stats.totalOrders.toLocaleString()} icon="cube-outline" color="#635BFF" />
            <StatCard title="Pending" value={stats.pendingOrders.toLocaleString()} icon="time-outline" color="#F59E0B" />
            <StatCard title="In Progress" value={stats.inProgressOrders.toLocaleString()} icon="navigate-outline" color="#3B82F6" />
            <StatCard title="Completed" value={stats.completedOrders.toLocaleString()} icon="checkmark-circle-outline" color="#10B981" />
            <StatCard title="Revenue" value={`₹${stats.totalRevenue.toLocaleString()}`} icon="cash-outline" color="#8B5CF6" />
            <StatCard title="Active Drivers" value={stats.activeDrivers.toLocaleString()} icon="people-outline" color="#06B6D4" />
          </View>

          <View style={styles.quickActions}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Quick Actions</Text>
            <View style={styles.actionsGrid}>
<ActionCard icon="reader-outline" label="GR Panel" color="#0F172A" onPress={() => navigate('StaffGRPanel')} />
              <ActionCard icon="search-outline" label="Track GR" color="#F97316" onPress={() => navigate('CustomerTracking')} />
              <ActionCard icon="list-outline" label="All Orders" color="#635BFF" onPress={() => navigate('Orders')} />
              <ActionCard icon="people-outline" label="Drivers" color="#06B6D4" onPress={() => navigate('Drivers')} />
              <ActionCard icon="car-outline" label="Vehicles" color="#F97316" onPress={() => navigate('Vehicles')} />
              <ActionCard icon="person-outline" label="Customers" color="#8B5CF6" onPress={() => navigate('Customers')} />
            </View>
          </View>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Orders</Text>
          </View>

          {recentOrders.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="cube-outline" size={48} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>No orders yet</Text>
              <Text style={styles.emptySubtitle}>Orders will appear here as they come in</Text>
            </View>
          ) : (
<View style={styles.ordersList}>
              {recentOrders.map((order) => (
                <TouchableOpacity
                  key={order.id}
                  style={styles.orderCard}
                  onPress={() => navigate('OrderDetails', { orderId: order.id   })}
                  activeOpacity={0.85}
                >
                  <View style={styles.orderHeader}>
                    <Text style={styles.orderNumber}>{order.orderNumber}</Text>
                    <Text style={styles.orderStatus}>{order.status}</Text>
                  </View>
                  <Text style={styles.orderRoute}>{order.pickupAddress} → {order.deliveryAddress}</Text>
                  <View style={styles.orderFooter}>
                    <Text style={styles.orderAmount}>₹{order.amount.toLocaleString()}</Text>
                    <Text style={styles.orderDate}>{new Date(order.createdAt).toLocaleDateString()}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
};

const ActionCard = ({ icon, label, color, onPress }: { icon: ComponentProps<typeof Ionicons>['name']; label: string; color: string; onPress: () => void }) => {
  const { colors, spacing, radii, fonts, shadows } = useAppTheme();
  const actionStyles = StyleSheet.create({
    actionCard: { flex: 1, minWidth: '45%', padding: 16, alignItems: 'center', gap: 8 },
    actionIcon: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
    actionLabel: { fontWeight: '700', textAlign: 'center' },
  });
  return (
    <TouchableOpacity style={[actionStyles.actionCard, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]} onPress={onPress} activeOpacity={0.85}>
      <View style={[actionStyles.actionIcon, { backgroundColor: `${color}15`, borderRadius: radii.md }]}><Ionicons name={icon} size={24} color={color} /></View>
      <Text style={[actionStyles.actionLabel, { color: colors.textPrimary, fontSize: fonts.size.sm }]}>{label}</Text>
    </TouchableOpacity>
  );
};

export default EmployeeDashboardScreen;
