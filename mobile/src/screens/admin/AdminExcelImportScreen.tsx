import { useRef, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { File as ExpoFile } from 'expo-file-system';
import { useAppTheme } from '../../theme/useAppTheme';
import { useUserStore } from '../../store/userStore';
import { Header } from '../../components/Header';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { useAppNav } from '../../hooks/useAppNav';
import { parseWorkbook, validateRows, type ParsedWorkbook } from '../../services/excelImport';
import { importRepository, type ImportSummary } from '../../database/repositories/importRepository';
import type { AppTheme } from '../../theme/types';

interface SelectedFile {
  name: string;
  uri: string;
}

type Stage = 'select' | 'parsing' | 'preview' | 'importing' | 'result';

const PREVIEW_ROW_LIMIT = 20;
const ERROR_LIST_LIMIT = 30;

/** Web-only: reads a DocumentPicker web asset into base64. */
const readWebAssetAsBase64 = async (asset: DocumentPicker.DocumentPickerAsset): Promise<string> => {
  if (asset.base64) return asset.base64.replace(/^data:[^;]*;base64,/, '');
  if (asset.file) {
    const buffer = await asset.file.arrayBuffer();
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }
  throw new Error('Could not read the selected file in this browser.');
};

/**
 * Admin → GR/Shipment Management → Import GRs from Excel.
 *
 * Select .xlsx → parse + validate on-device (`services/excelImport.ts`) →
 * preview counts/rows/errors → Import All GRs, which posts the validated rows
 * to the FastAPI backend (`POST /admin/orders/import`) so they are created in
 * Neon (`database/repositories/importRepository.ts`). Existing GRs are never
 * touched — duplicate GR numbers are skipped and reported, never
 * overwritten.
 */
export const AdminExcelImportScreen = ({ route }: any) => {
  const params = route?.params as
    | { selectedArea?: string; selectedStaffId?: string; selectedStaffName?: string }
    | undefined;
  const selectedArea = params?.selectedArea ?? null;
  const selectedStaffId = params?.selectedStaffId ?? null;
  const selectedStaffName = params?.selectedStaffName ?? null;
  const { colors, spacing, radii, fonts, shadows } = useAppTheme();
  const { goBack, navigate } = useAppNav();
  const fullName = useUserStore((state) => state.user?.fullName ?? null);

  const styles = createStyles({ colors, spacing, radii, fonts, shadows });

  const [stage, setStage] = useState<Stage>('select');
  const [file, setFile] = useState<SelectedFile | null>(null);
  const [parsed, setParsed] = useState<ParsedWorkbook | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [challanNo, setChallanNo] = useState('');
  const [fallbackConfirmOpen, setFallbackConfirmOpen] = useState(false);
  // True for the whole lifetime of the in-flight import POST — blocks a
  // second submission of the same file even before `stage` re-renders.
  const importInFlight = useRef(false);

  const reset = () => {
    setStage('select');
    setFile(null);
    setParsed(null);
    setFileError(null);
    setSummary(null);
    setFallbackConfirmOpen(false);
    importInFlight.current = false;
  };

  /** Rows whose area could not be auto-matched from their own data
   * (`resolvedArea === null`) and would silently be dumped into the
   * "fallback shop" (or left unassigned, if no fallback was picked) — the
   * exact mechanism that mis-bucketed real GRs into the wrong shop/area
   * before this was surfaced. */
  const unmatchedCount = parsed?.validRows.filter((r) => r.resolvedArea === null).length ?? 0;

  const pickFile = async () => {
    setFileError(null);

    if (Platform.OS === 'web') {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
        ],
        multiple: false,
        base64: true,
      });
      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      if (!/\.xlsx$/i.test(asset.name ?? '')) {
        setFileError('Unsupported file type. Please select a .xlsx file.');
        return;
      }

      setFile({ name: asset.name, uri: asset.uri });
      setStage('parsing');
      try {
        const base64 = await readWebAssetAsBase64(asset);
        const rawRows = parseWorkbook(base64);
        const result2 = validateRows(rawRows);
        setParsed(result2);
        setStage('preview');
      } catch (err: any) {
        setFileError(err?.message ?? 'Could not read this Excel file. Please check the format and try again.');
        setStage('select');
        setFile(null);
      }
      return;
    }

    // Native (Android / iOS): use expo-file-system's own File.pickFileAsync().
    // This uses SAF ACTION_OPEN_DOCUMENT which returns a content:// URI.
    // expo-file-system can read content:// URIs via ContentResolver (checkPermission
    // returns true for content URIs), unlike file:/// cache URIs from
    // expo-document-picker which fail validatePermission(READ).
    //
    // No MIME type filter: Android's file picker may report an .xlsx as
    // application/octet-stream, which would hide the file from the user.
    // We validate the XLSX content via magic bytes after picking instead.
    const result = await ExpoFile.pickFileAsync();
    if (result.canceled || !result.result) return;

    const pickedFile = result.result;

    // Diagnostic logging — helps confirm what Android SAF returns.
    // Does NOT log file contents or business data.
    console.log(
      'Excel file selected:',
      '\n  name =', pickedFile.name,
      '\n  extension =', pickedFile.extension,
      '\n  type =', pickedFile.type,
      '\n  uri =', pickedFile.uri,
    );

    // Validate by reading the first 2 bytes: XLSX files are ZIP archives
    // and always start with the PK magic number (0x50 0x4B).
    // We do NOT use pickedFile.name for extension checks because on Android,
    // the name property returns the SAF document ID from the content:// URI
    // (e.g. "primary:Documents/file.xlsx" or "msf%3A123"), not the actual
    // display filename.
    const validationBuffer = await pickedFile.arrayBuffer();
    const headerBytes = new Uint8Array(validationBuffer.slice(0, 2));
    if (headerBytes[0] !== 0x50 || headerBytes[1] !== 0x4b) {
      console.log('File rejected: missing ZIP/XLSX magic bytes (PK). Got:', headerBytes[0], headerBytes[1]);
      setFileError('Unsupported file type. Please select a .xlsx file.');
      setStage('select');
      return;
    }

    setFile({ name: pickedFile.name ?? 'spreadsheet.xlsx', uri: pickedFile.uri });
    setStage('parsing');
    try {
      // Reuse the already-read buffer — avoids reading the file a second time.
      let binary = '';
      const bytes = new Uint8Array(validationBuffer);
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      const base64 = btoa(binary);

      const rawRows = parseWorkbook(base64);
      const result2 = validateRows(rawRows);
      setParsed(result2);
      setStage('preview');
    } catch (err: any) {
      setFileError(err?.message ?? 'Could not read this Excel file. Please check the format and try again.');
      setStage('select');
      setFile(null);
    }
  };

  /** Entry point for the "Import All GRs" button — routes through the
   * fallback-area confirmation when needed instead of importing straight
   * away, so mis-bucketing a shop's GRs requires an explicit "yes, do it
   * anyway" rather than happening silently. */
  const handleImportPress = () => {
    if (unmatchedCount > 0) {
      setFallbackConfirmOpen(true);
      return;
    }
    runImport();
  };

  const runImport = async () => {
    if (!parsed || !file) return;
    // Re-entrancy guard: a large import request stays open for minutes, and
    // `stage` state may not have flushed between two fast taps (button +
    // confirm dialog). Never let the same file be POSTed twice — that would
    // race the backend's own duplicate detection.
    if (importInFlight.current) return;
    // The Select-Staff step is mandatory; guard here so a stale navigation
    // state can never POST an import with no assignee.
    if (!selectedStaffId) {
      setFileError('Selected staff member is no longer available. Please go back and select a valid staff member.');
      setStage('preview');
      return;
    }
    importInFlight.current = true;
    setFallbackConfirmOpen(false);
    setStage('importing');
    try {
      const rowsToImport = challanNo.trim()
        ? parsed.validRows.map((r) => ({ ...r, chalaanNo: challanNo.trim() }))
        : parsed.validRows;
      // The real database identifier of the picked staff — the User id from
      // `GET /admin/users?role=staff` (`AdminSelectStaffScreen` stores
      // `member.id`). Never a name/index/temp id.
      console.log('[GR IMPORT] staff assignment', { selectedStaffId, selectedStaffName, rows: rowsToImport.length });
      const result = await importRepository.bulkImportGRs(
        rowsToImport,
        file.name,
        fullName,
        selectedArea ?? undefined,
        selectedStaffId ?? undefined
      );
      setSummary(result);
      setStage('result');
    } catch (err: any) {
      // Only a real backend error or a genuine socket failure lands here —
      // the 15s timeout no longer does. Surface the actual message; the
      // parsed rows are kept so the admin can retry without re-picking.
      setFileError(err?.message ?? 'Import failed. Please try again.');
      setStage('preview');
    } finally {
      importInFlight.current = false;
    }
  };

  // Every stage below this needs the staff member visible so the admin
  // always knows where the Excel data will go — and the upload step itself
  // must not be reachable without one (Areas → SelectStaff → here is the
  // only path that sets it, but guard anyway in case of a stale/direct nav).
  const LocationStaffBar = () => (
    <View style={styles.badgeRow}>
      <View style={[styles.areaBadge, { backgroundColor: `${colors.primary}15`, borderRadius: radii.md }]}>
        <Ionicons name="location-outline" size={16} color={colors.primary} />
        <Text style={[styles.areaBadgeText, { color: colors.primary }]}>
          {selectedArea ? `Location: ${selectedArea}` : 'Location: Auto-detect'}
        </Text>
      </View>
      <View style={[styles.areaBadge, { backgroundColor: `${colors.success}15`, borderRadius: radii.md }]}>
        <Ionicons name="person-outline" size={16} color={colors.success} />
        <Text style={[styles.areaBadgeText, { color: colors.success }]}>
          {selectedStaffName ? `Staff: ${selectedStaffName}` : 'Staff: Not selected'}
        </Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <Header title="Excel GR Import" leftAction={{ icon: 'chevron-back', onPress: goBack }} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {stage === 'select' && (
          <View style={[styles.card, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>Import GRs from Excel</Text>
            <Text style={[styles.subtitle, { color: colors.textMuted }]}>
              Upload an Excel file containing GR records. Each valid row becomes one GR.
            </Text>

            <LocationStaffBar />

            {!selectedStaffId && (
              <View style={[styles.errorBanner, { backgroundColor: colors.errorSoft, borderRadius: radii.md }]}>
                <Ionicons name="alert-circle-outline" size={18} color={colors.error} />
                <Text style={[styles.errorBannerText, { color: colors.error }]}>
                  Select a staff member before uploading a file.
                </Text>
              </View>
            )}

            {fileError && (
              <View style={[styles.errorBanner, { backgroundColor: colors.errorSoft, borderRadius: radii.md }]}>
                <Ionicons name="alert-circle-outline" size={18} color={colors.error} />
                <Text style={[styles.errorBannerText, { color: colors.error }]}>{fileError}</Text>
              </View>
            )}

            <TouchableOpacity
              style={[
                styles.primaryButton,
                { backgroundColor: selectedStaffId ? colors.primary : colors.border, borderRadius: radii.lg },
              ]}
              onPress={pickFile}
              activeOpacity={0.9}
              disabled={!selectedStaffId}
            >
              <Ionicons name="document-attach-outline" size={20} color={colors.onPrimary} />
              <Text style={[styles.primaryButtonText, { color: colors.onPrimary }]}>Select Excel File</Text>
            </TouchableOpacity>
            <Text style={[styles.hint, { color: colors.textMuted }]}>Supported format: .xlsx</Text>

            <TouchableOpacity style={styles.historyLink} onPress={() => navigate('ExcelImportHistory')}>
              <Ionicons name="time-outline" size={16} color={colors.primary} />
              <Text style={[styles.historyLinkText, { color: colors.primary }]}>View Import History</Text>
            </TouchableOpacity>
          </View>
        )}

        {stage === 'parsing' && (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.subtitle, { color: colors.textMuted, marginTop: 12 }]}>Reading {file?.name}…</Text>
          </View>
        )}

        {stage === 'preview' && parsed && file && (
          <>
            <View style={[styles.card, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}>
              <LocationStaffBar />
              {selectedArea && (
                <Text style={[styles.hint, { color: colors.textMuted, marginTop: 4 }]}>
                  Unmatched rows (no shop detected from their own data) will be filed under this location.
                </Text>
              )}
            </View>

            <View style={[styles.card, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}>
              <View style={styles.fileRow}>
                <Ionicons name="document-text-outline" size={20} color={colors.primary} />
                <Text style={[styles.fileName, { color: colors.textPrimary }]} numberOfLines={1}>{file.name}</Text>
              </View>
              <Text style={[styles.subtitle, { color: colors.textMuted }]}>Rows detected: {parsed.totalRows}</Text>
            </View>

            <View style={[styles.card, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Challan Number (optional)</Text>
              <Text style={[styles.subtitle, { color: colors.textMuted }]}>
                Assign the same Challan Number to all GRs in this import. Leave blank to use Excel values.
              </Text>
              <TextInput
                style={[styles.textInput, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.background }]}
                placeholder="e.g. CHL-2026-001"
                placeholderTextColor={colors.textMuted}
                value={challanNo}
                onChangeText={setChallanNo}
                autoCapitalize="characters"
                returnKeyType="done"
              />
            </View>

            <View style={[styles.card, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Excel Preview</Text>
              <View style={styles.statRow}>
                <Stat label="Total Rows" value={parsed.totalRows} color={colors.textPrimary} />
                <Stat label="Valid Rows" value={parsed.validRows.length} color={colors.success} />
                <Stat label="Duplicate in File" value={parsed.inFileDuplicateRows.length} color="#F59E0B" />
                <Stat label="Invalid Rows" value={parsed.invalidRows.length} color={colors.error} />
              </View>

              {parsed.validRows.length > 0 && (
                <View style={styles.previewTable}>
                  <View style={[styles.previewHeaderRow, { borderBottomColor: colors.border }]}>
                    <Text style={[styles.previewHeaderCell, styles.colGr, { color: colors.textMuted }]}>GR No</Text>
                    <Text style={[styles.previewHeaderCell, styles.colParty, { color: colors.textMuted }]}>Consignee</Text>
                    <Text style={[styles.previewHeaderCell, styles.colShop, { color: colors.textMuted }]}>Shop</Text>
                  </View>
                  {parsed.validRows.slice(0, PREVIEW_ROW_LIMIT).map((row) => {
                    // Distinguish a confident match (this row's own data —
                    // consignee/destination — actually says this area) from
                    // a guess (nothing in the row matched anything; it's
                    // only being labeled with the fallback because one was
                    // picked). Showing both the same way is exactly what let
                    // GRs get silently mis-bucketed into the wrong shop.
                    const isFallback = row.resolvedArea === null && !!selectedArea;
                    const shopLabel = row.resolvedArea ?? selectedArea ?? null;
                    return (
                      <View key={row.rowNumber} style={[styles.previewRow, { borderBottomColor: colors.border }]}>
                        <Text style={[styles.previewCell, styles.colGr, { color: colors.textPrimary }]}>{row.grNumber}</Text>
                        <Text style={[styles.previewCell, styles.colParty, { color: colors.textSecondary }]} numberOfLines={1}>{row.consigneeName || '—'}</Text>
                        <Text
                          style={[styles.previewCell, styles.colShop, { color: isFallback ? '#F97316' : shopLabel ? colors.textPrimary : colors.textMuted, fontWeight: shopLabel ? '700' : '600' }]}
                          numberOfLines={1}
                        >
                          {shopLabel ? (isFallback ? `${shopLabel} (guess)` : shopLabel) : 'Unmatched'}
                        </Text>
                      </View>
                    );
                  })}
                  {parsed.validRows.length > PREVIEW_ROW_LIMIT && (
                    <Text style={[styles.hint, { color: colors.textMuted, marginTop: 8 }]}>
                      +{parsed.validRows.length - PREVIEW_ROW_LIMIT} more valid row(s) not shown.
                    </Text>
                  )}
                </View>
              )}
            </View>

            {(parsed.invalidRows.length > 0 || parsed.inFileDuplicateRows.length > 0) && (
              <View style={[styles.card, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}>
                <Text style={[styles.sectionTitle, { color: colors.error }]}>Row Errors</Text>
                {[...parsed.invalidRows, ...parsed.inFileDuplicateRows]
                  .sort((a, b) => a.rowNumber - b.rowNumber)
                  .slice(0, ERROR_LIST_LIMIT)
                  .map((e, i) => (
                    <View key={`${e.rowNumber}-${i}`} style={styles.errorRow}>
                      <Text style={[styles.errorRowLabel, { color: colors.textPrimary }]}>Row {e.rowNumber}</Text>
                      <Text style={[styles.errorRowMessage, { color: colors.textMuted }]}>{e.message}</Text>
                    </View>
                  ))}
              </View>
            )}

            {fileError && (
              <View style={[styles.errorBanner, { backgroundColor: colors.errorSoft, borderRadius: radii.md }]}>
                <Ionicons name="alert-circle-outline" size={18} color={colors.error} />
                <Text style={[styles.errorBannerText, { color: colors.error }]}>{fileError}</Text>
              </View>
            )}

            {parsed.validRows.length > 0 && (
              <View style={[styles.card, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}>
                <Text style={[styles.subtitle, { color: colors.textPrimary }]}>
                  <Text style={{ fontWeight: '800' }}>{parsed.validRows.length} GRs</Text> will be imported for:
                </Text>
                <Text style={[styles.detail, { color: colors.textSecondary }]}>
                  Location: {selectedArea ?? 'Auto-detect per row'}
                </Text>
                <Text style={[styles.detail, { color: colors.textSecondary }]}>
                  Staff: {selectedStaffName ?? 'Not selected'}
                </Text>
              </View>
            )}

            <View style={styles.actionsRow}>
              <TouchableOpacity
                style={[styles.secondaryButton, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}
                onPress={reset}
                activeOpacity={0.85}
              >
                <Text style={[styles.secondaryButtonText, { color: colors.textPrimary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.primaryButton,
                  styles.flexButton,
                  {
                    backgroundColor:
                      parsed.validRows.length > 0 && selectedStaffId ? colors.primary : colors.border,
                    borderRadius: radii.lg,
                  },
                ]}
                onPress={handleImportPress}
                activeOpacity={0.9}
                disabled={parsed.validRows.length === 0 || !selectedStaffId}
              >
                <Text style={[styles.primaryButtonText, { color: colors.onPrimary }]}>
                  Confirm & Import {parsed.validRows.length} GRs
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {stage === 'importing' && (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.title, { color: colors.textPrimary, marginTop: 16, textAlign: 'center' }]}>
              Importing {parsed?.validRows.length ?? 0} GRs…
            </Text>
            <Text style={[styles.subtitle, { color: colors.textMuted, marginTop: 8, textAlign: 'center' }]}>
              Please wait — large Excel files can take several minutes. Keep this
              screen open; the import is still running.
            </Text>
          </View>
        )}

        {stage === 'result' && summary && (
          <View style={[styles.card, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}>
            <View style={styles.resultIconWrap}>
              <Ionicons name="checkmark-circle" size={48} color={colors.success} />
            </View>
            <Text style={[styles.title, { color: colors.textPrimary, textAlign: 'center' }]}>Import Complete</Text>

            <View style={styles.badgeRow}>
              <View style={[styles.areaBadge, { backgroundColor: `${colors.primary}15`, borderRadius: radii.md }]}>
                <Ionicons name="location-outline" size={16} color={colors.primary} />
                <Text style={[styles.areaBadgeText, { color: colors.primary }]}>
                  {selectedArea ? `Location: ${selectedArea}` : 'Location: Auto-detect'}
                </Text>
              </View>
              <View style={[styles.areaBadge, { backgroundColor: `${colors.success}15`, borderRadius: radii.md }]}>
                <Ionicons name="person-outline" size={16} color={colors.success} />
                <Text style={[styles.areaBadgeText, { color: colors.success }]}>
                  {selectedStaffName ? `Staff: ${selectedStaffName}` : 'Staff: Not selected'}
                </Text>
              </View>
            </View>

            <View style={styles.statRow}>
              <Stat label="Total Rows" value={summary.totalRows} color={colors.textPrimary} />
              <Stat label="Imported" value={summary.importedRows} color={colors.success} />
              <Stat label="Already Existing" value={summary.duplicateRows} color="#F59E0B" />
              <Stat label="Failed" value={summary.failedRows} color={colors.error} />
            </View>

            {summary.duplicateGRNumbers.length > 0 && (
              <View style={styles.dupList}>
                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Skipped (already exist)</Text>
                <Text style={[styles.hint, { color: colors.textMuted }]}>
                  {summary.duplicateGRNumbers.slice(0, 15).join(', ')}
                  {summary.duplicateGRNumbers.length > 15 ? `, +${summary.duplicateGRNumbers.length - 15} more` : ''}
                </Text>
              </View>
            )}

            {summary.failures.length > 0 && (
              <View style={[styles.card, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}>
                <Text style={[styles.sectionTitle, { color: colors.error }]}>Failed Rows</Text>
                {summary.failures.slice(0, ERROR_LIST_LIMIT).map((f, i) => (
                  <View key={`${f.rowNumber}-${i}`} style={styles.errorRow}>
                    <Text style={[styles.errorRowLabel, { color: colors.textPrimary }]}>
                      GR {f.grNumber || `(row ${f.rowNumber})`}
                    </Text>
                    <Text style={[styles.errorRowMessage, { color: colors.textMuted }]}>{f.message}</Text>
                  </View>
                ))}
                {summary.failures.length > ERROR_LIST_LIMIT && (
                  <Text style={[styles.hint, { color: colors.textMuted, marginTop: 4 }]}>
                    +{summary.failures.length - ERROR_LIST_LIMIT} more failure(s) not shown.
                  </Text>
                )}
              </View>
            )}

            <View style={[styles.actionsRow, { marginTop: 16 }]}>
              <TouchableOpacity
                style={[styles.secondaryButton, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}
                onPress={reset}
                activeOpacity={0.85}
              >
                <Text style={[styles.secondaryButtonText, { color: colors.textPrimary }]}>Import Another File</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryButton, styles.flexButton, { backgroundColor: colors.primary, borderRadius: radii.lg }]}
                onPress={() => navigate('GRShipments')}
                activeOpacity={0.9}
              >
                <Text style={[styles.primaryButtonText, { color: colors.onPrimary }]}>View Imported GRs</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>

      <ConfirmDialog
        visible={fallbackConfirmOpen}
        title="Confirm shop assignment"
        message={
          selectedArea
            ? `${unmatchedCount} of ${parsed?.validRows.length ?? 0} row(s) don't have a recognizable shop/area in their own data — they will be filed under "${selectedArea}" as a guess, not a match. Double-check this is correct before continuing.`
            : `${unmatchedCount} of ${parsed?.validRows.length ?? 0} row(s) don't have a recognizable shop/area and no fallback was selected — they will import with no shop assigned. Continue anyway?`
        }
        confirmLabel="Import Anyway"
        cancelLabel="Review"
        destructive
        onConfirm={runImport}
        onCancel={() => setFallbackConfirmOpen(false)}
      />
    </SafeAreaView>
  );
};

const Stat = ({ label, value, color }: { label: string; value: number; color: string }) => (
  <View style={statStyles.wrap}>
    <Text style={[statStyles.value, { color }]}>{value}</Text>
    <Text style={statStyles.label}>{label}</Text>
  </View>
);

const statStyles = StyleSheet.create({
  wrap: { flexGrow: 1, flexBasis: '45%', alignItems: 'flex-start', marginBottom: 12 },
  value: { fontSize: 22, fontWeight: '800' },
  label: { fontSize: 12, fontWeight: '600', color: '#94A3B8', marginTop: 2 },
});

const createStyles = (theme: Pick<AppTheme, 'colors' | 'spacing' | 'radii' | 'fonts' | 'shadows'>) =>
  StyleSheet.create({
    safe: { flex: 1 },
    scrollContent: { paddingBottom: 40, paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.md, gap: theme.spacing.md },
    card: { padding: 16, gap: 10 },
    title: { fontSize: theme.fonts.size.lg, fontWeight: '800' },
    subtitle: { fontSize: theme.fonts.size.sm, lineHeight: 20 },
    sectionTitle: { fontSize: theme.fonts.size.md, fontWeight: '700', marginBottom: 4 },
    hint: { fontSize: theme.fonts.size.xs, fontWeight: '600' },
    primaryButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14 },
    primaryButtonText: { fontSize: theme.fonts.size.md, fontWeight: '700' },
    secondaryButton: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 14 },
    secondaryButtonText: { fontSize: theme.fonts.size.md, fontWeight: '700' },
    flexButton: { flex: 2 },
    actionsRow: { flexDirection: 'row', gap: theme.spacing.sm },
    centered: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
    errorBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12 },
    errorBannerText: { flex: 1, fontSize: theme.fonts.size.sm, fontWeight: '600' },
    historyLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingTop: 8 },
    historyLinkText: { fontSize: theme.fonts.size.sm, fontWeight: '700' },
    fileRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    fileName: { flex: 1, fontSize: theme.fonts.size.md, fontWeight: '700' },
    statRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    previewTable: { marginTop: 8 },
    previewHeaderRow: { flexDirection: 'row', paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth },
    previewHeaderCell: { fontSize: theme.fonts.size.xs, fontWeight: '700', textTransform: 'uppercase' },
    previewRow: { flexDirection: 'row', paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
    previewCell: { fontSize: theme.fonts.size.sm, fontWeight: '600', paddingRight: 6 },
    colGr: { width: 70 },
    colParty: { flex: 1 },
    colFrom: { flex: 1 },
    colShop: { width: 100 },
    errorRow: { paddingVertical: 6 },
    errorRowLabel: { fontSize: theme.fonts.size.sm, fontWeight: '700' },
    errorRowMessage: { fontSize: theme.fonts.size.xs, marginTop: 1 },
    resultIconWrap: { alignItems: 'center', marginBottom: 4 },
    dupList: { marginTop: 8 },
    textInput: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, fontWeight: '600' },
    areaBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 8, marginTop: 8 },
    areaBadgeText: { fontSize: 13, fontWeight: '700' },
    badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    detail: { fontSize: theme.fonts.size.sm, fontWeight: '600', marginTop: 2 },
  });

export default AdminExcelImportScreen;
