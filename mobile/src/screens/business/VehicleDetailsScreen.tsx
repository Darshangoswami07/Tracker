import { useEffect, useState, type ComponentProps } from 'react';
import { Animated, Alert, StyleSheet, Text, TouchableOpacity, View, ScrollView, RefreshControl, Linking, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/useAppTheme';
import { useAppNav } from '../../hooks/useAppNav';
import { useAuthStore } from '../../store/authStore';
import { api } from '../../api/client';
import { Header } from '../../components/Header';
import { ShimmerCard } from '../../components/ShimmerCard';
import { EmptyState } from '../../components/EmptyState';
import { StatusBadge } from '../../components/StatusBadge';
import { ActionButton } from '../../components/ActionButton';
import type { AppTheme } from '../../theme/types';

interface VehicleDetail {
  id: string;
  licensePlate: string;
  vehicleType: string;
  make: string;
  model: string;
  year: number;
  vin: string;
  color: string;
  capacity: number;
  status: string;
  companyName: string;
  driverName?: string;
  driverPhone?: string;
  fuelLevel: number;
  lastMaintenance?: string;
  nextMaintenance?: string;
  insuranceExpiry?: string;
  registrationExpiry?: string;
  images: string[];
  maintenanceHistory: Array<{
    id: string;
    type: string;
    description: string;
    cost: number;
    date: string;
    performedBy: string;
  }>;
  fuelHistory: Array<{
    id: string;
    liters: number;
    cost: number;
    date: string;
    odometer: number;
  }>;
}

export const VehicleDetailsScreen = ({ route }: any) => {
  const { vehicleId } = route.params;
  const { colors, spacing, radii, fonts, shadows } = useAppTheme();
  const { goBack, role } = useAppNav();
  const accessToken = useAuthStore((state) => state.accessToken);
  const isEmployee = role === 'employee' || role === 'dispatcher';
  const vehiclesBase = isEmployee ? 'employee' : 'business';

  const styles = createStyles({ colors, spacing, radii, fonts, shadows });

  const [vehicle, setVehicle] = useState<VehicleDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fadeAnim] = useState(new Animated.Value(0));
  const [slideAnim] = useState(new Animated.Value(20));

  const fetchVehicle = async (isRefresh = false) => {
    if (!accessToken || !vehicleId) return;
    try {
      const res = await api.get(`/${vehiclesBase}/vehicles/${vehicleId}`);
      setVehicle(res.data.data);
    } catch (error) {
      console.error('Failed to fetch vehicle:', error);
      Alert.alert('Error', 'Failed to load vehicle details');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchVehicle(true);
  };

  useEffect(() => {
    fetchVehicle();
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: Platform.OS !== 'web' }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  const getVehicleIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case 'truck': return 'car-sport-outline';
      case 'van': return 'car-outline';
      case 'bike': return 'bicycle-outline';
      default: return 'car-sport-outline';
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <Header title="Vehicle Details" leftAction={{ icon: 'chevron-back', onPress: goBack }} />
        </View>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <ShimmerCard style={styles.cardShimmer} height={200} />
          <ShimmerCard style={styles.cardShimmer} height={150} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (!vehicle) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <Header title="Vehicle Details" leftAction={{ icon: 'chevron-back', onPress: goBack }} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <Animated.View style={styles.headerContainer}>
        <View style={styles.header}>
          <Header title={vehicle.licensePlate} leftAction={{ icon: 'chevron-back', onPress: goBack }} rightAction={{ icon: 'create-outline', onPress: () => Alert.alert('Edit Vehicle', `Editing ${vehicle.licensePlate} is managed through the admin portal.`) }} />
        </View>
        <Animated.View
          style={{
            transform: [{ translateY: slideAnim }],
            opacity: fadeAnim,
          }}
        >
          <View style={styles.vehicleHeader}>
            <View style={[styles.vehicleIconLarge, { backgroundColor: '#635BFF15', borderRadius: radii.xl }]}>
              <Ionicons name={getVehicleIcon(vehicle.vehicleType)} size={48} color="#635BFF" />
            </View>
            <View style={styles.vehicleMainInfo}>
              <View style={styles.vehicleTopRow}>
                <Text style={[styles.vehiclePlateLarge, { color: colors.textPrimary }]}>{vehicle.licensePlate}</Text>
                <StatusBadge status={vehicle.status} size="md" />
              </View>
              <Text style={[styles.vehicleModelLarge, { color: colors.textSecondary }]}>{vehicle.make} {vehicle.model} ({vehicle.year})</Text>
              <Text style={[styles.vehicleCompany, { color: colors.textMuted }]}>{vehicle.companyName}</Text>
            </View>
          </View>
        </Animated.View>
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
            transform: [{ translateY: slideAnim }],
            opacity: fadeAnim,
          }}
        >
          <View style={styles.statusCard}>
            <View style={styles.statusRow}>
              <View style={styles.statusItem}>
                <Text style={[styles.statusLabel, { color: colors.textMuted }]}>Fuel Level</Text>
                <View style={styles.fuelBar}>
                  <View style={[styles.fuelFill, { width: `${vehicle.fuelLevel}%`, backgroundColor: vehicle.fuelLevel > 30 ? '#10B981' : vehicle.fuelLevel > 15 ? '#F59E0B' : '#EF4444' }]} />
                </View>
                <Text style={[styles.statusValue, { color: colors.textPrimary }]}>{Math.round(vehicle.fuelLevel)}%</Text>
              </View>
              <View style={styles.statusItem}>
                <Text style={[styles.statusLabel, { color: colors.textMuted }]}>Status</Text>
                <StatusBadge status={vehicle.status} size="md" />
              </View>
              <View style={styles.statusItem}>
                <Text style={[styles.statusLabel, { color: colors.textMuted }]}>Driver</Text>
                <Text style={[styles.statusValue, { color: colors.textPrimary }]}>{vehicle.driverName || 'Unassigned'}</Text>
              </View>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Specifications</Text>
            <View style={styles.specGrid}>
              <SpecItem icon="car-outline" label="Type" value={vehicle.vehicleType} color="#635BFF" />
              <SpecItem icon="calendar-outline" label="Year" value={vehicle.year.toString()} color="#06B6D4" />
              <SpecItem icon="color-palette-outline" label="Color" value={vehicle.color} color="#8B5CF6" />
              <SpecItem icon="scale-outline" label="Capacity" value={`${vehicle.capacity} kg`} color="#F97316" />
              <SpecItem icon="key-outline" label="VIN" value={vehicle.vin.slice(-8)} color="#10B981" />
              <SpecItem icon="speedometer-outline" label="Fuel" value={`${Math.round(vehicle.fuelLevel)}%`} color="#F59E0B" />
            </View>
          </View>

          {vehicle.driverName && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Assigned Driver</Text>
              <View style={[styles.driverCard, { backgroundColor: colors.surface, borderRadius: radii.xl, ...shadows.sm }]}>
                <View style={styles.driverRow}>
                  <View style={[styles.avatarLarge, { backgroundColor: colors.primarySoft, borderRadius: radii.xl }]}>
                    <Text style={[styles.avatarTextLarge, { color: colors.primary }]}>{vehicle.driverName.charAt(0)}</Text>
                  </View>
                  <View style={styles.driverInfo}>
                    <Text style={[styles.driverNameLarge, { color: colors.textPrimary }]}>{vehicle.driverName}</Text>
                    {vehicle.driverPhone && (
                      <TouchableOpacity style={styles.phoneBtn} onPress={() => Alert.alert('Call Driver', `Call ${vehicle.driverPhone}?`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Call', onPress: () => Linking.openURL(`tel:${vehicle.driverPhone}`).catch(() => {}) }])}>
                        <Ionicons name="call" size={18} color="#10B981" />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              </View>
            </View>
          )}

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Maintenance</Text>
            <View style={styles.infoRow}>
              <InfoCard icon="calendar-outline" label="Last Service" value={vehicle.lastMaintenance ? vehicle.lastMaintenance.split('T')[0] : 'N/A'} color="#635BFF" />
              <InfoCard icon="calendar-outline" label="Next Due" value={vehicle.nextMaintenance ? vehicle.nextMaintenance.split('T')[0] : 'N/A'} color="#F59E0B" />
            </View>
            <View style={styles.infoRow}>
              <InfoCard icon="shield-outline" label="Insurance Expiry" value={vehicle.insuranceExpiry ? vehicle.insuranceExpiry.split('T')[0] : 'N/A'} color="#8B5CF6" />
              <InfoCard icon="document-outline" label="Registration Expiry" value={vehicle.registrationExpiry ? vehicle.registrationExpiry.split('T')[0] : 'N/A'} color="#EF4444" />
            </View>
          </View>

          {vehicle.maintenanceHistory.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Maintenance History</Text>
              </View>
              <View style={styles.historyList}>
                {vehicle.maintenanceHistory.slice(0, 5).map((record) => (
                  <TouchableOpacity key={record.id} style={styles.historyItem} onPress={() => Alert.alert(record.type, `${record.description}\n\nScheduled: ${record.date.split('T')[0]}\nCost: ₹${record.cost.toLocaleString()}`)}>
                    <View style={[styles.historyIcon, { backgroundColor: '#635BFF15', borderRadius: radii.md }]}>
                      <Ionicons name="construct-outline" size={20} color="#635BFF" />
                    </View>
                    <View style={styles.historyContent}>
                      <Text style={[styles.historyTitle, { color: colors.textPrimary }]}>{record.type}</Text>
                      <Text style={[styles.historyDesc, { color: colors.textSecondary }]}>{record.description}</Text>
                      <View style={styles.historyMeta}>
                        <Text style={[styles.historyDate, { color: colors.textMuted }]}>{record.date.split('T')[0]}</Text>
                        <Text style={[styles.historyCost, { color: colors.textSecondary }]}>₹{record.cost.toLocaleString()}</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {vehicle.fuelHistory.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Fuel History</Text>
              </View>
              <View style={styles.historyList}>
                {vehicle.fuelHistory.slice(0, 5).map((record) => (
                  <TouchableOpacity key={record.id} style={styles.historyItem} onPress={() => Alert.alert('Fuel Record', `${record.liters}L filled\nOdometer: ${record.odometer.toLocaleString()} km\nDate: ${record.date.split('T')[0]}\nCost: ₹${record.cost.toLocaleString()}`)}>
                    <View style={[styles.historyIcon, { backgroundColor: '#10B98115', borderRadius: radii.md }]}>
                      <Ionicons name="speedometer-outline" size={20} color="#10B981" />
                    </View>
                    <View style={styles.historyContent}>
                      <Text style={[styles.historyTitle, { color: colors.textPrimary }]}>{record.liters}L filled</Text>
                      <Text style={[styles.historyDesc, { color: colors.textSecondary }]}>Odometer: {record.odometer.toLocaleString()} km</Text>
                      <View style={styles.historyMeta}>
                        <Text style={[styles.historyDate, { color: colors.textMuted }]}>{record.date.split('T')[0]}</Text>
                        <Text style={[styles.historyCost, { color: colors.textSecondary }]}>₹{record.cost.toLocaleString()}</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
};

const SpecItem = ({ icon, label, value, color }: { icon: ComponentProps<typeof Ionicons>['name']; label: string; value: string; color: string }) => {
  const { colors, spacing, radii, fonts, shadows } = useAppTheme();
  const styles = createStyles({ colors, spacing, radii, fonts, shadows });
  return (
    <View style={[styles.specCard, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}>
      <View style={[styles.specIcon, { backgroundColor: `${color}15`, borderRadius: radii.md }]}>
        <Ionicons name={icon} size={22} color={color} />
      </View>
      <Text style={[styles.specLabel, { color: colors.textMuted, fontSize: fonts.size.xs }]}>{label}</Text>
      <Text style={[styles.specValue, { color: colors.textPrimary, fontSize: fonts.size.md }]}>{value}</Text>
    </View>
  );
};

const InfoCard = ({ icon, label, value, color }: { icon: ComponentProps<typeof Ionicons>['name']; label: string; value: string; color: string }) => {
  const { colors, spacing, radii, fonts, shadows } = useAppTheme();
  const styles = createStyles({ colors, spacing, radii, fonts, shadows });
  return (
    <View style={[styles.infoCard, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}>
      <View style={[styles.infoIcon, { backgroundColor: `${color}15`, borderRadius: radii.md }]}>
        <Ionicons name={icon} size={22} color={color} />
      </View>
      <Text style={[styles.infoLabel, { color: colors.textMuted, fontSize: fonts.size.xs }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: colors.textPrimary, fontSize: fonts.size.md }]}>{value}</Text>
    </View>
  );
};

const createStyles = (theme: Pick<AppTheme, 'colors' | 'spacing' | 'radii' | 'fonts' | 'shadows'>) =>
  StyleSheet.create({
    safe: { flex: 1 },
    headerContainer: { paddingTop: 8 },
    header: { paddingHorizontal: theme.spacing.lg, paddingBottom: 8 },
    scrollContent: { paddingBottom: 40, paddingHorizontal: theme.spacing.lg },
    vehicleHeader: { flexDirection: 'row', gap: 16, marginBottom: theme.spacing.xl, paddingHorizontal: theme.spacing.lg },
    vehicleIconLarge: { width: 80, height: 80, alignItems: 'center', justifyContent: 'center' },
    vehicleMainInfo: { flex: 1, gap: 4 },
    vehicleTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    vehiclePlateLarge: { fontSize: theme.fonts.size.xxl, fontWeight: '800' },
    vehicleModelLarge: { fontSize: theme.fonts.size.lg, fontWeight: '600' },
    vehicleCompany: { fontSize: theme.fonts.size.md, fontWeight: '500' },
    statusCard: { backgroundColor: theme.colors.surface, borderRadius: theme.radii.xl, padding: 20, marginHorizontal: theme.spacing.lg, marginBottom: theme.spacing.xl, ...theme.shadows.md },
    statusRow: { flexDirection: 'row', justifyContent: 'space-between' },
    statusItem: { flex: 1, alignItems: 'center', gap: 8 },
    statusLabel: { fontSize: theme.fonts.size.xs, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, color: theme.colors.textMuted },
    statusValue: { fontSize: theme.fonts.size.md, fontWeight: '700' },
    fuelBar: { width: '100%', height: 8, backgroundColor: '#E5E7EB', borderRadius: 4, overflow: 'hidden', marginVertical: 4 },
    fuelFill: { height: '100%', borderRadius: 4 },
    section: { marginBottom: theme.spacing.xl },
    sectionTitle: { fontSize: theme.fonts.size.md, fontWeight: '800', color: theme.colors.textPrimary, marginBottom: theme.spacing.md },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.md },
    specGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.md },
    specCard: { flex: 1, minWidth: '30%', padding: 16, alignItems: 'center', gap: 8, backgroundColor: theme.colors.surface, borderRadius: theme.radii.lg, ...theme.shadows.sm },
    specIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    specLabel: { fontSize: theme.fonts.size.xs, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, color: theme.colors.textMuted },
    specValue: { fontSize: theme.fonts.size.md, fontWeight: '700', color: theme.colors.textPrimary },
    infoCard: { flex: 1, padding: 16, alignItems: 'center', gap: 8, backgroundColor: theme.colors.surface, borderRadius: theme.radii.lg, ...theme.shadows.sm },
    infoIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    infoLabel: { fontSize: theme.fonts.size.xs, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, color: theme.colors.textMuted },
    infoValue: { fontSize: theme.fonts.size.md, fontWeight: '700', color: theme.colors.textPrimary },
    infoRow: { flexDirection: 'row', gap: theme.spacing.md },
    driverCard: { padding: 16, gap: 12 },
    driverRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    avatarLarge: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
    avatarTextLarge: { fontSize: 22, fontWeight: '800' },
    driverInfo: { flex: 1, gap: 4 },
    driverNameLarge: { fontSize: theme.fonts.size.lg, fontWeight: '800' },
    phoneBtn: { padding: 8, backgroundColor: '#10B98115', borderRadius: theme.radii.md },
    maintenanceCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, backgroundColor: theme.colors.surface, borderRadius: theme.radii.lg, ...theme.shadows.sm },
    maintenanceIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    maintenanceContent: { flex: 1, gap: 4 },
    maintenanceTitle: { fontSize: theme.fonts.size.md, fontWeight: '700', color: theme.colors.textPrimary },
    maintenanceDesc: { fontSize: theme.fonts.size.sm, fontWeight: '500', color: theme.colors.textSecondary },
    maintenanceMeta: { flexDirection: 'row', gap: 16, marginTop: 4 },
    maintenanceDate: { fontSize: theme.fonts.size.xs, color: theme.colors.textMuted },
    maintenanceCost: { fontSize: theme.fonts.size.sm, fontWeight: '700', color: theme.colors.textPrimary },
    historyList: { gap: theme.spacing.md },
    historyItem: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, backgroundColor: theme.colors.surface, borderRadius: theme.radii.lg, ...theme.shadows.sm },
    historyIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    historyContent: { flex: 1, gap: 4 },
    historyTitle: { fontSize: theme.fonts.size.md, fontWeight: '700', color: theme.colors.textPrimary },
    historyDesc: { fontSize: theme.fonts.size.sm, fontWeight: '500', color: theme.colors.textSecondary },
    historyMeta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
    historyDate: { fontSize: theme.fonts.size.xs, color: theme.colors.textMuted },
    historyCost: { fontSize: theme.fonts.size.sm, fontWeight: '700', color: theme.colors.textPrimary },
    cardShimmer: { marginBottom: theme.spacing.lg, borderRadius: theme.radii.xl },
  });

export default VehicleDetailsScreen;