import { useEffect, useState, useCallback } from 'react';
import { Animated, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/useAppTheme';
import { useAuthStore } from '../../store/authStore';
import { api } from '../../api/client';
import { ENDPOINTS } from '../../api/endpoints';
import { Header } from '../../components/Header';
import { OrderCard } from '../../components/OrderCard';
import { ShimmerCard } from '../../components/ShimmerCard';
import { EmptyState } from '../../components/EmptyState';
import { FilterChips } from '../../components/FilterChips';
import { useAppNav } from '../../hooks/useAppNav';

interface DeliveryOrder {
  id: string;
  orderNumber: string;
  customerName: string;
  status: string;
  amount: number;
  createdAt: string;
  pickupAddress: string;
  deliveryAddress: string;
  distance: number;
  estimatedTime: string;
  pickupLat?: number;
  pickupLng?: number;
  deliveryLat?: number;
  deliveryLng?: number;
}

export const TodayDeliveriesScreen = () => {
  const { colors, spacing, radii, fonts, shadows } = useAppTheme();
  const { goBack } = useAppNav();
  const accessToken = useAuthStore((state) => state.accessToken);

  const styles = StyleSheet.create({
    safe: { flex: 1 },
    header: { paddingTop: 8 },
    scrollContent: { paddingBottom: 40, paddingHorizontal: spacing.lg },
    ordersList: { gap: spacing.md },
    orderCardShimmer: { marginBottom: spacing.md, borderRadius: radii.lg },
  });

  const [orders, setOrders] = useState<DeliveryOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('all');
  const [fadeAnim] = useState(new Animated.Value(0));
  const [slideAnim] = useState(new Animated.Value(20));

  const fetchOrders = useCallback(async () => {
    if (!accessToken) return;
    try {
      const res = await api.get(`${ENDPOINTS.driver}/deliveries/today`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: { status: filter === 'all' ? undefined : filter },
      });
      setOrders(res.data.data.items || []);
    } catch (error) {
      console.error('Failed to fetch deliveries:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [accessToken, filter]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchOrders();
  }, [fetchOrders]);

  const onFilterChange = useCallback((newFilter: string) => {
    setFilter(newFilter);
    fetchOrders();
  }, [fetchOrders]);

  useEffect(() => {
    fetchOrders();
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: Platform.OS !== 'web' }),
    ]).start();
  }, [fetchOrders, fadeAnim, slideAnim]);

  useEffect(() => {
    fetchOrders();
  }, [filter]);

  const filters = ['all', 'assigned', 'picked_up', 'in_transit', 'delivered'];

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <Header title="Today's Deliveries" leftAction={{ icon: 'chevron-back', onPress: goBack }} />
        </View>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <FilterChips filters={filters} activeFilter={filter} onFilterChange={onFilterChange} />
          {[1,2,3].map((i) => <ShimmerCard key={i} style={styles.orderCardShimmer} height={140} />)}
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
          <Header title="Today's Deliveries" leftAction={{ icon: 'chevron-back', onPress: goBack }} />
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
          <FilterChips filters={filters} activeFilter={filter} onFilterChange={onFilterChange} />
        </Animated.View>

        {orders.length === 0 ? (
          <EmptyState
            icon="navigate-outline"
            title={filter !== 'all' ? `No ${filter.replace('_', ' ')} deliveries` : 'No deliveries today'}
            subtitle={filter !== 'all' ? 'Try a different filter' : 'Enjoy your free time!'}
            actionLabel={filter !== 'all' ? 'Show All' : undefined}
            onActionPress={() => filter !== 'all' && onFilterChange('all')}
            iconColor="#06B6D4"
          />
        ) : (
          <View style={styles.ordersList}>
            {orders.map((order) => (
              <OrderCard key={order.id} order={order} />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

export default TodayDeliveriesScreen;