import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/useAppTheme';
import { Header } from '../../components/Header';
import { ShimmerCard } from '../../components/ShimmerCard';
import { EmptyState } from '../../components/EmptyState';
import { StatusBadge } from '../../components/StatusBadge';
import { useAppNav } from '../../hooks/useAppNav';
import {
  orderRepository,
  type StaffDailyActivity,
  type StaffActivityEvent,
} from '../../database/repositories/orderRepository';
import { grRealtime } from '../../services/grRealtime';
import { useRecentDays } from '../../hooks/useRecentDays';
import type { AppTheme } from '../../theme/types';

/** `YYYY-MM-DD` in local time — the stable per-day cache/query key. */
const dayKey = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Small in-memory cache so stepping Today⇄Yesterday⇄… reuses already-loaded
 * days instantly (no skeleton, no refetch) within a session. Keyed by
 * `staffId|day`. A realtime GR/payment/status event clears it. */
const workCache = new Map<string, StaffDailyActivity>();
/** When each cached day was last fetched — used to skip a redundant network
 * revalidation when the same day is re-selected within a short window. */
const workCacheAt = new Map<string, number>();
/** How long a cached day is considered fresh enough to skip revalidation. */
const REVALIDATE_TTL_MS = 30_000;

const formatCurrency = (amount: number): string =>
  `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const isSameDay = (a: Date, b: Date): boolean =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const formatDay = (d: Date): string => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const formatDayShort = (d: Date): string => d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
const formatTime = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
};

const addDays = (d: Date, delta: number): Date => {
  const next = new Date(d);
  next.setDate(next.getDate() + delta);
  return next;
};

const EVENT_CONFIG: Record<StaffActivityEvent['kind'], { icon: keyof typeof Ionicons.glyphMap; color: string; label: string }> = {
  collected: { icon: 'checkmark-circle', color: '#3B82F6', label: 'GR Collected' },
  delivered: { icon: 'checkmark-done-circle', color: '#10B981', label: 'GR Delivered' },
  payment: { icon: 'cash', color: '#F59E0B', label: 'Payment Collected' },
};

type LoadStatus = 'loading' | 'success' | 'error';

/**
 * All Staff → tap a staff card → Staff Work: one staff member's actual work
 * (GRs collected/delivered, payments collected) for a selected day, derived
 * entirely from `orders` / `order_status_history` / `payments` — see
 * `orderRepository.getStaffDailyActivity` for the exact attribution rules
 * (GR work by `assignedStaffId`, payments by `recordedBy`, delivery time
 * from the status-history row, not a separate activity table).
 */
export const AdminStaffDailyWorkScreen = ({ route }: any) => {
  const { staffId, fullName, area, status: staffStatus } = route.params as {
    staffId: string;
    fullName: string;
    area: string | null;
    status?: string;
  };
  const { colors, spacing, radii, fonts, shadows } = useAppTheme();
  const { navigate, goBack } = useAppNav();

  const styles = createStyles({ colors, spacing, radii, fonts, shadows });

  // `today` / `recentDays` are always anchored to the real current calendar
  // date (self-refreshing across midnight), NEVER to `selectedDate`.
  const { today, recentDays, refresh: refreshToday } = useRecentDays();
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [loadStatus, setLoadStatus] = useState<LoadStatus>('loading');
  const [activity, setActivity] = useState<StaffDailyActivity | null>(null);
  const [dateSheetOpen, setDateSheetOpen] = useState(false);

  /** Step one day. Forward is clamped so navigation can never move past
   * today; backward is unbounded (older history stays reachable). */
  const stepDay = useCallback(
    (delta: number) =>
      setSelectedDate((d) => {
        const next = addDays(d, delta);
        return dayKey(next) > dayKey(today) ? d : next;
      }),
    [today],
  );

  const reqIdRef = useRef(0);
  const selectedDateRef = useRef(selectedDate);
  useEffect(() => {
    selectedDateRef.current = selectedDate;
  }, [selectedDate]);

  const load = useCallback(async (date: Date, opts: { force?: boolean } = {}) => {
    const key = `${staffId}|${dayKey(date)}`;
    const cached = workCache.get(key);

    // Fresh cache hit → paint it and skip the network entirely. Re-selecting
    // the same day (Today⇄Yesterday⇄…) within the TTL costs zero requests.
    if (cached && !opts.force && Date.now() - (workCacheAt.get(key) ?? 0) < REVALIDATE_TTL_MS) {
      // Still bump the request id so any in-flight older request can't land
      // on top of this day's data.
      reqIdRef.current += 1;
      setActivity(cached);
      setLoadStatus('success');
      return;
    }

    if (cached && !opts.force) {
      // Stale cache: instant paint, then revalidate quietly in the background
      // so numbers stay live without a skeleton flash.
      setActivity(cached);
      setLoadStatus('success');
    } else {
      setLoadStatus(cached ? 'success' : 'loading');
      if (cached) setActivity(cached);
    }

    const reqId = ++reqIdRef.current;
    try {
      const data = await orderRepository.getStaffDailyActivity(staffId, date.toISOString());
      if (reqId !== reqIdRef.current) return; // a newer date/refresh superseded this
      workCache.set(key, data);
      workCacheAt.set(key, Date.now());
      setActivity(data);
      setLoadStatus('success');
    } catch (error) {
      if (reqId !== reqIdRef.current) return;
      console.error('Failed to load Staff Work activity:', error);
      // Keep any cached data on screen; only show the error state if we have nothing.
      setLoadStatus(workCache.get(key) ? 'success' : 'error');
    }
  }, [staffId]);

  useEffect(() => {
    void load(selectedDate);
  }, [load, selectedDate]);

  // Live updates: subscribe ONCE. Any GR status / payment / assignment /
  // delete event → clear the day cache and re-pull the current day (one
  // debounced request). No polling, no per-render re-subscription.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsub = grRealtime.subscribe(() => {
      workCache.clear();
      workCacheAt.clear();
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        void load(selectedDateRef.current, { force: true });
      }, 400);
    });
    return () => {
      unsub();
      if (timer) clearTimeout(timer);
    };
  }, [load]);

  const onToday = isSameDay(selectedDate, today);
  const onYesterday = isSameDay(selectedDate, addDays(today, -1));
  const dateLabel = onToday ? 'Today' : onYesterday ? 'Yesterday' : formatDay(selectedDate);
  const activityLabel = onToday ? "Today's Activity" : `Activity — ${formatDay(selectedDate)}`;

  const s = activity?.summary;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <Header title="Staff Work" leftAction={{ icon: 'chevron-back', onPress: goBack }} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Staff identity */}
        <View style={[styles.identityCard, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}>
          <View style={styles.identityRow}>
            <Text style={[styles.staffName, { color: colors.textPrimary }]}>{fullName}</Text>
            {staffStatus && <StatusBadge status={staffStatus} size="sm" />}
          </View>
          <View style={styles.locationRow}>
            <Ionicons name="location-outline" size={14} color={colors.textMuted} />
            <Text style={[styles.locationText, { color: colors.textMuted }]}>{area ?? 'Not Assigned'}</Text>
          </View>
        </View>

        {/* Date filter */}
        <View style={[styles.dateRow, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}>
          <TouchableOpacity onPress={() => stepDay(-1)} hitSlop={8} style={styles.dateArrow}>
            <Ionicons name="chevron-back" size={20} color={colors.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.dateCenter} onPress={() => { refreshToday(); setDateSheetOpen(true); }} activeOpacity={0.7}>
            <Ionicons name="calendar-outline" size={16} color={colors.primary} />
            <Text style={[styles.dateText, { color: colors.textPrimary }]}>{dateLabel}</Text>
            <Ionicons name="chevron-down" size={14} color={colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => stepDay(1)}
            hitSlop={8}
            style={styles.dateArrow}
            disabled={onToday}
          >
            <Ionicons name="chevron-forward" size={20} color={onToday ? colors.textMuted : colors.textPrimary} />
          </TouchableOpacity>
        </View>

        {loadStatus === 'loading' && (
          <View style={styles.loadingBlock}>
            <View style={styles.summaryGrid}>
              {[1, 2, 3, 4].map((i) => <ShimmerCard key={i} style={styles.summaryShimmer} height={84} />)}
            </View>
            <Text style={[styles.loadingText, { color: colors.textMuted }]}>Loading staff activity…</Text>
            <ShimmerCard style={styles.blockShimmer} height={90} />
            <ShimmerCard style={styles.blockShimmer} height={90} />
          </View>
        )}

        {loadStatus === 'error' && (
          <EmptyState
            icon="cloud-offline-outline"
            title="Unable to load staff activity"
            subtitle="Something went wrong while loading this staff member's work."
            actionLabel="Retry"
            onActionPress={() => load(selectedDate, { force: true })}
            iconColor={colors.error}
          />
        )}

        {loadStatus === 'success' && s && (
          <>
            {/* Summary cards */}
            <View style={styles.summaryGrid}>
              <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}>
                <Text style={[styles.summaryValue, { color: '#3B82F6' }]}>{s.grCollected}</Text>
                <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>GR Collected</Text>
              </View>
              <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}>
                <Text style={[styles.summaryValue, { color: '#10B981' }]}>{s.grDelivered}</Text>
                <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>GR Delivered</Text>
              </View>
              <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}>
                <Text style={[styles.summaryValue, { color: '#10B981' }]}>{formatCurrency(s.amountCollected)}</Text>
                <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>Amount Collected</Text>
              </View>
              <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}>
                <Text style={[styles.summaryValue, { color: s.amountPending > 0 ? '#F97316' : colors.textPrimary }]}>{formatCurrency(s.amountPending)}</Text>
                <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>Amount Pending</Text>
              </View>
            </View>

            {/* Performance summary */}
            {(s.grCollected > 0 || s.grDelivered > 0) && (
              <View style={[styles.perfCard, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}>
                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Performance Summary</Text>
                <View style={styles.perfRow}>
                  <Text style={[styles.perfLabel, { color: colors.textMuted }]}>Delivery Completion</Text>
                  <Text style={[styles.perfValue, { color: colors.textPrimary }]}>{s.grDelivered} / {s.grCollected}</Text>
                </View>
                <View style={styles.perfRow}>
                  <Text style={[styles.perfLabel, { color: colors.textMuted }]}>Total Bill Value</Text>
                  <Text style={[styles.perfValue, { color: colors.textPrimary }]}>{formatCurrency(s.totalBillValue)}</Text>
                </View>
                {s.shopsVisited > 0 && (
                  <View style={styles.perfRow}>
                    <Text style={[styles.perfLabel, { color: colors.textMuted }]}>Shops Served</Text>
                    <Text style={[styles.perfValue, { color: colors.textPrimary }]}>{s.shopsVisited}</Text>
                  </View>
                )}
              </View>
            )}

            {/* Money Settlement — same accounting the Staff Daily Collection
                page shows (orderRepository.getStaffSettlementTotals is the
                one shared source both screens read). */}
            {(s.amountCollected > 0 || s.ownerAmount > 0 || s.labourAmount > 0 || s.driverAmount > 0) && (
              <View style={[styles.perfCard, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}>
                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Money Settlement</Text>
                <View style={styles.perfRow}>
                  <Text style={[styles.perfLabel, { color: colors.textMuted }]}>Total Collection</Text>
                  <Text style={[styles.perfValue, { color: colors.textPrimary }]}>{formatCurrency(s.amountCollected)}</Text>
                </View>
                <View style={styles.perfRow}>
                  <Text style={[styles.perfLabel, { color: colors.textMuted }]}>Owner Account</Text>
                  <Text style={[styles.perfValue, { color: colors.textPrimary }]}>- {formatCurrency(s.ownerAmount)}</Text>
                </View>
                <View style={styles.perfRow}>
                  <Text style={[styles.perfLabel, { color: colors.textMuted }]}>Paid to Labour</Text>
                  <Text style={[styles.perfValue, { color: colors.textPrimary }]}>- {formatCurrency(s.labourAmount)}</Text>
                </View>
                <View style={styles.perfRow}>
                  <Text style={[styles.perfLabel, { color: colors.textMuted }]}>Paid to Driver</Text>
                  <Text style={[styles.perfValue, { color: colors.textPrimary }]}>- {formatCurrency(s.driverAmount)}</Text>
                </View>
                <View style={[styles.perfRow, { marginTop: 4, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
                  <Text style={[styles.perfLabel, { color: colors.textPrimary, fontWeight: '800' }]}>Staff Balance</Text>
                  <Text style={[styles.perfValue, { color: s.staffBalance > 0 ? '#F97316' : '#10B981' }]}>{formatCurrency(s.staffBalance)}</Text>
                </View>
              </View>
            )}

            {/* Today's Activity timeline */}
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{activityLabel}</Text>
            {activity.timeline.length === 0 ? (
              <EmptyState
                icon="time-outline"
                title="No activity for this date"
                subtitle={`No activity recorded for ${fullName.split(' ')[0]} on ${formatDay(selectedDate)}.`}
              />
            ) : (
              <View style={styles.list}>
                {activity.timeline.map((event) => {
                  const config = EVENT_CONFIG[event.kind];
                  return (
                    <View key={event.id} style={[styles.timelineCard, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}>
                      <View style={styles.timelineHeader}>
                        <Ionicons name={config.icon} size={16} color={config.color} />
                        <Text style={[styles.timelineLabel, { color: config.color }]}>{config.label}</Text>
                        <Text style={[styles.timelineTime, { color: colors.textMuted }]}>{formatTime(event.createdAt)}</Text>
                      </View>
                      <Text style={[styles.timelineGr, { color: colors.textPrimary }]}>
                        GR #{event.orderNumber}{event.consignorName ? ` · ${event.consignorName}` : ''}
                      </Text>
                      {event.kind === 'collected' && typeof event.toPay === 'number' && (
                        <Text style={[styles.timelineDetail, { color: colors.textSecondary }]}>Bill: {formatCurrency(event.toPay)}</Text>
                      )}
                      {event.kind === 'payment' && (
                        <Text style={[styles.timelineDetail, { color: colors.textSecondary }]}>
                          Collected: {formatCurrency(event.amount ?? 0)}
                          {typeof event.remaining === 'number' ? ` · Remaining: ${formatCurrency(event.remaining)}` : ''}
                        </Text>
                      )}
                    </View>
                  );
                })}
              </View>
            )}

            {/* GR Work */}
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>GR Work</Text>
            {activity.grWork.length === 0 ? (
              <EmptyState icon="reader-outline" title="No GR work" subtitle={`No GRs collected or delivered on ${formatDay(selectedDate)}.`} />
            ) : (
              <View style={styles.list}>
                {activity.grWork.map((gr) => (
                  <TouchableOpacity
                    key={gr.orderId}
                    style={[styles.grCard, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}
                    onPress={() => navigate('GRDetails', { orderId: gr.orderId })}
                    activeOpacity={0.85}
                  >
                    <View style={styles.grHeader}>
                      <Text style={[styles.grNo, { color: colors.textPrimary }]}>GR #{gr.orderNumber}</Text>
                      <StatusBadge status={gr.status} size="sm" />
                    </View>
                    <Text style={[styles.partyLine, { color: colors.textSecondary }]}>{gr.consignorName || '—'}</Text>
                    <View style={styles.grDetailGrid}>
                      <View style={styles.grDetailBlock}>
                        <Text style={[styles.grDetailLabel, { color: colors.textMuted }]}>Collected</Text>
                        <Text style={[styles.grDetailValue, { color: colors.textPrimary }]}>{formatTime(gr.collectedAt)}</Text>
                      </View>
                      <View style={styles.grDetailBlock}>
                        <Text style={[styles.grDetailLabel, { color: colors.textMuted }]}>Delivered</Text>
                        <Text style={[styles.grDetailValue, { color: colors.textPrimary }]}>{gr.deliveredAt ? formatTime(gr.deliveredAt) : '—'}</Text>
                      </View>
                      <View style={styles.grDetailBlock}>
                        <Text style={[styles.grDetailLabel, { color: colors.textMuted }]}>Total Bill</Text>
                        <Text style={[styles.grDetailValue, { color: colors.textPrimary }]}>{formatCurrency(gr.toPay)}</Text>
                      </View>
                      <View style={styles.grDetailBlock}>
                        <Text style={[styles.grDetailLabel, { color: colors.textMuted }]}>Collected</Text>
                        <Text style={[styles.grDetailValue, { color: '#10B981' }]}>{formatCurrency(gr.totalPaid)}</Text>
                      </View>
                      <View style={styles.grDetailBlock}>
                        <Text style={[styles.grDetailLabel, { color: colors.textMuted }]}>Remaining</Text>
                        <Text style={[styles.grDetailValue, { color: gr.balance > 0 ? '#F97316' : '#10B981' }]}>{formatCurrency(gr.balance)}</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Payment Collection */}
            <View style={styles.paymentHeaderRow}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Payment Collection</Text>
              <Text style={[styles.paymentTotal, { color: '#10B981' }]}>{formatCurrency(s.amountCollected)}</Text>
            </View>
            {activity.payments.length === 0 ? (
              <EmptyState icon="wallet-outline" title="No payments collected" subtitle={`No collections recorded on ${formatDay(selectedDate)}.`} />
            ) : (
              <View style={styles.list}>
                {activity.payments.map((p) => (
                  <View key={p.id} style={[styles.paymentCard, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}>
                    <View style={styles.paymentRow}>
                      <Text style={[styles.paymentAmount, { color: '#10B981' }]}>{formatCurrency(p.amount ?? 0)}</Text>
                      <Text style={[styles.timelineTime, { color: colors.textMuted }]}>{formatTime(p.createdAt)}</Text>
                    </View>
                    <Text style={[styles.timelineGr, { color: colors.textPrimary }]}>GR #{p.orderNumber}</Text>
                    {p.consignorName && <Text style={[styles.timelineDetail, { color: colors.textSecondary }]}>{p.consignorName}</Text>}
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* Date picker sheet */}
      <Modal visible={dateSheetOpen} transparent animationType="slide" onRequestClose={() => setDateSheetOpen(false)}>
        <Pressable style={[styles.sheetBackdrop, { backgroundColor: colors.overlay }]} onPress={() => setDateSheetOpen(false)}>
          <View style={[styles.bottomSheet, { backgroundColor: colors.surface, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl }]}>
            <View style={styles.sheetHandle} />
            <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>Select Date</Text>
            <ScrollView style={styles.dateList} showsVerticalScrollIndicator={false}>
              {recentDays.map((d) => {
                const selected = isSameDay(d, selectedDate);
                return (
                  <TouchableOpacity
                    key={dayKey(d)}
                    style={[styles.dateOption, { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? `${colors.primary}10` : 'transparent', borderRadius: radii.md }]}
                    onPress={() => { setSelectedDate(d); setDateSheetOpen(false); }}
                  >
                    <Text style={[styles.dateOptionText, { color: selected ? colors.primary : colors.textPrimary }]}>
                      {isSameDay(d, today) ? 'Today' : isSameDay(d, addDays(today, -1)) ? 'Yesterday' : formatDayShort(d)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
};

const createStyles = (theme: Pick<AppTheme, 'colors' | 'spacing' | 'radii' | 'fonts' | 'shadows'>) =>
  StyleSheet.create({
    safe: { flex: 1 },
    scrollContent: { paddingBottom: 40, paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.md, gap: theme.spacing.md },
    identityCard: { padding: 16, gap: 6 },
    identityRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    staffName: { fontSize: theme.fonts.size.lg, fontWeight: '800' },
    locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    locationText: { fontSize: theme.fonts.size.sm, fontWeight: '600' },
    dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10 },
    dateArrow: { padding: 6 },
    dateCenter: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, justifyContent: 'center' },
    dateText: { fontSize: theme.fonts.size.md, fontWeight: '700' },
    loadingBlock: { gap: theme.spacing.md },
    loadingText: { fontSize: theme.fonts.size.sm, fontWeight: '600', textAlign: 'center' },
    blockShimmer: { borderRadius: theme.radii.lg },
    summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    summaryShimmer: { width: '48%', borderRadius: theme.radii.lg },
    summaryCard: { width: '48%', padding: 14, gap: 2 },
    summaryValue: { fontSize: theme.fonts.size.lg, fontWeight: '800' },
    summaryLabel: { fontSize: theme.fonts.size.xs, fontWeight: '600' },
    perfCard: { padding: 16, gap: 8 },
    perfRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    perfLabel: { fontSize: theme.fonts.size.sm, fontWeight: '600' },
    perfValue: { fontSize: theme.fonts.size.sm, fontWeight: '800' },
    sectionTitle: { fontSize: theme.fonts.size.md, fontWeight: '800' },
    list: { gap: theme.spacing.sm },
    timelineCard: { padding: 14, gap: 4 },
    timelineHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    timelineLabel: { fontSize: theme.fonts.size.sm, fontWeight: '800', flex: 1 },
    timelineTime: { fontSize: theme.fonts.size.xs, fontWeight: '600' },
    timelineGr: { fontSize: theme.fonts.size.sm, fontWeight: '700' },
    timelineDetail: { fontSize: theme.fonts.size.xs, fontWeight: '600' },
    grCard: { padding: 16, gap: 8 },
    grHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    grNo: { fontSize: theme.fonts.size.md, fontWeight: '800' },
    partyLine: { fontSize: theme.fonts.size.sm, fontWeight: '600' },
    grDetailGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.border },
    grDetailBlock: { minWidth: '28%' },
    grDetailLabel: { fontSize: theme.fonts.size.xs, fontWeight: '600', marginBottom: 2 },
    grDetailValue: { fontSize: theme.fonts.size.sm, fontWeight: '800' },
    paymentHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    paymentTotal: { fontSize: theme.fonts.size.md, fontWeight: '800' },
    paymentCard: { padding: 14, gap: 2 },
    paymentRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    paymentAmount: { fontSize: theme.fonts.size.lg, fontWeight: '800' },
    sheetBackdrop: { flex: 1, justifyContent: 'flex-end' },
    bottomSheet: { paddingHorizontal: 24, paddingBottom: 40, paddingTop: 8, maxHeight: '70%' },
    sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#00000020', alignSelf: 'center', marginBottom: 16 },
    sheetTitle: { fontSize: theme.fonts.size.lg, fontWeight: '800', marginBottom: 16 },
    dateList: { gap: 8 },
    dateOption: { paddingVertical: 12, paddingHorizontal: 14, borderWidth: 1, marginBottom: 8 },
    dateOptionText: { fontSize: theme.fonts.size.md, fontWeight: '700' },
  });

export default AdminStaffDailyWorkScreen;
