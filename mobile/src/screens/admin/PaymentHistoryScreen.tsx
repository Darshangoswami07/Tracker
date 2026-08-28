import { useCallback, useEffect, useState } from 'react';
import { BackHandler, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/useAppTheme';
import { useAuthStore } from '../../store/authStore';
import { api } from '../../api/client';
import { ENDPOINTS } from '../../api/endpoints';
import { orderRepository } from '../../database/repositories/orderRepository';
import type { LocalPayment } from '../../database/repositories/orderRepository';
import { Header } from '../../components/Header';
import { ShimmerCard } from '../../components/ShimmerCard';
import { EmptyState } from '../../components/EmptyState';
import { useAppNav } from '../../hooks/useAppNav';
import { useTranslation } from 'react-i18next';
import type { AppTheme } from '../../theme/types';

interface StaffDailyCard {
  id: string;
  fullName: string;
  area: string | null;
  totalCollection: number;
  totalGRs: number;
}

const formatDate = (iso: string | null): string => {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
};

const formatCurrency = (amount: number): string => {
  return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

/**
 * Standalone Payment History screen — shows all payments across all GRs with
 * summary stats (total collected, total balance, payment count).
 */
export const PaymentHistoryScreen = () => {
  const { colors, spacing, radii, fonts, shadows } = useAppTheme();
  const { t } = useTranslation();
  const { navigate, navigation } = useAppNav();
  const accessToken = useAuthStore((state) => state.accessToken);

  const handleBack = useCallback(() => {
    navigate('AdminDashboard');
  }, [navigate]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      handleBack();
      return true;
    });
    return () => subscription.remove();
  }, [handleBack]);

  const styles = createStyles({ colors, spacing, radii, fonts, shadows });

  const [allPayments, setAllPayments] = useState<(LocalPayment & { orderNumber?: string })[]>([]);
  const [filteredPayments, setFilteredPayments] = useState<(LocalPayment & { orderNumber?: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [summary, setSummary] = useState({ totalCollected: 0, totalBalance: 0, totalGRs: 0, paymentCount: 0 });
  const [staffCards, setStaffCards] = useState<StaffDailyCard[]>([]);
  const [staffLoading, setStaffLoading] = useState(true);

  // Staff Daily Work — today's collection/GR totals per approved Staff
  // member, kept separate from the overall totals above (which always cover
  // every payment regardless of who recorded it — see `getStaffDailySummary`
  // for the per-staff, per-day isolation this relies on).
  const fetchStaffDailyWork = useCallback(async () => {
    if (!accessToken) return;
    setStaffLoading(true);
    try {
      const res = await api.get(ENDPOINTS.admin.users, {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: { page: 1, pageSize: 100, role: 'staff', status: 'active' },
      });
      const items = (res.data?.data?.items ?? []) as { id: string; firstName: string; lastName: string; area: string | null }[];
      const todayIso = new Date().toISOString();
      const cards = await Promise.all(
        items.map(async (u) => {
          const daily = await orderRepository.getStaffDailySummary(u.id, todayIso);
          return {
            id: u.id,
            fullName: `${u.firstName} ${u.lastName}`.trim(),
            area: u.area ?? null,
            totalCollection: daily.totalCollection,
            totalGRs: daily.totalGRs,
          };
        })
      );
      cards.sort((a, b) => a.fullName.localeCompare(b.fullName));
      setStaffCards(cards);
    } catch {
      setStaffCards([]);
    } finally {
      setStaffLoading(false);
    }
  }, [accessToken]);

  const fetchPayments = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    if (mode === 'initial') setLoading(true);
    if (mode === 'refresh') setRefreshing(true);
    try {
      // Fetch all orders and aggregate payment data
      const allOrders = await orderRepository.list({ page: 1, pageSize: 9999 });
      const payments: (LocalPayment & { orderNumber?: string })[] = [];
      let totalCollected = 0;
      let totalBalance = 0;
      let totalGRs = 0;
      let paymentCount = 0;

      for (const order of allOrders.items) {
        const summary = await orderRepository.getPaymentSummary(order.id);
        if (summary) {
          totalCollected += summary.totalPaid;
          totalBalance += summary.balance;
          totalGRs++;
        }
        const orderPayments = await orderRepository.listPayments(order.id);
        for (const p of orderPayments) {
          payments.push({ ...p, orderNumber: order.orderNumber });
          paymentCount++;
        }
      }

      // Sort by newest first
      payments.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      setAllPayments(payments);
      setFilteredPayments(payments);
      setSummary({ totalCollected, totalBalance, totalGRs, paymentCount });
      setError(null);
    } catch (err: any) {
      setError(err?.message ?? 'Could not load payment data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchPayments('initial');
    fetchStaffDailyWork();
  }, [fetchPayments, fetchStaffDailyWork]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchPayments('refresh');
      fetchStaffDailyWork();
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!search.trim()) {
        setFilteredPayments(allPayments);
      } else {
        const q = search.toLowerCase();
        setFilteredPayments(
          allPayments.filter(
            (p) =>
              p.orderNumber?.toLowerCase().includes(q) ||
              p.notes?.toLowerCase().includes(q) ||
              p.amount.toString().includes(q)
          )
        );
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [search, allPayments]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <Header title={t('payment.paymentHistory')} leftAction={{ icon: 'chevron-back', onPress: handleBack }} />
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <ShimmerCard style={styles.shimmerBlock} height={100} />
          <ShimmerCard style={styles.shimmerBlock} height={44} />
          {[1, 2, 3, 4, 5].map((i) => (
            <ShimmerCard key={i} style={styles.shimmerBlock} height={80} />
          ))}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <Header title={t('payment.paymentHistory')} leftAction={{ icon: 'chevron-back', onPress: handleBack }} />

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchPayments('refresh')} colors={['#635BFF']} progressBackgroundColor={colors.surface} />}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {error && (
          <EmptyState
            icon="cloud-offline-outline"
            title="Could not load payments"
            subtitle={error}
            actionLabel={t('common.retry')}
            onActionPress={() => fetchPayments('initial')}
            iconColor={colors.error}
          />
        )}

        {!error && (
          <>
            {/* Summary Cards */}
            <View style={styles.summaryRow}>
              <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}>
                <Text style={[styles.summaryValue, { color: '#10B981' }]}>{formatCurrency(summary.totalCollected)}</Text>
                <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>{t('payment.totalCollected')}</Text>
              </View>
              <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}>
                <Text style={[styles.summaryValue, { color: '#F97316' }]}>{formatCurrency(summary.totalBalance)}</Text>
                <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>{t('payment.totalBalance')}</Text>
              </View>
            </View>

            <View style={styles.summaryRow}>
              <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}>
                <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>{summary.paymentCount}</Text>
                <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>{t('payment.payments')}</Text>
              </View>
              <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}>
                <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>{summary.totalGRs}</Text>
                <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>{t('summary.totalGRs')}</Text>
              </View>
            </View>

            {/* Staff Daily Work — drill-down into what each approved Staff
                member individually collected today; distinct from the
                overall totals above, which cover the whole system. */}
            {(staffLoading || staffCards.length > 0) && (
              <View style={styles.staffSection}>
                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Staff Daily Work</Text>
                {staffLoading ? (
                  <View style={styles.list}>
                    {[1, 2].map((i) => (
                      <ShimmerCard key={i} style={styles.shimmerBlock} height={90} />
                    ))}
                  </View>
                ) : (
                  <View style={styles.list}>
                    {staffCards.map((s) => (
                      <TouchableOpacity
                        key={s.id}
                        style={[styles.staffCard, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}
                        onPress={() => navigate('StaffDailyWork', { staffId: s.id, fullName: s.fullName, area: s.area })}
                        activeOpacity={0.85}
                      >
                        <View style={styles.staffCardTop}>
                          <View style={[styles.staffAvatar, { backgroundColor: `${colors.primary}15`, borderRadius: radii.pill }]}>
                            <Ionicons name="person" size={18} color={colors.primary} />
                          </View>
                          <View style={styles.staffNameBlock}>
                            <Text style={[styles.staffName, { color: colors.textPrimary }]}>{s.fullName}</Text>
                            {s.area && <Text style={[styles.staffArea, { color: colors.textMuted }]}>{s.area}</Text>}
                          </View>
                          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                        </View>
                        <Text style={[styles.staffStats, { color: colors.textSecondary }]}>
                          {formatCurrency(s.totalCollection)} Collection · {s.totalGRs} {s.totalGRs === 1 ? 'GR' : 'GRs'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            )}

            {/* Search */}
            <View style={styles.searchBar}>
              <Ionicons name="search" size={18} color={colors.textMuted} style={styles.searchIcon} />
              <TextInput
                placeholder={t('gr.searchPlaceholder')}
                value={search}
                onChangeText={setSearch}
                style={[styles.searchInput, { color: colors.textPrimary, backgroundColor: colors.surface }]}
                placeholderTextColor={colors.textMuted}
                returnKeyType="search"
              />
            </View>

            {filteredPayments.length === 0 ? (
              <EmptyState
                icon="wallet-outline"
                title="No payments yet"
                subtitle="Payments will appear here as they are recorded."
                iconColor={colors.textMuted}
              />
            ) : (
              <View style={styles.list}>
                {filteredPayments.map((p) => (
                  <View key={p.id} style={[styles.paymentCard, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}>
                    <View style={styles.paymentCardHeader}>
                      <View style={styles.paymentCardLeft}>
                        <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                        <View>
                          <Text style={[styles.paymentCardAmount, { color: colors.textPrimary }]}>{formatCurrency(p.amount)}</Text>
                          <Text style={[styles.paymentCardDate, { color: colors.textMuted }]}>{formatDate(p.createdAt)}</Text>
                        </View>
                      </View>
                      {p.orderNumber && (
                        <TouchableOpacity onPress={() => navigate('GRDetails', { orderId: p.orderId })} style={styles.grLink}>
                          <Text style={[styles.grLinkText, { color: colors.primary }]}>{p.orderNumber}</Text>
                          <Ionicons name="chevron-forward" size={14} color={colors.primary} />
                        </TouchableOpacity>
                      )}
                    </View>
                    {p.notes && (
                      <Text style={[styles.paymentCardNote, { color: colors.textMuted }]} numberOfLines={2}>{p.notes}</Text>
                    )}
                    <View style={[styles.paymentCardMeta, { borderTopColor: colors.border }]}>
                      <Text style={[styles.paymentCardMetaText, { color: colors.textMuted }]}>{p.paymentMethod ?? 'cash'}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const createStyles = (theme: Pick<AppTheme, 'colors' | 'spacing' | 'radii' | 'fonts' | 'shadows'>) =>
  StyleSheet.create({
    safe: { flex: 1 },
    scrollContent: { paddingBottom: 40, paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.md },
    shimmerBlock: { marginBottom: theme.spacing.md, borderRadius: theme.radii.lg },
    summaryRow: { flexDirection: 'row', gap: 8, marginBottom: theme.spacing.md },
    summaryCard: { flex: 1, padding: 14, alignItems: 'center', gap: 2 },
    summaryValue: { fontSize: theme.fonts.size.lg, fontWeight: '800' },
    summaryLabel: { fontSize: theme.fonts.size.xs, fontWeight: '600', textAlign: 'center' },
    staffSection: { marginBottom: theme.spacing.lg, gap: theme.spacing.sm },
    sectionTitle: { fontSize: theme.fonts.size.md, fontWeight: '800' },
    staffCard: { padding: 16, gap: 8 },
    staffCardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    staffAvatar: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    staffNameBlock: { flex: 1, gap: 1 },
    staffName: { fontSize: theme.fonts.size.md, fontWeight: '700' },
    staffArea: { fontSize: theme.fonts.size.xs, fontWeight: '600' },
    staffStats: { fontSize: theme.fonts.size.sm, fontWeight: '600' },
    searchBar: { marginBottom: theme.spacing.md, position: 'relative', justifyContent: 'center' },
    searchIcon: { position: 'absolute', left: 14, zIndex: 1 },
    searchInput: { borderRadius: theme.radii.lg, paddingHorizontal: 40, paddingVertical: 12, fontSize: theme.fonts.size.md },
    list: { gap: theme.spacing.md },
    paymentCard: { padding: 16, gap: 8 },
    paymentCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    paymentCardLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    paymentCardAmount: { fontSize: theme.fonts.size.md, fontWeight: '800' },
    paymentCardDate: { fontSize: theme.fonts.size.xs, marginTop: 1 },
    grLink: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    grLinkText: { fontSize: theme.fonts.size.sm, fontWeight: '700' },
    paymentCardNote: { fontSize: theme.fonts.size.sm, fontStyle: 'italic' },
    paymentCardMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
    paymentCardMetaText: { fontSize: theme.fonts.size.xs, fontWeight: '600', textTransform: 'capitalize' },
  });

export default PaymentHistoryScreen;
