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
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/useAppTheme';
import { useAuthStore } from '../../store/authStore';
import { api } from '../../api/client';
import { ENDPOINTS } from '../../api/endpoints';
import { Header } from '../../components/Header';
import { ShimmerCard } from '../../components/ShimmerCard';
import { EmptyState } from '../../components/EmptyState';
import { StatusBadge } from '../../components/StatusBadge';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { useAppNav } from '../../hooks/useAppNav';
import type { AppTheme } from '../../theme/types';

/**
 * Staff Approvals — the self-service Staff portal's own approval queue.
 * Separate from `PendingApprovalsScreen` (the existing OTP/
 * registration-request queue, Super-Admin-only): this one is available to
 * any plain Admin, has no OTP step, and talks to `/admin/staff-approvals/*`.
 */

interface PendingStaff {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  status: string;
  createdAt: string;
  /** Operational area picked at signup — null for accounts registered
   * before the area field existed. */
  area: string | null;
}

const formatTime = (iso: string): string => {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

type ConfirmAction = { type: 'approve' | 'reject'; staff: PendingStaff; reason?: string };

export const StaffApprovalsScreen = () => {
  const { colors, spacing, radii, fonts, shadows } = useAppTheme();
  const { goBack } = useAppNav();
  const accessToken = useAuthStore((state) => state.accessToken);
  const styles = createStyles({ colors, spacing, radii, fonts, shadows });

  const [staff, setStaff] = useState<PendingStaff[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [pendingTotal, setPendingTotal] = useState<number | null>(null);
  const [loadError, setLoadError] = useState(false);

  const fetchStaff = useCallback(
    async (isRefresh = false) => {
      if (!accessToken) return;
      try {
        const res = await api.get(ENDPOINTS.admin.staffApprovals.list, {
          headers: { Authorization: `Bearer ${accessToken}` },
          params: { page: 1, pageSize: 50, status: 'pending', search: search || undefined },
        });
        setStaff(res.data.data.items || []);
        setPendingTotal(res.data.data.total ?? null);
        setLoadError(false);
      } catch (error) {
        console.error('Failed to fetch pending Staff:', error);
        setLoadError(true);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [accessToken, search]
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchStaff(true);
  }, [fetchStaff]);

  useEffect(() => {
    fetchStaff();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => fetchStaff(), 500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const startReject = (member: PendingStaff) => {
    setRejectingId(member.id);
    setRejectReason('');
  };

  const cancelReject = () => {
    setRejectingId(null);
    setRejectReason('');
  };

  const confirmRejectDraft = (member: PendingStaff) => {
    if (!rejectReason.trim()) {
      Alert.alert('Reason required', 'Please enter a reason for rejecting this Staff application.');
      return;
    }
    setConfirmAction({ type: 'reject', staff: member, reason: rejectReason.trim() });
  };

  const runAction = async () => {
    if (!confirmAction) return;
    const { type, staff: member, reason } = confirmAction;
    setConfirmAction(null);
    setProcessingId(member.id);
    try {
      if (type === 'approve') {
        await api.post(
          ENDPOINTS.admin.staffApprovals.approve(member.id),
          {},
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
      } else {
        await api.post(
          ENDPOINTS.admin.staffApprovals.reject(member.id),
          { reason },
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
      }
      setRejectingId(null);
      setRejectReason('');
      setStaff((prev) => prev.filter((s) => s.id !== member.id));
    } catch (error) {
      console.error(`Failed to ${type} Staff account:`, error);
      const message =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (error as any)?.response?.data?.error?.message ?? `Could not ${type} this Staff application. Please try again.`;
      Alert.alert('Action Failed', message);
    } finally {
      setProcessingId(null);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <Header title="Staff Approvals" leftAction={{ icon: 'chevron-back', onPress: goBack }} />
        </View>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Text style={[styles.loadingText, { color: colors.textMuted }]}>Loading staff requests…</Text>
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
        <Header title="Staff Approvals" leftAction={{ icon: 'chevron-back', onPress: goBack }} />
      </View>

      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#635BFF']} progressBackgroundColor={colors.surface} />
        }
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {pendingTotal !== null && !loadError && (
          <View style={[styles.countCard, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}>
            <Text style={[styles.countLabel, { color: colors.textSecondary }]}>Pending Staff</Text>
            <Text style={[styles.countValue, { color: colors.primary }]}>{pendingTotal}</Text>
          </View>
        )}

        <View style={styles.searchBar}>
          <TextInput
            placeholder="Search by name, email, phone…"
            value={search}
            onChangeText={setSearch}
            style={[styles.searchInput, { color: colors.textPrimary, backgroundColor: colors.surface }]}
            placeholderTextColor={colors.textMuted}
          />
        </View>

        {loadError ? (
          <EmptyState
            icon="alert-circle-outline"
            title="Unable to load Staff requests"
            subtitle="Try again"
            actionLabel="Retry"
            onActionPress={() => fetchStaff()}
          />
        ) : staff.length === 0 ? (
          <EmptyState icon="checkmark-done-circle-outline" title="All caught up" subtitle="No pending Staff approval requests" />
        ) : (
          <View style={styles.list}>
            {staff.map((member) => {
              const isProcessing = processingId === member.id;
              const isRejecting = rejectingId === member.id;
              return (
                <View key={member.id} style={[styles.card, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}>
                  <View style={styles.cardHeader}>
                    <Text style={[styles.name, { color: colors.textPrimary }]}>
                      {member.firstName} {member.lastName}
                    </Text>
                    <StatusBadge status={member.status} size="sm" />
                  </View>

                  <Text style={[styles.detail, { color: colors.textSecondary }]}>{member.email}</Text>
                  <Text style={[styles.detail, { color: colors.textSecondary }]}>{member.phone}</Text>
                  {member.area && (
                    <View style={styles.areaRow}>
                      <Ionicons name="location-outline" size={14} color={colors.primary} />
                      <Text style={[styles.areaText, { color: colors.primary }]}>{member.area}</Text>
                    </View>
                  )}
                  <Text style={[styles.detail, { color: colors.textMuted }]}>Registered {formatTime(member.createdAt)}</Text>

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
                          onPress={() => confirmRejectDraft(member)}
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
                        onPress={() => startReject(member)}
                        disabled={isProcessing}
                      >
                        <Text style={[styles.actionButtonText, { color: colors.error }]}>Reject</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.actionButton, { backgroundColor: colors.primary, opacity: isProcessing ? 0.6 : 1 }]}
                        onPress={() => setConfirmAction({ type: 'approve', staff: member })}
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
          </View>
        )}
      </ScrollView>

      <ConfirmDialog
        visible={confirmAction !== null}
        title={confirmAction?.type === 'approve' ? 'Approve Staff' : 'Reject Staff'}
        message={
          confirmAction
            ? confirmAction.type === 'approve'
              ? `Approve ${confirmAction.staff.firstName} ${confirmAction.staff.lastName} as Staff? They'll be able to sign in immediately — no verification code needed.`
              : `Reject ${confirmAction.staff.firstName} ${confirmAction.staff.lastName}'s Staff application? The account record is kept, not deleted.`
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
    loadingText: { textAlign: 'center', fontWeight: '600', marginBottom: theme.spacing.md },
    countCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 14,
      marginBottom: theme.spacing.lg,
    },
    countLabel: { fontSize: theme.fonts.size.md, fontWeight: '700' },
    countValue: { fontSize: theme.fonts.size.xl, fontWeight: '900' },
    searchBar: { marginBottom: theme.spacing.lg },
    searchInput: { borderRadius: theme.radii.lg, paddingHorizontal: 16, paddingVertical: 12, fontSize: theme.fonts.size.md },
    cardShimmer: { marginBottom: theme.spacing.md, borderRadius: theme.radii.lg },
    list: { gap: theme.spacing.md },
    card: { padding: 16, gap: 6 },
    cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    name: { fontSize: theme.fonts.size.md, fontWeight: '700' },
    detail: { fontSize: theme.fonts.size.sm },
    areaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    areaText: { fontSize: theme.fonts.size.sm, fontWeight: '700' },
    actionsRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
    actionButton: { flex: 1, paddingVertical: 10, borderRadius: theme.radii.md, alignItems: 'center', justifyContent: 'center' },
    cancelButton: { borderWidth: 1, backgroundColor: 'transparent' },
    actionButtonText: { fontWeight: '700', fontSize: theme.fonts.size.sm },
    rejectBox: { marginTop: 8, gap: 8 },
    reasonInput: { borderWidth: 1, borderRadius: theme.radii.md, padding: 10, minHeight: 60, fontSize: theme.fonts.size.sm, textAlignVertical: 'top' },
  });

export default StaffApprovalsScreen;
