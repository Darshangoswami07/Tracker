import { useEffect, useState, type ComponentProps } from 'react';
import { Animated, Alert, StyleSheet, Text, TouchableOpacity, View, ScrollView, RefreshControl, Linking, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/useAppTheme';
import { useAppNav } from '../../hooks/useAppNav';
import { useAuthStore } from '../../store/authStore';
import { api } from '../../api/client';
import { Header } from '../../components/Header';
import { ShimmerCard } from '../../components/ShimmerCard';
import { StatusBadge } from '../../components/StatusBadge';
import { ActionButton } from '../../components/ActionButton';
import { StatCard } from '../../components/StatCard';
import { formatDateTime } from '../../utils/format';
import type { AppTheme } from '../../theme/types';

interface DriverDetail {
  id: string;
  fullName: string;
  phone: string;
  email: string;
  licenseNumber: string;
  licenseExpiry: string;
  vehiclePlate?: string;
  vehicleType?: string;
  vehicleId?: string;
  status: string;
  rating: number;
  completedOrders: number;
  totalEarnings: number;
  isOnline: boolean;
  lastLocation?: { lat: number; lng: number; timestamp: string };
  companyName: string;
  assignedOrders: Array<{
    id: string;
    orderNumber: string;
    status: string;
    pickupAddress: string;
    deliveryAddress: string;
  }>;
}

export const DriverDetailsScreen = ({ route }: any) => {
  const { driverId } = route.params;
  const { colors, spacing, radii, fonts, shadows } = useAppTheme();
  const { goBack, role, navigate } = useAppNav();
  const accessToken = useAuthStore((state) => state.accessToken);
  const isEmployee = role === 'employee' || role === 'dispatcher';
  const driversBase = isEmployee ? 'employee' : 'business';

  const styles = createStyles({ colors, spacing, radii, fonts, shadows });

  const [driver, setDriver] = useState<DriverDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fadeAnim] = useState(new Animated.Value(0));
  const [slideAnim] = useState(new Animated.Value(20));

  const fetchDriver = async (isRefresh = false) => {
    if (!accessToken || !driverId) return;
    try {
      const res = await api.get(`/${driversBase}/drivers/${driverId}`);
      setDriver(res.data.data);
    } catch (error) {
      console.error('Failed to fetch driver:', error);
      Alert.alert('Error', 'Failed to load driver details');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchDriver(true);
  };

  useEffect(() => {
    fetchDriver();
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: Platform.OS !== 'web' }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  const getStatusConfig = (status: string) => {
    switch (status.toLowerCase()) {
      case 'available': return { color: '#10B981', icon: 'wifi-outline', label: 'Available' };
      case 'busy': return { color: '#F59E0B', icon: 'navigate-outline', label: 'Busy' };
      case 'offline': return { color: '#6B7280', icon: 'wifi-off-outline', label: 'Offline' };
      default: return { color: colors.textMuted, icon: 'help-outline', label: status };
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <Header title="Driver Details" leftAction={{ icon: 'chevron-back', onPress: goBack }} />
        </View>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <ShimmerCard style={styles.cardShimmer} height={200} />
          <ShimmerCard style={styles.cardShimmer} height={150} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (!driver) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <Header title="Driver Details" leftAction={{ icon: 'chevron-back', onPress: goBack }} />
        </View>
      </SafeAreaView>
    );
  }

  const statusConfig = getStatusConfig(driver.status);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <Animated.View style={styles.headerContainer}>
        <View style={styles.header}>
          <Header
            title={driver.fullName}
            leftAction={{ icon: 'chevron-back', onPress: goBack }}
            rightAction={{ icon: 'create-outline', onPress: () => Alert.alert('Edit Driver', `Editing ${driver.fullName} is managed through the admin portal.`) }}
          />
        </View>
        <Animated.View
          style={{
            transform: [{ translateY: slideAnim }],
            opacity: fadeAnim,
          }}
        >
          <View style={styles.driverHeader}>
            <View style={[styles.avatarLarge, { backgroundColor: colors.primarySoft, borderRadius: radii.pill }]}>
              <Text style={[styles.avatarTextLarge, { color: colors.primary }]}>{driver.fullName.charAt(0)}</Text>
            </View>
            <View style={styles.driverMainInfo}>
              <View style={styles.driverTopRow}>
                <Text style={[styles.driverNameLarge, { color: colors.textPrimary }]}>{driver.fullName}</Text>
                <StatusBadge status={driver.status} size="md" />
              </View>
              <View style={styles.driverMeta}>
                <View style={styles.metaItem}>
                  <Ionicons name="mail-outline" size={16} color={colors.textMuted} />
                  <Text style={{ color: colors.textSecondary, fontSize: fonts.size.sm }}>{driver.email}</Text>
                </View>
                <View style={styles.metaItem}>
                  <Ionicons name="call-outline" size={16} color={colors.textMuted} />
                  <Text style={{ color: colors.textSecondary, fontSize: fonts.size.sm }}>{driver.phone}</Text>
                </View>
              </View>
            </View>
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
          <View style={styles.statusCard}>
            <View style={styles.statusRow}>
              <View style={styles.statusItem}>
                <Text style={[styles.statusLabel, { color: colors.textMuted }]}>Online Status</Text>
                <View style={styles.statusValueRow}>
                  <View style={[styles.statusDot, { backgroundColor: driver.isOnline ? '#10B981' : '#6B7280' }]} />
                  <Text style={[styles.statusValue, { color: driver.isOnline ? '#10B981' : '#6B7280' }]}>{driver.isOnline ? 'Online' : 'Offline'}</Text>
                </View>
              </View>
              <View style={styles.statusItem}>
                <Text style={[styles.statusLabel, { color: colors.textMuted }]}>Work Status</Text>
                <StatusBadge status={driver.status} size="md" />
              </View>
              <View style={styles.statusItem}>
                <Text style={[styles.statusLabel, { color: colors.textMuted }]}>Company</Text>
                <Text style={[styles.statusValue, { color: colors.textPrimary }]}>{driver.companyName}</Text>
              </View>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Performance</Text>
            <View style={styles.statGrid}>
              <StatCard
                title="Rating"
                value={driver.rating.toFixed(1)}
                icon="star"
                color="#F59E0B"
              />
              <StatCard
                title="Completed Orders"
                value={driver.completedOrders.toLocaleString()}
                icon="checkmark-circle-outline"
                color="#10B981"
              />
              <StatCard
                title="Total Earnings"
                value={`₹${driver.totalEarnings.toLocaleString()}`}
                icon="cash-outline"
                color="#8B5CF6"
              />
            </View>
          </View>

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>License & Documents</Text>
            <View style={styles.infoRow}>
              <InfoCard icon="card-outline" label="License Number" value={driver.licenseNumber} color="#635BFF" />
              <InfoCard icon="calendar-outline" label="License Expiry" value={driver.licenseExpiry.split('T')[0]} color="#F59E0B" />
            </View>
          </View>

          {driver.vehiclePlate && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Assigned Vehicle</Text>
              <View style={[styles.vehicleCard, { backgroundColor: colors.surface, borderRadius: radii.xl, ...shadows.sm }]}>
                <View style={styles.vehicleRow}>
                  <View style={[styles.vehicleIcon, { backgroundColor: '#F9731615', borderRadius: radii.md }]}>
                    <Ionicons name="car-sport-outline" size={24} color="#F97316" />
                  </View>
                  <View style={styles.vehicleInfo}>
                    <Text style={[styles.vehiclePlateText, { color: colors.textPrimary }]}>{driver.vehiclePlate}</Text>
                    <Text style={[styles.vehicleTypeText, { color: colors.textSecondary }]}>{driver.vehicleType || 'N/A'}</Text>
                  </View>
                </View>
              </View>
            </View>
          )}

          {driver.lastLocation && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Last Known Location</Text>
              <View style={[styles.locationCard, { backgroundColor: colors.surface, borderRadius: radii.xl, ...shadows.sm }]}>
                <View style={styles.locationRow}>
                  <View style={[styles.locationIcon, { backgroundColor: '#06B6D415', borderRadius: radii.md }]}>
                    <Ionicons name="location-outline" size={24} color="#06B6D4" />
                  </View>
                  <View style={styles.locationInfo}>
                    <Text style={[styles.locationLabel, { color: colors.textMuted }]}>Last Updated</Text>
                    <Text style={[styles.locationTime, { color: colors.textPrimary }]}>{formatDateTime(driver.lastLocation.timestamp)}</Text>
                  </View>
                  <TouchableOpacity style={styles.locationAction}>
                    <Ionicons name="navigate" size={24} color="#635BFF" />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}

          {driver.assignedOrders.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Current Assignments</Text>
              </View>
              <View style={styles.ordersList}>
                {driver.assignedOrders.map((order) => (
                  <TouchableOpacity key={order.id} style={styles.orderItem} onPress={() => navigate('OrderDetails', { orderId: order.id })}>
                    <View style={styles.orderInfo}>
                      <Text style={[styles.orderNumber, { color: colors.textPrimary }]}>{order.orderNumber}</Text>
                      <StatusBadge status={order.status} size="sm" />
                    </View>
                    <View style={styles.orderRoute}>
                      <Text style={{ color: colors.textSecondary, fontSize: fonts.size.sm }}>{order.pickupAddress}</Text>
                      <Text style={{ color: colors.textSecondary, fontSize: fonts.size.sm }}>{order.deliveryAddress}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          <View style={styles.actionsSection}>
            <ActionButton label="Call Driver" icon="call" variant="primary" size="lg" fullWidth onPress={() => Linking.openURL(`tel:${driver.phone}`).catch(() => {})} />
            <ActionButton label="Send Message" icon="chatbubble" variant="secondary" size="lg" fullWidth onPress={() => Linking.openURL(`sms:${driver.phone}`).catch(() => {})} />
            <ActionButton label="View on Map" icon="navigate" variant="outline" size="lg" fullWidth onPress={() => {
              if (driver.lastLocation) {
                Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${driver.lastLocation.lat},${driver.lastLocation.lng}`).catch(() => {});
              } else {
                Alert.alert('No Location', `Live location for ${driver.fullName} is not available right now.`);
              }
            }} />
          </View>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
};

const InfoCard = ({ icon, label, value, color }: { icon: ComponentProps<typeof Ionicons>['name']; label: string; value: string; color: string }) => {
  const { colors, spacing, radii, fonts, shadows } = useAppTheme();
  const styles = createStyles({ colors, spacing, radii, fonts, shadows });
  return (
    <View style={[styles.infoCard, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}>
      <View style={[styles.infoIcon, { backgroundColor: `${color}15`, borderRadius: radii.md }]}>
        <Ionicons name={icon} size={22} color={color} />
      </View>
      <Text style={[styles.infoLabel, { color: colors.textMuted, fontSize: fonts.size.xs }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: colors.textPrimary, fontSize: fonts.size.md }]}>{value}</Text>
    </View>
  );
};

const createStyles = (theme: Pick<AppTheme, 'colors' | 'spacing' | 'radii' | 'fonts' | 'shadows'>) =>
  StyleSheet.create({
    safe: { flex: 1 },
    headerContainer: { paddingTop: 8 },
    header: { paddingHorizontal: theme.spacing.lg, paddingBottom: 8 },
    scrollContent: { paddingBottom: 40, paddingHorizontal: theme.spacing.lg },
    driverHeader: { flexDirection: 'row', gap: 16, marginBottom: theme.spacing.xl, paddingHorizontal: theme.spacing.lg },
    avatarLarge: { width: 80, height: 80, alignItems: 'center', justifyContent: 'center' },
    avatarTextLarge: { fontSize: 32, fontWeight: '800' },
    driverMainInfo: { flex: 1, gap: 8 },
    driverTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    driverNameLarge: { fontSize: theme.fonts.size.xxl, fontWeight: '800' },
    driverMeta: { flexDirection: 'row', gap: 16 },
    metaItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    statusCard: { backgroundColor: theme.colors.surface, borderRadius: theme.radii.xl, padding: 20, marginHorizontal: theme.spacing.lg, marginBottom: theme.spacing.xl, ...theme.shadows.md },
    statusRow: { flexDirection: 'row', justifyContent: 'space-between' },
    statusItem: { flex: 1, alignItems: 'center', gap: 8 },
    statusLabel: { fontSize: theme.fonts.size.xs, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, color: theme.colors.textMuted },
    statusValue: { fontSize: theme.fonts.size.md, fontWeight: '700' },
    statusValueRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    statusDot: { width: 10, height: 10, borderRadius: 5 },
    section: { marginBottom: theme.spacing.xl },
    sectionTitle: { fontSize: theme.fonts.size.md, fontWeight: '800', color: theme.colors.textPrimary, marginBottom: theme.spacing.md },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.md },
    statGrid: { flexDirection: 'row', gap: theme.spacing.md },
    infoRow: { flexDirection: 'row', gap: theme.spacing.md },
    infoCard: { flex: 1, padding: 16, alignItems: 'center', gap: 8, backgroundColor: theme.colors.surface, borderRadius: theme.radii.lg, ...theme.shadows.sm },
    infoIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    infoLabel: { fontSize: theme.fonts.size.xs, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, color: theme.colors.textMuted },
    infoValue: { fontSize: theme.fonts.size.md, fontWeight: '700', color: theme.colors.textPrimary },
    vehicleCard: { padding: 16, gap: 12 },
    vehicleRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    vehicleIcon: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
    vehicleInfo: { flex: 1, gap: 4 },
    vehiclePlateText: { fontSize: theme.fonts.size.lg, fontWeight: '800' },
    vehicleTypeText: { fontSize: theme.fonts.size.md, fontWeight: '500' },
    locationCard: { padding: 16, gap: 12 },
    locationRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    locationIcon: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
    locationInfo: { flex: 1, gap: 4 },
    locationLabel: { fontSize: theme.fonts.size.xs, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, color: theme.colors.textMuted },
    locationTime: { fontSize: theme.fonts.size.md, fontWeight: '700', color: theme.colors.textPrimary },
    locationAction: { width: 44, height: 44, borderRadius: theme.radii.md, backgroundColor: '#635BFF15', alignItems: 'center', justifyContent: 'center' },
    ordersList: { gap: theme.spacing.md },
    orderItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: theme.colors.surface, borderRadius: theme.radii.lg, ...theme.shadows.sm },
    orderInfo: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    orderNumber: { fontSize: theme.fonts.size.md, fontWeight: '800' },
    orderRoute: { gap: 2 },
    actionsSection: { paddingHorizontal: theme.spacing.lg, marginTop: theme.spacing.xl, gap: theme.spacing.md },
    cardShimmer: { marginBottom: theme.spacing.lg, borderRadius: theme.radii.xl },
  });

export default DriverDetailsScreen;