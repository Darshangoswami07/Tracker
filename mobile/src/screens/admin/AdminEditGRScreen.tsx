import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/useAppTheme';
import { orderRepository } from '../../database/repositories/orderRepository';
import { Header } from '../../components/Header';
import { ShimmerCard } from '../../components/ShimmerCard';
import { EmptyState } from '../../components/EmptyState';
import { useAppNav } from '../../hooks/useAppNav';
import { useTranslation } from 'react-i18next';
import type { AppTheme } from '../../theme/types';

/** Simple Bill Type choices — matches `AdminCreateGRScreen`'s toggle. */
const BILL_TYPE_OPTIONS = ['To Pay', 'Paid'] as const;

/** Every field `orderRepository.update` (`GRUpdateInput`) accepts — i.e.
 * every field a GR can carry except `grNumber`/`companyId`/`pickupTime`
 * (intentionally not editable: GR number is the record's identity,
 * `pickupTime` is derived from GR Date at creation and not surfaced as its
 * own field anywhere else in the app either). Mirrors `AdminCreateGRScreen`'s
 * `FormState` plus the fields Create doesn't ask for but Detail/Excel import
 * do (Paid Amount, Chalaan/Transport GRN/Payment Mode, GSTIN/phone pairs).
 */
interface FormState {
  consignorName: string;
  consigneeName: string;
  pickupAddress: string;
  deliveryAddress: string;
  particulars: string;
  packageCount: string;
  packageType: string;
  weight: string;
  notes: string;
  grDate: string;
  transportCompanyName: string;
  ewbNumber: string;
  billType: string;
  fromLocation: string;
  toLocation: string;
  rate: string;
  goodsValue: string;
  grCharge: string;
  freight: string;
  labour: string;
  pf: string;
  doorDelivery: string;
  taxGst: string;
  netAmount: string;
  paymentAmount: string;
  toPay: string;
  proprietorName: string;
  proprietorPhone: string;
  consignorGstin: string;
  consignorPhone: string;
  consigneeGstin: string;
  consigneePhone: string;
  chalaanNo: string;
  chalaanDate: string;
  transportGrn: string;
  paymentMode: string;
}

const emptyForm: FormState = {
  consignorName: '',
  consigneeName: '',
  pickupAddress: '',
  deliveryAddress: '',
  particulars: '',
  packageCount: '',
  packageType: '',
  weight: '',
  notes: '',
  grDate: '',
  transportCompanyName: '',
  ewbNumber: '',
  billType: '',
  fromLocation: '',
  toLocation: '',
  rate: '',
  goodsValue: '',
  grCharge: '',
  freight: '',
  labour: '',
  pf: '',
  doorDelivery: '',
  taxGst: '',
  netAmount: '',
  paymentAmount: '',
  toPay: '',
  proprietorName: '',
  proprietorPhone: '',
  consignorGstin: '',
  consignorPhone: '',
  consigneeGstin: '',
  consigneePhone: '',
  chalaanNo: '',
  chalaanDate: '',
  transportGrn: '',
  paymentMode: '',
};

/** ISO datetime -> `YYYY-MM-DD` for the date text fields, matching the format
 * `AdminCreateGRScreen`'s GR Date field expects/produces. */
const toDateInput = (iso: string | null | undefined): string => {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
};

/**
 * Lets a GR-access role correct any of a GR's details after creation —
 * every field the record can carry, not just the original 8-field subset
 * (consignor/consignee/addresses/particulars/package count/weight/notes).
 * Matches `AdminCreateGRScreen`'s full section layout (GR Information /
 * Parties / Route / Goods / Charges / Transport Details) so a GR created via
 * Excel import (which populates far more fields than a manual GR) can
 * actually be corrected here instead of silently losing access to most of
 * its data. The record is read and saved through `orderRepository`, which
 * calls the FastAPI backend (`GET`/`PATCH /admin/orders/{id}`, Neon).
 */
