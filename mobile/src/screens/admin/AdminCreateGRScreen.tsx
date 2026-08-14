import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAppTheme } from '../../theme/useAppTheme';
import { useUserStore } from '../../store/userStore';
import { useAuthStore } from '../../store/authStore';
import { orderRepository } from '../../database/repositories/orderRepository';
import { syncLookupTables } from '../../database/sync';
import { extractSlipDetails, isOcrError, type SlipExtractedFields } from '../../services/slipOcr';
import { persistSlipImage, type PersistedSlip } from '../../services/slipStorage';
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

/** Picks which local value flows into a given manual form field, falling back
 * to the OCR value when the user has not typed anything yet. */
const pickValue = (current: string, ocr: string | null | undefined): string => {
  if (ocr === undefined || ocr === null) return current;
  const trimmed = String(ocr).trim();
  if (!trimmed) return current;
  return current.trim() ? current : trimmed;
};

/** Parses an OCR date (YYYY-MM-DD) into the form's `YYYY-MM-DD HH:mm` shape,
 * keeping today's time when the slip only gives a date. */
const parseOcrDate = (raw: string | null | undefined, fallback: string): string => {
  if (!raw) return fallback;
  const match = String(raw).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return fallback;
  const [, y, m, d] = match;
  return `${y}-${m}-${d} ${fallback.split(' ')[1] ?? '00:00'}`;
};

/** Maps OCR output into the manual form, preserving anything already typed. */
const mapSlipToForm = (slip: SlipExtractedFields, current: FormState): FormState => ({
  grNumber: pickValue(current.grNumber, slip.grNumber),
  companyId: current.companyId,
  consignorName: pickValue(current.consignorName, slip.consignorName),
  consigneeName: pickValue(current.consigneeName, slip.consigneeName),
  pickupAddress: pickValue(current.pickupAddress, slip.fromAddress),
  deliveryAddress: pickValue(current.deliveryAddress, slip.toAddress),
  pickupTime: current.pickupTime.trim() ? current.pickupTime : parseOcrDate(slip.grDate, current.pickupTime),
  particulars: pickValue(current.particulars, slip.particulars),
  packageCount: slip.packageCount != null && !current.packageCount.trim() ? String(slip.packageCount) : current.packageCount,
  weight: slip.weight != null && !current.weight.trim() ? String(slip.weight) : current.weight,
});

type Mode = 'choose' | 'manual' | 'slip';

/**
 * Mobile equivalent of the web `CreateGRModal`
 * (`admin/src/app/dashboard/orders/page.tsx`). In the local-first
 * architecture the GR is created directly in the on-device SQLite
 * repository (`orderRepository.create`) rather than via `POST /admin/orders`,
 * so it works fully offline.
 *
 * Offers two creation modes:
 *   1. Manual — type every field as before.
 *   2. Import From Slip — capture/select a transport slip, run OCR to pre-fill
 *      the form, review/edit, then save. The slip image is copied into the
 *      app's Documents directory and attached to the GR so it stays viewable
 *      offline; the OCR text snapshot is stored in the order's `slipData`.
 *
 * On success it replaces itself with the new GR's details screen, and the GR
 * list refetches on next focus.
 */
