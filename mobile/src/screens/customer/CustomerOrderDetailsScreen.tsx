import { ComponentProps, useEffect, useState } from 'react';
import { Animated, Share, StyleSheet, Text, TouchableOpacity, View, Alert, ScrollView, RefreshControl, Linking, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/useAppTheme';
import { useAuthStore } from '../../store/authStore';
import { api } from '../../api/client';
import { ENDPOINTS } from '../../api/endpoints';
import { Header } from '../../components/Header';
import { ShimmerCard } from '../../components/ShimmerCard';
import { StatusBadge } from '../../components/StatusBadge';
import { ActionButton } from '../../components/ActionButton';
import { StatCard } from '../../components/StatCard';
import { Timeline } from '../../components/Timeline';
import { formatCurrency, formatDateTime } from '../../utils/format';
import { useAppNav } from '../../hooks/useAppNav';
import type { OrderAttachment } from '../../services/orderAttachments';

type IconName = ComponentProps<typeof Ionicons>['name'];

interface OrderDetails {
  id: string;
  orderNumber: string;
  status: string;
  amount: number;
  createdAt: string;
  updatedAt: string;
  pickupAddress: string;
  pickupLat?: number;
  pickupLng?: number;
  deliveryAddress: string;
  deliveryLat?: number;
  deliveryLng?: number;
  distance: number;
  weight?: number;
  dimensions?: string;
  priority: string;
  orderType: string;
  notes?: string;
  driverName?: string;
  driverPhone?: string;
  driverRating?: number;
  vehiclePlate?: string;
  vehicleType?: string;
  consignorName?: string;
  consigneeName?: string;
  particulars?: string;
  packageCount?: number;
  attachments: OrderAttachment[];
  timeline: Array<{
    id: string;
    status: string;
    description: string;
    timestamp: string;
    location?: string;
  }>;
  proofOfDelivery?: {
    imageUrl?: string;
    signatureUrl?: string;
    notes?: string;
    timestamp?: string;
  };
}

export const CustomerOrderDetailsScreen = ({ route }: any) => {
  const { orderId } = route.params;
  const { colors, spacing, radii, fonts, shadows } = useAppTheme();
  const { goBack } = useAppNav();
  const styles = StyleSheet.create({
    safe: { flex: 1 },
    headerContainer: { paddingTop: 8 },
    header: { paddingHorizontal: spacing.lg, paddingBottom: 8 },
    scrollContent: { paddingBottom: 40, paddingHorizontal: spacing.lg },
    statusCard: { backgroundColor: colors.surface, borderRadius: radii.xl, padding: 20, marginHorizontal: spacing.lg, marginBottom: spacing.lg, ...shadows.md },
    statusHeader: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 16 },
    statusBadgeLarge: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center' },
    statusInfo: { flex: 1 },
    statusLabel: { fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
    statusValue: { fontWeight: '800' },
    statusMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
    metaItem: { fontSize: fonts.size.sm, fontWeight: '500' },
    section: { marginBottom: spacing.lg },
    sectionTitle: { fontSize: fonts.size.md, fontWeight: '800', marginBottom: spacing.md },
    amount: { fontWeight: '800' },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
    infoCard: { flex: 1, minWidth: '45%', padding: 16, gap: 12, backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm },
    infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    infoIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    infoLabel: { fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
    infoValue: { fontWeight: '600' },
    driverCard: { padding: 16, gap: 12 },
    driverRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    avatar: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
    avatarText: { fontSize: 18, fontWeight: '800' },
    driverInfo: { flex: 1, gap: 2 },
    driverName: { fontWeight: '800' },
    phoneBtn: { padding: 8, backgroundColor: '#10B98115', borderRadius: radii.md },
    ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 60 },
    vehicleInfo: { gap: 4, borderLeftWidth: 2, borderLeftColor: '#F3F4F6', paddingLeft: 16, marginLeft: 24 },
    vehicleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    vehicleText: { fontWeight: '600' },
    vehicleType: { fontWeight: '500' },
    notesCard: { padding: 16 },
    notesText: { fontSize: fonts.size.md, lineHeight: 24 },
    proofCard: { padding: 16, gap: 16 },
    proofImage: { gap: 8 },
    proofLabel: { fontWeight: '700', color: colors.textSecondary, fontSize: fonts.size.sm },
    imagePlaceholder: { height: 150, backgroundColor: colors.surfaceMuted, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center' },
    proofNotes: { fontSize: fonts.size.md },
    proofTime: { fontWeight: '500' },
    cardShimmer: { marginBottom: spacing.lg, borderRadius: radii.xl },
  });
  const accessToken = useAuthStore((state) => state.accessToken);

  const [order, setOrder] = useState<OrderDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fadeAnim] = useState(new Animated.Value(0));
  const [slideAnim] = useState(new Animated.Value(20));

  const fetchOrder = async (isRefresh = false) => {
    if (!accessToken || !orderId) return;
    try {
      const res = await api.get(ENDPOINTS.orders.detail(orderId), {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      setOrder(res.data.data);
    } catch (error) {
      console.error('Failed to fetch order:', error);
      Alert.alert('Error', 'Failed to load order details');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchOrder(true);
  };

  const rateDriver = () => {
    const setRating = (rating: number) => {
      Alert.alert('Thanks!', `You rated your driver ${rating} ${'⭐'.repeat(rating)}. This will be reflected in their profile.`);
    };
    Alert.alert('Rate Driver', 'How was your experience?', [
      { text: 'Cancel', style: 'cancel' },
      { text: '1 ⭐', onPress: () => setRating(1) },
      { text: '2 ⭐', onPress: () => setRating(2) },
      { text: '3 ⭐', onPress: () => setRating(3) },
      { text: '4 ⭐', onPress: () => setRating(4) },
      { text: '5 ⭐', onPress: () => setRating(5) },
    ]);
  };

  useEffect(() => {
    fetchOrder();
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: Platform.OS !== 'web' }),
    ]).start();
  }, [fadeAnim, slideAnim]);

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

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <Header title="Order Details" leftAction={{ icon: 'chevron-back', onPress: goBack }} />
        </View>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <ShimmerCard style={styles.cardShimmer} height={200} />
          <ShimmerCard style={styles.cardShimmer} height={150} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (!order) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <Header title="Order Details" leftAction={{ icon: 'chevron-back', onPress: goBack }} />
        </View>
      </SafeAreaView>
    );
  }

  const statusConfig = getStatusConfig(order.status);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <Animated.View style={styles.headerContainer}>
        <View style={styles.header}>
          <Header title={order.orderNumber} leftAction={{ icon: 'chevron-back', onPress: goBack }} rightAction={{ icon: 'share-outline', onPress: () => Share.share({ message: `DeliveryHub order ${order.orderNumber} — ${order.pickupAddress} → ${order.deliveryAddress}` }).catch(() => {}) }} />
        </View>
        <Animated.View
          style={{
            transform: [{ translateY: slideAnim }],
            opacity: fadeAnim,
          }}
        >
          <View style={styles.statusCard}>
            <View style={styles.statusHeader}>
              <View style={[styles.statusBadgeLarge, { backgroundColor: statusConfig.color + '15', borderRadius: radii.lg }]}>
                <Ionicons name={statusConfig.icon} size={32} color={statusConfig.color} />
              </View>
              <View style={styles.statusInfo}>
                <Text style={[styles.statusLabel, { color: colors.textMuted, fontSize: fonts.size.xs }]}>Current Status</Text>
                <Text style={[styles.statusValue, { color: statusConfig.color, fontSize: fonts.size.xl }]}>{statusConfig.label}</Text>
              </View>
            </View>
            <View style={styles.statusMeta}>
              <Text style={[styles.metaItem, { color: colors.textSecondary }]}>Ordered: {formatDateTime(order.createdAt)}</Text>
              <Text style={[styles.metaItem, { color: colors.textSecondary }]}>Updated: {formatDateTime(order.updatedAt)}</Text>
              <Text style={[styles.metaItem, { color: colors.textSecondary }]}>Priority: {order.priority}</Text>
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
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Order Value</Text>
            <Text style={[styles.amount, { color: colors.textPrimary, fontSize: fonts.size.xxxl }]}>₹{formatCurrency(order.amount)}</Text>
          </View>

          <View style={styles.grid}>
            <View style={[styles.infoCard, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}>
              <View style={styles.infoRow}>
                <View style={[styles.infoIcon, { backgroundColor: '#10B98115', borderRadius: radii.md }]}>
                  <Ionicons name="location-outline" size={20} color="#10B981" />
                </View>
                <View>
                  <Text style={[styles.infoLabel, { color: colors.textMuted, fontSize: fonts.size.xs }]}>Pickup</Text>
                  <Text style={[styles.infoValue, { color: colors.textPrimary, fontSize: fonts.size.sm }]}>{order.pickupAddress}</Text>
                </View>
              </View>
            </View>
            <View style={[styles.infoCard, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}>
              <View style={styles.infoRow}>
                <View style={[styles.infoIcon, { backgroundColor: '#EF444415', borderRadius: radii.md }]}>
                  <Ionicons name="location-outline" size={20} color="#EF4444" />
                </View>
                <View>
                  <Text style={[styles.infoLabel, { color: colors.textMuted, fontSize: fonts.size.xs }]}>Delivery</Text>
                  <Text style={[styles.infoValue, { color: colors.textPrimary, fontSize: fonts.size.sm }]}>{order.deliveryAddress}</Text>
                </View>
              </View>
            </View>
            <View style={[styles.infoCard, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}>
              <View style={styles.infoRow}>
                <View style={[styles.infoIcon, { backgroundColor: '#635BFF15', borderRadius: radii.md }]}>
                  <Ionicons name="navigate-outline" size={20} color="#635BFF" />
                </View>
                <View>
                  <Text style={[styles.infoLabel, { color: colors.textMuted, fontSize: fonts.size.xs }]}>Distance</Text>
                  <Text style={[styles.infoValue, { color: colors.textPrimary, fontSize: fonts.size.sm }]}>{order.distance} km</Text>
                </View>
              </View>
            </View>
            <View style={[styles.infoCard, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}>
              <View style={styles.infoRow}>
                <View style={[styles.infoIcon, { backgroundColor: '#F9731615', borderRadius: radii.md }]}>
                  <Ionicons name="scale-outline" size={20} color="#F97316" />
                </View>
                <View>
                  <Text style={[styles.infoLabel, { color: colors.textMuted, fontSize: fonts.size.xs }]}>Weight</Text>
                  <Text style={[styles.infoValue, { color: colors.textPrimary, fontSize: fonts.size.sm }]}>{order.weight ? `${order.weight} kg` : 'N/A'}</Text>
                </View>
              </View>
            </View>
          </View>

          {order.driverName && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Assigned Driver</Text>
              <View style={[styles.driverCard, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}>
                <View style={styles.driverRow}>
                  <View style={[styles.avatar, { backgroundColor: colors.primarySoft, borderRadius: radii.pill }]}>
                    <Text style={[styles.avatarText, { color: colors.primary }]}>{order.driverName.charAt(0)}</Text>
                  </View>
                  <View style={styles.driverInfo}>
                    <Text style={[styles.driverName, { color: colors.textPrimary, fontSize: fonts.size.md }]}>{order.driverName}</Text>
                    {order.driverPhone && (
                      <TouchableOpacity style={styles.phoneBtn} onPress={() => Alert.alert('Call Driver', `Call ${order.driverPhone}?`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Call', onPress: () => Linking.openURL(`tel:${order.driverPhone}`).catch(() => {}) }])}>
                        <Ionicons name="call" size={18} color="#10B981" />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
                {order.driverRating && (
                  <View style={styles.ratingRow}>
                    <Ionicons name="star" size={16} color="#F59E0B" />
                    <Text style={{ color: colors.textSecondary, fontSize: fonts.size.sm }}>{order.driverRating.toFixed(1)}</Text>
                  </View>
                )}
                {order.vehiclePlate && (
                  <View style={styles.vehicleInfo}>
                    <View style={styles.vehicleRow}>
                      <Ionicons name="car-outline" size={18} color={colors.textMuted} />
                      <Text style={[styles.vehicleText, { color: colors.textSecondary }]}>{order.vehiclePlate}</Text>
                    </View>
                    {order.vehicleType && (
                      <Text style={[styles.vehicleType, { color: colors.textMuted, fontSize: fonts.size.xs }]}>{order.vehicleType}</Text>
                    )}
                  </View>
                )}
              </View>
            </View>
          )}

          {(order.consignorName || order.consigneeName) && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Consignor / Consignee</Text>
              <View style={styles.grid}>
                <View style={[styles.infoCard, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}>
                  <Text style={[styles.infoLabel, { color: colors.textMuted, fontSize: fonts.size.xs }]}>Consignor</Text>
                  <Text style={[styles.infoValue, { color: colors.textPrimary, fontSize: fonts.size.sm }]}>{order.consignorName || '—'}</Text>
                </View>
                <View style={[styles.infoCard, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}>
                  <Text style={[styles.infoLabel, { color: colors.textMuted, fontSize: fonts.size.xs }]}>Consignee</Text>
                  <Text style={[styles.infoValue, { color: colors.textPrimary, fontSize: fonts.size.sm }]}>{order.consigneeName || '—'}</Text>
                </View>
                {order.packageCount != null && (
                  <View style={[styles.infoCard, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}>
                    <Text style={[styles.infoLabel, { color: colors.textMuted, fontSize: fonts.size.xs }]}>Packages</Text>
                    <Text style={[styles.infoValue, { color: colors.textPrimary, fontSize: fonts.size.sm }]}>{order.packageCount}</Text>
                  </View>
                )}
                {order.particulars && (
                  <View style={[styles.infoCard, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm, minWidth: '100%' }]}>
                    <Text style={[styles.infoLabel, { color: colors.textMuted, fontSize: fonts.size.xs }]}>Particulars</Text>
                    <Text style={[styles.infoValue, { color: colors.textPrimary, fontSize: fonts.size.sm }]}>{order.particulars}</Text>
                  </View>
                )}
              </View>
            </View>
          )}

          {order.notes && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Notes</Text>
              <View style={[styles.notesCard, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}>
                <Text style={[styles.notesText, { color: colors.textSecondary }]}>{order.notes}</Text>
              </View>
            </View>
          )}

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Timeline</Text>
            <Timeline events={order.timeline} />
          </View>

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Slip / Documents</Text>
            {order.attachments.length === 0 ? (
              <View style={[styles.notesCard, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}>
                <Text style={[styles.notesText, { color: colors.textMuted, fontSize: fonts.size.sm }]}>No slip or photos available yet.</Text>
              </View>
            ) : (
              <View style={{ gap: spacing.sm }}>
                {order.attachments.map((a) => (
                  <TouchableOpacity
                    key={a.id}
                    style={[styles.driverCard, { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}
                    onPress={() => Linking.openURL(a.url).catch(() => {})}
                  >
                    <Ionicons name="document-text-outline" size={22} color={colors.textMuted} />
                    <Text style={[styles.infoValue, { color: colors.textPrimary, flex: 1 }]} numberOfLines={1}>{a.originalFilename}</Text>
                    <Ionicons name="eye-outline" size={18} color={colors.textMuted} />
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {order.proofOfDelivery && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Proof of Delivery</Text>
              <View style={[styles.proofCard, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}>
                {order.proofOfDelivery.imageUrl && (
                  <View style={styles.proofImage}>
                    <Text style={styles.proofLabel}>Delivery Photo</Text>
                    <View style={styles.imagePlaceholder}>
                      <Ionicons name="image-outline" size={48} color={colors.textMuted} />
                    </View>
                  </View>
                )}
                {order.proofOfDelivery.signatureUrl && (
                  <View style={styles.proofImage}>
                    <Text style={styles.proofLabel}>Customer Signature</Text>
                    <View style={styles.imagePlaceholder}>
                      <Ionicons name="create-outline" size={48} color={colors.textMuted} />
                    </View>
                  </View>
                )}
                {order.proofOfDelivery.notes && (
                  <Text style={[styles.proofNotes, { color: colors.textSecondary }]}>{order.proofOfDelivery.notes}</Text>
                )}
                {order.proofOfDelivery.timestamp && (
                  <Text style={[styles.proofTime, { color: colors.textMuted, fontSize: fonts.size.xs }]}>Delivered at {formatDateTime(order.proofOfDelivery.timestamp)}</Text>
                )}
              </View>
            </View>
          )}

          {order.status === 'delivered' && order.driverName && (
            <View style={styles.section}>
              <ActionButton
                label="Rate Driver"
                icon="star"
                variant="outline"
                size="lg"
                fullWidth
                onPress={rateDriver}
              />
            </View>
          )}
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
};

export default CustomerOrderDetailsScreen;