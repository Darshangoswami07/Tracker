import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, BackHandler, Image, Linking, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAppTheme } from '../../theme/useAppTheme';
import { useUserStore } from '../../store/userStore';
import { orderRepository, type PickerRow } from '../../database/repositories/orderRepository';
import { extractSlipDetails, isOcrError, type SlipExtractedFields } from '../../services/slipOcr';
import { persistSlipImage, type PersistedSlip } from '../../services/slipStorage';
import { Header } from '../../components/Header';
import { ConfirmDialog } from '../../components/ConfirmDialog';
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
/** Matches the backend's `MAX_UPLOAD_SIZE` (`core/config.py`) — the original
 * slip file (not the OCR provider's own, much smaller, limit) may be up to
 * this size. Enforced client-side too so an oversized pick is rejected with
 * a clear message before it's persisted or sent anywhere. */
const MAX_SLIP_FILE_SIZE_BYTES = 10 * 1024 * 1024;

/** Simple Bill Type choices shown as a two-way toggle (matches the app's
 * existing values — no new billing logic introduced). */
const BILL_TYPE_OPTIONS = ['To Pay', 'Paid'] as const;

interface FormState {
  grNumber: string;
  companyId: string;
  consignorName: string;
  consigneeName: string;
  particulars: string;
  packageCount: string;
  weight: string;
  // Extended GR/slip fields — all optional, mirror `GRExtendedFields`
  // (`orderRepository.ts`) / `backend/app/models/order.py`.
  grDate: string;
  /** Name of the transport company printed on the GR slip (e.g. "SOMNATH
   * TRANSPORT COMPANY") — OCR-filled but always manually editable. Distinct
   * from `companyId` below, which is the tenant/company this GR record is
   * scoped under in the multi-company system, not the slip's issuing
   * transport company name. */
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
  toPay: string;
  proprietorName: string;
  proprietorPhone: string;
  packageType: string;
}

const initialForm = (defaultCompanyId: string): FormState => ({
  grNumber: '',
  companyId: defaultCompanyId,
  consignorName: '',
  consigneeName: '',
  particulars: '',
  packageCount: '',
  weight: '',
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
  toPay: '',
  proprietorName: '',
  proprietorPhone: '',
  packageType: '',
});

/** Picks which local value flows into a given manual form field, falling back
 * to the OCR value when the user has not typed anything yet. */
const pickValue = (current: string, ocr: string | null | undefined): string => {
  if (ocr === undefined || ocr === null) return current;
  const trimmed = String(ocr).trim();
  if (!trimmed) return current;
  return current.trim() ? current : trimmed;
};

/** Normalizes a company name for tolerant comparison (case/punctuation/spacing
 * insensitive) — used only to match OCR text against real companies, never to
 * fabricate one. */