export const AdminEditGRScreen = ({ route }: any) => {
  const { orderId } = route.params as { orderId: string };
  const { colors, spacing, radii, fonts, shadows } = useAppTheme();
  const { goBack } = useAppNav();
  const { t } = useTranslation();
  const styles = createStyles({ colors, spacing, radii, fonts, shadows });

  const [orderNumber, setOrderNumber] = useState('');
  const [form, setForm] = useState<FormState>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    charges: false,
    transport: false,
  });
  const toggleSection = (key: string) => setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));

  const fetchDetail = useCallback(async () => {
    try {
      const gr = await orderRepository.getById(orderId);
      if (!gr) {
        setError(t('createGR.grNotFoundEdit'));
        return;
      }
      setOrderNumber(gr.orderNumber ?? '');
      setForm({
        consignorName: gr.consignorName ?? '',
        consigneeName: gr.consigneeName ?? '',
        pickupAddress: gr.pickupAddress ?? '',
        deliveryAddress: gr.deliveryAddress ?? '',
        particulars: gr.particulars ?? '',
        packageCount: gr.packageCount != null ? String(gr.packageCount) : '',
        packageType: gr.packageType ?? '',
        weight: gr.weight != null ? String(gr.weight) : '',
        notes: gr.notes ?? '',
        grDate: toDateInput(gr.grDate),
        transportCompanyName: gr.transportCompanyName ?? '',
        ewbNumber: gr.ewbNumber ?? '',
        billType: gr.billType ?? '',
        fromLocation: gr.fromLocation ?? '',
        toLocation: gr.toLocation ?? '',
        rate: gr.rate != null ? String(gr.rate) : '',
        goodsValue: gr.goodsValue != null ? String(gr.goodsValue) : '',
        grCharge: gr.grCharge != null ? String(gr.grCharge) : '',
        freight: gr.freight != null ? String(gr.freight) : '',
        labour: gr.labour != null ? String(gr.labour) : '',
        pf: gr.pf != null ? String(gr.pf) : '',
        doorDelivery: gr.doorDelivery != null ? String(gr.doorDelivery) : '',
        taxGst: gr.taxGst != null ? String(gr.taxGst) : '',
        netAmount: gr.netAmount != null ? String(gr.netAmount) : '',
        paymentAmount: gr.paymentAmount != null ? String(gr.paymentAmount) : '',
        toPay: gr.toPay != null ? String(gr.toPay) : '',
        proprietorName: gr.proprietorName ?? '',
        proprietorPhone: gr.proprietorPhone ?? '',
        consignorGstin: gr.consignorGstin ?? '',
        consignorPhone: gr.consignorPhone ?? '',
        consigneeGstin: gr.consigneeGstin ?? '',
        consigneePhone: gr.consigneePhone ?? '',
        chalaanNo: gr.chalaanNo ?? '',
        chalaanDate: toDateInput(gr.chalaanDate),
        transportGrn: gr.transportGrn ?? '',
        paymentMode: gr.paymentMode ?? '',
      });
      setError(null);
    } catch (err: any) {
      setError(err?.message ?? t('createGR.couldNotLoadGR'));
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  const set = (key: keyof FormState) => (value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  const canSubmit =
    form.consignorName.trim() &&
    form.consigneeName.trim() &&
    form.pickupAddress.trim() &&
    form.deliveryAddress.trim() &&
    !submitting;

  const handleSubmit = async () => {
    setSubmitting(true);
    setErrorText(null);
    try {
      const num = (value: string): number | undefined => (value.trim() ? Number(value) : undefined);
      const str = (value: string): string | undefined => (value.trim() ? value.trim() : undefined);
      const parsedGrDate = form.grDate.trim() ? new Date(form.grDate.trim()) : null;
      const validGrDate = parsedGrDate && !Number.isNaN(parsedGrDate.getTime()) ? parsedGrDate : null;
      const parsedChalaanDate = form.chalaanDate.trim() ? new Date(form.chalaanDate.trim()) : null;
      const validChalaanDate = parsedChalaanDate && !Number.isNaN(parsedChalaanDate.getTime()) ? parsedChalaanDate : null;

      await orderRepository.update(orderId, {
        consignorName: form.consignorName.trim(),
        consigneeName: form.consigneeName.trim(),
        pickupAddress: form.pickupAddress.trim(),
        deliveryAddress: form.deliveryAddress.trim(),
        particulars: form.particulars.trim() || undefined,
        packageCount: form.packageCount.trim() ? Number(form.packageCount) : undefined,
        packageType: str(form.packageType),
        weight: form.weight.trim() ? Number(form.weight) : undefined,
        notes: form.notes.trim() || undefined,
        grDate: validGrDate ? validGrDate.toISOString() : undefined,
        transportCompanyName: str(form.transportCompanyName),
        ewbNumber: str(form.ewbNumber),
        billType: str(form.billType),
        fromLocation: str(form.fromLocation),
        toLocation: str(form.toLocation),
        rate: num(form.rate),
        goodsValue: num(form.goodsValue),
        grCharge: num(form.grCharge),
        freight: num(form.freight),
        labour: num(form.labour),
        pf: num(form.pf),
        doorDelivery: num(form.doorDelivery),
        taxGst: num(form.taxGst),
        netAmount: num(form.netAmount),
        // Paid Amount is deliberately NOT sent here — it must only ever
        // change via a recorded payment transaction (GR Details → Receive
        // Payment), never a free-text edit, so `payments` stays the single
        // source of truth for how much has actually been collected.
        toPay: num(form.toPay),
        proprietorName: str(form.proprietorName),
        proprietorPhone: str(form.proprietorPhone),
        consignorGstin: str(form.consignorGstin),
        consignorPhone: str(form.consignorPhone),
        consigneeGstin: str(form.consigneeGstin),
        consigneePhone: str(form.consigneePhone),
        chalaanNo: str(form.chalaanNo),
        chalaanDate: validChalaanDate ? validChalaanDate.toISOString() : undefined,
        transportGrn: str(form.transportGrn),
        paymentMode: str(form.paymentMode),
      });
      Alert.alert(t('createGR.updatedTitle'), t('createGR.updatedMessage', { number: orderNumber }));
      goBack();
    } catch (err: any) {
      setErrorText(err?.message ?? t('createGR.couldNotUpdate'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <Header title={t('createGR.title')} leftAction={{ icon: 'chevron-back', onPress: goBack }} />
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <ShimmerCard style={styles.shimmer} height={44} />
          <ShimmerCard style={styles.shimmer} height={44} />
          <ShimmerCard style={styles.shimmer} height={80} />
          <ShimmerCard style={styles.shimmer} height={44} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <Header title={t('createGR.title')} leftAction={{ icon: 'chevron-back', onPress: goBack }} />
        <View style={styles.centerFill}>
          <EmptyState
            icon="cloud-offline-outline"
            title={t('createGR.somethingWrong')}
            subtitle={error}
            actionLabel={t('common.retry')}
            onActionPress={() => {
              setLoading(true);
              fetchDetail();
            }}
            iconColor={colors.error}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <Header title={`Edit GR ${orderNumber}`} leftAction={{ icon: 'chevron-back', onPress: goBack }} />
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {errorText && (
          <View style={[styles.errorCard, { backgroundColor: `${colors.error}12`, borderRadius: radii.lg }]}>
            <Ionicons name="alert-circle-outline" size={18} color={colors.error} />
            <Text style={[styles.errorText, { color: colors.error }]}>{errorText}</Text>
          </View>
        )}

        <Section title="GR Information" expanded>
          <Field label="GR Date" value={form.grDate} onChangeText={set('grDate')} placeholder="YYYY-MM-DD" />
          <Field label="Transport Company" value={form.transportCompanyName} onChangeText={set('transportCompanyName')} placeholder="e.g. Somnath Transport Company" />
          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>BILL TYPE</Text>
            <View style={styles.row}>
              {BILL_TYPE_OPTIONS.map((option) => {
                const selected = form.billType === option;
                return (
                  <TouchableOpacity
                    key={option}
                    style={[
                      styles.billTypeChip,
                      {
                        borderRadius: radii.md,
                        borderColor: selected ? colors.primary : colors.border,
                        backgroundColor: selected ? `${colors.primary}15` : colors.surface,
                      },
                    ]}
                    onPress={() => set('billType')(option)}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.billTypeChipText, { color: selected ? colors.primary : colors.textPrimary }]}>{option}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
          <Field label="EWB Number" value={form.ewbNumber} onChangeText={set('ewbNumber')} placeholder="E-way bill no. (optional)" />
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Field label="Chalaan Number" value={form.chalaanNo} onChangeText={set('chalaanNo')} placeholder="Chalaan no." />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Chalaan Date" value={form.chalaanDate} onChangeText={set('chalaanDate')} placeholder="YYYY-MM-DD" />
            </View>
          </View>
          <Field label="Transport GRN" value={form.transportGrn} onChangeText={set('transportGrn')} placeholder="Transport GRN" />
        </Section>

        <Section title="Parties" expanded>
          <Field label="Consignor Name" required value={form.consignorName} onChangeText={set('consignorName')} placeholder="Sender name" />
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Field label="Consignor GSTIN" value={form.consignorGstin} onChangeText={set('consignorGstin')} placeholder="GSTIN (optional)" />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Consignor Phone" value={form.consignorPhone} onChangeText={set('consignorPhone')} placeholder="Phone (optional)" keyboardType="number-pad" />
            </View>
          </View>
          <Field label="Consignee Name" required value={form.consigneeName} onChangeText={set('consigneeName')} placeholder="Receiver name" />
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Field label="Consignee GSTIN" value={form.consigneeGstin} onChangeText={set('consigneeGstin')} placeholder="GSTIN (optional)" />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Consignee Phone" value={form.consigneePhone} onChangeText={set('consigneePhone')} placeholder="Phone (optional)" keyboardType="number-pad" />
            </View>
          </View>
        </Section>

        <Section title="Route" expanded>
          <Field label="Pickup Address" required value={form.pickupAddress} onChangeText={set('pickupAddress')} placeholder="Origin address" multiline />
          <Field label="Delivery Address" required value={form.deliveryAddress} onChangeText={set('deliveryAddress')} placeholder="Destination address" multiline />
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Field label="From" value={form.fromLocation} onChangeText={set('fromLocation')} placeholder="e.g. Haldwani" />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="To" value={form.toLocation} onChangeText={set('toLocation')} placeholder="e.g. Garur Someshwar" />
            </View>
          </View>
        </Section>

        <Section title="Goods" expanded>
          <Field label="Particulars" value={form.particulars} onChangeText={set('particulars')} placeholder="Description of goods (optional)" multiline />
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Field label="Package Count" value={form.packageCount} onChangeText={set('packageCount')} placeholder="0" keyboardType="number-pad" />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Package Type" value={form.packageType} onChangeText={set('packageType')} placeholder="e.g. Box, Nug" />
            </View>
          </View>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Field label="Weight (kg)" value={form.weight} onChangeText={set('weight')} placeholder="0" keyboardType="decimal-pad" />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Rate" value={form.rate} onChangeText={set('rate')} placeholder="0" keyboardType="decimal-pad" />
            </View>
          </View>
          <Field label="Goods Value" value={form.goodsValue} onChangeText={set('goodsValue')} placeholder="0" keyboardType="decimal-pad" />
        </Section>

        <Section title="Payment / Charges" expanded={expandedSections.charges} onToggle={() => toggleSection('charges')}>
          <Field label="Payment Mode" value={form.paymentMode} onChangeText={set('paymentMode')} placeholder="e.g. Cash, To Pay" />
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Field label="GR Charge" value={form.grCharge} onChangeText={set('grCharge')} placeholder="0" keyboardType="decimal-pad" />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Freight" value={form.freight} onChangeText={set('freight')} placeholder="0" keyboardType="decimal-pad" />
            </View>
          </View>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Field label="Labour" value={form.labour} onChangeText={set('labour')} placeholder="0" keyboardType="decimal-pad" />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="P.F." value={form.pf} onChangeText={set('pf')} placeholder="0" keyboardType="decimal-pad" />
            </View>
          </View>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Field label="Door Delivery" value={form.doorDelivery} onChangeText={set('doorDelivery')} placeholder="0" keyboardType="decimal-pad" />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Tax (GST)" value={form.taxGst} onChangeText={set('taxGst')} placeholder="0" keyboardType="decimal-pad" />
            </View>
          </View>
          <Field label="Net Amount" value={form.netAmount} onChangeText={set('netAmount')} placeholder="0" keyboardType="decimal-pad" />
          <Field label="Total Bill (To Pay)" value={form.toPay} onChangeText={set('toPay')} placeholder="0" keyboardType="decimal-pad" />
          <Text style={[styles.hint, { color: colors.textMuted }]}>
            Paid Amount is no longer edited here — record collections from GR Details → Receive Payment so every payment stays a traceable transaction.
          </Text>
        </Section>

        <Section title="Transport Details" expanded={expandedSections.transport} onToggle={() => toggleSection('transport')}>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Field label="Proprietor" value={form.proprietorName} onChangeText={set('proprietorName')} placeholder="Owner name" />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Transport Phone Number" value={form.proprietorPhone} onChangeText={set('proprietorPhone')} placeholder="Phone number" keyboardType="number-pad" />
            </View>
          </View>
        </Section>

        <Field label="Notes" value={form.notes} onChangeText={set('notes')} placeholder="Internal notes (optional)" multiline />

        <TouchableOpacity
          style={[styles.submitButton, { backgroundColor: colors.primary, borderRadius: radii.md, opacity: canSubmit ? 1 : 0.5 }]}
          onPress={handleSubmit}
          disabled={!canSubmit}
          activeOpacity={0.85}
        >
          {submitting ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={[styles.submitText, { color: colors.onPrimary }]}>{t('createGR.saveChanges')}</Text>}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

interface FieldProps {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  multiline?: boolean;
  keyboardType?: 'default' | 'number-pad' | 'decimal-pad';
}

const Field = ({ label, value, onChangeText, placeholder, required, multiline, keyboardType }: FieldProps) => {
  const theme = useAppTheme();
  const styles = createStyles(theme);
  return (
    <View style={styles.fieldGroup}>
      <Text style={[styles.label, { color: theme.colors.textMuted }]}>
        {label.toUpperCase()} {required ? '*' : ''}
      </Text>
      <TextInput
        style={[
          styles.input,
          multiline && styles.inputMultiline,
          { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, color: theme.colors.textPrimary, borderRadius: theme.radii.md },
        ]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.textMuted}
        multiline={multiline}
        keyboardType={keyboardType ?? 'default'}
      />
    </View>
  );
};

interface SectionProps {
  title: string;
  /** Whether the section's fields are shown. Omit `onToggle` for a section
   * that is always expanded (holds required/commonly-edited fields) — no
   * chevron/tap target is rendered in that case. Matches
   * `AdminCreateGRScreen`'s collapsible-section pattern so a GR with many
   * populated fields (e.g. Excel-imported) doesn't dump everything onto the
   * screen at once. */
  expanded: boolean;
  onToggle?: () => void;
  children: ReactNode;
}

const Section = ({ title, expanded, onToggle, children }: SectionProps) => {
  const theme = useAppTheme();
  const styles = createStyles(theme);
  const HeaderRow = onToggle ? TouchableOpacity : View;
  return (
    <View style={[styles.sectionCard, { backgroundColor: theme.colors.surface, borderRadius: theme.radii.lg }]}>
      <HeaderRow style={styles.sectionHeaderRow} onPress={onToggle} activeOpacity={0.7}>
        <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>{title.toUpperCase()}</Text>
        {onToggle && (
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={theme.colors.textMuted} />
        )}
      </HeaderRow>
      {expanded && <View style={styles.sectionBody}>{children}</View>}
    </View>
  );
};

const createStyles = (theme: Pick<AppTheme, 'colors' | 'spacing' | 'radii' | 'fonts' | 'shadows'>) =>
  StyleSheet.create({
    safe: { flex: 1 },
    centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: theme.spacing.lg },
    scrollContent: { padding: theme.spacing.lg, paddingBottom: 60, gap: theme.spacing.sm },
    shimmer: { borderRadius: theme.radii.lg, marginBottom: theme.spacing.sm },
    errorCard: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, marginBottom: theme.spacing.sm },
    errorText: { flex: 1, fontSize: theme.fonts.size.sm, fontWeight: '600' },
    fieldGroup: { marginBottom: theme.spacing.md },
    hint: { fontSize: theme.fonts.size.xs, fontWeight: '600', marginTop: -4, marginBottom: theme.spacing.sm },
    label: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5, marginBottom: 6 },
    input: { borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: theme.fonts.size.md },
    inputMultiline: { minHeight: 70, textAlignVertical: 'top' },
    row: { flexDirection: 'row', gap: theme.spacing.md },
    billTypeChip: { flex: 1, borderWidth: 1, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
    billTypeChipText: { fontSize: theme.fonts.size.sm, fontWeight: '700' },
    sectionCard: { marginBottom: theme.spacing.md, overflow: 'hidden' },
    sectionHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: theme.spacing.md,
      paddingVertical: 14,
    },
    sectionTitle: { fontSize: 12, fontWeight: '800', letterSpacing: 0.6 },
    sectionBody: { paddingHorizontal: theme.spacing.md, paddingBottom: theme.spacing.md },
    submitButton: { paddingVertical: 16, alignItems: 'center', justifyContent: 'center', marginTop: theme.spacing.md },
    submitText: { fontWeight: '800', fontSize: theme.fonts.size.md },
  });

export default AdminEditGRScreen;
