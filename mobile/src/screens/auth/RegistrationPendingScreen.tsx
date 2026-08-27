import { Linking, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatedHeader } from '../../components/AnimatedHeader';
import { AuthScaffold } from '../../components/AuthScaffold';
import { ApprovalTimeline } from '../../components/auth/ApprovalTimeline';
import { GhostButton } from '../../components/auth/GhostButton';
import { NextStepsCard } from '../../components/auth/NextStepsCard';
import { StatusCard } from '../../components/auth/StatusCard';
import { SuccessMark } from '../../components/auth/SuccessMark';
import { PrimaryButton } from '../../components/PrimaryButton';
import { useRegistrationStatus } from '../../hooks/useRegistrationStatus';
import type { AuthStackParamList } from '../../navigation/types';
import { useRegistrationStore } from '../../store/registrationStore';
import { useAppTheme } from '../../theme/useAppTheme';
import { roleToAccountType } from '../../features/auth/types';

const SUPPORT_EMAIL = 'jobpilotdesk@gmail.com';

type Props = NativeStackScreenProps<AuthStackParamList, 'RegistrationPending'>;

const formatTime = (iso: string): string => {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Just now';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

interface DetailRow {
  label: string;
  value: string;
}

export const RegistrationPendingScreen = ({ navigation, route }: Props) => {
  const { t } = useTranslation();
  const { colors, spacing, fonts } = useAppTheme();
  const clearRegistration = useRegistrationStore((state) => state.clear);
  const persistedRequest = useRegistrationStore((state) => state.request);

  const request = route.params?.request ?? persistedRequest;

  const { data: latest, isRefreshing, isError, error, refetch } = useRegistrationStatus(request?.id, {
    intervalMs: 5000,
  });
  const status = latest?.status ?? request?.status;

  // Auto-advance when the admin approves or rejects the request (polled above).
  useEffect(() => {
    if (!request || !status) return;
    if (status === 'approved_pending_otp') {
      navigation.replace('OTPVerification', { requestId: request.id, isApproval: true, email: request.email });
    } else if (status === 'rejected') {
      navigation.replace('RegistrationRejected', {
        requestId: request.id,
        reason: latest?.rejectionReason ?? '',
        accountType: roleToAccountType(request.requestedRole),
      });
    }
  }, [status, latest?.rejectionReason, navigation, request]);

  // Admin deleted the request -> the server returns 404. Surface a rejected
  // state with an explanatory reason rather than silently polling forever.
  useEffect(() => {
    if (!isError || !request) return;
    const gone = error?.httpStatus === 404;
    if (gone) {
      navigation.replace('RegistrationRejected', {
        requestId: request.id,
        reason: 'This request could not be found. It may have been removed by an administrator.',
        accountType: roleToAccountType(request.requestedRole),
      });
    } else if (error) {
      // Transient network/server blip: the polling loop will retry shortly.
    }
  }, [isError, error, navigation, request]);

  if (!request) {
    // Never reached in practice (navigation only opens this with a request or
    // the persisted store is in flight); keep a safe fallback.
    return null;
  }

  const steps = [
    { key: 'submitted', label: t('auth.registrationSubmitted') },
    { key: 'review', label: t('auth.waitingForAdminApproval'), subtitle: t('common.pending') },
    { key: 'otp', label: t('auth.otpVerification'), subtitle: t('auth.lockedUntilApproval') },
    { key: 'active', label: t('auth.accountActivated'), subtitle: t('common.locked') },
  ];
  const activeIndex = status === 'pending' ? 1 : status === 'approved_pending_otp' ? 2 : 0;

  const details: DetailRow[] = [
    { label: t('common.name'), value: `${request.firstName} ${request.lastName}` },
    { label: t('common.company'), value: request.companyName },
    { label: t('common.email'), value: request.email },
    { label: t('common.phone'), value: request.phone },
    { label: t('auth.registrationTime'), value: formatTime(request.createdAt) },
  ];

  const backToLogin = () => {
    clearRegistration();
    navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
  };

  const contactSupport = () => {
    Linking.openURL(
      `mailto:${SUPPORT_EMAIL}?subject=Registration%20Status&body=Request%20ID%3A%20${encodeURIComponent(request.id)}`
    ).catch(() => {});
  };

  return (
    <AuthScaffold>
      <AnimatedHeader />

      <View style={styles.hero}>
        <SuccessMark tone="success" size={110} />
      </View>

      <Text style={[styles.title, { color: colors.textPrimary, fontSize: fonts.size.xxl, fontWeight: fonts.weight.heavy }]}>
        {t('auth.registrationSubmitted')}
      </Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary, fontSize: fonts.size.md }]}>
        {t('auth.registrationReceived')}
      </Text>

      <View style={{ height: spacing.xxl }} />

      <StatusCard icon="time-outline" title={t('auth.approvalProgress')}>
        <ApprovalTimeline steps={steps} activeIndex={activeIndex} />
      </StatusCard>

      <View style={{ height: spacing.lg }} />

      <StatusCard icon="document-text-outline" title={t('auth.registrationDetails')}>
        <View>
          {details.map((row) => (
            <View key={row.label} style={styles.detailRow}>
              <Text style={[styles.detailLabel, { color: colors.textMuted, fontSize: fonts.size.xs }]}>
                {row.label.toUpperCase()}
              </Text>
              <Text style={[styles.detailValue, { color: colors.textPrimary, fontSize: fonts.size.md }]}>{row.value}</Text>
            </View>
          ))}
        </View>
      </StatusCard>

      <View style={{ height: spacing.lg }} />

      <NextStepsCard
        steps={[
          { title: t('auth.step1ReviewApplication') },
          { title: t('auth.step2OTPWillBeSent') },
          { title: t('auth.step3EnterOTP') },
          { title: t('auth.step4AccountActive') },
          { title: t('auth.step5AutoSignIn') },
        ]}
      />

      <View style={{ height: spacing.md }} />

      <View style={styles.reviewNote}>
        <View style={[styles.dot, { backgroundColor: colors.warning }]} />
        <Text style={[styles.reviewText, { color: colors.textSecondary, fontSize: fonts.size.sm }]}>
          {status === 'pending' ? t('common.pendingReview') : t('common.updating')}
        </Text>
      </View>

      {isError && error?.httpStatus !== 404 ? (
        <Text accessibilityLiveRegion="polite" style={[styles.warning, { color: colors.warning, fontSize: fonts.size.sm }]}>
          {error?.message ?? t('common.serverErrorRetrying')}
        </Text>
      ) : (
        <Text accessibilityLiveRegion="polite" style={[styles.warning, { color: colors.warning, fontSize: fonts.size.sm }]}>
          {status === 'pending' ? t('auth.approvalWithinMinutes') : ''}
        </Text>
      )}

      <View style={{ height: spacing.xl }} />

      <PrimaryButton label={t('common.checkApprovalStatus')} loading={isRefreshing} onPress={refetch} showArrow />

      <View style={{ height: spacing.md }} />

      <GhostButton label={t('common.contactSupport')} onPress={contactSupport} icon="mail-outline" />

      <View style={{ height: spacing.md }} />

      <GhostButton label={t('common.backToLogin')} onPress={backToLogin} />
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
  detailRow: {
    paddingVertical: 10,
  },
  detailLabel: {
    letterSpacing: 1,
  },
  detailValue: {
    marginTop: 2,
    fontWeight: '600',
  },
  reviewNote: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  reviewText: {
    fontWeight: '500',
  },
  warning: {
    textAlign: 'center',
    marginTop: 12,
    minHeight: 20,
  },
});