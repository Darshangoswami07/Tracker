import { useEffect, useState, useCallback } from 'react';
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
import { StatusBadge } from '../../components/StatusBadge';
import { ActionButton } from '../../components/ActionButton';

interface Driver {
  id: string;
  fullName: string;
  phone: string;
  email: string;
  licenseNumber: string;
  licenseExpiry: string;
  vehiclePlate?: string;
  vehicleType?: string;
  status: string;
  rating: number;
  completedOrders: number;
  isOnline: boolean;
  lastLocation?: { lat: number; lng: number; timestamp: string };
  companyName: string;
}

export const DriversScreen = () => {
  const { colors, spacing, radii, fonts, shadows } = useAppTheme();
  const { goBack, role, navigate } = useAppNav();
  const accessToken = useAuthStore((state) => state.accessToken);
  const isEmployee = role === 'employee' || role === 'dispatcher';
  const driversBase = isEmployee ? ENDPOINTS.employee : ENDPOINTS.business;

  const styles = StyleSheet.create({
    safe: { flex: 1 },
    header: { paddingTop: 8 },
    scrollContent: { paddingBottom: 40, paddingHorizontal: spacing.lg },
    driversList: { gap: spacing.md },
    driverCard: { backgroundColor: colors.surface, borderRadius: radii.xl, padding: 16, ...shadows.md },
    driverCardShimmer: { marginBottom: spacing.md, borderRadius: radii.xl },
    driverHeader: { flexDirection: 'row', gap: 12, marginBottom: 12 },
    avatar: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
    avatarText: { fontSize: 20, fontWeight: '800' },
    driverMainInfo: { flex: 1, gap: 4 },
    driverTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    driverName: { fontSize: fonts.size.lg, fontWeight: '800' },
    driverPhone: { fontSize: fonts.size.md, fontWeight: '600' },
    driverCompany: { fontSize: fonts.size.sm, fontWeight: '500' },
    driverStatus: { alignItems: 'flex-end' },
    statusDot: { width: 12, height: 12, borderRadius: 6 },
    driverDetails: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F3F4F6', gap: 16 },
    detailItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    detailLabel: { fontSize: fonts.size.xs, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
    detailValue: { fontSize: fonts.size.sm, fontWeight: '700' },
    driverActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F3F4F6' },
    actionBtn: { width: 40, height: 40, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F3F4F6' },
    loadMore: { paddingVertical: spacing.lg, alignItems: 'center' },
    loadMoreText: { color: '#635BFF', fontWeight: '600' },
  });

  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [filter, setFilter] = useState('all');
  const [fadeAnim] = useState(new Animated.Value(0));
  const [slideAnim] = useState(new Animated.Value(20));

  const fetchDrivers = useCallback(async (pageNum = 1, isRefresh = false) => {
    if (!accessToken) return;
    try {
      const res = await api.get(`${driversBase}/drivers`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: { page: pageNum, pageSize: 20, status: filter === 'all' ? undefined : filter },
      });
      const newDrivers = res.data.data.items || [];
      if (isRefresh || pageNum === 1) {
        setDrivers(newDrivers);
      } else {
        setDrivers(prev => [...prev, ...newDrivers]);
      }
      setHasMore(newDrivers.length === 20);
      setPage(pageNum);
    } catch (error) {
      console.error('Failed to fetch drivers:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [accessToken, filter, driversBase]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchDrivers(1, true);
  }, [fetchDrivers]);

  const loadMore = useCallback(() => {
    if (!loading && hasMore) {
      fetchDrivers(page + 1);
    }
  }, [loading, hasMore, page, fetchDrivers]);

  const openDriver = (driverId: string) => navigate('DriverDetails', { driverId });
  const handleAdd = () =>
    Alert.alert('Add Driver', 'Driver accounts are created in the admin portal. You can assign available drivers to orders from here.');

  useEffect(() => {
    fetchDrivers();
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: Platform.OS !== 'web' }),
    ]).start();
  }, [fetchDrivers, fadeAnim, slideAnim]);

  useEffect(() => {
    fetchDrivers(1, true);
  }, [filter]);

  const filters = ['all', 'available', 'busy', 'offline'];

  const getStatusConfig = (status: string) => {
    switch (status.toLowerCase()) {
      case 'available': return { color: '#10B981', icon: 'wifi-outline', label: 'Available' };
      case 'busy': return { color: '#F59E0B', icon: 'navigate-outline', label: 'Busy' };
      case 'offline': return { color: '#6B7280', icon: 'wifi-off-outline', label: 'Offline' };
      default: return { color: colors.textMuted, icon: 'help-outline', label: status };
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <Header title="Drivers" leftAction={{ icon: 'chevron-back', onPress: goBack }} rightAction={{ icon: 'person-add', onPress: handleAdd }} />
        </View>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <FilterChips filters={filters} activeFilter={filter} onFilterChange={setFilter} />
          {[1,2,3,4,5].map((i) => <ShimmerCard key={i} style={styles.driverCardShimmer} height={120} />)}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <Animated.View
        style={{
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
        }}
      >
        <View style={styles.header}>
          <Header title="Drivers" leftAction={{ icon: 'chevron-back', onPress: goBack }} rightAction={{ icon: 'person-add', onPress: handleAdd }} />
        </View>
      </Animated.View>

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
        <Animated.View
          style={{
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          }}
        >
          <FilterChips filters={filters} activeFilter={filter} onFilterChange={setFilter} />
        </Animated.View>

        {drivers.length === 0 ? (
          <EmptyState
            icon="people-outline"
            title="No drivers found"
            subtitle={filter !== 'all' ? `No ${filter} drivers` : 'Add your first driver to get started'}
            actionLabel={filter !== 'all' ? 'Show All' : 'Add Driver'}
            onActionPress={() => { if (filter !== 'all') { setFilter('all'); } else { handleAdd(); } }}
            iconColor="#06B6D4"
          />
        ) : (
          <>
            <View style={styles.driversList}>
              {drivers.map((driver) => (
                <TouchableOpacity key={driver.id} style={styles.driverCard} onPress={() => openDriver(driver.id)} activeOpacity={0.85}>
                  <View style={styles.driverHeader}>
                    <View style={[styles.avatar, { backgroundColor: colors.primarySoft, borderRadius: radii.pill }]}>
                      <Text style={[styles.avatarText, { color: colors.primary }]}>{driver.fullName.charAt(0)}</Text>
                    </View>
                    <View style={styles.driverMainInfo}>
                      <View style={styles.driverTopRow}>
                        <Text style={[styles.driverName, { color: colors.textPrimary }]}>{driver.fullName}</Text>
                        <StatusBadge status={driver.status} size="sm" />
                      </View>
                      <Text style={[styles.driverPhone, { color: colors.textSecondary }]}>{driver.phone}</Text>
                      <Text style={[styles.driverCompany, { color: colors.textMuted }]}>{driver.companyName}</Text>
                    </View>
                    <View style={styles.driverStatus}>
                      <View style={[styles.statusDot, { backgroundColor: getStatusConfig(driver.status).color }]} />
                    </View>
                  </View>

                  <View style={styles.driverDetails}>
                    <View style={styles.detailItem}>
                      <Ionicons name={driver.isOnline ? 'wifi' : 'cloud-offline-outline'} size={18} color={driver.isOnline ? '#10B981' : colors.textMuted} />
                      <View>
                        <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Status</Text>
                        <Text style={[styles.detailValue, { color: driver.isOnline ? '#10B981' : colors.textMuted }]}>{driver.isOnline ? 'Online' : 'Offline'}</Text>
                      </View>
                    </View>
                    <View style={styles.detailItem}>
                      <Ionicons name="car-sport-outline" size={18} color="#F97316" />
                      <View>
                        <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Vehicle</Text>
                        <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{driver.vehiclePlate || 'Unassigned'}</Text>
                      </View>
                    </View>
                    <View style={styles.detailItem}>
                      <Ionicons name="star" size={18} color="#F59E0B" />
                      <View>
                        <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Rating</Text>
                        <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{driver.rating.toFixed(1)}</Text>
                      </View>
                    </View>
                    <View style={styles.detailItem}>
                      <Ionicons name="checkmark-circle-outline" size={18} color="#10B981" />
                      <View>
                        <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Completed</Text>
                        <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{driver.completedOrders}</Text>
                      </View>
                    </View>
                  </View>

                  <View style={styles.driverActions}>
                    <TouchableOpacity style={styles.actionBtn} onPress={() => Linking.openURL(`tel:${driver.phone}`).catch(() => {})}>
                      <Ionicons name="call" size={18} color="#10B981" />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionBtn} onPress={() => Linking.openURL(`sms:${driver.phone}`).catch(() => {})}>
                      <Ionicons name="chatbubble" size={18} color="#3B82F6" />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionBtn} onPress={() => {
                      if (driver.lastLocation) {
                        Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${driver.lastLocation.lat},${driver.lastLocation.lng}`).catch(() => {});
                      } else {
                        Alert.alert('No Location', `Live location for ${driver.fullName} is not available right now.`);
                      }
                    }}>
                      <Ionicons name="navigate" size={18} color="#635BFF" />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionBtn} onPress={() => openDriver(driver.id)}>
                      <Ionicons name="settings" size={18} color="#6B7280" />
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
            {hasMore && <View style={styles.loadMore}><Text style={styles.loadMoreText}>Load more drivers...</Text></View>}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

export default DriversScreen;