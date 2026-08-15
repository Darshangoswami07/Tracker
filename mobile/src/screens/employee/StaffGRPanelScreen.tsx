import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAppTheme } from '../../theme/useAppTheme';
import { useAppNav } from '../../hooks/useAppNav';
import { useUserStore } from '../../store/userStore';
import { orderRepository } from '../../database/repositories/orderRepository';
import { persistSlipImage } from '../../services/slipStorage';
import { EmptyState } from '../../components/EmptyState';

const NAVY = '#0F172A';
const AMBER = '#F97316';
const CREAM = '#FAF6EE';

interface GREntry {
  id: string;
  orderNumber: string;
  consignorName?: string;
  consigneeName?: string;
  pickupAddress: string;
  deliveryAddress: string;
  status: string;
  hasSlip: boolean;
}

/** Every GR status, matching the web Staff Panel's `<select>`
 * (`admin/src/components/tracker/StaffPanel.tsx`'s `STATUS_OPTIONS`) — that
 * dropdown lets any GR-access role set a GR to any status at any time, not
 * just the "next" one in a fixed pipeline. */
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

const STATUS_COLORS: Record<string, string> = {
  pending: '#F59E0B',
  assigned: '#06B6D4',
  pickup: '#8B5CF6',
  in_transit: '#3B82F6',
  delivered: '#10B981',
  failed: '#EF4444',
  returned: '#F97316',
  cancelled: '#6B7280',
};

