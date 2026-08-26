import { ComponentProps } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInUp,
  ZoomIn,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { AuthBackground } from '../../components/AuthBackground';
import { HeroBanner } from '../../components/HeroBanner';
import { FeatureCard } from '../../components/FeatureCard';
import { TextLink } from '../../components/TextLink';
import { TruckGlyph } from '../../components/AnimatedTruck';
import { useAppTheme } from '../../theme/useAppTheme';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../../navigation/types';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

interface Feature {
  icon: IoniconName;
  title: string;
  description: string;
  color: string;
}

// Moved inside component to support i18n

const ctaShadow = Platform.select({
  web: { boxShadow: '0 12px 26px rgba(91, 91, 255, 0.35)' },
  default: { shadowColor: '#4C3EE8', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.35, shadowRadius: 20, elevation: 8 },
});

interface CtaButtonProps {
  label: string;
  onPress: () => void;
}

const CtaButton = ({ label, onPress }: CtaButtonProps) => {
  const pressed = useSharedValue(false);
  const scaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pressed.value ? 0.97 : 1 }],
  }));
  const arrowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: pressed.value ? 7 : 0 }],
  }));

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => {
        pressed.value = true;
      }}
      onPressOut={() => {
        pressed.value = false;
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Animated.View style={[styles.ctaShadow, scaleStyle]}>
        <LinearGradient
          style={styles.cta}
          colors={['#5B5BFF', '#7A5CFF']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
        >
          <Text style={styles.ctaText}>{label}</Text>
          <Animated.View style={[styles.ctaArrow, arrowStyle]}>
            <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
          </Animated.View>
        </LinearGradient>
      </Animated.View>
    </Pressable>
  );
};

type Props = NativeStackScreenProps<AuthStackParamList, 'Welcome'>;

export const WelcomeScreen = ({ navigation }: Props) => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const { width } = useWindowDimensions();

  const contentWidth = Math.min(width, 480) - 48;
  const twoCol = width >= 600;
  const cardWidth = twoCol ? (contentWidth - 12) / 2 : contentWidth;

  const features: Feature[] = [
    { icon: 'navigate-outline', title: t('auth.realTimeTracking'), description: t('auth.liveMapTracking'), color: '#3B82F6' },
    { icon: 'people-outline', title: t('auth.fleetManagement'), description: t('auth.manageDrivers'), color: '#06B6D4' },
    { icon: 'analytics-outline', title: t('auth.businessAnalytics'), description: t('auth.insightsGrow'), color: '#8B5CF6' },
    { icon: 'shield-checkmark-outline', title: t('auth.enterpriseSecurity'), description: t('auth.bankGradeProtection'), color: '#10B981' },
  ];

  const cardEntering = (index: number) => FadeInDown.duration(420).delay(500 + index * 90).springify().damping(18);

  return (
    <View style={styles.flex}>
      <LinearGradient
        style={StyleSheet.absoluteFill}
        colors={[colors.backgroundGradientTop, colors.backgroundGradientMid, colors.backgroundGradientBottom]}
      />
      <AuthBackground />
      <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <Animated.View entering={FadeIn.duration(500)} style={styles.hero}>
            <HeroBanner heightFactor={0.3} />
          </Animated.View>

          <View style={styles.column}>
            <Animated.View
              entering={ZoomIn.duration(450).delay(180).springify().damping(14)}
              style={styles.logoWrap}
            >
              <View style={[styles.logoBadge, { borderColor: colors.primary, backgroundColor: colors.surface }]}>
                <TruckGlyph size={46} />
              </View>
            </Animated.View>

            <Animated.View
              entering={FadeInDown.duration(550).delay(280)}
              style={styles.heading}
            >
              <Text style={styles.eyebrow}>{t('auth.welcomeTo')}</Text>
              <Text style={[styles.title, { color: colors.navy }]}>{t('common.appName')}</Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                {t('auth.yourCompleteSolution')}
              </Text>
            </Animated.View>

            <View style={styles.cards}>
              {features.map((feature, index) => (
                <FeatureCard
                  key={feature.title}
                  icon={feature.icon}
                  title={feature.title}
                  description={feature.description}
                  color={feature.color}
                  width={cardWidth}
                  entering={cardEntering(index)}
                />
              ))}
            </View>

            <Animated.View entering={FadeInUp.duration(500).delay(900)} style={styles.ctaWrap}>
              <CtaButton
                label={t('auth.getStarted')}
                onPress={() => navigation.navigate('RoleSelection')}
              />
            </Animated.View>

            <Animated.View entering={FadeIn.duration(500).delay(980)} style={styles.signInRow}>
              <Text style={[styles.signInText, { color: colors.textSecondary }]}>{t('auth.alreadyHaveAccount')} </Text>
              <TextLink label={t('common.signIn')} onPress={() => navigation.navigate('RoleSelection')} />
            </Animated.View>

            <Animated.View entering={FadeIn.duration(500).delay(1060)} style={styles.legal}>
              <Text style={[styles.legalText, { color: colors.textMuted }]}>{t('auth.byContinuing')}</Text>
              <View style={styles.legalLinks}>
                <TextLink label={t('auth.termsOfService')} onPress={() => navigation.navigate('Terms')} />
                <Text style={[styles.legalText, { color: colors.textMuted }]}> {t('common.and')} </Text>
                <TextLink label={t('auth.privacyPolicy')} onPress={() => navigation.navigate('Privacy')} />
              </View>
            </Animated.View>
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
  scroll: {
    flexGrow: 1,
  },
  hero: {
    width: '100%',
    alignSelf: 'stretch',
  },
  column: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 32,
  },
  logoWrap: {
    alignItems: 'center',
  },
  logoBadge: {
    width: 92,
    height: 92,
    borderRadius: 26,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web'
      ? { boxShadow: '0 8px 16px rgba(99, 91, 255, 0.18)' }
      : {
          shadowColor: '#635BFF',
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.18,
          shadowRadius: 16,
          elevation: 5,
        }),
  },
  heading: {
    alignItems: 'center',
    marginTop: 18,
  },
  eyebrow: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 2.2,
    color: '#635BFF',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  title: {
    fontSize: 42,
    fontWeight: '900',
    letterSpacing: -1.2,
    lineHeight: 48,
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 8,
    fontSize: 16,
    fontWeight: '500',
    lineHeight: 24,
    textAlign: 'center',
  },
  cards: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 12,
    columnGap: 12,
    justifyContent: 'center',
    marginTop: 26,
  },
  ctaWrap: {
    marginTop: 28,
  },
  ctaShadow: {
    borderRadius: 20,
    ...ctaShadow,
  },
  cta: {
    height: 58,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  ctaText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  ctaArrow: {
    marginLeft: 10,
  },
  signInRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 22,
  },
  signInText: {
    fontSize: 14,
    fontWeight: '500',
  },
  legal: {
    alignItems: 'center',
    marginTop: 26,
  },
  legalText: {
    fontSize: 13,
    fontWeight: '400',
  },
  legalLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
});