const normalizeCompanyName = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Finds a confident match for the slip's printed transport-company name among
 * the real companies list. A confident match is an exact normalized match or
 * a full containment either way (handles "ABC Transport" vs "ABC Transport
 * Co."). Returns null rather than guessing when nothing lines up. */
const findConfidentCompanyMatch = (ocrName: string, companies: PickerRow[]): PickerRow | null => {
  const normalizedOcr = normalizeCompanyName(ocrName);
  if (!normalizedOcr) return null;
  for (const company of companies) {
    const normalizedCompany = normalizeCompanyName(company.name);
    if (!normalizedCompany) continue;
    if (normalizedCompany === normalizedOcr || normalizedCompany.includes(normalizedOcr) || normalizedOcr.includes(normalizedCompany)) {
      return company;
    }
  }
  return null;
};

/** Picks a numeric OCR value into a string form field, only when the user
 * hasn't already typed something — mirrors `pickValue` for number-shaped
 * fields (packageCount/weight already used this pattern inline; the new
 * numeric fields below share it too). */
const pickNumber = (current: string, ocr: number | null | undefined): string =>
  ocr != null && !current.trim() ? String(ocr) : current;

/** Maps OCR output into the manual form, preserving anything already typed.
 * `companyId` (the tenant/company this GR is scoped under) is intentionally
 * excluded here — it's matched against the real companies list separately
 * (see `handleExtract`) rather than pre-filled with raw OCR text, so a
 * company is never invented. `transportCompanyName` (the slip's printed
 * issuing transport company, e.g. "SOMNATH TRANSPORT COMPANY") is a
 * distinct, freely-editable text field and is OCR-filled directly like any
 * other field. `fromLocation`/`toLocation` capture the slip's raw short
 * From/To text for display, separate from the required Pickup/Delivery
 * Address fields (which keep their existing pre-fill behavior below,
 * unchanged). */
const mapSlipToForm = (slip: SlipExtractedFields, current: FormState): FormState => ({
  grNumber: pickValue(current.grNumber, slip.grNumber),
  companyId: current.companyId,
  consignorName: pickValue(current.consignorName, slip.consignorName),
  consigneeName: pickValue(current.consigneeName, slip.consigneeName),
  particulars: pickValue(current.particulars, slip.particulars),
  packageCount: slip.packageCount != null && !current.packageCount.trim() ? String(slip.packageCount) : current.packageCount,
  weight: slip.weight != null && !current.weight.trim() ? String(slip.weight) : current.weight,
  grDate: pickValue(current.grDate, slip.grDate),
  transportCompanyName: pickValue(current.transportCompanyName, slip.transportCompany),
  ewbNumber: pickValue(current.ewbNumber, slip.ewbNumber),
  billType: pickValue(current.billType, slip.billType),
  fromLocation: pickValue(current.fromLocation, slip.fromAddress),
  toLocation: pickValue(current.toLocation, slip.toAddress),
  rate: pickNumber(current.rate, slip.rate),
  goodsValue: pickNumber(current.goodsValue, slip.goodsValue),
  grCharge: pickNumber(current.grCharge, slip.grCharge),
  freight: pickNumber(current.freight, slip.freight),
  labour: pickNumber(current.labour, slip.labour),
  pf: pickNumber(current.pf, slip.pf),
  doorDelivery: pickNumber(current.doorDelivery, slip.doorDelivery),
  taxGst: pickNumber(current.taxGst, slip.taxGst),
  netAmount: pickNumber(current.netAmount, slip.netAmount),
  toPay: pickNumber(current.toPay, slip.toPay),
  proprietorName: pickValue(current.proprietorName, slip.proprietor),
  // `form.proprietorPhone` renders as "Transport Phone Number" — it must be
  // the transport company's own contact number, not the proprietor's
  // personal number (which OCR separately reads into `slip.proprietorPhone`,
  // printed right under their name/signature and never used here).
  proprietorPhone: pickValue(current.proprietorPhone, slip.transportPhone),
  packageType: pickValue(current.packageType, slip.packageType),
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
  const isSuperAdminTier = SUPER_ADMIN_TIER_ROLES.includes(role);

  const styles = createStyles({ colors, spacing, radii, fonts, shadows });

  const [mode, setMode] = useState<Mode>('choose');
  const [form, setForm] = useState<FormState>(initialForm(isSuperAdminTier ? '' : NIL_UUID));
  const [submitting, setSubmitting] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  // Company/tenant resolution (Super Admin tier only) — there is no visible
  // "Company" field in this form; `companyId` (which tenant this GR is filed
  // under) is resolved silently in the background by matching whatever the
  // user has typed/OCR-filled into Transport Company against the real
  // companies list below, never shown or picked directly. If nothing
  // confidently matches, the GR is simply created without a companyId (the
  // same as the non-privileged-role path) rather than blocking submission.
  const [companies, setCompanies] = useState<PickerRow[]>([]);

  useEffect(() => {
    if (!isSuperAdminTier) return;
    orderRepository.listCompanies().then(setCompanies).catch(() => {});
  }, [isSuperAdminTier]);

  useEffect(() => {
    if (!isSuperAdminTier || !companies.length || !form.transportCompanyName.trim()) return;
    const match = findConfidentCompanyMatch(form.transportCompanyName, companies);
    if (match && form.companyId !== match.id) {
      setForm((prev) => ({ ...prev, companyId: match.id }));
    }
  }, [isSuperAdminTier, companies, form.transportCompanyName]);

  // Which optional sections are expanded — GR/Consignor/Consignee/Route/Goods
  // start open (they hold the required fields), Charges/Additional start
  // collapsed so the form doesn't dump 25 fields on screen at once.
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    charges: false,
    additional: false,
  });
  const toggleSection = (key: string) => setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));

  // Slip import state.
  const [slipImage, setSlipImage] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [slipData, setSlipData] = useState<SlipExtractedFields | null>(null);
  const [persistedSlip, setPersistedSlip] = useState<PersistedSlip | null>(null);

  const set = (key: keyof FormState) => (value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  /** Detection badge for a field, only shown once OCR has actually run
   * (`slipData` present). Always surfaces a successful detection (a quiet
   * green "Detected" is welcome, not noisy) but only flags a *missed* field
   * when `flagUndetected` is set — most optional metadata (charges,
   * proprietor, special service, etc.) is legitimately blank on many real
   * slips, and warning on every one of them is exactly the cluttered UI this
   * screen used to have. Pass `flagUndetected: true` only for the handful of
   * fields worth calling out when OCR misses them. */
  const ocrBadge = (ocrValue: unknown, flagUndetected = false): 'detected' | 'undetected' | undefined => {
    if (!slipData) return undefined;
    const hasValue = ocrValue !== null && ocrValue !== undefined && String(ocrValue).trim() !== '';
    if (hasValue) return 'detected';
    return flagUndetected ? 'undetected' : undefined;
  };

  const canSubmit =
    form.grNumber.trim() &&
    form.transportCompanyName.trim() &&
    form.consignorName.trim() &&
    form.consigneeName.trim() &&
    form.fromLocation.trim() &&
    form.toLocation.trim() &&
    !submitting;

  const handleSubmit = async () => {
    setSubmitting(true);
    setErrorText(null);
    try {
      const num = (value: string): number | undefined => (value.trim() ? Number(value) : undefined);
      const str = (value: string): string | undefined => (value.trim() ? value.trim() : undefined);
      const parsedGrDate = form.grDate.trim() ? new Date(form.grDate.trim()) : null;
      const validGrDate = parsedGrDate && !Number.isNaN(parsedGrDate.getTime()) ? parsedGrDate : null;
      // `pickupAddress`/`deliveryAddress`/`pickupTime` remain required, non-null
      // columns in the database (`backend/app/models/order.py`), but the
      // simplified form no longer asks for them directly — the required
      // From/To route fields and GR Date stand in for them so no schema
      // change or extra user input is needed.
      const created = await orderRepository.create({
        grNumber: form.grNumber.trim(),
        companyId: form.companyId || undefined,
        consignorName: form.consignorName.trim(),
        consigneeName: form.consigneeName.trim(),
        pickupAddress: form.fromLocation.trim(),
        deliveryAddress: form.toLocation.trim(),
        pickupTime: (validGrDate ?? new Date()).toISOString(),
        particulars: form.particulars.trim() || undefined,
        packageCount: form.packageCount.trim() ? Number(form.packageCount) : undefined,
        weight: form.weight.trim() ? Number(form.weight) : undefined,
        slipData: slipData ? JSON.stringify(slipData) : undefined,
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
        toPay: num(form.toPay),
        proprietorName: str(form.proprietorName),
        proprietorPhone: str(form.proprietorPhone),
        packageType: str(form.packageType),
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
        if (!cam.granted) {
          if (cam.canAskAgain) {
            Alert.alert('Permission Required', 'Camera permission is required to photograph a slip.');
          } else {
            Alert.alert(
              'Permission Required',
              'Camera permission has been denied. Please enable it in your device settings to use this feature.',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Open Settings', onPress: () => Linking.openSettings() },
              ],
            );
          }
          return;
        }
      } else {
        const lib = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!lib.granted) {
          if (lib.canAskAgain) {
            Alert.alert('Permission Required', 'Gallery permission is required to select a slip photo.');
          } else {
            Alert.alert(
              'Permission Required',
              'Gallery permission has been denied. Please enable it in your device settings to use this feature.',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Open Settings', onPress: () => Linking.openSettings() },
              ],
            );
          }
          return;
        }
      }
      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 })
          : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (asset.fileSize && asset.fileSize > MAX_SLIP_FILE_SIZE_BYTES) {
        Alert.alert('File Too Large', 'This file is too large. Please select an image or PDF up to 10 MB.');
        return;
      }
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
      // Transport Company (and, silently, the matching tenant `companyId`
      // for Super Admin tier) is set here via `mapSlipToForm` /
      // the `form.transportCompanyName` auto-resolve effect above.
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

  /** True once the user has actually entered something worth confirming
   * before discarding — any of the key manual fields typed, or a slip
   * picked/scanned. Kept deliberately narrow (not every optional field) so
   * an untouched form doesn't prompt on the way back. */
  const hasFormProgress = () =>
    Boolean(
      form.grNumber.trim() ||
        form.consignorName.trim() ||
        form.consigneeName.trim() ||
        form.fromLocation.trim() ||
        form.toLocation.trim() ||
        slipImage ||
        slipData
    );

  // Whether the "Leave Create GR?" discard-confirmation dialog is showing.
  // Uses `ConfirmDialog` (a real `Modal`), not `Alert.alert` — react-native-web's
  // `Alert.alert` is a no-op on web (see `react-native-web/dist/exports/Alert`),
  // so using it here silently swallowed the confirmation and made the header/
  // hardware Back button appear to do nothing whenever the form had progress.
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);

  /** Single back handler for every step of Create GR (header button and
   * Android hardware back alike): actually leaves the screen via the app's
   * normal navigation (`goBack` from `useAppNav` — pops this stack entry, or
   * falls back to the role's dashboard if there's no history), the same as
   * any other screen's back button. Never just resets local state and stays
   * on Create GR — that reads as the button "doing nothing" to the user.
   * Prompts for confirmation first only when there's something to lose. */
  const handleBack = () => {
    if (hasFormProgress()) {
      setShowLeaveDialog(true);
    } else {
      goBack();
    }
  };

  // Android hardware back must behave identically to the in-app Back
  // button at every step of Create GR — always a real navigation back
  // (with the same discard prompt when there's unsaved progress), never a
  // no-op or an in-place reset.
  useEffect(() => {
    const onHardwareBack = () => {
      handleBack();
      return true;
    };
    const subscription = BackHandler.addEventListener('hardwareBackPress', onHardwareBack);
    return () => subscription.remove();
  }, [mode, form, slipImage, slipData]);

  // Rendered at the end of every mode's returned JSX below.
  const leaveDialog = (
    <ConfirmDialog
      visible={showLeaveDialog}
      title="Leave Create GR?"
      message="Your entered details will be discarded if you leave this screen."
      confirmLabel="Discard"
      destructive
      onConfirm={() => {
        setShowLeaveDialog(false);
        goBack();
      }}
      onCancel={() => setShowLeaveDialog(false)}
    />
  );

  // ---------- Mode chooser ----------
  if (mode === 'choose') {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <Header title="Create GR" leftAction={{ icon: 'chevron-back', onPress: handleBack }} />
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
        {leaveDialog}
      </SafeAreaView>
    );
  }

  // ---------- Slip import ----------
  if (mode === 'slip') {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <Header
          title="Import From Slip"
          leftAction={{ icon: 'chevron-back', onPress: handleBack }}
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
        {leaveDialog}
      </SafeAreaView>
    );
  }

  // ---------- Manual / review form ----------
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <Header title="Create GR" leftAction={{ icon: 'chevron-back', onPress: handleBack }} />
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {slipImage && slipData && (
          <View style={[styles.slipBanner, { backgroundColor: `${colors.primary}12`, borderRadius: radii.lg }]}>
            <Ionicons name="scan-outline" size={18} color={colors.primary} />
            <Text style={[styles.slipBannerText, { color: colors.primary }]}>
              GR slip scanned successfully. Please review the extracted details before creating the GR.
            </Text>
          </View>
        )}
        {errorText && (
          <View style={[styles.errorCard, { backgroundColor: `${colors.error}12`, borderRadius: radii.lg }]}>
            <Ionicons name="alert-circle-outline" size={18} color={colors.error} />
            <Text style={[styles.errorText, { color: colors.error }]}>{errorText}</Text>
          </View>
        )}

        <Section title="GR Information" expanded>
          <Field label="GR Number" required value={form.grNumber} onChangeText={set('grNumber')} placeholder="e.g. GR100234" autoCapitalize="characters" />
          {slipData && !slipData.grNumber && !form.grNumber.trim() && (
            <Text style={[styles.ocrHintText, { color: colors.error }]}>GR number could not be detected. Please enter it manually.</Text>
          )}
          <Field label="GR Date" value={form.grDate} onChangeText={set('grDate')} placeholder="YYYY-MM-DD" badge={ocrBadge(slipData?.grDate)} />
          <Field
            label="Transport Company"
            required
            value={form.transportCompanyName}
            onChangeText={set('transportCompanyName')}
            placeholder="e.g. Somnath Transport Company"
            badge={ocrBadge(slipData?.transportCompany, true)}
          />

          {/* No separate "Company" field: for Super Admin tier, the tenant
           * (`companyId`) is resolved silently in the background from
           * whatever is typed above (see the `form.transportCompanyName`
           * auto-resolve effect) rather than picked here. */}

          <View style={styles.fieldGroup}>
            <View style={styles.labelRow}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>BILL TYPE</Text>
              {ocrBadge(slipData?.billType) === 'detected' && (
                <View style={styles.badgeRow}>
                  <Ionicons name="checkmark-circle" size={12} color="#10B981" />
                  <Text style={[styles.badgeText, { color: '#10B981' }]}>Detected</Text>
                </View>
              )}
            </View>
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
          <Field
            label="EWB Number"
            value={form.ewbNumber}
            onChangeText={set('ewbNumber')}
            placeholder="E-way bill no. (optional)"
            badge={ocrBadge(slipData?.ewbNumber, true)}
            badgeUndetectedLabel="Not detected — optional"
          />
        </Section>

        <Section title="Parties" expanded>
          <Field label="Consignor Name" required value={form.consignorName} onChangeText={set('consignorName')} placeholder="Sender name" badge={ocrBadge(slipData?.consignorName, true)} />
          <Field label="Consignee Name" required value={form.consigneeName} onChangeText={set('consigneeName')} placeholder="Receiver name" badge={ocrBadge(slipData?.consigneeName, true)} />
        </Section>

        <Section title="Route" expanded>
          <Field label="From" required value={form.fromLocation} onChangeText={set('fromLocation')} placeholder="e.g. Haldwani" badge={ocrBadge(slipData?.fromAddress, true)} />
          <Field label="To" required value={form.toLocation} onChangeText={set('toLocation')} placeholder="e.g. Garur" badge={ocrBadge(slipData?.toAddress, true)} />
        </Section>

        <Section title="Goods" expanded>
          <Field label="Particulars" value={form.particulars} onChangeText={set('particulars')} placeholder="Description of goods (optional)" multiline badge={ocrBadge(slipData?.particulars, true)} />
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Field label="Package Count" value={form.packageCount} onChangeText={set('packageCount')} placeholder="0" keyboardType="number-pad" badge={ocrBadge(slipData?.packageCount, true)} />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Package Type" value={form.packageType} onChangeText={set('packageType')} placeholder="e.g. Box, Nug" badge={ocrBadge(slipData?.packageType)} />
            </View>
          </View>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Field label="Weight (kg)" value={form.weight} onChangeText={set('weight')} placeholder="0" keyboardType="decimal-pad" badge={ocrBadge(slipData?.weight, true)} />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Rate" value={form.rate} onChangeText={set('rate')} placeholder="0" keyboardType="decimal-pad" badge={ocrBadge(slipData?.rate, true)} />
            </View>
          </View>
          <Field label="Goods Value" value={form.goodsValue} onChangeText={set('goodsValue')} placeholder="0" keyboardType="decimal-pad" badge={ocrBadge(slipData?.goodsValue)} />
        </Section>

        <Section title="Charges" expanded={expandedSections.charges} onToggle={() => toggleSection('charges')}>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Field label="GR Charge" value={form.grCharge} onChangeText={set('grCharge')} placeholder="0" keyboardType="decimal-pad" badge={ocrBadge(slipData?.grCharge)} />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Freight" value={form.freight} onChangeText={set('freight')} placeholder="0" keyboardType="decimal-pad" badge={ocrBadge(slipData?.freight)} />
            </View>
          </View>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Field label="Labour" value={form.labour} onChangeText={set('labour')} placeholder="0" keyboardType="decimal-pad" badge={ocrBadge(slipData?.labour)} />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="P.F." value={form.pf} onChangeText={set('pf')} placeholder="0" keyboardType="decimal-pad" badge={ocrBadge(slipData?.pf)} />
            </View>
          </View>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Field label="Door Delivery" value={form.doorDelivery} onChangeText={set('doorDelivery')} placeholder="0" keyboardType="decimal-pad" badge={ocrBadge(slipData?.doorDelivery)} />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Tax (GST)" value={form.taxGst} onChangeText={set('taxGst')} placeholder="0" keyboardType="decimal-pad" badge={ocrBadge(slipData?.taxGst)} />
            </View>
          </View>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Field label="Net Amount" value={form.netAmount} onChangeText={set('netAmount')} placeholder="0" keyboardType="decimal-pad" badge={ocrBadge(slipData?.netAmount, true)} />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="To Pay" value={form.toPay} onChangeText={set('toPay')} placeholder="0" keyboardType="decimal-pad" badge={ocrBadge(slipData?.toPay)} />
            </View>
          </View>
        </Section>

        <Section title="Transport Details" expanded>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Field label="Proprietor" value={form.proprietorName} onChangeText={set('proprietorName')} placeholder="Owner name" badge={ocrBadge(slipData?.proprietor)} />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Transport Phone Number" value={form.proprietorPhone} onChangeText={set('proprietorPhone')} placeholder="Phone number" keyboardType="number-pad" badge={ocrBadge(slipData?.transportPhone)} />
            </View>
          </View>
        </Section>

        <TouchableOpacity
          style={[styles.submitButton, { backgroundColor: colors.primary, borderRadius: radii.md, opacity: canSubmit ? 1 : 0.5 }]}
          onPress={handleSubmit}
          disabled={!canSubmit}
          activeOpacity={0.85}
        >
          {submitting ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={[styles.submitText, { color: colors.onPrimary }]}>Create GR</Text>}
        </TouchableOpacity>
      </ScrollView>
      {leaveDialog}
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
  /** OCR detection status, shown as a small badge next to the label — only
   * passed during the OCR review flow (see `ocrBadge` in the screen). */
  badge?: 'detected' | 'undetected';
  /** Overrides the default "Not detected" copy — used for fields where a
   * miss is expected/low-stakes (e.g. "Not detected — optional" for EWB). */
  badgeUndetectedLabel?: string;
}

