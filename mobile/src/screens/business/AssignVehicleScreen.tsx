import { useEffect, useState } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View, Alert, ScrollView, RefreshControl, Platform } from 'react-native';
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
import { ActionButton } from '../../components/ActionButton';

interface Driver {
  id: string;
  fullName: string;
  phone: string;
  vehiclePlate?: string;
  vehicleType?: string;
  rating: number;
  completedOrders: number;
  isOnline: boolean;
  status: string;
}

export const AssignVehicleScreen = ({ route }: any) => {
  const { orderId } = route.params;
  const { colors, spacing, radii, fonts, shadows } = useAppTheme();
  const { goBack } = useAppNav();
  const accessToken = useAuthStore((state) => state.accessToken);

  const styles = StyleSheet.create({
    safe: { flex: 1 },
    headerContainer: { paddingTop: 8 },
    header: { paddingHorizontal: spacing.lg, paddingBottom: 8 },
    scrollContent: { paddingBottom: 40, paddingHorizontal: spacing.lg },
    infoCard: { backgroundColor: '#635BFF15', borderRadius: radii.xl, padding: 16, marginHorizontal: spacing.lg, marginBottom: spacing.xl },
    infoTitle: { fontSize: fonts.size.lg, fontWeight: '800', color: '#635BFF' },
    infoSubtitle: { fontSize: fonts.size.sm, color: '#635BFF', marginTop: 4, opacity: 0.8 },
    section: { marginBottom: spacing.xl },
    sectionHeader: { marginBottom: spacing.md },
    sectionTitle: { fontSize: fonts.size.md, fontWeight: '800', color: colors.textPrimary },
    driversList: { gap: spacing.md },
    driverCard: { backgroundColor: colors.surface, borderRadius: radii.xl, padding: 16, ...shadows.md },
    driverCardDisabled: { backgroundColor: colors.surfaceMuted, borderRadius: radii.xl, padding: 16, opacity: 0.6 },
    driverCardShimmer: { marginBottom: spacing.md, borderRadius: radii.xl },
    driverHeader: { flexDirection: 'row', gap: 12, marginBottom: 12 },
    avatar: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
    avatarText: { fontSize: 20, fontWeight: '800' },
    driverMainInfo: { flex: 1, gap: 4 },
    driverTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    driverName: { fontSize: fonts.size.lg, fontWeight: '800' },
    driverPhone: { fontSize: fonts.size.md, fontWeight: '600' },
    driverVehicle: { fontSize: fonts.size.sm, fontWeight: '500' },
    driverRating: { alignItems: 'flex-end', flexDirection: 'row', gap: 4 },
    driverDetails: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F3F4F6', gap: 16 },
    detailItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    assignBtn: { paddingVertical: 8, paddingHorizontal: 16, backgroundColor: '#635BFF', borderRadius: radii.md, alignSelf: 'flex-end', marginTop: 8 },
    assignBtnText: { color: '#fff', fontWeight: '700', fontSize: fonts.size.sm },
    disabledLabel: { textAlign: 'center', paddingVertical: 12, color: colors.textMuted, fontSize: fonts.size.sm, fontWeight: '600' },
  });

  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fadeAnim] = useState(new Animated.Value(0));
  const [slideAnim] = useState(new Animated.Value(20));

  const fetchDrivers = async (isRefresh = false) => {
    if (!accessToken) return;
    try {
      const res = await api.get(`${ENDPOINTS.business}/drivers`);
      setDrivers(res.data.data.items || []);
    } catch (error) {
      console.error('Failed to fetch drivers:', error);
      Alert.alert('Error', 'Failed to load drivers');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchDrivers(true);
  };

  const assignDriver = async (driverId: string) => {
    try {
      await api.post(`${ENDPOINTS.business}/orders/${orderId}/assign-driver`, { driverId });
      Alert.alert('Success', 'Driver assigned successfully!');
    } catch (error) {
      console.error('Failed to assign driver:', error);
      Alert.alert('Error', 'Failed to assign driver');
    }
  };

  useEffect(() => {
    fetchDrivers();
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: Platform.OS !== 'web' }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  const getStatusConfig = (status: string) => {
    switch (status.toLowerCase()) {
      case 'available': return { color: '#10B981', label: 'Available' };
      case 'busy': return { color: '#F59E0B', label: 'Busy' };
      case 'offline': return { color: '#6B7280', label: 'Offline' };
      default: return { color: colors.textMuted, label: status };
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <Header title="Assign Driver" leftAction={{ icon: 'chevron-back', onPress: goBack }} />
        </View>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {[1,2,3,4,5].map((i) => <ShimmerCard key={i} style={styles.driverCardShimmer} height={120} />)}
        </ScrollView>
      </SafeAreaView>
    );
  }

  const availableDrivers = drivers.filter(d => d.status === 'available' && d.isOnline);
  const busyDrivers = drivers.filter(d => d.status === 'busy');
  const offlineDrivers = drivers.filter(d => d.status === 'offline');

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <Animated.View style={styles.headerContainer}>
        <View style={styles.header}>
          <Header title="Assign Driver" leftAction={{ icon: 'chevron-back', onPress: goBack }} />
        </View>
        <Animated.View
          style={{
            transform: [{ translateY: slideAnim }],
            opacity: fadeAnim,
          }}
        >
          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>Order #{orderId.slice(-8)}</Text>
            <Text style={styles.infoSubtitle}>Select an available driver to assign this order</Text>
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
          {availableDrivers.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Available Drivers ({availableDrivers.length})</Text>
              </View>
              <View style={styles.driversList}>
                {availableDrivers.map((driver) => (
                  <TouchableOpacity key={driver.id} style={styles.driverCard} onPress={() => assignDriver(driver.id)} activeOpacity={0.85}>
                    <View style={styles.driverHeader}>
                      <View style={[styles.avatar, { backgroundColor: colors.primarySoft, borderRadius: radii.pill }]}>
                        <Text style={[styles.avatarText, { color: colors.primary }]}>{driver.fullName.charAt(0)}</Text>
                      </View>
                      <View style={styles.driverMainInfo}>
                        <View style={styles.driverTopRow}>
                          <Text style={[styles.driverName, { color: colors.textPrimary }]}>{driver.fullName}</Text>
                          <StatusBadge status="available" size="sm" />
                        </View>
                        <Text style={[styles.driverPhone, { color: colors.textSecondary }]}>{driver.phone}</Text>
                        <Text style={[styles.driverVehicle, { color: colors.textMuted }]}>{driver.vehiclePlate || 'No vehicle assigned'}</Text>
                      </View>
                      <View style={styles.driverRating}>
                        <Ionicons name="star" size={18} color="#F59E0B" />
                        <Text style={{ color: colors.textPrimary, fontWeight: '700' }}>{driver.rating.toFixed(1)}</Text>
                      </View>
                    </View>
                    <View style={styles.driverDetails}>
                      <View style={styles.detailItem}>
                        <Ionicons name="checkmark-circle-outline" size={16} color="#10B981" />
                        <Text style={{ color: colors.textSecondary, fontSize: fonts.size.xs }}>Completed: {driver.completedOrders}</Text>
                      </View>
                      <View style={styles.detailItem}>
                        <Ionicons name="wifi" size={16} color="#10B981" />
                        <Text style={{ color: colors.textSecondary, fontSize: fonts.size.xs }}>Online</Text>
                      </View>
                    </View>
                    <View style={styles.assignBtn}>
                      <Text style={styles.assignBtnText}>Assign</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {busyDrivers.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Busy Drivers ({busyDrivers.length})</Text>
              </View>
              <View style={styles.driversList}>
                {busyDrivers.map((driver) => (
                  <View key={driver.id} style={styles.driverCardDisabled}>
                    <View style={styles.driverHeader}>
                      <View style={[styles.avatar, { backgroundColor: '#F59E0B15', borderRadius: radii.pill }]}>
                        <Text style={[styles.avatarText, { color: '#F59E0B' }]}>{driver.fullName.charAt(0)}</Text>
                      </View>
                      <View style={styles.driverMainInfo}>
                        <View style={styles.driverTopRow}>
                          <Text style={[styles.driverName, { color: colors.textPrimary }]}>{driver.fullName}</Text>
                          <StatusBadge status="busy" size="sm" />
                        </View>
                        <Text style={[styles.driverPhone, { color: colors.textSecondary }]}>{driver.phone}</Text>
                        <Text style={[styles.driverVehicle, { color: colors.textMuted }]}>{driver.vehiclePlate || 'No vehicle assigned'}</Text>
                      </View>
                    </View>
                    <View style={styles.disabledLabel}>Currently busy</View>
                  </View>
                ))}
              </View>
            </View>
          )}

          {offlineDrivers.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Offline Drivers ({offlineDrivers.length})</Text>
              </View>
              <View style={styles.driversList}>
                {offlineDrivers.map((driver) => (
                  <View key={driver.id} style={styles.driverCardDisabled}>
                    <View style={styles.driverHeader}>
                      <View style={[styles.avatar, { backgroundColor: '#6B728015', borderRadius: radii.pill }]}>
                        <Text style={[styles.avatarText, { color: '#6B7280' }]}>{driver.fullName.charAt(0)}</Text>
                      </View>
                      <View style={styles.driverMainInfo}>
                        <View style={styles.driverTopRow}>
                          <Text style={[styles.driverName, { color: colors.textPrimary }]}>{driver.fullName}</Text>
                          <StatusBadge status="offline" size="sm" />
                        </View>
                        <Text style={[styles.driverPhone, { color: colors.textSecondary }]}>{driver.phone}</Text>
                        <Text style={[styles.driverVehicle, { color: colors.textMuted }]}>{driver.vehiclePlate || 'No vehicle assigned'}</Text>
                      </View>
                    </View>
                    <View style={styles.disabledLabel}>Offline</View>
                  </View>
                ))}
              </View>
            </View>
          )}

          {(availableDrivers.length + busyDrivers.length + offlineDrivers.length) === 0 && (
            <EmptyState
              icon="people-outline"
              title="No drivers available"
              subtitle="Add drivers to your fleet to assign orders"
              actionLabel="Add Driver"
              onActionPress={() => Alert.alert('Add Driver', 'Adding new drivers is managed through the admin portal.')}
              iconColor="#06B6D4"
            />
          )}
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
};

export default AssignVehicleScreen;