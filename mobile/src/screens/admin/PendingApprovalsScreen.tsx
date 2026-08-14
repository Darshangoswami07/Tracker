import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppTheme } from '../../theme/useAppTheme';
import { useAuthStore } from '../../store/authStore';
import { useUserStore } from '../../store/userStore';
import { api } from '../../api/client';
import { ENDPOINTS } from '../../api/endpoints';
import { Header } from '../../components/Header';
import { ShimmerCard } from '../../components/ShimmerCard';
import { EmptyState } from '../../components/EmptyState';
import { StatusBadge } from '../../components/StatusBadge';
import { FilterChips } from '../../components/FilterChips';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { useAppNav } from '../../hooks/useAppNav';
import type { AppTheme } from '../../theme/types';

interface PendingRequest {
  id: string;
  firstName: string;
  lastName: string;
  companyName: string;
  email: string;
  phone: string;
  requestedRole: string;
  status: string;
  createdAt: string;
}

/** Chip value -> API `role` query param ('all' means "no filter", Super Admin only). */
const ROLE_FILTERS_ADMIN = ['Staff', 'Driver'] as const;
const ROLE_FILTERS_SUPER_ADMIN = ['All', 'Staff', 'Driver'] as const;
const FILTER_TO_ROLE: Record<string, string | undefined> = {
  All: undefined,
  Staff: 'employee',
  Driver: 'driver',
};
const ROLE_LABELS: Record<string, string> = {
  employee: 'Staff',
  driver: 'Driver',
};

