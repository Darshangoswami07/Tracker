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
import { StatusBadge } from '../../components/StatusBadge';
import { ActionButton } from '../../components/ActionButton';
import { StatCard } from '../../components/StatCard';
import { formatDateTime } from '../../utils/format';
import type { AppTheme } from '../../theme/types';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

interface CustomerDetail {
  id: string;
  fullName: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  totalOrders: number;
  totalSpent: number;
  lastOrderDate?: string;
  isActive: boolean;
  isVerified: boolean;
  createdAt: string;
  savedAddresses: Array<{
    id: string;
    label: string;
    address: string;
    city: string;
    isDefault: boolean;
  }>;
  recentOrders: Array<{
    id: string;
    orderNumber: string;
    status: string;
    amount: number;
    createdAt: string;
    pickupAddress: string;
    deliveryAddress: string;
  }>;
}

export const CustomerDetailsScreen = ({ route }: any) => {
  const { customerId } = route.params;
  const { colors, spacing, radii, fonts, shadows } = useAppTheme();
  const { goBack, role, navigate } = useAppNav();
  const accessToken = useAuthStore((state) => state.accessToken);
  const isEmployee = role === 'employee' || role === 'dispatcher';
  const customersBase = isEmployee ? 'employee' : 'business';

  const styles = createStyles({ colors, spacing, radii, fonts, shadows });

  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fadeAnim] = useState(new Animated.Value(0));
  const [slideAnim] = useState(new Animated.Value(20));

  const fetchCustomer = async (isRefresh = false) => {
    if (!accessToken || !customerId) return;
    try {
      const res = await api.get(`/${customersBase}/customers/${customerId}`);
      setCustomer(res.data.data);
    } catch (error) {
      console.error('Failed to fetch customer:', error);
      Alert.alert('Error', 'Failed to load customer details');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchCustomer(true);
  };

  useEffect(() => {
    fetchCustomer();
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: Platform.OS !== 'web' }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <Header title="Customer Details" leftAction={{ icon: 'chevron-back', onPress: goBack }} />
        </View>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <ShimmerCard style={styles.cardShimmer} height={200} />
          <ShimmerCard style={styles.cardShimmer} height={150} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (!customer) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <Header title="Customer Details" leftAction={{ icon: 'chevron-back', onPress: goBack }} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <Animated.View style={styles.headerContainer}>
        <View style={styles.header}>
          <Header
            title={customer.fullName}
            leftAction={{ icon: 'chevron-back', onPress: goBack }}
            rightAction={{
              icon: 'create-outline',
              onPress: () => Alert.alert('Edit Customer', `Editing ${customer.fullName} is managed through the admin portal.`),
            }}
          />
        </View>
        <Animated.View
          style={{
            transform: [{ translateY: slideAnim }],
            opacity: fadeAnim,
          }}
        >
          <View style={styles.customerHeader}>
            <View style={[styles.avatarLarge, { backgroundColor: '#8B5CF615', borderRadius: radii.pill }]}>
              <Text style={[styles.avatarTextLarge, { color: '#8B5CF6' }]}>{customer.fullName.charAt(0)}</Text>
            </View>
            <View style={styles.customerMainInfo}>
              <View style={styles.customerTopRow}>
                <Text style={[styles.customerNameLarge, { color: colors.textPrimary }]}>{customer.fullName}</Text>
                <StatusBadge status={customer.isActive ? 'active' : 'inactive'} size="md" />
              </View>
              <View style={styles.customerMeta}>
                <View style={styles.metaItem}>
                  <Ionicons name="mail-outline" size={16} color={colors.textMuted} />
                  <Text style={{ color: colors.textSecondary, fontSize: fonts.size.sm }}>{customer.email}</Text>
                </View>
                <View style={styles.metaItem}>
                  <Ionicons name="call-outline" size={16} color={colors.textMuted} />
                  <Text style={{ color: colors.textSecondary, fontSize: fonts.size.sm }}>{customer.phone}</Text>
                </View>
              </View>
              <View style={styles.customerAddress}>
                <Ionicons name="location-outline" size={16} color={colors.textMuted} />
                <Text style={{ color: colors.textSecondary, fontSize: fonts.size.sm }}>{customer.address}, {customer.city}, {customer.state} - {customer.pincode}</Text>
              </View>
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
                <Text style={[styles.statusLabel, { color: colors.textMuted }]}>Total Orders</Text>
                <Text style={[styles.statusValue, { color: colors.textPrimary }]}>{customer.totalOrders}</Text>
              </View>
              <View style={styles.statusItem}>
                <Text style={[styles.statusLabel, { color: colors.textMuted }]}>Total Spent</Text>
                <Text style={[styles.statusValue, { color: '#10B981' }]}>₹{customer.totalSpent.toLocaleString()}</Text>
              </View>
              <View style={styles.statusItem}>
                <Text style={[styles.statusLabel, { color: colors.textMuted }]}>Avg Order Value</Text>
                <Text style={[styles.statusValue, { color: colors.textPrimary }]}>₹{customer.totalOrders > 0 ? Math.round(customer.totalSpent / customer.totalOrders).toLocaleString() : 0}</Text>
              </View>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Account Status</Text>
            <View style={styles.infoRow}>
              <InfoCard icon="shield-outline" label="Verified" value={customer.isVerified ? 'Yes' : 'No'} color={customer.isVerified ? '#10B981' : '#F59E0B'} />
              <InfoCard icon="calendar-outline" label="Joined" value={formatDateTime(customer.createdAt).split(',')[0]} color="#635BFF" />
              <InfoCard icon="calendar-outline" label="Last Order" value={customer.lastOrderDate ? customer.lastOrderDate.split('T')[0] : 'Never'} color="#F97316" />
            </View>
          </View>

          {customer.savedAddresses.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Saved Addresses</Text>
              </View>
              <View style={styles.addressesList}>
                {customer.savedAddresses.map((addr) => (
                  <TouchableOpacity key={addr.id} style={styles.addressItem} onPress={() => Alert.alert(addr.label, addr.address) }>
                    <View style={styles.addressLabelRow}>
                      <Text style={[styles.addressLabel, { color: colors.textPrimary, fontWeight: '700' }]}>{addr.label}</Text>
                      {addr.isDefault && <Text style={styles.defaultBadge}>Default</Text>}
                    </View>
                    <Text style={[styles.addressText, { color: colors.textSecondary }]}>{addr.address}, {addr.city}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {customer.recentOrders.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Recent Orders</Text>
              </View>
              <View style={styles.ordersList}>
                {customer.recentOrders.map((order) => (
                  <TouchableOpacity key={order.id} style={styles.orderItem} onPress={() => navigate('OrderDetails', { orderId: order.id })}>
                    <View style={styles.orderInfo}>
                      <Text style={[styles.orderNumber, { color: colors.textPrimary }]}>{order.orderNumber}</Text>
                      <StatusBadge status={order.status} size="sm" />
                    </View>
                    <View style={styles.orderRoute}>
                      <Text style={{ color: colors.textSecondary, fontSize: fonts.size.sm }}>{order.pickupAddress}</Text>
                      <Text style={{ color: colors.textSecondary, fontSize: fonts.size.sm }}>{order.deliveryAddress}</Text>
                    </View>
                    <View style={styles.orderAmount}>
                      <Text style={{ color: colors.textPrimary, fontWeight: '800', fontSize: fonts.size.md }}>₹{order.amount.toLocaleString()}</Text>
                      <Text style={{ color: colors.textMuted, fontSize: fonts.size.xs }}>{formatDateTime(order.createdAt)}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          <View style={styles.actionsSection}>
            <ActionButton label="Call Customer" icon="call" variant="primary" size="lg" fullWidth onPress={() => Linking.openURL(`tel:${customer.phone}`).catch(() => Alert.alert('Unable to Call', 'Make sure a phone app is available.'))} />
            <ActionButton label="Send Message" icon="chatbubble" variant="secondary" size="lg" fullWidth onPress={() => Linking.openURL(`sms:${customer.phone}`).catch(() => Alert.alert('Unable to Message', 'SMS is not available on this device.'))} />
            <ActionButton label="Create Order" icon="add" variant="outline" size="lg" fullWidth onPress={() => {
              if (isEmployee) Alert.alert('Create Order', 'Create the order from the Orders screen instead.');
              else navigate('CreateOrder');
            }} />
          </View>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
};

const InfoCard = ({ icon, label, value, color }: { icon: IoniconName; label: string; value: string; color: string }) => {
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
    customerHeader: { flexDirection: 'row', gap: 16, marginBottom: theme.spacing.xl, paddingHorizontal: theme.spacing.lg },
    avatarLarge: { width: 80, height: 80, alignItems: 'center', justifyContent: 'center' },
    avatarTextLarge: { fontSize: 32, fontWeight: '800' },
    customerMainInfo: { flex: 1, gap: 8 },
    customerTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    customerNameLarge: { fontSize: theme.fonts.size.xxl, fontWeight: '800' },
    customerMeta: { flexDirection: 'row', gap: 16 },
    metaItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    customerAddress: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 4 },
    statusCard: { backgroundColor: theme.colors.surface, borderRadius: theme.radii.xl, padding: 20, marginHorizontal: theme.spacing.lg, marginBottom: theme.spacing.xl, ...theme.shadows.md },
    statusRow: { flexDirection: 'row', justifyContent: 'space-between' },
    statusItem: { flex: 1, alignItems: 'center', gap: 8 },
    statusLabel: { fontSize: theme.fonts.size.xs, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, color: theme.colors.textMuted },
    statusValue: { fontSize: theme.fonts.size.md, fontWeight: '700' },
    section: { marginBottom: theme.spacing.xl },
    sectionTitle: { fontSize: theme.fonts.size.md, fontWeight: '800', color: theme.colors.textPrimary, marginBottom: theme.spacing.md },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.md },
    infoRow: { flexDirection: 'row', gap: theme.spacing.md },
    infoCard: { flex: 1, padding: 16, alignItems: 'center', gap: 8, backgroundColor: theme.colors.surface, borderRadius: theme.radii.lg, ...theme.shadows.sm },
    infoIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    infoLabel: { fontSize: theme.fonts.size.xs, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, color: theme.colors.textMuted },
    infoValue: { fontSize: theme.fonts.size.md, fontWeight: '700', color: theme.colors.textPrimary },
    addressesList: { gap: theme.spacing.md },
    addressItem: { padding: 16, backgroundColor: theme.colors.surface, borderRadius: theme.radii.lg, ...theme.shadows.sm },
    addressLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
    addressLabel: { fontSize: theme.fonts.size.md },
    defaultBadge: { fontSize: theme.fonts.size.xs, fontWeight: '700', color: '#635BFF', backgroundColor: '#635BFF15', paddingHorizontal: 8, paddingVertical: 2, borderRadius: theme.radii.pill },
    addressText: { fontSize: theme.fonts.size.sm },
    ordersList: { gap: theme.spacing.md },
    orderItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: theme.colors.surface, borderRadius: theme.radii.lg, ...theme.shadows.sm },
    orderInfo: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    orderNumber: { fontSize: theme.fonts.size.md, fontWeight: '800' },
    orderRoute: { gap: 2 },
    orderAmount: { alignItems: 'flex-end', gap: 2 },
    actionsSection: { paddingHorizontal: theme.spacing.lg, marginTop: theme.spacing.xl, gap: theme.spacing.md },
    cardShimmer: { marginBottom: theme.spacing.lg, borderRadius: theme.radii.xl },
  });

export default CustomerDetailsScreen;