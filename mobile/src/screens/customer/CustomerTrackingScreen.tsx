import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Animated, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppTheme } from '../../theme/useAppTheme';
import { useAppNav } from '../../hooks/useAppNav';
import { useAuthStore } from '../../store/authStore';
import { api } from '../../api/client';
import { ENDPOINTS } from '../../api/endpoints';
import { EmptyState } from '../../components/EmptyState';
import { AttachmentViewerModal, type ViewableAttachment } from '../../components/AttachmentViewerModal';
import { formatDateTime } from '../../utils/format';
import type { OrderAttachment } from '../../services/orderAttachments';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { CustomerStackParamList } from '../../navigation/types';

/** The four customer-facing delivery stages, derived from the backend status. */
const STAGES = [
  { key: 'pending', label: 'Pending' },
  { key: 'in_transit', label: 'In Transit' },
  { key: 'out_for_delivery', label: 'Out for Delivery' },
  { key: 'delivered', label: 'Delivered' },
] as const;

interface TimelineEvent {
  id: string;
  status: string;
  description?: string;
  location?: string;
  timestamp?: string | null;
}

interface TrackedShipment {
  id: string;
  orderNumber: string;
  status: string;
  createdAt?: string | null;
  updatedAt?: string | null;
  pickupAddress: string;
  deliveryAddress: string;
  consignorName?: string | null;
  consigneeName?: string | null;
  particulars?: string | null;
  packageCount?: number | null;
  weight?: number | null;
  customerName?: string | null;
  customerPhone?: string | null;
  attachments: OrderAttachment[];
  timeline: TimelineEvent[];
}

/**
 * Maps a backend order status to the stage index of the 4-step delivery
 * timeline. Unknown / failure statuses fall back to 0 while still showing the
 * real status pill above the timeline.
 */
const stageIndexFor = (status?: string): number => {
  switch ((status ?? '').toLowerCase()) {
    case 'assigned':
    case 'pickup':
    case 'in_transit':
      return 1;
    case 'out_for_delivery':
      return 2;
    case 'delivered':
      return 3;
    case 'pending':
    default:
      return 0;
  }
};

type Props = NativeStackScreenProps<CustomerStackParamList, 'CustomerTracking'>;

