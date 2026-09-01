import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Animated, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { useAppTheme } from '../../theme/useAppTheme';
import { useAppNav } from '../../hooks/useAppNav';
import { useAuthStore } from '../../store/authStore';
import { api } from '../../api/client';
import { ENDPOINTS } from '../../api/endpoints';
import { orderRepository, type LocalAttachment, type LocalTimelineEvent, type LocalGRDetail } from '../../database/repositories/orderRepository';
import { Header } from '../../components/Header';
import { EmptyState } from '../../components/EmptyState';
import { StatusBadge } from '../../components/StatusBadge';
import { AttachmentViewerModal, type ViewableAttachment } from '../../components/AttachmentViewerModal';
import { formatDateTime } from '../../utils/format';
import type { AppTheme } from '../../theme/types';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MoreStackParamList } from '../../navigation/types';

/** The four customer-facing delivery stages, derived from the backend status.
 *  Labels are resolved at render time from the `summary.*` status keys so they
 *  follow the globally selected language. */
const STAGES = [
  { key: 'pending', labelKey: 'summary.pending' },
  { key: 'uncleared', labelKey: 'summary.uncleared' },
  { key: 'cleared', labelKey: 'summary.cleared' },
  { key: 'delivered', labelKey: 'summary.delivered' },
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
  attachments: LocalAttachment[];
  timeline: TimelineEvent[];
}

/**
 * Maps a backend order status to the stage index of the 4-step delivery
 * timeline. Unknown / failure statuses fall back to 0 while still showing the
 * real status pill above the timeline.
 */
const stageIndexFor = (status?: string): number => {
  switch ((status ?? '').toLowerCase()) {
    case 'uncleared':
      return 1;
    case 'cleared':
      return 2;
    case 'delivered':
      return 3;
    case 'pending':
    default:
      return 0;
  }
};

/** Maps a local `order_status_history` row into the timeline shape this
 * screen renders (there's no separate `location` in the local schema). */
const toTimelineEvent = (event: LocalTimelineEvent): TimelineEvent => ({
  id: event.id,
  status: event.status,
  description: event.note ?? undefined,
  timestamp: event.createdAt,
});

const toTrackedShipment = (gr: LocalGRDetail): TrackedShipment => ({
  id: gr.id,
  orderNumber: gr.orderNumber,
  status: gr.status,
  createdAt: gr.createdAt,
  updatedAt: gr.createdAt,
  pickupAddress: gr.pickupAddress,
  deliveryAddress: gr.deliveryAddress,
  consignorName: gr.consignorName,
  consigneeName: gr.consigneeName,
  particulars: gr.particulars,
  packageCount: gr.packageCount,
  weight: gr.weight,
  attachments: gr.attachments,
  timeline: gr.timeline.map(toTimelineEvent),
});

const humanizeStatus = (status: string): string => status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

type Props = NativeStackScreenProps<MoreStackParamList, 'CustomerTracking'>;

