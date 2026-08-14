import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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
 * Admin -> Staff management. Same generic `/admin/users` endpoint the
 * existing (Super Admin) UserManagementScreen uses, just pre-filtered to
 * role=employee ("Staff") and given its own screen/label, mirroring the web
 * admin app's dedicated "Staff Management" page.
 */

interface StaffMember {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  status: string;
  createdAt: string;
}

const formatTime = (iso: string): string => {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

type ConfirmAction = { type: 'remove' | 'reactivate'; staff: StaffMember };

export const StaffManagementScreen = () => {
  const { colors, spacing, radii, fonts, shadows } = useAppTheme();
  const { goBack } = useAppNav();
  const accessToken = useAuthStore((state) => state.accessToken);
  const styles = createStyles({ colors, spacing, radii, fonts, shadows });

  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);

  const fetchStaff = useCallback(
    async (isRefresh = false) => {
      if (!accessToken) return;
      try {
        const res = await api.get(ENDPOINTS.admin.users, {
          headers: { Authorization: `Bearer ${accessToken}` },
          params: { page: 1, pageSize: 50, role: 'employee', search: search || undefined },
        });
        setStaff(res.data.data.items || []);
      } catch (error) {
        console.error('Failed to fetch Staff:', error);
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

  const runAction = async () => {
    if (!confirmAction) return;
    const { type, staff: target } = confirmAction;
    setConfirmAction(null);
    setProcessingId(target.id);
    try {
      await api.patch(
        ENDPOINTS.admin.userStatus(target.id),
        { status: type === 'remove' ? 'suspended' : 'active' },
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      setStaff((prev) =>
        prev.map((s) => (s.id === target.id ? { ...s, status: type === 'remove' ? 'suspended' : 'active' } : s))
      );
    } catch (error) {
      console.error(`Failed to ${type} staff member:`, error);
    } finally {
      setProcessingId(null);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <Header title="Staff Management" leftAction={{ icon: 'chevron-back', onPress: goBack }} />
        </View>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {[1, 2, 3, 4].map((i) => (
            <ShimmerCard key={i} style={styles.cardShimmer} height={110} />
          ))}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Header title="Staff Management" leftAction={{ icon: 'chevron-back', onPress: goBack }} />
      </View>

      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#635BFF']} progressBackgroundColor={colors.surface} />
        }
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.searchBar}>
          <TextInput
            placeholder="Search Staff by name, email, phone…"
            value={search}
            onChangeText={setSearch}
            style={[styles.searchInput, { color: colors.textPrimary, backgroundColor: colors.surface }]}
            placeholderTextColor={colors.textMuted}
          />
        </View>

        {staff.length === 0 ? (
          <EmptyState icon="people-circle-outline" title="No Staff found" subtitle="Approved Staff accounts appear here." />
        ) : (
          <View style={styles.list}>
            {staff.map((member) => {
              const isProcessing = processingId === member.id;
              const isActive = member.status === 'active';
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
                  <Text style={[styles.detail, { color: colors.textMuted }]}>Joined {formatTime(member.createdAt)}</Text>

                  <View style={styles.actionsRow}>
                    {isActive ? (
                      <TouchableOpacity
                        style={[styles.actionButton, { backgroundColor: colors.error, opacity: isProcessing ? 0.6 : 1 }]}
                        onPress={() => setConfirmAction({ type: 'remove', staff: member })}
                        disabled={isProcessing}
                      >
                        <Text style={[styles.actionButtonText, { color: colors.onPrimary }]}>
                          {isProcessing ? 'Working…' : 'Remove'}
                        </Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        style={[styles.actionButton, { backgroundColor: colors.primary, opacity: isProcessing ? 0.6 : 1 }]}
                        onPress={() => setConfirmAction({ type: 'reactivate', staff: member })}
                        disabled={isProcessing}
                      >
                        <Text style={[styles.actionButtonText, { color: colors.onPrimary }]}>
                          {isProcessing ? 'Working…' : 'Reactivate'}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      <ConfirmDialog
        visible={confirmAction !== null}
        title={confirmAction?.type === 'remove' ? 'Remove Staff Member' : 'Reactivate Staff Member'}
        message={
          confirmAction
            ? confirmAction.type === 'remove'
              ? `Remove ${confirmAction.staff.firstName} ${confirmAction.staff.lastName}? They will not be able to sign in until reactivated.`
              : `Reactivate ${confirmAction.staff.firstName} ${confirmAction.staff.lastName}? They will be able to sign in again.`
            : ''
        }
        confirmLabel={confirmAction?.type === 'remove' ? 'Remove' : 'Reactivate'}
        destructive={confirmAction?.type === 'remove'}
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
    searchBar: { marginBottom: theme.spacing.lg },
    searchInput: { borderRadius: theme.radii.lg, paddingHorizontal: 16, paddingVertical: 12, fontSize: theme.fonts.size.md },
    cardShimmer: { marginBottom: theme.spacing.md, borderRadius: theme.radii.lg },
    list: { gap: theme.spacing.md },
    card: { padding: 16, gap: 6 },
    cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    name: { fontSize: theme.fonts.size.md, fontWeight: '700' },
    detail: { fontSize: theme.fonts.size.sm },
    actionsRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
    actionButton: { flex: 1, paddingVertical: 10, borderRadius: theme.radii.md, alignItems: 'center', justifyContent: 'center' },
    actionButtonText: { fontWeight: '700', fontSize: theme.fonts.size.sm },
  });

export default StaffManagementScreen;
