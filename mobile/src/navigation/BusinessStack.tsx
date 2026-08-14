import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAppTheme } from '../theme/useAppTheme';
import { useColorScheme } from 'react-native';
import type { BusinessStackParamList } from './types';

const Stack = createNativeStackNavigator<BusinessStackParamList>();

export const BusinessStack = () => {
  const { colors } = useAppTheme();
  const colorScheme = useColorScheme();

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="BusinessDashboard" component={BusinessDashboardScreen} />
      <Stack.Screen name="Orders" component={OrdersScreen} />
      <Stack.Screen name="OrderDetails" component={OrderDetailsScreen} />
      <Stack.Screen name="CreateOrder" component={CreateOrderScreen} />
      <Stack.Screen name="AssignDriver" component={AssignDriverScreen} />
      <Stack.Screen name="AssignVehicle" component={AssignVehicleScreen} />
      <Stack.Screen name="Analytics" component={BusinessAnalyticsScreen} />
      <Stack.Screen name="Drivers" component={DriversScreen} />
      <Stack.Screen name="DriverDetails" component={DriverDetailsScreen} />
      <Stack.Screen name="Vehicles" component={VehiclesScreen} />
      <Stack.Screen name="VehicleDetails" component={VehicleDetailsScreen} />
      <Stack.Screen name="Customers" component={CustomersScreen} />
      <Stack.Screen name="CustomerDetails" component={CustomerDetailsScreen} />
      <Stack.Screen name="Reports" component={BusinessReportsScreen} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
      <Stack.Screen name="Profile" component={ProfileScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
      <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} />
      <Stack.Screen name="HelpSupport" component={HelpSupportScreen} />
    </Stack.Navigator>
  );
};

import { BusinessDashboardScreen } from '../screens/business/BusinessDashboardScreen';
import { OrdersScreen } from '../screens/business/OrdersScreen';
import { OrderDetailsScreen } from '../screens/business/OrderDetailsScreen';
import { CreateOrderScreen } from '../screens/business/CreateOrderScreen';
import AssignDriverScreen from '../screens/business/AssignDriverScreen';
import AssignVehicleScreen from '../screens/business/AssignVehicleScreen';
import { BusinessAnalyticsScreen } from '../screens/business/BusinessAnalyticsScreen';
import { DriversScreen } from '../screens/business/DriversScreen';
import { DriverDetailsScreen } from '../screens/business/DriverDetailsScreen';
import { VehiclesScreen } from '../screens/business/VehiclesScreen';
import { VehicleDetailsScreen } from '../screens/business/VehicleDetailsScreen';
import { CustomersScreen } from '../screens/business/CustomersScreen';
import { CustomerDetailsScreen } from '../screens/business/CustomerDetailsScreen';
import { BusinessReportsScreen } from '../screens/business/BusinessReportsScreen';
import { NotificationsScreen } from '../screens/common/NotificationsScreen';
import { ProfileScreen } from '../screens/common/ProfileScreen';
import { SettingsScreen } from '../screens/common/SettingsScreen';
import { ChangePasswordScreen } from '../screens/common/ChangePasswordScreen';
import { HelpSupportScreen } from '../screens/common/HelpSupportScreen';