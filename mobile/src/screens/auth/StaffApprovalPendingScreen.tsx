import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { StyleSheet, Text, View } from 'react-native';
import { AnimatedHeader } from '../../components/AnimatedHeader';
import { AuthScaffold } from '../../components/AuthScaffold';
import { GhostButton } from '../../components/auth/GhostButton';
import { StatusCard } from '../../components/auth/StatusCard';
import { SuccessMark } from '../../components/auth/SuccessMark';
import { PrimaryButton } from '../../components/PrimaryButton';
import { STRINGS } from '../../constants/strings';
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
  const { colors, spacing, fonts } = useAppTheme();

  return (
    <AuthScaffold>
      <AnimatedHeader onBack={() => navigation.goBack()} />

      <View style={styles.hero}>
        <SuccessMark tone="pending" size={128} />
      </View>

      <Text style={[styles.title, { color: colors.textPrimary, fontSize: fonts.size.xxl, fontWeight: fonts.weight.heavy }]}>
        Awaiting Admin Approval
      </Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary, fontSize: fonts.size.md }]}>
        {STRINGS.staffAccountPending}
      </Text>

      <View style={{ height: spacing.xxl }} />

      <StatusCard icon="time-outline" title="What happens next">
        <Text style={[styles.body, { color: colors.textPrimary, fontSize: fonts.size.md }]}>
          An Admin reviews your Staff application from the Staff Approvals screen. Once approved,
          you can sign in with the same email and password right away — no verification code needed.
        </Text>
      </StatusCard>

      <View style={{ height: spacing.xl }} />

      <PrimaryButton
        label="Try Signing In"
        onPress={() => navigation.replace('Login', { accountType: 'staff' })}
        showArrow
      />

      <View style={{ height: spacing.md }} />

      <GhostButton label="Back to Role Selection" onPress={() => navigation.navigate('RoleSelection')} icon="swap-horizontal-outline" />
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
