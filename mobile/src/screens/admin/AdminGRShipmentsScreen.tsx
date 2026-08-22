import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/useAppTheme';
import { orderRepository } from '../../database/repositories/orderRepository';
import { Header } from '../../components/Header';
import { ShimmerCard } from '../../components/ShimmerCard';
import { EmptyState } from '../../components/EmptyState';
import { StatusBadge } from '../../components/StatusBadge';
import { FilterChips } from '../../components/FilterChips';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { useAppNav } from '../../hooks/useAppNav';
import { useUserStore } from '../../store/userStore';
import { canDeleteGR as roleCanDeleteGR, canImportExcel as roleCanImportExcel } from '../../constants/roles';
import type { AppTheme } from '../../theme/types';

/** GR/Shipment row shape returned by `GET /admin/orders` — matches
 * `admin/src/types/gr.ts` `GRListItem` on the web reference exactly. */
interface GRListItem {
  id: string;
  orderNumber: string;
  consignorName: string | null;
  consigneeName: string | null;
  pickupAddress: string;
  deliveryAddress: string;
  driverId: string | null;
  assignedStaffId: string | null;
  status: string;
  createdAt: string;
  hasSlip: boolean;
  /** 'manual' | 'slip' | 'excel' — drives the subtle origin indicator below. */
  source: string;
}

const PAGE_SIZE = 20;

const STATUS_FILTERS = ['All', 'Pending', 'Assigned', 'Pickup', 'In Transit', 'Delivered', 'Failed', 'Returned', 'Cancelled'];
const FILTER_TO_STATUS: Record<string, string | undefined> = {
  All: undefined,
  Pending: 'pending',
  Assigned: 'assigned',
  Pickup: 'pickup',
  'In Transit': 'in_transit',
  Delivered: 'delivered',
  Failed: 'failed',
  Returned: 'returned',
  Cancelled: 'cancelled',
};

