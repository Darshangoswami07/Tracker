import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAppTheme } from '../../theme/useAppTheme';
import { useAuthStore } from '../../store/authStore';
import { useUserStore } from '../../store/userStore';
import { api } from '../../api/client';
import { ENDPOINTS } from '../../api/endpoints';
import { orderRepository } from '../../database/repositories/orderRepository';
import type { LocalPayment, PaymentSummary, ReceivedBy } from '../../database/repositories/orderRepository';
import { Header } from '../../components/Header';
import { ShimmerCard } from '../../components/ShimmerCard';
import { EmptyState } from '../../components/EmptyState';
import { StatusBadge } from '../../components/StatusBadge';
import { AttachmentViewerModal, type ViewableAttachment } from '../../components/AttachmentViewerModal';
import { persistSlipImage } from '../../services/slipStorage';
import { grRealtime, type GrEvent } from '../../services/grRealtime';
import { useAppNav } from '../../hooks/useAppNav';
import { useTranslation } from 'react-i18next';
import { RECEIVE_PAYMENT_OPTIONS, formatPaymentMode, formatPaymentModeWithReceiver } from '../../constants/paymentModes';
import { allowedGrStatusTargets } from '../../constants/roles';
import type { AppTheme } from '../../theme/types';

interface GRAttachment {
  id: string;
  originalFilename: string;
  mimeType: string;
  createdAt: string;
  url: string;
}

interface GRExtendedDetail {
  grDate?: string;
  transportCompanyName?: string;
  transportGstin?: string;
  ewbNumber?: string;
  billType?: string;
  specialService?: string;
  fromLocation?: string;
  toLocation?: string;
  deliveryAt?: string;
  rate?: number;
  goodsValue?: number;
  grCharge?: number;
  freight?: number;
  labour?: number;
  pf?: number;
  doorDelivery?: number;
  taxGst?: number;
  netAmount?: number;
  toPay?: number;
  proprietorName?: string;
  proprietorPhone?: string;
  packageType?: string;
  consignorGstin?: string;
  consignorPhone?: string;
  consigneeGstin?: string;
  consigneePhone?: string;
  chalaanNo?: string;
  chalaanDate?: string;
  transportGrn?: string;
  paymentMode?: string;
  grSourceLabel?: string;
}

interface GRDetail extends GRExtendedDetail {
  id: string;
  orderNumber: string;
  status: string;
  trackingCode: string | null;
  pickupAddress: string;
  deliveryAddress: string;
  consignorName: string | null;
  consigneeName: string | null;
  particulars: string | null;
  packageCount: number | null;
  weight: number | null;
  notes: string | null;
  driverId: string | null;
  assignedStaffId: string | null;
  createdAt: string;
  attachments: GRAttachment[];
  paymentAmount?: number | null;
  source: string;
}

const SOURCE_LABELS: Record<string, string> = {
  manual: 'Manual Entry',
  slip: 'Slip Upload',
  excel: 'Excel Import',
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  cleared: 'Cleared',
  uncleared: 'Uncleared',
  delivered: 'Delivered',
};

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
 * Mobile GR Details screen — extended with payment summary, receive payment
 * bottom sheet, and payment history list.
 */