export const CustomerTrackingScreen = ({ route }: Props) => {
  const { colors, spacing, radii, shadows } = useAppTheme();
  const { openDrawer, goToNotifications } = useAppNav();
  const accessToken = useAuthStore((state) => state.accessToken);

  const [grNumber, setGrNumber] = useState(route.params?.grNumber ?? '');
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [shipment, setShipment] = useState<TrackedShipment | null>(null);
  const [unread, setUnread] = useState(0);
  const [previewAttachment, setPreviewAttachment] = useState<ViewableAttachment | null>(null);

  const [fadeAnim] = useState(new Animated.Value(0));
  const [slideAnim] = useState(new Animated.Value(20));
  const [progressAnim] = useState(new Animated.Value(0));

  const activeStage = shipment ? stageIndexFor(shipment.status) : -1;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 450, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(slideAnim, { toValue: 0, duration: 450, useNativeDriver: Platform.OS !== 'web' }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  useEffect(() => {
    let mounted = true;
    const fetchUnread = async () => {
      if (!accessToken) return;
      try {
        const res = await api.get(`${ENDPOINTS.notifications}/unread-count`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (mounted) setUnread(res.data.data.unread ?? 0);
      } catch {
        /* badge is best-effort */
      }
    };
    void fetchUnread();
    return () => {
      mounted = false;
    };
  }, [accessToken]);

  useEffect(() => {
    if (!shipment) return;
    progressAnim.setValue(0);
    Animated.timing(progressAnim, {
      toValue: activeStage === 0 ? 0.001 : activeStage / (STAGES.length - 1),
      duration: 700,
      useNativeDriver: false,
    }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shipment]);

  const handleTrack = async () => {
    const trimmed = grNumber.trim();
    if (!trimmed || !accessToken) return;
    setLoading(true);
    setSearched(true);
    setShipment(null);
    try {
      const res = await api.get(ENDPOINTS.orders.track(trimmed), {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      setShipment(res.data.data);
    } catch (error: any) {
      setShipment(null);
      if (error?.response?.status !== 404) {
        Alert.alert('Error', 'Could not look up that GR number. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={openDrawer} style={styles.iconBtn} hitSlop={8} accessibilityRole="button" accessibilityLabel="Open menu">
          <Ionicons name="menu" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.brandWrap}>
          <View style={[styles.brandLogo, { backgroundColor: colors.primary }]}>
            <Ionicons name="cube" size={16} color="#FFFFFF" />
          </View>
          <Text style={[styles.brandTitle, { color: colors.textPrimary }]}>DeliveryHub</Text>
        </View>
        <TouchableOpacity onPress={goToNotifications} style={styles.iconBtn} hitSlop={8} accessibilityRole="button" accessibilityLabel="Notifications">
          <View style={styles.bellWrap}>
            <Ionicons name="notifications-outline" size={24} color={colors.textPrimary} />
            {unread > 0 && (
              <View style={[styles.bellDot, { backgroundColor: colors.error, borderRadius: radii.pill }]}>
                <Text style={styles.bellDotText}>{unread > 99 ? '99+' : unread}</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
          <Text style={[styles.screenTitle, { color: colors.textPrimary }]}>Track Shipment</Text>
          <Text style={[styles.screenSubtitle, { color: colors.textSecondary }]}>
            Enter your GR number to see the latest delivery status.
          </Text>

          <LinearGradient
            colors={['#F6F4FF', '#FFFFFF']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.searchCard, { borderRadius: radii.xl, ...shadows.md }]}
          >
            <View style={[styles.searchRow, { borderRadius: radii.lg }]}>
              <View style={[styles.searchIcon, { backgroundColor: colors.primarySoft, borderRadius: radii.md }]}>
                <Ionicons name="cube-outline" size={20} color={colors.primary} />
              </View>
              <TextInput
                style={[styles.searchInput, { color: colors.textPrimary }]}
                placeholder="Enter GR Number"
                placeholderTextColor={colors.textMuted}
                value={grNumber}
                onChangeText={setGrNumber}
                autoCapitalize="characters"
                autoCorrect={false}
                returnKeyType="search"
                onSubmitEditing={handleTrack}
              />
            </View>
            <TouchableOpacity
              style={[styles.trackBtn, { borderRadius: radii.button }]}
              onPress={handleTrack}
              disabled={loading || !grNumber.trim()}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Track shipment"
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <>
                  <Ionicons name="search" size={18} color="#FFFFFF" />
                  <Text style={styles.trackBtnText}>Track</Text>
                </>
              )}
            </TouchableOpacity>
          </LinearGradient>

          {!searched && (
            <View style={{ marginTop: spacing.xxxl }}>
              <EmptyState
                icon="paper-plane-outline"
                title="Track your shipment"
                subtitle="The GR number on your transport slip is all you need to see where your delivery is."
                iconColor={colors.primary}
              />
            </View>
          )}

          {searched && !loading && !shipment && (
            <View style={{ marginTop: spacing.xxxl }}>
              <EmptyState
                icon="alert-circle-outline"
                title="No shipment found"
                subtitle="Check the GR number and try again, or contact support."
                iconColor={colors.error}
              />
            </View>
          )}

          {shipment && (
            <View style={[styles.card, { borderRadius: radii.xl, ...shadows.md }]}>
              <View style={styles.cardHeader}>
                <View>
                  <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>GR NUMBER</Text>
                  <Text style={[styles.grNumber, { color: colors.textPrimary }]}>{shipment.orderNumber}</Text>
                  {shipment.createdAt && (
                    <Text style={[styles.cardDate, { color: colors.textMuted }]}>
                      Booked {formatDateTime(shipment.createdAt)}
                    </Text>
                  )}
                </View>
                <StatusPill status={shipment.status} />
              </View>

              {/* 4-stage progress timeline */}
              <View style={[styles.timelineCard, { backgroundColor: colors.surfaceMuted, borderRadius: radii.lg }]}>
                <View style={styles.timelineTrack}>
                  <Animated.View
                    style={[
                      styles.timelineFill,
                      {
                        backgroundColor: colors.primary,
                        borderRadius: radii.pill,
                        width: progressAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: ['0%', '100%'],
                        }),
                      },
                    ]}
                  />
                </View>
                <View style={styles.timelineSteps}>
                  {STAGES.map((stage, index) => {
                    const reached = index <= activeStage;
                    return (
                      <View key={stage.key} style={styles.stepWrap}>
                        <View
                          style={[
                            styles.stepDot,
                            {
                              backgroundColor: reached ? colors.primary : '#E5E7EB',
                              borderColor: reached ? colors.primary : '#D1D5DB',
                            },
                          ]}
                        >
                          <Ionicons
                            name={reached ? 'checkmark' : 'ellipse'}
                            size={10}
                            color={reached ? '#FFFFFF' : '#9CA3AF'}
                          />
                        </View>
                        <Text
                          numberOfLines={1}
                          style={[
                            styles.stepLabel,
                            {
                              color: reached ? colors.textPrimary : colors.textMuted,
                              fontWeight: reached ? '700' : '500',
                            },
                          ]}
                        >
                          {stage.label}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>

              {shipment.timeline.length > 0 && (
                <View style={styles.historyBlock}>
                  <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>STATUS HISTORY</Text>
                  {shipment.timeline.map((event) => (
                    <View key={event.id} style={styles.historyRow}>
                      <View style={[styles.historyDot, { backgroundColor: colors.primary }]} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.historyStatus, { color: colors.textPrimary }]}>
                          {humanizeStatus(event.status)}
                        </Text>
                        {event.description ? (
                          <Text style={[styles.historyDesc, { color: colors.textSecondary }]}>{event.description}</Text>
                        ) : null}
                      </View>
                      {event.timestamp && (
                        <Text style={[styles.historyTime, { color: colors.textMuted }]}>
                          {formatDateTime(event.timestamp)}
                        </Text>
                      )}
                    </View>
                  ))}
                </View>
              )}

              <View style={styles.divider} />

              <View style={styles.grid}>
                <Field label="Consignor" value={shipment.consignorName || '—'} />
                <Field label="Consignee" value={shipment.consigneeName || '—'} />
                <Field label="From → To" value={`${shipment.pickupAddress} → ${shipment.deliveryAddress}`} wide />
                <Field label="Delivery At" value={shipment.deliveryAddress} wide />
              </View>

              <View style={styles.divider} />

              <View style={styles.particularsRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>PARTICULARS</Text>
                  <Text style={[styles.fieldValue, { color: colors.textPrimary }]}>{shipment.particulars || '—'}</Text>
                </View>
                <View>
                  <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>PACKAGES</Text>
                  <Text style={[styles.fieldValue, { color: colors.textPrimary }]}>{shipment.packageCount ?? '—'}</Text>
                </View>
                <View>
                  <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>WEIGHT</Text>
                  <Text style={[styles.fieldValue, { color: colors.textPrimary }]}>{shipment.weight ? `${shipment.weight} kg` : '—'}</Text>
                </View>
              </View>

              <View style={styles.divider} />

              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>PHOTOS / SLIP</Text>
              {shipment.attachments.length === 0 ? (
                <Text style={[styles.noPhotos, { color: colors.textMuted }]}>No photos uploaded yet.</Text>
              ) : (
                <View style={{ gap: 8, marginTop: 8 }}>
                  {shipment.attachments.map((a) => (
                    <TouchableOpacity key={a.id} style={[styles.photoRow, { backgroundColor: colors.surfaceMuted, borderRadius: radii.md }]} onPress={() => setPreviewAttachment(a)}>
                      <Ionicons name={a.mimeType?.startsWith('image/') ? 'image-outline' : 'document-text-outline'} size={18} color={colors.primary} />
                      <Text style={[styles.photoName, { color: colors.textPrimary }]} numberOfLines={1}>{a.originalFilename}</Text>
                      <Ionicons name="eye-outline" size={16} color={colors.textMuted} />
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          )}
        </Animated.View>
      </ScrollView>
      <AttachmentViewerModal attachment={previewAttachment} onClose={() => setPreviewAttachment(null)} />
    </SafeAreaView>
  );
};

const Field = ({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) => {
  const { colors, fonts } = useAppTheme();
  return (
    <View style={[styles.gridItem, wide && styles.gridItemWide]}>
      <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>{label.toUpperCase()}</Text>
      <Text style={[styles.fieldValue, { color: colors.textPrimary, fontSize: fonts.size.sm }]}>{value}</Text>
    </View>
  );
};

const StatusPill = ({ status }: { status: string }) => {
  const config = statusConfig(status);
  return (
    <View style={[styles.statusPill, { backgroundColor: config.bg, borderRadius: 999 }]}>
      <Ionicons name={config.icon} size={14} color={config.color} />
      <Text style={[styles.statusPillText, { color: config.color }]}>{config.label}</Text>
    </View>
  );
};

const statusConfig = (status: string): { color: string; bg: string; icon: 'time-outline' | 'navigate-outline' | 'cube-outline' | 'checkmark-circle-outline' | 'close-circle-outline' | 'help-outline'; label: string } => {
  switch (status.toLowerCase()) {
    case 'pending': return { color: '#B45309', bg: '#F59E0B20', icon: 'time-outline', label: 'Pending' };
    case 'assigned': return { color: '#0E7490', bg: '#06B6D420', icon: 'navigate-outline', label: 'Assigned' };
    case 'pickup': return { color: '#7C3AED', bg: '#8B5CF620', icon: 'cube-outline', label: 'Pickup' };
    case 'in_transit': return { color: '#1D4ED8', bg: '#3B82F620', icon: 'navigate-outline', label: 'In Transit' };
    case 'out_for_delivery': return { color: '#7C3AED', bg: '#8B5CF620', icon: 'navigate-outline', label: 'Out for Delivery' };
    case 'delivered': return { color: '#047857', bg: '#10B98120', icon: 'checkmark-circle-outline', label: 'Delivered' };
    case 'cancelled': return { color: '#B91C1C', bg: '#EF444420', icon: 'close-circle-outline', label: 'Cancelled' };
    default: return { color: '#6B7280', bg: '#6B728015', icon: 'help-outline', label: humanizeStatus(status) };
  }
};

const humanizeStatus = (status: string): string => status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const styles = StyleSheet.create({
  safe: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  brandWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandLogo: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  brandTitle: { fontWeight: '800', fontSize: 17 },
  bellWrap: { position: 'relative' },
  bellDot: { position: 'absolute', top: -4, right: -6, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  bellDotText: { color: '#FFFFFF', fontSize: 9, fontWeight: '800' },
  scrollContent: { padding: 20, paddingBottom: 60 },
  screenTitle: { fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  screenSubtitle: { fontSize: 14, fontWeight: '500', marginTop: 4, marginBottom: 18 },
  searchCard: { padding: 16, gap: 12, marginBottom: 4 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: '#E8EAF5', paddingHorizontal: 14, paddingVertical: 4 },
  searchIcon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  searchInput: { flex: 1, paddingVertical: 12, fontSize: 15, fontWeight: '600' },
  trackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#635BFF',
    height: 52,
  },
  trackBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 16 },
  card: { backgroundColor: '#FFFFFF', padding: 20, marginTop: 20, borderWidth: 1, borderColor: '#E8EAF5' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  grNumber: { fontSize: 22, fontWeight: '800', marginTop: 2 },
  cardDate: { fontSize: 12, marginTop: 3 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7 },
  statusPillText: { fontWeight: '800', fontSize: 11, textTransform: 'capitalize' },
  timelineCard: { padding: 16, marginBottom: 16 },
  timelineTrack: { height: 6, backgroundColor: '#E5E7EB', borderRadius: 999, overflow: 'hidden' },
  timelineFill: { height: 6, width: '100%' },
  timelineSteps: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  stepWrap: { alignItems: 'center', gap: 6, width: '24%' },
  stepDot: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  stepLabel: { fontSize: 9, textAlign: 'center' },
  historyBlock: { gap: 10, marginBottom: 8 },
  historyRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  historyDot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  historyStatus: { fontSize: 13, fontWeight: '700' },
  historyDesc: { fontSize: 12, marginTop: 1 },
  historyTime: { fontSize: 11, marginLeft: 8 },
  divider: { height: 1, backgroundColor: '#F1F0EA', marginVertical: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  gridItem: { minWidth: '45%', flexGrow: 1 },
  gridItemWide: { minWidth: '100%' },
  fieldLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  fieldValue: { fontWeight: '600', marginTop: 3, lineHeight: 18 },
  particularsRow: { flexDirection: 'row', gap: 16 },
  noPhotos: { fontSize: 13, fontStyle: 'italic', marginTop: 6 },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  photoName: { flex: 1, fontSize: 13, fontWeight: '600' },
});

export default CustomerTrackingScreen;
