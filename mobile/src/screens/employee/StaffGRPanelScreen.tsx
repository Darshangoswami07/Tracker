import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAppTheme } from '../../theme/useAppTheme';
import { useAppNav } from '../../hooks/useAppNav';
import { orderRepository } from '../../database/repositories/orderRepository';
import { persistSlipImage } from '../../services/slipStorage';
import { Header } from '../../components/Header';
import { EmptyState } from '../../components/EmptyState';
import { StatusBadge } from '../../components/StatusBadge';
import type { AppTheme } from '../../theme/types';

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

export const StaffGRPanelScreen = () => {
  const theme = useAppTheme();
  const { colors, spacing, radii, shadows } = theme;
  const { navigate, goToNotifications } = useAppNav();

  const styles = createStyles(theme);

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

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
      <Header title="GR Tracker" rightAction={{ icon: 'notifications-outline', onPress: goToNotifications }} />

      <View style={styles.toolbar}>
        <View style={[styles.searchRow, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radii.lg }]}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: colors.textPrimary }]}
            placeholder="Search GR number, consignor..."
            placeholderTextColor={colors.textMuted}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
            onSubmitEditing={() => fetchEntries()}
          />
        </View>
      </View>

      {loading ? (
        <View style={styles.centerFill}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} progressBackgroundColor={colors.surface} />}
        >
          {entries.length === 0 ? (
            <EmptyState icon="document-text-outline" title="No GR entries" subtitle="Entries assigned to your company will appear here." />
          ) : (
            entries.map((entry) => (
              <TouchableOpacity
                key={entry.id}
                style={[styles.row, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}
                onPress={() => navigate('OrderDetails', { orderId: entry.id })}
                activeOpacity={0.85}
              >
                <View style={styles.rowTop}>
                  <Text style={styles.grNo}>{entry.orderNumber}</Text>
                  <TouchableOpacity
                    style={styles.statusTrigger}
                    onPress={() => setStatusPickerFor(entry)}
                    disabled={updatingId === entry.id}
                  >
                    {updatingId === entry.id ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <>
                        <StatusBadge status={entry.status} size="sm" />
                        <Ionicons name="chevron-down" size={12} color={colors.textMuted} />
                      </>
                    )}
                  </TouchableOpacity>
                </View>
                <Text style={styles.consignorLine}>
                  {entry.consignorName || '—'} <Text style={{ color: colors.textMuted }}>→</Text> {entry.consigneeName || '—'}
                </Text>
                <Text style={styles.routeLine} numberOfLines={1}>{entry.pickupAddress} → {entry.deliveryAddress}</Text>

                <View style={[styles.rowFooter, { borderTopColor: colors.border }]}>
                  <TouchableOpacity style={styles.photoAction} onPress={() => handleUploadPhoto(entry)} disabled={uploadingId === entry.id}>
                    {uploadingId === entry.id ? (
                      <ActivityIndicator size="small" color={colors.textPrimary} />
                    ) : (
                      <>
                        <Ionicons name="camera-outline" size={16} color={colors.textPrimary} />
                        <Text style={styles.photoActionText}>{entry.hasSlip ? 'Replace Photo' : 'Upload Photo'}</Text>
                      </>
                    )}
                  </TouchableOpacity>
                  {entry.hasSlip && (
                    <View style={styles.slipBadge}>
                      <Ionicons name="checkmark-circle" size={14} color={colors.success} />
                      <Text style={[styles.slipBadgeText, { color: colors.success }]}>Slip on file</Text>
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
          <View style={[styles.modalSheet, { backgroundColor: colors.surface, borderRadius: radii.xl }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{statusPickerFor ? `Update GR ${statusPickerFor.orderNumber}` : 'Update Status'}</Text>
              <TouchableOpacity onPress={() => setStatusPickerFor(null)} hitSlop={8}>
                <Ionicons name="close" size={22} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 420 }}>
              {ALL_STATUSES.map((status) => (
                <TouchableOpacity
                  key={status}
                  style={[styles.optionRow, { borderBottomColor: colors.border }]}
                  onPress={() => statusPickerFor && updateStatus(statusPickerFor.id, status)}
                  disabled={!!updatingId}
                >
                  <Text style={styles.optionName}>{STATUS_LABELS[status] || status}</Text>
                  {status === statusPickerFor?.status ? (
                    <Ionicons name="checkmark" size={18} color={colors.primary} />
                  ) : (
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

const createStyles = (theme: Pick<AppTheme, 'colors' | 'spacing' | 'radii' | 'fonts' | 'shadows'>) =>
  StyleSheet.create({
    safe: { flex: 1 },
    toolbar: { paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.md, paddingBottom: theme.spacing.sm },
    searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 4 },
    searchInput: { flex: 1, paddingVertical: 10, fontSize: theme.fonts.size.sm },
    centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    scrollContent: { padding: theme.spacing.lg, paddingTop: theme.spacing.sm, gap: theme.spacing.md, paddingBottom: 60 },
    row: { padding: 16, gap: 6 },
    rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    grNo: { fontWeight: '800', fontSize: theme.fonts.size.md, color: theme.colors.textPrimary },
    statusTrigger: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    consignorLine: { fontSize: theme.fonts.size.sm, fontWeight: '600', color: theme.colors.textPrimary },
    routeLine: { fontSize: theme.fonts.size.xs, color: theme.colors.textMuted },
    rowFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
    photoAction: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    photoActionText: { fontSize: theme.fonts.size.xs, fontWeight: '700', color: theme.colors.textPrimary },
    slipBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    slipBadgeText: { fontSize: theme.fonts.size.xs, fontWeight: '600' },
    modalOverlay: { flex: 1, backgroundColor: theme.colors.overlay, justifyContent: 'flex-end' },
    modalSheet: { padding: 20, maxHeight: '70%' },
    modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
    modalTitle: { fontSize: theme.fonts.size.lg, fontWeight: '800', color: theme.colors.textPrimary },
    optionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
    optionName: { fontSize: theme.fonts.size.md, fontWeight: '600', color: theme.colors.textPrimary },
  });

export default StaffGRPanelScreen;
