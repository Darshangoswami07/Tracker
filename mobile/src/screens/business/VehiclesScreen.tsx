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
import { EmptyState } from '../../components/EmptyState';
import { StatusBadge } from '../../components/StatusBadge';
import { FilterChips } from '../../components/FilterChips';

interface Vehicle {
  id: string;
  licensePlate: string;
  vehicleType: string;
  make: string;
  model: string;
  year: number;
  status: string;
  companyName: string;
  driverName?: string;
  fuelLevel: number;
  lastMaintenance?: string;
  nextMaintenance?: string;
}

export const VehiclesScreen = () => {
  const { colors, spacing, radii, fonts, shadows } = useAppTheme();
  const { goBack, role, navigate } = useAppNav();
  const accessToken = useAuthStore((state) => state.accessToken);
  const isEmployee = role === 'employee' || role === 'dispatcher';
  const vehiclesBase = isEmployee ? ENDPOINTS.employee : ENDPOINTS.business;

  const styles = StyleSheet.create({
    safe: { flex: 1 },
    header: { paddingTop: 8 },
    scrollContent: { paddingBottom: 40, paddingHorizontal: spacing.lg },
    vehiclesList: { gap: spacing.md },
    vehicleCard: { backgroundColor: colors.surface, borderRadius: radii.xl, padding: 16, ...shadows.md },
    vehicleCardShimmer: { marginBottom: spacing.md, borderRadius: radii.xl },
    vehicleHeader: { flexDirection: 'row', gap: 12, marginBottom: 12 },
    vehicleIcon: { width: 56, height: 56, borderRadius: radii.md, backgroundColor: '#635BFF15', alignItems: 'center', justifyContent: 'center' },
    vehicleMainInfo: { flex: 1, gap: 4 },
    vehicleTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    vehiclePlate: { fontSize: fonts.size.lg, fontWeight: '800' },
    vehicleModel: { fontSize: fonts.size.md, fontWeight: '600' },
    vehicleCompany: { fontSize: fonts.size.sm, fontWeight: '500' },
    vehicleDetails: { flexDirection: 'row', justifyContent: 'space-around', paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F3F4F6', gap: 16 },
    detailItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    detailLabel: { fontSize: fonts.size.xs, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
    detailValue: { fontSize: fonts.size.sm, fontWeight: '700' },
    vehicleActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F3F4F6' },
    actionBtn: { width: 40, height: 40, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F3F4F6' },
    loadMore: { paddingVertical: spacing.lg, alignItems: 'center' },
    loadMoreText: { color: '#635BFF', fontWeight: '600' },
  });

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [filter, setFilter] = useState('all');
  const [fadeAnim] = useState(new Animated.Value(0));
  const [slideAnim] = useState(new Animated.Value(20));

  const fetchVehicles = useCallback(async (pageNum = 1, isRefresh = false) => {
    if (!accessToken) return;
    try {
      const res = await api.get(`${vehiclesBase}/vehicles`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: { page: pageNum, pageSize: 20, status: filter === 'all' ? undefined : filter },
      });
      const newVehicles = res.data.data.items || [];
      if (isRefresh || pageNum === 1) {
        setVehicles(newVehicles);
      } else {
        setVehicles(prev => [...prev, ...newVehicles]);
      }
      setHasMore(newVehicles.length === 20);
      setPage(pageNum);
    } catch (error) {
      console.error('Failed to fetch vehicles:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [accessToken, filter, vehiclesBase]);

  const openVehicle = (vehicleId: string) => navigate('VehicleDetails', { vehicleId });
  const handleAdd = () =>
    Alert.alert('Add Vehicle', 'Vehicles are registered through the admin portal. You can assign available vehicles to orders from here.');

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchVehicles(1, true);
  }, [fetchVehicles]);

  const loadMore = useCallback(() => {
    if (!loading && hasMore) {
      fetchVehicles(page + 1);
    }
  }, [loading, hasMore, page, fetchVehicles]);

  useEffect(() => {
    fetchVehicles();
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: Platform.OS !== 'web' }),
    ]).start();
  }, [fetchVehicles, fadeAnim, slideAnim]);

  useEffect(() => {
    fetchVehicles(1, true);
  }, [filter]);

  const filters = ['all', 'available', 'in_use', 'maintenance', 'offline'];

  const getVehicleIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case 'truck': return 'car-sport-outline';
      case 'van': return 'car-outline';
      case 'bike': return 'bicycle-outline';
      case 'container': return 'cube-outline';
      default: return 'car-sport-outline';
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <Header title="Vehicles" leftAction={{ icon: 'chevron-back', onPress: goBack }} rightAction={{ icon: 'add', onPress: handleAdd }} />
        </View>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <FilterChips filters={filters} activeFilter={filter} onFilterChange={setFilter} />
          {[1,2,3,4,5].map((i) => <ShimmerCard key={i} style={styles.vehicleCardShimmer} height={140} />)}
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
          <Header title="Vehicles" leftAction={{ icon: 'chevron-back', onPress: goBack }} rightAction={{ icon: 'add', onPress: handleAdd }} />
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

        {vehicles.length === 0 ? (
          <EmptyState
            icon="car-sport-outline"
            title="No vehicles found"
            subtitle={filter !== 'all' ? `No ${filter} vehicles` : 'Add your first vehicle to get started'}
            actionLabel={filter !== 'all' ? 'Show All' : 'Add Vehicle'}
            onActionPress={() => { if (filter !== 'all') { setFilter('all'); } else { handleAdd(); } }}
            iconColor="#F97316"
          />
        ) : (
          <>
            <View style={styles.vehiclesList}>
              {vehicles.map((vehicle) => (
                <TouchableOpacity key={vehicle.id} style={styles.vehicleCard} onPress={() => openVehicle(vehicle.id)} activeOpacity={0.85}>
                  <View style={styles.vehicleHeader}>
                    <View style={styles.vehicleIcon}>
                      <Ionicons name={getVehicleIcon(vehicle.vehicleType)} size={28} color="#635BFF" />
                    </View>
                    <View style={styles.vehicleMainInfo}>
                      <View style={styles.vehicleTopRow}>
                        <Text style={[styles.vehiclePlate, { color: colors.textPrimary }]}>{vehicle.licensePlate}</Text>
                        <StatusBadge status={vehicle.status} size="sm" />
                      </View>
                      <Text style={[styles.vehicleModel, { color: colors.textSecondary }]}>{vehicle.make} {vehicle.model} ({vehicle.year})</Text>
                      <Text style={[styles.vehicleCompany, { color: colors.textMuted }]}>{vehicle.companyName}</Text>
                    </View>
                  </View>

                  <View style={styles.vehicleDetails}>
                    <View style={styles.detailItem}>
                      <Ionicons name="speedometer-outline" size={18} color={vehicle.fuelLevel > 30 ? '#10B981' : '#F59E0B'} />
                      <View>
                        <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Fuel</Text>
                        <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{Math.round(vehicle.fuelLevel)}%</Text>
                      </View>
                    </View>
                    <View style={styles.detailItem}>
                      <Ionicons name={vehicle.driverName ? 'person-outline' : 'person-remove-outline'} size={18} color={vehicle.driverName ? '#635BFF' : colors.textMuted} />
                      <View>
                        <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Driver</Text>
                        <Text style={[styles.detailValue, { color: vehicle.driverName ? colors.textPrimary : colors.textMuted }]}>{vehicle.driverName || 'Unassigned'}</Text>
                      </View>
                    </View>
                    <View style={styles.detailItem}>
                      <Ionicons name="calendar-outline" size={18} color="#8B5CF6" />
                      <View>
                        <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Next Service</Text>
                        <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{vehicle.nextMaintenance ? vehicle.nextMaintenance.split('T')[0] : 'N/A'}</Text>
                      </View>
                    </View>
                  </View>

                  <View style={styles.vehicleActions}>
                    <TouchableOpacity style={styles.actionBtn} onPress={() => openVehicle(vehicle.id)}>
                      <Ionicons name="navigate" size={18} color="#3B82F6" />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionBtn} onPress={() =>
                      Alert.alert('Maintenance', 'Maintenance history is available in Vehicle Details.')
                    }>
                      <Ionicons name="construct" size={18} color="#F97316" />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionBtn} onPress={() => openVehicle(vehicle.id)}>
                      <Ionicons name="settings" size={18} color="#6B7280" />
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
            {hasMore && <View style={styles.loadMore}><Text style={styles.loadMoreText}>Load more...</Text></View>}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

export default VehiclesScreen;
