import { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAppTheme } from '../../theme/useAppTheme';
import { Header } from '../../components/Header';
import { ShimmerCard } from '../../components/ShimmerCard';
import { EmptyState } from '../../components/EmptyState';
import { useAppNav } from '../../hooks/useAppNav';
import { useUserStore } from '../../store/userStore';
import {
  orderRepository,
  type StaffDailyCollection,
  type CollectionTransaction,
  type SettlementType,
} from '../../database/repositories/orderRepository';
import type { AppTheme } from '../../theme/types';

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

const RECENT_DAYS = Array.from({ length: 14 }, (_, i) => addDays(new Date(), -i));

const TX_CONFIG: Record<CollectionTransaction['kind'], { icon: keyof typeof Ionicons.glyphMap; color: string; labelKey: string; sign: '+' | '-' }> = {
  collection: { icon: 'arrow-down-circle', color: '#10B981', labelKey: 'collection.grCollection', sign: '+' },
  owner: { icon: 'business', color: '#635BFF', labelKey: 'collection.ownerAccount', sign: '-' },
  labour: { icon: 'construct', color: '#F59E0B', labelKey: 'collection.labourPayment', sign: '-' },
  driver: { icon: 'car', color: '#F97316', labelKey: 'collection.driverPayment', sign: '-' },
};

/** Parses an amount field: blank/invalid treated as ₹0, never negative — so
 * staff never have to type "0" into a field they didn't use (req #8), and
 * can't type a negative amount by mistake. */
