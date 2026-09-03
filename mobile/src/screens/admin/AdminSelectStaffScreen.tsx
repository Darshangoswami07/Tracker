import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/useAppTheme';
import { useAuthStore } from '../../store/authStore';
import { api } from '../../api/client';
import { ENDPOINTS } from '../../api/endpoints';
import { Header } from '../../components/Header';
import { ShimmerCard } from '../../components/ShimmerCard';
import { EmptyState } from '../../components/EmptyState';
import { useAppNav } from '../../hooks/useAppNav';
import type { AppTheme } from '../../theme/types';

/**
 * Import GRs from Excel → Select Area → Select Staff.
 *
 * Every GR an Excel import creates is now assigned to BOTH the location
 * picked on `AdminAreasScreen` and the staff member picked here — this
 * screen is the mandatory step in between. Reuses the exact `GET
 * /admin/users` listing `AllStaffScreen` already uses (role=staff), just
 * scoped to the chosen area server-side. "Skip" on the Areas screen still
 * lands here with no `selectedArea` — in that case every active staff
 * member is shown, since there's no location yet to filter by.
 */

interface StaffMember {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  role: string;
  area: string | null;
  status: string;
  isActive: boolean;
}

export const AdminSelectStaffScreen = ({ route }: any) => {
  const selectedArea = (route?.params as { selectedArea?: string } | undefined)?.selectedArea ?? null;
  const { colors, spacing, radii, fonts, shadows } = useAppTheme();
  const { goBack, navigate } = useAppNav();
  const accessToken = useAuthStore((state) => state.accessToken);
  const styles = createStyles({ colors, spacing, radii, fonts, shadows });

  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const fetchStaff = useCallback(
    async (isRefresh = false) => {
      if (!accessToken) return;
      try {
        const res = await api.get(ENDPOINTS.admin.users, {
          headers: { Authorization: `Bearer ${accessToken}` },
          params: {
            page: 1,
            pageSize: 100,
            role: 'staff',
            status: 'active',
            area: selectedArea || undefined,
          },
        });
        setStaff(res.data.data.items || []);
        setLoadError(false);
      } catch (error) {
        console.error('Failed to fetch Staff for area:', error);
        setLoadError(true);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [accessToken, selectedArea]
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchStaff(true);
  }, [fetchStaff]);

  useEffect(() => {
    fetchStaff();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = staff.find((s) => s.id === selectedId) ?? null;

  const handleContinue = () => {
    if (!selected) return;
    navigate('ExcelImport', {
      selectedArea: selectedArea ?? undefined,
      selectedStaffId: selected.id,
      selectedStaffName: `${selected.firstName} ${selected.lastName}`,
    });
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <Header title="Select Staff" leftAction={{ icon: 'chevron-back', onPress: goBack }} />
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {[1, 2, 3].map((i) => (
            <ShimmerCard key={i} style={styles.cardShimmer} height={90} />
          ))}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <Header title="Select Staff" leftAction={{ icon: 'chevron-back', onPress: goBack }} />

      {selectedArea && (
        <View style={styles.locationBar}>
          <Ionicons name="location" size={14} color={colors.primary} />
          <Text style={[styles.locationBarText, { color: colors.textSecondary }]}>Location: {selectedArea}</Text>
        </View>
      )}

      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#635BFF']} progressBackgroundColor={colors.surface} />
        }
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {loadError ? (
          <EmptyState
            icon="alert-circle-outline"
            title="Unable to load Staff"
            subtitle="Try again"
            actionLabel="Retry"
            onActionPress={() => fetchStaff()}
          />
        ) : staff.length === 0 ? (
          <EmptyState
            icon="people-circle-outline"
            title={selectedArea ? `No staff assigned to ${selectedArea}` : 'No active staff found'}
            subtitle="Assign a staff member to this location before importing, or go back and pick a different location."
            actionLabel="Manage Staff"
            onActionPress={() => navigate('AllStaff')}
          />
        ) : (
          <View style={styles.list}>
            {staff.map((member) => {
              const isSelected = member.id === selectedId;
              return (
                <TouchableOpacity
                  key={member.id}
                  activeOpacity={0.85}
                  onPress={() => setSelectedId(member.id)}
                  style={[
                    styles.card,
                    {
                      backgroundColor: colors.surface,
                      borderRadius: radii.lg,
                      borderColor: isSelected ? colors.primary : 'transparent',
                      borderWidth: 2,
                      ...shadows.sm,
                    },
                  ]}
                >
                  <View style={[styles.avatar, { backgroundColor: `${colors.primary}15` }]}>
                    <Ionicons name="person" size={20} color={colors.primary} />
                  </View>
                  <View style={styles.cardBody}>
                    <Text style={[styles.name, { color: colors.textPrimary }]}>
                      {member.firstName} {member.lastName}
                    </Text>
                    {!!member.phone && (
                      <Text style={[styles.detail, { color: colors.textSecondary }]}>{member.phone}</Text>
                    )}
                    <View style={styles.metaRow}>
                      <Text style={[styles.roleTag, { color: colors.textMuted }]}>Staff</Text>
                      {member.area && (
                        <View style={[styles.areaBadge, { backgroundColor: `${colors.primary}15`, borderRadius: radii.pill }]}>
                          <Ionicons name="location" size={11} color={colors.primary} />
                          <Text style={[styles.areaBadgeText, { color: colors.primary }]}>{member.area}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                  <Ionicons
                    name={isSelected ? 'checkmark-circle' : 'chevron-forward'}
                    size={22}
                    color={isSelected ? colors.primary : colors.textMuted}
                  />
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>

      {staff.length > 0 && (
        <View style={[styles.footer, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
          {selected && (
            <View style={styles.selectionSummary}>
              <Text style={[styles.selectionLabel, { color: colors.textMuted }]}>Selected Staff</Text>
              <Text style={[styles.selectionValue, { color: colors.textPrimary }]}>
                {selected.firstName} {selected.lastName}
              </Text>
            </View>
          )}
          <TouchableOpacity
            style={[
              styles.continueButton,
              { backgroundColor: selected ? colors.primary : colors.border, borderRadius: radii.lg },
            ]}
            onPress={handleContinue}
            disabled={!selected}
            activeOpacity={0.9}
          >
            <Text style={[styles.continueButtonText, { color: colors.onPrimary }]}>Continue to Excel Upload</Text>
            <Ionicons name="arrow-forward" size={18} color={colors.onPrimary} />
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
};

const createStyles = (theme: Pick<AppTheme, 'colors' | 'spacing' | 'radii' | 'fonts' | 'shadows'>) =>
  StyleSheet.create({
    safe: { flex: 1 },
    scrollContent: { paddingBottom: 24, paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.md, gap: theme.spacing.md },
    locationBar: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: theme.spacing.lg, paddingBottom: 8 },
    locationBarText: { fontSize: theme.fonts.size.sm, fontWeight: '700' },
    cardShimmer: { marginBottom: theme.spacing.md, borderRadius: theme.radii.lg },
    list: { gap: theme.spacing.md },
    card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
    avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
    cardBody: { flex: 1, gap: 2 },
    name: { fontSize: theme.fonts.size.md, fontWeight: '700' },
    detail: { fontSize: theme.fonts.size.sm },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
    roleTag: { fontSize: theme.fonts.size.xs, fontWeight: '700', textTransform: 'uppercase' },
    areaBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3 },
    areaBadgeText: { fontSize: theme.fonts.size.xs, fontWeight: '700' },
    footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: theme.spacing.lg, paddingTop: 12, paddingBottom: 20, gap: 8 },
    selectionSummary: { marginBottom: 4 },
    selectionLabel: { fontSize: theme.fonts.size.xs, fontWeight: '700', textTransform: 'uppercase' },
    selectionValue: { fontSize: theme.fonts.size.md, fontWeight: '800' },
    continueButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14 },
    continueButtonText: { fontSize: theme.fonts.size.md, fontWeight: '700' },
  });

export default AdminSelectStaffScreen;
