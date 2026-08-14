import { useEffect, useState, useCallback, type ComponentProps } from 'react';
import { Alert, Animated, StyleSheet, Text, TouchableOpacity, View, ScrollView, Share, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAppTheme } from '../../theme/useAppTheme';
import { useAppNav } from '../../hooks/useAppNav';
import { useAuthStore } from '../../store/authStore';
import { formatCurrency, formatDateTime } from '../../utils/format';
import { api } from '../../api/client';
import { ENDPOINTS } from '../../api/endpoints';
import { Header } from '../../components/Header';
import { StatCard } from '../../components/StatCard';
import { ShimmerCard } from '../../components/ShimmerCard';
import { ActionButton } from '../../components/ActionButton';
import { StatusBadge } from '../../components/StatusBadge';
import { Timeline } from '../../components/Timeline';
import { AttachmentViewerModal, type ViewableAttachment } from '../../components/AttachmentViewerModal';
import { uploadOrderAttachment, type OrderAttachment } from '../../services/orderAttachments';

interface OrderDetails {
  id: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
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
  notes?: string;
  driverName?: string;
  driverPhone?: string;
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

export const OrderDetailsScreen = ({ route }: any) => {
  const { orderId } = route.params;
  const { colors, spacing, radii, fonts, shadows } = useAppTheme();
  const { goBack } = useAppNav();
  const accessToken = useAuthStore((state) => state.accessToken);

  const styles = StyleSheet.create({
    safe: { flex: 1 },
    header: { paddingTop: 8 },
    scrollContent: { paddingBottom: 40, paddingHorizontal: spacing.lg },
    statusCard: { backgroundColor: colors.surface, borderRadius: radii.xl, padding: 20, ...shadows.md, marginBottom: spacing.lg },
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
    infoCard: { flex: 1, minWidth: '45%', padding: 16, gap: 12 },
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
    driverPhone: { fontWeight: '500' },
    vehicleInfo: { gap: 4, borderLeftWidth: 2, borderLeftColor: '#F3F4F6', paddingLeft: 16, marginLeft: 24 },
    vehicleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    vehicleText: { fontWeight: '600' },
    vehicleType: { fontWeight: '500' },
    notesCard: { padding: 16 },
    notesText: { fontSize: fonts.size.md, lineHeight: 24 },
    timelineContainer: { gap: 12 },
    proofCard: { padding: 16, gap: 16 },
    proofImage: { gap: 8 },
    proofLabel: { fontWeight: '700', color: colors.textSecondary, fontSize: fonts.size.sm },
    imagePlaceholder: { height: 150, backgroundColor: colors.surfaceMuted, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center' },
    proofNotes: { fontSize: fonts.size.md },
    proofTime: { fontWeight: '500' },
    cardShimmer: { marginBottom: spacing.lg, borderRadius: radii.xl },
  });

  const [order, setOrder] = useState<OrderDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [previewAttachment, setPreviewAttachment] = useState<ViewableAttachment | null>(null);
  const [fadeAnim] = useState(new Animated.Value(0));
  const [slideAnim] = useState(new Animated.Value(20));

  const fetchOrder = useCallback(async () => {
    if (!accessToken || !orderId) return;
    try {
      const res = await api.get(ENDPOINTS.orders.detail(orderId), {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      setOrder(res.data.data);
    } catch (error) {
      console.error('Failed to fetch order:', error);
    } finally {
      setLoading(false);
    }
  }, [accessToken, orderId]);

  const handleUploadSlip = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Gallery permission is required to select a slip photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (result.canceled || !accessToken) return;

    setUploading(true);
    try {
      await uploadOrderAttachment(orderId, result.assets[0].uri, accessToken);
      Alert.alert('Success', 'Slip uploaded successfully.');
      fetchOrder();
    } catch (error) {
      console.error('Failed to upload slip:', error);
      Alert.alert('Upload Failed', 'Could not upload the slip. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  useEffect(() => {
    fetchOrder();
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: Platform.OS !== 'web' }),
    ]).start();
  }, [fetchOrder, fadeAnim, slideAnim]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <Header title="Order Details" leftAction={{ icon: 'chevron-back', onPress: goBack }} />
        </View>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <ShimmerCard style={styles.cardShimmer} height={200} />
          <ShimmerCard style={styles.cardShimmer} height={150} />
          <ShimmerCard style={styles.cardShimmer} height={200} />
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

  const getStatusConfig = (status: string): { color: string; icon: ComponentProps<typeof Ionicons>['name']; label: string } => {
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
      <Animated.View
        style={{
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
        }}
      >
        <View style={styles.header}>
          <Header 
            title={order.orderNumber} 
            leftAction={{ icon: 'chevron-back', onPress: goBack }} 
            rightAction={{ icon: 'share-outline', onPress: () => Share.share({ message: `DeliveryHub order ${order.orderNumber} — ${order.customerName} — ${order.pickupAddress} → ${order.deliveryAddress}` }).catch(() => {}) }}
          />
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
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
              <Text style={[styles.metaItem, { color: colors.textSecondary }]}>Created: {formatDateTime(order.createdAt)}</Text>
              <Text style={[styles.metaItem, { color: colors.textSecondary }]}>Updated: {formatDateTime(order.updatedAt)}</Text>
              <Text style={[styles.metaItem, { color: colors.textSecondary }]}>Priority: {order.priority}</Text>
            </View>
          </View>

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
                      <Text style={[styles.driverPhone, { color: colors.textSecondary, fontSize: fonts.size.sm }]}>{order.driverPhone}</Text>
                    )}
                  </View>
                </View>
                {order.vehiclePlate && (
                  <View style={styles.vehicleInfo}>
                    <View style={styles.vehicleRow}>
                      <Ionicons name="car-sport-outline" size={18} color={colors.textMuted} />
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
                {order.particulars && (
                  <View style={[styles.infoCard, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm, minWidth: '100%' }]}>
                    <Text style={[styles.infoLabel, { color: colors.textMuted, fontSize: fonts.size.xs }]}>Particulars</Text>
                    <Text style={[styles.infoValue, { color: colors.textPrimary, fontSize: fonts.size.sm }]}>{order.particulars}</Text>
                  </View>
                )}
                {order.packageCount != null && (
                  <View style={[styles.infoCard, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}>
                    <Text style={[styles.infoLabel, { color: colors.textMuted, fontSize: fonts.size.xs }]}>Packages</Text>
                    <Text style={[styles.infoValue, { color: colors.textPrimary, fontSize: fonts.size.sm }]}>{order.packageCount}</Text>
                  </View>
                )}
              </View>
            </View>
          )}

