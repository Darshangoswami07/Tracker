import { useEffect, useState, useCallback } from 'react';
import { Animated, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/useAppTheme';
import { useAuthStore } from '../../store/authStore';
import { api } from '../../api/client';
import { ENDPOINTS } from '../../api/endpoints';
import { Header } from '../../components/Header';
import { ShimmerCard } from '../../components/ShimmerCard';
import { EmptyState } from '../../components/EmptyState';
import { FilterChips } from '../../components/FilterChips';
import { StatusBadge } from '../../components/StatusBadge';
import { formatCurrency, formatDateTime } from '../../utils/format';
import { useAppNav } from '../../hooks/useAppNav';

interface Order {
  id: string;
  orderNumber: string;
  status: string;
  amount: number;
  createdAt: string;
  updatedAt: string;
  pickupAddress: string;
  deliveryAddress: string;
  driverName?: string;
  driverPhone?: string;
  vehiclePlate?: string;
  orderType: string;
  priority: string;
  distance: number;
}

const TRACKABLE = new Set(['pending', 'assigned', 'picked_up', 'in_transit', 'out_for_delivery']);

export const MyOrdersScreen = () => {
  const { colors, spacing, radii, fonts, shadows } = useAppTheme();
  const { goBack, navigate } = useAppNav();
  const [showFilter, setShowFilter] = useState(true);
  const styles = StyleSheet.create({
    safe: { flex: 1 },
    header: { paddingTop: 8 },
    scrollContent: { paddingBottom: 40, paddingHorizontal: spacing.lg },
    ordersList: { gap: spacing.md },
    orderCard: { backgroundColor: colors.surface, borderRadius: radii.xl, padding: 16, ...shadows.md },
    orderCardShimmer: { marginBottom: spacing.md, borderRadius: radii.lg },
    orderHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
    orderLeft: { gap: 4 },
    orderNumber: { fontSize: fonts.size.md, fontWeight: '800' },
    orderType: { fontSize: fonts.size.xs, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
    orderRoute: { gap: 8, marginBottom: 12, paddingLeft: 16 },
    routeItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
    routeDot: { width: 8, height: 8, borderRadius: 4, marginTop: 2, flexShrink: 0 },
    orderFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F3F4F6' },
    orderMeta: { gap: 4 },
    orderRight: { flexDirection: 'row', alignItems: 'center', gap: 16 },
    orderAmount: { fontSize: fonts.size.lg, fontWeight: '800' },
    driverInfo: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    trackBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, marginTop: 12, alignSelf: 'flex-start' },
    trackBtnText: { fontSize: fonts.size.sm, fontWeight: '700' },
    loadMore: { paddingVertical: spacing.lg, alignItems: 'center' },
    loadMoreText: { color: '#635BFF', fontWeight: '600' },
  });
  const accessToken = useAuthStore((state) => state.accessToken);

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [filter, setFilter] = useState('all');
  const [fadeAnim] = useState(new Animated.Value(0));
  const [slideAnim] = useState(new Animated.Value(20));

  const fetchOrders = useCallback(async (pageNum = 1, isRefresh = false) => {
    if (!accessToken) return;
    try {
      const res = await api.get(`${ENDPOINTS.customer}/orders`, {
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
  }, [accessToken, filter]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchOrders(1, true);
  }, [fetchOrders]);

  const loadMore = useCallback(() => {
    if (!loading && hasMore) {
      fetchOrders(page + 1);
    }
  }, [loading, hasMore, page, fetchOrders]);

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
          <Header title="My Orders" leftAction={{ icon: 'chevron-back', onPress: goBack }} rightAction={{ icon: 'filter', onPress: () => setShowFilter(!showFilter) }} />
        </View>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <FilterChips filters={filters} activeFilter={filter} onFilterChange={setFilter} />
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
          <Header title="My Orders" leftAction={{ icon: 'chevron-back', onPress: goBack }} rightAction={{ icon: 'filter', onPress: () => setShowFilter(!showFilter) }} />
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
          {showFilter && <FilterChips filters={filters} activeFilter={filter} onFilterChange={setFilter} />}
        </Animated.View>

        {orders.length === 0 ? (
          <EmptyState
            icon="document-text-outline"
            title="No orders found"
            subtitle={filter !== 'all' ? `No ${filter.replace('_', ' ')} orders` : 'Create your first order to get started'}
            actionLabel={filter !== 'all' ? 'Clear Filter' : 'Create Order'}
            onActionPress={() => filter !== 'all' ? setFilter('all') : navigate('CreateOrder')}
            iconColor="#635BFF"
          />
        ) : (
          <>
            <View style={styles.ordersList}>
              {orders.map((order) => (
                <TouchableOpacity key={order.id} style={styles.orderCard} onPress={() => navigate('OrderDetails', { orderId: order.id })} activeOpacity={0.85}>
                  <View style={styles.orderHeader}>
                    <View style={styles.orderLeft}>
                      <Text style={[styles.orderNumber, { color: colors.textPrimary }]}>{order.orderNumber}</Text>
                      <Text style={[styles.orderType, { color: colors.textSecondary }]}>{order.orderType} • {order.priority}</Text>
                    </View>
                    <StatusBadge status={order.status} size="sm" />
                  </View>
                  <View style={styles.orderRoute}>
                    <View style={styles.routeItem}>
                      <View style={[styles.routeDot, { backgroundColor: '#10B981' }]} />
                      <Text style={{ color: colors.textSecondary, fontSize: fonts.size.sm }}>{order.pickupAddress}</Text>
                    </View>
                    <View style={styles.routeItem}>
                      <View style={[styles.routeDot, { backgroundColor: '#EF4444' }]} />
                      <Text style={{ color: colors.textSecondary, fontSize: fonts.size.sm }}>{order.deliveryAddress}</Text>
                    </View>
                  </View>
                  <View style={styles.orderFooter}>
                    <View style={styles.orderMeta}>
                      <Text style={{ color: colors.textMuted, fontSize: fonts.size.xs }}>{formatDateTime(order.createdAt)}</Text>
                      <Text style={{ color: colors.textMuted, fontSize: fonts.size.xs }}>{order.distance.toFixed(1)} km</Text>
                    </View>
                    <View style={styles.orderRight}>
                      <Text style={[styles.orderAmount, { color: colors.textPrimary }]}>₹{formatCurrency(order.amount)}</Text>
                      {order.driverName && (
                        <View style={styles.driverInfo}>
                          <Ionicons name="person-outline" size={14} color={colors.textMuted} />
                          <Text style={{ color: colors.textSecondary, fontSize: fonts.size.xs }}>{order.driverName}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                  {TRACKABLE.has(order.status.toLowerCase()) && (
                    <TouchableOpacity
                      style={[styles.trackBtn, { backgroundColor: colors.primarySoft, borderRadius: radii.pill }]}
                      onPress={() => navigate('CustomerTracking', { grNumber: order.orderNumber })}
                      activeOpacity={0.8}
                      accessibilityRole="button"
                      accessibilityLabel={`Track shipment ${order.orderNumber}`}
                    >
                      <Ionicons name="navigate-outline" size={14} color={colors.primary} />
                      <Text style={[styles.trackBtnText, { color: colors.primary }]}>Track</Text>
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
              ))}
            </View>
            {hasMore && <View style={styles.loadMore}><Text style={styles.loadMoreText}>Load more orders...</Text></View>}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

export default MyOrdersScreen;