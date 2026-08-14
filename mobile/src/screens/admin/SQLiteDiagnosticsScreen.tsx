import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/useAppTheme';
import { useAppNav } from '../../hooks/useAppNav';
import { Header } from '../../components/Header';
import {
  getSqliteDiagnostics,
  runSqliteTestOrder,
  type SqliteDiagnostics,
  type SqliteTestOrderResult,
} from '../../database/diagnostics';

/**
 * TEMPORARY DEVELOPMENT-ONLY screen proving business data is stored locally
 * in SQLite. It shows connection state, database path, schema version, PRAGMA
 * settings, tables and row counts, plus a button that runs a full create →
 * read → update → read → delete round-trip against the local `orders` table
 * (never sent to FastAPI / Neon). Remove before shipping.
 */
export const SQLiteDiagnosticsScreen = () => {
  const { colors, spacing, radii, fonts, shadows } = useAppTheme();
  const { goBack } = useAppNav();

  const [diag, setDiag] = useState<SqliteDiagnostics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [testRunning, setTestRunning] = useState(false);
  const [testResult, setTestResult] = useState<SqliteTestOrderResult | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setDiag(await getSqliteDiagnostics());
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const runTest = async () => {
    setTestRunning(true);
    setTestError(null);
    setTestResult(null);
    try {
      setTestResult(await runSqliteTestOrder());
    } catch (e: any) {
      setTestError(e?.message ?? String(e));
    } finally {
      setTestRunning(false);
    }
  };

  const styles = createStyles({ colors, spacing, radii, fonts, shadows });

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Header title="SQLite Diagnostics" leftAction={{ icon: 'chevron-back', onPress: goBack }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <TouchableOpacity style={[styles.refreshBtn, { backgroundColor: colors.surface, borderRadius: radii.lg }]} onPress={load} disabled={loading}>
          {loading ? <ActivityIndicator color={colors.primary} /> : <Text style={[styles.refreshText, { color: colors.primary }]}>Refresh Diagnostics</Text>}
        </TouchableOpacity>

        {error ? (
          <View style={[styles.card, { backgroundColor: colors.surface, borderRadius: radii.xl, ...shadows.sm }]}>
            <Text style={[styles.errorText, { color: colors.error }]}>Failed to read SQLite: {error}</Text>
          </View>
        ) : !diag ? (
          <View style={[styles.card, { backgroundColor: colors.surface, borderRadius: radii.xl, ...shadows.sm }]}>
            {loading ? <ActivityIndicator color={colors.primary} /> : <Text>No diagnostics loaded.</Text>}
          </View>
        ) : (
          <>
            <View style={[styles.card, { backgroundColor: colors.surface, borderRadius: radii.xl, ...shadows.sm }]}>
              <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Connection</Text>
              <Row label="SQLite initialized" value={diag.initialized ? 'YES' : 'NO'} good={diag.initialized} />
              <Row label="Database path" value={diag.databasePath ?? 'unknown'} mono />
              <Row label="SQLite version" value={diag.sqliteVersion || 'unknown'} />
              <Row label="PRAGMA user_version" value={String(diag.userVersion)} />
            </View>

            <View style={[styles.card, { backgroundColor: colors.surface, borderRadius: radii.xl, ...shadows.sm }]}>
              <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>PRAGMA Settings</Text>
              <Row label="WAL mode" value={diag.journalMode.toLowerCase() === 'wal' ? 'ENABLED' : diag.journalMode} good={diag.journalMode.toLowerCase() === 'wal'} />
              <Row label="Foreign keys" value={diag.foreignKeys === 1 ? 'ON' : 'OFF'} good={diag.foreignKeys === 1} />
            </View>

            <View style={[styles.card, { backgroundColor: colors.surface, borderRadius: radii.xl, ...shadows.sm }]}>
              <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Tables ({diag.tables.length})</Text>
              {diag.tables.length === 0 ? (
                <Text style={[styles.muted, { color: colors.textMuted }]}>No tables found.</Text>
              ) : (
                <View style={styles.chips}>
                  {diag.tables.map((t) => (
                    <View key={t} style={[styles.chip, { backgroundColor: colors.surfaceMuted, borderRadius: radii.pill }]}>
                      <Text style={[styles.chipText, { color: colors.textSecondary }]}>{t}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>

            <View style={[styles.card, { backgroundColor: colors.surface, borderRadius: radii.xl, ...shadows.sm }]}>
              <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Row counts (business tables)</Text>
              {diag.rowCounts.length === 0 ? (
                <Text style={[styles.muted, { color: colors.textMuted }]}>No business tables present.</Text>
              ) : (
                diag.rowCounts.map(({ table, count }) => (
                  <Row key={table} label={table} value={String(count)} />
                ))
              )}
            </View>
          </>
        )}

        <TouchableOpacity style={[styles.testBtn, { backgroundColor: colors.primary, borderRadius: radii.button }]} onPress={runTest} disabled={testRunning}>
          {testRunning ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.testBtnText}>CREATE TEST ORDER</Text>}
        </TouchableOpacity>

        {testError ? (
          <View style={[styles.card, { backgroundColor: colors.surface, borderRadius: radii.xl, ...shadows.sm }]}>
            <Text style={[styles.errorText, { color: colors.error }]}>Test failed: {testError}</Text>
          </View>
        ) : testResult ? (
          <View style={[styles.card, { backgroundColor: colors.surface, borderRadius: radii.xl, ...shadows.sm }]}>
            <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Test Order Result</Text>
            <Row label="Order" value={testResult.orderNumber} mono />
            <Step ok={testResult.created} label="Insert into SQLite" detail={testResult.created ? 'created' : 'FAILED'} />
            <Step ok={!!testResult.readBackAfterCreate} label="Read it back" detail={testResult.readBackAfterCreate ?? 'FAILED'} />
            <Step ok={testResult.updated} label="Update it" detail={testResult.updated ? 'updated' : 'FAILED'} />
            <Step ok={!!testResult.readBackAfterUpdate} label="Read it again" detail={testResult.readBackAfterUpdate ?? 'FAILED'} />
            <Step ok={testResult.deleted} label="Delete it" detail={testResult.deleted ? 'deleted' : 'FAILED'} />
            <Step ok={testResult.verifyDeleted} label="Verify deletion" detail={testResult.verifyDeleted ? 'row gone' : 'row still present'} />
            <Text style={[styles.testNote, { color: colors.textMuted }]}>
              This round-trip ran entirely on the device — nothing was sent to FastAPI or Neon.
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
};

const Row = ({ label, value, good, mono }: { label: string; value: string; good?: boolean; mono?: boolean }) => {
  const { colors } = useAppTheme();
  return (
    <View style={sharedStyles.row}>
      <Text style={[sharedStyles.rowLabel, { color: colors.textSecondary }]} numberOfLines={1}>{label}</Text>
      <Text
        style={[
          sharedStyles.rowValue,
          { color: good === undefined ? colors.textPrimary : good ? '#10B981' : colors.error },
          mono && sharedStyles.rowValueMono,
        ]}
        numberOfLines={2}
      >
        {value}
      </Text>
    </View>
  );
};

const Step = ({ ok, label, detail }: { ok: boolean; label: string; detail: string }) => {
  const { colors } = useAppTheme();
  return (
    <View style={sharedStyles.step}>
      <Ionicons name={ok ? 'checkmark-circle' : 'close-circle'} size={18} color={ok ? '#10B981' : colors.error} />
      <Text style={[sharedStyles.stepLabel, { color: colors.textPrimary }]}>{label}</Text>
      <Text style={[sharedStyles.stepDetail, { color: colors.textMuted }]}>{detail}</Text>
    </View>
  );
};

const sharedStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  rowLabel: { flex: 1, fontSize: 13, fontWeight: '600' },
  rowValue: { flex: 1, fontSize: 13, fontWeight: '700', textAlign: 'right' },
  rowValueMono: { fontFamily: 'monospace' },
  step: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepLabel: { flex: 1, fontSize: 13, fontWeight: '600' },
  stepDetail: { fontSize: 13 },
});

const createStyles = (t: { colors: any; spacing: any; radii: any; fonts: any; shadows: any }) =>
  StyleSheet.create({
    safe: { flex: 1 },
    header: { paddingTop: 8 },
    content: { padding: t.spacing.lg, gap: t.spacing.md, paddingBottom: 40 },
    refreshBtn: { alignItems: 'center', paddingVertical: 12 },
    refreshText: { fontWeight: '700' },
    card: { padding: 16, gap: 10 },
    cardTitle: { fontSize: t.fonts.size.md, fontWeight: '800', marginBottom: 2 },
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    rowLabel: { flex: 1, fontSize: t.fonts.size.sm, fontWeight: '600' },
    rowValue: { flex: 1, fontSize: t.fonts.size.sm, fontWeight: '700', textAlign: 'right' },
    rowValueMono: { fontFamily: 'monospace' },
    muted: { fontSize: t.fonts.size.sm },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { paddingHorizontal: 10, paddingVertical: 4 },
    chipText: { fontSize: t.fonts.size.sm, fontWeight: '600' },
    testBtn: { alignItems: 'center', justifyContent: 'center', paddingVertical: 14 },
    testBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: t.fonts.size.md },
    errorText: { fontWeight: '700' },
    step: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    stepLabel: { flex: 1, fontSize: t.fonts.size.sm, fontWeight: '600' },
    stepDetail: { fontSize: t.fonts.size.sm },
    testNote: { fontSize: t.fonts.size.xs, marginTop: 4 },
  });

export default SQLiteDiagnosticsScreen;