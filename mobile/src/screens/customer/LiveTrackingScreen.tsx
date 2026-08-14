import { ComponentProps, useEffect, useState } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View, ScrollView, RefreshControl, Alert, Linking, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/useAppTheme';
import { useAuthStore } from '../../store/authStore';
import { api } from '../../api/client';
import { ENDPOINTS } from '../../api/endpoints';
import { Header } from '../../components/Header';
import { ShimmerCard } from '../../components/ShimmerCard';
import { StatCard } from '../../components/StatCard';
import { ActionButton } from '../../components/ActionButton';
import { formatCurrency } from '../../utils/format';
import { useAppNav } from '../../hooks/useAppNav';

const SUPPORT_EMAIL = 'jobpilotdesk@gmail.com';
const SUPPORT_PHONE = '7456849590';

type IconName = ComponentProps<typeof Ionicons>['name'];

export const LiveTrackingScreen = ({ route }: any) => {
  const { orderId } = route.params;
  const { colors, spacing, radii, fonts, shadows } = useAppTheme();
  const { goBack } = useAppNav();
  const styles = StyleSheet.create({
    safe: { flex: 1 },
    headerContainer: { paddingTop: 8 },
    header: { paddingHorizontal: spacing.lg, paddingBottom: 8 },
    scrollContent: { paddingBottom: 40, paddingHorizontal: spacing.lg },
    statusBar: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: spacing.lg },
    statusBadgeLarge: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
    statusLabel: { fontSize: fonts.size.lg, fontWeight: '800' },
    liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#10B98115', paddingHorizontal: 10, paddingVertical: 4, borderRadius: radii.pill, marginLeft: 'auto' },
    liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#10B981' },
    liveText: { color: '#10B981', fontWeight: '800', fontSize: fonts.size.xs },
    mapContainer: { marginBottom: spacing.xl },
    mapPlaceholder: { height: 300, backgroundColor: colors.surfaceMuted, borderRadius: radii.xl, alignItems: 'center', justifyContent: 'center', position: 'relative', ...shadows.sm },
    mapText: { color: colors.textSecondary, fontSize: fonts.size.lg, fontWeight: '600' },
    mapSubtext: { color: colors.textMuted, fontSize: fonts.size.sm, marginTop: 8, textAlign: 'center', paddingHorizontal: spacing.xl },
    driverMarker: { position: 'absolute', top: '40%', left: '50%', transform: [{ translateX: -16 }, { translateY: -16 }] },
    driverSection: { marginBottom: spacing.xl },
    sectionTitle: { fontSize: fonts.size.md, fontWeight: '800', marginBottom: spacing.md },
    driverCard: { padding: 16 },
    driverRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    avatar: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
    avatarText: { fontSize: 22, fontWeight: '800' },
    driverInfo: { flex: 1, gap: 8 },
    driverName: { fontSize: fonts.size.lg, fontWeight: '800' },
    phoneBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    vehicleInfo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    routeSection: { marginBottom: spacing.xl },
    routeCard: { backgroundColor: colors.surface, borderRadius: radii.xl, padding: 16, ...shadows.sm },
    routePoint: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    routeDot: { width: 14, height: 14, borderRadius: 7, flexShrink: 0 },
    routeLineContainer: { paddingLeft: 25, marginVertical: 8 },
    routeLine: { height: 40, width: 2, backgroundColor: '#E5E7EB' },
    etaSection: { marginBottom: spacing.xl },
    etaCard: { padding: 16 },
    etaRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
    etaIcon: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
    etaInfo: { flex: 1 },
    etaDistance: { alignItems: 'flex-end' },
    actions: { gap: spacing.md },
  });
  const accessToken = useAuthStore((state) => state.accessToken);

  const [order, setOrder] = useState<any>(null);
  const [driverLocation, setDriverLocation] = useState<{ lat: number; lng: number; timestamp: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [fadeAnim] = useState(new Animated.Value(0));
  const [slideAnim] = useState(new Animated.Value(50));

  const fetchOrderAndLocation = async () => {
    if (!accessToken || !orderId) return;
    try {
      // No live GPS-tracking endpoint exists yet (the `DriverLocation` model
      // has never been wired to an API route), so this screen shows order/
      // driver details without a live position rather than calling a route
      // that would always 404.
      const orderRes = await api.get(ENDPOINTS.orders.detail(orderId));
      setOrder(orderRes.data.data);
      setDriverLocation(null);
    } catch (error) {
      console.error('Failed to fetch tracking:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleContactSupport = () => {
    Alert.alert('Contact Support', `Reach us anytime at:\n\n📧 ${SUPPORT_EMAIL}\n📞 +91 ${SUPPORT_PHONE}`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Call', onPress: () => Linking.openURL(`tel:${SUPPORT_PHONE}`).catch(() => {}) },
      { text: 'Email', onPress: () => Linking.openURL(`mailto:${SUPPORT_EMAIL}`).catch(() => {}) },
    ]);
  };

  useEffect(() => {
    fetchOrderAndLocation();
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(slideAnim, { toValue: 0, duration: 600, useNativeDriver: Platform.OS !== 'web' }),
    ]).start();
    // Poll for live updates
    const interval = setInterval(fetchOrderAndLocation, 10000);
    return () => clearInterval(interval);
  }, [fadeAnim, slideAnim]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <Header title="Live Tracking" leftAction={{ icon: 'chevron-back', onPress: goBack }} />
        </View>
      </SafeAreaView>
    );
  }

  if (!order) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <Header title="Live Tracking" leftAction={{ icon: 'chevron-back', onPress: goBack }} />
        </View>
      </SafeAreaView>
    );
  }

  const getStatusConfig = (status: string): { color: string; icon: IconName; label: string } => {
    switch (status.toLowerCase()) {
      case 'pending': return { color: '#F59E0B', icon: 'time-outline', label: 'Pending' };
      case 'assigned': return { color: '#06B6D4', icon: 'person-add-outline', label: 'Assigned' };
      case 'picked_up': return { color: '#8B5CF6', icon: 'cube-outline', label: 'Picked Up' };
      case 'in_transit': return { color: '#3B82F6', icon: 'navigate-outline', label: 'In Transit' };
      case 'delivered': return { color: '#10B981', icon: 'checkmark-circle-outline', label: 'Delivered' };
      case 'cancelled': return { color: '#EF4444', icon: 'close-circle-outline', label: 'Cancelled' };
      default: return { color: colors.textMuted, icon: 'help-outline', label: status };
    }
  };

  const statusConfig = getStatusConfig(order.status);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <Animated.View style={styles.headerContainer}>
        <View style={styles.header}>
          <Header title="Live Tracking" leftAction={{ icon: 'chevron-back', onPress: goBack }} />
        </View>
        <Animated.View
          style={{
            transform: [{ translateY: slideAnim }],
            opacity: fadeAnim,
          }}
        >
          <View style={styles.statusBar}>
            <View style={[styles.statusBadgeLarge, { backgroundColor: statusConfig.color + '15', borderRadius: radii.lg }]}>
              <Ionicons name={statusConfig.icon} size={28} color={statusConfig.color} />
            </View>
            <Text style={[styles.statusLabel, { color: statusConfig.color }]}>{statusConfig.label}</Text>
            {driverLocation && (
              <View style={styles.liveBadge}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>LIVE</Text>
              </View>
            )}
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
          <View style={styles.mapContainer}>
            <View style={styles.mapPlaceholder}>
              <Ionicons name="map-outline" size={64} color={colors.textMuted} />
              <Text style={styles.mapText}>Map View - Driver Location</Text>
              <Text style={styles.mapSubtext}>{driverLocation ? `Last updated: ${new Date(driverLocation.timestamp).toLocaleTimeString()}` : 'Waiting for driver location...'}</Text>
              {driverLocation && (
                <View style={styles.driverMarker}>
                  <Ionicons name="navigate" size={32} color="#635BFF" />
                </View>
              )}
            </View>
          </View>

          {order.driverName && (
            <View style={styles.driverSection}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Your Driver</Text>
              <View style={[styles.driverCard, { backgroundColor: colors.surface, borderRadius: radii.xl, ...shadows.sm }]}>
                <View style={styles.driverRow}>
                  <View style={[styles.avatar, { backgroundColor: colors.primarySoft, borderRadius: radii.pill }]}>
                    <Text style={[styles.avatarText, { color: colors.primary }]}>{order.driverName.charAt(0)}</Text>
                  </View>
                  <View style={styles.driverInfo}>
                    <Text style={[styles.driverName, { color: colors.textPrimary }]}>{order.driverName}</Text>
                    {order.driverPhone && (
                      <TouchableOpacity style={styles.phoneBtn} onPress={() => order.driverPhone && Linking.openURL(`tel:${order.driverPhone}`).catch(() => {})}>
                        <Ionicons name="call" size={18} color="#10B981" />
                        <Text style={{ color: '#10B981', fontWeight: '600' }}>Call</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  {order.vehiclePlate && (
                    <View style={styles.vehicleInfo}>
                      <Ionicons name="car-outline" size={20} color={colors.textMuted} />
                      <Text style={{ color: colors.textSecondary }}>{order.vehiclePlate}</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>
          )}

          <View style={styles.routeSection}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Route</Text>
            <View style={styles.routeCard}>
              <View style={styles.routePoint}>
                <View style={[styles.routeDot, { backgroundColor: '#10B981' }]} />
                <Text style={{ color: colors.textSecondary }}>{order.pickupAddress}</Text>
              </View>
              <View style={styles.routeLineContainer}>
                <View style={styles.routeLine} />
              </View>
              <View style={styles.routePoint}>
                <View style={[styles.routeDot, { backgroundColor: '#EF4444' }]} />
                <Text style={{ color: colors.textSecondary }}>{order.deliveryAddress}</Text>
              </View>
            </View>
          </View>

          <View style={styles.etaSection}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Estimated Arrival</Text>
            <View style={[styles.etaCard, { backgroundColor: colors.surface, borderRadius: radii.xl, ...shadows.sm }]}>
              <View style={styles.etaRow}>
                <View style={[styles.etaIcon, { backgroundColor: '#3B82F615', borderRadius: radii.lg }]}>
                  <Ionicons name="time-outline" size={28} color="#3B82F6" />
                </View>
                <View style={styles.etaInfo}>
                  <Text style={{ color: colors.textMuted, fontSize: fonts.size.sm }}>Estimated Delivery</Text>
                  <Text style={{ color: colors.textPrimary, fontSize: fonts.size.xl, fontWeight: '800' }}>{order.estimatedTime || 'Calculating...'}</Text>
                </View>
                <View style={styles.etaDistance}>
                  <Text style={{ color: colors.textSecondary }}>{order.distance} km</Text>
                </View>
              </View>
            </View>
          </View>

          <View style={styles.actions}>
            <ActionButton label="Contact Driver" icon="call" variant="secondary" size="lg" fullWidth onPress={() => order.driverPhone ? Linking.openURL(`tel:${order.driverPhone}`).catch(() => {}) : Alert.alert('No Driver', 'A driver has not been assigned to this order yet.')} />
            <ActionButton label="Contact Support" icon="help" variant="outline" size="lg" fullWidth onPress={handleContactSupport} />
          </View>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
};

export default LiveTrackingScreen;