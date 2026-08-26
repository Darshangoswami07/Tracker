import { useState } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAppTheme } from '../../theme/useAppTheme';
import { useAppNav } from '../../hooks/useAppNav';
import { Header } from '../../components/Header';

const SUPPORT_EMAIL = 'jobpilotdesk@gmail.com';
const SUPPORT_PHONE = '7456849590';
const HELP_CENTER_URL = 'https://deliveryhub.app/help';
const TERMS_URL = 'https://deliveryhub.app/terms';
const PRIVACY_URL = 'https://deliveryhub.app/privacy';

const getFaqs = (t: (key: string) => string): { q: string; a: string }[] => [
  { q: t('help.faq1Q'), a: t('help.faq1A') },
  { q: t('help.faq2Q'), a: t('help.faq2A') },
  { q: t('help.faq3Q'), a: t('help.faq3A') },
  { q: t('help.faq4Q'), a: t('help.faq4A') },
  { q: t('help.faq5Q'), a: t('help.faq5A') },
];

const openUrl = (url: string, t: (key: string) => string) => {
  Linking.canOpenURL(url)
    .then((supported) => {
      if (supported) return Linking.openURL(url);
      throw new Error('unsupported');
    })
    .catch(() => {
      Alert.alert(t('help.unableToOpen'), t('help.unableToOpenDesc'));
    });
};

export const HelpSupportScreen = () => {
  const { t } = useTranslation();
  const { colors, spacing, radii, fonts, shadows } = useAppTheme();
  const { goBack } = useAppNav();
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [submitted, setSubmitted] = useState(false);

  const styles = StyleSheet.create({
    safe: { flex: 1 },
    scrollContent: { padding: spacing.lg, paddingBottom: 40, gap: spacing.xl },
    sectionTitle: { fontSize: fonts.size.md, fontWeight: '800', marginBottom: spacing.sm, color: colors.textPrimary },
    card: { backgroundColor: colors.surface, borderRadius: radii.xl, overflow: 'hidden', ...shadows.sm },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      padding: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    iconBox: {
      width: 40,
      height: 40,
      borderRadius: radii.md,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#635BFF15',
    },
    rowLabel: { fontSize: fonts.size.md, fontWeight: '600', color: colors.textPrimary },
    rowHint: { fontSize: fonts.size.xs, color: colors.textMuted, marginTop: 2 },
    faqHeader: { flex: 1 },
    faqArrow: { fontSize: fonts.size.md, color: colors.textMuted },
    faqBody: {
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.md,
      fontSize: fonts.size.sm,
      lineHeight: 20,
      color: colors.textSecondary,
    },
  });

  const showContactChoices = () => {
    Alert.alert(t('help.contactUs'), t('help.howToReachUs'), [
      { text: t('help.call'), onPress: () => openUrl(`tel:${SUPPORT_PHONE}`, t) },
      { text: t('help.email'), onPress: () => openUrl(`mailto:${SUPPORT_EMAIL}`, t) },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  };

  const handleReport = () => {
    Alert.alert(t('help.reportProblem'), t('help.describeIssue'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.continue'),
        onPress: () => {
          setSubmitted(true);
          Alert.alert(
            t('help.thanksTitle'),
            t('help.thanksMessage'),
            [{ text: t('help.emailSupport'), onPress: () => openUrl(`mailto:${SUPPORT_EMAIL}?subject=DeliveryHub%20Problem`, t) }, { text: t('common.ok') }],
          );
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <Header title={t('help.title')} leftAction={{ icon: 'chevron-back', onPress: goBack }} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {submitted && (
          <View style={[styles.card, { backgroundColor: '#EDFBF3' }]}>
            <View style={styles.row}>
              <View style={[styles.iconBox, { backgroundColor: '#10B98120' }]}>
                <Ionicons name="checkmark-circle" size={22} color="#10B981" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>{t('help.issueSubmitted')}</Text>
                <Text style={styles.rowHint}>{t('help.feedbackRecorded')}</Text>
              </View>
            </View>
          </View>
        )}

        <Text style={styles.sectionTitle}>{t('help.contactUs')}</Text>

        <View style={styles.card}>
          <TouchableOpacity
            style={styles.row}
            onPress={showContactChoices}
            activeOpacity={0.7}
            accessibilityRole="button"
          >
            <View style={styles.iconBox}>
              <Ionicons name="call" size={20} color="#635BFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>{t('help.phone')}</Text>
              <Text style={styles.rowHint}>+91 {SUPPORT_PHONE}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.row}
            onPress={showContactChoices}
            activeOpacity={0.7}
            accessibilityRole="button"
          >
            <View style={styles.iconBox}>
              <Ionicons name="mail" size={20} color="#635BFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>{t('help.email')}</Text>
              <Text style={styles.rowHint}>{SUPPORT_EMAIL}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.row} onPress={() => openUrl(HELP_CENTER_URL, t)} activeOpacity={0.7} accessibilityRole="button">
            <View style={styles.iconBox}>
              <Ionicons name="globe" size={20} color="#635BFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>{t('help.helpCenter')}</Text>
              <Text style={styles.rowHint}>{t('help.helpCenterDesc')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.row} onPress={handleReport} activeOpacity={0.7} accessibilityRole="button">
            <View style={styles.iconBox}>
              <Ionicons name="alert-circle" size={20} color="#10B981" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>{t('help.reportProblem')}</Text>
              <Text style={styles.rowHint}>{t('help.reportProblemDesc')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>{t('help.faq')}</Text>
        <View style={styles.card}>
          {getFaqs(t).map((faq, index) => {
            const expanded = openFaq === index;
            return (
              <TouchableOpacity
                key={faq.q}
                onPress={() => setOpenFaq(expanded ? null : index)}
                activeOpacity={0.7}
                accessibilityRole="button"
              >
                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowLabel}>{faq.q}</Text>
                  </View>
                  <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} />
                </View>
                {expanded && <Text style={styles.faqBody}>{faq.a}</Text>}
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.sectionTitle}>{t('help.legal')}</Text>
        <View style={styles.card}>
          <TouchableOpacity style={styles.row} onPress={() => openUrl(TERMS_URL, t)} activeOpacity={0.7}>
            <View style={styles.iconBox}>
              <Ionicons name="document-text" size={20} color="#635BFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>{t('settings.termsOfService')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.row} onPress={() => openUrl(PRIVACY_URL, t)} activeOpacity={0.7}>
            <View style={styles.iconBox}>
              <Ionicons name="shield-checkmark" size={20} color="#635BFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>{t('settings.privacyPolicy')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        <Text style={{ textAlign: 'center', fontSize: fonts.size.xs, color: colors.textMuted, marginTop: spacing.sm }}>
          DeliveryHub v1.0.0 • {t('help.title')}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
};

export default HelpSupportScreen;