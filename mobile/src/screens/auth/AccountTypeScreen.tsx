import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { AnimatedHeader } from '../../components/AnimatedHeader';
import { AuthScaffold } from '../../components/AuthScaffold';
import { FeatureCard } from '../../components/FeatureCard';
import { Logo } from '../../components/Logo';
import { ScreenHeading } from '../../components/ScreenHeading';
import { useAppTheme } from '../../theme/useAppTheme';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'AccountType'>;

/**
 * "Choose how you want to use DeliveryHub" — shown after both Get Started
 * (register) and Sign In (login) on the Welcome screen, per the target
 * workflow. Selecting a card only decides *which existing screen* to open;
 * the account's actual role always comes from the backend after
 * authentication, never from this selection.
 */
export const AccountTypeScreen = ({ navigation, route }: Props) => {
  const { spacing } = useAppTheme();
  const { width } = useWindowDimensions();
  const cardWidth = Math.min(width, 480) - 48;
  const mode = route.params.mode;
  const isLogin = mode === 'login';

  const goToCustomer = () => {
    if (isLogin) {
      navigation.navigate('Login', { accountType: 'customer' });
    } else {
      navigation.navigate('Register', { accountType: 'customer' });
    }
  };

  const goToDriverStaff = () => {
    if (isLogin) {
      navigation.navigate('Login', { accountType: 'staff' });
    } else {
      navigation.navigate('Register', { accountType: 'staff' });
    }
  };

  const goToAdmin = () => {
    if (isLogin) {
      navigation.navigate('Login', { accountType: 'admin' });
    } else {
      navigation.navigate('Register', { accountType: 'admin' });
    }
  };

  return (
    <AuthScaffold>
      <AnimatedHeader onBack={() => navigation.goBack()} />

      <View style={styles.center}>
        <Logo />
      </View>

      <View style={{ height: spacing.xl }} />

      <ScreenHeading title="Choose how you want to use DeliveryHub" align="center" />

      <View style={{ height: spacing.xxl }} />

      <View style={styles.cards}>
        <FeatureCard
          icon="person-outline"
          title="Customer / User"
          description="Track deliveries, orders and shipments"
          color="#3B82F6"
          width={cardWidth}
          onPress={goToCustomer}
        />
        <FeatureCard
          icon="people-outline"
          title="Driver / Staff"
          description="Manage deliveries, assignments and fleet"
          color="#06B6D4"
          width={cardWidth}
          onPress={goToDriverStaff}
        />
        <FeatureCard
          icon="shield-checkmark-outline"
          title="Admin"
          description="Administration access"
          color="#F97316"
          width={cardWidth}
          onPress={goToAdmin}
        />
      </View>
    </AuthScaffold>
  );
};

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
  },
  cards: {
    gap: 14,
  },
});

export default AccountTypeScreen;