const formatTime = (iso: string): string => {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

type ConfirmAction = { type: 'approve' | 'reject'; request: PendingRequest; reason?: string };

export const PendingApprovalsScreen = () => {
  const { colors, spacing, radii, fonts, shadows } = useAppTheme();
  const { goBack } = useAppNav();
  const accessToken = useAuthStore((state) => state.accessToken);
  const role = useUserStore((state) => state.user?.role);
  const isSuperAdmin = role === 'super_admin';

  const styles = createStyles({ colors, spacing, radii, fonts, shadows });

  const roleFilters = isSuperAdmin ? ROLE_FILTERS_SUPER_ADMIN : ROLE_FILTERS_ADMIN;
  const [roleTab, setRoleTab] = useState<string>(roleFilters[0]);
  const [requests, setRequests] = useState<PendingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [search, setSearch] = useState('');

  /** In-flight approve/reject request id, so its buttons can be disabled to prevent duplicate submission. */
  const [processingId, setProcessingId] = useState<string | null>(null);
  /** The card currently showing its inline rejection-reason input. */
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);

  const fetchRequests = useCallback(
    async (pageNum = 1, isRefresh = false) => {
      if (!accessToken) return;
      try {
        const res = await api.get(ENDPOINTS.admin.pendingRequests, {
          headers: { Authorization: `Bearer ${accessToken}` },
          params: {
            page: pageNum,
            pageSize: 20,
            search: search || undefined,
            role: FILTER_TO_ROLE[roleTab],
          },
        });
        const newRequests = res.data.data.items || [];
        if (isRefresh || pageNum === 1) {
          setRequests(newRequests);
        } else {
          setRequests((prev) => [...prev, ...newRequests]);
        }
        setHasMore(newRequests.length === 20);
        setPage(pageNum);
      } catch (error) {
        console.error('Failed to fetch pending requests:', error);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [accessToken, search, roleTab]
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchRequests(1, true);
  }, [fetchRequests]);

  const loadMore = useCallback(() => {
    if (!loading && hasMore) {
      fetchRequests(page + 1);
    }
  }, [loading, hasMore, page, fetchRequests]);

  useEffect(() => {
    fetchRequests(1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchRequests(1, true);
    }, 500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, roleTab]);

  const startReject = (request: PendingRequest) => {
    setRejectingId(request.id);
    setRejectReason('');
  };

  const cancelReject = () => {
    setRejectingId(null);
    setRejectReason('');
  };

  const confirmRejectDraft = (request: PendingRequest) => {
    if (!rejectReason.trim()) {
      Alert.alert('Reason required', 'Please enter a reason for rejecting this registration.');
      return;
    }
    setConfirmAction({ type: 'reject', request, reason: rejectReason.trim() });
  };

  const runAction = async () => {
    if (!confirmAction) return;
    const { type, request, reason } = confirmAction;
    setConfirmAction(null);
    setProcessingId(request.id);
    try {
      if (type === 'approve') {
        await api.post(
          ENDPOINTS.admin.approve(request.id),
          {},
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
      } else {
        await api.post(
          ENDPOINTS.admin.reject(request.id),
          { reason },
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
      }
      setRejectingId(null);
      setRejectReason('');
      // Remove the processed request from the visible pending list.
      setRequests((prev) => prev.filter((r) => r.id !== request.id));
    } catch (error) {
      console.error(`Failed to ${type} request:`, error);
      const message =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (error as any)?.response?.data?.error?.message ??
        `Could not ${type} this registration. Please try again.`;
      Alert.alert('Action Failed', message);
    } finally {
      setProcessingId(null);
    }
  };

  const emptyMessage = isSuperAdmin
    ? 'No pending registration requests'
    : `No pending ${roleTab} requests`;

  // Pending Approvals is Super Admin-only; the backing endpoints are also
  // locked server-side for a plain Admin.
  if (!isSuperAdmin) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <Header title="Pending Approvals" leftAction={{ icon: 'chevron-back', onPress: goBack }} />
        </View>
        <EmptyState
          icon="lock-closed-outline"
          title="Not available"
          subtitle="Pending Approvals is only available to Super Admin."
        />
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <Header title="Pending Approvals" leftAction={{ icon: 'chevron-back', onPress: goBack }} />
        </View>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.filters}>
            <ShimmerCard style={styles.filterShimmer} height={36} />
          </View>
          {[1, 2, 3, 4].map((i) => (
            <ShimmerCard key={i} style={styles.cardShimmer} height={150} />
          ))}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Header title="Pending Approvals" leftAction={{ icon: 'chevron-back', onPress: goBack }} />
      </View>

      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#635BFF']}
            progressBackgroundColor={colors.surface}
          />
        }
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        onScroll={({ nativeEvent }) => {
          const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
          if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 200 && !loading && hasMore) {
            loadMore();
          }
        }}
        scrollEventThrottle={200}
      >
        <View style={styles.searchBar}>
          <TextInput
            placeholder="Search by name, email, phone…"
            value={search}
            onChangeText={setSearch}
            style={[styles.searchInput, { color: colors.textPrimary, backgroundColor: colors.surface }]}
            placeholderTextColor={colors.textMuted}
          />
        </View>

        <View style={styles.filters}>
          <FilterChips filters={[...roleFilters]} activeFilter={roleTab} onFilterChange={setRoleTab} />
        </View>

        {requests.length === 0 ? (
          <EmptyState
            icon="checkmark-done-circle-outline"
            title="All caught up"
            subtitle={emptyMessage}
          />
        ) : (
          <View style={styles.list}>
            {requests.map((request) => {
              const isProcessing = processingId === request.id;
              const isRejecting = rejectingId === request.id;
              return (
                <View key={request.id} style={[styles.card, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}>
                  <View style={styles.cardHeader}>
                    <Text style={[styles.name, { color: colors.textPrimary }]}>
                      {request.firstName} {request.lastName}
                    </Text>
                    <StatusBadge status={request.status} size="sm" />
                  </View>

                  <View style={styles.metaRow}>
                    <View style={[styles.roleBadge, { backgroundColor: `${colors.primary}15` }]}>
                      <Text style={[styles.roleBadgeText, { color: colors.primary }]}>
                        {ROLE_LABELS[request.requestedRole] ?? request.requestedRole}
                      </Text>
                    </View>
                  </View>

                  {!!request.companyName && (
                    <Text style={[styles.detail, { color: colors.textSecondary }]}>{request.companyName}</Text>
                  )}
                  <Text style={[styles.detail, { color: colors.textSecondary }]}>{request.email}</Text>
                  <Text style={[styles.detail, { color: colors.textSecondary }]}>{request.phone}</Text>
                  <Text style={[styles.detail, { color: colors.textMuted }]}>
                    Submitted {formatTime(request.createdAt)}
                  </Text>

                  {isRejecting ? (
                    <View style={styles.rejectBox}>
                      <TextInput
                        placeholder="Reason for rejection"
                        value={rejectReason}
                        onChangeText={setRejectReason}
                        style={[styles.reasonInput, { color: colors.textPrimary, borderColor: colors.borderStrong }]}
                        placeholderTextColor={colors.textMuted}
                        multiline
                      />
                      <View style={styles.actionsRow}>
                        <TouchableOpacity
                          style={[styles.actionButton, styles.cancelButton, { borderColor: colors.borderStrong }]}
                          onPress={cancelReject}
                          disabled={isProcessing}
                        >
                          <Text style={[styles.actionButtonText, { color: colors.textPrimary }]}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.actionButton, { backgroundColor: colors.error }]}
                          onPress={() => confirmRejectDraft(request)}
                          disabled={isProcessing}
                        >
                          <Text style={[styles.actionButtonText, { color: colors.onPrimary }]}>Confirm Reject</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <View style={styles.actionsRow}>
                      <TouchableOpacity
                        style={[styles.actionButton, styles.cancelButton, { borderColor: colors.error }]}
                        onPress={() => startReject(request)}
                        disabled={isProcessing}
                      >
                        <Text style={[styles.actionButtonText, { color: colors.error }]}>Reject</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.actionButton, { backgroundColor: colors.primary, opacity: isProcessing ? 0.6 : 1 }]}
                        onPress={() => setConfirmAction({ type: 'approve', request })}
                        disabled={isProcessing}
                      >
                        <Text style={[styles.actionButtonText, { color: colors.onPrimary }]}>
                          {isProcessing ? 'Working…' : 'Approve'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })}
            {hasMore && <View style={styles.loadMore}><Text style={styles.loadMoreText}>Loading more…</Text></View>}
          </View>
        )}
      </ScrollView>

      <ConfirmDialog
        visible={confirmAction !== null}
        title={confirmAction?.type === 'approve' ? 'Approve Registration' : 'Reject Registration'}
        message={
          confirmAction
            ? confirmAction.type === 'approve'
              ? `Approve ${confirmAction.request.firstName} ${confirmAction.request.lastName}'s registration as ${ROLE_LABELS[confirmAction.request.requestedRole] ?? confirmAction.request.requestedRole}? They'll receive an OTP by email to activate their account.`
              : `Reject ${confirmAction.request.firstName} ${confirmAction.request.lastName}'s registration? This will be recorded with your reason.`
            : ''
        }
        confirmLabel={confirmAction?.type === 'approve' ? 'Approve' : 'Reject'}
        destructive={confirmAction?.type === 'reject'}
        onConfirm={runAction}
        onCancel={() => setConfirmAction(null)}
      />
    </SafeAreaView>
  );
};