const parseAmount = (raw: string): number => {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

type LoadStatus = 'loading' | 'success' | 'error';

/**
 * Staff Dashboard → "Daily Collection": one staff member's own money summary
 * for a selected day — total collected (from `payments.recordedBy`, the same
 * field Admin's Staff Work page reads), owner/labour/driver settlements
 * recorded out of it, and the resulting balance still with the staff. See
 * `orderRepository.getStaffDailyCollection`/`addStaffSettlement` for the
 * accounting rules (single source of truth, shared with Admin's view).
 */
export const StaffDailyCollectionScreen = () => {
  const { t } = useTranslation();
  const { colors, spacing, radii, fonts, shadows } = useAppTheme();
  const { goBack } = useAppNav();
  const user = useUserStore((state) => state.user);

  const styles = createStyles({ colors, spacing, radii, fonts, shadows });

  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [loadStatus, setLoadStatus] = useState<LoadStatus>('loading');
  const [collection, setCollection] = useState<StaffDailyCollection | null>(null);
  const [dateSheetOpen, setDateSheetOpen] = useState(false);
  const [addSheetOpen, setAddSheetOpen] = useState(false);
  const [ownerDraft, setOwnerDraft] = useState('');
  const [labourDraft, setLabourDraft] = useState('');
  const [driverDraft, setDriverDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const load = useCallback(async (date: Date) => {
    if (!user?.id) return;
    setLoadStatus('loading');
    try {
      const data = await orderRepository.getStaffDailyCollection(user.id, date.toISOString());
      setCollection(data);
      setLoadStatus('success');
    } catch (error) {
      console.error('Failed to load Daily Collection:', error);
      setLoadStatus('error');
    }
  }, [user?.id]);

  useEffect(() => {
    load(selectedDate);
  }, [load, selectedDate]);

  useEffect(() => {
    if (!banner) return;
    const timer = setTimeout(() => setBanner(null), 4000);
    return () => clearTimeout(timer);
  }, [banner]);

  const today = new Date();
  const onToday = isSameDay(selectedDate, today);
  const onYesterday = isSameDay(selectedDate, addDays(today, -1));
  const dateLabel = onToday ? t('filters.today') : onYesterday ? t('filters.yesterday') : formatDay(selectedDate);

  const c = collection;

  // Live-calculated as the staff types — no "Calculate" button, per req #19.
  // Capped against the CURRENT remaining balance (today's collection minus
  // whatever was already settled earlier today), not just the day's raw
  // total — so a second "Add Today's Collection" entry later the same day
  // can't over-allocate against money already handed over in an earlier one.
  const ownerAmount = parseAmount(ownerDraft);
  const labourAmount = parseAmount(labourDraft);
  const driverAmount = parseAmount(driverDraft);
  const allocated = ownerAmount + labourAmount + driverAmount;
  const availableBalance = c?.staffBalance ?? 0;
  const remaining = availableBalance - allocated;
  const overAllocated = allocated > availableBalance + 0.005;

  const openAddSheet = () => {
    setOwnerDraft('');
    setLabourDraft('');
    setDriverDraft('');
    setFormError(null);
    setAddSheetOpen(true);
  };

  const closeAddSheet = () => {
    if (submitting) return;
    setAddSheetOpen(false);
  };

  const submitCollection = async () => {
    if (!user?.id || submitting) return;
    if (allocated <= 0) {
      setFormError(t('collection.enterAtLeastOne'));
      return;
    }
    if (overAllocated) {
      setFormError(t('collection.overAllocated'));
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      // Only real, nonzero entries create a transaction — never a ₹0 row.
      const entries: { type: SettlementType; amount: number }[] = [
        { type: 'owner' as const, amount: ownerAmount },
        { type: 'labour' as const, amount: labourAmount },
        { type: 'driver' as const, amount: driverAmount },
      ].filter((e) => e.amount > 0);
      for (const entry of entries) {
        // Sequential, not parallel: each call re-checks the live balance
        // against everything saved so far in this same batch, so three
        // simultaneous inserts can never jointly over-allocate a balance
        // that only looked fine before any of them were saved yet.
        // eslint-disable-next-line no-await-in-loop
        await orderRepository.addStaffSettlement({
          staffId: user.id,
          type: entry.type,
          amount: entry.amount,
          createdBy: user.id,
        });
      }
      setAddSheetOpen(false);
      setBanner({ kind: 'success', text: t('collection.collectionSaved') });
      await load(selectedDate);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : t('collection.couldNotSave'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <Header title={t('staff.dailyCollection')} leftAction={{ icon: 'chevron-back', onPress: goBack }} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {banner && (
          <View style={[styles.banner, { backgroundColor: banner.kind === 'success' ? colors.successSoft : colors.errorSoft, borderRadius: radii.lg }]}>
            <Ionicons name={banner.kind === 'success' ? 'checkmark-circle-outline' : 'alert-circle-outline'} size={18} color={banner.kind === 'success' ? colors.success : colors.error} />
            <Text style={[styles.bannerText, { color: banner.kind === 'success' ? colors.success : colors.error }]}>{banner.text}</Text>
          </View>
        )}

        {/* Staff identity */}
        <View style={[styles.identityCard, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}>
          <Text style={[styles.staffName, { color: colors.textPrimary }]}>{user?.fullName ?? t('collection.staffFallback')}</Text>
          {user?.area && (
            <View style={styles.locationRow}>
              <Ionicons name="location-outline" size={14} color={colors.textMuted} />
              <Text style={[styles.locationText, { color: colors.textMuted }]}>{user.area}</Text>
            </View>
          )}
        </View>

        {/* Date filter */}
        <View style={[styles.dateRow, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}>
          <TouchableOpacity onPress={() => setSelectedDate((d) => addDays(d, -1))} hitSlop={8} style={styles.dateArrow}>
            <Ionicons name="chevron-back" size={20} color={colors.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.dateCenter} onPress={() => setDateSheetOpen(true)} activeOpacity={0.7}>
            <Ionicons name="calendar-outline" size={16} color={colors.primary} />
            <Text style={[styles.dateText, { color: colors.textPrimary }]}>{dateLabel}</Text>
            <Ionicons name="chevron-down" size={14} color={colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setSelectedDate((d) => addDays(d, 1))}
            hitSlop={8}
            style={styles.dateArrow}
            disabled={onToday}
          >
            <Ionicons name="chevron-forward" size={20} color={onToday ? colors.textMuted : colors.textPrimary} />
          </TouchableOpacity>
        </View>

        {loadStatus === 'loading' && (
          <View style={styles.loadingBlock}>
            <ShimmerCard style={styles.blockShimmer} height={90} />
            <ShimmerCard style={styles.blockShimmer} height={140} />
            <ShimmerCard style={styles.blockShimmer} height={90} />
          </View>
        )}

        {loadStatus === 'error' && (
          <EmptyState
            icon="cloud-offline-outline"
            title={t('collection.unableToLoad')}
            subtitle={t('collection.unableToLoadDesc')}
            actionLabel={t('common.retry')}
            onActionPress={() => load(selectedDate)}
            iconColor={colors.error}
          />
        )}

        {loadStatus === 'success' && c && (
          <>
            {/* Total Collection */}
            <View style={[styles.totalCard, { backgroundColor: colors.primary, borderRadius: radii.lg, ...shadows.sm }]}>
              <Text style={styles.totalLabel}>{onToday ? t('collection.todaysCollection') : t('collection.collectionOnDate', { date: formatDay(selectedDate) })}</Text>
              <Text style={styles.totalValue}>{formatCurrency(c.totalCollection)}</Text>
            </View>

            {/* Money Summary */}
            <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{t('collection.moneySummary')}</Text>
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>{t('collection.moneyReceived')}</Text>
                <Text style={[styles.summaryValue, { color: '#10B981' }]}>{formatCurrency(c.totalCollection)}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>{t('collection.ownerAccount')}</Text>
                <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>- {formatCurrency(c.ownerAmount)}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>{t('collection.paidToLabour')}</Text>
                <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>- {formatCurrency(c.labourAmount)}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>{t('collection.paidToDriver')}</Text>
                <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>- {formatCurrency(c.driverAmount)}</Text>
              </View>
              <View style={[styles.balanceRow, { borderTopColor: colors.border }]}>
                <Text style={[styles.balanceLabel, { color: colors.textPrimary }]}>{t('collection.staffBalance')}</Text>
                <Text style={[styles.balanceValue, { color: c.staffBalance > 0 ? '#F97316' : '#10B981' }]}>{formatCurrency(c.staffBalance)}</Text>
              </View>
            </View>

            {/* One primary action — only for today; past days are closed
                history, matching addStaffSettlement's own "never backdated"
                rule. */}
            {onToday && (
              <TouchableOpacity
                style={[styles.addButton, { backgroundColor: colors.primary, borderRadius: radii.lg }]}
                onPress={openAddSheet}
                activeOpacity={0.9}
              >
                <Ionicons name="add-circle" size={20} color="#fff" />
                <Text style={styles.addButtonText}>{t('collection.addTodaysCollection')}</Text>
              </TouchableOpacity>
            )}

            {/* Today's Transactions */}
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
              {onToday ? t('collection.todaysTransactions') : t('collection.transactions')}
            </Text>
            {c.transactions.length === 0 ? (
              <EmptyState
                icon="receipt-outline"
                title={t('collection.noCollectionYet')}
                subtitle={onToday ? t('collection.addPrompt') : t('collection.noActivityOn', { date: formatDay(selectedDate) })}
              />
            ) : (
              <View style={styles.list}>
                {c.transactions.map((tx) => {
                  const cfg = TX_CONFIG[tx.kind];
                  return (
                    <View key={tx.id} style={[styles.txCard, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}>
                      <View style={[styles.txIcon, { backgroundColor: `${cfg.color}18` }]}>
                        <Ionicons name={cfg.icon} size={18} color={cfg.color} />
                      </View>
                      <View style={styles.txBody}>
                        <View style={styles.txHeaderRow}>
                          <Text style={[styles.txAmount, { color: cfg.sign === '+' ? '#10B981' : colors.textPrimary }]}>
                            {cfg.sign} {formatCurrency(tx.amount)}
                          </Text>
                          <Text style={[styles.txTime, { color: colors.textMuted }]}>{formatTime(tx.createdAt)}</Text>
                        </View>
                        <Text style={[styles.txLabel, { color: colors.textSecondary }]}>{t(cfg.labelKey)}</Text>
                        {tx.kind === 'collection' && tx.orderNumber && (
                          <Text style={[styles.txDetail, { color: colors.textMuted }]}>
                            GR #{tx.orderNumber}{tx.consignorName ? ` · ${tx.consignorName}` : ''}
                          </Text>
                        )}
                        {tx.notes && <Text style={[styles.txDetail, { color: colors.textMuted }]}>{tx.notes}</Text>}
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* Date picker sheet */}
      <Modal visible={dateSheetOpen} transparent animationType="slide" onRequestClose={() => setDateSheetOpen(false)}>
        <Pressable style={[styles.sheetBackdrop, { backgroundColor: colors.overlay }]} onPress={() => setDateSheetOpen(false)}>
          {/* A nested Pressable with a no-op onPress, not a plain View: on web
              a tap inside a plain child of the backdrop Pressable bubbles up
              through the DOM and also fires the backdrop's onPress (closing
              the sheet). Swallowing the press here stops that. */}
          <Pressable
            style={[styles.bottomSheet, { backgroundColor: colors.surface, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl }]}
            onPress={() => {}}
          >
            <View style={styles.sheetHandle} />
            <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>{t('collection.selectDate')}</Text>
            <ScrollView style={styles.dateList} showsVerticalScrollIndicator={false}>
              {RECENT_DAYS.map((d) => {
                const selected = isSameDay(d, selectedDate);
                return (
                  <TouchableOpacity
                    key={d.toISOString().slice(0, 10)}
                    style={[styles.dateOption, { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? `${colors.primary}10` : 'transparent', borderRadius: radii.md }]}
                    onPress={() => { setSelectedDate(d); setDateSheetOpen(false); }}
                  >
                    <Text style={[styles.dateOptionText, { color: selected ? colors.primary : colors.textPrimary }]}>
                      {isSameDay(d, today) ? t('filters.today') : isSameDay(d, addDays(today, -1)) ? t('filters.yesterday') : formatDayShort(d)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Add Today's Collection — ONE form covering owner/labour/driver, with
          a live-calculated balance (req #4/#19). Total Received is never a
          field here: it's already the auto-calculated `c.totalCollection`
          shown above, from real payment records (req #13) — staff only
          enters where that money went. */}
      <Modal visible={addSheetOpen} transparent animationType="slide" onRequestClose={closeAddSheet}>
        <Pressable style={[styles.sheetBackdrop, { backgroundColor: colors.overlay }]} onPress={closeAddSheet}>
          {/* Nested Pressable (no-op onPress), not a plain View — see the
              date sheet above for why: without this, tapping into a
              TextInput here also bubbles the press to the backdrop on web,
              closing the sheet on the same tap that was meant to focus the
              field, which made it look like typing simply didn't work. */}
          <Pressable
            style={[styles.bottomSheet, { backgroundColor: colors.surface, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl }]}
            onPress={() => {}}
          >
            <View style={styles.sheetHandle} />
            <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>{t('collection.addTodaysCollection')}</Text>
            <View style={styles.sheetDateRow}>
              <Ionicons name="calendar-outline" size={14} color={colors.textMuted} />
              <Text style={[styles.sheetSubtitle, { color: colors.textMuted, marginBottom: 0 }]}>
                {onToday ? t('filters.today') : dateLabel} — {formatDay(selectedDate)}
              </Text>
            </View>

            <ScrollView style={styles.formScroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View style={[styles.totalReceivedRow, { backgroundColor: colors.background, borderRadius: radii.md }]}>
                <Text style={[styles.fieldLabel, { color: colors.textMuted, marginTop: 0 }]}>{t('collection.totalReceived')}</Text>
                <Text style={[styles.totalReceivedValue, { color: colors.textPrimary }]}>{formatCurrency(c?.totalCollection ?? 0)}</Text>
              </View>

              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>{t('collection.ownerAccount')}</Text>
              <TextInput
                value={ownerDraft}
                onChangeText={setOwnerDraft}
                placeholder="0"
                keyboardType="numeric"
                inputMode="numeric"
                style={[styles.input, { color: colors.textPrimary, backgroundColor: colors.background, borderColor: colors.border }]}
                placeholderTextColor={colors.textMuted}
              />

              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>{t('collection.paidToLabour')}</Text>
              <TextInput
                value={labourDraft}
                onChangeText={setLabourDraft}
                placeholder="0"
                keyboardType="numeric"
                inputMode="numeric"
                style={[styles.input, { color: colors.textPrimary, backgroundColor: colors.background, borderColor: colors.border }]}
                placeholderTextColor={colors.textMuted}
              />

              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>{t('collection.paidToDriver')}</Text>
              <TextInput
                value={driverDraft}
                onChangeText={setDriverDraft}
                placeholder="0"
                keyboardType="numeric"
                inputMode="numeric"
                style={[styles.input, { color: colors.textPrimary, backgroundColor: colors.background, borderColor: colors.border }]}
                placeholderTextColor={colors.textMuted}
              />

              <View style={[styles.remainingRow, { borderTopColor: colors.border }]}>
                <Text style={[styles.remainingLabel, { color: colors.textPrimary }]}>{t('collection.remainingWithYou')}</Text>
                <Text style={[styles.remainingValue, { color: overAllocated ? colors.error : remaining > 0 ? '#F97316' : '#10B981' }]}>
                  {formatCurrency(remaining)}
                </Text>
              </View>

              {overAllocated && (
                <Text style={[styles.formError, { color: colors.error }]}>{t('collection.overAllocated')}</Text>
              )}
              {formError && !overAllocated && <Text style={[styles.formError, { color: colors.error }]}>{formError}</Text>}

              <TouchableOpacity
                style={[styles.sheetApplyBtn, { backgroundColor: colors.primary, borderRadius: radii.lg, opacity: submitting || overAllocated ? 0.6 : 1 }]}
                onPress={submitCollection}
                disabled={submitting || overAllocated}
              >
                <Text style={styles.sheetApplyText}>{submitting ? t('collection.saving') : t('collection.saveCollection')}</Text>
              </TouchableOpacity>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
};

const createStyles = (theme: Pick<AppTheme, 'colors' | 'spacing' | 'radii' | 'fonts' | 'shadows'>) =>
  StyleSheet.create({
    safe: { flex: 1 },
    scrollContent: { paddingBottom: 40, paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.md, gap: theme.spacing.md },
    banner: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12 },
    bannerText: { flex: 1, fontSize: theme.fonts.size.sm, fontWeight: '600' },
    identityCard: { padding: 16, gap: 6 },
    staffName: { fontSize: theme.fonts.size.lg, fontWeight: '800' },
    locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    locationText: { fontSize: theme.fonts.size.sm, fontWeight: '600' },
    dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10 },
    dateArrow: { padding: 6 },
    dateCenter: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, justifyContent: 'center' },
    dateText: { fontSize: theme.fonts.size.md, fontWeight: '700' },
    loadingBlock: { gap: theme.spacing.md },
    blockShimmer: { borderRadius: theme.radii.lg },
    totalCard: { padding: 20, gap: 6, alignItems: 'center' },
    totalLabel: { fontSize: theme.fonts.size.sm, fontWeight: '700', color: '#FFFFFFCC' },
    totalValue: { fontSize: theme.fonts.size.xxl, fontWeight: '900', color: '#FFFFFF' },
    summaryCard: { padding: 16, gap: 10 },
    sectionTitle: { fontSize: theme.fonts.size.md, fontWeight: '800' },
    summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    summaryLabel: { fontSize: theme.fonts.size.sm, fontWeight: '600' },
    summaryValue: { fontSize: theme.fonts.size.sm, fontWeight: '800' },
    balanceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
    balanceLabel: { fontSize: theme.fonts.size.md, fontWeight: '800' },
    balanceValue: { fontSize: theme.fonts.size.lg, fontWeight: '900' },
    addButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16 },
    addButtonText: { fontSize: theme.fonts.size.md, fontWeight: '800', color: '#fff' },
    list: { gap: theme.spacing.sm },
    txCard: { flexDirection: 'row', padding: 14, gap: 10 },
    txIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
    txBody: { flex: 1, gap: 2 },
    txHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    txAmount: { fontSize: theme.fonts.size.md, fontWeight: '800' },
    txTime: { fontSize: theme.fonts.size.xs, fontWeight: '600' },
    txLabel: { fontSize: theme.fonts.size.sm, fontWeight: '700' },
    txDetail: { fontSize: theme.fonts.size.xs, fontWeight: '600' },
    sheetBackdrop: { flex: 1, justifyContent: 'flex-end' },
    bottomSheet: { paddingHorizontal: 24, paddingBottom: 40, paddingTop: 8, maxHeight: '80%' },
    sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#00000020', alignSelf: 'center', marginBottom: 16 },
    sheetTitle: { fontSize: theme.fonts.size.lg, fontWeight: '800', marginBottom: 4 },
    sheetSubtitle: { fontSize: theme.fonts.size.sm, fontWeight: '600', marginBottom: 16 },
    sheetDateRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 },
    formScroll: { maxHeight: 480 },
    totalReceivedRow: { padding: 14, marginBottom: 4 },
    totalReceivedValue: { fontSize: theme.fonts.size.xl, fontWeight: '900' },
    fieldLabel: { fontSize: theme.fonts.size.sm, fontWeight: '700', marginBottom: 6, marginTop: 10 },
    input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: theme.fonts.size.md },
    remainingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth },
    remainingLabel: { fontSize: theme.fonts.size.md, fontWeight: '800' },
    remainingValue: { fontSize: theme.fonts.size.lg, fontWeight: '900' },
    formError: { fontSize: theme.fonts.size.sm, fontWeight: '600', marginTop: 10 },
    sheetApplyBtn: { paddingVertical: 14, alignItems: 'center', marginTop: 20 },
    sheetApplyText: { fontSize: theme.fonts.size.md, fontWeight: '800', color: '#fff' },
    dateList: { gap: 8 },
    dateOption: { paddingVertical: 12, paddingHorizontal: 14, borderWidth: 1, marginBottom: 8 },
    dateOptionText: { fontSize: theme.fonts.size.md, fontWeight: '700' },
  });

export default StaffDailyCollectionScreen;