          <View style={styles.section}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md }}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary, marginBottom: 0 }]}>Slip / Documents</Text>
              <ActionButton
                label={order.attachments.length > 0 ? 'Replace Slip' : 'Upload Slip'}
                icon="cloud-upload-outline"
                size="sm"
                variant="outline"
                loading={uploading}
                onPress={handleUploadSlip}
              />
            </View>
            {order.attachments.length === 0 ? (
              <View style={[styles.notesCard, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}>
                <Text style={[styles.notesText, { color: colors.textMuted, fontSize: fonts.size.sm }]}>No slip or photos uploaded yet.</Text>
              </View>
            ) : (
              <View style={{ gap: spacing.sm }}>
                {order.attachments.map((a) => (
                  <TouchableOpacity
                    key={a.id}
                    style={[styles.driverCard, { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}
                    onPress={() => setPreviewAttachment(a)}
                  >
                    <Ionicons name={a.mimeType?.startsWith('image/') ? 'image-outline' : 'document-text-outline'} size={22} color={colors.textMuted} />
                    <Text style={[styles.infoValue, { color: colors.textPrimary, flex: 1 }]} numberOfLines={1}>{a.originalFilename}</Text>
                    <Ionicons name="eye-outline" size={18} color={colors.textMuted} />
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

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
        </ScrollView>
      </Animated.View>
      <AttachmentViewerModal attachment={previewAttachment} onClose={() => setPreviewAttachment(null)} />
    </SafeAreaView>
  );
};

export default OrderDetailsScreen;