import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAppTheme } from '../../theme/useAppTheme';
import { useAuth } from '../../hooks/useAuth';
import { useAppNav } from '../../hooks/useAppNav';
import { useAuthStore } from '../../store/authStore';
import { useUserStore } from '../../store/userStore';
import { Header } from '../../components/Header';
import { CustomInput } from '../../components/CustomInput';
import { OTPInput } from '../../components/auth/OTPInput';
import { ActionButton } from '../../components/ActionButton';

const validateNewPassword = (pwd: string, t: (key: string) => string): string | undefined => {
  if (!pwd) return t('changePassword.passwordRequired');
  if (pwd.length < 8) return t('changePassword.mustBeAtLeast8');
  if (!/[A-Z]/.test(pwd)) return t('changePassword.mustContainUppercase');
  if (!/[a-z]/.test(pwd)) return t('changePassword.mustContainLowercase');
  if (!/[0-9]/.test(pwd)) return t('changePassword.mustContainNumber');
  if (!/[!@#$%^&*]/.test(pwd)) return t('changePassword.mustContainSpecial');
  return undefined;
};

/** Local password field with a show/hide eye toggle (non form-hook version). */
const PasswordField = ({
  label,
  placeholder,
  value,
  onChangeText,
  error,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChangeText: (text: string) => void;
  error?: string;
}) => {
  const [hidden, setHidden] = useState(true);
  return (
    <CustomInput
      label={label}
      icon="lock-closed-outline"
      placeholder={placeholder}
      value={value}
      onChangeText={onChangeText}
      secureTextEntry={hidden}
      autoCapitalize="none"
      autoCorrect={false}
      error={error}
      rightElement={
        <Pressable
          onPress={() => setHidden((h) => !h)}
          accessibilityRole="button"
          accessibilityLabel={hidden ? 'Show password' : 'Hide password'}
          hitSlop={8}
        >
          <Ionicons name={hidden ? 'eye-off-outline' : 'eye-outline'} size={18} color="#6B7280" />
        </Pressable>
      }
    />
  );
};

/**
 * Change Password screen. There is no in-session "current password → new
 * password" backend endpoint — the only real password-change mechanism the
 * app has is the email-OTP pair `POST /otp/forgot-password` +
 * `POST /otp/verify-password-reset`, already wired for the logged-out forgot
 * password flow. This screen reuses those exact endpoints for a logged-in
 * user changing their own password: request a code to their account email,
 * then verify it alongside the new password in one call.
 */
export const ChangePasswordScreen = () => {
  const { t } = useTranslation();
  const { colors, spacing, radii, fonts } = useAppTheme();
  const user = useUserStore((state) => state.user);
  const clearSession = useAuthStore((state) => state.clearSession);
  const { forgotPasswordOTP, verifyPasswordResetOTP } = useAuth();
  const { goBack } = useAppNav();

  const [step, setStep] = useState<'request' | 'verify'>('request');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [confirmError, setConfirmError] = useState<string | undefined>();

  const styles = StyleSheet.create({
    safe: { flex: 1 },
    header: { paddingTop: 8 },
    scroll: { flex: 1 },
    scrollContent: { paddingBottom: spacing.huge, paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
    form: { gap: spacing.md, marginBottom: spacing.lg },
    hint: { fontSize: fonts.size.xs, fontWeight: '500', color: colors.textMuted, lineHeight: 18 },
    note: { backgroundColor: colors.infoSoft, borderRadius: radii.md, padding: spacing.md, marginBottom: spacing.xl },
    noteText: { fontSize: fonts.size.sm, fontWeight: '500', color: colors.info, lineHeight: 20 },
    emailRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surfaceMuted, borderRadius: radii.md, padding: spacing.md, marginBottom: spacing.lg },
    emailText: { fontSize: fonts.size.md, fontWeight: '700', color: colors.textPrimary },
    otpLabel: { fontSize: fonts.size.sm, fontWeight: '700', color: colors.textSecondary, marginBottom: spacing.sm },
    resendLink: { alignSelf: 'center', marginTop: spacing.md, marginBottom: spacing.lg },
    resendText: { fontSize: fonts.size.sm, fontWeight: '700', color: colors.primary },
  });

  const email = user?.email ?? '';

  const handleSendCode = () => {
    forgotPasswordOTP.mutate(
      { email },
      {
        onSuccess: () => setStep('verify'),
        onError: () => Alert.alert(t('changePassword.couldNotSend'), t('changePassword.checkConnection')),
      },
    );
  };

  const handleSubmit = () => {
    const pwdErr = validateNewPassword(newPassword, t);
    const confErr = newPassword !== confirmPassword ? t('changePassword.passwordsMismatch') : undefined;
    setPasswordError(pwdErr);
    setConfirmError(confErr);
    if (pwdErr || confErr || otp.length < 6) {
      if (otp.length < 6) Alert.alert(t('changePassword.enterCode'), t('changePassword.enterCodeDesc'));
      return;
    }
    verifyPasswordResetOTP.mutate(
      { email, otp, password: newPassword },
      {
        onSuccess: () => {
          Alert.alert(t('changePassword.passwordChanged'), t('changePassword.passwordChangedDesc'), [
            { text: 'OK', onPress: () => clearSession() },
          ]);
        },
        onError: () => Alert.alert(t('changePassword.verificationFailed'), t('changePassword.codeInvalid')),
      },
    );
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Header title={t('common.changePassword')} leftAction={{ icon: 'chevron-back', onPress: goBack }} />
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {step === 'request' ? (
          <>
            <View style={styles.note}>
              <Text style={styles.noteText}>
                {t('changePassword.sendCodeNote')}
              </Text>
            </View>
            <View style={styles.emailRow}>
              <Ionicons name="mail-outline" size={18} color={colors.textMuted} />
              <Text style={styles.emailText}>{email || 'N/A'}</Text>
            </View>
            <ActionButton
              label={t('changePassword.sendCode')}
              icon="paper-plane"
              size="lg"
              fullWidth
              loading={forgotPasswordOTP.isPending}
              disabled={!email}
              onPress={handleSendCode}
            />
          </>
        ) : (
          <>
            <View style={styles.note}>
              <Text style={styles.noteText}>{t('changePassword.enterCodeWithPassword', { email })}</Text>
            </View>

            <Text style={styles.otpLabel}>{t('changePassword.verificationCode')}</Text>
            <View style={{ marginBottom: spacing.lg }}>
              <OTPInput value={otp} onChange={setOtp} accessibilityLabel={t('changePassword.verificationCode')} />
            </View>

            <View style={styles.form}>
              <PasswordField label={t('changePassword.newPassword')} placeholder={t('changePassword.enterNewPassword')} value={newPassword} onChangeText={setNewPassword} error={passwordError} />
              <PasswordField label={t('changePassword.confirmNewPassword')} placeholder={t('changePassword.reEnterNewPassword')} value={confirmPassword} onChangeText={setConfirmPassword} error={confirmError} />
              <Text style={styles.hint}>
                {t('changePassword.passwordHint')}
              </Text>
            </View>

            <ActionButton
              label={t('changePassword.updatePassword')}
              icon="lock-closed"
              size="lg"
              fullWidth
              loading={verifyPasswordResetOTP.isPending}
              onPress={handleSubmit}
            />

            <Pressable
              style={styles.resendLink}
              onPress={handleSendCode}
              disabled={forgotPasswordOTP.isPending}
              accessibilityRole="button"
              accessibilityLabel={t('changePassword.resendCode')}
            >
              <Text style={styles.resendText}>{forgotPasswordOTP.isPending ? t('changePassword.sending') : t('changePassword.resendCode')}</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

export default ChangePasswordScreen;
