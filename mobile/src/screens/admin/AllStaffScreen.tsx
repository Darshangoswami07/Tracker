import { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
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
import { AREAS } from '../../constants/areas';
import type { AppTheme } from '../../theme/types';

/**
 * All Staff — every self-service Staff account (any status), with a
 * Remove/Reactivate toggle. "Remove" never deletes the account: it flips
 * `status` to `suspended` via the existing generic
 * `PATCH /admin/users/{id}/status` endpoint (unchanged, already used by the
 * Super-Admin-only StaffManagementScreen for the "employee" role) — the
 * account row, and every other record tied to it, stays in the database.
 * A suspended Staff account simply can no longer sign in
 * (`user_service.authenticate_portal` rejects any non-ACTIVE status).
 *
 * Separate from `StaffApprovalsScreen` (pending-only, approve/reject) and
 * from `StaffManagementScreen` (the existing "employee" role, Super-Admin
 * only) — this one covers every Staff status and is available to any Admin.
 */

interface StaffMember {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  status: string;
  isActive: boolean;
  createdAt: string;
  area: string | null;
}

const formatTime = (iso: string): string => {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

type ConfirmAction = { type: 'remove' | 'reactivate'; staff: StaffMember };

export const AllStaffScreen = () => {
  const { colors, spacing, radii, fonts, shadows } = useAppTheme();
  const { goBack, navigate } = useAppNav();
  const accessToken = useAuthStore((state) => state.accessToken);
  const styles = createStyles({ colors, spacing, radii, fonts, shadows });

  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [areaSheetTarget, setAreaSheetTarget] = useState<StaffMember | null>(null);
  const [areaDraft, setAreaDraft] = useState<string | null>(null);
  const [savingArea, setSavingArea] = useState(false);

  const fetchStaff = useCallback(
    async (isRefresh = false) => {
      if (!accessToken) return;
      try {
        const res = await api.get(ENDPOINTS.admin.users, {
          headers: { Authorization: `Bearer ${accessToken}` },
          params: { page: 1, pageSize: 100, role: 'staff', search: search || undefined },
        });
        setStaff(res.data.data.items || []);
        setLoadError(false);
      } catch (error) {
        console.error('Failed to fetch Staff:', error);
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
        prev.map((s) =>
          s.id === target.id
            ? { ...s, status: type === 'remove' ? 'suspended' : 'active', isActive: type !== 'remove' }
            : s
        )
      );
    } catch (error) {
      console.error(`Failed to ${type} Staff member:`, error);
    } finally {
      setProcessingId(null);
    }
  };

  const openAreaSheet = (member: StaffMember) => {
    setAreaSheetTarget(member);
    setAreaDraft(member.area);
  };

  const closeAreaSheet = () => {
    if (savingArea) return;
    setAreaSheetTarget(null);
    setAreaDraft(null);
  };

  const saveArea = async () => {
    if (!areaSheetTarget || !areaDraft || savingArea) return;
    setSavingArea(true);
    try {
      await api.patch(
        ENDPOINTS.admin.userArea(areaSheetTarget.id),
        { area: areaDraft },
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      // Changing the area immediately changes this Staff member's data
      // access boundary — every mobile GR/payment query is scoped by their
      // `area` on every request, so this takes effect on their next screen
      // load/login with no separate step needed.
      setStaff((prev) => prev.map((s) => (s.id === areaSheetTarget.id ? { ...s, area: areaDraft } : s)));
      setAreaSheetTarget(null);
      setAreaDraft(null);
    } catch (error) {
      console.error('Failed to assign Staff location:', error);
    } finally {
      setSavingArea(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <Header title="All Staff" leftAction={{ icon: 'chevron-back', onPress: goBack }} />
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
        <Header title="All Staff" leftAction={{ icon: 'chevron-back', onPress: goBack }} />
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

        {loadError ? (
          <EmptyState
            icon="alert-circle-outline"
            title="Unable to load Staff"
            subtitle="Try again"
            actionLabel="Retry"
            onActionPress={() => fetchStaff()}
          />
        ) : staff.length === 0 ? (
          <EmptyState icon="people-circle-outline" title="No Staff found" subtitle="Staff accounts appear here once they sign up." />
        ) : (
          <View style={styles.list}>
            {staff.map((member) => {
              const isProcessing = processingId === member.id;
              const isActive = member.status === 'active';
              return (
                <View key={member.id} style={[styles.card, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}>
                  {/* Only the profile area opens Staff Work — Change Location
                   * and Remove/Reactivate below are separate touch targets
                   * outside this wrapper so they keep working unchanged. */}
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() =>
                      navigate('StaffDailyWork', {
                        staffId: member.id,
                        fullName: `${member.firstName} ${member.lastName}`,
                        area: member.area,
                        status: member.status,
                      })
                    }
                  >
                    <View style={styles.cardHeader}>
                      <Text style={[styles.name, { color: colors.textPrimary }]}>
                        {member.firstName} {member.lastName}
                      </Text>
                      <StatusBadge status={member.status} size="sm" />
                    </View>
                    <Text style={[styles.detail, { color: colors.textSecondary }]}>{member.email}</Text>
                    <Text style={[styles.detail, { color: colors.textSecondary }]}>{member.phone}</Text>
                    <View
                      style={[
                        styles.areaBadge,
                        { borderRadius: radii.pill, backgroundColor: member.area ? `${colors.primary}15` : `${colors.textMuted}15` },
                      ]}
                    >
                      <Ionicons name="location" size={12} color={member.area ? colors.primary : colors.textMuted} />
                      <Text style={[styles.areaBadgeText, { color: member.area ? colors.primary : colors.textMuted }]}>
                        {member.area ?? 'Not Assigned'}
                      </Text>
                    </View>
                    <Text style={[styles.detail, { color: colors.textMuted }]}>Registered {formatTime(member.createdAt)}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.locationButton, { borderColor: colors.border, borderRadius: radii.md }]}
                    onPress={() => openAreaSheet(member)}
                  >
                    <Ionicons name="location-outline" size={14} color={colors.textPrimary} />
                    <Text style={[styles.locationButtonText, { color: colors.textPrimary }]}>
                      {member.area ? 'Change Location' : 'Assign Location'}
                    </Text>
                  </TouchableOpacity>

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

      {/* Assign/Change Location bottom sheet */}
      <Modal visible={!!areaSheetTarget} transparent animationType="slide" onRequestClose={closeAreaSheet}>
        <Pressable style={[styles.sheetBackdrop, { backgroundColor: colors.overlay }]} onPress={closeAreaSheet}>
          <View style={[styles.bottomSheet, { backgroundColor: colors.surface, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl }]}>
            <View style={styles.sheetHandle} />
            <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>
              {areaSheetTarget?.area ? 'Change Location' : 'Assign Location'}
            </Text>
            {areaSheetTarget?.area && (
              <Text style={[styles.sheetSubtitle, { color: colors.textMuted }]}>
                Current Location: {areaSheetTarget.area}
              </Text>
            )}
            <Text style={[styles.sheetLabel, { color: colors.textMuted }]}>Select Location</Text>
            {AREAS.map((area) => {
              const selected = areaDraft === area;
              return (
                <TouchableOpacity
                  key={area}
                  style={[styles.optionRow, { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? `${colors.primary}10` : 'transparent', borderRadius: radii.md }]}
                  onPress={() => setAreaDraft(area)}
                >
                  <View style={[styles.optionRadio, { borderColor: selected ? colors.primary : colors.border }]}>
                    {selected && <View style={[styles.optionRadioInner, { backgroundColor: colors.primary }]} />}
                  </View>
                  <Text style={[styles.optionText, { color: selected ? colors.primary : colors.textPrimary }]}>{area}</Text>
                </TouchableOpacity>
              );
            })}
            <View style={styles.sheetActionsRow}>
              <TouchableOpacity style={[styles.actionButton, styles.cancelButton, { borderColor: colors.border }]} onPress={closeAreaSheet} disabled={savingArea}>
                <Text style={[styles.actionButtonText, { color: colors.textPrimary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: colors.primary, opacity: !areaDraft || savingArea ? 0.6 : 1 }]}
                onPress={saveArea}
                disabled={!areaDraft || savingArea}
              >
                <Text style={[styles.actionButtonText, { color: colors.onPrimary }]}>
                  {savingArea ? 'Saving…' : areaSheetTarget?.area ? 'Save' : 'Assign'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Pressable>
      </Modal>

      <ConfirmDialog
        visible={confirmAction !== null}
        title={confirmAction?.type === 'remove' ? 'Remove Staff Member' : 'Reactivate Staff Member'}
        message={
          confirmAction
            ? confirmAction.type === 'remove'
              ? `Remove ${confirmAction.staff.firstName} ${confirmAction.staff.lastName}? Their account is kept — they just won't be able to sign in until reactivated.`
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
    areaBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4, marginTop: 2 },
    areaBadgeText: { fontSize: theme.fonts.size.xs, fontWeight: '700' },
    actionsRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
    actionButton: { flex: 1, paddingVertical: 10, borderRadius: theme.radii.md, alignItems: 'center', justifyContent: 'center' },
    cancelButton: { borderWidth: 1, backgroundColor: 'transparent' },
    actionButtonText: { fontWeight: '700', fontSize: theme.fonts.size.sm },
    locationButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, paddingVertical: 9, marginTop: 8 },
    locationButtonText: { fontWeight: '700', fontSize: theme.fonts.size.sm },
    sheetBackdrop: { flex: 1, justifyContent: 'flex-end' },
    bottomSheet: { paddingHorizontal: 24, paddingBottom: 40, paddingTop: 8 },
    sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: theme.colors.border, alignSelf: 'center', marginBottom: 16 },
    sheetTitle: { fontSize: theme.fonts.size.lg, fontWeight: '800', marginBottom: 4 },
    sheetSubtitle: { fontSize: theme.fonts.size.sm, fontWeight: '600', marginBottom: 12 },
    sheetLabel: { fontSize: theme.fonts.size.sm, fontWeight: '700', marginBottom: 8, marginTop: 4 },
    optionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderWidth: 1, marginBottom: 8 },
    optionRadio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
    optionRadioInner: { width: 10, height: 10, borderRadius: 5 },
    optionText: { fontSize: theme.fonts.size.md, fontWeight: '600', flex: 1 },
    sheetActionsRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  });

export default AllStaffScreen;
