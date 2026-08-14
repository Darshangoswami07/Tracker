import { type ComponentProps } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../theme/useAppTheme';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

interface OrderCardProps {
  order: {
    id: string;
    orderNumber: string;
    customerName: string;
    status: string;
    amount: number;
    createdAt: string;
    pickupAddress: string;
    deliveryAddress: string;
    driverName?: string;
    vehiclePlate?: string;
  };
  compact?: boolean;
  onPress?: () => void;
}

export const OrderCard = ({ order, compact = false, onPress }: OrderCardProps) => {
  const { colors, spacing, radii, fonts, shadows } = useAppTheme();

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'pending': return '#F59E0B';
      case 'assigned': return '#06B6D4';
      case 'picked_up': return '#8B5CF6';
      case 'in_transit': return '#3B82F6';
      case 'delivered': return '#10B981';
      case 'cancelled': return '#EF4444';
      default: return colors.textMuted;
    }
  };

  const getStatusIcon = (status: string): IoniconName => {
    switch (status.toLowerCase()) {
      case 'pending': return 'time-outline';
      case 'assigned': return 'person-add-outline';
      case 'picked_up': return 'cube-outline';
      case 'in_transit': return 'navigate-outline';
      case 'delivered': return 'checkmark-circle-outline';
      case 'cancelled': return 'close-circle-outline';
      default: return 'help-outline';
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }, !compact && styles.cardFull]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <View style={styles.header}>
        <View style={styles.orderInfo}>
          <View style={styles.orderNumberRow}>
            <Text style={[styles.orderNumber, { color: colors.textPrimary, fontSize: fonts.size.md }]}>{order.orderNumber}</Text>
            <View style={[styles.statusBadge, { backgroundColor: `${getStatusColor(order.status)}15`, borderRadius: radii.pill }]}>
              <Ionicons name={getStatusIcon(order.status)} size={12} color={getStatusColor(order.status)} />
              <Text style={[styles.statusText, { color: getStatusColor(order.status), fontSize: fonts.size.xs }]}>
                {order.status.replace('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
              </Text>
            </View>
          </View>
          <Text style={[styles.customerName, { color: colors.textSecondary, fontSize: fonts.size.sm }]}>{order.customerName}</Text>
        </View>
        <View style={styles.amountContainer}>
          <Text style={[styles.amount, { color: colors.textPrimary, fontSize: fonts.size.lg }]}>₹{order.amount.toLocaleString()}</Text>
          <Text style={[styles.date, { color: colors.textMuted, fontSize: fonts.size.xs }]}>{formatDate(order.createdAt)}</Text>
        </View>
      </View>

      {!compact && (
        <View style={styles.addresses}>
          <View style={styles.addressRow}>
            <View style={[styles.addressIcon, { backgroundColor: '#10B98115', borderRadius: radii.sm }]}>
              <Ionicons name="location-outline" size={14} color="#10B981" />
            </View>
            <View style={styles.addressContent}>
              <Text style={[styles.addressLabel, { color: colors.textMuted, fontSize: fonts.size.xs }]}>Pickup</Text>
              <Text style={[styles.addressText, { color: colors.textPrimary, fontSize: fonts.size.sm }]}>{order.pickupAddress}</Text>
            </View>
          </View>
          <View style={styles.divider} />
          <View style={styles.addressRow}>
            <View style={[styles.addressIcon, { backgroundColor: '#EF444415', borderRadius: radii.sm }]}>
              <Ionicons name="location-outline" size={14} color="#EF4444" />
            </View>
            <View style={styles.addressContent}>
              <Text style={[styles.addressLabel, { color: colors.textMuted, fontSize: fonts.size.xs }]}>Delivery</Text>
              <Text style={[styles.addressText, { color: colors.textPrimary, fontSize: fonts.size.sm }]}>{order.deliveryAddress}</Text>
            </View>
          </View>
        </View>
      )}

      {order.driverName && (
        <View style={styles.driverInfo}>
          <View style={styles.driverRow}>
            <View style={[styles.avatar, { backgroundColor: colors.primarySoft, borderRadius: radii.pill }]}>
              <Text style={[styles.avatarText, { color: colors.primary }]}>{order.driverName.charAt(0)}</Text>
            </View>
            <View>
              <Text style={[styles.driverLabel, { color: colors.textMuted, fontSize: fonts.size.xs }]}>Driver</Text>
              <Text style={[styles.driverName, { color: colors.textPrimary, fontSize: fonts.size.sm }]}>{order.driverName}</Text>
            </View>
          </View>
          {order.vehiclePlate && (
            <View style={styles.vehicleRow}>
              <Ionicons name="car-outline" size={14} color={colors.textMuted} />
              <Text style={[styles.vehicleText, { color: colors.textSecondary, fontSize: fonts.size.xs }]}>{order.vehiclePlate}</Text>
            </View>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: { padding: 16, gap: 12 },
  cardFull: { gap: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  orderInfo: { flex: 1, gap: 4 },
  orderNumberRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  orderNumber: { fontWeight: '800' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4 },
  statusText: { fontWeight: '700', textTransform: 'capitalize' },
  customerName: { fontWeight: '500' },
  amountContainer: { alignItems: 'flex-end', gap: 2 },
  amount: { fontWeight: '800' },
  date: { fontWeight: '500' },
  addresses: { gap: 8, paddingTop: 4 },
  addressRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  addressIcon: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  addressContent: { flex: 1, gap: 2 },
  addressLabel: { fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  addressText: { fontWeight: '500' },
  divider: { height: 1, backgroundColor: '#E5E7EB', marginVertical: 4 },
  driverInfo: { paddingTop: 4, borderTopWidth: 1, borderTopColor: '#F3F4F6', gap: 8 },
  driverRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 14, fontWeight: '800' },
  driverLabel: { fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  driverName: { fontWeight: '600' },
  vehicleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 46 },
  vehicleText: { fontWeight: '500' },
});

export default OrderCard;