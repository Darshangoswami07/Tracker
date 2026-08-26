import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { AuthScaffold } from '../../components/AuthScaffold';
import { FormTextBox } from '../../components/form/FormTextBox';
import { FormNotice } from '../../components/FormNotice';
import { PrimaryButton } from '../../components/PrimaryButton';
import { Logo } from '../../components/Logo';
import { AnimatedHeader } from '../../components/AnimatedHeader';
import { ScreenHeading } from '../../components/ScreenHeading';
import {
  forgotPasswordSchema,
  type ForgotPasswordValues,
} from '../../features/auth/schemas/authSchemas';
import { useAuth } from '../../hooks/useAuth';
import { useAppTheme } from '../../theme/useAppTheme';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../../navigation/types';
import { useEffect } from 'react';

type Props = NativeStackScreenProps<AuthStackParamList, 'ForgotPassword'>;

export const ForgotPasswordScreen = ({ navigation }: Props) => {
  const { t } = useTranslation();
  const { spacing } = useAppTheme();
  const requestOTP = useAuth().forgotPasswordOTP;

  const { control, handleSubmit } = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  const isSent = requestOTP.isSuccess;

  const onSubmit = (values: ForgotPasswordValues) => {
    requestOTP.mutate({ email: values.email.trim().toLowerCase() });
  };

  useEffect(() => {
    if (isSent) {
      navigation.navigate('OTPVerification', { 
        requestId: 'placeholder', 
        isPasswordReset: true 
      });
    }
  }, [isSent, navigation]);

  return (
    <AuthScaffold>
      <Animated.View entering={FadeIn.duration(350)}>
        <AnimatedHeader onBack={() => navigation.goBack()} />
      </Animated.View>

      <Animated.View entering={FadeInUp.duration(450).delay(60)} style={styles.logoRow}>
        <Logo size="sm" />
      </Animated.View>

      <View style={{ height: spacing.xxl }} />

      <ScreenHeading title={t('auth.resetPassword')} subtitle={t('auth.forgotSubtitle')} />

      <View style={{ height: spacing.xl * 2 }} />

      {isSent ? (
        <View style={styles.form}>
          <FormNotice message={t('auth.resetLinkSentTitle')} />
          <PrimaryButton
            label="Back to Sign In"
            onPress={() => navigation.goBack()}
            showArrow
          />
        </View>
      ) : (
        <View style={styles.form}>
          <FormNotice error={requestOTP.error} />
          <FormTextBox
            control={control}
            name="email"
            label={t('auth.email')}
            icon="mail-outline"
            placeholder="you@company.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            textContentType="emailAddress"
            returnKeyType="done"
            onSubmitEditing={handleSubmit(onSubmit)}
          />
          <PrimaryButton
            label={requestOTP.isPending ? t('auth.sendingReset') : t('auth.sendResetLink')}
            onPress={handleSubmit(onSubmit)}
            loading={requestOTP.isPending}
          />
        </View>
      )}
    </AuthScaffold>
  );
};

const styles = StyleSheet.create({
  logoRow: {
    alignItems: 'center',
  },
  form: {
    gap: 16,
  },
});

export default ForgotPasswordScreen;