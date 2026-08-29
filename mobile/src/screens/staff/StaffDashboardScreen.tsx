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
  outstanding: number;
}

const formatCurrency = (amount: number): string =>
  `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const ASSIGNED_STATUSES = ['uncleared'];

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

  const [overview, setOverview] = useState<Overview>({ assigned: 0, pending: 0, completed: 0, outstanding: 0 });
  const [refreshing, setRefreshing] = useState(false);

  // Every call below is automatically scoped to this Staff member's own
  // assigned area at the repository level (see `orderRepository`'s
  // `resolveAreaScope`) — never the whole system's numbers.
  const loadOverview = useCallback(async () => {
    try {
      const [pending, completed, receiving, ...assignedLists] = await Promise.all([
        orderRepository.list({ status: 'pending', pageSize: 1 }),
        orderRepository.list({ status: 'delivered', pageSize: 1 }),
        orderRepository.getReceivingOverview(),
        ...ASSIGNED_STATUSES.map((status) => orderRepository.list({ status, pageSize: 1 })),
      ]);
      setOverview({
        pending: pending.total,
        completed: completed.total,
        outstanding: receiving.outstanding,
        assigned: assignedLists.reduce((sum, r) => sum + r.total, 0),
      });
    } catch (error) {
      console.error('Failed to load Staff dashboard overview:', error);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => loadOverview(), 0);
    return () => clearTimeout(timer);
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
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Here&apos;s today&apos;s overview.</Text>

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

        {user?.area && (
          <View style={[styles.outstandingCard, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}>
            <View style={styles.outstandingLeft}>
              <Ionicons name="location-outline" size={16} color={colors.primary} />
              <Text style={[styles.outstandingArea, { color: colors.textSecondary }]}>{user.area}</Text>
            </View>
            <View>
              <Text style={[styles.outstandingValue, { color: '#F97316' }]}>{formatCurrency(overview.outstanding)}</Text>
              <Text style={[styles.outstandingLabel, { color: colors.textMuted }]}>Outstanding</Text>
            </View>
          </View>
        )}

        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Quick Actions</Text>
        <View style={styles.actionsGrid}>
          <TouchableOpacity
            style={[styles.actionCard, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}
            onPress={() => navigate('StaffAllShops')}
            accessibilityRole="button"
          >
            <View style={[styles.actionIcon, { backgroundColor: '#635BFF18' }]}>
              <Ionicons name="storefront-outline" size={22} color="#635BFF" />
            </View>
            <Text style={[styles.actionLabel, { color: colors.textPrimary }]}>All Shops</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionCard, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}
            onPress={() => navigate('StaffDeliveries', { title: 'My Slips' })}
            accessibilityRole="button"
          >
            <View style={[styles.actionIcon, { backgroundColor: '#06B6D418' }]}>
              <Ionicons name="documents-outline" size={22} color="#06B6D4" />
            </View>
            <Text style={[styles.actionLabel, { color: colors.textPrimary }]}>My Slips</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionCard, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}
            onPress={() => navigate('StaffDeliveries', { statusFilter: 'pending', title: 'Pending Slip' })}
            accessibilityRole="button"
          >
            <View style={[styles.actionIcon, { backgroundColor: '#F59E0B18' }]}>
              <Ionicons name="time-outline" size={22} color="#F59E0B" />
            </View>
            <Text style={[styles.actionLabel, { color: colors.textPrimary }]}>Pending Slip</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionCard, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}
            onPress={() => navigate('StaffDeliveries', { statusFilter: 'delivered', title: 'Delivered Slip' })}
            accessibilityRole="button"
          >
            <View style={[styles.actionIcon, { backgroundColor: '#10B98118' }]}>
              <Ionicons name="checkmark-done-outline" size={22} color="#10B981" />
            </View>
            <Text style={[styles.actionLabel, { color: colors.textPrimary }]}>Delivered Slip</Text>
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
    outstandingCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.md },
    outstandingLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    outstandingArea: { fontSize: theme.fonts.size.sm, fontWeight: '700' },
    outstandingValue: { fontSize: theme.fonts.size.lg, fontWeight: '800', textAlign: 'right' },
    outstandingLabel: { fontSize: theme.fonts.size.xs, fontWeight: '600', textAlign: 'right' },
    sectionTitle: { fontSize: theme.fonts.size.md, fontWeight: '800' },
    actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.md },
    actionCard: { flexGrow: 1, minWidth: 140, alignItems: 'center', paddingVertical: theme.spacing.lg, gap: theme.spacing.sm },
    actionIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    actionLabel: { fontSize: theme.fonts.size.sm, fontWeight: '700', textAlign: 'center' },
  });

export default StaffDashboardScreen;
