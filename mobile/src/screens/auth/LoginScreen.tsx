import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { StyleSheet, Text, View } from 'react-native';
import { AnimatedHeader } from '../../components/AnimatedHeader';
import { AuthScaffold } from '../../components/AuthScaffold';
import { FormCheckbox } from '../../components/form/FormCheckbox';
import { FormPasswordField } from '../../components/form/FormPasswordField';
import { FormTextBox } from '../../components/form/FormTextBox';
import { FormNotice } from '../../components/FormNotice';
import { PrimaryButton } from '../../components/PrimaryButton';
import { HeroBanner } from '../../components/HeroBanner';
import { Logo } from '../../components/Logo';
import { ScreenHeading } from '../../components/ScreenHeading';
import { TextLink } from '../../components/TextLink';
import { useAuth } from '../../hooks/useAuth';
import { useSessionStore } from '../../store/sessionStore';
import { useAppTheme } from '../../theme/useAppTheme';
import { STRINGS } from '../../constants/strings';
import { loginSchema, type LoginValues } from '../../features/auth/schemas/authSchemas';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

/** Cosmetic-only heading per account type; the login form/logic is identical
 *  for every role — the backend, not this selection, decides who the user is.
 *  Each account type still hits its own dedicated portal endpoint
 *  (`/auth/staff/login` vs `/auth/admin/login`), so the separation is
 *  backend-enforced, not just a label swap. */
const LOGIN_HEADINGS: Record<'admin' | 'staff', string> = {
  admin: STRINGS.adminLoginTitle,
  staff: STRINGS.staffLoginTitle,
};

export const LoginScreen = ({ navigation, route }: Props) => {
  const { colors, spacing } = useAppTheme();
  const login = useAuth().login;
  const accountType = route.params?.accountType;
  const headingTitle = accountType ? LOGIN_HEADINGS[accountType] : STRINGS.welcomeBack;
  const rememberedEmail = useSessionStore((state) => state.rememberedEmail);
  const rememberMe = useSessionStore((state) => state.rememberMe);
  const setRememberMe = useSessionStore((state) => state.setRememberMe);

  const { control, handleSubmit } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: rememberedEmail ?? '',
      password: '',
      rememberMe: rememberMe ?? true,
    },
  });

  const onSubmit = (values: LoginValues) => {
    setRememberMe(values.rememberMe, values.email);
    login.mutate({ email: values.email.trim().toLowerCase(), password: values.password, accountType });
  };

  // Handle different error codes for account status
  const errorCode = login.error?.code;
  const isStaffPortal = accountType === 'staff';
  const showPendingMessage = errorCode === 'user_inactive';
  const showRejectedMessage = isStaffPortal && errorCode === 'user_not_approved';
  const showApprovedMessage = errorCode === 'user_not_verified';

  // Auto-navigate to OTP verification if account is approved but not verified
  // This would typically be handled by checking the error after login attempt
  // For now, we show the appropriate message

  return (
    <AuthScaffold hero={<HeroBanner />}>

      <AnimatedHeader
        onBack={() => {
          // Respect real navigation history first (e.g. Register -> Login
          // returns to Register). Only fall back to a fixed screen when
          // there's no history to pop -- e.g. Login is the Auth stack's
          // initial route after an explicit sign-out.
          if (navigation.canGoBack()) {
            navigation.goBack();
          } else {
            navigation.navigate(accountType ? 'RoleSelection' : 'Welcome');
          }
        }}
      />

      <View style={[styles.center, { marginTop: 24 }]}>
        <Logo />
      </View>

      <View style={{ height: spacing.xl }} />

      <ScreenHeading title={headingTitle} align="center" />

      <View style={{ height: spacing.xxl - 4 }} />

      <View style={styles.form}>
        <FormNotice error={login.error} />

        {showPendingMessage && (
          <FormNotice message={isStaffPortal ? STRINGS.staffAccountPending : STRINGS.accountPending} />
        )}

        {showRejectedMessage && (
          <FormNotice message={STRINGS.staffAccountRejected} />
        )}

        {showApprovedMessage && (
          <>
            <FormNotice message={STRINGS.accountApprovedOTP} />
            <PrimaryButton
              label="Enter OTP"
              onPress={() => {
                navigation.navigate('OTPVerification', { 
                  requestId: 'placeholder', 
                  isApproval: true 
                });
              }}
            />
          </>
        )}

        {showPendingMessage && (
          <PrimaryButton
            label="View Status"
            onPress={() =>
              navigation.navigate(isStaffPortal ? 'StaffApprovalPending' : 'ApprovalPending')
            }
          />
        )}

        {showRejectedMessage && (
          <PrimaryButton
            label="View Details"
            onPress={() => navigation.navigate('StaffRejected', { reason: login.error?.message })}
          />
        )}

        <FormTextBox
          control={control}
          name="email"
          label={STRINGS.email}
          icon="mail-outline"
          placeholder={STRINGS.emailPlaceholder}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType="next"
        />
        <FormPasswordField
          control={control}
          name="password"
          label={STRINGS.password}
          placeholder="Enter your password"
          textContentType="password"
          returnKeyType="done"
          onSubmitEditing={handleSubmit(onSubmit)}
        />

        <View style={styles.rowBetween}>
          <View style={styles.rememberSection}>
            <FormCheckbox control={control} name="rememberMe">
              {STRINGS.rememberMe}
            </FormCheckbox>
          </View>
          <View style={styles.forgotSection}>
            <TextLink label={STRINGS.forgotPassword} onPress={() => navigation.navigate('ForgotPassword')} />
          </View>
        </View>
      </View>

      <PrimaryButton
        label={login.isPending ? STRINGS.loggingIn : STRINGS.login}
        loading={login.isPending}
        onPress={handleSubmit(onSubmit)}
        showArrow
      />

      <View style={[styles.footerRow, { marginTop: spacing.xxl }]}>
        <Text style={[styles.footerText, { color: colors.textSecondary }]}>
          {isStaffPortal ? STRINGS.noStaffAccount : accountType === 'admin' ? STRINGS.noAdminAccount : STRINGS.noAccount}{' '}
        </Text>
        <TextLink label="Sign Up" onPress={() => navigation.navigate('Register', { accountType })} />
      </View>
    </AuthScaffold>
  );
};

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
  },
  form: {
    gap: 16,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    gap: 12,
    marginTop: 0,
    marginBottom: 24,
  },
  rememberSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
  },
  forgotSection: {
    flexShrink: 0,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerText: {
    fontSize: 14,
  },
  otpButton: {
    marginTop: 16,
  },
});
