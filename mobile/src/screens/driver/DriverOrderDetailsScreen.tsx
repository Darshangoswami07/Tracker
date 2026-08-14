import { useCallback, useEffect, useState } from 'react';
import { Alert, Animated, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAppTheme } from '../../theme/useAppTheme';
import { useAppNav } from '../../hooks/useAppNav';
import { useAuthStore } from '../../store/authStore';
import { formatDateTime } from '../../utils/format';
import { api } from '../../api/client';
import { ENDPOINTS } from '../../api/endpoints';
import { Header } from '../../components/Header';
import { ShimmerCard } from '../../components/ShimmerCard';
import { ActionButton } from '../../components/ActionButton';
import { StatusBadge } from '../../components/StatusBadge';
import { Timeline } from '../../components/Timeline';
import { AttachmentViewerModal, type ViewableAttachment } from '../../components/AttachmentViewerModal';
import { uploadOrderAttachment, type OrderAttachment } from '../../services/orderAttachments';

interface DriverOrderDetails {
  id: string;
  orderNumber: string;
  status: string;
  customerName: string;
  pickupAddress: string;
  deliveryAddress: string;
  consignorName?: string;
  consigneeName?: string;
  particulars?: string;
  packageCount?: number;
  weight?: number;
  createdAt: string;
  attachments: OrderAttachment[];
  timeline: Array<{ id: string; status: string; description: string; timestamp: string; location?: string }>;
}