const createStyles = (theme: Pick<AppTheme, 'colors' | 'spacing' | 'radii' | 'fonts' | 'shadows'>) =>
  StyleSheet.create({
    safe: { flex: 1 },
    header: { paddingTop: 8 },
    scrollContent: { paddingBottom: 40, paddingHorizontal: theme.spacing.lg },
    searchBar: { marginBottom: theme.spacing.md },
    searchInput: { borderRadius: theme.radii.lg, paddingHorizontal: 16, paddingVertical: 12, fontSize: theme.fonts.size.md },
    filters: { marginBottom: theme.spacing.lg },
    filterShimmer: { width: 200, borderRadius: theme.radii.pill },
    cardShimmer: { marginBottom: theme.spacing.md, borderRadius: theme.radii.lg },
    list: { gap: theme.spacing.md },
    card: { padding: 16, gap: 6 },
    cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    name: { fontSize: theme.fonts.size.md, fontWeight: '700' },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    roleBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: theme.radii.pill },
    roleBadgeText: { fontSize: theme.fonts.size.xs, fontWeight: '800' },
    detail: { fontSize: theme.fonts.size.sm },
    actionsRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
    actionButton: { flex: 1, paddingVertical: 10, borderRadius: theme.radii.md, alignItems: 'center', justifyContent: 'center' },
    cancelButton: { borderWidth: 1, backgroundColor: 'transparent' },
    actionButtonText: { fontWeight: '700', fontSize: theme.fonts.size.sm },
    rejectBox: { marginTop: 8, gap: 8 },
    reasonInput: { borderWidth: 1, borderRadius: theme.radii.md, padding: 10, minHeight: 60, fontSize: theme.fonts.size.sm, textAlignVertical: 'top' },
    loadMore: { paddingVertical: theme.spacing.lg, alignItems: 'center' },
    loadMoreText: { color: '#635BFF', fontWeight: '600' },
  });

export default PendingApprovalsScreen;
