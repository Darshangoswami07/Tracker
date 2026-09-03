import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import type { AppStateStatus } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useRoute } from '@react-navigation/native';
import { useAppTheme } from '../../theme/useAppTheme';
import { useAppNav } from '../../hooks/useAppNav';
import { orderRepository } from '../../database/repositories/orderRepository';
import { persistSlipImage } from '../../services/slipStorage';
import { Header } from '../../components/Header';
import { EmptyState } from '../../components/EmptyState';
import { StatusBadge } from '../../components/StatusBadge';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { useUserStore } from '../../store/userStore';
import { useAuthStore } from '../../store/authStore';
import { canDeleteGR as roleCanDeleteGR, allowedGrStatusTargets } from '../../constants/roles';
import { AREAS } from '../../constants/areas';
import { grRealtime } from '../../services/grRealtime';
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
const ALL_STATUSES = ['pending', 'cleared', 'uncleared', 'delivered'];

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  cleared: 'Cleared',
  uncleared: 'Uncleared',
  delivered: 'Delivered',
};

/** Optional params a caller can push this screen with to pre-filter by
 * status (e.g. the Staff Dashboard's "Pending Slip"/"Delivered Slip" quick
 * actions). Untyped across navigators since this screen is reused as-is
 * inside several different stacks (Staff Deliveries, Admin's "GR Tracker
 * Classic"), none of which pass params today except the Staff Dashboard. */
interface StaffGRPanelParams {
  statusFilter?: string;
  title?: string;
}

