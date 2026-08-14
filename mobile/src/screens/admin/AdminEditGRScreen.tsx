import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/useAppTheme';
import { api } from '../../api/client';
import { ENDPOINTS } from '../../api/endpoints';
import { Header } from '../../components/Header';
import { ShimmerCard } from '../../components/ShimmerCard';
import { EmptyState } from '../../components/EmptyState';
import { useAppNav } from '../../hooks/useAppNav';
import type { AppTheme } from '../../theme/types';

/** Fields `PATCH /admin/orders/{id}` (`GRUpdateRequest` on the backend)
 * accepts — grNumber, companyId, and pickupTime are intentionally not part
 * of that contract, so they aren't editable here either. */
interface FormState {
  consignorName: string;
  consigneeName: string;
  pickupAddress: string;
  deliveryAddress: string;
  particulars: string;
  packageCount: string;
  weight: string;
  notes: string;
}

const emptyForm: FormState = {
  consignorName: '',
  consigneeName: '',
  pickupAddress: '',
  deliveryAddress: '',
  particulars: '',
  packageCount: '',
  weight: '',
  notes: '',
};

/**
 * Lets a GR-access role correct a GR's details after creation — consignor/
 * consignee, addresses, particulars, package count, weight, notes. Reuses
 * the existing `PATCH /admin/orders/{id}` endpoint (`update_gr` in
 * `backend/app/api/v1/gr.py`), which was already implemented server-side but
 * had no caller on either the web or mobile GR Details screen.
 */
export const AdminEditGRScreen = ({ route }: any) => {
  const { orderId } = route.params as { orderId: string };
  const { colors, spacing, radii, fonts, shadows } = useAppTheme();
  const { goBack } = useAppNav();
  const styles = createStyles({ colors, spacing, radii, fonts, shadows });

  const [orderNumber, setOrderNumber] = useState('');
  const [form, setForm] = useState<FormState>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const fetchDetail = useCallback(async () => {
    try {
      const res = await api.get(ENDPOINTS.admin.orders.detail(orderId));
      const gr = res.data?.data;
      setOrderNumber(gr?.orderNumber ?? '');
      setForm({
        consignorName: gr?.consignorName ?? '',
        consigneeName: gr?.consigneeName ?? '',
        pickupAddress: gr?.pickupAddress ?? '',
        deliveryAddress: gr?.deliveryAddress ?? '',
        particulars: gr?.particulars ?? '',
        packageCount: gr?.packageCount != null ? String(gr.packageCount) : '',
        weight: gr?.weight != null ? String(gr.weight) : '',
        notes: gr?.notes ?? '',
      });
      setError(null);
    } catch (err: any) {
      setError(
        err?.response?.data?.error?.message ??
          (err?.message === 'Network Error' ? 'Unable to connect to the server.' : 'Could not load this GR. Please try again.')
      );
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
      await api.patch(ENDPOINTS.admin.orders.update(orderId), {
        consignorName: form.consignorName.trim(),
        consigneeName: form.consigneeName.trim(),
        pickupAddress: form.pickupAddress.trim(),
        deliveryAddress: form.deliveryAddress.trim(),
        particulars: form.particulars.trim() || undefined,
        packageCount: form.packageCount.trim() ? Number(form.packageCount) : undefined,
        weight: form.weight.trim() ? Number(form.weight) : undefined,
        notes: form.notes.trim() || undefined,
      });
      Alert.alert('GR Updated', `GR ${orderNumber} was updated successfully.`);
      goBack();
    } catch (err: any) {
      setErrorText(
        err?.response?.data?.error?.message ??
          (err?.message === 'Network Error' ? 'Unable to connect to the server.' : 'Could not update the GR. Please try again.')
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <Header title="Edit GR" leftAction={{ icon: 'chevron-back', onPress: goBack }} />
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
        <Header title="Edit GR" leftAction={{ icon: 'chevron-back', onPress: goBack }} />
        <View style={styles.centerFill}>
          <EmptyState
            icon="cloud-offline-outline"
            title="Something went wrong"
            subtitle={error}
            actionLabel="Retry"
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

        <Field label="Consignor Name" required value={form.consignorName} onChangeText={set('consignorName')} placeholder="Sender name" />
        <Field label="Consignee Name" required value={form.consigneeName} onChangeText={set('consigneeName')} placeholder="Receiver name" />
        <Field label="Pickup Address" required value={form.pickupAddress} onChangeText={set('pickupAddress')} placeholder="Origin address" multiline />
        <Field label="Delivery Address" required value={form.deliveryAddress} onChangeText={set('deliveryAddress')} placeholder="Destination address" multiline />
        <Field label="Particulars" value={form.particulars} onChangeText={set('particulars')} placeholder="Description of goods (optional)" multiline />
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Field label="Package Count" value={form.packageCount} onChangeText={set('packageCount')} placeholder="0" keyboardType="number-pad" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Weight (kg)" value={form.weight} onChangeText={set('weight')} placeholder="0" keyboardType="decimal-pad" />
          </View>
        </View>
        <Field label="Notes" value={form.notes} onChangeText={set('notes')} placeholder="Internal notes (optional)" multiline />

        <TouchableOpacity
          style={[styles.submitButton, { backgroundColor: colors.primary, borderRadius: radii.md, opacity: canSubmit ? 1 : 0.5 }]}
          onPress={handleSubmit}
          disabled={!canSubmit}
          activeOpacity={0.85}
        >
          {submitting ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={[styles.submitText, { color: colors.onPrimary }]}>Save Changes</Text>}
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

const createStyles = (theme: Pick<AppTheme, 'colors' | 'spacing' | 'radii' | 'fonts' | 'shadows'>) =>
  StyleSheet.create({
    safe: { flex: 1 },
    centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: theme.spacing.lg },
    scrollContent: { padding: theme.spacing.lg, paddingBottom: 60, gap: theme.spacing.sm },
    shimmer: { borderRadius: theme.radii.lg, marginBottom: theme.spacing.sm },
    errorCard: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, marginBottom: theme.spacing.sm },
    errorText: { flex: 1, fontSize: theme.fonts.size.sm, fontWeight: '600' },
    fieldGroup: { marginBottom: theme.spacing.md },
    label: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5, marginBottom: 6 },
    input: { borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: theme.fonts.size.md },
    inputMultiline: { minHeight: 70, textAlignVertical: 'top' },
    row: { flexDirection: 'row', gap: theme.spacing.md },
    submitButton: { paddingVertical: 16, alignItems: 'center', justifyContent: 'center', marginTop: theme.spacing.md },
    submitText: { fontWeight: '800', fontSize: theme.fonts.size.md },
  });

export default AdminEditGRScreen;
