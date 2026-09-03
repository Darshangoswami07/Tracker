import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/useAppTheme';
import { useAuthStore } from '../../store/authStore';
import { api } from '../../api/client';
import { ENDPOINTS } from '../../api/endpoints';
import { orderRepository } from '../../database/repositories/orderRepository';
import type { PaymentHistoryItem } from '../../database/repositories/orderRepository';
import { grRealtime } from '../../services/grRealtime';
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

  // useFocusEffect (not plain useEffect): native-stack keeps this screen
  // mounted when a screen is pushed on top of it (e.g. Staff Daily Work), so
  // an unconditional listener here would keep hijacking Android back on that
  // screen too, jumping straight to the dashboard instead of popping back to
  // Payment History. Only live while this screen is actually focused.
  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        handleBack();
        return true;
      });
      return () => subscription.remove();
    }, [handleBack])
  );

  const styles = createStyles({ colors, spacing, radii, fonts, shadows });

  const PAGE_SIZE = 30;
  const [payments, setPayments] = useState<PaymentHistoryItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [summary, setSummary] = useState({ totalCollected: 0, totalBalance: 0, totalGRs: 0, paymentCount: 0 });
  const [staffCards, setStaffCards] = useState<StaffDailyCard[]>([]);
  const [staffLoading, setStaffLoading] = useState(true);

  // Discards a slow response once a newer fetch (filter/refresh) has started.
  const reqIdRef = useRef(0);
  const inFlightRef = useRef(false);

  // Staff Daily Work — every approved Staff member's today totals in ONE
  // grouped request (`/staff/daily-summary/all`) + the staff roster; was a
  // per-staff N+1.
  const fetchStaffDailyWork = useCallback(async () => {
    if (!accessToken) return;
    setStaffLoading(true);
    try {
      const [rosterRes, totals] = await Promise.all([
        api.get(ENDPOINTS.admin.users, {
          headers: { Authorization: `Bearer ${accessToken}` },
          params: { page: 1, pageSize: 100, role: 'staff', status: 'active' },
        }),
        orderRepository.getStaffDailySummaryAll(),
      ]);
      const items = (rosterRes.data?.data?.items ?? []) as { id: string; firstName: string; lastName: string; area: string | null }[];
      const cards = items
        .map((u) => ({
          id: u.id,
          fullName: `${u.firstName} ${u.lastName}`.trim(),
          area: u.area ?? null,
          totalCollection: totals[u.id]?.totalCollection ?? 0,
          totalGRs: totals[u.id]?.totalGRs ?? 0,
        }))
        .sort((a, b) => a.fullName.localeCompare(b.fullName));
      setStaffCards(cards);
    } catch {
      setStaffCards([]);
    } finally {
      setStaffLoading(false);
    }
  }, [accessToken]);

  // ONE payment-history request per page + ONE totals request for the summary
  // cards (the same `receiving/overview` GR Details / the dashboards use).
  // No per-payment / per-order calls.
  const fetchPayments = useCallback(
    async (mode: 'initial' | 'refresh' | 'more' = 'initial', pageNum = 1) => {
      if (!accessToken) return; // never fire protected requests before auth is ready
      if (inFlightRef.current && mode === 'more') return;
      const reqId = ++reqIdRef.current;
      inFlightRef.current = true;
      if (mode === 'initial') setLoading(true);
      if (mode === 'refresh') setRefreshing(true);
      if (mode === 'more') setLoadingMore(true);
      try {
        const historyP = orderRepository.listPaymentHistory({
          page: pageNum,
          pageSize: PAGE_SIZE,
          search: search.trim() || undefined,
        });
        const overviewP = mode === 'more' ? null : orderRepository.getReceivingOverview();

        const history = await historyP;
        if (reqId !== reqIdRef.current) return; // superseded
        setPayments((prev) => (mode === 'more' ? [...prev, ...history.items] : history.items));
        setHasMore(history.items.length === PAGE_SIZE);
        setPage(pageNum);
        setError(null);

        if (overviewP) {
          try {
            const o = await overviewP;
            if (reqId === reqIdRef.current) {
              setSummary({
                totalCollected: o.totalPaid,
                totalBalance: o.outstanding,
                totalGRs: o.grCount,
                paymentCount: o.totalTransactions,
              });
            }
          } catch {
            /* keep last-good summary */
          }
        }
      } catch (err: any) {
        if (reqId === reqIdRef.current && mode !== 'more') {
          setError(err?.message ?? 'Could not load payment history');
        }
      } finally {
        if (reqId === reqIdRef.current) {
          inFlightRef.current = false;
          setLoading(false);
          setRefreshing(false);
          setLoadingMore(false);
        }
      }
    },
    [search, accessToken]
  );

  const loadMore = useCallback(() => {
    if (!inFlightRef.current && !loadingMore && hasMore) fetchPayments('more', page + 1);
  }, [fetchPayments, hasMore, loadingMore, page]);

  // Initial load — payment list + summary + (separately) staff daily work.
  // Gated on a restored session: firing protected requests before auth is
  // ready just produces 401 → refresh churn.
  const didInitialLoad = useRef(false);
  useEffect(() => {
    if (!accessToken || didInitialLoad.current) return;
    didInitialLoad.current = true;
    fetchPayments('initial', 1);
    fetchStaffDailyWork();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  // Debounced search → one page-1 fetch per settled query. Skips the first
  // render (the mount effect already loaded page 1).
  const didMountSearch = useRef(false);
  useEffect(() => {
    if (!didMountSearch.current) {
      didMountSearch.current = true;
      return;
    }
    const timer = setTimeout(() => fetchPayments('refresh', 1), 350);
    return () => clearTimeout(timer);
  }, [search, fetchPayments]);

  // Re-pull page 1 on screen focus (returning from GR Details, etc.). Skips
  // the mount-time 'focus' React Navigation fires so it doesn't double the
  // initial load.
  const didFirstFocus = useRef(false);
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      if (!didFirstFocus.current) {
        didFirstFocus.current = true;
        return;
      }
      fetchPayments('refresh', 1);
      fetchStaffDailyWork();
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation]);

  // Live: a recorded payment (or a GR status/delete) → one debounced refresh
  // of page 1 + the summary. Reuses the shared WebSocket; cleaned up on
  // unmount so listeners never accumulate across visits.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsub = grRealtime.subscribe(() => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        fetchPayments('refresh', 1);
        fetchStaffDailyWork();
      }, 400);
    });
    return () => {
      unsub();
      if (timer) clearTimeout(timer);
    };
  }, [fetchPayments, fetchStaffDailyWork]);

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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchPayments('refresh', 1)} colors={['#635BFF']} progressBackgroundColor={colors.surface} />}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        onScroll={({ nativeEvent }) => {
          const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
          if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 200) loadMore();
        }}
        scrollEventThrottle={200}
      >
        {error && (
          <EmptyState
            icon="cloud-offline-outline"
            title="Could not load payments"
            subtitle={error}
            actionLabel={t('common.retry')}
            onActionPress={() => fetchPayments('initial', 1)}
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

            {payments.length === 0 ? (
              <EmptyState
                icon="wallet-outline"
                title={search.trim() ? 'No matching payments' : 'No payments yet'}
                subtitle={search.trim() ? 'Try a different GR number or note.' : 'Payments will appear here as they are recorded.'}
                iconColor={colors.textMuted}
              />
            ) : (
              <View style={styles.list}>
                {payments.map((p) => (
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
                {loadingMore && <ShimmerCard style={styles.shimmerBlock} height={80} />}
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
