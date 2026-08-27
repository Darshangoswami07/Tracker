import { useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppTheme } from '../../theme/useAppTheme';
import { Header } from '../../components/Header';
import { ShimmerCard } from '../../components/ShimmerCard';
import { EmptyState } from '../../components/EmptyState';
import { useAppNav } from '../../hooks/useAppNav';
import { importRepository, type ImportHistoryRow } from '../../database/repositories/importRepository';
import type { AppTheme } from '../../theme/types';

const formatDate = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
};

/** Admin → Excel Import → View Import History. Read-only log of every
 * Excel import performed on this device (`import_history` table) — file
 * name, when, by whom, and the counts from that batch's summary. */
export const ExcelImportHistoryScreen = () => {
  const { colors, spacing, radii, fonts, shadows } = useAppTheme();
  const { goBack } = useAppNav();
  const styles = createStyles({ colors, spacing, radii, fonts, shadows });

  const [items, setItems] = useState<ImportHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async (mode: 'initial' | 'refresh' = 'initial') => {
    if (mode === 'initial') setLoading(true);
    if (mode === 'refresh') setRefreshing(true);
    try {
      const rows = await importRepository.listImportHistory();
      setItems(rows);
      setError(null);
    } catch (err: any) {
      // Surface the failure instead of silently falling through to the
      // "No imports yet" empty state, which would otherwise look identical
      // to genuinely having no history.
      setError(err?.message ?? 'Could not load import history. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load('initial');
  }, []);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <Header title="Excel Import History" leftAction={{ icon: 'chevron-back', onPress: goBack }} />

      {loading ? (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {[1, 2, 3].map((i) => (
            <ShimmerCard key={i} style={styles.cardShimmer} height={90} />
          ))}
        </ScrollView>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load('refresh')} colors={['#635BFF']} />}
        >
          {error ? (
            <EmptyState
              icon="cloud-offline-outline"
              title="Could not load import history"
              subtitle={error}
              actionLabel="Retry"
              onActionPress={() => load('initial')}
              iconColor={colors.error}
            />
          ) : items.length === 0 ? (
            <EmptyState
              icon="cloud-upload-outline"
              title="No imports yet"
              subtitle="Excel imports you run on this device will be listed here."
            />
          ) : (
            <View style={styles.list}>
              {items.map((row) => (
                <View key={row.id} style={[styles.card, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}>
                  <View style={styles.headerRow}>
                    <Text style={[styles.fileName, { color: colors.textPrimary }]} numberOfLines={1}>{row.fileName}</Text>
                    <Text style={[styles.date, { color: colors.textMuted }]}>{formatDate(row.importedAt)}</Text>
                  </View>
                  {row.importedByName && (
                    <Text style={[styles.byLine, { color: colors.textMuted }]}>By {row.importedByName}</Text>
                  )}
                  {row.area && (
                    <View style={styles.areaBadge}>
                      <Text style={[styles.areaBadgeText, { color: colors.primary }]}>📍 {row.area}</Text>
                    </View>
                  )}
                  <View style={styles.statsRow}>
                    <Text style={[styles.stat, { color: colors.textSecondary }]}>Total: {row.totalRows}</Text>
                    <Text style={[styles.stat, { color: colors.success }]}>Imported: {row.importedRows}</Text>
                    <Text style={[styles.stat, { color: '#F59E0B' }]}>Existing: {row.duplicateRows}</Text>
                    {row.failedRows > 0 && (
                      <Text style={[styles.stat, { color: colors.error }]}>Failed: {row.failedRows}</Text>
                    )}
                  </View>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
};

const createStyles = (theme: Pick<AppTheme, 'colors' | 'spacing' | 'radii' | 'fonts' | 'shadows'>) =>
  StyleSheet.create({
    safe: { flex: 1 },
    scrollContent: { paddingBottom: 40, paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.md },
    cardShimmer: { marginBottom: theme.spacing.md, borderRadius: theme.radii.lg },
    list: { gap: theme.spacing.md },
    card: { padding: 16, gap: 6 },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
    fileName: { flex: 1, fontSize: theme.fonts.size.md, fontWeight: '700' },
    date: { fontSize: theme.fonts.size.xs, fontWeight: '600' },
    byLine: { fontSize: theme.fonts.size.xs },
    areaBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
    areaBadgeText: { fontSize: theme.fonts.size.xs, fontWeight: '700' },
    statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 4 },
    stat: { fontSize: theme.fonts.size.xs, fontWeight: '700' },
  });

export default ExcelImportHistoryScreen;
