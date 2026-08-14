import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAppTheme } from '../theme/useAppTheme';
import type { DriverStackParamList } from './types';
import { DriverDashboardScreen } from '../screens/driver/DriverDashboardScreen';
import { TodayDeliveriesScreen } from '../screens/driver/TodayDeliveriesScreen';
import { AssignedOrdersScreen } from '../screens/driver/AssignedOrdersScreen';
import { DriverOrderDetailsScreen } from '../screens/driver/DriverOrderDetailsScreen';
import { NavigationScreen } from '../screens/driver/NavigationScreen';
import { PickupScreen } from '../screens/driver/PickupScreen';
import { DropScreen } from '../screens/driver/DropScreen';
import { DeliveryProofScreen } from '../screens/driver/DeliveryProofScreen';
import { CompletedOrdersScreen } from '../screens/driver/CompletedOrdersScreen';
import { EarningsScreen } from '../screens/driver/EarningsScreen';
import { VehicleStatusScreen } from '../screens/driver/VehicleStatusScreen';
import { NotificationsScreen } from '../screens/common/NotificationsScreen';
import { ProfileScreen } from '../screens/common/ProfileScreen';
import { SettingsScreen } from '../screens/common/SettingsScreen';
import { ChangePasswordScreen } from '../screens/common/ChangePasswordScreen';
import { HelpSupportScreen } from '../screens/common/HelpSupportScreen';

const Stack = createNativeStackNavigator<DriverStackParamList>();

export const DriverStack = () => {
  const { colors } = useAppTheme();

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="DriverDashboard" component={DriverDashboardScreen} />
      <Stack.Screen name="TodayDeliveries" component={TodayDeliveriesScreen} />
      <Stack.Screen name="AssignedOrders" component={AssignedOrdersScreen} />
      <Stack.Screen name="OrderDetails" component={DriverOrderDetailsScreen} />
      <Stack.Screen name="Navigation" component={NavigationScreen} />
      <Stack.Screen name="Pickup" component={PickupScreen} />
      <Stack.Screen name="Drop" component={DropScreen} />
      <Stack.Screen name="DeliveryProof" component={DeliveryProofScreen} />
      <Stack.Screen name="CompletedOrders" component={CompletedOrdersScreen} />
      <Stack.Screen name="Earnings" component={EarningsScreen} />
      <Stack.Screen name="VehicleStatus" component={VehicleStatusScreen} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
      <Stack.Screen name="Profile" component={ProfileScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
      <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} />
      <Stack.Screen name="HelpSupport" component={HelpSupportScreen} />
    </Stack.Navigator>
  );
};