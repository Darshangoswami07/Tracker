import { StyleSheet, View, Text, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { AuthBackground } from '../../components/AuthBackground';
import { AnimatedHeader } from '../../components/AnimatedHeader';
import { FeatureCard } from '../../components/FeatureCard';
import { Logo } from '../../components/Logo';
import { useAppTheme } from '../../theme/useAppTheme';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'RoleSelection'>;

/**
 * "Choose how you want to use DeliveryHub" — the entry point into two
 * completely separate authentication portals. Only Staff and Admin are
 * offered (no Customer/User option). Each card leads straight into that
 * portal's own Login screen (which has its own Sign Up link) — there is no
 * way to switch role once inside a portal.
 */
export const RoleSelectionScreen = ({ navigation }: Props) => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const { width } = useWindowDimensions();
  const cardWidth = Math.min(width, 480) - 48;

  return (
    <View style={styles.flex}>
      <LinearGradient
        style={StyleSheet.absoluteFill}
        colors={[colors.backgroundGradientTop, colors.backgroundGradientMid, colors.backgroundGradientBottom]}
      />
      <AuthBackground />
      <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
        <AnimatedHeader onBack={() => navigation.goBack()} />

        <View style={styles.column}>
          <Animated.View entering={FadeIn.duration(450).delay(80)} style={styles.center}>
            <Logo size="sm" />
          </Animated.View>

          <Animated.View entering={FadeInDown.duration(500).delay(200)} style={styles.heading}>
            <Text style={[styles.title, { color: colors.navy }]}>{t('auth.chooseRoleTitle')}</Text>
            <Text style={[styles.brand, { color: colors.primary }]}>{t('auth.chooseRoleBrand')}</Text>
          </Animated.View>

          <View style={styles.cards}>
            <FeatureCard
              icon="people-outline"
              title={t('auth.staffRoleTitle')}
              description={t('auth.staffRoleSubtitle')}
              color="#06B6D4"
              width={cardWidth}
              entering={FadeInDown.duration(420).delay(360).springify().damping(18)}
              onPress={() => navigation.navigate('Login', { accountType: 'staff' })}
            />
            <FeatureCard
              icon="shield-checkmark-outline"
              title={t('auth.adminRoleTitle')}
              description={t('auth.adminRoleSubtitle')}
              color="#635BFF"
              width={cardWidth}
              entering={FadeInDown.duration(420).delay(450).springify().damping(18)}
              onPress={() => navigation.navigate('Login', { accountType: 'admin' })}
            />
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  column: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  center: {
    alignItems: 'center',
    marginTop: 12,
  },
  heading: {
    alignItems: 'center',
    marginTop: 28,
    marginBottom: 32,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.4,
    lineHeight: 30,
    textAlign: 'center',
  },
  brand: {
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: -0.8,
    lineHeight: 36,
    textAlign: 'center',
    marginTop: 2,
  },
  cards: {
    gap: 16,
  },
});

export default RoleSelectionScreen;
