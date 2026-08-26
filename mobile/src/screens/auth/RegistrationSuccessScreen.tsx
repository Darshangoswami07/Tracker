import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeInUp, ZoomIn } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { AuthScaffold } from '../../components/AuthScaffold';
import { SuccessMark } from '../../components/auth/SuccessMark';
import { useAuthStore } from '../../store/authStore';
import { useUserStore } from '../../store/userStore';
import { useAppTheme } from '../../theme/useAppTheme';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../../navigation/types';

const REDIRECT_SECONDS = 3;

type Props = NativeStackScreenProps<AuthStackParamList, 'RegistrationSuccess'>;

export const RegistrationSuccessScreen = (_props: Props) => {
  const { t } = useTranslation();
  const { colors, spacing, fonts } = useAppTheme();
  const activateSession = useAuthStore((state) => state.activateSession);
  const user = useUserStore((state) => state.user);
  const [count, setCount] = useState(REDIRECT_SECONDS);

  // Auto-switch to the role dashboard after a short countdown.
  useEffect(() => {
    const id = setInterval(() => setCount((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (count <= 0) activateSession();
  }, [count, activateSession]);

  const firstName = user?.fullName?.split(' ')[0] ?? '';

  return (
    <AuthScaffold>
      <Animated.View entering={FadeInUp.duration(500)} style={styles.hero}>
        <Animated.View entering={ZoomIn.springify().damping(12).stiffness(110)}>
          <SuccessMark tone="success" size={128} />
        </Animated.View>
        <Text style={[styles.title, { color: colors.textPrimary, fontSize: fonts.size.xxxl, fontWeight: fonts.weight.heavy }]}>
          {t('common.welcome')}{firstName ? `, ${firstName}` : ''}
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary, fontSize: fonts.size.md }]}>
          {t('auth.welcomeToDeliveryHub')}
        </Text>
      </Animated.View>

      <View style={{ height: spacing.xxl }} />

      <LinearGradient
        colors={[colors.surface, colors.successSoft]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.card, { borderColor: colors.border }]}
      >
        <Text style={[styles.cardTitle, { color: colors.success, fontSize: fonts.size.lg, fontWeight: '700' }]}>
          {t('auth.accountActivated')}
        </Text>
        <Text style={[styles.cardBody, { color: colors.textSecondary, fontSize: fonts.size.md }]}>
          {t('auth.accountActivatedMessage')}
        </Text>
      </LinearGradient>

      <View style={{ height: spacing.xxl }} />

      <Animated.View entering={FadeInDown.delay(250).duration(500)} style={styles.redirectRow}>
        <Text style={[styles.redirectLabel, { color: colors.textSecondary, fontSize: fonts.size.md }]}>
          {t('auth.redirectingToDashboard')}
        </Text>
        <View style={[styles.countBadge, { backgroundColor: colors.primarySoft }]}>
          <Text style={[styles.countNumber, { color: colors.primary, fontSize: fonts.size.lg, fontWeight: '800' }]}>
            {count}
          </Text>
        </View>
      </Animated.View>
    </AuthScaffold>
  );
};

const styles = StyleSheet.create({
  hero: {
    alignItems: 'center',
    gap: 12,
  },
  title: {
    textAlign: 'center',
    letterSpacing: -0.5,
    marginTop: 8,
  },
  subtitle: {
    textAlign: 'center',
    fontWeight: '600',
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    gap: 6,
  },
  cardTitle: {
    letterSpacing: 0.2,
  },
  cardBody: {
    lineHeight: 24,
  },
  redirectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  redirectLabel: {
    fontWeight: '500',
  },
  countBadge: {
    minWidth: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  countNumber: {
    fontVariant: ['tabular-nums'],
  },
});
