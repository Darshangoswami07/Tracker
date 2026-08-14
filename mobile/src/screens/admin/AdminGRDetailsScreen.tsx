import { useCallback, useEffect, useState, type ComponentProps } from 'react';
import { ActivityIndicator, Alert, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAppTheme } from '../../theme/useAppTheme';
import { useAuthStore } from '../../store/authStore';
import { orderRepository } from '../../database/repositories/orderRepository';
import { syncLookupTables } from '../../database/sync';
import { Header } from '../../components/Header';
import { ShimmerCard } from '../../components/ShimmerCard';
import { EmptyState } from '../../components/EmptyState';
import { StatusBadge } from '../../components/StatusBadge';
import { AttachmentViewerModal, type ViewableAttachment } from '../../components/AttachmentViewerModal';
import { persistSlipImage } from '../../services/slipStorage';
import { useAppNav } from '../../hooks/useAppNav';
import type { AppTheme } from '../../theme/types';

interface GRAttachment {
  id: string;
  originalFilename: string;
  mimeType: string;
  createdAt: string;
  url: string;
}

/** Full GR record from `GET /admin/orders/{id}` — matches `admin/src/types/gr.ts` `GR` on the web reference. */
interface GRDetail {
  id: string;
  orderNumber: string;
  status: string;
  trackingCode: string | null;
  pickupAddress: string;
  deliveryAddress: string;
  consignorName: string | null;
  consigneeName: string | null;
  particulars: string | null;
  packageCount: number | null;
  weight: number | null;
  notes: string | null;
  driverId: string | null;
  assignedStaffId: string | null;
  createdAt: string;
  attachments: GRAttachment[];
}

interface PickerOption {
  id: string;
  name: string;
}

/** Every GR status, matching the web GR Details drawer's "Update Status"
 * `<select>` (`admin/src/app/dashboard/orders/page.tsx`'s `STATUS_OPTIONS`)
 * exactly — that dropdown lets Admin set a GR to ANY status at any time, not
 * just the "next" one in a pipeline. A prior version of this screen enforced
 * a linear transition graph (e.g. blocking any change once a GR reached
 * "delivered"), which the web reference never did and which is why Admin
 * appeared unable to change status. */
const ALL_STATUSES = ['pending', 'assigned', 'pickup', 'in_transit', 'delivered', 'failed', 'returned', 'cancelled'];

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  assigned: 'Assigned',
  pickup: 'Pickup',
  in_transit: 'In Transit',
  delivered: 'Delivered',
  failed: 'Failed',
  returned: 'Returned',
  cancelled: 'Cancelled',
};

const formatDate = (iso: string | null): string => {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
};

/**
 * Mobile equivalent of the web GR Details drawer
 * (`admin/src/app/dashboard/orders/page.tsx`'s `GRDetailDrawer`), extended
 * with staff/driver assignment. In the local-first architecture the full
 * record is read and mutated through the on-device SQLite repository
 * (`orderRepository`) so it works fully offline; driver/staff pickers are
 * seeded from the control plane when online and cached locally. Reached from
 * `AdminGRShipmentsScreen`; Back pops to that list.
 */
