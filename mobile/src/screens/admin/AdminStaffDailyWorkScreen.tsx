import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/useAppTheme';
import { Header } from '../../components/Header';
import { ShimmerCard } from '../../components/ShimmerCard';
import { EmptyState } from '../../components/EmptyState';
import { StatusBadge } from '../../components/StatusBadge';
import { useAppNav } from '../../hooks/useAppNav';
import { orderRepository, type StaffDailyGR } from '../../database/repositories/orderRepository';
import type { AppTheme } from '../../theme/types';

const formatCurrency = (amount: number): string =>
  `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const isSameDay = (a: Date, b: Date): boolean =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const formatDay = (d: Date): string => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

const addDays = (d: Date, delta: number): Date => {
  const next = new Date(d);
  next.setDate(next.getDate() + delta);
  return next;
};

/**
 * Payment History → Staff Daily Work → one staff member's collections and
 * GRs for a selected day (defaults to today). Reads only `orders`/`payments`
 * filtered by `payments.recordedBy = staffId` — never the whole shop/area's
 * totals — so one staff member's numbers never blend with another's (or
 * with unattributed collections).
 */
export const AdminStaffDailyWorkScreen = ({ route }: any) => {
  const { staffId, fullName, area } = route.params as { staffId: string; fullName: string; area: string | null };
  const { colors, spacing, radii, fonts, shadows } = useAppTheme();
  const { navigate } = useAppNav();

  const styles = createStyles({ colors, spacing, radii, fonts, shadows });

  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState({ totalCollection: 0, totalGRs: 0 });
  const [grs, setGrs] = useState<StaffDailyGR[]>([]);

  const load = useCallback(async (date: Date) => {
    setLoading(true);
    try {
      const iso = date.toISOString();
      const [dailySummary, dailyGRs] = await Promise.all([
        orderRepository.getStaffDailySummary(staffId, iso),
        orderRepository.getStaffDailyGRs(staffId, iso),
      ]);
      setSummary(dailySummary);
      setGrs(dailyGRs);
    } finally {
      setLoading(false);
    }
  }, [staffId]);

  useEffect(() => {
    load(selectedDate);
  }, [load, selectedDate]);

  const today = new Date();
  const onToday = isSameDay(selectedDate, today);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <Header title={`${fullName}${area ? ` — ${area}` : ''}`} leftAction={{ icon: 'chevron-back', onPress: () => navigate('PaymentHistory') }} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={[styles.dateRow, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}>
          <TouchableOpacity onPress={() => setSelectedDate((d) => addDays(d, -1))} hitSlop={8}>
            <Ionicons name="chevron-back" size={20} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.dateText, { color: colors.textPrimary }]}>{formatDay(selectedDate)}</Text>
          <TouchableOpacity onPress={() => setSelectedDate((d) => addDays(d, 1))} hitSlop={8} disabled={onToday}>
            <Ionicons name="chevron-forward" size={20} color={onToday ? colors.textMuted : colors.textPrimary} />
          </TouchableOpacity>
        </View>
        {!onToday && (
          <TouchableOpacity style={styles.todayLink} onPress={() => setSelectedDate(new Date())}>
            <Text style={[styles.todayLinkText, { color: colors.primary }]}>Jump to Today</Text>
          </TouchableOpacity>
        )}

        {loading ? (
          <View style={styles.summaryRow}>
            <ShimmerCard style={styles.shimmerCard} height={80} />
            <ShimmerCard style={styles.shimmerCard} height={80} />
          </View>
        ) : (
          <View style={styles.summaryRow}>
            <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}>
              <Text style={[styles.summaryValue, { color: '#10B981' }]}>{formatCurrency(summary.totalCollection)}</Text>
              <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>Total Collection</Text>
            </View>
            <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}>
              <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>{summary.totalGRs}</Text>
              <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>Total GRs</Text>
            </View>
          </View>
        )}

        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{onToday ? "Today's Work" : 'Work'}</Text>

        {loading ? (
          <View style={styles.list}>
            {[1, 2, 3].map((i) => (
              <ShimmerCard key={i} style={styles.shimmerBlock} height={90} />
            ))}
          </View>
        ) : grs.length === 0 ? (
          <EmptyState
            icon="wallet-outline"
            title="No collections"
            subtitle={`No GRs were collected by ${fullName} on ${formatDay(selectedDate)}.`}
            iconColor={colors.textMuted}
          />
        ) : (
          <View style={styles.list}>
            {grs.map((gr) => (
              <TouchableOpacity
                key={gr.orderId}
                style={[styles.card, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}
                onPress={() => navigate('GRDetails', { orderId: gr.orderId })}
                activeOpacity={0.85}
              >
                <View style={styles.cardHeader}>
                  <Text style={[styles.grNo, { color: colors.textPrimary }]}>{gr.orderNumber}</Text>
                  <StatusBadge status={gr.status} size="sm" />
                </View>
                <Text style={[styles.partyLine, { color: colors.textSecondary }]}>
                  {gr.consignorName || '—'} <Text style={{ color: colors.textMuted }}>→</Text> {gr.consigneeName || '—'}
                </Text>
                <Text style={[styles.amount, { color: '#10B981' }]}>{formatCurrency(gr.amountCollected)} Collected</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const createStyles = (theme: Pick<AppTheme, 'colors' | 'spacing' | 'radii' | 'fonts' | 'shadows'>) =>
  StyleSheet.create({
    safe: { flex: 1 },
    scrollContent: { paddingBottom: 40, paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.md, gap: theme.spacing.md },
    dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
    dateText: { fontSize: theme.fonts.size.md, fontWeight: '700' },
    todayLink: { alignItems: 'center', marginTop: -theme.spacing.sm },
    todayLinkText: { fontSize: theme.fonts.size.sm, fontWeight: '700' },
    summaryRow: { flexDirection: 'row', gap: 8 },
    summaryCard: { flex: 1, padding: 14, alignItems: 'center', gap: 2 },
    shimmerCard: { flex: 1, borderRadius: theme.radii.lg },
    summaryValue: { fontSize: theme.fonts.size.lg, fontWeight: '800' },
    summaryLabel: { fontSize: theme.fonts.size.xs, fontWeight: '600', textAlign: 'center' },
    sectionTitle: { fontSize: theme.fonts.size.md, fontWeight: '800' },
    shimmerBlock: { borderRadius: theme.radii.lg },
    list: { gap: theme.spacing.sm },
    card: { padding: 16, gap: 6 },
    cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    grNo: { fontSize: theme.fonts.size.md, fontWeight: '800' },
    partyLine: { fontSize: theme.fonts.size.sm, fontWeight: '600' },
    amount: { fontSize: theme.fonts.size.sm, fontWeight: '800' },
  });

export default AdminStaffDailyWorkScreen;
