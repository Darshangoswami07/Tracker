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
import { useAppNav } from '../../hooks/useAppNav';

type IconName = ComponentProps<typeof Ionicons>['name'];

interface PaymentMethod {
  id: string;
  type: 'card' | 'upi' | 'wallet' | 'netbanking';
  cardBrand?: string;
  cardLast4?: string;
  cardExpiry?: string;
  upiId?: string;
  walletName?: string;
  isDefault: boolean;
  isVerified: boolean;
}

export const PaymentMethodsScreen = () => {
  const { colors, spacing, radii, fonts, shadows } = useAppTheme();
  const { goBack } = useAppNav();
  const styles = StyleSheet.create({
    safe: { flex: 1 },
    header: { paddingTop: 8 },
    scrollContent: { paddingBottom: 100, paddingHorizontal: spacing.lg },
    methodsList: { gap: spacing.md },
    methodCard: { backgroundColor: colors.surface, borderRadius: radii.xl, padding: 16, ...shadows.md },
    methodCardShimmer: { marginBottom: spacing.md, borderRadius: radii.xl },
    methodHeader: { flexDirection: 'row', gap: 12 },
    methodIcon: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    methodMainInfo: { flex: 1, gap: 4 },
    methodTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    methodType: { fontSize: fonts.size.md, fontWeight: '800' },
    defaultBadge: { fontSize: fonts.size.xs, fontWeight: '700', color: '#10B981', backgroundColor: '#10B98115', paddingHorizontal: 8, paddingVertical: 2, borderRadius: radii.pill },
    methodDetail: { fontSize: fonts.size.sm, fontWeight: '500' },
    methodActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    defaultIndicator: { padding: 8 },
    setDefaultBtn: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#635BFF15', borderRadius: radii.md },
    setDefaultText: { color: '#635BFF', fontWeight: '700', fontSize: fonts.size.xs },
    deleteBtn: { width: 36, height: 36, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FEF2F2' },
    methodStatus: { paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F3F4F6', marginTop: 12 },
    statusItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    statusDot: { width: 8, height: 8, borderRadius: 4 },
  });
  const accessToken = useAuthStore((state) => state.accessToken);

  const handleAdd = () => Alert.alert('Add Payment Method', 'Adding a payment method is supported at checkout.');
  const openMethod = (method: PaymentMethod) => Alert.alert('Payment Method', `${method.type === 'card' ? (method.cardBrand || 'Card') + ' ending in ' + method.cardLast4 : method.type === 'upi' ? method.upiId : method.walletName || method.type}${method.isDefault ? '\n\nDefault method' : ''}`);

  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fadeAnim] = useState(new Animated.Value(0));
  const [slideAnim] = useState(new Animated.Value(20));

  const fetchMethods = useCallback(async () => {
    if (!accessToken) return;
    try {
      const res = await api.get(`${ENDPOINTS.customer}/payment-methods`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      setMethods(res.data.data.items || []);
    } catch (error) {
      console.error('Failed to fetch payment methods:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [accessToken]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchMethods();
  }, [fetchMethods]);

  const deleteMethod = async (id: string) => {
    Alert.alert('Remove Payment Method', 'Are you sure you want to remove this payment method?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        try {
          await api.delete(`${ENDPOINTS.customer}/payment-methods/${id}`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          Alert.alert('Success', 'Payment method removed');
          fetchMethods();
        } catch (error) {
          console.error('Failed to remove payment method:', error);
          Alert.alert('Error', 'Failed to remove payment method');
        }
      }},
    ]);
  };

  const setDefault = async (id: string) => {
    try {
      await api.post(`${ENDPOINTS.customer}/payment-methods/${id}/default`, {}, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      fetchMethods();
    } catch (error) {
      console.error('Failed to set default:', error);
      Alert.alert('Error', 'Failed to set default payment method');
    }
  };

  useEffect(() => {
    fetchMethods();
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: Platform.OS !== 'web' }),
    ]).start();
  }, [fetchMethods, fadeAnim, slideAnim]);

  const getTypeConfig = (type: string): { icon: IconName; color: string; label: string } => {
    switch (type) {
      case 'card': return { icon: 'card-outline', color: '#635BFF', label: 'Credit/Debit Card' };
      case 'upi': return { icon: 'cash-outline', color: '#10B981', label: 'UPI' };
      case 'wallet': return { icon: 'wallet-outline', color: '#8B5CF6', label: 'Wallet' };
      case 'netbanking': return { icon: 'business-outline', color: '#06B6D4', label: 'Net Banking' };
      default: return { icon: 'card-outline', color: colors.textMuted, label: type };
    }
  };

  const getCardBrandIcon = (brand?: string) => {
    switch (brand?.toLowerCase()) {
      case 'visa': return 'card-outline';
      case 'mastercard': return 'card-outline';
      case 'rupay': return 'card-outline';
      default: return 'card-outline';
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <Header title="Payment Methods" leftAction={{ icon: 'chevron-back', onPress: goBack }} rightAction={{ icon: 'add', onPress: handleAdd }} />
        </View>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {[1,2,3].map((i) => <ShimmerCard key={i} style={styles.methodCardShimmer} height={100} />)}
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
          <Header title="Payment Methods" leftAction={{ icon: 'chevron-back', onPress: goBack }} rightAction={{ icon: 'add', onPress: handleAdd }} />
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
          {methods.length === 0 ? (
            <EmptyState
              icon="card-outline"
              title="No payment methods"
              subtitle="Add a payment method for faster checkout"
              actionLabel="Add Payment Method"
              onActionPress={handleAdd}
              iconColor="#635BFF"
            />
          ) : (
            <View style={styles.methodsList}>
              {methods.map((method) => {
                const config = getTypeConfig(method.type);
                return (
                  <TouchableOpacity key={method.id} style={styles.methodCard} onPress={() => openMethod(method)} activeOpacity={0.85}>
                    <View style={styles.methodHeader}>
                      <View style={[styles.methodIcon, { backgroundColor: `${config.color}15`, borderRadius: radii.md }]}>
                        <Ionicons name={config.icon} size={24} color={config.color} />
                      </View>
                      <View style={styles.methodMainInfo}>
                        <View style={styles.methodTopRow}>
                          <Text style={[styles.methodType, { color: colors.textPrimary }]}>{config.label}</Text>
                          {method.isDefault && <Text style={styles.defaultBadge}>Default</Text>}
                        </View>
                        {method.type === 'card' && method.cardBrand && (
                          <Text style={[styles.methodDetail, { color: colors.textSecondary }]}>{method.cardBrand} ending in {method.cardLast4}</Text>
                        )}
                        {method.type === 'upi' && method.upiId && (
                          <Text style={[styles.methodDetail, { color: colors.textSecondary }]}>{method.upiId}</Text>
                        )}
                        {method.type === 'wallet' && method.walletName && (
                          <Text style={[styles.methodDetail, { color: colors.textSecondary }]}>{method.walletName}</Text>
                        )}
                        {method.type === 'card' && method.cardExpiry && (
                          <Text style={[styles.methodDetail, { color: colors.textMuted }]}>Expires {method.cardExpiry}</Text>
                        )}
                      </View>
                      <View style={styles.methodActions}>
                        {method.isDefault ? (
                          <View style={styles.defaultIndicator}>
                            <Ionicons name="checkmark-circle" size={22} color="#10B981" />
                          </View>
                        ) : (
                          <TouchableOpacity style={styles.setDefaultBtn} onPress={() => setDefault(method.id)}>
                            <Text style={styles.setDefaultText}>Set Default</Text>
                          </TouchableOpacity>
                        )}
                        <TouchableOpacity style={styles.deleteBtn} onPress={() => deleteMethod(method.id)}>
                          <Ionicons name="trash" size={20} color="#EF4444" />
                        </TouchableOpacity>
                      </View>
                    </View>
                    <View style={styles.methodStatus}>
                      <View style={styles.statusItem}>
                        <View style={[styles.statusDot, { backgroundColor: method.isVerified ? '#10B981' : '#F59E0B' }]} />
                        <Text style={{ color: colors.textSecondary, fontSize: fonts.size.xs }}>
                          {method.isVerified ? 'Verified' : 'Pending Verification'}
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </Animated.View>
      </ScrollView>

      <ActionButton
        icon="add"
        onPress={handleAdd}
        label="Add Payment Method"
      />
    </SafeAreaView>
  );
};

export default PaymentMethodsScreen;