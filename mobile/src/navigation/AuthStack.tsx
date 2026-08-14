import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuthStore } from '../store/authStore';
import { useRegistrationStore } from '../store/registrationStore';
import { useAppTheme } from '../theme/useAppTheme';
import { ApprovalPendingScreen } from '../screens/auth/ApprovalPendingScreen';
import { ForgotPasswordScreen } from '../screens/auth/ForgotPasswordScreen';
import { LoginScreen } from '../screens/auth/LoginScreen';
import { OTPVerificationScreen } from '../screens/auth/OTPVerificationScreen';
import { RegisterScreen } from '../screens/auth/RegisterScreen';
import { RegistrationPendingScreen } from '../screens/auth/RegistrationPendingScreen';
import { RegistrationRejectedScreen } from '../screens/auth/RegistrationRejectedScreen';
import { RegistrationSuccessScreen } from '../screens/auth/RegistrationSuccessScreen';
import { ResetPasswordScreen } from '../screens/auth/ResetPasswordScreen';
import { TermsScreen } from '../screens/auth/TermsScreen';
import { PrivacyScreen } from '../screens/auth/PrivacyScreen';
import { WelcomeScreen } from '../screens/auth/WelcomeScreen';
import type { AuthStackParamList } from './types';

const Stack = createNativeStackNavigator<AuthStackParamList>();

/** Navigation stack shown while the user is unauthenticated. */
export const AuthStack = () => {
  const { colors, fonts } = useAppTheme();
  const resumePending = useRegistrationStore((state) => state.hydrated && state.isInFlight());
  const authLaunchRoute = useAuthStore((state) => state.authLaunchRoute);

  const initialRouteName: keyof AuthStackParamList = resumePending ? 'RegistrationPending' : authLaunchRoute;

  return (
    <Stack.Navigator
      initialRouteName={initialRouteName}
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: colors.background },
        headerTitleStyle: { fontFamily: fonts.family },
      }}
    >
      <Stack.Screen name="Welcome" component={WelcomeScreen} />
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
      <Stack.Screen name="Terms" component={TermsScreen} />
      <Stack.Screen name="Privacy" component={PrivacyScreen} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
      <Stack.Screen name="OTPVerification" component={OTPVerificationScreen} />
      <Stack.Screen name="ApprovalPending" component={ApprovalPendingScreen} />
      <Stack.Screen name="RegistrationPending" component={RegistrationPendingScreen} />
      <Stack.Screen name="RegistrationRejected" component={RegistrationRejectedScreen} />
      <Stack.Screen name="RegistrationSuccess" component={RegistrationSuccessScreen} />
      <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
    </Stack.Navigator>
  );
};