export const DriverOrderDetailsScreen = ({ route }: any) => {
  const { orderId } = route.params;
  const { colors, spacing, radii, fonts, shadows } = useAppTheme();
  const { goBack } = useAppNav();
  const accessToken = useAuthStore((state) => state.accessToken);

  const [order, setOrder] = useState<DriverOrderDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [previewAttachment, setPreviewAttachment] = useState<ViewableAttachment | null>(null);
  const [fadeAnim] = useState(new Animated.Value(0));

  const fetchOrder = useCallback(async () => {
    if (!accessToken || !orderId) return;
    try {
      const res = await api.get(ENDPOINTS.orders.detail(orderId), {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      setOrder(res.data.data);
    } catch (error) {
      console.error('Failed to fetch delivery:', error);
    } finally {
      setLoading(false);
    }
  }, [accessToken, orderId]);

  useEffect(() => {
    fetchOrder();
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: Platform.OS !== 'web' }).start();
  }, [fetchOrder, fadeAnim]);

  const handleUploadProof = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Gallery permission is required to select a photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    if (result.canceled || !accessToken) return;

    setUploading(true);
    try {
      await uploadOrderAttachment(orderId, result.assets[0].uri, accessToken, 'proof_of_delivery');
      Alert.alert('Success', 'Proof/slip uploaded successfully.');
      fetchOrder();
    } catch (error) {
      console.error('Failed to upload proof:', error);
      Alert.alert('Upload Failed', 'Could not upload the file. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const styles = StyleSheet.create({
    safe: { flex: 1 },
    header: { paddingTop: 8 },
    scrollContent: { paddingBottom: 40, paddingHorizontal: spacing.lg },
    statusCard: { backgroundColor: colors.surface, borderRadius: radii.xl, padding: 20, ...shadows.md, marginBottom: spacing.lg, gap: 8 },
    grNumber: { fontSize: fonts.size.xl, fontWeight: '800', color: colors.textPrimary },
    routeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
    routeText: { fontSize: fonts.size.sm, fontWeight: '600', color: colors.textSecondary },
    section: { marginBottom: spacing.lg },
    sectionTitle: { fontSize: fonts.size.md, fontWeight: '800', color: colors.textPrimary, marginBottom: spacing.md },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
    infoCard: { flex: 1, minWidth: '45%', padding: 16, gap: 4, backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm },
    infoLabel: { fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, color: colors.textMuted, fontSize: fonts.size.xs },
    infoValue: { fontWeight: '600', color: colors.textPrimary, fontSize: fonts.size.sm },
    docRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm },
    emptyCard: { padding: 16, backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm },
    sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
    cardShimmer: { marginBottom: spacing.lg, borderRadius: radii.xl },
  });

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <Header title="Delivery Details" leftAction={{ icon: 'chevron-back', onPress: goBack }} />
        </View>
        <ScrollView contentContainerStyle={styles.scrollContent}>
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
          <Header title="Delivery Details" leftAction={{ icon: 'chevron-back', onPress: goBack }} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Header title="Delivery Details" leftAction={{ icon: 'chevron-back', onPress: goBack }} />
      </View>
      <Animated.View style={{ opacity: fadeAnim, flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.statusCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={styles.grNumber}>{order.orderNumber}</Text>
              <StatusBadge status={order.status} />
            </View>
            <View style={styles.routeRow}>
              <Ionicons name="location-outline" size={16} color={colors.textMuted} />
              <Text style={styles.routeText}>{order.pickupAddress} → {order.deliveryAddress}</Text>
            </View>
            <Text style={[styles.routeText, { color: colors.textMuted }]}>Submitted {formatDateTime(order.createdAt)}</Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Consignor / Consignee</Text>
            <View style={styles.grid}>
              <View style={styles.infoCard}>
                <Text style={styles.infoLabel}>Consignor</Text>
                <Text style={styles.infoValue}>{order.consignorName || '—'}</Text>
              </View>
              <View style={styles.infoCard}>
                <Text style={styles.infoLabel}>Consignee</Text>
                <Text style={styles.infoValue}>{order.consigneeName || '—'}</Text>
              </View>
              <View style={styles.infoCard}>
                <Text style={styles.infoLabel}>Customer</Text>
                <Text style={styles.infoValue}>{order.customerName}</Text>
              </View>
              {order.packageCount != null && (
                <View style={styles.infoCard}>
                  <Text style={styles.infoLabel}>Packages</Text>
                  <Text style={styles.infoValue}>{order.packageCount}</Text>
                </View>
              )}
              {order.weight != null && (
                <View style={styles.infoCard}>
                  <Text style={styles.infoLabel}>Weight</Text>
                  <Text style={styles.infoValue}>{order.weight} kg</Text>
                </View>
              )}
            </View>
            {order.particulars && (
              <View style={[styles.infoCard, { marginTop: spacing.md, minWidth: '100%' }]}>
                <Text style={styles.infoLabel}>Particulars</Text>
                <Text style={styles.infoValue}>{order.particulars}</Text>
              </View>
            )}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Timeline</Text>
            <Timeline events={order.timeline} />
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Slip / Documents</Text>
              <ActionButton
                label={order.attachments.length > 0 ? 'Replace' : 'Upload Proof/Slip'}
                icon="camera-outline"
                size="sm"
                variant="outline"
                loading={uploading}
                onPress={handleUploadProof}
              />
            </View>
            {order.attachments.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={{ color: colors.textMuted, fontSize: fonts.size.sm }}>No slip or proof photos uploaded yet.</Text>
              </View>
            ) : (
              <View style={{ gap: spacing.sm }}>
                {order.attachments.map((a) => (
                  <TouchableOpacity key={a.id} style={styles.docRow} onPress={() => setPreviewAttachment(a)}>
                    <Ionicons name={a.mimeType?.startsWith('image/') ? 'image-outline' : 'document-text-outline'} size={22} color={colors.textMuted} />
                    <Text style={[styles.infoValue, { flex: 1 }]} numberOfLines={1}>{a.originalFilename}</Text>
                    <Ionicons name="eye-outline" size={18} color={colors.textMuted} />
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        </ScrollView>
      </Animated.View>
      <AttachmentViewerModal attachment={previewAttachment} onClose={() => setPreviewAttachment(null)} />
    </SafeAreaView>
  );
};

export default DriverOrderDetailsScreen;