export const AdminCreateGRScreen = () => {
  const { colors, spacing, radii, fonts, shadows } = useAppTheme();
  const { goBack, navigate } = useAppNav();
  const role = useUserStore((state) => state.user?.role) ?? '';
  const accessToken = useAuthStore((state) => state.accessToken);
  const isSuperAdminTier = SUPER_ADMIN_TIER_ROLES.includes(role);

  const styles = createStyles({ colors, spacing, radii, fonts, shadows });

  const [mode, setMode] = useState<Mode>('choose');
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [loadingCompanies, setLoadingCompanies] = useState(isSuperAdminTier);
  const [companyPickerOpen, setCompanyPickerOpen] = useState(false);
  const [form, setForm] = useState<FormState>(initialForm(isSuperAdminTier ? '' : NIL_UUID));
  const [submitting, setSubmitting] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  // Slip import state.
  const [slipImage, setSlipImage] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [slipData, setSlipData] = useState<SlipExtractedFields | null>(null);
  const [persistedSlip, setPersistedSlip] = useState<PersistedSlip | null>(null);

  useEffect(() => {
    if (!isSuperAdminTier) {
      setLoadingCompanies(false);
      return;
    }
    let cancelled = false;
    (async () => {
      // Local-first: read the on-device companies immediately so the picker
      // is never stuck on a spinner — it reflects cached data right away.
      setCompanies(await orderRepository.listCompanies());
      if (cancelled) return;
      setLoadingCompanies(false);
      // Then best-effort refresh from the control plane in the background;
      // failures are swallowed by syncLookupTables and leave local data as-is.
      await syncLookupTables(accessToken);
      if (cancelled) return;
      setCompanies(await orderRepository.listCompanies());
    })().catch(() => {
      /* Non-fatal — the picker just stays with cached companies; submit is
         blocked without a selection. */
    });
    return () => {
      cancelled = true;
    };
  }, [isSuperAdminTier, accessToken]);

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
      const created = await orderRepository.create({
        grNumber: form.grNumber.trim(),
        companyId: form.companyId || undefined,
        consignorName: form.consignorName.trim(),
        consigneeName: form.consigneeName.trim(),
        pickupAddress: form.pickupAddress.trim(),
        deliveryAddress: form.deliveryAddress.trim(),
        pickupTime: parsedPickup.toISOString(),
        particulars: form.particulars.trim() || undefined,
        packageCount: form.packageCount.trim() ? Number(form.packageCount) : undefined,
        weight: form.weight.trim() ? Number(form.weight) : undefined,
        slipData: slipData ? JSON.stringify(slipData) : undefined,
      });
      // Attach the slip image (persisted durably) so it is viewable offline
      // from the GR details screen, and flag hasSlip on the order.
      if (created?.id && slipImage) {
        const persisted = persistedSlip ?? (await persistSlipImage(slipImage));
        if (persisted) {
          await orderRepository.addAttachment(created.id, {
            originalFilename: persisted.fileName,
            mimeType: persisted.mimeType,
            localUri: persisted.localUri,
            fileSizeBytes: persisted.fileSizeBytes,
          });
        }
      }
      Alert.alert('GR Created', `GR ${created?.orderNumber ?? form.grNumber} was created successfully.`);
      if (created?.id) {
        navigate('GRDetails', { orderId: created.id });
      } else {
        goBack();
      }
    } catch (err: any) {
      setErrorText(err?.message ?? 'Could not create the GR. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const pickSlipImage = async (source: 'library' | 'camera') => {
    try {
      if (source === 'camera') {
        const cam = await ImagePicker.requestCameraPermissionsAsync();
        if (cam.status !== 'granted') {
          Alert.alert('Permission Required', 'Camera permission is required to photograph a slip.');
          return;
        }
      } else {
        const lib = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (lib.status !== 'granted') {
          Alert.alert('Permission Required', 'Gallery permission is required to select a slip photo.');
          return;
        }
      }
      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 })
          : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
      if (result.canceled) return;
      const asset = result.assets[0];
      setSlipImage(asset.uri);
      setSlipData(null);
      setPersistedSlip(null);
      // Persist straight away so an offline retry / later attach always has a
      // durable path, regardless of whether OCR succeeds.
      setPersistedSlip(await persistSlipImage(asset.uri, asset.mimeType ?? 'image/jpeg'));
    } catch (err: any) {
      Alert.alert('Could not load image', err?.message ?? 'Please try again.');
    }
  };

  const handleExtract = async () => {
    if (!slipImage) return;
    setExtracting(true);
    setErrorText(null);
    try {
      const extracted = await extractSlipDetails(slipImage);
      setSlipData(extracted);
      setForm((prev) => mapSlipToForm(extracted, prev));
      setErrorText(null);
    } catch (err: any) {
      // OcrError already carries a user-friendly message and a stable kind;
      // keep the raw detail in the console for development only — never show
      // FastAPI's validation JSON to the user.
      if (isOcrError(err)) {
        setErrorText(err.message);
        console.warn('[OCR] Extraction failed:', err.message, err.kind);
      } else {
        setErrorText(
          err?.message ??
            'Could not read the slip. Check your network / OCR configuration and try again, or switch to Manual entry.'
        );
      }
    } finally {
      setExtracting(false);
    }
  };

  const resetSlipFlow = () => {
    setSlipImage(null);
    setSlipData(null);
    setPersistedSlip(null);
  };

  const goToForm = () => {
    setMode('manual');
    if (slipImage) {
      // When arriving from the slip path, ensure form is mapped once already
      // (handleExtract does it) and keep the slip attached at submit time.
    }
  };

  const startManual = () => {
    resetSlipFlow();
    setMode('manual');
  };

  const startSlip = () => {
    setErrorText(null);
    setMode('slip');
  };

  // ---------- Mode chooser ----------
  if (mode === 'choose') {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <Header title="Create GR" leftAction={{ icon: 'chevron-back', onPress: goBack }} />
        <ScrollView contentContainerStyle={styles.chooseContent}>
          <Text style={[styles.chooseHint, { color: colors.textMuted }]}>How would you like to create this GR?</Text>
          <TouchableOpacity
            style={[styles.modeCard, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radii.lg, ...shadows.sm }]}
            onPress={startManual}
            activeOpacity={0.85}
          >
            <View style={[styles.modeIcon, { backgroundColor: `${colors.primary}15`, borderRadius: radii.lg }]}>
              <Ionicons name="create-outline" size={26} color={colors.primary} />
            </View>
            <View style={styles.modeBody}>
              <Text style={[styles.modeTitle, { color: colors.textPrimary }]}>Manual Entry</Text>
              <Text style={[styles.modeSubtitle, { color: colors.textSecondary }]}>Type all GR details yourself.</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.modeCard, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radii.lg, ...shadows.sm }]}
            onPress={startSlip}
            activeOpacity={0.85}
          >
            <View style={[styles.modeIcon, { backgroundColor: `${colors.primary}15`, borderRadius: radii.lg }]}>
              <Ionicons name="document-text-outline" size={26} color={colors.primary} />
            </View>
            <View style={styles.modeBody}>
              <Text style={[styles.modeTitle, { color: colors.textPrimary }]}>Import From Slip</Text>
              <Text style={[styles.modeSubtitle, { color: colors.textSecondary }]}>
                Photograph or select a transport slip; OCR pre-fills the fields.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ---------- Slip import ----------
  if (mode === 'slip') {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <Header
          title="Import From Slip"
          leftAction={{ icon: 'chevron-back', onPress: slipImage || extracting ? resetSlipFlow : goBack }}
        />
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {errorText && (
            <View style={[styles.errorCard, { backgroundColor: `${colors.error}12`, borderRadius: radii.lg }]}>
              <Ionicons name="alert-circle-outline" size={18} color={colors.error} />
              <Text style={[styles.errorText, { color: colors.error }]}>{errorText}</Text>
            </View>
          )}

          {!slipImage ? (
            <View style={styles.slipPicker}>
              <View style={[styles.slipPlaceholder, { borderColor: colors.border, borderRadius: radii.xl }]}>
                <Ionicons name="document-text-outline" size={56} color={colors.textMuted} />
                <Text style={[styles.slipPickHint, { color: colors.textSecondary }]}>
                  Capture a photo of the transport slip or choose one from your gallery.
                </Text>
              </View>
              <View style={styles.slipPickButtons}>
                <TouchableOpacity
                  style={[styles.pickButton, { backgroundColor: colors.primary, borderRadius: radii.md }]}
                  onPress={() => pickSlipImage('camera')}
                  activeOpacity={0.85}
                >
                  <Ionicons name="camera-outline" size={20} color={colors.onPrimary} />
                  <Text style={[styles.pickButtonText, { color: colors.onPrimary }]}>Take Photo</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.pickButton, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radii.md }]}
                  onPress={() => pickSlipImage('library')}
                  activeOpacity={0.85}
                >
                  <Ionicons name="images-outline" size={20} color={colors.primary} />
                  <Text style={[styles.pickButtonText, { color: colors.primary }]}>Choose Photo</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.slipPreviewWrap}>
              <Image source={{ uri: slipImage }} style={[styles.slipPreview, { borderRadius: radii.lg }]} resizeMode="cover" />
              <View style={styles.slipPreviewActions}>
                <TouchableOpacity
                  style={[styles.pickButton, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radii.md }]}
                  onPress={() => pickSlipImage('library')}
                  activeOpacity={0.85}
                  disabled={extracting}
                >
                  <Ionicons name="refresh-outline" size={20} color={colors.primary} />
                  <Text style={[styles.pickButtonText, { color: colors.primary }]}>Retake / Reselect</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={[styles.submitButton, { backgroundColor: colors.primary, borderRadius: radii.md, opacity: extracting ? 0.6 : 1 }]}
                onPress={handleExtract}
                disabled={extracting}
                activeOpacity={0.85}
              >
                {extracting ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={[styles.submitText, { color: colors.onPrimary }]}>Extract Slip Details</Text>}
              </TouchableOpacity>
              {slipData && !extracting && (
                <TouchableOpacity onPress={goToForm} style={{ marginTop: spacing.sm }}>
                  <Text style={[styles.reviewLink, { color: colors.primary }]}>Review & Edit Fields →</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ---------- Manual / review form ----------
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <Header title="Create GR" leftAction={{ icon: 'chevron-back', onPress: goBack }} />
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {slipImage && slipData && (
          <View style={[styles.slipBanner, { backgroundColor: `${colors.primary}12`, borderRadius: radii.lg }]}>
            <Ionicons name="scan-outline" size={18} color={colors.primary} />
            <Text style={[styles.slipBannerText, { color: colors.primary }]}>
              Fields pre-filled from the slip — review and edit if needed.
            </Text>
          </View>
        )}
        {errorText && (
          <View style={[styles.errorCard, { backgroundColor: `${colors.error}12`, borderRadius: radii.lg }]}>
            <Ionicons name="alert-circle-outline" size={18} color={colors.error} />
            <Text style={[styles.errorText, { color: colors.error }]}>{errorText}</Text>
          </View>
        )}

        <Field label="GR Number" required value={form.grNumber} onChangeText={set('grNumber')} placeholder="e.g. GR100234" autoCapitalize="characters" />

        {isSuperAdminTier && (
          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>
              COMPANY <Text style={{ color: colors.error }}>*</Text>
            </Text>
            <TouchableOpacity
              style={[styles.selectInput, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radii.md }]}
              onPress={() => setCompanyPickerOpen(true)}
              disabled={loadingCompanies}
            >
              {loadingCompanies ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text style={[styles.selectText, { color: selectedCompanyName ? colors.textPrimary : colors.textSecondary }]}>
                  {selectedCompanyName ?? 'Select a company'}
                </Text>
              )}
              <Ionicons name="chevron-down" size={18} color={colors.textSecondary} />
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
                <Text style={[styles.emptyCompanies, { color: colors.textSecondary }]}>No companies found.</Text>
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
      <Text style={[styles.label, { color: theme.colors.textSecondary }]}>
        {label.toUpperCase()} {required ? <Text style={{ color: theme.colors.error }}>*</Text> : null}
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
        placeholderTextColor={theme.colors.textSecondary}
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
    chooseContent: { padding: theme.spacing.lg, paddingBottom: 60, gap: theme.spacing.lg },
    chooseHint: { fontSize: theme.fonts.size.sm, fontWeight: '600', marginBottom: theme.spacing.xs },
    modeCard: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, padding: theme.spacing.lg, borderWidth: 1 },
    modeIcon: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center' },
    modeBody: { flex: 1, gap: 2 },
    modeTitle: { fontSize: theme.fonts.size.md, fontWeight: '800' },
    modeSubtitle: { fontSize: theme.fonts.size.sm, fontWeight: '500', lineHeight: 18 },
    errorCard: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, marginBottom: theme.spacing.sm },
    errorText: { flex: 1, fontSize: theme.fonts.size.sm, fontWeight: '600' },
    slipBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, marginBottom: theme.spacing.sm },
    slipBannerText: { flex: 1, fontSize: theme.fonts.size.sm, fontWeight: '700' },
    slipPicker: { gap: theme.spacing.lg },
    slipPlaceholder: {
      borderWidth: 1.5,
      borderStyle: 'dashed',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
      paddingVertical: 56,
      paddingHorizontal: 24,
    },
    slipPickHint: { fontSize: theme.fonts.size.sm, fontWeight: '500', textAlign: 'center' },
    slipPickButtons: { flexDirection: 'row', gap: theme.spacing.md },
    pickButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 14,
    },
    pickButtonText: { fontSize: theme.fonts.size.md, fontWeight: '700' },
    slipPreviewWrap: { gap: theme.spacing.md },
    slipPreview: { width: '100%', height: 320 },
    slipPreviewActions: { flexDirection: 'row', justifyContent: 'flex-end' },
    fieldGroup: { marginBottom: theme.spacing.md },
    label: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 6 },
    input: { borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: theme.fonts.size.md },
    inputMultiline: { minHeight: 70, textAlignVertical: 'top' },
    selectInput: { borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    selectText: { fontSize: theme.fonts.size.md, fontWeight: '600' },
    row: { flexDirection: 'row', gap: theme.spacing.md },
    submitButton: { paddingVertical: 16, alignItems: 'center', justifyContent: 'center', marginTop: theme.spacing.md },
    submitText: { fontWeight: '800', fontSize: theme.fonts.size.md },
    reviewLink: { textAlign: 'center', fontWeight: '700', fontSize: theme.fonts.size.md },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    modalSheet: { padding: theme.spacing.lg, maxHeight: '70%' },
    modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: theme.spacing.md },
    modalTitle: { fontSize: theme.fonts.size.lg, fontWeight: '800' },
    emptyCompanies: { textAlign: 'center', paddingVertical: 24, fontSize: theme.fonts.size.sm },
    companyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
    companyName: { fontSize: theme.fonts.size.md, fontWeight: '600' },
  });

export default AdminCreateGRScreen;