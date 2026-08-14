import { useEffect, useState, useCallback, type ComponentProps } from 'react';
import { Animated, Alert, Linking, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/useAppTheme';
import { useAuthStore } from '../../store/authStore';
import { useUserStore } from '../../store/userStore';
import { formatCurrency, formatNumber } from '../../utils/format';
import { api } from '../../api/client';
import { ENDPOINTS } from '../../api/endpoints';

const SUPPORT_EMAIL = 'jobpilotdesk@gmail.com';
const SUPPORT_PHONE = '7456849590';
import { StatCard } from '../../components/StatCard';
import { OrderCard } from '../../components/OrderCard';
import { Header } from '../../components/Header';
import { ShimmerCard } from '../../components/ShimmerCard';
import { FloatingActionButton } from '../../components/FloatingActionButton';
import { EmptyState } from '../../components/EmptyState';
import { StatusBadge } from '../../components/StatusBadge';
import { useAppNav } from '../../hooks/useAppNav';

interface DriverStats {
  todayDeliveries: number;
  completedToday: number;
  pendingDeliveries: number;
  earningsToday: number;
  totalEarnings: number;
  rating: number;
  currentVehicle?: {
    id: string;
    plate: string;
    type: string;
    fuelLevel: number;
  };
}

interface DeliveryOrder {
  id: string;
  orderNumber: string;
  customerName: string;
  customerPhone?: string;
  status: string;
  amount: number;
  createdAt: string;
  pickupAddress: string;
  deliveryAddress: string;
  distance: number;
  estimatedTime: string;
}

export const DriverDashboardScreen = () => {
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
    scrollContent: { paddingBottom: 100, paddingHorizontal: spacing.lg },
    statsGrid: { paddingHorizontal: spacing.lg, gap: spacing.md, marginBottom: spacing.lg },
    statCard: { borderRadius: radii.lg },
    vehicleCard: { marginBottom: spacing.lg },
    vehicleHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    vehicleIcon: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
    vehicleInfo: { flex: 1, gap: 2 },
    vehicleTitle: { fontWeight: '800', fontSize: fonts.size.md },
    vehicleSubtitle: { fontWeight: '500', fontSize: fonts.size.sm },
    fuelBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6 },
    fuelText: { fontWeight: '700', fontSize: fonts.size.sm },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, marginTop: spacing.xl, marginBottom: spacing.md },
    sectionTitle: { fontSize: fonts.size.lg, fontWeight: '800', color: colors.textPrimary },
    sectionAction: { fontSize: fonts.size.sm, fontWeight: '600', color: colors.primary },
    ordersList: { gap: spacing.md },
    orderCardShimmer: { marginBottom: spacing.md, borderRadius: radii.lg },
    sectionTitleShimmer: { width: 150, height: 24, borderRadius: radii.sm },
    quickActions: { marginTop: spacing.xl },
    actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.md },
    actionCard: { flex: 1, minWidth: '45%', padding: 16, alignItems: 'center', gap: 8 },
    actionIcon: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
    actionLabel: { fontWeight: '700', textAlign: 'center' },
  });

  const ActionCard = ({ icon, label, color, onPress }: { icon: ComponentProps<typeof Ionicons>['name']; label: string; color: string; onPress: () => void }) => {
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
      </TouchableOpacity>
    );
  };

  const [stats, setStats] = useState<DriverStats | null>(null);
  const [todayDeliveries, setTodayDeliveries] = useState<DeliveryOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fadeAnim] = useState(new Animated.Value(0));
  const [slideAnim] = useState(new Animated.Value(50));

  const fetchDashboardData = useCallback(async () => {
    if (!accessToken) return;
    try {
      const [statsRes, deliveriesRes] = await Promise.all([
        api.get(`${ENDPOINTS.driver}/dashboard/stats`, { headers: { Authorization: `Bearer ${accessToken}` } }),
        api.get(`${ENDPOINTS.driver}/deliveries/today`, { headers: { Authorization: `Bearer ${accessToken}` } }),
      ]);
      setStats(statsRes.data.data);
      setTodayDeliveries(deliveriesRes.data.data.items || []);
    } catch (error) {
      console.error('Failed to fetch driver dashboard:', error);
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

  const greeting = `Good ${new Date().getHours() < 12 ? 'Morning' : new Date().getHours() < 17 ? 'Afternoon' : 'Evening'}, ${user?.fullName?.split(' ')[0] ?? 'Driver'}`;

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
            {[1,2,3,4].map((i) => <ShimmerCard key={i} style={styles.statCard} />)}
          </View>
          <View style={styles.sectionHeader}>
            <ShimmerCard style={styles.sectionTitleShimmer} />
          </View>
          <ShimmerCard style={styles.orderCardShimmer} height={130} />
          <ShimmerCard style={styles.orderCardShimmer} height={130} />
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
            <Text style={styles.subtitle}>Ready to deliver? Here's your day at a glance</Text>
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
              title="Today's Deliveries"
              value={formatNumber(stats?.todayDeliveries || 0)}
              icon="navigate-outline"
              color="#635BFF"
              trend={{ value: stats?.completedToday || 0, label: 'completed' }}
            />
            <StatCard
              title="Pending"
              value={formatNumber(stats?.pendingDeliveries || 0)}
              icon="time-outline"
              color="#F59E0B"
            />
            <StatCard
              title="Earnings Today"
              value={formatCurrency(stats?.earningsToday || 0)}
              icon="cash-outline"
              color="#10B981"
              trend={{ value: 12.5, label: 'vs yesterday', isPercentage: true }}
            />
            <StatCard
              title="Rating"
              value={stats?.rating ? stats.rating.toFixed(1) : '5.0'}
              icon="star-outline"
              color="#F97316"
            />
          </View>

          {stats?.currentVehicle && (
            <View style={styles.vehicleCard}>
              <View style={styles.vehicleHeader}>
                <View style={[styles.vehicleIcon, { backgroundColor: colors.primarySoft, borderRadius: radii.md }]}>
                  <Ionicons name="car-outline" size={24} color={colors.primary} />
                </View>
                <View style={styles.vehicleInfo}>
                  <Text style={[styles.vehicleTitle, { color: colors.textPrimary }]}>Current Vehicle</Text>
                  <Text style={[styles.vehicleSubtitle, { color: colors.textSecondary }]}>{stats.currentVehicle.plate} · {stats.currentVehicle.type}</Text>
                </View>
                <View style={[styles.fuelBadge, { backgroundColor: stats.currentVehicle.fuelLevel > 30 ? '#10B98115' : '#F59E0B15', borderRadius: radii.pill }]}>
                  <Ionicons name={stats.currentVehicle.fuelLevel > 30 ? 'battery-full' : 'battery-dead'} size={14} color={stats.currentVehicle.fuelLevel > 30 ? '#10B981' : '#F59E0B'} />
                  <Text style={[styles.fuelText, { color: stats.currentVehicle.fuelLevel > 30 ? '#10B981' : '#F59E0B' }]}>{Math.round(stats.currentVehicle.fuelLevel)}%</Text>
                </View>
              </View>
            </View>
          )}

          <View style={styles.sectionHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={styles.sectionTitle}>Today's Deliveries</Text>
              <View style={{ backgroundColor: '#0F172A', paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.pill }}>
                <Text style={{ color: '#F97316', fontSize: 10, fontWeight: '800', letterSpacing: 0.3 }}>GR</Text>
              </View>
            </View>
            <Text style={styles.sectionAction}>View All</Text>
          </View>

          {todayDeliveries.length === 0 ? (
            <EmptyState
              icon="navigate-outline"
              title="No deliveries today"
              subtitle="Enjoy your free time! New deliveries will appear here."
              iconColor="#06B6D4"
            />
          ) : (
            <View style={styles.ordersList}>
              {todayDeliveries.map((delivery) => (
                <OrderCard
                  key={delivery.id}
                  order={delivery as never}
                  compact
                  onPress={() => navigate('OrderDetails', { orderId: delivery.id   })}
                />
              ))}
            </View>
          )}

          <View style={styles.quickActions}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Quick Actions</Text>
            <View style={styles.actionsGrid}>
<ActionCard
                icon="navigate-outline"
                label="Start Navigation"
                color="#3B82F6"
                onPress={() => {
                  const next = todayDeliveries.find((d) => d.status === 'assigned' || d.status === 'picked_up');
                  if (next) navigate('Navigation', { orderId: next.id   });
                  else Alert.alert('No Active Delivery', 'Start navigation when you accept a new delivery.');
                }}
              />
              <ActionCard
                icon="camera-outline"
                label="Capture Proof"
                color="#8B5CF6"
                onPress={() => {
                  const active = todayDeliveries.find((d) => d.status === 'picked_up');
                  if (active) navigate('DeliveryProof', { orderId: active.id   });
                  else Alert.alert('No Delivery in Progress', 'Proof can be captured only for an active delivery.');
                }}
              />
              <ActionCard
                icon="call-outline"
                label="Call Customer"
                color="#06B6D4"
                onPress={() => {
                  const active = todayDeliveries[0];
                  if (!active) { Alert.alert('No Customers', 'There is no active delivery to call right now.'); return; }
                  Alert.alert('Call Customer', `Call ${active.customerName}?`, [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Call', onPress: () => Linking.openURL(`tel:${active.customerPhone || ''}`).catch(() => {}) },
                  ]);
                }}
              />
              <ActionCard
                icon="chatbubbles-outline"
                label="Chat Support"
                color="#F97316"
                onPress={() => {
                  Alert.alert('Contact Support', `Reach us anytime at:\n\n📧 ${SUPPORT_EMAIL}\n📞 +91 ${SUPPORT_PHONE}`, [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Call', onPress: () => Linking.openURL(`tel:${SUPPORT_PHONE}`).catch(() => {}) },
                    { text: 'Email', onPress: () => Linking.openURL(`mailto:${SUPPORT_EMAIL}`).catch(() => {}) },
                  ]);
                }}
              />
            </View>
          </View>
        </Animated.View>
      </ScrollView>

<FloatingActionButton
        icon="navigate"
        onPress={() => {
          const next = todayDeliveries.find((d) => d.status === 'assigned' || d.status === 'picked_up');
          if (next) navigate('Navigation', { orderId: next.id   });
          else Alert.alert('No Active Delivery', 'Start navigation when you accept a new delivery.');
        }}
        label="Navigate"
        color="#3B82F6"
      />
    </SafeAreaView>
  );
};

export default DriverDashboardScreen;
