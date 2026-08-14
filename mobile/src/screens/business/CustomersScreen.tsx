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
import type { AppTheme } from '../../theme/types';

interface Customer {
  id: string;
  fullName: string;
  phone: string;
  email: string;
  address?: string;
  city?: string;
  totalOrders: number;
  totalSpent: number;
  lastOrderDate?: string;
  isActive: boolean;
  createdAt: string;
}

export const CustomersScreen = () => {
  const { colors, spacing, radii, fonts, shadows } = useAppTheme();
  const { goBack, role, navigate } = useAppNav();
  const accessToken = useAuthStore((state) => state.accessToken);

  const isEmployee = role === 'employee' || role === 'dispatcher';
  const customersBase = isEmployee ? ENDPOINTS.employee : ENDPOINTS.business;

  const styles = createStyles({ colors, spacing, radii, fonts, shadows });

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [filter, setFilter] = useState('all');
  const [fadeAnim] = useState(new Animated.Value(0));
  const [slideAnim] = useState(new Animated.Value(20));

  const fetchCustomers = useCallback(async (pageNum = 1, isRefresh = false) => {
    if (!accessToken) return;
    try {
      const res = await api.get(`${customersBase}/customers`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: { page: pageNum, pageSize: 20, status: filter === 'all' ? undefined : filter },
      });
      const newCustomers = res.data.data.items || [];
      if (isRefresh || pageNum === 1) {
        setCustomers(newCustomers);
      } else {
        setCustomers(prev => [...prev, ...newCustomers]);
      }
      setHasMore(newCustomers.length === 20);
      setPage(pageNum);
    } catch (error) {
      console.error('Failed to fetch customers:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [accessToken, filter, customersBase]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchCustomers(1, true);
  }, [fetchCustomers]);

  const loadMore = useCallback(() => {
    if (!loading && hasMore) {
      fetchCustomers(page + 1);
    }
  }, [loading, hasMore, page, fetchCustomers]);

  const openCustomer = (customerId: string) => navigate('CustomerDetails', { customerId });
  const handleAdd = () =>
    Alert.alert('Add Customer', 'New customers are usually added while creating an order. You can add a customer from the Create Order screen.');

  useEffect(() => {
    fetchCustomers();
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: Platform.OS !== 'web' }),
    ]).start();
  }, [fetchCustomers, fadeAnim, slideAnim]);

  useEffect(() => {
    fetchCustomers(1, true);
  }, [filter]);

  const filters = ['all', 'active', 'inactive'];

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <Header title="Customers" leftAction={{ icon: 'chevron-back', onPress: goBack }} rightAction={{ icon: 'person-add', onPress: handleAdd }} />
        </View>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <FilterChips filters={filters} activeFilter={filter} onFilterChange={setFilter} />
          {[1,2,3,4,5].map((i) => <ShimmerCard key={i} style={styles.customerCardShimmer} height={110} />)}
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
          <Header title="Customers" leftAction={{ icon: 'chevron-back', onPress: goBack }} rightAction={{ icon: 'person-add', onPress: handleAdd }} />
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
        onScroll={({ nativeEvent }) => {
          const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
          if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 200 && !loading && hasMore) {
            loadMore();
          }
        }}
        scrollEventThrottle={200}
      >
        <Animated.View
          style={{
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          }}
        >
          <FilterChips filters={filters} activeFilter={filter} onFilterChange={setFilter} />
        </Animated.View>

        {customers.length === 0 ? (
          <EmptyState
            icon="people-outline"
            title="No customers found"
            subtitle={filter !== 'all' ? `No ${filter} customers` : 'Add your first customer to get started'}
            actionLabel={filter !== 'all' ? 'Show All' : 'Add Customer'}
            onActionPress={() => {
                if (filter !== 'all') { setFilter('all'); return; }
                handleAdd();
              }}
            iconColor="#8B5CF6"
          />
        ) : (
          <>
            <View style={styles.customersList}>
              {customers.map((customer) => (
                <TouchableOpacity key={customer.id} style={styles.customerCard} onPress={() => openCustomer(customer.id)} activeOpacity={0.85}>
                  <View style={styles.customerHeader}>
                    <View style={[styles.avatar, { backgroundColor: '#8B5CF615', borderRadius: radii.pill }]}>
                      <Text style={[styles.avatarText, { color: '#8B5CF6' }]}>{customer.fullName.charAt(0)}</Text>
                    </View>
                    <View style={styles.customerMainInfo}>
                      <View style={styles.customerTopRow}>
                        <Text style={[styles.customerName, { color: colors.textPrimary }]}>{customer.fullName}</Text>
                        <StatusBadge status={customer.isActive ? 'active' : 'inactive'} size="sm" />
                      </View>
                      <Text style={[styles.customerPhone, { color: colors.textSecondary }]}>{customer.phone}</Text>
                      <Text style={[styles.customerEmail, { color: colors.textMuted }]}>{customer.email}</Text>
                    </View>
                  </View>

                  <View style={styles.customerDetails}>
                    <View style={styles.detailItem}>
                      <Ionicons name="cube-outline" size={18} color="#635BFF" />
                      <View>
                        <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Total Orders</Text>
                        <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{customer.totalOrders}</Text>
                      </View>
                    </View>
                    <View style={styles.detailItem}>
                      <Ionicons name="cash-outline" size={18} color="#10B981" />
                      <View>
                        <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Total Spent</Text>
                        <Text style={[styles.detailValue, { color: colors.textPrimary }]}>₹{customer.totalSpent.toLocaleString()}</Text>
                      </View>
                    </View>
                    <View style={styles.detailItem}>
                      <Ionicons name="calendar-outline" size={18} color="#F97316" />
                      <View>
                        <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Last Order</Text>
                        <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{customer.lastOrderDate ? customer.lastOrderDate.split('T')[0] : 'Never'}</Text>
                      </View>
                    </View>
                    <View style={styles.detailItem}>
                      <Ionicons name="location-outline" size={18} color="#06B6D4" />
                      <View>
                        <Text style={[styles.detailLabel, { color: colors.textMuted }]}>City</Text>
                        <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{customer.city || 'N/A'}</Text>
                      </View>
                    </View>
                  </View>

                  <View style={styles.customerActions}>
                    <TouchableOpacity style={styles.actionBtn} onPress={() => Linking.openURL(`tel:${customer.phone}`)}>
                      <Ionicons name="call" size={18} color="#10B981" />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionBtn} onPress={() => Linking.openURL(`sms:${customer.phone}`).catch(() => {})}>
                      <Ionicons name="chatbubble" size={18} color="#3B82F6" />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionBtn} onPress={() => openCustomer(customer.id)}>
                      <Ionicons name="document-text" size={18} color="#635BFF" />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionBtn} onPress={() => openCustomer(customer.id)}>
                      <Ionicons name="settings" size={18} color="#6B7280" />
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
            {hasMore && <View style={styles.loadMore}><Text style={styles.loadMoreText}>Load more customers...</Text></View>}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const createStyles = (theme: Pick<AppTheme, 'colors' | 'spacing' | 'radii' | 'fonts' | 'shadows'>) =>
  StyleSheet.create({
    safe: { flex: 1 },
    header: { paddingTop: 8 },
    scrollContent: { paddingBottom: 40, paddingHorizontal: theme.spacing.lg },
    customersList: { gap: theme.spacing.md },
    customerCard: { backgroundColor: theme.colors.surface, borderRadius: theme.radii.xl, padding: 16, ...theme.shadows.md },
    customerCardShimmer: { marginBottom: theme.spacing.md, borderRadius: theme.radii.xl },
    customerHeader: { flexDirection: 'row', gap: 12, marginBottom: 12 },
    avatar: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
    avatarText: { fontSize: 20, fontWeight: '800' },
    customerMainInfo: { flex: 1, gap: 4 },
    customerTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    customerName: { fontSize: theme.fonts.size.lg, fontWeight: '800' },
    customerPhone: { fontSize: theme.fonts.size.md, fontWeight: '600' },
    customerEmail: { fontSize: theme.fonts.size.sm, fontWeight: '500' },
    customerDetails: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F3F4F6', gap: 16 },
    detailItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    detailLabel: { fontSize: theme.fonts.size.xs, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
    detailValue: { fontSize: theme.fonts.size.sm, fontWeight: '700' },
    customerActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F3F4F6' },
    actionBtn: { width: 40, height: 40, borderRadius: theme.radii.md, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F3F4F6' },
    loadMore: { paddingVertical: theme.spacing.lg, alignItems: 'center' },
    loadMoreText: { color: '#635BFF', fontWeight: '600' },
  });

export default CustomersScreen;