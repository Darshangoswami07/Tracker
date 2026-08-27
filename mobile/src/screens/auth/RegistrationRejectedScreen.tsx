import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AnimatedHeader } from '../../components/AnimatedHeader';
import { AuthScaffold } from '../../components/AuthScaffold';
import { GhostButton } from '../../components/auth/GhostButton';
import { StatusCard } from '../../components/auth/StatusCard';
import { SuccessMark } from '../../components/auth/SuccessMark';
import { PrimaryButton } from '../../components/PrimaryButton';
import { useRegistrationStore } from '../../store/registrationStore';
import type { AuthStackParamList } from '../../navigation/types';
import { useAppTheme } from '../../theme/useAppTheme';

const SUPPORT_EMAIL = 'jobpilotdesk@gmail.com';

type Props = NativeStackScreenProps<AuthStackParamList, 'RegistrationRejected'>;

export const RegistrationRejectedScreen = ({ navigation, route }: Props) => {
  const { t } = useTranslation();
  const { colors, spacing, fonts } = useAppTheme();
  const { reason } = route.params;
  const clearRegistration = useRegistrationStore((state) => state.clear);

  const editApplication = () => {
    clearRegistration();
    // Re-open the register form for the same account type,
    // never the default role-selection flow.
    navigation.replace('Register', { accountType: route.params.accountType ?? 'admin' });
  };

  const contactSupport = () => {
    Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=Registration%20Request%20Rejected`).catch(() => {});
  };

  return (
    <AuthScaffold>
      <AnimatedHeader onBack={() => navigation.goBack()} />

      <View style={styles.hero}>
        <SuccessMark tone="error" size={128} />
      </View>

      <Text style={[styles.title, { color: colors.textPrimary, fontSize: fonts.size.xxl, fontWeight: fonts.weight.heavy }]}>
        {t('auth.registrationRejected')}
      </Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary, fontSize: fonts.size.md }]}>
        {t('auth.registrationNotApproved')}
      </Text>

      <View style={{ height: spacing.xxl }} />

      <StatusCard icon="alert-circle-outline" title={t('common.reason')}>
        <Text style={[styles.reason, { color: colors.textPrimary, fontSize: fonts.size.md }]}>
          {reason?.trim() ? reason : t('auth.infoNotVerified')}
        </Text>
      </StatusCard>

      <View style={{ height: spacing.xl }} />

      <PrimaryButton label={t('common.editApplication')} onPress={editApplication} showArrow />

      <View style={{ height: spacing.md }} />

      <GhostButton label={t('common.contactSupport')} onPress={contactSupport} icon="mail-outline" />
    </AuthScaffold>
  );
};

const styles = StyleSheet.create({
  hero: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  title: {
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  subtitle: {
    textAlign: 'center',
    lineHeight: 24,
    marginTop: 8,
  },
  reason: {
    lineHeight: 24,
  },
});