export const StaffGRPanelScreen = () => {
  const { spacing, radii } = useAppTheme();
  const { goBack, navigate } = useAppNav();
  const user = useUserStore((state) => state.user);

  const [entries, setEntries] = useState<GREntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [statusPickerFor, setStatusPickerFor] = useState<GREntry | null>(null);

  const fetchEntries = useCallback(
    async (_isRefresh = false) => {
      try {
        // GR data is local-first (created on-device, never synced to the
        // backend), so this reads the on-device SQLite database directly
        // instead of `GET /employee/orders`, which only knows about
        // backend-created orders.
        const { items } = await orderRepository.list({ page: 1, pageSize: 50, search: search || undefined });
        setEntries(
          items.map((o) => ({
            id: o.id,
            orderNumber: o.orderNumber,
            consignorName: o.consignorName ?? undefined,
            consigneeName: o.consigneeName ?? undefined,
            pickupAddress: o.pickupAddress,
            deliveryAddress: o.deliveryAddress,
            status: o.status,
            hasSlip: o.hasSlip,
          }))
        );
      } catch (error) {
        console.error('Failed to fetch GR entries:', error);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [search]
  );

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchEntries(true);
  };

  const updateStatus = async (orderId: string, status: string) => {
    setStatusPickerFor(null);
    setUpdatingId(orderId);
    try {
      await orderRepository.updateStatus(orderId, status);
      fetchEntries(true);
    } catch (error) {
      console.error('Failed to update status:', error);
      Alert.alert('Error', 'Could not update the status. Please try again.');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleUploadPhoto = async (entry: GREntry) => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Gallery permission is required to select a photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    if (result.canceled) return;

    setUploadingId(entry.id);
    try {
      // Persisted into the app's Documents directory first so the photo
      // survives restarts (gallery URIs are temporary cache entries the OS
      // can evict), matching `AdminGRDetailsScreen`'s upload flow.
      const persisted = await persistSlipImage(result.assets[0].uri, result.assets[0].mimeType ?? 'image/jpeg');
      await orderRepository.addAttachment(entry.id, {
        originalFilename: persisted.fileName,
        mimeType: persisted.mimeType,
        localUri: persisted.localUri,
        fileSizeBytes: persisted.fileSizeBytes,
      });
      fetchEntries(true);
    } catch (error) {
      console.error('Failed to upload photo:', error);
      Alert.alert('Upload Failed', 'Could not upload the photo. Please try again.');
    } finally {
      setUploadingId(null);
    }
  };

  const companyName = user?.fullName ? 'DeliveryHub' : 'DeliveryHub';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={[styles.header, { paddingTop: spacing.md }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={goBack} style={styles.backBtn} hitSlop={8}>
            <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={[styles.badge, { borderRadius: radii.md }]}>
            <Text style={styles.badgeText}>DH</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.brandTitle}>{companyName}</Text>
            <Text style={styles.brandSubtitle}>Staff Panel</Text>
          </View>
        </View>
      </View>
      <View style={styles.goldStrip} />

      <View style={styles.toolbar}>
        <Text style={styles.toolbarTitle}>All GR Entries</Text>
        <TextInput
          style={[styles.searchInput, { borderRadius: radii.md }]}
          placeholder="Search GR number, consignor..."
          placeholderTextColor="#9CA3AF"
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
          onSubmitEditing={() => fetchEntries()}
        />
      </View>

      {loading ? (
        <View style={styles.centerFill}>
          <ActivityIndicator color={AMBER} size="large" />
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1, backgroundColor: CREAM }}
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={AMBER} />}
        >
          {entries.length === 0 ? (
            <EmptyState icon="document-text-outline" title="No GR entries" subtitle="Entries assigned to your company will appear here." iconColor={AMBER} />
          ) : (
            entries.map((entry) => (
              <TouchableOpacity
                key={entry.id}
                style={[styles.row, { borderRadius: radii.md }]}
                onPress={() => navigate('OrderDetails', { orderId: entry.id })}
                activeOpacity={0.85}
              >
                <View style={styles.rowTop}>
                  <Text style={styles.grNo}>{entry.orderNumber}</Text>
                  <TouchableOpacity
                    style={[styles.statusPill, { backgroundColor: `${STATUS_COLORS[entry.status] || '#6B7280'}18` }]}
                    onPress={() => setStatusPickerFor(entry)}
                    disabled={updatingId === entry.id}
                  >
                    {updatingId === entry.id ? (
                      <ActivityIndicator size="small" color={STATUS_COLORS[entry.status] || NAVY} />
                    ) : (
                      <>
                        <Text style={[styles.statusPillText, { color: STATUS_COLORS[entry.status] || NAVY }]}>
                          {STATUS_LABELS[entry.status] || entry.status}
                        </Text>
                        <Ionicons name="chevron-down" size={12} color={STATUS_COLORS[entry.status] || NAVY} />
                      </>
                    )}
                  </TouchableOpacity>
                </View>
                <Text style={styles.consignorLine}>
                  {entry.consignorName || '—'} <Text style={{ color: '#9CA3AF' }}>→</Text> {entry.consigneeName || '—'}
                </Text>
                <Text style={styles.routeLine}>{entry.pickupAddress} → {entry.deliveryAddress}</Text>

                <View style={styles.rowFooter}>
                  <TouchableOpacity
                    style={styles.photoAction}
                    onPress={() => handleUploadPhoto(entry)}
                    disabled={uploadingId === entry.id}
                  >
                    {uploadingId === entry.id ? (
                      <ActivityIndicator size="small" color={NAVY} />
                    ) : (
                      <>
                        <Ionicons name="camera-outline" size={16} color={NAVY} />
                        <Text style={styles.photoActionText}>{entry.hasSlip ? 'Replace Photo' : 'Upload Photo'}</Text>
                      </>
                    )}
                  </TouchableOpacity>
                  {entry.hasSlip && (
                    <View style={styles.slipBadge}>
                      <Ionicons name="checkmark-circle" size={14} color="#10B981" />
                      <Text style={styles.slipBadgeText}>Slip on file</Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      )}

      <Modal visible={!!statusPickerFor} animationType="slide" transparent onRequestClose={() => setStatusPickerFor(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { borderRadius: radii.xl }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {statusPickerFor ? `Update GR ${statusPickerFor.orderNumber}` : 'Update Status'}
              </Text>
              <TouchableOpacity onPress={() => setStatusPickerFor(null)} hitSlop={8}>
                <Ionicons name="close" size={22} color={NAVY} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 420 }}>
              {ALL_STATUSES.map((status) => (
                <TouchableOpacity
                  key={status}
                  style={styles.optionRow}
                  onPress={() => statusPickerFor && updateStatus(statusPickerFor.id, status)}
                  disabled={!!updatingId}
                >
                  <Text style={styles.optionName}>{STATUS_LABELS[status] || status}</Text>
                  {status === statusPickerFor?.status ? (
                    <Ionicons name="checkmark" size={18} color={AMBER} />
                  ) : (
                    <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
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

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: NAVY },
  header: { backgroundColor: NAVY, paddingHorizontal: 20, paddingBottom: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  badge: { width: 40, height: 40, borderWidth: 1.5, borderColor: AMBER, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: AMBER, fontWeight: '800', fontSize: 14 },
  brandTitle: { color: '#FFFFFF', fontWeight: '800', fontSize: 17 },
  brandSubtitle: { color: '#CBD5E1', fontSize: 12, marginTop: 1 },
  goldStrip: { height: 4, backgroundColor: AMBER, opacity: 0.85 },
  toolbar: { backgroundColor: CREAM, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, gap: 10 },
  toolbarTitle: { fontSize: 16, fontWeight: '800', color: NAVY },
  searchInput: { backgroundColor: '#FFFFFF', paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: NAVY, borderWidth: 1, borderColor: '#EDE4D3' },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: CREAM },
  scrollContent: { padding: 20, paddingTop: 4, gap: 12, paddingBottom: 60 },
  row: { backgroundColor: '#FFFFFF', padding: 16, borderWidth: 1, borderColor: '#EDE4D3', gap: 6 },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  grNo: { fontWeight: '800', fontSize: 15, color: NAVY },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  statusPillText: { fontWeight: '700', fontSize: 11 },
  consignorLine: { fontSize: 13, fontWeight: '600', color: NAVY },
  routeLine: { fontSize: 12, color: '#6B7280' },
  rowFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#F1F0EA' },
  photoAction: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  photoActionText: { fontSize: 12, fontWeight: '700', color: NAVY },
  slipBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  slipBadgeText: { fontSize: 11, color: '#10B981', fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: CREAM, padding: 20, maxHeight: '70%' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  modalTitle: { fontSize: 16, fontWeight: '800', color: NAVY },
  optionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#EDE4D3' },
  optionName: { fontSize: 14, fontWeight: '600', color: NAVY },
});

export default StaffGRPanelScreen;
