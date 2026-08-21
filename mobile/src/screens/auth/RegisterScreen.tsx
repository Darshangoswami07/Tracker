import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { StyleSheet, Text, View } from 'react-native';
import { AuthScaffold } from '../../components/AuthScaffold';
import { FormCheckbox } from '../../components/form/FormCheckbox';
import { FormPasswordField } from '../../components/form/FormPasswordField';
import { FormTextBox } from '../../components/form/FormTextBox';
import { FormNotice } from '../../components/FormNotice';
import { PrimaryButton } from '../../components/PrimaryButton';
import { Logo } from '../../components/Logo';
import { AnimatedHeader } from '../../components/AnimatedHeader';
import { ScreenHeading } from '../../components/ScreenHeading';
import { TextLink } from '../../components/TextLink';
import { useAuth } from '../../hooks/useAuth';
import { useRegistrationStore } from '../../store/registrationStore';
import { useAppTheme } from '../../theme/useAppTheme';
import { STRINGS } from '../../constants/strings';
import {
  registerSchemaFor,
  type RegisterAccountType,
  type RegisterValues,
} from '../../features/auth/schemas/authSchemas';
import type { RegisterPayload, RequestedRole } from '../../features/auth/types';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Register'>;

/** UI role selection mapped to the backend's requestedRole values. */
const ACCOUNT_TYPE_TO_ROLE: Record<'admin', RequestedRole> = {
  admin: 'admin',
};

const HEADING_FOR: Record<RegisterAccountType, string> = {
  admin: STRINGS.createAccount,
  staff: STRINGS.staffSignupTitle,
};

export const RegisterScreen = ({ navigation, route }: Props) => {
  const { colors, spacing } = useAppTheme();
  const { register, registerStaff } = useAuth();
  const saveRegistration = useRegistrationStore((state) => state.save);

  // The role is fixed by the role-selection screen; the form must never re-ask.
  const accountType: RegisterAccountType = route.params?.accountType ?? 'admin';
  const isStaff = accountType === 'staff';

  const { control, handleSubmit } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchemaFor(accountType)),
    defaultValues: {
      firstName: '',
      lastName: '',
      companyName: '',
      email: '',
      phone: '',
      password: '',
      confirmPassword: '',
      acceptTerms: false,
    },
  });

  const activeError = isStaff ? registerStaff.error : register.error;
  const submitting = isStaff ? registerStaff.isPending : register.isPending;

  const onSubmit = (values: RegisterValues) => {
    if (isStaff) {
      // Self-service Staff signup — no company, no OTP/email. PENDING until
      // an Admin approves it from the Staff Approvals screen.
      registerStaff.mutate(
        {
          fullName: `${values.firstName.trim()} ${values.lastName.trim()}`.trim(),
          email: values.email.trim().toLowerCase(),
          phone: values.phone.trim(),
          password: values.password,
        },
        {
          onSuccess: () => {
            navigation.replace('StaffApprovalPending');
          },
        }
      );
      return;
    }

    const role = ACCOUNT_TYPE_TO_ROLE.admin;
    const payload: RegisterPayload = {
      firstName: values.firstName.trim(),
      lastName: values.lastName.trim(),
      email: values.email.trim().toLowerCase(),
      phone: values.phone.trim(),
      password: values.password,
      requestedRole: role,
      companyName: values.companyName?.trim() || undefined,
    };
    register.mutate(payload, {
      onSuccess: (result) => {
        saveRegistration(result);
        // Immediately leave the register form and wait for admin approval.
        navigation.replace('RegistrationPending', { request: result });
      },
    });
  };

  return (
    <AuthScaffold>
      {/* No custom onBack: AnimatedHeader's default (goBack when there's
       * history) is correct here -- Register is always reached with a
       * real predecessor (Login or RoleSelection) already on the stack. */}
      <AnimatedHeader />

      <View style={[styles.center, { marginTop: spacing.xxl - 4 }]}>
        <Logo />
      </View>

      <View style={{ height: spacing.xl }} />

      <ScreenHeading title={HEADING_FOR[accountType]} align="center" />

      <View style={{ height: spacing.xxl - 4 }} />

      <View style={styles.form}>
        <FormNotice error={activeError} />

        <FormTextBox
          control={control}
          name="firstName"
          label={STRINGS.firstName}
          icon="person-outline"
          placeholder={STRINGS.firstNamePlaceholder}
          autoCapitalize="words"
          textContentType="givenName"
          returnKeyType="next"
        />
        <FormTextBox
          control={control}
          name="lastName"
          label={STRINGS.lastName}
          icon="person-outline"
          placeholder={STRINGS.lastNamePlaceholder}
          autoCapitalize="words"
          textContentType="familyName"
          returnKeyType="next"
        />
        {!isStaff && (
          <FormTextBox
            control={control}
            name="companyName"
            label={STRINGS.companyName}
            icon="business-outline"
            placeholder={STRINGS.companyNamePlaceholder}
            autoCapitalize="words"
            textContentType="organizationName"
            returnKeyType="next"
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
        <FormTextBox
          control={control}
          name="phone"
          label={STRINGS.phone}
          icon="call-outline"
          placeholder={STRINGS.phonePlaceholder}
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
          returnKeyType="next"
        />
        <FormPasswordField
          control={control}
          name="password"
          label={STRINGS.password}
          placeholder={STRINGS.passwordPlaceholder}
          textContentType="newPassword"
          returnKeyType="next"
        />
        <FormPasswordField
          control={control}
          name="confirmPassword"
          label={STRINGS.confirmPassword}
          placeholder={STRINGS.confirmPasswordPlaceholder}
          textContentType="newPassword"
          returnKeyType="done"
          onSubmitEditing={handleSubmit(onSubmit)}
        />

        <FormCheckbox control={control} name="acceptTerms">
          <Text style={styles.termsText}>
            {STRINGS.agreeTo}{' '}
            <Text style={{ color: colors.primary, fontWeight: '700' }}>{STRINGS.terms}</Text>
            {` ${STRINGS.andLabel} `}
            <Text style={{ color: colors.primary, fontWeight: '700' }}>{STRINGS.privacy}</Text>.
          </Text>
        </FormCheckbox>
      </View>

      <View style={{ height: spacing.md }} />

      <PrimaryButton
        label={submitting ? STRINGS.registering : STRINGS.register}
        loading={submitting}
        onPress={handleSubmit(onSubmit)}
        showArrow
      />

      <View style={[styles.footerRow, { marginTop: spacing.xl }]}>
        <Text style={[styles.footerText, { color: colors.textSecondary }]}>{STRINGS.haveAccount} </Text>
        <TextLink
          label={STRINGS.loginNow}
          onPress={() => navigation.navigate('Login', { accountType })}
        />
      </View>
    </AuthScaffold>
  );
};

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
  },
  form: {
    gap: 14,
  },
  termsText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '400',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerText: {
    fontSize: 14,
  },
});

export default RegisterScreen;