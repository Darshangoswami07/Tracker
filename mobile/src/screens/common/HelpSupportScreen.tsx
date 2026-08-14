import { useState } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/useAppTheme';
import { useAppNav } from '../../hooks/useAppNav';
import { Header } from '../../components/Header';

const SUPPORT_EMAIL = 'jobpilotdesk@gmail.com';
const SUPPORT_PHONE = '7456849590';
const HELP_CENTER_URL = 'https://deliveryhub.app/help';
const TERMS_URL = 'https://deliveryhub.app/terms';
const PRIVACY_URL = 'https://deliveryhub.app/privacy';

const FAQS: { q: string; a: string }[] = [
  {
    q: 'How do I track an order?',
    a: 'Open the Orders screen, tap the delivery you want to follow and select "Track". You will see the driver\'s live location and the latest status updates.',
  },
  {
    q: 'Why is my order still "pending"?',
    a: 'A pending order is waiting for a driver to accept it. You can check the assigned fleet, contact your driver, or cancel the order from the order details screen.',
  },
  {
    q: 'How do I update my profile or password?',
    a: 'Go to Settings from the menu. Use "Change Password" to update your credentials and the Profile screen to refresh your contact details.',
  },
  {
    q: 'The phone number I entered is not accepted.',
    a: 'Phone numbers must match the country code you used when registering. If you still face issues, contact support with your full name and the email on your account.',
  },
  {
    q: 'How do I report a problem with a delivery?',
    a: 'Open the order, tap Report a Problem and pick your issue. You can also reach our support team directly from this screen — use the button below.',
  },
];

const openUrl = (url: string) => {
  Linking.canOpenURL(url)
    .then((supported) => {
      if (supported) return Linking.openURL(url);
      throw new Error('unsupported');
    })
    .catch(() => {
      Alert.alert('Unable to Open', 'This link could not be opened from the app.');
    });
};

export const HelpSupportScreen = () => {
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
    Alert.alert('Contact Support', 'How would you like to reach us?', [
      { text: 'Call', onPress: () => openUrl(`tel:${SUPPORT_PHONE}`) },
      { text: 'Email', onPress: () => openUrl(`mailto:${SUPPORT_EMAIL}`) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleReport = () => {
    Alert.alert('Report a Problem', 'Describe the issue. Your feedback helps us improve.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Continue',
        onPress: () => {
          setSubmitted(true);
          Alert.alert(
            'Thanks, we got this.',
            'Our team usually replies within 24 hours. Meanwhile you can reach us directly via email.',
            [{ text: 'Email Support', onPress: () => openUrl(`mailto:${SUPPORT_EMAIL}?subject=DeliveryHub%20Problem`) }, { text: 'OK' }],
          );
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <Header title="Help & Support" leftAction={{ icon: 'chevron-back', onPress: goBack }} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {submitted && (
          <View style={[styles.card, { backgroundColor: '#EDFBF3' }]}>
            <View style={styles.row}>
              <View style={[styles.iconBox, { backgroundColor: '#10B98120' }]}>
                <Ionicons name="checkmark-circle" size={22} color="#10B981" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>Issue submitted</Text>
                <Text style={styles.rowHint}>We have recorded your feedback.</Text>
              </View>
            </View>
          </View>
        )}

        <Text style={styles.sectionTitle}>Contact Us</Text>

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
              <Text style={styles.rowLabel}>Phone</Text>
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
              <Text style={styles.rowLabel}>Email</Text>
              <Text style={styles.rowHint}>{SUPPORT_EMAIL}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.row} onPress={() => openUrl(HELP_CENTER_URL)} activeOpacity={0.7} accessibilityRole="button">
            <View style={styles.iconBox}>
              <Ionicons name="globe" size={20} color="#635BFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>Help Center</Text>
              <Text style={styles.rowHint}>Guides, videos and FAQs online</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.row} onPress={handleReport} activeOpacity={0.7} accessibilityRole="button">
            <View style={styles.iconBox}>
              <Ionicons name="alert-circle" size={20} color="#10B981" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>Report a Problem</Text>
              <Text style={styles.rowHint}>Order issues, payments, app bugs</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>Frequently Asked Questions</Text>
        <View style={styles.card}>
          {FAQS.map((faq, index) => {
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

        <Text style={styles.sectionTitle}>Legal</Text>
        <View style={styles.card}>
          <TouchableOpacity style={styles.row} onPress={() => openUrl(TERMS_URL)} activeOpacity={0.7}>
            <View style={styles.iconBox}>
              <Ionicons name="document-text" size={20} color="#635BFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>Terms of Service</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.row} onPress={() => openUrl(PRIVACY_URL)} activeOpacity={0.7}>
            <View style={styles.iconBox}>
              <Ionicons name="shield-checkmark" size={20} color="#635BFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>Privacy Policy</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        <Text style={{ textAlign: 'center', fontSize: fonts.size.xs, color: colors.textMuted, marginTop: spacing.sm }}>
          DeliveryHub v1.0.0 • Help & Support
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
};

export default HelpSupportScreen;