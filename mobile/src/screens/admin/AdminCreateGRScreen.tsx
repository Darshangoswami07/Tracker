import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/useAppTheme';
import { useUserStore } from '../../store/userStore';
import { api } from '../../api/client';
import { ENDPOINTS } from '../../api/endpoints';
import { Header } from '../../components/Header';
import { useAppNav } from '../../hooks/useAppNav';
import type { AppTheme } from '../../theme/types';

/** Roles that pick a target company explicitly, matching the web Create GR
 * modal (`admin/src/app/dashboard/orders/page.tsx`'s `CreateGRModal`) —
 * every other GR-access role always creates under their own company; the
 * backend ignores `companyId` in the payload for them. */
const SUPER_ADMIN_TIER_ROLES = ['admin', 'super_admin', 'dispatcher'];
/** Backend requires a syntactically valid UUID in the payload even though it
 * discards it for non-Super-Admin callers (`create_gr` in `backend/app/api/v1/gr.py`
 * always resolves the real company from `effective_company_id`). */
const NIL_UUID = '00000000-0000-0000-0000-000000000000';

interface CompanyOption {
  id: string;
  name: string;
}

interface FormState {
  grNumber: string;
  companyId: string;
  consignorName: string;
  consigneeName: string;
  pickupAddress: string;
  deliveryAddress: string;
  pickupTime: string;
  particulars: string;
  packageCount: string;
  weight: string;
}

const initialForm = (defaultCompanyId: string): FormState => ({
  grNumber: '',
  companyId: defaultCompanyId,
  consignorName: '',
  consigneeName: '',
  pickupAddress: '',
  deliveryAddress: '',
  pickupTime: new Date().toISOString().slice(0, 16).replace('T', ' '),
  particulars: '',
  packageCount: '',
  weight: '',
});

/**
 * Mobile equivalent of the web `CreateGRModal`
 * (`admin/src/app/dashboard/orders/page.tsx`). Submits the exact same
 * `POST /admin/orders` payload contract. On success it replaces itself with
 * the new GR's details screen, and the GR list refetches on next focus.
 */
