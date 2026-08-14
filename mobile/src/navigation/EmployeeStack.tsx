import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAppTheme } from '../theme/useAppTheme';
import type { EmployeeStackParamList } from './types';
import { EmployeeDashboardScreen } from '../screens/employee/EmployeeDashboardScreen';
import { StaffGRPanelScreen } from '../screens/employee/StaffGRPanelScreen';
import { OrdersScreen } from '../screens/business/OrdersScreen';
import { OrderDetailsScreen } from '../screens/business/OrderDetailsScreen';
import { DriversScreen } from '../screens/business/DriversScreen';
import { VehiclesScreen } from '../screens/business/VehiclesScreen';
import { CustomersScreen } from '../screens/business/CustomersScreen';
import { DriverDetailsScreen } from '../screens/business/DriverDetailsScreen';
import { VehicleDetailsScreen } from '../screens/business/VehicleDetailsScreen';
import { CustomerDetailsScreen } from '../screens/business/CustomerDetailsScreen';
import { EmployeeReportsScreen } from '../screens/employee/EmployeeReportsScreen';
import { CustomerTrackingScreen } from '../screens/customer/CustomerTrackingScreen';
import { NotificationsScreen } from '../screens/common/NotificationsScreen';
import { ProfileScreen } from '../screens/common/ProfileScreen';
import { SettingsScreen } from '../screens/common/SettingsScreen';
import { ChangePasswordScreen } from '../screens/common/ChangePasswordScreen';
import { HelpSupportScreen } from '../screens/common/HelpSupportScreen';

const Stack = createNativeStackNavigator<EmployeeStackParamList>();

export const EmployeeStack = () => {
  const { colors } = useAppTheme();

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="EmployeeDashboard" component={EmployeeDashboardScreen} />
      <Stack.Screen name="StaffGRPanel" component={StaffGRPanelScreen} />
      <Stack.Screen name="CustomerTracking" component={CustomerTrackingScreen} />
      <Stack.Screen name="Orders" component={OrdersScreen} />
      <Stack.Screen name="OrderDetails" component={OrderDetailsScreen} />
      <Stack.Screen name="Drivers" component={DriversScreen} />
      <Stack.Screen name="DriverDetails" component={DriverDetailsScreen} />
      <Stack.Screen name="Vehicles" component={VehiclesScreen} />
      <Stack.Screen name="VehicleDetails" component={VehicleDetailsScreen} />
      <Stack.Screen name="Customers" component={CustomersScreen} />
      <Stack.Screen name="CustomerDetails" component={CustomerDetailsScreen} />
      <Stack.Screen name="Reports" component={EmployeeReportsScreen} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
      <Stack.Screen name="Profile" component={ProfileScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
      <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} />
      <Stack.Screen name="HelpSupport" component={HelpSupportScreen} />
    </Stack.Navigator>
  );
};