export const CustomerTrackingScreen = ({ route }: Props) => {
  const theme = useAppTheme();
  const { t } = useTranslation();
  const { colors, spacing, radii, shadows } = theme;
  const { navigate, goToNotifications } = useAppNav();
  const accessToken = useAuthStore((state) => state.accessToken);

  const styles = createStyles(theme);

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
    if (!trimmed) return;
    setLoading(true);
    setSearched(true);
    setShipment(null);
    try {
      // Tracking looks the GR up through the backend
      // (`GET /admin/orders/track/{gr}`, Neon) via `orderRepository`.
      const local = await orderRepository.getByOrderNumber(trimmed);
      setShipment(local ? toTrackedShipment(local) : null);
    } catch {
      setShipment(null);
      Alert.alert(t('common.error'), t('tracking.errorLookup'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
      <Header
        title={t('tracking.title')}
        leftAction={{ icon: 'person-circle-outline', onPress: () => navigate('Profile'), accessibilityLabel: t('common.profile') }}
        rightAction={{ icon: 'notifications-outline', onPress: goToNotifications, badge: unread }}
      />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
          <Text style={styles.screenTitle}>{t('tracking.trackShipment')}</Text>
          <Text style={styles.screenSubtitle}>{t('tracking.enterGrSubtitle')}</Text>

          <LinearGradient
            colors={[colors.primarySoft, colors.surface]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.searchCard, { borderRadius: radii.xl, ...shadows.md }]}
          >
            <View style={[styles.searchRow, { borderColor: colors.border, borderRadius: radii.lg }]}>
              <View style={[styles.searchIcon, { backgroundColor: colors.primarySoft, borderRadius: radii.md }]}>
                <Ionicons name="cube-outline" size={20} color={colors.primary} />
              </View>
              <TextInput
                style={[styles.searchInput, { color: colors.textPrimary }]}
                placeholder={t('tracking.enterGRNumber')}
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
              style={[styles.trackBtn, { backgroundColor: colors.primary, borderRadius: radii.button }]}
              onPress={handleTrack}
              disabled={loading || !grNumber.trim()}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={t('tracking.trackShipment')}
            >
              {loading ? (
                <ActivityIndicator color={colors.onPrimary} size="small" />
              ) : (
                <>
                  <Ionicons name="search" size={18} color={colors.onPrimary} />
                  <Text style={[styles.trackBtnText, { color: colors.onPrimary }]}>{t('tracking.track')}</Text>
                </>
              )}
            </TouchableOpacity>
          </LinearGradient>

          {!searched && (
            <View style={{ marginTop: spacing.xxxl }}>
              <EmptyState
                icon="paper-plane-outline"
                title={t('tracking.trackYourShipment')}
                subtitle={t('tracking.trackDesc')}
                iconColor={colors.primary}
              />
            </View>
          )}

          {searched && !loading && !shipment && (
            <View style={{ marginTop: spacing.xxxl }}>
              <EmptyState
                icon="alert-circle-outline"
                title={t('tracking.noShipmentFound')}
                subtitle={t('tracking.checkAndRetry')}
                iconColor={colors.error}
              />
            </View>
          )}

          {shipment && (
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radii.xl, ...shadows.md }]}>
              <View style={styles.cardHeader}>
                <View>
                  <Text style={styles.fieldLabel}>{t('tracking.grNumber')}</Text>
                  <Text style={styles.grNumber}>{shipment.orderNumber}</Text>
                  {shipment.createdAt && <Text style={styles.cardDate}>{t('tracking.booked')} {formatDateTime(shipment.createdAt)}</Text>}
                </View>
                <StatusBadge status={shipment.status} size="lg" />
              </View>

              {/* 4-stage progress timeline */}
              <View style={[styles.timelineCard, { backgroundColor: colors.surfaceMuted, borderRadius: radii.lg }]}>
                <View style={[styles.timelineTrack, { backgroundColor: colors.border }]}>
                  <Animated.View
                    style={[
                      styles.timelineFill,
                      {
                        backgroundColor: colors.primary,
                        borderRadius: radii.pill,
                        width: progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
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
                              backgroundColor: reached ? colors.primary : colors.surfaceMuted,
                              borderColor: reached ? colors.primary : colors.borderStrong,
                            },
                          ]}
                        >
                          <Ionicons name={reached ? 'checkmark' : 'ellipse'} size={10} color={reached ? colors.onPrimary : colors.textMuted} />
                        </View>
                        <Text
                          numberOfLines={1}
                          style={[styles.stepLabel, { color: reached ? colors.textPrimary : colors.textMuted, fontWeight: reached ? '700' : '500' }]}
                        >
                          {t(stage.labelKey)}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>

              {shipment.timeline.length > 0 && (
                <View style={styles.historyBlock}>
                  <Text style={styles.fieldLabel}>{t('tracking.statusHistory')}</Text>
                  {shipment.timeline.map((event) => (
                    <View key={event.id} style={styles.historyRow}>
                      <View style={[styles.historyDot, { backgroundColor: colors.primary }]} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.historyStatus}>{t(`summary.${event.status}`, humanizeStatus(event.status))}</Text>
                        {event.description ? <Text style={styles.historyDesc}>{event.description}</Text> : null}
                      </View>
                      {event.timestamp && <Text style={styles.historyTime}>{formatDateTime(event.timestamp)}</Text>}
                    </View>
                  ))}
                </View>
              )}

              <View style={[styles.divider, { backgroundColor: colors.border }]} />

              <View style={styles.grid}>
                <Field theme={theme} label={t('tracking.consignor')} value={shipment.consignorName || '—'} />
                <Field theme={theme} label={t('tracking.consignee')} value={shipment.consigneeName || '—'} />
                <Field theme={theme} label={t('tracking.fromTo')} value={`${shipment.pickupAddress} → ${shipment.deliveryAddress}`} wide />
                <Field theme={theme} label={t('tracking.deliveryAt')} value={shipment.deliveryAddress} wide />
              </View>

              <View style={[styles.divider, { backgroundColor: colors.border }]} />

              <View style={styles.particularsRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>{t('tracking.particulars')}</Text>
                  <Text style={styles.fieldValue}>{shipment.particulars || '—'}</Text>
                </View>
                <View>
                  <Text style={styles.fieldLabel}>{t('tracking.packages')}</Text>
                  <Text style={styles.fieldValue}>{shipment.packageCount ?? '—'}</Text>
                </View>
                <View>
                  <Text style={styles.fieldLabel}>{t('tracking.weightLabel')}</Text>
                  <Text style={styles.fieldValue}>{shipment.weight ? `${shipment.weight} kg` : '—'}</Text>
                </View>
              </View>

              <View style={[styles.divider, { backgroundColor: colors.border }]} />

              <Text style={styles.fieldLabel}>{t('tracking.photosSlip')}</Text>
              {shipment.attachments.length === 0 ? (
                <Text style={styles.noPhotos}>{t('tracking.noPhotosYet')}</Text>
              ) : (
                <View style={{ gap: 8, marginTop: 8 }}>
                  {shipment.attachments.map((a) => (
                    <TouchableOpacity key={a.id} style={[styles.photoRow, { backgroundColor: colors.surfaceMuted, borderRadius: radii.md }]} onPress={() => setPreviewAttachment(a)}>
                      <Ionicons name={a.mimeType?.startsWith('image/') ? 'image-outline' : 'document-text-outline'} size={18} color={colors.primary} />
                      <Text style={styles.photoName} numberOfLines={1}>{a.originalFilename}</Text>
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

const Field = ({ theme, label, value, wide = false }: { theme: AppTheme; label: string; value: string; wide?: boolean }) => {
  const styles = createStyles(theme);
  return (
    <View style={[styles.gridItem, wide && styles.gridItemWide]}>
      <Text style={styles.fieldLabel}>{label.toUpperCase()}</Text>
      <Text style={[styles.fieldValue, { fontSize: theme.fonts.size.sm }]}>{value}</Text>
    </View>
  );
};

const createStyles = (theme: Pick<AppTheme, 'colors' | 'spacing' | 'radii' | 'fonts' | 'shadows'>) =>
  StyleSheet.create({
    safe: { flex: 1 },
    scrollContent: { padding: theme.spacing.xl, paddingBottom: 60 },
    screenTitle: { fontSize: 26, fontWeight: '800', letterSpacing: -0.5, color: theme.colors.textPrimary },
    screenSubtitle: { fontSize: 14, fontWeight: '500', marginTop: 4, marginBottom: 18, color: theme.colors.textSecondary },
    searchCard: { padding: 16, gap: 12, marginBottom: 4 },
    searchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 4 },
    searchIcon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    searchInput: { flex: 1, paddingVertical: 12, fontSize: 15, fontWeight: '600' },
    trackBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 52 },
    trackBtnText: { fontWeight: '800', fontSize: 16 },
    card: { padding: 20, marginTop: 20, borderWidth: 1 },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, gap: 12 },
    grNumber: { fontSize: 22, fontWeight: '800', marginTop: 2, color: theme.colors.textPrimary },
    cardDate: { fontSize: 12, marginTop: 3, color: theme.colors.textMuted },
    timelineCard: { padding: 16, marginBottom: 16 },
    timelineTrack: { height: 6, borderRadius: 999, overflow: 'hidden' },
    timelineFill: { height: 6, width: '100%' },
    timelineSteps: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
    stepWrap: { alignItems: 'center', gap: 6, width: '24%' },
    stepDot: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
    stepLabel: { fontSize: 9, textAlign: 'center' },
    historyBlock: { gap: 10, marginBottom: 8 },
    historyRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    historyDot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
    historyStatus: { fontSize: 13, fontWeight: '700', color: theme.colors.textPrimary },
    historyDesc: { fontSize: 12, marginTop: 1, color: theme.colors.textSecondary },
    historyTime: { fontSize: 11, marginLeft: 8, color: theme.colors.textMuted },
    divider: { height: 1, marginVertical: 16 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
    gridItem: { minWidth: '45%', flexGrow: 1 },
    gridItemWide: { minWidth: '100%' },
    fieldLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5, color: theme.colors.textMuted },
    fieldValue: { fontWeight: '600', marginTop: 3, lineHeight: 18, color: theme.colors.textPrimary },
    particularsRow: { flexDirection: 'row', gap: 16 },
    noPhotos: { fontSize: 13, fontStyle: 'italic', marginTop: 6, color: theme.colors.textMuted },
    photoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
    photoName: { flex: 1, fontSize: 13, fontWeight: '600', color: theme.colors.textPrimary },
  });

export default CustomerTrackingScreen;