const formatDate = (iso: string): string => {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

type LoadStatus = 'loading' | 'success' | 'error';

/**
 * Mobile equivalent of the web Admin "GR / Shipments" page
 * (`admin/src/app/dashboard/orders/page.tsx`). In the local-first
 * architecture the GR list is read from the on-device SQLite repository
 * (`orderRepository.list`) instead of `GET /admin/orders`, so it works fully
 * offline. Search, status filter, and pagination behave the same as before;
 * tapping a card opens `AdminGRDetailsScreen` for the full record.
 *
 * The screen uses ONE load path (`fetchGRs`) guarded by an in-flight ref so
 * the mount effect, focus listener, and the search/filter debounce can never
 * run concurrently and leave `loading` stuck true. The skeleton is only shown
 * while the first load is in flight and there is no data yet; every later
 * reload (pull-to-refresh, search/filter change, return-from-detail) keeps the
 * existing list visible and swaps in fresh rows, so the screen never hangs on
 * a spinner.
 */
export const AdminGRShipmentsScreen = () => {
  const { colors, spacing, radii, fonts, shadows } = useAppTheme();
  const { goBack, navigate, navigation } = useAppNav();

  const styles = createStyles({ colors, spacing, radii, fonts, shadows });

  const [items, setItems] = useState<GRListItem[]>([]);
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [search, setSearch] = useState('');
  const [statusTab, setStatusTab] = useState('All');

  const role = useUserStore((state) => state.user?.role);
  const canDeleteGR = roleCanDeleteGR(role);
  const canImportExcel = roleCanImportExcel(role);

  // "+" header button: opens a small action sheet (Create GR / Import from
  // Excel) for Admin, or goes straight to Create GR for roles that can't
  // import (matches the button's previous single-purpose behavior for them).
  const [addMenuOpen, setAddMenuOpen] = useState(false);

  // The GR whose "⋮" per-card menu (View GR / Delete GR) is open, if any.
  const [menuTarget, setMenuTarget] = useState<GRListItem | null>(null);
  // The GR pending delete confirmation, if any — set once the Admin taps
  // "Delete GR" in the menu above, cleared on Cancel or after the request
  // settles (success or failure).
  const [deleteTarget, setDeleteTarget] = useState<GRListItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  // Brief inline banner for the delete outcome — mirrors `errorText` banners
  // used elsewhere in the app rather than `Alert.alert`, which is a no-op on
  // web (react-native-web has no native alert/toast implementation).
  const [actionMessage, setActionMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!actionMessage) return;
    const timer = setTimeout(() => setActionMessage(null), 4000);
    return () => clearTimeout(timer);
  }, [actionMessage]);

  const confirmDeleteGR = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      await orderRepository.delete(deleteTarget.id);
      setItems((prev) => prev.filter((gr) => gr.id !== deleteTarget.id));
      setActionMessage({ kind: 'success', text: `GR ${deleteTarget.orderNumber} deleted successfully.` });
      setDeleteTarget(null);
    } catch (err: any) {
      console.warn('[GR Delete] Failed:', err?.message ?? err);
      setActionMessage({ kind: 'error', text: 'Unable to delete GR. Please try again.' });
      // Deliberately do NOT remove the GR from `items` or close the dialog
      // here — the Admin should see the failure and can retry, and the list
      // must keep showing the GR since it was not actually deleted.
    } finally {
      setDeleting(false);
    }
  };

  // Guards against overlapping fetches from mount/focus/debounce. When a
  // request is already in flight, a new trigger is ignored — the in-flight
  // one will render the latest data anyway because it reads the current
  // `search`/`statusTab` values.
  const inFlightRef = useRef(false);

  const fetchGRs = useCallback(
    async (pageNum: number, mode: 'initial' | 'refresh' | 'more' | 'reload' = 'initial') => {
      if (inFlightRef.current && mode !== 'more') return;
      inFlightRef.current = true;
      if (mode === 'initial') setStatus('loading');
      if (mode === 'refresh') setRefreshing(true);
      if (mode === 'more') setLoadingMore(true);
      try {
        const result = await orderRepository.list({
          page: pageNum,
          pageSize: PAGE_SIZE,
          status: FILTER_TO_STATUS[statusTab],
          search: search || undefined,
        });
        const newItems: GRListItem[] = result.items;
        setItems((prev) => (mode === 'more' ? [...prev, ...newItems] : newItems));
        setHasMore(newItems.length === PAGE_SIZE);
        setPage(pageNum);
        setError(null);
        setStatus('success');
      } catch (err: any) {
        setError(err?.message ?? 'Could not load GR entries. Please try again.');
        setStatus('error');
      } finally {
        inFlightRef.current = false;
        setRefreshing(false);
        setLoadingMore(false);
      }
    },
    [search, statusTab]
  );

  const didMount = useRef(false);

  // Initial load.
  useEffect(() => {
    fetchGRs(1, 'initial');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refetch when returning from Create GR / GR Details so mutations made
  // there (creation, status change, assignment, slip upload) are reflected in
  // the list without a manual pull-to-refresh. Skips the first (mount) focus
  // event since the effect above already fetches on mount.
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      if (!didMount.current) {
        didMount.current = true;
        return;
      }
      fetchGRs(1, 'refresh');
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation]);

  // Debounced reload on search / status filter changes. Keeps the existing
  // list visible instead of showing the skeleton again, so typing never
  // produces a stuck loading state.
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchGRs(1, 'reload');
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, statusTab]);

  const onRefresh = () => {
    fetchGRs(1, 'refresh');
  };

  const onAddPress = () => {
    if (canImportExcel) {
      setAddMenuOpen(true);
    } else {
      navigate('CreateGR');
    }
  };

  const loadMore = () => {
    if (!inFlightRef.current && !loadingMore && hasMore) {
      fetchGRs(page + 1, 'more');
    }
  };

  // Skeleton only while the very first load is in flight and nothing is shown.
  const showSkeleton = status === 'loading' && items.length === 0;

  if (showSkeleton) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <Header
          title="GR / Shipments"
          leftAction={{ icon: 'chevron-back', onPress: goBack }}
          rightAction={{ icon: 'add', onPress: onAddPress, accessibilityLabel: 'Create GR' }}
        />
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <ShimmerCard style={styles.searchShimmer} height={44} />
          <ShimmerCard style={styles.filterShimmer} height={36} />
          {[1, 2, 3, 4, 5].map((i) => (
            <ShimmerCard key={i} style={styles.cardShimmer} height={110} />
          ))}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <Header
        title="GR / Shipments"
        leftAction={{ icon: 'chevron-back', onPress: goBack }}
        rightAction={{ icon: 'add', onPress: onAddPress, accessibilityLabel: 'Create GR' }}
      />

      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#635BFF']} progressBackgroundColor={colors.surface} />
        }
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onScroll={({ nativeEvent }) => {
          const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
          if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 200) {
            loadMore();
          }
        }}
        scrollEventThrottle={200}
      >
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

        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={colors.textMuted} style={styles.searchIcon} />
          <TextInput
            placeholder="Search GR number, consignor, consignee…"
            value={search}
            onChangeText={setSearch}
            style={[styles.searchInput, { color: colors.textPrimary, backgroundColor: colors.surface }]}
            placeholderTextColor={colors.textMuted}
            returnKeyType="search"
          />
        </View>

        <View style={styles.filters}>
          <FilterChips filters={STATUS_FILTERS} activeFilter={statusTab} onFilterChange={setStatusTab} />
        </View>

        {status === 'error' && items.length === 0 && (
          <EmptyState
            icon="cloud-offline-outline"
            title="Could not load GRs"
            subtitle={error ?? 'Something went wrong while reading your shipments.'}
            actionLabel="Retry"
            onActionPress={() => fetchGRs(1, 'initial')}
            iconColor={colors.error}
          />
        )}

        {status === 'success' && items.length === 0 && (
          <EmptyState
            icon="reader-outline"
            title="No GR entries"
            subtitle={
              search || statusTab !== 'All'
                ? 'No GRs match your search or filter.'
                : 'Shipments will appear here once created.'
            }
            actionLabel="Create GR"
            onActionPress={() => navigate('CreateGR')}
          />
        )}

        {items.length > 0 && (
          <View style={styles.list}>
            {items.map((gr) => (
              <TouchableOpacity
                key={gr.id}
                style={[styles.card, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}
                onPress={() => navigate('GRDetails', { orderId: gr.id })}
                activeOpacity={0.85}
              >
                <View style={styles.cardHeader}>
                  <Text style={[styles.grNo, { color: colors.textPrimary }]}>{gr.orderNumber}</Text>
                  <View style={styles.cardHeaderRight}>
                    <StatusBadge status={gr.status} size="sm" />
                    {canDeleteGR && (
                      <TouchableOpacity
                        onPress={() => setMenuTarget(gr)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        style={styles.menuButton}
                        accessibilityLabel={`More actions for GR ${gr.orderNumber}`}
                      >
                        <Ionicons name="ellipsis-vertical" size={16} color={colors.textMuted} />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
                <Text style={[styles.consignorLine, { color: colors.textSecondary }]}>
                  {gr.consignorName || '—'} <Text style={{ color: colors.textMuted }}>→</Text> {gr.consigneeName || '—'}
                </Text>
                <View style={styles.routeRow}>
                  <Ionicons name="location-outline" size={13} color={colors.textMuted} />
                  <Text style={[styles.routeLine, { color: colors.textMuted }]} numberOfLines={1}>
                    {gr.pickupAddress} → {gr.deliveryAddress}
                  </Text>
                </View>
                <View style={styles.cardFooter}>
                  <View style={styles.slipInfo}>
                    <Ionicons
                      name={gr.source === 'excel' ? 'grid-outline' : gr.hasSlip ? 'document-attach' : 'document-outline'}
                      size={14}
                      color={gr.source === 'excel' ? '#635BFF' : gr.hasSlip ? '#10B981' : colors.textMuted}
                    />
                    <Text
                      style={[
                        styles.slipText,
                        { color: gr.source === 'excel' ? '#635BFF' : gr.hasSlip ? '#10B981' : colors.textMuted },
                      ]}
                    >
                      {gr.source === 'excel' ? 'Excel imported' : gr.hasSlip ? 'Slip uploaded' : 'No slip'}
                    </Text>
                  </View>
                  <Text style={[styles.dateText, { color: colors.textMuted }]}>{formatDate(gr.createdAt)}</Text>
                </View>
              </TouchableOpacity>
            ))}
            {loadingMore && <ShimmerCard style={styles.cardShimmer} height={110} />}
          </View>
        )}
      </ScrollView>

      {/* Per-card "⋮" action menu (View GR / Delete GR) — only rendered for
       * roles `canDeleteGR` allows (the "⋮" button itself is hidden for
       * everyone else, so `menuTarget` can never be set by an unauthorized
       * user). Uses a `Modal`, not `Alert.alert`, so it actually renders on
       * web (see `ConfirmDialog`'s own doc comment for why). */}
      <Modal visible={!!menuTarget} transparent animationType="fade" onRequestClose={() => setMenuTarget(null)}>
        <Pressable style={[styles.menuBackdrop, { backgroundColor: colors.overlay }]} onPress={() => setMenuTarget(null)}>
          <View style={[styles.menuCard, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.lg }]}>
            <Text style={[styles.menuTitle, { color: colors.textMuted }]}>GR {menuTarget?.orderNumber}</Text>
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

      {/* "+" header action sheet — Create GR vs Import from Excel. Only
       * opened for `canImportExcel` roles (`onAddPress` above); everyone
       * else's "+" still goes straight to Create GR, unchanged. */}
      <Modal visible={addMenuOpen} transparent animationType="fade" onRequestClose={() => setAddMenuOpen(false)}>
        <Pressable style={[styles.menuBackdrop, { backgroundColor: colors.overlay }]} onPress={() => setAddMenuOpen(false)}>
          <View style={[styles.menuCard, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.lg }]}>
            <Text style={[styles.menuTitle, { color: colors.textMuted }]}>GR / Shipments</Text>
            <TouchableOpacity
              style={styles.menuRow}
              onPress={() => {
                setAddMenuOpen(false);
                navigate('CreateGR');
              }}
            >
              <Ionicons name="add-circle-outline" size={18} color={colors.textPrimary} />
              <Text style={[styles.menuRowText, { color: colors.textPrimary }]}>Create GR</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.menuRow}
              onPress={() => {
                setAddMenuOpen(false);
                navigate('ExcelImport');
              }}
            >
              <Ionicons name="cloud-upload-outline" size={18} color={colors.textPrimary} />
              <Text style={[styles.menuRowText, { color: colors.textPrimary }]}>Import from Excel</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      <ConfirmDialog
        visible={!!deleteTarget}
        title={`Delete GR ${deleteTarget?.orderNumber ?? ''}?`}
        message="This GR will be deleted. This action cannot be undone."
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
    scrollContent: { paddingBottom: 40, paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.md },
    searchBar: { position: 'relative', justifyContent: 'center', marginBottom: theme.spacing.md },
    searchIcon: { position: 'absolute', left: 14, zIndex: 1 },
    searchInput: { borderRadius: theme.radii.lg, paddingHorizontal: 40, paddingVertical: 12, fontSize: theme.fonts.size.md },
    searchShimmer: { marginBottom: theme.spacing.md, borderRadius: theme.radii.lg },
    filters: { marginBottom: theme.spacing.lg },
    filterShimmer: { width: 200, borderRadius: theme.radii.pill, marginBottom: theme.spacing.lg },
    list: { gap: theme.spacing.md },
    cardShimmer: { marginBottom: theme.spacing.md, borderRadius: theme.radii.lg },
    card: { padding: 16, gap: 6 },
    cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    cardHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    menuButton: { padding: 2 },
    grNo: { fontSize: theme.fonts.size.md, fontWeight: '800' },
    consignorLine: { fontSize: theme.fonts.size.sm, fontWeight: '600' },
    routeRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    routeLine: { fontSize: theme.fonts.size.xs, flex: 1 },
    cardFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 6,
      paddingTop: 8,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.border,
    },
    slipInfo: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    slipText: { fontSize: theme.fonts.size.xs, fontWeight: '700' },
    dateText: { fontSize: theme.fonts.size.xs, fontWeight: '600' },
    actionBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      padding: 12,
      marginBottom: theme.spacing.md,
    },
    actionBannerText: { flex: 1, fontSize: theme.fonts.size.sm, fontWeight: '600' },
    menuBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
    menuCard: { width: '100%', maxWidth: 320, paddingVertical: 8 },
    menuTitle: { fontSize: theme.fonts.size.xs, fontWeight: '700', paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4 },
    menuRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
    menuRowText: { fontSize: theme.fonts.size.md, fontWeight: '600' },
  });

export default AdminGRShipmentsScreen;