export const AdminGRDetailsScreen = ({ route }: any) => {
  const { orderId } = route.params as { orderId: string };
  const { colors, spacing, radii, fonts, shadows } = useAppTheme();
  const { goBack, navigate, navigation } = useAppNav();
  const accessToken = useAuthStore((state) => state.accessToken);

  const styles = createStyles({ colors, spacing, radii, fonts, shadows });

  const [gr, setGr] = useState<GRDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewAttachment, setPreviewAttachment] = useState<ViewableAttachment | null>(null);

  const [drivers, setDrivers] = useState<PickerOption[]>([]);
  const [staff, setStaff] = useState<PickerOption[]>([]);
  const [assignPicker, setAssignPicker] = useState<'driver' | 'staff' | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [statusPickerOpen, setStatusPickerOpen] = useState(false);

  const fetchDetail = useCallback(async () => {
    try {
      const gr = await orderRepository.getById(orderId);
      if (!gr) {
        setNotFound(true);
        return;
      }
      setGr(gr);
      setError(null);
      setNotFound(false);
    } catch (err: any) {
      setError(err?.message ?? 'Could not load this GR. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  // Refetch when returning from Edit GR so field changes made there show up
  // immediately, without a manual pull-to-refresh (no pull-to-refresh gesture
  // exists on this screen at all).
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchDetail();
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation]);

  // Loaded once, best-effort, to resolve assigned driver/staff names and to
  // populate the assignment pickers. Seeds from the control plane when online
  // and falls back to the locally cached rows, so names still resolve offline.
  useEffect(() => {
    (async () => {
      await syncLookupTables(accessToken);
      const [driverRows, staffRows] = await Promise.all([
        orderRepository.listDrivers(),
        orderRepository.listStaff(),
      ]);
      setDrivers(driverRows.map((d) => ({ id: d.id, name: d.name })));
      setStaff(staffRows.map((s) => ({ id: s.id, name: s.name })));
    })().catch(() => {
      /* picker stays empty */
    });
  }, [accessToken]);

  const updateStatus = async (status: string) => {
    setStatusPickerOpen(false);
    if (!gr || status === gr.status) return;
    setUpdating(true);
    try {
      setGr(await orderRepository.updateStatus(orderId, status));
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Could not update the status. Please try again.');
    } finally {
      setUpdating(false);
    }
  };

  const handleUploadSlip = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Gallery permission is required to select a photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    if (result.canceled) return;

    setUploading(true);
    try {
      // Persist the picked image into the app's Documents directory first so
      // the slip survives restarts and stays viewable fully offline from
      // AttachmentViewerModal (gallery URIs are temporary cache entries the
      // OS can evict at any time).
      const persisted = await persistSlipImage(result.assets[0].uri, result.assets[0].mimeType ?? 'image/jpeg');
      await orderRepository.addAttachment(orderId, {
        originalFilename: persisted.fileName,
        mimeType: persisted.mimeType,
        localUri: persisted.localUri,
        fileSizeBytes: persisted.fileSizeBytes,
      });
      await fetchDetail();
    } catch (err: any) {
      Alert.alert('Upload Failed', err?.message ?? 'Could not save the slip. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleAssign = async (option: PickerOption) => {
    if (!assignPicker) return;
    setAssigning(true);
    try {
      setGr(
        assignPicker === 'driver'
          ? await orderRepository.assignDriver(orderId, option.id)
          : await orderRepository.assignStaff(orderId, option.id)
      );
      setAssignPicker(null);
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? `Could not assign ${assignPicker}. Please try again.`);
    } finally {
      setAssigning(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <Header title="GR Details" leftAction={{ icon: 'chevron-back', onPress: goBack }} />
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <ShimmerCard style={styles.shimmer} height={28} />
          <ShimmerCard style={styles.shimmer} height={80} />
          <ShimmerCard style={styles.shimmer} height={120} />
          <ShimmerCard style={styles.shimmer} height={100} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (notFound) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <Header title="GR Details" leftAction={{ icon: 'chevron-back', onPress: goBack }} />
        <View style={styles.centerFill}>
          <EmptyState icon="alert-circle-outline" title="GR not found" subtitle="This GR may have been removed." iconColor={colors.error} />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !gr) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <Header title="GR Details" leftAction={{ icon: 'chevron-back', onPress: goBack }} />
        <View style={styles.centerFill}>
          <EmptyState
            icon="cloud-offline-outline"
            title="Something went wrong"
            subtitle={error ?? 'Could not load this GR.'}
            actionLabel="Retry"
            onActionPress={() => {
              setLoading(true);
              fetchDetail();
            }}
            iconColor={colors.error}
          />
        </View>
      </SafeAreaView>
    );
  }

  const assignedDriverName = gr.driverId ? drivers.find((d) => d.id === gr.driverId)?.name ?? 'Assigned' : null;
  const assignedStaffName = gr.assignedStaffId ? staff.find((s) => s.id === gr.assignedStaffId)?.name ?? 'Assigned' : null;
  const pickerOptions = assignPicker === 'driver' ? drivers : staff;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <Header
        title="GR Details"
        leftAction={{ icon: 'chevron-back', onPress: goBack }}
        rightAction={{ icon: 'create-outline', onPress: () => navigate('EditGR', { orderId }), accessibilityLabel: 'Edit GR' }}
      />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.titleRow}>
          <View>
            <Text style={[styles.label, { color: colors.textMuted }]}>GR NUMBER</Text>
            <Text style={[styles.grNo, { color: colors.textPrimary }]}>{gr.orderNumber}</Text>
            {gr.trackingCode && (
              <Text style={[styles.trackingCode, { color: colors.textMuted }]}>Tracking: {gr.trackingCode}</Text>
            )}
          </View>
          <StatusBadge status={gr.status} size="lg" />
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>ROUTE</Text>
          <View style={styles.routeRow}>
            <Ionicons name="ellipse" size={10} color="#10B981" />
            <Text style={[styles.routeText, { color: colors.textPrimary }]}>{gr.pickupAddress}</Text>
          </View>
          <View style={styles.routeRow}>
            <Ionicons name="location" size={12} color="#EF4444" />
            <Text style={[styles.routeText, { color: colors.textPrimary }]}>{gr.deliveryAddress}</Text>
          </View>
        </View>

        <View style={styles.grid}>
          <Field label="Consignor" value={gr.consignorName || '—'} />
          <Field label="Consignee" value={gr.consigneeName || '—'} />
          <Field label="Package Count" value={gr.packageCount != null ? String(gr.packageCount) : '—'} />
          <Field label="Weight" value={gr.weight != null ? `${gr.weight} kg` : '—'} />
        </View>

        {gr.particulars && (
          <View style={[styles.card, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}>
            <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>PARTICULARS</Text>
            <Text style={[styles.bodyText, { color: colors.textPrimary }]}>{gr.particulars}</Text>
          </View>
        )}

        <View style={[styles.card, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>ASSIGNMENT</Text>
          <AssignRow
            icon="person-outline"
            label="Staff"
            value={assignedStaffName}
            onPress={() => setAssignPicker('staff')}
          />
          <AssignRow
            icon="car-outline"
            label="Driver"
            value={assignedDriverName}
            onPress={() => setAssignPicker('driver')}
          />
        </View>

        <TouchableOpacity
          style={[styles.statusButton, { backgroundColor: colors.primary, borderRadius: radii.md, opacity: updating ? 0.6 : 1 }]}
          onPress={() => setStatusPickerOpen(true)}
          disabled={updating}
          activeOpacity={0.85}
        >
          <Ionicons name="sync-outline" size={16} color={colors.onPrimary} />
          <Text style={[styles.statusButtonText, { color: colors.onPrimary }]}>
            {updating ? 'Updating…' : 'Update Status'}
          </Text>
        </TouchableOpacity>

        <View style={[styles.card, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>SLIP / DOCUMENTS</Text>
            <TouchableOpacity
              style={[styles.uploadButton, { borderColor: colors.primary, borderRadius: radii.pill, opacity: uploading ? 0.6 : 1 }]}
              onPress={handleUploadSlip}
              disabled={uploading}
            >
              {uploading ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <>
                  <Ionicons name="camera-outline" size={14} color={colors.primary} />
                  <Text style={[styles.uploadButtonText, { color: colors.primary }]}>
                    {gr.attachments.length > 0 ? 'Replace Slip' : 'Upload Slip'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
          {gr.attachments.length === 0 ? (
            <Text style={[styles.noSlip, { color: colors.textMuted }]}>No slip or photos uploaded yet.</Text>
          ) : (
            <View style={{ gap: 8, marginTop: 8 }}>
              {gr.attachments.map((a) => (
                <TouchableOpacity
                  key={a.id}
                  style={[styles.attachmentRow, { backgroundColor: colors.surfaceMuted, borderRadius: radii.md }]}
                  onPress={() => setPreviewAttachment(a)}
                >
                  <Ionicons
                    name={a.mimeType.startsWith('image/') ? 'image-outline' : 'document-text-outline'}
                    size={18}
                    color={colors.primary}
                  />
                  <Text style={[styles.attachmentName, { color: colors.textPrimary }]} numberOfLines={1}>
                    {a.originalFilename}
                  </Text>
                  <Ionicons name="eye-outline" size={16} color={colors.textMuted} />
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        <Text style={[styles.createdAt, { color: colors.textMuted }]}>Created {formatDate(gr.createdAt)}</Text>
      </ScrollView>

      <AttachmentViewerModal attachment={previewAttachment} onClose={() => setPreviewAttachment(null)} />

      <Modal visible={!!assignPicker} animationType="slide" transparent onRequestClose={() => setAssignPicker(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.background, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
                Assign {assignPicker === 'driver' ? 'Driver' : 'Staff'}
              </Text>
              <TouchableOpacity onPress={() => setAssignPicker(null)} hitSlop={8}>
                <Ionicons name="close" size={22} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 360 }}>
              {pickerOptions.length === 0 ? (
                <Text style={[styles.emptyOptions, { color: colors.textMuted }]}>
                  No {assignPicker === 'driver' ? 'drivers' : 'staff'} found for this company.
                </Text>
              ) : (
                pickerOptions.map((option) => (
                  <TouchableOpacity
                    key={option.id}
                    style={[styles.optionRow, { borderBottomColor: colors.border }]}
                    onPress={() => handleAssign(option)}
                    disabled={assigning}
                  >
                    <Text style={[styles.optionName, { color: colors.textPrimary }]}>{option.name}</Text>
                    {assigning ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />}
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={statusPickerOpen} animationType="slide" transparent onRequestClose={() => setStatusPickerOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.background, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Update Status</Text>
              <TouchableOpacity onPress={() => setStatusPickerOpen(false)} hitSlop={8}>
                <Ionicons name="close" size={22} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 420 }}>
              {ALL_STATUSES.map((status) => (
                <TouchableOpacity
                  key={status}
                  style={[styles.optionRow, { borderBottomColor: colors.border }]}
                  onPress={() => updateStatus(status)}
                  disabled={updating}
                >
                  <Text style={[styles.optionName, { color: colors.textPrimary }]}>{STATUS_LABELS[status] || status}</Text>
                  {status === gr?.status ? (
                    <Ionicons name="checkmark" size={18} color={colors.primary} />
                  ) : updating ? null : (
                    <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

type IoniconName = ComponentProps<typeof Ionicons>['name'];

const AssignRow = ({ icon, label, value, onPress }: { icon: IoniconName; label: string; value: string | null; onPress: () => void }) => {
  const theme = useAppTheme();
  const styles = createStyles(theme);
  return (
    <TouchableOpacity style={styles.assignRow} onPress={onPress} activeOpacity={0.7}>
      <Ionicons name={icon} size={16} color={theme.colors.textMuted} />
      <Text style={[styles.assignLabel, { color: theme.colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.assignValue, { color: value ? theme.colors.textPrimary : theme.colors.textMuted }]} numberOfLines={1}>
        {value ?? 'Unassigned'}
      </Text>
      <Ionicons name="chevron-forward" size={16} color={theme.colors.textMuted} />
    </TouchableOpacity>
  );
};

const Field = ({ label, value }: { label: string; value: string }) => {
  const theme = useAppTheme();
  const styles = createStyles(theme);
  return (
    <View style={styles.gridItem}>
      <Text style={[styles.label, { color: theme.colors.textMuted }]}>{label.toUpperCase()}</Text>
      <Text style={[styles.fieldValue, { color: theme.colors.textPrimary, fontSize: theme.fonts.size.sm }]}>{value}</Text>
    </View>
  );
};

const createStyles = (theme: Pick<AppTheme, 'colors' | 'spacing' | 'radii' | 'fonts' | 'shadows'>) =>
  StyleSheet.create({
    safe: { flex: 1 },
    centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: theme.spacing.lg },
    scrollContent: { paddingBottom: 48, paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.lg, gap: theme.spacing.md },
    shimmer: { borderRadius: theme.radii.lg },
    titleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
    label: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
    grNo: { fontSize: theme.fonts.size.xl, fontWeight: '800', marginTop: 2 },
    trackingCode: { fontSize: theme.fonts.size.xs, marginTop: 4 },
    card: { padding: 16, gap: 8 },
    sectionTitle: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
    sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    routeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    routeText: { fontSize: theme.fonts.size.sm, fontWeight: '600', flex: 1 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.md },
    gridItem: { minWidth: '45%', flexGrow: 1 },
    fieldValue: { fontWeight: '700', marginTop: 3 },
    bodyText: { fontSize: theme.fonts.size.sm, fontWeight: '600' },
    assignRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
    assignLabel: { fontSize: theme.fonts.size.sm, fontWeight: '600', width: 50 },
    assignValue: { flex: 1, fontSize: theme.fonts.size.sm, fontWeight: '700' },
    statusButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14 },
    statusButtonText: { fontWeight: '800', fontSize: theme.fonts.size.md },
    uploadButton: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6 },
    uploadButtonText: { fontSize: theme.fonts.size.xs, fontWeight: '800' },
    noSlip: { fontSize: theme.fonts.size.sm, fontStyle: 'italic' },
    attachmentRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
    attachmentName: { flex: 1, fontSize: theme.fonts.size.sm, fontWeight: '600' },
    createdAt: { fontSize: theme.fonts.size.xs, textAlign: 'center', fontWeight: '600' },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    modalSheet: { padding: theme.spacing.lg, maxHeight: '70%' },
    modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: theme.spacing.md },
    modalTitle: { fontSize: theme.fonts.size.lg, fontWeight: '800' },
    emptyOptions: { textAlign: 'center', paddingVertical: 24, fontSize: theme.fonts.size.sm },
    optionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
    optionName: { fontSize: theme.fonts.size.md, fontWeight: '600' },
  });

export default AdminGRDetailsScreen;
