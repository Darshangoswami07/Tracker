import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/useAppTheme';
import { Header } from '../../components/Header';
import { useAppNav } from '../../hooks/useAppNav';
import { useTranslation } from 'react-i18next';
import { AREAS, type Area } from '../../constants/areas';
import type { AppTheme } from '../../theme/types';

const AREA_ICONS: Record<Area, keyof typeof Ionicons.glyphMap> = {
  Bageshwar: 'leaf-outline',
  Almora: 'business-outline',
  'Garur Someshwar': 'car-outline',
};

const AREA_COLORS: Record<Area, string> = {
  Bageshwar: '#635BFF',
  Almora: '#10B981',
  'Garur Someshwar': '#F59E0B',
};

/**
 * Admin → Import GRs from Excel → Select Area.
 *
 * Shows the three operational areas (Bageshwar, Almora, Garur Someshwar).
 * Selecting an area navigates to the Excel Import screen, which assigns
 * the chosen area to every imported GR.
 */
export const AdminAreasScreen = () => {
  const { colors, spacing, radii, fonts, shadows } = useAppTheme();
  const { goBack, navigate } = useAppNav();
  const { t } = useTranslation();

  const styles = createStyles({ colors, spacing, radii, fonts, shadows });

  const handleSelectArea = (area: Area) => {
    navigate('ExcelImport', { selectedArea: area });
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <Header title={t('areas.title', 'Select Area')} leftAction={{ icon: 'chevron-back', onPress: goBack }} />

      <View style={styles.container}>
        <View style={[styles.infoCard, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}>
          <Ionicons name="information-circle-outline" size={20} color={colors.primary} />
          <Text style={[styles.infoText, { color: colors.textSecondary }]}>
            {t('areas.info', 'Select the area for which you want to import GRs. All imported GRs will be assigned to the selected area.')}
          </Text>
        </View>

        <View style={styles.areaGrid}>
          {AREAS.map((area) => (
            <TouchableOpacity
              key={area}
              style={[styles.areaCard, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}
              onPress={() => handleSelectArea(area)}
              activeOpacity={0.85}
            >
              <View style={[styles.areaIconWrap, { backgroundColor: `${AREA_COLORS[area]}15`, borderRadius: radii.md }]}>
                <Ionicons name={AREA_ICONS[area]} size={28} color={AREA_COLORS[area]} />
              </View>
              <Text style={[styles.areaName, { color: colors.textPrimary }]}>{area}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
};

const createStyles = (theme: Pick<AppTheme, 'colors' | 'spacing' | 'radii' | 'fonts' | 'shadows'>) =>
  StyleSheet.create({
    safe: { flex: 1 },
    container: { flex: 1, paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.md, gap: theme.spacing.md },
    infoCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 14 },
    infoText: { flex: 1, fontSize: theme.fonts.size.sm, lineHeight: 20 },
    areaGrid: { gap: theme.spacing.sm },
    areaCard: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, padding: theme.spacing.lg },
    areaIconWrap: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
    areaName: { flex: 1, fontSize: theme.fonts.size.lg, fontWeight: '700' },
  });

export default AdminAreasScreen;