const Field = ({ label, value, onChangeText, placeholder, required, multiline, autoCapitalize, keyboardType, badge, badgeUndetectedLabel }: FieldProps) => {
  const theme = useAppTheme();
  const styles = createStyles(theme);
  return (
    <View style={styles.fieldGroup}>
      <View style={styles.labelRow}>
        <Text style={[styles.label, { color: theme.colors.textSecondary }]}>
          {label.toUpperCase()} {required ? <Text style={{ color: theme.colors.error }}>*</Text> : null}
        </Text>
        {badge === 'detected' && (
          <View style={styles.badgeRow}>
            <Ionicons name="checkmark-circle" size={12} color="#10B981" />
            <Text style={[styles.badgeText, { color: '#10B981' }]}>Detected</Text>
          </View>
        )}
        {badge === 'undetected' && (
          <View style={styles.badgeRow}>
            <Text style={[styles.badgeText, { color: theme.colors.textMuted }]}>{badgeUndetectedLabel ?? 'Not detected'}</Text>
          </View>
        )}
      </View>
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

interface SectionProps {
  title: string;
  /** Whether the section's fields are shown. Omit `onToggle` for a section
   * that is always expanded (holds required fields) — no chevron/tap target
   * is rendered in that case. */
  expanded: boolean;
  onToggle?: () => void;
  children: ReactNode;
}

/** Collapsible form section — keeps the sectioned Create GR form scannable
 * on mobile instead of dumping every field on one long screen. */
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
    labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
    label: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
    badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    badgeText: { fontSize: 10, fontWeight: '700' },
    billTypeChip: { flex: 1, borderWidth: 1, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
    billTypeChipText: { fontSize: theme.fonts.size.sm, fontWeight: '700' },
    ocrHintText: { fontSize: theme.fonts.size.sm, fontWeight: '500', marginTop: 4, marginBottom: theme.spacing.sm },
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
    subsectionLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.6, marginBottom: theme.spacing.xs },
    input: { borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: theme.fonts.size.md },
    inputMultiline: { minHeight: 70, textAlignVertical: 'top' },
    row: { flexDirection: 'row', gap: theme.spacing.md },
    submitButton: { paddingVertical: 16, alignItems: 'center', justifyContent: 'center', marginTop: theme.spacing.md },
    submitText: { fontWeight: '800', fontSize: theme.fonts.size.md },
    reviewLink: { textAlign: 'center', fontWeight: '700', fontSize: theme.fonts.size.md },
  });

export default AdminCreateGRScreen;