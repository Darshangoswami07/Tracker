import { useEffect, useState } from 'react';
import { Animated, Keyboard, KeyboardAvoidingView, ScrollView, StyleSheet, Text, TouchableOpacity, View, TextInput, Alert, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/useAppTheme';
import { useAuthStore } from '../../store/authStore';
import { api } from '../../api/client';
import { toAppError } from '../../services/errorMapper';
import { Header } from '../../components/Header';
import { PasswordField } from '../../components/PasswordField';
import { PrimaryButton } from '../../components/PrimaryButton';
import { TextLink } from '../../components/TextLink';
import { Logo } from '../../components/Logo';
import type { AppTheme } from '../../theme/types';

export const ResetPasswordScreen = ({ route }: any) => {
  const { requestId } = route.params;
  const { colors, spacing, radii, fonts, shadows } = useAppTheme();
  const clearSession = useAuthStore((state) => state.clearSession);

  const styles = createStyles({ colors, spacing, radii, fonts, shadows });

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<{ password?: string; confirmPassword?: string }>({});
  const [submitting, setSubmitting] = useState(false);
  const [fadeAnim] = useState(new Animated.Value(0));
  const [slideAnim] = useState(new Animated.Value(50));

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(slideAnim, { toValue: 0, duration: 600, useNativeDriver: Platform.OS !== 'web' }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  const validatePassword = (pwd: string): string | undefined => {
    if (!pwd) return 'Password is required';
    if (pwd.length < 8) return 'Password must be at least 8 characters';
    if (!/[A-Z]/.test(pwd)) return 'Password must contain at least one uppercase letter';
    if (!/[a-z]/.test(pwd)) return 'Password must contain at least one lowercase letter';
    if (!/[0-9]/.test(pwd)) return 'Password must contain at least one number';
    if (!/[!@#$%^&*]/.test(pwd)) return 'Password must contain at least one special character (!@#$%^&*)';
    return undefined;
  };

  const validateConfirmPassword = (pwd: string, confirm: string): string | undefined => {
    if (!confirm) return 'Please confirm your password';
    if (pwd !== confirm) return 'Passwords do not match';
    return undefined;
  };

  const handlePasswordChange = (value: string) => {
    setPassword(value);
    setErrors(prev => ({ ...prev, password: validatePassword(value) }));
  };

  const handleConfirmPasswordChange = (value: string) => {
    setConfirmPassword(value);
    setErrors(prev => ({ ...prev, confirmPassword: validateConfirmPassword(password, value) }));
  };

  const handleSubmit = async () => {
    const passwordError = validatePassword(password);
    const confirmError = validateConfirmPassword(password, confirmPassword);

    if (passwordError || confirmError) {
      setErrors({ password: passwordError, confirmPassword: confirmError });
      return;
    }

    setSubmitting(true);
    try {
      await api.post('/auth/reset-password', {
        requestId,
        newPassword: password,
      });
      Alert.alert('Success', 'Your password has been reset successfully. Please sign in with your new password.');
      clearSession();
    } catch (error) {
      console.error('Reset password failed:', error);
      const message = toAppError(error).message;
      Alert.alert('Error', message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView behavior="padding" style={styles.keyboardAvoiding} keyboardVerticalOffset={80}>
        <Animated.View
          style={{
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          }}
        >
          <View style={styles.container}>
            <View style={styles.backButton}>
              <TouchableOpacity onPress={clearSession}>
                <Ionicons name="chevron-back" size={28} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <View style={styles.logoContainer}>
              <Logo size="lg" />
            </View>

            <View style={styles.header}>
              <Text style={styles.title}>Reset Password</Text>
              <Text style={styles.subtitle}>Enter your new password below</Text>
            </View>

            <View style={styles.form}>
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>New Password</Text>
                <PasswordField
                  label="New Password"
                  value={password}
                  onChangeText={handlePasswordChange}
                  placeholder="Enter new password"
                  error={errors.password}
                  autoFocus
                  textContentType="newPassword"
                />
                <View style={styles.passwordRequirements}>
                  <Requirement met={password.length >= 8} text="At least 8 characters" />
                  <Requirement met={/[A-Z]/.test(password)} text="One uppercase letter" />
                  <Requirement met={/[a-z]/.test(password)} text="One lowercase letter" />
                  <Requirement met={/[0-9]/.test(password)} text="One number" />
                  <Requirement met={/[!@#$%^&*]/.test(password)} text="One special character" />
                </View>
              </View>

              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Confirm Password</Text>
                <PasswordField
                  label="Confirm Password"
                  value={confirmPassword}
                  onChangeText={handleConfirmPasswordChange}
                  placeholder="Confirm new password"
                  error={errors.confirmPassword}
                  textContentType="newPassword"
                />
              </View>

              <PrimaryButton
                label={submitting ? 'Resetting...' : 'Reset Password'}
                loading={submitting}
                onPress={handleSubmit}
                disabled={submitting || !!errors.password || !!errors.confirmPassword || !password || !confirmPassword}
              />
            </View>

            <View style={styles.footer}>
              <Text style={styles.footerText}>Remember your password? </Text>
              <TextLink label="Sign In" onPress={clearSession} />
            </View>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const Requirement = ({ met, text }: { met: boolean; text: string }) => {
  const { colors, spacing, radii, fonts, shadows } = useAppTheme();
  const styles = createStyles({ colors, spacing, radii, fonts, shadows });
  return (
    <View style={styles.requirement}>
      <View style={[styles.requirementDot, { backgroundColor: met ? '#10B981' : '#E5E7EB', borderColor: met ? '#10B981' : '#E5E7EB' }]} />
      <Text style={[styles.requirementText, { color: met ? '#10B981' : colors.textMuted }]}>{text}</Text>
    </View>
  );
};

const createStyles = (theme: Pick<AppTheme, 'colors' | 'spacing' | 'radii' | 'fonts' | 'shadows'>) =>
  StyleSheet.create({
    safe: { flex: 1 },
    keyboardAvoiding: { flex: 1 },
    container: { flex: 1, paddingHorizontal: theme.spacing.xl, justifyContent: 'center' },
    backButton: { marginBottom: theme.spacing.md },
    logoContainer: { alignItems: 'center', marginBottom: theme.spacing.lg },
    header: { alignItems: 'center', marginBottom: theme.spacing.xl },
    title: { fontSize: theme.fonts.size.xxl, fontWeight: '900', color: theme.colors.textPrimary, marginBottom: theme.spacing.sm },
    subtitle: { fontSize: theme.fonts.size.md, color: theme.colors.textSecondary },
    form: { gap: theme.spacing.lg, width: '100%' },
    field: { gap: theme.spacing.sm },
    fieldLabel: { fontSize: theme.fonts.size.sm, fontWeight: '700', color: theme.colors.textSecondary },
    passwordRequirements: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.md, marginTop: theme.spacing.sm },
    requirement: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs },
    requirementDot: { width: 6, height: 6, borderRadius: 3, borderWidth: 1 },
    requirementText: { fontSize: theme.fonts.size.xs, fontWeight: '500' },
    footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: theme.spacing.xl, paddingTop: theme.spacing.lg, borderTopWidth: 1, borderTopColor: '#F3F4F6' },
    footerText: { color: theme.colors.textMuted, fontSize: theme.fonts.size.md },
  });

export default ResetPasswordScreen;