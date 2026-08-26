import { Alert, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAppTheme } from '../../theme/useAppTheme';
import { useAppNav } from '../../hooks/useAppNav';
import { Header } from '../../components/Header';
import { Logo } from '../../components/Logo';

const SUPPORT_EMAIL = 'jobpilotdesk@gmail.com';
const SUPPORT_PHONE = '7456849590';
const APP_VERSION = '1.0.0';

const openUrl = (url: string, t: (key: string) => string) => Linking.openURL(url).catch(() => Alert.alert(t('about.couldNotOpen'), url));

export const AboutScreen = () => {
  const { t } = useTranslation();
  const { colors, spacing, radii, fonts, shadows } = useAppTheme();
  const { goBack } = useAppNav();

  const styles = StyleSheet.create({
    safe: { flex: 1 },
    header: { paddingTop: 8 },
    scroll: { flex: 1 },
    scrollContent: { paddingBottom: spacing.huge, paddingHorizontal: spacing.lg, paddingTop: spacing.xl },
    brandBlock: { alignItems: 'center', gap: spacing.md, marginBottom: spacing.xxl },
    appName: { fontSize: fonts.size.xxl, fontWeight: '800', color: colors.textPrimary },
    tagline: { fontSize: fonts.size.md, fontWeight: '600', color: colors.primary },
    version: { fontSize: fonts.size.sm, fontWeight: '500', color: colors.textMuted, marginTop: 4 },
    card: { backgroundColor: colors.surface, borderRadius: radii.xl, padding: spacing.lg, marginBottom: spacing.lg, ...shadows.sm },
    cardTitle: { fontSize: fonts.size.md, fontWeight: '800', color: colors.textPrimary, marginBottom: spacing.sm },
    cardText: { fontSize: fonts.size.sm, fontWeight: '500', color: colors.textSecondary, lineHeight: 22 },
    contactRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: spacing.sm },
    contactIcon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    contactText: { fontSize: fonts.size.sm, fontWeight: '600', color: colors.textPrimary },
  });

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Header title={t('about.title')} leftAction={{ icon: 'chevron-back', onPress: goBack }} />
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.brandBlock}>
          <Logo size="md" />
          <Text style={styles.appName}>{t('app.name')}</Text>
          <Text style={styles.tagline}>{t('app.tagline')}</Text>
          <Text style={styles.version}>{t('about.version')} {APP_VERSION}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('about.aboutDeliveryHub')}</Text>
          <Text style={styles.cardText}>{t('about.description')}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('about.contactSupport')}</Text>
          <TouchableOpacity style={styles.contactRow} onPress={() => openUrl(`tel:${SUPPORT_PHONE}`, t)}>
            <View style={[styles.contactIcon, { backgroundColor: colors.primarySoft, borderRadius: radii.md }]}>
              <Ionicons name="call-outline" size={18} color={colors.primary} />
            </View>
            <Text style={styles.contactText}>+91 {SUPPORT_PHONE}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.contactRow} onPress={() => openUrl(`mailto:${SUPPORT_EMAIL}`, t)}>
            <View style={[styles.contactIcon, { backgroundColor: colors.primarySoft, borderRadius: radii.md }]}>
              <Ionicons name="mail-outline" size={18} color={colors.primary} />
            </View>
            <Text style={styles.contactText}>{SUPPORT_EMAIL}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

export default AboutScreen;
