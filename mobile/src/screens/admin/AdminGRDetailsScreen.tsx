import { useCallback, useEffect, useState, type ComponentProps } from 'react';
import { ActivityIndicator, Alert, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAppTheme } from '../../theme/useAppTheme';
import { useAuthStore } from '../../store/authStore';
import { api } from '../../api/client';
import { ENDPOINTS } from '../../api/endpoints';
import { Header } from '../../components/Header';
import { ShimmerCard } from '../../components/ShimmerCard';
import { EmptyState } from '../../components/EmptyState';
import { StatusBadge } from '../../components/StatusBadge';
import { AttachmentViewerModal, type ViewableAttachment } from '../../components/AttachmentViewerModal';
import { uploadOrderAttachment } from '../../services/orderAttachments';
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

/** Same GR status transition graph the web GR Details drawer's "Update
 * Status" dropdown allows and the mobile GR Tracker (Classic) panel uses
 * (`screens/employee/StaffGRPanelScreen.tsx`), kept identical so mobile
 * Admin can't drive a GR into a transition the web app disallows. */
const NEXT_STATUS_OPTIONS: Record<string, string[]> = {
  pending: ['assigned', 'cancelled'],
  assigned: ['pickup', 'cancelled'],
  pickup: ['in_transit'],
  in_transit: ['delivered', 'failed', 'returned'],
  delivered: [],
  failed: ['in_transit'],
  returned: [],
  cancelled: [],
};

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
 * with staff/driver assignment — endpoints the backend already exposes
 * (`POST /admin/orders/{id}/assign-driver` / `assign-staff`) that the web
 * page's own UI never wired up. Reads/writes the same `/admin/orders/{id}`,
 * `/admin/orders/{id}/status`, and shared `/orders/{id}/attachments`
 * endpoints. Reached from `AdminGRShipmentsScreen`; Back pops to that list.
 */
export const AdminGRDetailsScreen = ({ route }: any) => {
  const { orderId } = route.params as { orderId: string };
  const { colors, spacing, radii, fonts, shadows } = useAppTheme();
  const { goBack } = useAppNav();
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

  const fetchDetail = useCallback(async () => {
    try {
      const res = await api.get(ENDPOINTS.admin.orders.detail(orderId));
      setGr(res.data?.data ?? null);
      setError(null);
      setNotFound(false);
    } catch (err: any) {
      if (err?.response?.status === 404) {
        setNotFound(true);
      } else {
        setError(
          err?.response?.data?.error?.message ??
            (err?.message === 'Network Error' ? 'Unable to connect to the server.' : 'Could not load this GR. Please try again.')
        );
      }
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  // Loaded once, best-effort, to resolve assigned driver/staff names and to
  // populate the assignment pickers. Not fatal if it fails — the screen
  // still functions, just shows raw ids instead of names.
  useEffect(() => {
    (async () => {
      try {
        const res = await api.get(ENDPOINTS.admin.drivers, { params: { page_size: 100 } });
        const items = res.data?.data?.items ?? [];
        setDrivers(items.map((d: any) => ({ id: d.id, name: d.fullName })));
      } catch {
        /* picker stays empty */
      }
    })();
    (async () => {
      try {
        const res = await api.get(ENDPOINTS.admin.users, { params: { page_size: 100, role: 'employee' } });
        const items = res.data?.data?.items ?? [];
        setStaff(items.map((u: any) => ({ id: u.id, name: `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email })));
      } catch {
        /* picker stays empty */
      }
    })();
  }, []);

  const handleUpdateStatus = () => {
    if (!gr) return;
    const options = NEXT_STATUS_OPTIONS[gr.status] || [];
    if (options.length === 0) {
      Alert.alert('No further updates', `${STATUS_LABELS[gr.status] || gr.status} is a final status.`);
      return;
    }
    Alert.alert(
      `Update GR ${gr.orderNumber}`,
      'Choose the new status',
      [
        ...options.map((status) => ({ text: STATUS_LABELS[status] || status, onPress: () => updateStatus(status) })),
        { text: 'Cancel', style: 'cancel' as const },
      ]
    );
  };

  const updateStatus = async (status: string) => {
    setUpdating(true);
    try {
      const res = await api.patch(ENDPOINTS.admin.orders.updateStatus(orderId), { status });
      setGr(res.data?.data ?? null);
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error?.message ?? 'Could not update the status. Please try again.');
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
    if (result.canceled || !accessToken) return;

    setUploading(true);
    try {
      await uploadOrderAttachment(orderId, result.assets[0].uri, accessToken);
      await fetchDetail();
    } catch (err: any) {
      Alert.alert('Upload Failed', err?.response?.data?.error?.message ?? 'Could not upload the slip. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleAssign = async (option: PickerOption) => {
    if (!assignPicker) return;
    setAssigning(true);
    try {
      const res =
        assignPicker === 'driver'
          ? await api.post(ENDPOINTS.admin.orders.assignDriver(orderId), { driverId: option.id })
          : await api.post(ENDPOINTS.admin.orders.assignStaff(orderId), { staffId: option.id });
      setGr(res.data?.data ?? null);
      setAssignPicker(null);
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error?.message ?? `Could not assign ${assignPicker}. Please try again.`);
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
      <Header title="GR Details" leftAction={{ icon: 'chevron-back', onPress: goBack }} />
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
          onPress={handleUpdateStatus}
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
