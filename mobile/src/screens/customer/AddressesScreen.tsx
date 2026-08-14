import { ComponentProps, useEffect, useState, useCallback } from 'react';
import { Animated, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View, Alert, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/useAppTheme';
import { useAuthStore } from '../../store/authStore';
import { api } from '../../api/client';
import { ENDPOINTS } from '../../api/endpoints';
import { Header } from '../../components/Header';
import { ShimmerCard } from '../../components/ShimmerCard';
import { EmptyState } from '../../components/EmptyState';
import { ActionButton } from '../../components/ActionButton';
import { formatDateTime } from '../../utils/format';
import { useAppNav } from '../../hooks/useAppNav';

type IconName = ComponentProps<typeof Ionicons>['name'];

interface Address {
  id: string;
  label: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  lat?: number;
  lng?: number;
  isDefault: boolean;
  type: 'home' | 'work' | 'other';
}

export const AddressesScreen = () => {
  const { colors, spacing, radii, fonts, shadows } = useAppTheme();
  const { goBack } = useAppNav();
  const styles = StyleSheet.create({
    safe: { flex: 1 },
    header: { paddingTop: 8 },
    scrollContent: { paddingBottom: 100, paddingHorizontal: spacing.lg },
    addressesList: { gap: spacing.md },
    addressCard: { backgroundColor: colors.surface, borderRadius: radii.xl, padding: 16, ...shadows.md },
    addressCardShimmer: { marginBottom: spacing.md, borderRadius: radii.xl },
    addressHeader: { flexDirection: 'row', gap: 12 },
    addressIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    addressMainInfo: { flex: 1, gap: 4 },
    addressTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    addressLabel: { fontSize: fonts.size.md, fontWeight: '800' },
    defaultBadge: { fontSize: fonts.size.xs, fontWeight: '700', color: '#10B981', backgroundColor: '#10B98115', paddingHorizontal: 8, paddingVertical: 2, borderRadius: radii.pill },
    addressFull: { fontSize: fonts.size.sm, fontWeight: '500' },
    addressActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    defaultIndicator: { padding: 8 },
    setDefaultBtn: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#635BFF15', borderRadius: radii.md },
    setDefaultText: { color: '#635BFF', fontWeight: '700', fontSize: fonts.size.xs },
    editBtn: { width: 36, height: 36, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F3F4F6' },
    deleteBtn: { width: 36, height: 36, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FEF2F2' },
  });
  const accessToken = useAuthStore((state) => state.accessToken);

  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fadeAnim] = useState(new Animated.Value(0));
  const [slideAnim] = useState(new Animated.Value(20));

  const fetchAddresses = useCallback(async () => {
    if (!accessToken) return;
    try {
      const res = await api.get(`${ENDPOINTS.customer}/addresses`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      setAddresses(res.data.data.items || []);
    } catch (error) {
      console.error('Failed to fetch addresses:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [accessToken]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchAddresses();
  }, [fetchAddresses]);

  const deleteAddress = async (id: string) => {
    Alert.alert('Delete Address', 'Are you sure you want to delete this address?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await api.delete(`${ENDPOINTS.customer}/addresses/${id}`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          Alert.alert('Success', 'Address deleted');
          fetchAddresses();
        } catch (error) {
          console.error('Failed to delete address:', error);
          Alert.alert('Error', 'Failed to delete address');
        }
      }},
    ]);
  };

  const setDefault = async (id: string) => {
    try {
      await api.post(`${ENDPOINTS.customer}/addresses/${id}/default`, {}, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      fetchAddresses();
    } catch (error) {
      console.error('Failed to set default:', error);
      Alert.alert('Error', 'Failed to set default address');
    }
  };

  const handleAddAddress = () => Alert.alert('Add Address', 'Adding a new address is supported in the Create Order flow.');
  const openAddress = (address: Address) => Alert.alert(address.label, `${address.address}, ${address.city}, ${address.state} - ${address.pincode}`);
  const editAddress = (address: Address) => Alert.alert('Edit Address', `Editing ${address.label} is not available yet.`);

  useEffect(() => {
    fetchAddresses();
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: Platform.OS !== 'web' }),
    ]).start();
  }, [fetchAddresses, fadeAnim, slideAnim]);

  const typeIcons: Record<string, IconName> = { home: 'home-outline', work: 'briefcase-outline', other: 'location-outline' };
  const typeColors: Record<string, string> = { home: '#10B981', work: '#635BFF', other: '#F97316' };

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <Header title="Addresses" leftAction={{ icon: 'chevron-back', onPress: goBack }} rightAction={{ icon: 'add', onPress: handleAddAddress }} />
        </View>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {[1,2,3].map((i) => <ShimmerCard key={i} style={styles.addressCardShimmer} height={120} />)}
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
          <Header title="Addresses" leftAction={{ icon: 'chevron-back', onPress: goBack }} rightAction={{ icon: 'add', onPress: handleAddAddress }} />
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
          {addresses.length === 0 ? (
            <EmptyState
              icon="location-outline"
              title="No saved addresses"
              subtitle="Add addresses for faster checkout"
              actionLabel="Add Address"
              onActionPress={handleAddAddress}
              iconColor="#635BFF"
            />
          ) : (
            <View style={styles.addressesList}>
              {addresses.map((address) => (
                <TouchableOpacity key={address.id} style={styles.addressCard} onPress={() => openAddress(address)} activeOpacity={0.85}>
                  <View style={styles.addressHeader}>
                    <View style={[styles.addressIcon, { backgroundColor: `${typeColors[address.type]}15`, borderRadius: radii.md }]}>
                      <Ionicons name={typeIcons[address.type]} size={22} color={typeColors[address.type]} />
                    </View>
                    <View style={styles.addressMainInfo}>
                      <View style={styles.addressTopRow}>
                        <Text style={[styles.addressLabel, { color: colors.textPrimary }]}>{address.label}</Text>
                        {address.isDefault && <Text style={styles.defaultBadge}>Default</Text>}
                      </View>
                      <Text style={[styles.addressFull, { color: colors.textSecondary }]}>{address.address}, {address.city}, {address.state} - {address.pincode}</Text>
                    </View>
                    <View style={styles.addressActions}>
                      {address.isDefault ? (
                        <View style={styles.defaultIndicator}>
                          <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                        </View>
                      ) : (
                        <TouchableOpacity style={styles.setDefaultBtn} onPress={() => setDefault(address.id)}>
                          <Text style={styles.setDefaultText}>Set Default</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity style={styles.editBtn} onPress={() => editAddress(address)}>
                        <Ionicons name="create" size={20} color="#635BFF" />
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.deleteBtn} onPress={() => deleteAddress(address.id)}>
                        <Ionicons name="trash" size={20} color="#EF4444" />
                      </TouchableOpacity>
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </Animated.View>
      </ScrollView>

      <ActionButton
        icon="add"
        onPress={handleAddAddress}
        label="Add Address"
      />
    </SafeAreaView>
  );
};

export default AddressesScreen;