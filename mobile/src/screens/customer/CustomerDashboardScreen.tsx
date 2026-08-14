import { ComponentProps, useEffect, useState } from 'react';
import { Animated, StyleSheet, ScrollView, Text, TouchableOpacity, View, Alert, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/useAppTheme';
import { useAuthStore } from '../../store/authStore';
import { useUserStore } from '../../store/userStore';
import { Header } from '../../components/Header';
import { StatCard } from '../../components/StatCard';
import { ActionButton } from '../../components/ActionButton';
import { StatusBadge } from '../../components/StatusBadge';
import { api } from '../../api/client';
import { ENDPOINTS } from '../../api/endpoints';
import { useAppNav } from '../../hooks/useAppNav';

type IconName = ComponentProps<typeof Ionicons>['name'];

export const CustomerDashboardScreen = () => {
  const { colors, spacing, radii, fonts, shadows } = useAppTheme();
  const { openDrawer, goToNotifications, navigation, navigate } = useAppNav();
  const styles = StyleSheet.create({
    safe: { flex: 1 },
    headerContainer: { paddingTop: 8 },
    header: { paddingHorizontal: spacing.lg, paddingBottom: 8 },
    greetingSection: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: 4 },
    greeting: { fontSize: fonts.size.xl, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.5 },
    subtitle: { fontSize: fonts.size.sm, fontWeight: '500', color: colors.textSecondary },
    scrollContent: { paddingBottom: 100, paddingHorizontal: spacing.lg },
    statsGrid: { paddingHorizontal: spacing.lg, gap: spacing.md, marginBottom: spacing.xl },
    quickActions: { marginBottom: spacing.xl },
    sectionTitle: { fontSize: fonts.size.lg, fontWeight: '800', color: colors.textPrimary, marginBottom: spacing.md },
    actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
    actionCard: { flex: 1, minWidth: '45%', padding: 16, alignItems: 'center', gap: 8 },
    actionIcon: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
    actionLabel: { fontWeight: '700', textAlign: 'center' },
    sectionHeader: { paddingHorizontal: spacing.lg, marginTop: spacing.xl, marginBottom: spacing.md },
    emptyState: { alignItems: 'center', padding: 32, backgroundColor: colors.surface, borderRadius: radii.xl, marginHorizontal: spacing.lg, ...shadows.md, gap: 16 },
    emptyTitle: { fontSize: fonts.size.md, fontWeight: '700', color: colors.textSecondary },
    emptySubtitle: { fontSize: fonts.size.sm, color: colors.textMuted, textAlign: 'center' },
    ordersList: { gap: spacing.md },
    orderCard: { backgroundColor: colors.surface, borderRadius: radii.lg, padding: 16, ...shadows.sm },
    orderHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    orderNumber: { fontSize: fonts.size.md, fontWeight: '800', color: colors.textPrimary },
    orderRoute: { color: colors.textSecondary, fontSize: fonts.size.sm, marginBottom: 8 },
    orderFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    orderAmount: { fontSize: fonts.size.lg, fontWeight: '800', color: colors.textPrimary },
    orderDate: { fontSize: fonts.size.sm, color: colors.textMuted },
  });
  const user = useUserStore((state) => state.user);
  const accessToken = useAuthStore((state) => state.accessToken);

  const [stats, setStats] = useState({
    totalOrders: 0,
    activeOrders: 0,
    completedOrders: 0,
    totalSpent: 0,
  });
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [fadeAnim] = useState(new Animated.Value(0));
  const [slideAnim] = useState(new Animated.Value(50));

  const fetchDashboard = async () => {
    if (!accessToken) return;
    try {
      const [statsRes, ordersRes] = await Promise.all([
        api.get(`${ENDPOINTS.customer}/dashboard/stats`),
        api.get(`${ENDPOINTS.customer}/orders`, { params: { page: 1, pageSize: 5 } }),
      ]);
      setStats(statsRes.data.data);
      setRecentOrders(ordersRes.data.data.items || []);
    } catch (error) {
      console.error('Failed to fetch customer dashboard:', error);
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
            {[1,2,3,4].map((i) => <StatCard key={i} title="Loading" value="..." icon="cube-outline" color="#635BFF" />)}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const greeting = `Hi, ${user?.fullName?.split(' ')[0] ?? 'there'}`;

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
            <Text style={styles.subtitle}>Track your deliveries and manage orders</Text>
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
            <StatCard title="Active" value={stats.activeOrders.toLocaleString()} icon="navigate-outline" color="#F59E0B" />
            <StatCard title="Completed" value={stats.completedOrders.toLocaleString()} icon="checkmark-circle-outline" color="#10B981" />
            <StatCard title="Total Spent" value={`₹${stats.totalSpent.toLocaleString()}`} icon="cash-outline" color="#8B5CF6" />
          </View>

          <View style={styles.quickActions}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Quick Actions</Text>
            <View style={styles.actionsGrid}>
              <ActionCard icon="search-outline" label="Track Shipment" color="#635BFF" onPress={() => navigate('CustomerTracking')} />
              <ActionCard icon="cube-outline" label="My Shipments" color="#8B5CF6" onPress={() => navigate('MyOrders')} />
            </View>
          </View>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Shipments</Text>
          </View>

          {recentOrders.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="cube-outline" size={48} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>No shipments yet</Text>
              <Text style={styles.emptySubtitle}>Track a GR number to follow a delivery, or check back after placing one.</Text>
              <ActionButton label="Track Shipment" icon="search" variant="primary" size="md" onPress={() => navigate('CustomerTracking')} />
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
                    <StatusBadge status={order.status} size="sm" />
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

const ActionCard = ({ icon, label, color, onPress }: { icon: IconName; label: string; color: string; onPress: () => void }) => {
  const { colors, spacing, radii, fonts, shadows } = useAppTheme();
  return (
    <TouchableOpacity style={[{ flex: 1, minWidth: '45%', padding: 16, alignItems: 'center', gap: 8 }, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]} onPress={onPress} activeOpacity={0.85}>
      <View style={[{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }, { backgroundColor: `${color}15`, borderRadius: radii.md }]}><Ionicons name={icon} size={24} color={color} /></View>
      <Text style={[{ fontWeight: '700', textAlign: 'center' }, { color: colors.textPrimary, fontSize: fonts.size.sm }]}>{label}</Text>
    </TouchableOpacity>
  );
};

export default CustomerDashboardScreen;
