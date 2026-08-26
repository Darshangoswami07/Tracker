import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AnimatedHeader } from '../../components/AnimatedHeader';
import { AuthScaffold } from '../../components/AuthScaffold';
import { GhostButton } from '../../components/auth/GhostButton';
import { StatusCard } from '../../components/auth/StatusCard';
import { SuccessMark } from '../../components/auth/SuccessMark';
import { PrimaryButton } from '../../components/PrimaryButton';
import type { AuthStackParamList } from '../../navigation/types';
import { useAppTheme } from '../../theme/useAppTheme';

type Props = NativeStackScreenProps<AuthStackParamList, 'StaffApprovalPending'>;

/**
 * Shown right after Staff signup, and reachable from Staff Login's "View
 * Status" action while the account is still PENDING. No OTP/email step —
 * the applicant simply waits here until an Admin approves them from the
 * Staff Approvals screen.
 */
export const StaffApprovalPendingScreen = ({ navigation }: Props) => {
  const { t } = useTranslation();
  const { colors, spacing, fonts } = useAppTheme();

  return (
    <AuthScaffold>
      <AnimatedHeader onBack={() => navigation.goBack()} />

      <View style={styles.hero}>
        <SuccessMark tone="pending" size={128} />
      </View>

      <Text style={[styles.title, { color: colors.textPrimary, fontSize: fonts.size.xxl, fontWeight: fonts.weight.heavy }]}>
        {t('auth.awaitingAdminApproval')}
      </Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary, fontSize: fonts.size.md }]}>
        {t('auth.staffAccountPending')}
      </Text>

      <View style={{ height: spacing.xxl }} />

      <StatusCard icon="time-outline" title={t('auth.whatHappensNext')}>
        <Text style={[styles.body, { color: colors.textPrimary, fontSize: fonts.size.md }]}>
          {t('auth.staffApprovalDescription')}
        </Text>
      </StatusCard>

      <View style={{ height: spacing.xl }} />

      <PrimaryButton
        label={t('common.trySigningIn')}
        onPress={() => navigation.navigate('Login', { accountType: 'staff' })}
        showArrow
      />

      <View style={{ height: spacing.md }} />

      <GhostButton label={t('common.backToRoleSelection')} onPress={() => navigation.navigate('RoleSelection')} icon="swap-horizontal-outline" />
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
  body: {
    lineHeight: 24,
  },
});

export default StaffApprovalPendingScreen;