export const AdminGRDetailsScreen = ({ route }: any) => {
  const { orderId } = route.params as { orderId: string };
  const { colors, spacing, radii, fonts, shadows } = useAppTheme();
  const { goBack, navigate, navigation } = useAppNav();
  const { t } = useTranslation();
  const accessToken = useAuthStore((state) => state.accessToken);
  const currentUser = useUserStore((state) => state.user);
  const isStaffUser = currentUser?.role === 'staff';

  const styles = createStyles({ colors, spacing, radii, fonts, shadows });

  const [gr, setGr] = useState<GRDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewAttachment, setPreviewAttachment] = useState<ViewableAttachment | null>(null);

  const [statusPickerOpen, setStatusPickerOpen] = useState(false);

  // Payment state
  const [paymentSummary, setPaymentSummary] = useState<PaymentSummary | null>(null);
  const [payments, setPayments] = useState<LocalPayment[]>([]);
  const [receivePaymentOpen, setReceivePaymentOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  // Payment mode IS the receiver: selecting "Admin UPI" vs "Staff UPI" sets
  // both `paymentMode` (stored as `paymentMethod`, still 'upi' either way)
  // and `receivedBy` together — there's no separate "Received By" selector.
  // `receivedBy` drives the existing Admin/Staff accounting split (GR
  // paid/remaining accounting is unaffected either way; it only excludes the
  // amount from the staff's own collection/balance and, for UPI, counts it
  // in the Admin Dashboard's "Direct UPI Received" card instead).
  const [paymentMode, setPaymentMode] = useState<string>('cash');
  const [receivedBy, setReceivedBy] = useState<ReceivedBy>('STAFF');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [submittingPayment, setSubmittingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  // "Collected By" — approved self-service Staff accounts (role=staff).
  // Only Admin picks one; a Staff user recording their own collection is
  // auto-attributed to themselves.
  const [collectorOptions, setCollectorOptions] = useState<{ id: string; fullName: string; area: string | null }[]>([]);
  const [collectedByStaffId, setCollectedByStaffId] = useState<string | null>(null);

  const fetchDetail = useCallback(async () => {
    try {
      const gr = await orderRepository.getById(orderId);
      if (!gr) {
        setNotFound(true);
        return;
      }
      setGr(gr);
      setError(null);
      setNotFound(false);
    } catch (err: any) {
      setError(err?.message ?? t('createGR.couldNotLoadGR'));
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  const fetchPayments = useCallback(async () => {
    try {
      const [summary, paymentList] = await Promise.all([
        orderRepository.getPaymentSummary(orderId),
        orderRepository.listPayments(orderId),
      ]);
      setPaymentSummary(summary);
      setPayments(paymentList);
    } catch {
      // Payment data is supplementary — don't block the screen on failure
    }
  }, [orderId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchDetail();
    fetchPayments();
  }, [fetchDetail, fetchPayments]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchDetail();
      fetchPayments();
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation]);

  // Live updates for THIS GR: staff marking it delivered, a payment settling
  // the balance (→ cleared), an edit to its fields — all arrive over the
  // shared WebSocket (see `services/grRealtime`). One debounced re-pull of
  // the detail + payment summary, so status / Total Bill / Paid / Remaining /
  // consignee / shop / everything stays current with no manual refresh and
  // no polling. Reconnect / app-foreground emit `resync` → same catch-up.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const bump = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        fetchDetail();
        fetchPayments();
      }, 300);
    };
    const onEvent = (evt: GrEvent) => {
      if (evt.type === 'resync') return bump();
      const ids = evt.ids ?? (evt.id ? [evt.id] : []);
      if (ids.includes(orderId)) bump();
    };
    const unsub = grRealtime.subscribe(onEvent);
    return () => {
      unsub();
      if (timer) clearTimeout(timer);
    };
  }, [orderId, fetchDetail, fetchPayments]);

  // Approved self-service Staff, for the Admin's "Collected By" picker.
  // Staff users never see this list — they always collect as themselves.
  useEffect(() => {
    if (!accessToken || isStaffUser) return;
    (async () => {
      try {
        const res = await api.get(ENDPOINTS.admin.users, {
          headers: { Authorization: `Bearer ${accessToken}` },
          params: { page: 1, pageSize: 100, role: 'staff', status: 'active' },
        });
        const items = (res.data?.data?.items ?? []) as { id: string; firstName: string; lastName: string; area: string | null }[];
        setCollectorOptions(items.map((u) => ({ id: u.id, fullName: `${u.firstName} ${u.lastName}`.trim(), area: u.area ?? null })));
      } catch {
        // Non-critical — the picker just stays empty if this fails.
      }
    })();
  }, [accessToken, isStaffUser]);

  const updateStatus = async (status: string) => {
    setStatusPickerOpen(false);
    if (!gr || status === gr.status) return;
    setUpdating(true);
    try {
      setGr(await orderRepository.updateStatus(orderId, status));
    } catch (err: any) {
      Alert.alert(t('createGR.errorTitle'), err?.message ?? t('createGR.statusUpdateFailed'));
    } finally {
      setUpdating(false);
    }
  };

  const handleUploadSlip = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t('createGR.permissionRequired'), t('createGR.permissionGalleryPhoto'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (result.canceled) return;

    setUploading(true);
    try {
      const persisted = await persistSlipImage(result.assets[0].uri, result.assets[0].mimeType ?? 'image/jpeg');
      await orderRepository.addAttachment(orderId, {
        originalFilename: persisted.fileName,
        mimeType: persisted.mimeType,
        localUri: persisted.localUri,
        fileSizeBytes: persisted.fileSizeBytes,
      });
      await fetchDetail();
    } catch (err: any) {
      Alert.alert(t('createGR.uploadFailed'), err?.message ?? t('createGR.couldNotSaveSlip'));
    } finally {
      setUploading(false);
    }
  };

  const openReceivePayment = () => {
    setPaymentError(null);
    setReceivePaymentOpen(true);
  };

  const closeReceivePayment = () => {
    setPaymentError(null);
    setReceivePaymentOpen(false);
    setReceivedBy('STAFF');
  };

  const handleReceivePayment = async () => {
    if (!paymentAmount || submittingPayment) return;
    setPaymentError(null);
    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      setPaymentError(t('payment.enterValidAmount'));
      return;
    }
    const balance = paymentSummary?.balance ?? 0;
    // `+ 0.005` matches the backend's own overpayment tolerance
    // (`payment.py: already_paid + body.amount > to_pay + 0.005`) — both
    // `toPay` and the payment ledger sum arrive here as JS floats, so an
    // exact-match payment (amount === balance) can see e.g. balance ===
    // 189.99999999999997 instead of 190 due to binary floating-point
    // subtraction, not a real shortfall. Without this tolerance, typing the
    // exact remaining amount shown on screen gets wrongly rejected.
    if (amount > balance + 0.005) {
      setPaymentError(`Payment cannot exceed the remaining amount of ${formatCurrency(balance)}.`);
      return;
    }

    setSubmittingPayment(true);
    try {
      // Staff always collect as themselves; Admin optionally attributes the
      // collection to a specific approved Staff member via the "Collected
      // By" picker (see Test 4/5/9 in the Staff Daily Work spec —
      // collections must never be blended across staff or attributed to
      // nobody in particular when a staff member actually did the work).
      const recordedBy = isStaffUser ? currentUser?.id : collectedByStaffId ?? undefined;
      await orderRepository.addPayment({
        orderId,
        amount,
        paymentMethod: paymentMode,
        notes: paymentNotes || undefined,
        recordedBy,
        receivedBy,
      });
      setReceivePaymentOpen(false);
      setPaymentAmount('');
      setPaymentMode('cash');
      setReceivedBy('STAFF');
      setPaymentNotes('');
      setCollectedByStaffId(null);
      // Backend is the source of truth for money figures — never compute
      // paid/remaining/staff/admin totals locally. Re-fetching the GR detail
      // + payment summary here picks up the fresh values the server just
      // committed (paid amount, remaining balance, payment history).
      await Promise.all([fetchDetail(), fetchPayments()]);
    } catch (err: any) {
      // `Alert.alert` is a no-op on web (react-native-web has no native
      // alert implementation) — this MUST surface inline or a failure here
      // (or the validation above) looks like nothing happened at all.
      setPaymentError(err?.message ?? t('payment.failed'));
    } finally {
      setSubmittingPayment(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <Header title={t('admin.grDetails')} leftAction={{ icon: 'chevron-back', onPress: goBack }} />
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <ShimmerCard style={styles.shimmer} height={28} />
          <ShimmerCard style={styles.shimmer} height={80} />
          <ShimmerCard style={styles.shimmer} height={120} />
          <ShimmerCard style={styles.shimmer} height={100} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (notFound) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <Header title={t('admin.grDetails')} leftAction={{ icon: 'chevron-back', onPress: goBack }} />
        <View style={styles.centerFill}>
          <EmptyState icon="alert-circle-outline" title={t('createGR.grNotFound')} subtitle={t('createGR.grNotFoundDesc')} iconColor={colors.error} />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !gr) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <Header title={t('admin.grDetails')} leftAction={{ icon: 'chevron-back', onPress: goBack }} />
        <View style={styles.centerFill}>
          <EmptyState
            icon="cloud-offline-outline"
            title={t('createGR.somethingWrong')}
            subtitle={error ?? t('createGR.couldNotLoadGR')}
            actionLabel={t('common.retry')}
            onActionPress={() => { setLoading(true); fetchDetail(); }}
            iconColor={colors.error}
          />
        </View>
      </SafeAreaView>
    );
  }

  /** Resolves a `payments.recordedBy` id (a Staff account's user id) to a
   * display name for the Payment History list — "You" for the signed-in
   * user's own payments, looked up against the "Collected By" picker's
   * already-fetched Staff list otherwise, falling back to a generic label
   * rather than a raw id if that staff account isn't in the loaded list. */
  const resolveRecorderName = (recordedBy: string | null | undefined): string | null => {
    if (!recordedBy) return null;
    if (recordedBy === currentUser?.id) return `You${currentUser?.fullName ? ` (${currentUser.fullName})` : ''}`;
    const match = collectorOptions.find((o) => o.id === recordedBy);
    return match ? match.fullName : 'Staff';
  };

  const totalPaid = paymentSummary?.totalPaid ?? 0;
  const balance = paymentSummary?.balance ?? (gr.toPay ?? 0);
  const paymentCount = payments.length;
  const paymentStatus = paymentCount === 0 ? 'unpaid' : balance <= 0 ? 'paid' : 'partial';

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <Header
        title={t('admin.grDetails')}
        leftAction={{ icon: 'chevron-back', onPress: goBack }}
        rightAction={{ icon: 'create-outline', onPress: () => navigate('EditGR', { orderId }), accessibilityLabel: 'Edit GR' }}
      />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.titleRow}>
          <View>
            <Text style={[styles.label, { color: colors.textMuted }]}>{t('tracking.grNumber')}</Text>
            <Text style={[styles.grNo, { color: colors.textPrimary }]}>{gr.orderNumber}</Text>
            {gr.trackingCode && (
              <Text style={[styles.trackingCode, { color: colors.textMuted }]}>Tracking: {gr.trackingCode}</Text>
            )}
          </View>
          <StatusBadge status={gr.status} size="lg" />
        </View>

        {/* Payment Summary Card */}
        {gr.toPay != null && (
          <View style={[styles.card, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}>
            <View style={styles.paymentSummaryHeader}>
              <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>{t('summary.financialOverview')}</Text>
              <StatusBadge status={paymentStatus} size="sm" />
            </View>
            <View style={styles.paymentSummaryRow}>
              <View style={styles.paymentSummaryItem}>
                <Text style={[styles.paymentSummaryValue, { color: colors.textPrimary }]}>{formatCurrency(gr.toPay)}</Text>
                <Text style={[styles.paymentSummaryLabel, { color: colors.textMuted }]}>{t('payment.totalAmount')}</Text>
              </View>
              <View style={[styles.paymentSummaryDivider, { backgroundColor: colors.border }]} />
              <View style={styles.paymentSummaryItem}>
                <Text style={[styles.paymentSummaryValue, { color: '#10B981' }]}>{formatCurrency(totalPaid)}</Text>
                <Text style={[styles.paymentSummaryLabel, { color: colors.textMuted }]}>{t('payment.paid')}</Text>
              </View>
              <View style={[styles.paymentSummaryDivider, { backgroundColor: colors.border }]} />
              <View style={styles.paymentSummaryItem}>
                <Text style={[styles.paymentSummaryValue, { color: balance > 0 ? '#F97316' : '#10B981' }]}>{formatCurrency(balance)}</Text>
                <Text style={[styles.paymentSummaryLabel, { color: colors.textMuted }]}>{t('payment.balance')}</Text>
              </View>
            </View>
            {balance > 0 && (
              <TouchableOpacity
                style={[styles.receivePaymentBtn, { backgroundColor: colors.primary, borderRadius: radii.md }]}
                onPress={openReceivePayment}
                activeOpacity={0.85}
              >
                <Ionicons name="wallet-outline" size={16} color="#fff" />
                <Text style={[styles.receivePaymentBtnText, { color: '#fff' }]}>{t('payment.receivePayment')}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Route */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>{t('createGR.sectionRoute')}</Text>
          <View style={styles.routeRow}>
            <Ionicons name="ellipse" size={10} color="#10B981" />
            <Text style={[styles.routeText, { color: colors.textPrimary }]}>{gr.fromLocation || gr.pickupAddress}</Text>
          </View>
          <View style={styles.routeRow}>
            <Ionicons name="location" size={12} color="#EF4444" />
            <Text style={[styles.routeText, { color: colors.textPrimary }]}>{gr.toLocation || gr.deliveryAddress}</Text>
          </View>
        </View>

        <View style={styles.grid}>
          <Field label="Consignor" value={gr.consignorName || '—'} />
          <Field label="Consignee" value={gr.consigneeName || '—'} />
          <Field label="Package Count" value={gr.packageCount != null ? String(gr.packageCount) : '—'} />
          <Field label="Weight" value={gr.weight != null ? `${gr.weight} kg` : '—'} />
        </View>

        {gr.particulars && (
          <View style={[styles.card, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}>
            <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>{t('createGR.sectionGRInfo').replace('GR Information', 'PARTICULARS')}</Text>
            <Text style={[styles.bodyText, { color: colors.textPrimary }]}>{gr.particulars}</Text>
          </View>
        )}

        <View style={[styles.card, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>GR INFORMATION</Text>
          <View style={styles.grid}>
            <Field label="Source" value={SOURCE_LABELS[gr.source] ?? gr.source ?? '—'} />
            {gr.grSourceLabel && <Field label="GR Source (Excel)" value={gr.grSourceLabel} />}
          </View>
        </View>

        {(gr.grDate || gr.transportCompanyName || gr.ewbNumber || gr.billType || gr.packageType || gr.chalaanNo || gr.chalaanDate || gr.transportGrn) && (
          <View style={[styles.card, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}>
            <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>SLIP DETAILS</Text>
            <View style={styles.grid}>
              {gr.grDate && <Field label="GR Date" value={formatDate(gr.grDate)} />}
              {gr.transportCompanyName && <Field label="Transport Company" value={gr.transportCompanyName} />}
              {gr.billType && <Field label="Bill Type" value={gr.billType} />}
              {gr.ewbNumber && <Field label="EWB Number" value={gr.ewbNumber} />}
              {gr.packageType && <Field label="Package Type" value={gr.packageType} />}
              {gr.chalaanNo && <Field label="Chalaan Number" value={gr.chalaanNo} />}
              {gr.chalaanDate && <Field label="Chalaan Date" value={formatDate(gr.chalaanDate)} />}
              {gr.transportGrn && <Field label="Transport GRN" value={gr.transportGrn} />}
            </View>
          </View>
        )}

        {(gr.proprietorName || gr.proprietorPhone) && (
          <View style={[styles.card, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}>
            <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>TRANSPORT DETAILS</Text>
            <View style={styles.grid}>
              {gr.proprietorName && <Field label="Proprietor" value={gr.proprietorName} />}
              {gr.proprietorPhone && <Field label="Transport Phone Number" value={gr.proprietorPhone} />}
            </View>
          </View>
        )}

        <View style={[styles.card, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>CHARGES</Text>

          <View style={styles.billSummaryRow}>
            <View style={styles.billSummaryBlock}>
              <Text style={[styles.billSummaryLabel, { color: colors.textMuted }]}>TOTAL BILL</Text>
              <Text style={[styles.billSummaryValue, { color: colors.textPrimary }]}>{formatCurrency(gr.toPay ?? 0)}</Text>
            </View>
            <TouchableOpacity style={styles.billSummaryBlock} onPress={openReceivePayment} activeOpacity={0.7}>
              <Text style={[styles.billSummaryLabel, { color: colors.textMuted }]}>PAID AMOUNT</Text>
              <Text style={[styles.billSummaryValue, { color: '#10B981' }]}>{formatCurrency(totalPaid)}</Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.remainingRow, { borderTopColor: colors.border }]}>
            {balance > 0 ? (
              <>
                <Text style={[styles.billSummaryLabel, { color: colors.textMuted }]}>REMAINING / TO PAY</Text>
                <Text style={[styles.remainingValue, { color: '#F97316' }]}>{formatCurrency(balance)}</Text>
              </>
            ) : (
              <View style={styles.fullyPaidRow}>
                <Ionicons name="checkmark-circle" size={18} color="#10B981" />
                <Text style={[styles.fullyPaidText, { color: '#10B981' }]}>Fully Paid — ₹0 Remaining</Text>
              </View>
            )}
          </View>

          {balance > 0 && (
            <TouchableOpacity
              style={[styles.receivePaymentInlineBtn, { backgroundColor: colors.primary, borderRadius: radii.md }]}
              onPress={openReceivePayment}
              activeOpacity={0.85}
            >
              <Ionicons name="add" size={16} color={colors.onPrimary} />
              <Text style={[styles.receivePaymentInlineBtnText, { color: colors.onPrimary }]}>{t('payment.receivePayment')}</Text>
            </TouchableOpacity>
          )}

          {(gr.paymentMode || gr.rate != null || gr.goodsValue != null || gr.grCharge != null || gr.freight != null || gr.labour != null || gr.pf != null || gr.doorDelivery != null || gr.taxGst != null || gr.netAmount != null) && (
            <View style={[styles.grid, { marginTop: 14 }]}>
              {gr.paymentMode && <Field label="Payment Mode" value={formatPaymentMode(gr.paymentMode)} />}
              {gr.rate != null && <Field label="Rate" value={String(gr.rate)} />}
              {gr.goodsValue != null && <Field label="Goods Value" value={String(gr.goodsValue)} />}
              {gr.grCharge != null && <Field label="GR Charge" value={String(gr.grCharge)} />}
              {gr.freight != null && <Field label="Freight" value={String(gr.freight)} />}
              {gr.labour != null && <Field label="Labour" value={String(gr.labour)} />}
              {gr.pf != null && <Field label="P.F." value={String(gr.pf)} />}
              {gr.doorDelivery != null && <Field label="Door Delivery" value={String(gr.doorDelivery)} />}
              {gr.taxGst != null && <Field label="Tax (GST)" value={String(gr.taxGst)} />}
              {gr.netAmount != null && <Field label="Net Amount" value={String(gr.netAmount)} />}
            </View>
          )}
        </View>

        {/* Payment History */}
        {payments.length > 0 && (
          <View style={[styles.card, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}>
            <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>{t('payment.paymentHistory')} ({paymentCount})</Text>
            <View style={styles.paymentList}>
              {payments.map((p) => {
                const recorderName = resolveRecorderName(p.recordedBy);
                return (
                  <View key={p.id} style={[styles.paymentRow, { borderBottomColor: colors.border }]}>
                    <View style={styles.paymentRowLeft}>
                      <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                      <View>
                        <Text style={[styles.paymentRowAmount, { color: colors.textPrimary }]}>{formatCurrency(p.amount)}</Text>
                        <Text style={[styles.paymentRowMeta, { color: colors.textSecondary }]}>
                          {formatPaymentModeWithReceiver(p.paymentMethod, p.receivedBy)}{recorderName ? ` · Recorded by ${recorderName}` : ''}
                        </Text>
                        <Text style={[styles.paymentRowDate, { color: colors.textMuted }]}>{formatDate(p.createdAt)}</Text>
                      </View>
                    </View>
                    {p.notes && <Text style={[styles.paymentRowNote, { color: colors.textMuted }]} numberOfLines={1}>{p.notes}</Text>}
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {gr.notes && (
          <View style={[styles.card, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}>
            <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>REMARKS</Text>
            <Text style={[styles.bodyText, { color: colors.textPrimary }]}>{gr.notes}</Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.statusButton, { backgroundColor: colors.primary, borderRadius: radii.md, opacity: updating ? 0.6 : 1 }]}
          onPress={() => setStatusPickerOpen(true)}
          disabled={updating}
          activeOpacity={0.85}
        >
          <Ionicons name="sync-outline" size={16} color={colors.onPrimary} />
          <Text style={[styles.statusButtonText, { color: colors.onPrimary }]}>{updating ? t('createGR.updating') : t('createGR.updateStatus')}</Text>
        </TouchableOpacity>

        <View style={[styles.card, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>SLIP / DOCUMENTS</Text>
            <TouchableOpacity
              style={[styles.uploadButton, { borderColor: colors.primary, borderRadius: radii.pill, opacity: uploading ? 0.6 : 1 }]}
              onPress={handleUploadSlip}
              disabled={uploading}
            >
              {uploading ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <>
                  <Ionicons name="camera-outline" size={14} color={colors.primary} />
                  <Text style={[styles.uploadButtonText, { color: colors.primary }]}>
                    {gr.attachments.length > 0 ? t('createGR.replaceSlip') : t('createGR.uploadSlip')}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
          {gr.attachments.length === 0 ? (
            <Text style={[styles.noSlip, { color: colors.textMuted }]}>No slip or photos uploaded yet.</Text>
          ) : (
            <View style={{ gap: 8, marginTop: 8 }}>
              {gr.attachments.map((a) => (
                <TouchableOpacity
                  key={a.id}
                  style={[styles.attachmentRow, { backgroundColor: colors.surfaceMuted, borderRadius: radii.md }]}
                  onPress={() => setPreviewAttachment(a)}
                >
                  <Ionicons name={a.mimeType.startsWith('image/') ? 'image-outline' : 'document-text-outline'} size={18} color={colors.primary} />
                  <Text style={[styles.attachmentName, { color: colors.textPrimary }]} numberOfLines={1}>{a.originalFilename}</Text>
                  <Ionicons name="eye-outline" size={16} color={colors.textMuted} />
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        <Text style={[styles.createdAt, { color: colors.textMuted }]}>Created {formatDate(gr.createdAt)}</Text>
      </ScrollView>

      <AttachmentViewerModal attachment={previewAttachment} onClose={() => setPreviewAttachment(null)} />

      {/* Receive Payment Bottom Sheet */}
      <Modal visible={receivePaymentOpen} transparent animationType="slide" onRequestClose={closeReceivePayment}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.background, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>{t('payment.receivePayment')}</Text>
              <TouchableOpacity onPress={closeReceivePayment} hitSlop={8}>
                <Ionicons name="close" size={22} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <View style={styles.paymentForm}>
              {paymentError && (
                <View style={[styles.paymentErrorBanner, { backgroundColor: colors.errorSoft, borderRadius: radii.md }]}>
                  <Ionicons name="alert-circle-outline" size={16} color={colors.error} />
                  <Text style={[styles.paymentErrorText, { color: colors.error }]}>{paymentError}</Text>
                </View>
              )}
              <View style={styles.paymentFormRow}>
                <Text style={[styles.paymentFormLabel, { color: colors.textMuted }]}>{t('payment.totalAmount')}</Text>
                <Text style={[styles.paymentFormValue, { color: colors.textPrimary }]}>{formatCurrency(gr.toPay ?? 0)}</Text>
              </View>
              <View style={styles.paymentFormRow}>
                <Text style={[styles.paymentFormLabel, { color: colors.textMuted }]}>{t('payment.paid')}</Text>
                <Text style={[styles.paymentFormValue, { color: '#10B981' }]}>{formatCurrency(totalPaid)}</Text>
              </View>
              <View style={[styles.paymentFormRow, { borderBottomWidth: 0 }]}>
                <Text style={[styles.paymentFormLabel, { color: colors.textMuted }]}>{t('payment.balance')}</Text>
                <Text style={[styles.paymentFormValue, { color: '#F97316', fontWeight: '800' }]}>{formatCurrency(balance)}</Text>
              </View>
              {isStaffUser ? (
                <View style={styles.collectedByRow}>
                  <Ionicons name="person-circle-outline" size={16} color={colors.primary} />
                  <Text style={[styles.collectedByText, { color: colors.textSecondary }]}>
                    {t('payment.collectedByYou', 'Collected by you')} ({currentUser?.fullName})
                  </Text>
                </View>
              ) : collectorOptions.length > 0 ? (
                <>
                  <Text style={[styles.paymentFormSectionTitle, { color: colors.textMuted }]}>{t('payment.collectedBy', 'Collected By (optional)')}</Text>
                  <View style={styles.collectorChipRow}>
                    {collectorOptions.map((opt) => {
                      const selected = collectedByStaffId === opt.id;
                      return (
                        <TouchableOpacity
                          key={opt.id}
                          style={[
                            styles.collectorChip,
                            { borderRadius: radii.pill, borderColor: selected ? colors.primary : colors.border },
                            selected && { backgroundColor: colors.primary },
                          ]}
                          onPress={() => setCollectedByStaffId(selected ? null : opt.id)}
                          activeOpacity={0.85}
                        >
                          <Text style={[styles.collectorChipText, { color: selected ? colors.onPrimary : colors.textPrimary }]}>
                            {opt.fullName}{opt.area ? ` · ${opt.area}` : ''}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </>
              ) : null}
              <Text style={[styles.paymentFormSectionTitle, { color: colors.textMuted }]}>{t('payment.enterAmount')}</Text>
              <TextInput
                style={[styles.paymentInput, { color: colors.textPrimary, backgroundColor: colors.surface, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border }]}
                placeholder={`${t('payment.enterAmount')} (₹)`}
                placeholderTextColor={colors.textMuted}
                value={paymentAmount}
                onChangeText={setPaymentAmount}
                keyboardType="numeric"
                autoFocus
              />
              <Text style={[styles.paymentFormSectionTitle, { color: colors.textMuted }]}>{t('payment.paymentMode', 'Payment Mode')}</Text>
              <View style={styles.collectorChipRow}>
                {/* Payment mode tells the system where the money went — Admin
                 * UPI / Staff UPI each set `paymentMode` + `receivedBy`
                 * together, no separate "Received By" selector. */}
                {RECEIVE_PAYMENT_OPTIONS.map((opt) => {
                  const selected = paymentMode === opt.paymentMethod && receivedBy === opt.receivedBy;
                  return (
                    <TouchableOpacity
                      key={opt.id}
                      style={[
                        styles.collectorChip,
                        { borderRadius: radii.pill, borderColor: selected ? colors.primary : colors.border },
                        selected && { backgroundColor: colors.primary },
                      ]}
                      onPress={() => {
                        setPaymentMode(opt.paymentMethod);
                        setReceivedBy(opt.receivedBy);
                      }}
                      activeOpacity={0.85}
                    >
                      <Text style={[styles.collectorChipText, { color: selected ? colors.onPrimary : colors.textPrimary }]}>
                        {t(opt.labelKey, opt.label)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {receivedBy === 'ADMIN' && (
                <View style={[styles.adminReceivedNote, { backgroundColor: colors.warningSoft, borderRadius: radii.md }]}>
                  <Ionicons name="information-circle-outline" size={16} color={colors.warning} />
                  <Text style={[styles.adminReceivedNoteText, { color: colors.textPrimary }]}>
                    {t('payment.receivedByAdminNote')}
                  </Text>
                </View>
              )}
              <TextInput
                style={[styles.paymentInput, { color: colors.textPrimary, backgroundColor: colors.surface, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, marginTop: 12 }]}
                placeholder={t('payment.notes')}
                placeholderTextColor={colors.textMuted}
                value={paymentNotes}
                onChangeText={setPaymentNotes}
              />
              <TouchableOpacity
                style={[styles.receivePaymentBtn, { backgroundColor: colors.primary, borderRadius: radii.md, marginTop: 20, opacity: submittingPayment ? 0.6 : 1 }]}
                onPress={handleReceivePayment}
                disabled={submittingPayment}
                activeOpacity={0.85}
              >
                {submittingPayment ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle-outline" size={16} color="#fff" />
                    <Text style={[styles.receivePaymentBtnText, { color: '#fff' }]}>{t('payment.confirmReceive')}</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Status picker */}
      <Modal visible={statusPickerOpen} animationType="slide" transparent onRequestClose={() => setStatusPickerOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.background, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>{t('createGR.updateStatus')}</Text>
              <TouchableOpacity onPress={() => setStatusPickerOpen(false)} hitSlop={8}>
                <Ionicons name="close" size={22} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 420 }}>
              <View style={[styles.optionRow, { borderBottomColor: colors.border }]}>
                <Text style={[styles.optionName, { color: colors.textMuted }]}>
                  Current: {STATUS_LABELS[gr?.status ?? ''] || gr?.status}
                </Text>
                <Ionicons name="checkmark" size={18} color={colors.primary} />
              </View>
              {(() => {
                // Transitions THIS role may perform from the GR's current
                // status — Staff = Pending → Delivered only (backend enforces
                // the same). Admin keeps every option.
                const targets = allowedGrStatusTargets(currentUser?.role, gr?.status ?? '')
                  .filter((s) => s !== gr?.status);
                if (targets.length === 0) {
                  return (
                    <Text style={[styles.optionName, { color: colors.textMuted, padding: 16 }]}>
                      No status changes available for this GR.
                    </Text>
                  );
                }
                return targets.map((status) => (
                  <TouchableOpacity key={status} style={[styles.optionRow, { borderBottomColor: colors.border }]} onPress={() => updateStatus(status)} disabled={updating}>
                    <Text style={[styles.optionName, { color: colors.textPrimary }]}>{STATUS_LABELS[status] || status}</Text>
                    {updating ? null : <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />}
                  </TouchableOpacity>
                ));
              })()}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const Field = ({ label, value }: { label: string; value: string }) => {
  const theme = useAppTheme();
  const styles = createStyles(theme);
  return (
    <View style={styles.gridItem}>
      <Text style={[styles.label, { color: theme.colors.textMuted }]}>{label.toUpperCase()}</Text>
      <Text style={[styles.fieldValue, { color: theme.colors.textPrimary, fontSize: theme.fonts.size.sm }]}>{value}</Text>
    </View>
  );
};

const createStyles = (theme: Pick<AppTheme, 'colors' | 'spacing' | 'radii' | 'fonts' | 'shadows'>) =>
  StyleSheet.create({
    safe: { flex: 1 },
    centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: theme.spacing.lg },
    scrollContent: { paddingBottom: 48, paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.lg, gap: theme.spacing.md },
    shimmer: { borderRadius: theme.radii.lg },
    titleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
    label: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
    grNo: { fontSize: theme.fonts.size.xl, fontWeight: '800', marginTop: 2 },
    trackingCode: { fontSize: theme.fonts.size.xs, marginTop: 4 },
    card: { padding: 16, gap: 8 },
    sectionTitle: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
    sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    routeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    routeText: { fontSize: theme.fonts.size.sm, fontWeight: '600', flex: 1 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.md },
    gridItem: { minWidth: '45%', flexGrow: 1 },
    fieldValue: { fontWeight: '700', marginTop: 3 },
    bodyText: { fontSize: theme.fonts.size.sm, fontWeight: '600' },
    assignRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
    assignLabel: { fontSize: theme.fonts.size.sm, fontWeight: '600', width: 50 },
    assignValue: { flex: 1, fontSize: theme.fonts.size.sm, fontWeight: '700' },
    statusButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14 },
    statusButtonText: { fontWeight: '800', fontSize: theme.fonts.size.md },
    uploadButton: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6 },
    uploadButtonText: { fontSize: theme.fonts.size.xs, fontWeight: '800' },
    noSlip: { fontSize: theme.fonts.size.sm, fontStyle: 'italic' },
    attachmentRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
    attachmentName: { flex: 1, fontSize: theme.fonts.size.sm, fontWeight: '600' },
    createdAt: { fontSize: theme.fonts.size.xs, textAlign: 'center', fontWeight: '600' },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    modalSheet: { padding: theme.spacing.lg, maxHeight: '70%' },
    modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: theme.spacing.md },
    modalTitle: { fontSize: theme.fonts.size.lg, fontWeight: '800' },
    emptyOptions: { textAlign: 'center', paddingVertical: 24, fontSize: theme.fonts.size.sm },
    optionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
    optionName: { fontSize: theme.fonts.size.md, fontWeight: '600' },
    // Payment styles
    paymentSummaryHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    paymentSummaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.border },
    paymentSummaryItem: { flex: 1, alignItems: 'center' },
    paymentSummaryValue: { fontSize: theme.fonts.size.lg, fontWeight: '800' },
    paymentSummaryLabel: { fontSize: theme.fonts.size.xs, fontWeight: '600', marginTop: 2 },
    paymentSummaryDivider: { width: 1, height: 40 },
    receivePaymentBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, marginTop: 12 },
    receivePaymentBtnText: { fontWeight: '800', fontSize: theme.fonts.size.md },
    paymentList: { gap: 0 },
    paymentRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
    paymentRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    paymentRowAmount: { fontSize: theme.fonts.size.md, fontWeight: '700' },
    paymentRowMeta: { fontSize: theme.fonts.size.xs, fontWeight: '600', marginTop: 1 },
    paymentRowDate: { fontSize: theme.fonts.size.xs, marginTop: 1 },
    billSummaryRow: { flexDirection: 'row', marginTop: 10 },
    billSummaryBlock: { flex: 1, gap: 2 },
    billSummaryLabel: { fontSize: theme.fonts.size.xs, fontWeight: '700', letterSpacing: 0.5 },
    billSummaryValue: { fontSize: theme.fonts.size.xl, fontWeight: '800' },
    remainingRow: { marginTop: 14, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, gap: 2 },
    remainingValue: { fontSize: theme.fonts.size.xl, fontWeight: '800' },
    fullyPaidRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    fullyPaidText: { fontSize: theme.fonts.size.md, fontWeight: '800' },
    receivePaymentInlineBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, marginTop: 14 },
    receivePaymentInlineBtnText: { fontSize: theme.fonts.size.sm, fontWeight: '700' },
    paymentRowNote: { fontSize: theme.fonts.size.xs, maxWidth: 120 },
    paymentForm: { gap: 0 },
    paymentFormRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border },
    paymentFormLabel: { fontSize: theme.fonts.size.sm, fontWeight: '600' },
    paymentFormValue: { fontSize: theme.fonts.size.md, fontWeight: '700' },
    paymentFormSectionTitle: { fontSize: theme.fonts.size.sm, fontWeight: '700', marginTop: 16, marginBottom: 8 },
    paymentErrorBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, marginBottom: 12 },
    paymentErrorText: { flex: 1, fontSize: theme.fonts.size.sm, fontWeight: '600' },
    collectedByRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16 },
    collectedByText: { fontSize: theme.fonts.size.sm, fontWeight: '600' },
    collectorChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    collectorChip: { paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1 },
    collectorChipText: { fontSize: theme.fonts.size.xs, fontWeight: '700' },
    adminReceivedNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 10, marginTop: 10 },
    adminReceivedNoteText: { flex: 1, fontSize: theme.fonts.size.xs, fontWeight: '600', lineHeight: 16 },
    paymentInput: { paddingHorizontal: 14, paddingVertical: 12, fontSize: theme.fonts.size.md },
  });

export default AdminGRDetailsScreen;
