import { StyleSheet, Text, View } from 'react-native';
import { ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { AuthBackground } from './AuthBackground';
import { AnimatedHeader } from './AnimatedHeader';
import { useAppTheme } from '../theme/useAppTheme';

interface LegalSection {
  heading?: string;
  paragraphs: string[];
}

interface LegalScreenProps {
  title: string;
  updatedAt: string;
  sections: LegalSection[];
}

/** Shared premium layout for legal pages (Terms, Privacy) on the auth flow. */
export const LegalScreen = ({ title, updatedAt, sections }: LegalScreenProps) => {
  const { colors, spacing, radii, fonts } = useAppTheme();

  return (
    <View style={styles.flex}>
      <LinearGradient
        style={StyleSheet.absoluteFill}
        colors={[colors.backgroundGradientTop, colors.backgroundGradientMid, colors.backgroundGradientBottom]}
      />
      <AuthBackground />
      <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
        <View style={styles.headerWrap}>
          <AnimatedHeader title={title} />
        </View>
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[styles.scroll, { paddingBottom: spacing.huge }]}
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.title, { color: colors.navy, fontSize: fonts.size.xxxl }]}>{title}</Text>
          <Text style={[styles.updated, { color: colors.textMuted, fontSize: fonts.size.sm }]}>
            Last updated: {updatedAt}
          </Text>

          {sections.map((section, index) => (
            <View key={index} style={[styles.section, { marginTop: spacing.xxl }]}>
              {section.heading ? (
                <Text style={[styles.heading, { color: colors.textPrimary, fontSize: fonts.size.xl }]}>
                  {section.heading}
                </Text>
              ) : null}
              {section.paragraphs.map((paragraph, pIndex) => (
                <Text
                  key={pIndex}
                  style={[styles.body, { color: colors.textSecondary, fontSize: fonts.size.md, lineHeight: 24 }]}
                >
                  {paragraph}
                </Text>
              ))}
            </View>
          ))}

          <View style={[styles.footerCard, { backgroundColor: colors.surface, borderRadius: radii.xl }]}>
            <Text style={[styles.footerText, { color: colors.textSecondary, fontSize: fonts.size.sm }]}>
              Questions? Contact our support team at jobpilotdesk@gmail.com or call +91 7456849590
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  headerWrap: {
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  scroll: {
    paddingHorizontal: 24,
  },
  title: {
    fontWeight: '900',
    letterSpacing: -0.6,
    marginTop: 16,
  },
  updated: {
    marginTop: 6,
    fontWeight: '500',
  },
  section: {
    gap: 12,
  },
  heading: {
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  body: {
    fontWeight: '400',
  },
  footerCard: {
    marginTop: 24,
    padding: 16,
    alignItems: 'center',
  },
  footerText: {
    textAlign: 'center',
    fontWeight: '500',
  },
});
