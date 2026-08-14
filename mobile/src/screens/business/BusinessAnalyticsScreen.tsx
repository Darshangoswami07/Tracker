import { useEffect, useState, useCallback } from 'react';
import { Animated, Alert, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/useAppTheme';
import { useAppNav } from '../../hooks/useAppNav';
import { useAuthStore } from '../../store/authStore';
import { api } from '../../api/client';
import { ENDPOINTS } from '../../api/endpoints';
import { Header } from '../../components/Header';
import { ShimmerCard } from '../../components/ShimmerCard';
import { StatCard } from '../../components/StatCard';
import { ActionButton } from '../../components/ActionButton';
import { EmptyState } from '../../components/EmptyState';
import type { AppTheme } from '../../theme/types';

interface AnalyticsData {
  overview: {
    totalOrders: number;
    completedOrders: number;
    cancelledOrders: number;
    pendingOrders: number;
    totalRevenue: number;
    avgOrderValue: number;
    ordersGrowth: number;
    revenueGrowth: number;
  };
  ordersByStatus: Array<{ status: string; count: number; color: string }>;
  ordersByType: Array<{ type: string; count: number }>;
  revenueTrend: Array<{ date: string; revenue: number; orders: number }>;
  topDrivers: Array<{ id: string; name: string; orders: number; rating: number; earnings: number }>;
  topCustomers: Array<{ id: string; name: string; orders: number; spent: number }>;
  vehicleUtilization: Array<{ vehicleId: string; plate: string; utilization: number }>;
}

export const BusinessAnalyticsScreen = () => {
  const { colors, spacing, radii, fonts, shadows } = useAppTheme();
  const { goBack } = useAppNav();
  const accessToken = useAuthStore((state) => state.accessToken);

  const styles = createStyles({ colors, spacing, radii, fonts, shadows });

  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod] = useState('week');
  const [fadeAnim] = useState(new Animated.Value(0));
  const [slideAnim] = useState(new Animated.Value(20));

  const fetchAnalytics = useCallback(async () => {
    if (!accessToken) return;
    try {
      const res = await api.get(`${ENDPOINTS.business}/analytics`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: { period },
      });
      setAnalytics(res.data.data);
    } catch (error) {
      console.error('Failed to fetch analytics:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [accessToken, period]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchAnalytics();
  }, [fetchAnalytics]);

  const handleExport = useCallback(() => {
    Alert.alert('Export Analytics', `Downloading the ${period} analytics summary. The report will be available under Reports shortly.`);
  }, [period]);

  useEffect(() => {
    fetchAnalytics();
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(slideAnim, { toValue: 0, duration: 600, useNativeDriver: Platform.OS !== 'web' }),
    ]).start();
  }, [fetchAnalytics, fadeAnim, slideAnim]);

  useEffect(() => {
    fetchAnalytics();
  }, [period]);

  const periods = ['today', 'week', 'month', 'quarter', 'year'];

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <Header title="Analytics" leftAction={{ icon: 'chevron-back', onPress: goBack }} rightAction={{ icon: 'download', onPress: handleExport }} />
        </View>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.periodSelector}>
            {periods.map(p => (
              <TouchableOpacity key={p} style={[styles.periodChip, { backgroundColor: period === p ? '#635BFF' : colors.surface }]} onPress={() => setPeriod(p)}>
                <Text style={[styles.periodChipText, { color: period === p ? '#fff' : colors.textPrimary }]}>{p.charAt(0).toUpperCase() + p.slice(1)}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {[1,2,3,4,5,6].map((i) => <ShimmerCard key={i} style={styles.statCardShimmer} />)}
          <ShimmerCard style={styles.chartShimmer} height={200} />
          <ShimmerCard style={styles.chartShimmer} height={200} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (!analytics) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <Header title="Analytics" leftAction={{ icon: 'chevron-back', onPress: goBack }} rightAction={{ icon: 'download', onPress: handleExport }} />
        </View>
      </SafeAreaView>
    );
  }

  const { overview, ordersByStatus, ordersByType, revenueTrend, topDrivers, topCustomers, vehicleUtilization } = analytics;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <Animated.View
        style={{
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
        }}
      >
        <View style={styles.header}>
          <Header title="Analytics" leftAction={{ icon: 'chevron-back', onPress: goBack }} rightAction={{ icon: 'download', onPress: handleExport }} />
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
        >
          <View style={styles.periodSelector}>
            {periods.map(p => (
              <TouchableOpacity key={p} style={[styles.periodChip, { backgroundColor: period === p ? '#635BFF' : colors.surface }]} onPress={() => setPeriod(p)}>
                <Text style={[styles.periodChipText, { color: period === p ? '#fff' : colors.textPrimary }]}>{p.charAt(0).toUpperCase() + p.slice(1)}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.statsGrid}>
            <StatCard
              title="Total Orders"
              value={overview.totalOrders.toLocaleString()}
              icon="cube-outline"
              color="#635BFF"
              trend={{ value: overview.ordersGrowth, label: 'vs last period', isPercentage: true }}
            />
            <StatCard
              title="Completed"
              value={overview.completedOrders.toLocaleString()}
              icon="checkmark-circle-outline"
              color="#10B981"
            />
            <StatCard
              title="Pending"
              value={overview.pendingOrders.toLocaleString()}
              icon="time-outline"
              color="#F59E0B"
            />
            <StatCard
              title="Revenue"
              value={`₹${overview.totalRevenue.toLocaleString()}`}
              icon="cash-outline"
              color="#8B5CF6"
              trend={{ value: overview.revenueGrowth, label: 'vs last period', isPercentage: true }}
            />
            <StatCard
              title="Avg Order Value"
              value={`₹${overview.avgOrderValue.toLocaleString()}`}
              icon="calculator-outline"
              color="#06B6D4"
            />
            <StatCard
              title="Cancelled"
              value={overview.cancelledOrders.toLocaleString()}
              icon="close-circle-outline"
              color="#EF4444"
            />
          </View>

          <View style={styles.chartSection}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Orders by Status</Text>
            <View style={styles.pieChartContainer}>
              {ordersByStatus.map((item, index) => (
                <View key={item.status} style={styles.pieSlice}>
                  <View style={[styles.pieColor, { backgroundColor: item.color }]} />
                  <View style={styles.pieLabel}>
                    <Text style={{ color: colors.textPrimary, fontWeight: '700' }}>{item.status.replace('_', ' ')}</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: fonts.size.sm }}>{item.count} orders</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.chartSection}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Revenue Trend</Text>
            <View style={styles.chartPlaceholder}>
              <Text style={{ color: colors.textMuted }}>Revenue chart placeholder - ${revenueTrend.length} data points</Text>
            </View>
          </View>

          <View style={styles.chartSection}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Orders by Type</Text>
            <View style={styles.barChart}>
              {ordersByType.map((item) => (
                <View key={item.type} style={styles.barItem}>
                  <View style={styles.barLabel}>
                    <Text style={{ color: colors.textPrimary, fontWeight: '600' }}>{item.type}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: fonts.size.xs }}>{item.count}</Text>
                  </View>
                  <View style={styles.barTrack}>
                    <View style={[styles.barFill, { width: `${Math.max(10, (item.count / Math.max(...ordersByType.map(t => t.count))) * 100)}%` }]} />
                  </View>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.chartSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Top Drivers</Text>
            </View>
            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <Text style={styles.tableCell}>Driver</Text>
                <Text style={styles.tableCell}>Orders</Text>
                <Text style={styles.tableCell}>Rating</Text>
                <Text style={styles.tableCell}>Earnings</Text>
              </View>
              {topDrivers.map((driver) => (
                <View key={driver.id} style={styles.tableRow}>
                  <Text style={styles.tableCell}>{driver.name}</Text>
                  <Text style={styles.tableCell}>{driver.orders}</Text>
                  <View style={styles.ratingCell}>
                    <Ionicons name="star" size={16} color="#F59E0B" />
                    <Text style={{ color: colors.textPrimary, fontWeight: '600' }}>{driver.rating.toFixed(1)}</Text>
                  </View>
                  <Text style={styles.tableCell}>₹{driver.earnings.toLocaleString()}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.chartSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Top Customers</Text>
            </View>
            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <Text style={styles.tableCell}>Customer</Text>
                <Text style={styles.tableCell}>Orders</Text>
                <Text style={styles.tableCell}>Total Spent</Text>
              </View>
              {topCustomers.map((customer) => (
                <View key={customer.id} style={styles.tableRow}>
                  <Text style={styles.tableCell}>{customer.name}</Text>
                  <Text style={styles.tableCell}>{customer.orders}</Text>
                  <Text style={styles.tableCell}>₹{customer.spent.toLocaleString()}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.chartSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Vehicle Utilization</Text>
            </View>
            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <Text style={styles.tableCell}>Vehicle</Text>
                <Text style={styles.tableCell}>Utilization</Text>
              </View>
              {vehicleUtilization.map((vehicle) => (
                <View key={vehicle.vehicleId} style={styles.tableRow}>
                  <Text style={styles.tableCell}>{vehicle.plate}</Text>
                  <View style={styles.utilizationCell}>
                    <View style={styles.utilizationBar}>
                      <View style={[styles.utilizationFill, { width: `${vehicle.utilization}%`, backgroundColor: vehicle.utilization > 80 ? '#10B981' : vehicle.utilization > 50 ? '#F59E0B' : '#EF4444' }]} />
                    </View>
                    <Text style={{ color: colors.textSecondary, fontSize: fonts.size.sm }}>{vehicle.utilization}%</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
      </Animated.View>
    </SafeAreaView>
  );
};

const createStyles = (theme: Pick<AppTheme, 'colors' | 'spacing' | 'radii' | 'fonts' | 'shadows'>) =>
  StyleSheet.create({
    safe: { flex: 1 },
    header: { paddingTop: 8 },
    scrollContent: { paddingBottom: 40, paddingHorizontal: theme.spacing.lg },
    periodSelector: { flexDirection: 'row', gap: theme.spacing.sm, marginBottom: theme.spacing.xl, flexWrap: 'wrap' },
    periodChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: theme.radii.pill, borderWidth: 1, borderColor: '#E5E7EB' },
    periodChipText: { fontSize: theme.fonts.size.sm, fontWeight: '700' },
    statsGrid: { gap: theme.spacing.md, marginBottom: theme.spacing.xxl },
    statCardShimmer: { borderRadius: theme.radii.lg },
    chartSection: { marginBottom: theme.spacing.xxl },
    sectionTitle: { fontSize: theme.fonts.size.md, fontWeight: '800', marginBottom: theme.spacing.md },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.md },
    pieChartContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.lg },
    pieSlice: { flex: 1, minWidth: '40%', alignItems: 'center', gap: 8 },
    pieColor: { width: 16, height: 16, borderRadius: 8 },
    pieLabel: { alignItems: 'center', gap: 2 },
    chartPlaceholder: { height: 200, backgroundColor: theme.colors.surface, borderRadius: theme.radii.xl, alignItems: 'center', justifyContent: 'center', ...theme.shadows.sm },
    chartShimmer: { marginBottom: theme.spacing.xl, borderRadius: theme.radii.xl },
    barChart: { gap: theme.spacing.md },
    barItem: { gap: theme.spacing.sm },
    barLabel: { flexDirection: 'row', justifyContent: 'space-between', width: '100%' },
    barTrack: { height: 8, backgroundColor: '#E5E7EB', borderRadius: 4, overflow: 'hidden' },
    barFill: { height: '100%', backgroundColor: '#635BFF', borderRadius: 4 },
    table: { backgroundColor: theme.colors.surface, borderRadius: theme.radii.xl, overflow: 'hidden', ...theme.shadows.sm },
    tableHeader: { flexDirection: 'row', padding: 16, backgroundColor: '#F9FAFB', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
    tableCell: { flex: 1, fontSize: theme.fonts.size.xs, fontWeight: '700', color: theme.colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
    tableRow: { flexDirection: 'row', padding: 16, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
    ratingCell: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 },
    utilizationCell: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
    utilizationBar: { flex: 1, height: 8, backgroundColor: '#E5E7EB', borderRadius: 4, overflow: 'hidden' },
    utilizationFill: { height: '100%', borderRadius: 4 },
  });

export default BusinessAnalyticsScreen;