export const StaffGRPanelScreen = () => {
  const theme = useAppTheme();
  const { colors, radii, shadows } = theme;
  const { navigate, goBack, goToNotifications } = useAppNav();
  const route = useRoute();
  const { statusFilter: statusFilterParam, title } = (route.params as StaffGRPanelParams | undefined) ?? {};

  const styles = createStyles(theme);

  const [entries, setEntries] = useState<GREntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [statusPickerFor, setStatusPickerFor] = useState<GREntry | null>(null);
  const [areaFilter, setAreaFilter] = useState<string | null>(null);
  const [areaSheetOpen, setAreaSheetOpen] = useState(false);
  const [consignorFilter, setConsignorFilter] = useState<string | null>(null);
  const [consignorOptions, setConsignorOptions] = useState<string[]>([]);
  const [consignorSheetOpen, setConsignorSheetOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string | null>(statusFilterParam ?? null);
  const [statusSheetOpen, setStatusSheetOpen] = useState(false);

  const role = useUserStore((state) => state.user?.role);
  const userArea = useUserStore((state) => state.user?.area ?? null);
  const canDeleteGR = roleCanDeleteGR(role);

  const isAdmin = role === 'admin' || role === 'business_owner' || role === 'super_admin';
  const effectiveArea = isAdmin ? areaFilter : userArea;

  // The GR whose "⋮" per-card menu (View GR / Delete GR) is open, if any.
  const [menuTarget, setMenuTarget] = useState<GREntry | null>(null);
  // The GR pending delete confirmation, if any.
  const [deleteTarget, setDeleteTarget] = useState<GREntry | null>(null);
  const [deleting, setDeleting] = useState(false);
  // Brief inline banner for the delete outcome — `Alert.alert` is a no-op on
  // web (react-native-web has no native alert/toast implementation), so this
  // mirrors the pattern already used on the GR / Shipments list screen.
  const [actionMessage, setActionMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!actionMessage) return;
    const timer = setTimeout(() => setActionMessage(null), 4000);
    return () => clearTimeout(timer);
  }, [actionMessage]);

  const fetchEntries = useCallback(
    async (_isRefresh = false) => {
      try {
        const { items } = await orderRepository.list({
          page: 1,
          pageSize: 50,
          search: search || undefined,
          status: statusFilter || undefined,
          area: effectiveArea || undefined,
          consignor: consignorFilter || undefined,
        });
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
    [search, statusFilter, effectiveArea, consignorFilter]
  );

  useEffect(() => {
    const timer = setTimeout(() => fetchEntries(), 0);
    return () => clearTimeout(timer);
  }, [fetchEntries]);

  // Debounce filter changes
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchEntries();
    }, 400);
    return () => clearTimeout(timer);
  }, [search, statusFilter, effectiveArea, consignorFilter, fetchEntries]);

  // Live updates: another admin/staff (or an Admin reassigning) changing a GR
  // this list shows → one debounced refetch, no polling, no app reload.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsub = grRealtime.subscribe(() => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        fetchEntries();
      }, 350);
    });
    return () => {
      unsub();
      if (timer) clearTimeout(timer);
    };
  }, [fetchEntries]);

  // Load distinct consignor names scoped to the effective area
  useEffect(() => {
    let cancelled = false;
    orderRepository.getDistinctConsignors(effectiveArea || undefined).then((names) => {
      if (!cancelled) setConsignorOptions(names);
    });
    return () => { cancelled = true; };
  }, [effectiveArea]);

  // The Deliveries tab stays mounted across navigations, so `statusFilter`
  // initialized from `route.params` on first mount would go stale when the
  // Dashboard's "Pending Slip"/"Delivered Slip" cards re-open this screen with
  // a different filter. Re-sync the local filter (and clear any shop-owner
  // filter) whenever the incoming param actually changes, so the correct
  // status is always applied — even on a re-navigation that doesn't remount.
  useEffect(() => {
    const timer = setTimeout(() => {
      setStatusFilter(statusFilterParam ?? null);
      setConsignorFilter(null);
    }, 0);
    return () => clearTimeout(timer);
  }, [statusFilterParam]);

  const refreshUser = useAuthStore((state) => state.refreshUser);

  // The Deliveries tab stays mounted once visited (React Navigation keeps
  // backgrounded tabs alive), so without this, an Admin assigning/removing
  // GRs for this Staff member while they're on another tab would never be
  // reflected here until an unrelated filter change happened to re-run
  // `fetchEntries`. Refetch — and refresh the profile `refreshUser` reads
  // `area` from, since GR routing can depend on it — every time this screen
  // regains focus. `didMount` skips the first 'focus' (fired on initial
  // mount too, which the mount effect above already covers).
  const didMount = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!didMount.current) {
        didMount.current = true;
        return;
      }
      void refreshUser();
      fetchEntries();
    }, [refreshUser, fetchEntries])
  );

  // Also refresh on app foreground — covers an Admin assignment made while
  // this device's app was backgrounded, not just navigated away from.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        void refreshUser();
        fetchEntries();
      }
    });
    return () => subscription.remove();
  }, [refreshUser, fetchEntries]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchEntries(true);
  };

  const confirmDeleteGR = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      await orderRepository.delete(deleteTarget.id);
      setEntries((prev) => prev.filter((entry) => entry.id !== deleteTarget.id));
      setActionMessage({ kind: 'success', text: `GR ${deleteTarget.orderNumber} deleted successfully.` });
      setDeleteTarget(null);
    } catch (error: any) {
      console.warn('[GR Delete] Failed:', error?.message ?? error);
      setActionMessage({ kind: 'error', text: 'Unable to delete GR. Please try again.' });
      // Deliberately keep the GR visible and the dialog open on failure — it
      // was not actually deleted, and the Admin can retry from here.
    } finally {
      setDeleting(false);
    }
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
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
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
      <Header
        title={title ?? 'GR Tracker'}
        showBack={Boolean(statusFilterParam || title)}
        onBack={goBack}
        rightAction={{ icon: 'notifications-outline', onPress: goToNotifications }}
      />

      <View style={styles.toolbar}>
        {actionMessage && (
          <View
            style={[
              styles.actionBanner,
              {
                backgroundColor: actionMessage.kind === 'success' ? colors.successSoft : colors.errorSoft,
                borderRadius: radii.lg,
              },
            ]}
          >
            <Ionicons
              name={actionMessage.kind === 'success' ? 'checkmark-circle-outline' : 'alert-circle-outline'}
              size={18}
              color={actionMessage.kind === 'success' ? colors.success : colors.error}
            />
            <Text
              style={[
                styles.actionBannerText,
                { color: actionMessage.kind === 'success' ? colors.success : colors.error },
              ]}
            >
              {actionMessage.text}
            </Text>
          </View>
        )}
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

        {/* Location Filter */}
        <TouchableOpacity
          style={[styles.filterRow, { backgroundColor: colors.surface, borderColor: effectiveArea ? colors.primary : colors.border, borderRadius: radii.md }]}
          onPress={() => isAdmin ? setAreaSheetOpen(true) : undefined}
          activeOpacity={isAdmin ? 0.7 : 1}
          disabled={!isAdmin}
        >
          <Ionicons name="location-outline" size={16} color={effectiveArea ? colors.primary : colors.textMuted} />
          <Text style={[styles.filterRowText, { color: effectiveArea ? colors.primary : colors.textMuted }]} numberOfLines={1}>
            {effectiveArea || 'All Locations'}
          </Text>
          {effectiveArea && isAdmin ? (
            <TouchableOpacity onPress={() => setAreaFilter(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={16} color={colors.primary} />
            </TouchableOpacity>
          ) : isAdmin ? (
            <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
          ) : null}
        </TouchableOpacity>

        {/* Shop Owner Filter */}
        <TouchableOpacity
          style={[styles.filterRow, { backgroundColor: colors.surface, borderColor: consignorFilter ? colors.primary : colors.border, borderRadius: radii.md }]}
          onPress={() => setConsignorSheetOpen(true)}
          activeOpacity={0.7}
        >
          <Ionicons name="person-outline" size={16} color={consignorFilter ? colors.primary : colors.textMuted} />
          <Text style={[styles.filterRowText, { color: consignorFilter ? colors.primary : colors.textMuted }]} numberOfLines={1}>
            {consignorFilter || 'All Shop Owners'}
          </Text>
          {consignorFilter ? (
            <TouchableOpacity onPress={() => setConsignorFilter(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={16} color={colors.primary} />
            </TouchableOpacity>
          ) : (
            <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
          )}
        </TouchableOpacity>

        {/* Status Filter */}
        <TouchableOpacity
          style={[styles.filterRow, { backgroundColor: colors.surface, borderColor: statusFilter ? colors.primary : colors.border, borderRadius: radii.md }]}
          onPress={() => setStatusSheetOpen(true)}
          activeOpacity={0.7}
        >
          <Ionicons name="flag-outline" size={16} color={statusFilter ? colors.primary : colors.textMuted} />
          <Text style={[styles.filterRowText, { color: statusFilter ? colors.primary : colors.textMuted }]} numberOfLines={1}>
            {statusFilter ? STATUS_LABELS[statusFilter] ?? statusFilter : 'All Statuses'}
          </Text>
          {statusFilter ? (
            <TouchableOpacity onPress={() => setStatusFilter(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={16} color={colors.primary} />
            </TouchableOpacity>
          ) : (
            <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
          )}
        </TouchableOpacity>
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
            <EmptyState
              icon="document-text-outline"
              title={statusFilter ? `No ${STATUS_LABELS[statusFilter] ?? statusFilter} slips` : 'No GR entries'}
              subtitle={search || statusFilter || effectiveArea || consignorFilter ? 'No results match your filters.' : 'Entries assigned to your company will appear here.'}
            />
          ) : (
            entries.map((entry) => (
              <TouchableOpacity
                key={entry.id}
                style={[styles.row, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}
                onPress={() => navigate('GRDetails', { orderId: entry.id })}
                activeOpacity={0.85}
              >
                <View style={styles.rowTop}>
                  <Text style={styles.grNo}>{entry.orderNumber}</Text>
                  <View style={styles.rowTopRight}>
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
                    {canDeleteGR && (
                      <TouchableOpacity
                        onPress={() => setMenuTarget(entry)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        style={styles.menuButton}
                        accessibilityLabel={`More actions for GR ${entry.orderNumber}`}
                      >
                        <Ionicons name="ellipsis-vertical" size={16} color={colors.textMuted} />
                      </TouchableOpacity>
                    )}
                  </View>
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

      {/* Location Filter Bottom Sheet */}
      <Modal visible={areaSheetOpen} transparent animationType="slide" onRequestClose={() => setAreaSheetOpen(false)}>
        <Pressable style={[styles.modalOverlay]} onPress={() => setAreaSheetOpen(false)}>
          <View style={[styles.modalSheet, { backgroundColor: colors.surface, borderRadius: radii.xl }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Filter by Location</Text>
              <TouchableOpacity onPress={() => setAreaSheetOpen(false)} hitSlop={8}>
                <Ionicons name="close" size={22} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 420 }}>
              <TouchableOpacity
                style={[styles.optionRow, { borderBottomColor: colors.border }]}
                onPress={() => { setAreaFilter(null); setAreaSheetOpen(false); }}
              >
                <Text style={styles.optionName}>All Locations</Text>
                {!areaFilter && <Ionicons name="checkmark" size={18} color={colors.primary} />}
              </TouchableOpacity>
              {AREAS.map((area) => (
                <TouchableOpacity
                  key={area}
                  style={[styles.optionRow, { borderBottomColor: colors.border }]}
                  onPress={() => { setAreaFilter(area); setAreaSheetOpen(false); }}
                >
                  <Text style={styles.optionName}>{area}</Text>
                  {areaFilter === area && <Ionicons name="checkmark" size={18} color={colors.primary} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

      {/* Shop Owner Filter Bottom Sheet */}
      <Modal visible={consignorSheetOpen} transparent animationType="slide" onRequestClose={() => setConsignorSheetOpen(false)}>
        <Pressable style={[styles.modalOverlay]} onPress={() => setConsignorSheetOpen(false)}>
          <View style={[styles.modalSheet, { backgroundColor: colors.surface, borderRadius: radii.xl }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Filter by Shop Owner</Text>
              <TouchableOpacity onPress={() => setConsignorSheetOpen(false)} hitSlop={8}>
                <Ionicons name="close" size={22} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 420 }}>
              <TouchableOpacity
                style={[styles.optionRow, { borderBottomColor: colors.border }]}
                onPress={() => { setConsignorFilter(null); setConsignorSheetOpen(false); }}
              >
                <Text style={styles.optionName}>All Shop Owners</Text>
                {!consignorFilter && <Ionicons name="checkmark" size={18} color={colors.primary} />}
              </TouchableOpacity>
              {consignorOptions.map((name) => (
                <TouchableOpacity
                  key={name}
                  style={[styles.optionRow, { borderBottomColor: colors.border }]}
                  onPress={() => { setConsignorFilter(name); setConsignorSheetOpen(false); }}
                >
                  <Text style={styles.optionName}>{name}</Text>
                  {consignorFilter === name && <Ionicons name="checkmark" size={18} color={colors.primary} />}
                </TouchableOpacity>
              ))}
              {consignorOptions.length === 0 && (
                <Text style={[styles.optionName, { textAlign: 'center', paddingVertical: 20, color: colors.textMuted }]}>No shop owners found.</Text>
              )}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

      {/* Status Filter Bottom Sheet */}
      <Modal visible={statusSheetOpen} transparent animationType="slide" onRequestClose={() => setStatusSheetOpen(false)}>
        <Pressable style={[styles.modalOverlay]} onPress={() => setStatusSheetOpen(false)}>
          <View style={[styles.modalSheet, { backgroundColor: colors.surface, borderRadius: radii.xl }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Filter by Status</Text>
              <TouchableOpacity onPress={() => setStatusSheetOpen(false)} hitSlop={8}>
                <Ionicons name="close" size={22} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 420 }}>
              <TouchableOpacity
                style={[styles.optionRow, { borderBottomColor: colors.border }]}
                onPress={() => { setStatusFilter(null); setStatusSheetOpen(false); }}
              >
                <Text style={styles.optionName}>All Statuses</Text>
                {!statusFilter && <Ionicons name="checkmark" size={18} color={colors.primary} />}
              </TouchableOpacity>
              {ALL_STATUSES.map((status) => (
                <TouchableOpacity
                  key={status}
                  style={[styles.optionRow, { borderBottomColor: colors.border }]}
                  onPress={() => { setStatusFilter(status); setStatusSheetOpen(false); }}
                >
                  <Text style={styles.optionName}>{STATUS_LABELS[status]}</Text>
                  {statusFilter === status && <Ionicons name="checkmark" size={18} color={colors.primary} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

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
              {/* Current status — context only, never an action. */}
              <View style={[styles.optionRow, { borderBottomColor: colors.border }]}>
                <Text style={[styles.optionName, { color: colors.textMuted }]}>
                  Current: {STATUS_LABELS[statusPickerFor?.status ?? ''] || statusPickerFor?.status}
                </Text>
                <Ionicons name="checkmark" size={18} color={colors.primary} />
              </View>
              {(() => {
                // Only the transitions THIS role may perform from the GR's
                // current status (backend enforces the same rule). For Staff
                // that's Pending → Delivered and nothing else; a non-pending
                // GR is effectively read-only.
                const targets = allowedGrStatusTargets(role, statusPickerFor?.status ?? '')
                  .filter((s) => s !== statusPickerFor?.status);
                if (targets.length === 0) {
                  return (
                    <Text style={[styles.optionName, { color: colors.textMuted, padding: 16 }]}>
                      No status changes available for this GR.
                    </Text>
                  );
                }
                return targets.map((status) => (
                  <TouchableOpacity
                    key={status}
                    style={[styles.optionRow, { borderBottomColor: colors.border }]}
                    onPress={() => statusPickerFor && updateStatus(statusPickerFor.id, status)}
                    disabled={!!updatingId}
                  >
                    <Text style={styles.optionName}>{STATUS_LABELS[status] || status}</Text>
                    <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                ));
              })()}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Per-card "⋮" action menu (View GR / Delete GR) — only rendered for
       * roles `canDeleteGR` allows (the "⋮" button itself is hidden for
       * everyone else, so `menuTarget` can never be set by an unauthorized
       * user). Uses a `Modal`, not `Alert.alert`, which is a no-op on web. */}
      <Modal visible={!!menuTarget} transparent animationType="fade" onRequestClose={() => setMenuTarget(null)}>
        <Pressable style={[styles.menuBackdrop, { backgroundColor: colors.overlay }]} onPress={() => setMenuTarget(null)}>
          <View style={[styles.menuCard, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.lg }]}>
            <Text style={styles.menuTitle}>GR {menuTarget?.orderNumber}</Text>
            <TouchableOpacity
              style={styles.menuRow}
              onPress={() => {
                if (menuTarget) navigate('GRDetails', { orderId: menuTarget.id });
                setMenuTarget(null);
              }}
            >
              <Ionicons name="eye-outline" size={18} color={colors.textPrimary} />
              <Text style={[styles.menuRowText, { color: colors.textPrimary }]}>View GR</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.menuRow}
              onPress={() => {
                setDeleteTarget(menuTarget);
                setMenuTarget(null);
              }}
            >
              <Ionicons name="trash-outline" size={18} color={colors.error} />
              <Text style={[styles.menuRowText, { color: colors.error }]}>Delete GR</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      <ConfirmDialog
        visible={!!deleteTarget}
        title={`Delete GR ${deleteTarget?.orderNumber ?? ''}?`}
        message="Are you sure you want to delete this GR? This action cannot be undone."
        confirmLabel={deleting ? 'Deleting…' : 'Delete'}
        cancelLabel="Cancel"
        destructive
        confirmDisabled={deleting}
        onConfirm={confirmDeleteGR}
        onCancel={() => {
          if (!deleting) setDeleteTarget(null);
        }}
      />
    </SafeAreaView>
  );
};

const createStyles = (theme: Pick<AppTheme, 'colors' | 'spacing' | 'radii' | 'fonts' | 'shadows'>) =>
  StyleSheet.create({
    safe: { flex: 1 },
    toolbar: { paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.md, paddingBottom: theme.spacing.sm },
    searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 4 },
    searchInput: { flex: 1, paddingVertical: 10, fontSize: theme.fonts.size.sm },
    filterRow: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      paddingHorizontal: 14, paddingVertical: 10, marginTop: 8,
      borderWidth: 1,
    },
    filterRowText: { flex: 1, fontSize: theme.fonts.size.sm, fontWeight: '600' },
    centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    scrollContent: { padding: theme.spacing.lg, paddingTop: theme.spacing.sm, gap: theme.spacing.md, paddingBottom: 60 },
    row: { padding: 16, gap: 6 },
    rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    rowTopRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    menuButton: { padding: 2 },
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
    actionBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      padding: 12,
      marginBottom: theme.spacing.sm,
    },
    actionBannerText: { flex: 1, fontSize: theme.fonts.size.sm, fontWeight: '600' },
    menuBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
    menuCard: { width: '100%', maxWidth: 320, paddingVertical: 8 },
    menuTitle: {
      fontSize: theme.fonts.size.xs,
      fontWeight: '700',
      color: theme.colors.textMuted,
      paddingHorizontal: 16,
      paddingTop: 10,
      paddingBottom: 4,
    },
    menuRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
    menuRowText: { fontSize: theme.fonts.size.md, fontWeight: '600' },
  });

export default StaffGRPanelScreen;