export const AdminCreateGRScreen = () => {
  const { colors, spacing, radii, fonts, shadows } = useAppTheme();
  const { goBack, navigate } = useAppNav();
  const role = useUserStore((state) => state.user?.role) ?? '';
  const isSuperAdminTier = SUPER_ADMIN_TIER_ROLES.includes(role);

  const styles = createStyles({ colors, spacing, radii, fonts, shadows });

  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [loadingCompanies, setLoadingCompanies] = useState(isSuperAdminTier);
  const [companyPickerOpen, setCompanyPickerOpen] = useState(false);
  const [form, setForm] = useState<FormState>(initialForm(isSuperAdminTier ? '' : NIL_UUID));
  const [submitting, setSubmitting] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  useEffect(() => {
    if (!isSuperAdminTier) return;
    (async () => {
      try {
        const res = await api.get(ENDPOINTS.admin.companies, { params: { page_size: 100 } });
        setCompanies(res.data?.data?.items ?? []);
      } catch {
        // Non-fatal — the picker just stays empty; submit is blocked without a company.
      } finally {
        setLoadingCompanies(false);
      }
    })();
  }, [isSuperAdminTier]);

  const set = (key: keyof FormState) => (value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  const selectedCompanyName = companies.find((c) => c.id === form.companyId)?.name;

  const canSubmit =
    form.grNumber.trim() &&
    form.companyId &&
    form.consignorName.trim() &&
    form.consigneeName.trim() &&
    form.pickupAddress.trim() &&
    form.deliveryAddress.trim() &&
    form.pickupTime.trim() &&
    !submitting;

  const handleSubmit = async () => {
    const parsedPickup = new Date(form.pickupTime.replace(' ', 'T'));
    if (Number.isNaN(parsedPickup.getTime())) {
      setErrorText('Enter a valid pickup date/time, e.g. 2026-08-20 14:30.');
      return;
    }
    setSubmitting(true);
    setErrorText(null);
    try {
      const res = await api.post(ENDPOINTS.admin.orders.create, {
        grNumber: form.grNumber.trim(),
        companyId: form.companyId,
        consignorName: form.consignorName.trim(),
        consigneeName: form.consigneeName.trim(),
        pickupAddress: form.pickupAddress.trim(),
        deliveryAddress: form.deliveryAddress.trim(),
        pickupTime: parsedPickup.toISOString(),
        particulars: form.particulars.trim() || undefined,
        packageCount: form.packageCount.trim() ? Number(form.packageCount) : undefined,
        weight: form.weight.trim() ? Number(form.weight) : undefined,
      });
      const created = res.data?.data;
      Alert.alert('GR Created', `GR ${created?.orderNumber ?? form.grNumber} was created successfully.`);
      if (created?.id) {
        navigate('GRDetails', { orderId: created.id });
      } else {
        goBack();
      }
    } catch (err: any) {
      setErrorText(
        err?.response?.data?.error?.message ??
          (err?.message === 'Network Error' ? 'Unable to connect to the server.' : 'Could not create the GR. Please try again.')
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <Header title="Create GR" leftAction={{ icon: 'chevron-back', onPress: goBack }} />
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {errorText && (
          <View style={[styles.errorCard, { backgroundColor: `${colors.error}12`, borderRadius: radii.lg }]}>
            <Ionicons name="alert-circle-outline" size={18} color={colors.error} />
            <Text style={[styles.errorText, { color: colors.error }]}>{errorText}</Text>
          </View>
        )}

        <Field label="GR Number" required value={form.grNumber} onChangeText={set('grNumber')} placeholder="e.g. GR100234" autoCapitalize="characters" />

        {isSuperAdminTier && (
          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: colors.textMuted }]}>COMPANY *</Text>
            <TouchableOpacity
              style={[styles.selectInput, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radii.md }]}
              onPress={() => setCompanyPickerOpen(true)}
              disabled={loadingCompanies}
            >
              {loadingCompanies ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text style={[styles.selectText, { color: selectedCompanyName ? colors.textPrimary : colors.textMuted }]}>
                  {selectedCompanyName ?? 'Select a company'}
                </Text>
              )}
              <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        )}

        <Field label="Consignor Name" required value={form.consignorName} onChangeText={set('consignorName')} placeholder="Sender name" />
        <Field label="Consignee Name" required value={form.consigneeName} onChangeText={set('consigneeName')} placeholder="Receiver name" />
        <Field label="Pickup Address" required value={form.pickupAddress} onChangeText={set('pickupAddress')} placeholder="Origin address" multiline />
        <Field label="Delivery Address" required value={form.deliveryAddress} onChangeText={set('deliveryAddress')} placeholder="Destination address" multiline />
        <Field
          label="Pickup Date/Time"
          required
          value={form.pickupTime}
          onChangeText={set('pickupTime')}
          placeholder="YYYY-MM-DD HH:mm"
        />
        <Field label="Particulars" value={form.particulars} onChangeText={set('particulars')} placeholder="Description of goods (optional)" multiline />
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Field label="Package Count" value={form.packageCount} onChangeText={set('packageCount')} placeholder="0" keyboardType="number-pad" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Weight (kg)" value={form.weight} onChangeText={set('weight')} placeholder="0" keyboardType="decimal-pad" />
          </View>
        </View>

        <TouchableOpacity
          style={[styles.submitButton, { backgroundColor: colors.primary, borderRadius: radii.md, opacity: canSubmit ? 1 : 0.5 }]}
          onPress={handleSubmit}
          disabled={!canSubmit}
          activeOpacity={0.85}
        >
          {submitting ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={[styles.submitText, { color: colors.onPrimary }]}>Create GR</Text>}
        </TouchableOpacity>
      </ScrollView>

      <Modal visible={companyPickerOpen} animationType="slide" transparent onRequestClose={() => setCompanyPickerOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.background, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Select Company</Text>
              <TouchableOpacity onPress={() => setCompanyPickerOpen(false)} hitSlop={8}>
                <Ionicons name="close" size={22} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 360 }}>
              {companies.length === 0 ? (
                <Text style={[styles.emptyCompanies, { color: colors.textMuted }]}>No companies found.</Text>
              ) : (
                companies.map((c) => (
                  <TouchableOpacity
                    key={c.id}
                    style={[styles.companyRow, { borderBottomColor: colors.border }]}
                    onPress={() => {
                      set('companyId')(c.id);
                      setCompanyPickerOpen(false);
                    }}
                  >
                    <Text style={[styles.companyName, { color: colors.textPrimary }]}>{c.name}</Text>
                    {form.companyId === c.id && <Ionicons name="checkmark" size={18} color={colors.primary} />}
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
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
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  keyboardType?: 'default' | 'number-pad' | 'decimal-pad';
}

const Field = ({ label, value, onChangeText, placeholder, required, multiline, autoCapitalize, keyboardType }: FieldProps) => {
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
        autoCapitalize={autoCapitalize ?? 'sentences'}
        keyboardType={keyboardType ?? 'default'}
      />
    </View>
  );
};

const createStyles = (theme: Pick<AppTheme, 'colors' | 'spacing' | 'radii' | 'fonts' | 'shadows'>) =>
  StyleSheet.create({
    safe: { flex: 1 },
    scrollContent: { padding: theme.spacing.lg, paddingBottom: 60, gap: theme.spacing.sm },
    errorCard: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, marginBottom: theme.spacing.sm },
    errorText: { flex: 1, fontSize: theme.fonts.size.sm, fontWeight: '600' },
    fieldGroup: { marginBottom: theme.spacing.md },
    label: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5, marginBottom: 6 },
    input: { borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: theme.fonts.size.md },
    inputMultiline: { minHeight: 70, textAlignVertical: 'top' },
    selectInput: { borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    selectText: { fontSize: theme.fonts.size.md, fontWeight: '600' },
    row: { flexDirection: 'row', gap: theme.spacing.md },
    submitButton: { paddingVertical: 16, alignItems: 'center', justifyContent: 'center', marginTop: theme.spacing.md },
    submitText: { fontWeight: '800', fontSize: theme.fonts.size.md },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    modalSheet: { padding: theme.spacing.lg, maxHeight: '70%' },
    modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: theme.spacing.md },
    modalTitle: { fontSize: theme.fonts.size.lg, fontWeight: '800' },
    emptyCompanies: { textAlign: 'center', paddingVertical: 24, fontSize: theme.fonts.size.sm },
    companyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
    companyName: { fontSize: theme.fonts.size.md, fontWeight: '600' },
  });

export default AdminCreateGRScreen;
