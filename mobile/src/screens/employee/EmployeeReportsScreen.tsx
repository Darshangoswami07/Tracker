import { useEffect, useState, useCallback } from 'react';
import type { ComponentProps } from 'react';
import { Animated, Alert, Linking, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/useAppTheme';
import { useAppNav } from '../../hooks/useAppNav';
import { useAuthStore } from '../../store/authStore';
import { api } from '../../api/client';
import { ENDPOINTS } from '../../api/endpoints';
import { Header } from '../../components/Header';
import { ShimmerCard } from '../../components/ShimmerCard';
import { EmptyState } from '../../components/EmptyState';
import { FilterChips } from '../../components/FilterChips';
import { formatCurrency, formatDateTime } from '../../utils/format';

interface Report {
  id: string;
  name: string;
  type: string;
  description: string;
  generatedAt: string;
  size: string;
  status: string;
  downloadUrl?: string;
}

interface ReportType {
  id: string;
  name: string;
  description: string;
  icon: ComponentProps<typeof Ionicons>['name'];
  color: string;
}

export const EmployeeReportsScreen = () => {
  const { colors, spacing, radii, fonts, shadows } = useAppTheme();
  const accessToken = useAuthStore((state) => state.accessToken);
  const { goBack } = useAppNav();

  const styles = StyleSheet.create({
    safe: { flex: 1 },
    header: { paddingTop: 8 },
    scrollContent: { paddingBottom: 40, paddingHorizontal: spacing.lg },
    section: { marginBottom: spacing.xxl },
    sectionTitle: { fontSize: fonts.size.md, fontWeight: '800', color: colors.textPrimary, marginBottom: spacing.md },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
    typesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
    typeCard: { flex: 1, minWidth: '45%', padding: 16, alignItems: 'flex-start', gap: spacing.sm },
    typeIcon: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
    typeName: { fontSize: fonts.size.md, fontWeight: '800' },
    typeDesc: { fontSize: fonts.size.sm, fontWeight: '500' },
    typeCardShimmer: { marginBottom: spacing.md, borderRadius: radii.xl },
    sectionTitleShimmer: { width: 150, height: 24, borderRadius: radii.sm },
    reportsList: { gap: spacing.md },
    reportCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm },
    reportLeft: { flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 },
    reportIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    reportInfo: { gap: 4 },
    reportName: { fontSize: fonts.size.md, fontWeight: '700' },
    reportMeta: { flexDirection: 'row', gap: 12 },
    reportRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    reportStatus: { fontSize: fonts.size.sm, fontWeight: '700' },
    downloadBtn: { width: 40, height: 40, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', backgroundColor: '#635BFF15' },
    reportCardShimmer: { marginBottom: spacing.md, borderRadius: radii.lg },
  });

  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('all');
  const [fadeAnim] = useState(new Animated.Value(0));
  const [slideAnim] = useState(new Animated.Value(20));

  const reportTypes: ReportType[] = [
    { id: 'orders', name: 'Orders Report', description: 'Detailed order history with filters', icon: 'document-text-outline', color: '#635BFF' },
    { id: 'revenue', name: 'Revenue Report', description: 'Financial summary and revenue breakdown', icon: 'cash-outline', color: '#10B981' },
    { id: 'drivers', name: 'Driver Performance', description: 'Driver efficiency and completion rates', icon: 'person-outline', color: '#06B6D4' },
    { id: 'vehicles', name: 'Vehicle Utilization', description: 'Fleet usage and maintenance tracking', icon: 'car-outline', color: '#F97316' },
    { id: 'customers', name: 'Customer Analytics', description: 'Customer behavior and retention metrics', icon: 'people-outline', color: '#8B5CF6' },
    { id: 'operational', name: 'Operational Report', description: 'KPIs and operational efficiency metrics', icon: 'analytics-outline', color: '#F59E0B' },
  ];

  const fetchReports = useCallback(async () => {
    if (!accessToken) return;
    try {
      const res = await api.get(`${ENDPOINTS.employee}/reports`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: { page: 1, pageSize: 50 },
      });
      setReports(res.data.data.items || []);
    } catch (error) {
      console.error('Failed to fetch reports:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [accessToken]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchReports();
  }, [fetchReports]);

  const generateReport = async (typeId: string) => {
    try {
      await api.post(`${ENDPOINTS.employee}/reports/generate`, { type: typeId }, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      Alert.alert('Success', 'Report generation started. You will be notified when ready.');
      fetchReports();
    } catch (error) {
      console.error('Failed to generate report:', error);
      Alert.alert('Error', 'Failed to generate report');
    }
  };

  useEffect(() => {
    fetchReports();
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: Platform.OS !== 'web' }),
    ]).start();
  }, [fetchReports, fadeAnim, slideAnim]);

  const filters = ['all', 'completed', 'generating', 'failed'];

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <Header title="Reports" leftAction={{ icon: 'chevron-back', onPress: goBack }} />
        </View>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {[1,2,3].map((i) => <ShimmerCard key={i} style={styles.typeCardShimmer} height={140} />)}
          <View style={styles.sectionHeader}>
            <ShimmerCard style={styles.sectionTitleShimmer} />
          </View>
          {[1,2,3,4,5].map((i) => <ShimmerCard key={i} style={styles.reportCardShimmer} height={90} />)}
        </ScrollView>
      </SafeAreaView>
    );
  }

  const filteredReports = filter === 'all' ? reports : reports.filter(r => r.status === filter);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <Animated.View
        style={{
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
        }}
      >
        <View style={styles.header}>
          <Header title="Reports" leftAction={{ icon: 'chevron-back', onPress: goBack }} />
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
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Generate Report</Text>
            <View style={styles.typesGrid}>
              {reportTypes.map((type) => (
                <TouchableOpacity key={type.id} style={[styles.typeCard, { backgroundColor: colors.surface, borderRadius: radii.xl, ...shadows.sm }]} onPress={() => generateReport(type.id)} activeOpacity={0.85}>
                  <View style={[styles.typeIcon, { backgroundColor: `${type.color}15`, borderRadius: radii.lg }]}>
                    <Ionicons name={type.icon} size={28} color={type.color} />
                  </View>
                  <Text style={[styles.typeName, { color: colors.textPrimary }]}>{type.name}</Text>
                  <Text style={[styles.typeDesc, { color: colors.textSecondary }]}>{type.description}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Generated Reports</Text>
            <FilterChips filters={filters} activeFilter={filter} onFilterChange={setFilter} />
          </View>

          {filteredReports.length === 0 ? (
            <EmptyState
              icon="document-text-outline"
              title="No reports found"
              subtitle={filter !== 'all' ? `No ${filter} reports` : 'Generate your first report to get started'}
              actionLabel={filter !== 'all' ? 'Show All' : 'Generate Report'}
              onActionPress={() => { if (filter !== 'all') { setFilter('all'); } else { generateReport('orders'); } }}
              iconColor="#635BFF"
            />
          ) : (
            <View style={styles.reportsList}>
              {filteredReports.map((report) => (
                <TouchableOpacity key={report.id} style={styles.reportCard} onPress={() => report.downloadUrl && {}} activeOpacity={0.85}>
                  <View style={styles.reportLeft}>
                    <View style={[styles.reportIcon, { backgroundColor: '#635BFF15', borderRadius: radii.md }]}>
                      <Ionicons name="document-text-outline" size={22} color="#635BFF" />
                    </View>
                    <View style={styles.reportInfo}>
                      <Text style={[styles.reportName, { color: colors.textPrimary }]}>{report.name}</Text>
                      <View style={styles.reportMeta}>
                        <Text style={{ color: colors.textMuted, fontSize: fonts.size.xs }}>{report.type.replace('_', ' ')}</Text>
                        <Text style={{ color: colors.textMuted, fontSize: fonts.size.xs }}>{report.generatedAt.split('T')[0]}</Text>
                        <Text style={{ color: colors.textMuted, fontSize: fonts.size.xs }}>{report.size}</Text>
                      </View>
                    </View>
                  </View>
                  <View style={styles.reportRight}>
                    <Text style={[styles.reportStatus, { color: report.status === 'completed' ? '#10B981' : report.status === 'generating' ? '#F59E0B' : '#EF4444' }]}>
                      {report.status.charAt(0).toUpperCase() + report.status.slice(1)}
                    </Text>
                    {report.downloadUrl && (
                      <TouchableOpacity
                        style={styles.downloadBtn}
                        onPress={() =>
                          Linking.openURL(report.downloadUrl as string).catch(() =>
                            Alert.alert('Unable to Open', 'The download link could not be opened.')
                          )
                        }
                      >
                        <Ionicons name="download" size={20} color="#635BFF" />
                      </TouchableOpacity>
                    )}
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </ScrollView>
      </Animated.View>
    </SafeAreaView>
  );
};

export default EmployeeReportsScreen;