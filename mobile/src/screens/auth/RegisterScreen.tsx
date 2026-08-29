import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AREAS } from '../../constants/areas';
import { AuthScaffold } from '../../components/AuthScaffold';
import { FormCheckbox } from '../../components/form/FormCheckbox';
import { FormPasswordField } from '../../components/form/FormPasswordField';
import { FormTextBox } from '../../components/form/FormTextBox';
import { FormIndiaPhoneField, normalizeIndianPhone } from '../../components/form/FormIndiaPhoneField';
import { FormNotice } from '../../components/FormNotice';
import { PrimaryButton } from '../../components/PrimaryButton';
import { Logo } from '../../components/Logo';
import { AnimatedHeader } from '../../components/AnimatedHeader';
import { ScreenHeading } from '../../components/ScreenHeading';
import { TextLink } from '../../components/TextLink';
import { useAuth } from '../../hooks/useAuth';
import { useRegistrationStore } from '../../store/registrationStore';
import { useAppTheme } from '../../theme/useAppTheme';
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

export const RegisterScreen = ({ navigation, route }: Props) => {
  const { t } = useTranslation();
  const { colors, spacing, radii } = useAppTheme();
  const { register, registerStaff } = useAuth();
  const saveRegistration = useRegistrationStore((state) => state.save);

  // The role is fixed by the role-selection screen; the form must never re-ask.
  const accountType: RegisterAccountType = route.params?.accountType ?? 'admin';
  const isStaff = accountType === 'staff';
  const headingTitle = isStaff ? t('auth.staffSignupTitle') : t('auth.createAccount');

  const { control, handleSubmit } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchemaFor(accountType)),
    defaultValues: {
      firstName: '',
      lastName: '',
      companyName: '',
      area: '',
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
          phone: normalizeIndianPhone(values.phone),
          password: values.password,
          area: values.area?.trim() ?? '',
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
      phone: normalizeIndianPhone(values.phone),
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

      <ScreenHeading title={headingTitle} align="center" />

      <View style={{ height: spacing.xxl - 4 }} />

      <View style={styles.form}>
        <FormNotice error={activeError} />

        <FormTextBox
          control={control}
          name="firstName"
          label={t('auth.firstName')}
          icon="person-outline"
          placeholder={t('auth.firstNamePlaceholder')}
          autoCapitalize="words"
          textContentType="givenName"
          returnKeyType="next"
        />
        <FormTextBox
          control={control}
          name="lastName"
          label={t('auth.lastName')}
          icon="person-outline"
          placeholder={t('auth.lastNamePlaceholder')}
          autoCapitalize="words"
          textContentType="familyName"
          returnKeyType="next"
        />
        {!isStaff && (
          <FormTextBox
            control={control}
            name="companyName"
            label={t('auth.companyName')}
            icon="business-outline"
            placeholder={t('auth.companyNamePlaceholder')}
            autoCapitalize="words"
            textContentType="organizationName"
            returnKeyType="next"
          />
        )}
        {isStaff && (
          <View style={styles.areaField}>
            <Text style={[styles.areaLabel, { color: colors.textSecondary }]}>{t('auth.location', 'Location')}</Text>
            <Controller
              control={control}
              name="area"
              render={({ field: { onChange, value }, fieldState: { error } }) => (
                <>
                  <View style={styles.areaChipRow}>
                    {AREAS.map((area) => {
                      const selected = value === area;
                      return (
                        <TouchableOpacity
                          key={area}
                          style={[
                            styles.areaChip,
                            { borderRadius: radii.pill, borderColor: selected ? colors.primary : colors.border },
                            selected && { backgroundColor: colors.primary },
                          ]}
                          onPress={() => onChange(area)}
                          activeOpacity={0.85}
                        >
                          <Text style={[styles.areaChipText, { color: selected ? colors.onPrimary : colors.textPrimary }]}>
                            {area}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  {error && <Text style={[styles.areaError, { color: colors.error }]}>{error.message}</Text>}
                </>
              )}
            />
          </View>
        )}
        <FormTextBox
          control={control}
          name="email"
          label={t('auth.email')}
          icon="mail-outline"
          placeholder={t('auth.emailPlaceholder')}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType="next"
        />
        <FormIndiaPhoneField
          control={control}
          name="phone"
          label={t('auth.phone')}
          icon="call-outline"
          placeholder={t('auth.phonePlaceholder')}
          returnKeyType="next"
        />
        <FormPasswordField
          control={control}
          name="password"
          label={t('auth.password')}
          placeholder={t('auth.passwordPlaceholder')}
          textContentType="newPassword"
          returnKeyType="next"
        />
        <FormPasswordField
          control={control}
          name="confirmPassword"
          label={t('auth.confirmPassword')}
          placeholder={t('auth.confirmPasswordPlaceholder')}
          textContentType="newPassword"
          returnKeyType="done"
          onSubmitEditing={handleSubmit(onSubmit)}
        />

        <FormCheckbox control={control} name="acceptTerms">
          <Text style={styles.termsText}>
            {t('auth.agreeTo')}{' '}
            <Text style={{ color: colors.primary, fontWeight: '700' }}>{t('auth.terms')}</Text>
            {` ${t('auth.andLabel')} `}
            <Text style={{ color: colors.primary, fontWeight: '700' }}>{t('auth.privacy')}</Text>.
          </Text>
        </FormCheckbox>
      </View>

      <View style={{ height: spacing.md }} />

      <PrimaryButton
        label={submitting ? t('auth.registering') : t('auth.register')}
        loading={submitting}
        onPress={handleSubmit(onSubmit)}
        showArrow
      />

      <View style={[styles.footerRow, { marginTop: spacing.xl }]}>
        <Text style={[styles.footerText, { color: colors.textSecondary }]}>{t('auth.haveAccount')} </Text>
        <TextLink
          label={t('auth.loginNow')}
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
  areaField: {
    gap: 8,
  },
  areaLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  areaChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  areaChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
  },
  areaChipText: {
    fontSize: 13,
    fontWeight: '700',
  },
  areaError: {
    fontSize: 12,
    fontWeight: '600',
  },
});

export default RegisterScreen;