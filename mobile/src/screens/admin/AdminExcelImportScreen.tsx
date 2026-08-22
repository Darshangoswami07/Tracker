import { useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
// The root `expo-file-system` entrypoint's `readAsStringAsync` is deprecated
// in SDK 54+ in favor of the `File`/`Directory` classes; the legacy
// sub-import keeps the same base64-read API without the deprecation
// warning. Only used on native — see `readFileAsBase64` below, which reads
// straight off `DocumentPicker`'s web `asset.base64` on web instead, since
// `expo-file-system` doesn't support the blob: URIs web picking returns.
import * as FileSystem from 'expo-file-system/legacy';
import { useAppTheme } from '../../theme/useAppTheme';
import { useUserStore } from '../../store/userStore';
import { Header } from '../../components/Header';
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

/** Reads a picked `.xlsx` document into a base64 string, the format
 * `services/excelImport.ts#parseWorkbook` expects. On web, `expo-file-system`
 * can't read the `blob:` URI the picker returns, so this uses the base64
 * content `DocumentPicker` already hands back on that platform (requested
 * via `base64: true` above) directly instead. On native, it reads the
 * copied-to-cache file off disk via `expo-file-system/legacy`. */
const readFileAsBase64 = async (asset: DocumentPicker.DocumentPickerAsset): Promise<string> => {
  if (Platform.OS === 'web') {
    // `DocumentPicker`'s web implementation reads the file via
    // `FileReader.readAsDataURL`, so `asset.base64` is a full Data URL
    // (`data:application/...;base64,AAAA...`), not raw base64 — the
    // `data:...;base64,` prefix has to be stripped before `XLSX.read`
    // (`type: 'base64'`) can parse it; passing the prefix through produces
    // an unparsable workbook (surfaced as "Could not find a GR_No column").
    if (asset.base64) return asset.base64.replace(/^data:[^;]*;base64,/, '');
    if (asset.file) {
      const buffer = await asset.file.arrayBuffer();
      let binary = '';
      const bytes = new Uint8Array(buffer);
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      return btoa(binary);
    }
    throw new Error('Could not read the selected file in this browser.');
  }
  return FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
};

/**
 * Admin → GR/Shipment Management → Import GRs from Excel.
 *
 * Select .xlsx → parse + validate on-device (`services/excelImport.ts`) →
 * preview counts/rows/errors → Import All GRs, which bulk-inserts into the
 * same on-device SQLite `orders` table every other GR screen reads from
 * (`database/repositories/importRepository.ts`). Existing GRs are never
 * touched — duplicate GR numbers are skipped and reported, never
 * overwritten.
 */
export const AdminExcelImportScreen = () => {
  const { colors, spacing, radii, fonts, shadows } = useAppTheme();
  const { goBack, navigate } = useAppNav();
  const fullName = useUserStore((state) => state.user?.fullName ?? null);

  const styles = createStyles({ colors, spacing, radii, fonts, shadows });

  const [stage, setStage] = useState<Stage>('select');
  const [file, setFile] = useState<SelectedFile | null>(null);
  const [parsed, setParsed] = useState<ParsedWorkbook | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  const reset = () => {
    setStage('select');
    setFile(null);
    setParsed(null);
    setFileError(null);
    setSummary(null);
  };

  const pickFile = async () => {
    setFileError(null);
    const result = await DocumentPicker.getDocumentAsync({
      type: [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
      ],
      copyToCacheDirectory: true,
      multiple: false,
      // Web only: ask the picker to hand back the file's base64 content
      // directly (default on web anyway, made explicit here) — the
      // alternative `uri` it returns on web is a `blob:` URL that
      // `expo-file-system` cannot read.
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
      const base64 = await readFileAsBase64(asset);
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

  const runImport = async () => {
    if (!parsed || !file) return;
    setStage('importing');
    try {
      const result = await importRepository.bulkImportGRs(parsed.validRows, file.name, fullName);
      setSummary(result);
      setStage('result');
    } catch (err: any) {
      setFileError(err?.message ?? 'Import failed. Please try again.');
      setStage('preview');
    }
  };

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

            {fileError && (
              <View style={[styles.errorBanner, { backgroundColor: colors.errorSoft, borderRadius: radii.md }]}>
                <Ionicons name="alert-circle-outline" size={18} color={colors.error} />
                <Text style={[styles.errorBannerText, { color: colors.error }]}>{fileError}</Text>
              </View>
            )}

            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: colors.primary, borderRadius: radii.lg }]}
              onPress={pickFile}
              activeOpacity={0.9}
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
              <View style={styles.fileRow}>
                <Ionicons name="document-text-outline" size={20} color={colors.primary} />
                <Text style={[styles.fileName, { color: colors.textPrimary }]} numberOfLines={1}>{file.name}</Text>
              </View>
              <Text style={[styles.subtitle, { color: colors.textMuted }]}>Rows detected: {parsed.totalRows}</Text>
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
                    <Text style={[styles.previewHeaderCell, styles.colParty, { color: colors.textMuted }]}>Consignor</Text>
                    <Text style={[styles.previewHeaderCell, styles.colParty, { color: colors.textMuted }]}>Consignee</Text>
                    <Text style={[styles.previewHeaderCell, styles.colFrom, { color: colors.textMuted }]}>From</Text>
                  </View>
                  {parsed.validRows.slice(0, PREVIEW_ROW_LIMIT).map((row) => (
                    <View key={row.rowNumber} style={[styles.previewRow, { borderBottomColor: colors.border }]}>
                      <Text style={[styles.previewCell, styles.colGr, { color: colors.textPrimary }]}>{row.grNumber}</Text>
                      <Text style={[styles.previewCell, styles.colParty, { color: colors.textSecondary }]} numberOfLines={1}>{row.consignorName || '—'}</Text>
                      <Text style={[styles.previewCell, styles.colParty, { color: colors.textSecondary }]} numberOfLines={1}>{row.consigneeName || '—'}</Text>
                      <Text style={[styles.previewCell, styles.colFrom, { color: colors.textSecondary }]} numberOfLines={1}>{row.fromLocation || '—'}</Text>
                    </View>
                  ))}
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
                  { backgroundColor: parsed.validRows.length > 0 ? colors.primary : colors.border, borderRadius: radii.lg },
                ]}
                onPress={runImport}
                activeOpacity={0.9}
                disabled={parsed.validRows.length === 0}
              >
                <Text style={[styles.primaryButtonText, { color: colors.onPrimary }]}>
                  Import All GRs ({parsed.validRows.length})
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {stage === 'importing' && (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.subtitle, { color: colors.textMuted, marginTop: 12 }]}>Importing GRs…</Text>
          </View>
        )}

        {stage === 'result' && summary && (
          <View style={[styles.card, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}>
            <View style={styles.resultIconWrap}>
              <Ionicons name="checkmark-circle" size={48} color={colors.success} />
            </View>
            <Text style={[styles.title, { color: colors.textPrimary, textAlign: 'center' }]}>Import Complete</Text>
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

            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: colors.primary, borderRadius: radii.lg, marginTop: 16 }]}
              onPress={() => navigate('GRShipments')}
              activeOpacity={0.9}
            >
              <Text style={[styles.primaryButtonText, { color: colors.onPrimary }]}>Done</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
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
    errorRow: { paddingVertical: 6 },
    errorRowLabel: { fontSize: theme.fonts.size.sm, fontWeight: '700' },
    errorRowMessage: { fontSize: theme.fonts.size.xs, marginTop: 1 },
    resultIconWrap: { alignItems: 'center', marginBottom: 4 },
    dupList: { marginTop: 8 },
  });

export default AdminExcelImportScreen;
