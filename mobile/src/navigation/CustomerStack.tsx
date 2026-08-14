import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAppTheme } from '../theme/useAppTheme';
import type { CustomerStackParamList } from './types';
import { CustomerDashboardScreen } from '../screens/customer/CustomerDashboardScreen';
import { CustomerTrackingScreen } from '../screens/customer/CustomerTrackingScreen';
import { CustomerCreateOrderScreen } from '../screens/customer/CustomerCreateOrderScreen';
import { MyOrdersScreen } from '../screens/customer/MyOrdersScreen';
import { CustomerOrderDetailsScreen } from '../screens/customer/CustomerOrderDetailsScreen';
import { LiveTrackingScreen } from '../screens/customer/LiveTrackingScreen';
import { AddressesScreen } from '../screens/customer/AddressesScreen';
import { PaymentMethodsScreen } from '../screens/customer/PaymentMethodsScreen';
import { NotificationsScreen } from '../screens/common/NotificationsScreen';
import { ProfileScreen } from '../screens/common/ProfileScreen';
import { SettingsScreen } from '../screens/common/SettingsScreen';
import { ChangePasswordScreen } from '../screens/common/ChangePasswordScreen';
import { HelpSupportScreen } from '../screens/common/HelpSupportScreen';

const Stack = createNativeStackNavigator<CustomerStackParamList>();

export const CustomerStack = () => {
  const { colors } = useAppTheme();

  return (
    <Stack.Navigator
      // Customers land on their dashboard. The remaining screens below stay
      // registered (reachable via drawer / in-app navigation) so this
      // doesn't delete working code.
      initialRouteName="CustomerDashboard"
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="CustomerDashboard" component={CustomerDashboardScreen} />
      <Stack.Screen name="CustomerTracking" component={CustomerTrackingScreen} />
      <Stack.Screen name="CreateOrder" component={CustomerCreateOrderScreen} />
      <Stack.Screen name="MyOrders" component={MyOrdersScreen} />
      <Stack.Screen name="OrderDetails" component={CustomerOrderDetailsScreen} />
      <Stack.Screen name="LiveTracking" component={LiveTrackingScreen} />
      <Stack.Screen name="Addresses" component={AddressesScreen} />
      <Stack.Screen name="PaymentMethods" component={PaymentMethodsScreen} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
      <Stack.Screen name="Profile" component={ProfileScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
      <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} />
      <Stack.Screen name="HelpSupport" component={HelpSupportScreen} />
    </Stack.Navigator>
  );
};