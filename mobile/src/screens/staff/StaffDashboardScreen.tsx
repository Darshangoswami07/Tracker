import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/useAppTheme';
import { useAppNav } from '../../hooks/useAppNav';
import { useUserStore } from '../../store/userStore';
import { orderRepository } from '../../database/repositories/orderRepository';
import { Header } from '../../components/Header';
import type { AppTheme } from '../../theme/types';

interface Overview {
  assigned: number;
  pending: number;
  completed: number;
}

const ASSIGNED_STATUSES = ['assigned', 'pickup', 'in_transit'];

/**
 * Staff's home screen — welcome header, today's delivery overview (counts
 * derived from the same local `orderRepository` the Deliveries tab reads),
 * and quick actions that jump straight into the Deliveries tab.
 */
export const StaffDashboardScreen = () => {
  const { colors, spacing, radii, fonts, shadows } = useAppTheme();
  const { navigate } = useAppNav();
  const user = useUserStore((state) => state.user);
  const styles = createStyles({ colors, spacing, radii, fonts, shadows });

  const [overview, setOverview] = useState<Overview>({ assigned: 0, pending: 0, completed: 0 });
  const [refreshing, setRefreshing] = useState(false);

  const loadOverview = useCallback(async () => {
    const [pending, completed, ...assignedLists] = await Promise.all([
      orderRepository.list({ status: 'pending', pageSize: 1 }),
      orderRepository.list({ status: 'delivered', pageSize: 1 }),
      ...ASSIGNED_STATUSES.map((status) => orderRepository.list({ status, pageSize: 1 })),
    ]);
    setOverview({
      pending: pending.total,
      completed: completed.total,
      assigned: assignedLists.reduce((sum, r) => sum + r.total, 0),
    });
  }, []);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadOverview();
    setRefreshing(false);
  };

  const firstName = user?.fullName?.split(' ')[0] || 'there';

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
      <Header title="Staff Dashboard" />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#635BFF']} progressBackgroundColor={colors.surface} />}
      >
        <Text style={[styles.welcome, { color: colors.textPrimary }]}>Welcome, {firstName}</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Here's today's overview.</Text>

        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}>
            <Text style={[styles.statValue, { color: colors.primary }]}>{overview.assigned}</Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Assigned</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}>
            <Text style={[styles.statValue, { color: '#F59E0B' }]}>{overview.pending}</Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Pending</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}>
            <Text style={[styles.statValue, { color: '#10B981' }]}>{overview.completed}</Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Completed</Text>
          </View>
        </View>

        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Quick Actions</Text>
        <View style={styles.actionsGrid}>
          <TouchableOpacity
            style={[styles.actionCard, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}
            onPress={() => navigate('CreateGR')}
            accessibilityRole="button"
          >
            <View style={[styles.actionIcon, { backgroundColor: '#10B98118' }]}>
              <Ionicons name="add-circle-outline" size={22} color="#10B981" />
            </View>
            <Text style={[styles.actionLabel, { color: colors.textPrimary }]}>Create GR / Shipment</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionCard, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}
            onPress={() => navigate('StaffDeliveries')}
            accessibilityRole="button"
          >
            <View style={[styles.actionIcon, { backgroundColor: `${colors.primary}18` }]}>
              <Ionicons name="cloud-upload-outline" size={22} color={colors.primary} />
            </View>
            <Text style={[styles.actionLabel, { color: colors.textPrimary }]}>Upload Slip</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionCard, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}
            onPress={() => navigate('StaffDeliveries')}
            accessibilityRole="button"
          >
            <View style={[styles.actionIcon, { backgroundColor: '#06B6D418' }]}>
              <Ionicons name="documents-outline" size={22} color="#06B6D4" />
            </View>
            <Text style={[styles.actionLabel, { color: colors.textPrimary }]}>My Slips</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionCard, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}
            onPress={() => navigate('StaffDeliveries')}
            accessibilityRole="button"
          >
            <View style={[styles.actionIcon, { backgroundColor: '#F59E0B18' }]}>
              <Ionicons name="time-outline" size={22} color="#F59E0B" />
            </View>
            <Text style={[styles.actionLabel, { color: colors.textPrimary }]}>Pending Deliveries</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const createStyles = (theme: Pick<AppTheme, 'colors' | 'spacing' | 'radii' | 'fonts' | 'shadows'>) =>
  StyleSheet.create({
    safe: { flex: 1 },
    scrollContent: { padding: theme.spacing.lg, paddingBottom: theme.spacing.huge, gap: theme.spacing.lg },
    welcome: { fontSize: theme.fonts.size.xl, fontWeight: '800', letterSpacing: -0.3 },
    subtitle: { fontSize: theme.fonts.size.sm, marginTop: -theme.spacing.sm },
    statsRow: { flexDirection: 'row', gap: theme.spacing.md },
    statCard: { flex: 1, alignItems: 'center', paddingVertical: theme.spacing.lg, gap: 4 },
    statValue: { fontSize: theme.fonts.size.xxl, fontWeight: '900' },
    statLabel: { fontSize: theme.fonts.size.xs, fontWeight: '600' },
    sectionTitle: { fontSize: theme.fonts.size.md, fontWeight: '800' },
    actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.md },
    actionCard: { flexGrow: 1, minWidth: 140, alignItems: 'center', paddingVertical: theme.spacing.lg, gap: theme.spacing.sm },
    actionIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    actionLabel: { fontSize: theme.fonts.size.sm, fontWeight: '700', textAlign: 'center' },
  });

export default StaffDashboardScreen;
