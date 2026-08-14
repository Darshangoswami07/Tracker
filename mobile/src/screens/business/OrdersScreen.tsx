import { useEffect, useState, useCallback } from 'react';
import { Animated, Alert, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/useAppTheme';
import { useAppNav } from '../../hooks/useAppNav';
import { useAuthStore } from '../../store/authStore';
import { formatCurrency } from '../../utils/format';
import { api } from '../../api/client';
import { ENDPOINTS } from '../../api/endpoints';
import { OrderCard } from '../../components/OrderCard';
import { Header } from '../../components/Header';
import { ShimmerCard } from '../../components/ShimmerCard';
import { FloatingActionButton } from '../../components/FloatingActionButton';
import { FilterChips } from '../../components/FilterChips';
import { EmptyState } from '../../components/EmptyState';

interface Order {
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
}

export const OrdersScreen = () => {
  const { colors, spacing, radii, fonts, shadows } = useAppTheme();
  const accessToken = useAuthStore((state) => state.accessToken);
  const { role, goBack, navigate } = useAppNav();

  const styles = StyleSheet.create({
    safe: { flex: 1 },
    header: { paddingTop: 8 },
    scrollContent: { paddingBottom: 100, paddingHorizontal: spacing.lg },
    ordersList: { gap: spacing.md },
    orderCardShimmer: { marginBottom: spacing.md, borderRadius: radii.lg },
    loadMore: { paddingVertical: spacing.lg, alignItems: 'center' },
    loadMoreText: { color: '#635BFF', fontWeight: '600' },
  });

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [filter, setFilter] = useState('all');
  const [fadeAnim] = useState(new Animated.Value(0));
  const [slideAnim] = useState(new Animated.Value(20));
  const ordersBase = role === 'employee' || role === 'dispatcher' ? ENDPOINTS.employee : ENDPOINTS.business;

  const fetchOrders = useCallback(async (pageNum = 1, isRefresh = false) => {
    if (!accessToken) return;
    try {
      const res = await api.get(`${ordersBase}/orders`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: { page: pageNum, pageSize: 20, status: filter === 'all' ? undefined : filter },
      });
      const newOrders = res.data.data.items || [];
      if (isRefresh || pageNum === 1) {
        setOrders(newOrders);
      } else {
        setOrders(prev => [...prev, ...newOrders]);
      }
      setHasMore(newOrders.length === 20);
      setPage(pageNum);
    } catch (error) {
      console.error('Failed to fetch orders:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [accessToken, filter, ordersBase]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchOrders(1, true);
  }, [fetchOrders]);

  const onFilterChange = useCallback((newFilter: string) => {
    setFilter(newFilter);
    fetchOrders(1, true);
  }, [fetchOrders]);

  const loadMore = useCallback(() => {
    if (!loading && hasMore) {
      fetchOrders(page + 1);
    }
  }, [loading, hasMore, page, fetchOrders]);

  const handleNewOrder = useCallback(() => {
    if (role === 'employee' || role === 'dispatcher') {
      Alert.alert('Create Order', 'Orders are created from the business dashboard.');
      return;
    }
    navigate('CreateOrder');
  }, [navigate, role]);

  useEffect(() => {
    fetchOrders();
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: Platform.OS !== 'web' }),
    ]).start();
  }, [fetchOrders, fadeAnim, slideAnim]);

  useEffect(() => {
    fetchOrders(1, true);
  }, [filter]);

  const filters = ['all', 'pending', 'assigned', 'picked_up', 'in_transit', 'delivered', 'cancelled'];

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <Header title="Orders" leftAction={{ icon: 'chevron-back', onPress: goBack }} />
        </View>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <FilterChips filters={filters} activeFilter={filter} onFilterChange={onFilterChange} />
          {[1,2,3,4,5].map((i) => <ShimmerCard key={i} style={styles.orderCardShimmer} height={120} />)}
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
          <Header title="Orders" leftAction={{ icon: 'chevron-back', onPress: goBack }} />
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
          <Animated.View
            style={{
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            }}
          >
            <EmptyState
              icon="document-text-outline"
              title="No orders found"
              subtitle={filter !== 'all' ? `No ${filter.replace('_', ' ')} orders` : 'Create your first order to get started'}
              actionLabel={filter !== 'all' ? 'Clear Filter' : 'Create Order'}
              onActionPress={() => { if (filter !== 'all') { onFilterChange('all'); } else { handleNewOrder(); } }}
            />
          </Animated.View>
        ) : (
          <Animated.View
            style={{
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            }}
          >
<View style={styles.ordersList}>
                {orders.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    onPress={() => navigate('OrderDetails', { orderId: order.id })}
                  />
                ))}
              </View>
            {hasMore && (
              <View style={styles.loadMore}>
                <Text style={styles.loadMoreText}>Load more orders...</Text>
              </View>
            )}
          </Animated.View>
        )}
      </ScrollView>

      <FloatingActionButton icon="add" onPress={handleNewOrder} label="New Order" />
    </SafeAreaView>
  );
};

export default OrdersScreen;