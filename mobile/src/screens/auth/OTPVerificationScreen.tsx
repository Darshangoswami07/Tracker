import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeInUp, Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { AnimatedHeader } from '../../components/AnimatedHeader';
import { AuthScaffold } from '../../components/AuthScaffold';
import { GhostButton } from '../../components/auth/GhostButton';
import { OTPInput } from '../../components/auth/OTPInput';
import { StatusCard } from '../../components/auth/StatusCard';
import { SuccessMark } from '../../components/auth/SuccessMark';
import { Logo } from '../../components/Logo';
import { PrimaryButton } from '../../components/PrimaryButton';
import { ScreenHeading } from '../../components/ScreenHeading';
import { useAuth } from '../../hooks/useAuth';
import { toAppError } from '../../services/errorMapper';
import { registrationService } from '../../services/registrationService';
import { useAuthStore } from '../../store/authStore';
import { useRegistrationStore } from '../../store/registrationStore';
import { useAppTheme } from '../../theme/useAppTheme';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../../navigation/types';

const RESEND_SECONDS = 300; // 05:00

const fmt = (total: number) => {
  const m = Math.floor(total / 60).toString().padStart(2, '0');
  const s = (total % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
};

const SUCCESS_DISPLAY_MS = 1200;

type Props = NativeStackScreenProps<AuthStackParamList, 'OTPVerification'>;

export const OTPVerificationScreen = ({ navigation, route }: Props) => {
  const { colors, spacing, fonts } = useAppTheme();
  const verifyOTP = useAuth().verifyOTP;
  const stageSession = useAuthStore((state) => state.stageSession);
  const clearRegistration = useRegistrationStore((state) => state.clear);
  const persistedRequest = useRegistrationStore((state) => state.request);

  const isPasswordReset = route.params?.isPasswordReset === true;
  const requestId = route.params?.requestId ?? persistedRequest?.id ?? '';
  const email = isPasswordReset ? '' : (route.params?.email ?? persistedRequest?.email ?? '');

  const [otp, setOtp] = useState('');
  const [remain, setRemain] = useState(RESEND_SECONDS);
  const [resending, setResending] = useState(false);
  const [resendError, setResendError] = useState<string | null>(null);
  const [resendSuccess, setResendSuccess] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const progress = useSharedValue(0);

  const verifyError = useMemo(
    () => (verifyOTP.isError && verifyOTP.error ? toAppError(verifyOTP.error) : null),
    [verifyOTP.isError, verifyOTP.error]
  );

  // 05:00 countdown; resend unlocks when it reaches zero.
  useEffect(() => {
    if (remain <= 0) return;
    const id = setInterval(() => setRemain((r) => Math.max(0, r - 1)), 1000);
    return () => clearInterval(id);
  }, [remain]);

  useEffect(() => {
    progress.value = withTiming(remain / RESEND_SECONDS, { duration: 1000, easing: Easing.linear });
  }, [remain, progress]);

  const locked = remain > 0;

  const handleVerify = (code: string) => {
    if (code.length < 6 || verifyOTP.isPending) return;
    verifyOTP.mutate(
      { otp: code, requestId, isPasswordReset },
      {
        onSuccess: (result) => {
          if (!isPasswordReset && result.user.role !== 'admin') {
            // Persist the session silently so "Account Activated" can render first.
            stageSession(result.tokens, result.user);
          }
          clearRegistration();
          setShowSuccess(true);
          setTimeout(() => {
            if (isPasswordReset) {
              navigation.replace('ResetPassword', { requestId });
            } else if (result.user.role === 'admin') {
              // Admins are not auto-signed-in; they log in explicitly with the
              // password chosen at registration.
              navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
            } else {
              navigation.replace('RegistrationSuccess');
            }
          }, SUCCESS_DISPLAY_MS);
        },
      }
    );
  };

  const handleResend = async () => {
    if (resending) return;
    setResendError(null);
    setResendSuccess(null);
    if (!requestId) {
      setResendError('We could not resend the code. Please try signing in again.');
      return;
    }
    setResending(true);
    try {
      if (isPasswordReset) {
        setResendError('Password reset resending is not available on this route yet.');
        return;
      }
      await registrationService.resendApprovalOTP(requestId);
      setOtp('');
      if (verifyOTP.isError) verifyOTP.reset();
      setRemain(RESEND_SECONDS);
      setResendSuccess('A new verification code has been sent to your email.');
    } catch (raw) {
      setResendError(toAppError(raw).message);
    } finally {
      setResending(false);
    }
  };

  const progressStyle = useAnimatedStyle(() => ({
    width: `${Math.max(0, progress.value) * 100}%`,
  }));

  return (
    <AuthScaffold keyboardOffset={120}>
      <Animated.View entering={FadeIn.duration(350)}>
        <AnimatedHeader onBack={() => navigation.goBack()} />
      </Animated.View>

      <Animated.View entering={FadeInUp.duration(450).delay(60)} style={styles.logoRow}>
        <Logo size="sm" />
      </Animated.View>

      <View style={{ height: spacing.xxl }} />

      <ScreenHeading
        title={isPasswordReset ? 'Reset Password' : 'Verify Your Account'}
        subtitle={
          isPasswordReset
            ? "We've sent a one-time code to your email."
            : `Your application has been approved. We've sent an OTP to\n${email}`
        }
      />

      <View style={{ height: spacing.xxl }} />

      <LinearGradient
        colors={[colors.surface, colors.primarySoft]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.glass}
      >
        <OTPInput
          value={otp}
          onChange={(value) => {
            setOtp(value);
            if (verifyOTP.isError) verifyOTP.reset();
          }}
          onFilled={handleVerify}
          autoFocus
          disabled={verifyOTP.isPending}
          error={Boolean(verifyOTP.error)}
          accessibilityLabel="One-time passcode"
        />

        <View style={{ height: spacing.lg }} />

        <View style={styles.countdownRow}>
          <Text style={[styles.countdown, { color: colors.textSecondary, fontSize: fonts.size.sm }]}>
            {locked ? 'Code expires in' : 'Code expired'}
          </Text>
          <Text style={[styles.timer, { color: colors.textPrimary, fontSize: fonts.size.md, fontWeight: '700' }]}>
            {fmt(remain)}
          </Text>
        </View>
        <View style={[styles.track, { backgroundColor: colors.border }]}>
          <Animated.View style={[styles.fill, { backgroundColor: colors.primary }, progressStyle]} />
        </View>

        <View style={{ height: spacing.md }} />

        <Text style={[styles.hint, { color: colors.textSecondary, fontSize: fonts.size.sm }]}>
          Didn’t receive it? Check your spam folder or request a fresh code.
        </Text>

        <View style={{ height: spacing.sm }} />

        <GhostButton
          label={resending ? 'Sending…' : 'Resend OTP'}
          onPress={handleResend}
          loading={resending}
          disabled={locked || resending}
          icon="refresh-outline"
        />
        {resendSuccess ? (
          <Text style={[styles.successText, { color: colors.success, fontSize: fonts.size.sm }]}>{resendSuccess}</Text>
        ) : null}
        {resendError ? (
          <Text style={[styles.errorText, { color: colors.error, fontSize: fonts.size.sm }]}>{resendError}</Text>
        ) : null}
      </LinearGradient>

      {verifyOTP.isError && (
        <Animated.View entering={FadeIn.duration(300)} style={{ marginTop: spacing.md }}>
          <StatusCard icon="alert-circle-outline" title="Verification failed">
            <Text style={{ color: colors.textSecondary, fontSize: fonts.size.md }}>
              {verifyError?.message ?? 'We could not verify this code. Please try again.'}
            </Text>
          </StatusCard>
        </Animated.View>
      )}

      <View style={{ height: spacing.xl }} />

      <PrimaryButton
        label="Verify Now"
        loading={verifyOTP.isPending}
        onPress={() => handleVerify(otp)}
        disabled={otp.length < 6}
        showArrow
      />

      <View style={{ height: spacing.xl }} />

      <Text style={[styles.brand, { color: colors.textMuted, fontSize: 12 }]}>
        Secured by DeliveryHub · codes are valid for 5 minutes
      </Text>

      {showSuccess && <SuccessOverlay />}
    </AuthScaffold>
  );
};

/** Full-screen animated checkmark shown after a successful verification. */
const SuccessOverlay = () => {
  const { colors } = useAppTheme();
  return (
    <View style={styles.overlay}>
      <Animated.View entering={FadeInDown.springify().damping(14).stiffness(120)}>
        <SuccessMark tone="success" size={96} />
        <View style={{ height: 16 }} />
        <Text style={[styles.overlayText, { color: colors.onPrimary }]}>Verified!</Text>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  logoRow: {
    alignItems: 'center',
  },
  glass: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 20,
    ...(Platform.OS === 'web'
      ? { boxShadow: '0 10px 24px rgba(91, 76, 240, 0.1)' }
      : {
          shadowColor: '#5B4CF0',
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: 0.1,
          shadowRadius: 24,
          elevation: 4,
        }),
  },
  countdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  countdown: {
    fontWeight: '500',
  },
  timer: {
    fontVariant: ['tabular-nums'],
  },
  track: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  fill: {
    height: 6,
    borderRadius: 3,
  },
  hint: {
    fontWeight: '400',
  },
  brand: {
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  errorText: {
    marginTop: 10,
    textAlign: 'center',
    fontWeight: '500',
  },
  successText: {
    marginTop: 10,
    textAlign: 'center',
    fontWeight: '600',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(91, 76, 240, 0.96)',
  },
  overlayText: {
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 0.4,
  },
});