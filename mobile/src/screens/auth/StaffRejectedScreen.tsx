import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AnimatedHeader } from '../../components/AnimatedHeader';
import { AuthScaffold } from '../../components/AuthScaffold';
import { GhostButton } from '../../components/auth/GhostButton';
import { StatusCard } from '../../components/auth/StatusCard';
import { SuccessMark } from '../../components/auth/SuccessMark';
import { PrimaryButton } from '../../components/PrimaryButton';
import type { AuthStackParamList } from '../../navigation/types';
import { useAppTheme } from '../../theme/useAppTheme';

const SUPPORT_EMAIL = 'jobpilotdesk@gmail.com';

type Props = NativeStackScreenProps<AuthStackParamList, 'StaffRejected'>;

/**
 * Shown when a REJECTED Staff account tries to log in. The account record
 * is never deleted server-side — this is purely informational.
 */
export const StaffRejectedScreen = ({ navigation, route }: Props) => {
  const { t } = useTranslation();
  const { colors, spacing, fonts } = useAppTheme();
  const reason = route.params?.reason;

  const contactSupport = () => {
    Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=Staff%20Account%20Rejected`).catch(() => {});
  };

  return (
    <AuthScaffold>
      <AnimatedHeader onBack={() => navigation.goBack()} />

      <View style={styles.hero}>
        <SuccessMark tone="error" size={128} />
      </View>

      <Text style={[styles.title, { color: colors.textPrimary, fontSize: fonts.size.xxl, fontWeight: fonts.weight.heavy }]}>
        {t('auth.staffAccountRejectedTitle')}
      </Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary, fontSize: fonts.size.md }]}>
        {t('auth.staffAccountRejectedMessage')}
      </Text>

      {reason ? (
        <>
          <View style={{ height: spacing.xxl }} />
          <StatusCard icon="alert-circle-outline" title={t('auth.messageFromAdmin')}>
            <Text style={[styles.reason, { color: colors.textPrimary, fontSize: fonts.size.md }]}>{reason}</Text>
          </StatusCard>
        </>
      ) : null}

      <View style={{ height: spacing.xl }} />

      <PrimaryButton label={t('common.backToRoleSelection')} onPress={() => navigation.navigate('RoleSelection')} showArrow />

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

export default StaffRejectedScreen;
