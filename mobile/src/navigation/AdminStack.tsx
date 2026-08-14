import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAppTheme } from '../theme/useAppTheme';
import type { AdminStackParamList } from './types';

const Stack = createNativeStackNavigator<AdminStackParamList>();

export const AdminStack = () => {
  const { colors } = useAppTheme();

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="AdminDashboard" component={AdminDashboardScreen} />
      <Stack.Screen name="UserManagement" component={UserManagementScreen} />
      <Stack.Screen name="DriverManagement" component={DriverManagementScreen} />
      <Stack.Screen name="VehicleManagement" component={VehicleManagementScreen} />
      <Stack.Screen name="OrderManagement" component={OrderManagementScreen} />
      <Stack.Screen name="GRShipments" component={AdminGRShipmentsScreen} />
      <Stack.Screen name="CreateGR" component={AdminCreateGRScreen} />
      <Stack.Screen name="GRDetails" component={AdminGRDetailsScreen} />
      <Stack.Screen name="EditGR" component={AdminEditGRScreen} />
      <Stack.Screen name="CustomerTracking" component={CustomerTrackingScreen} />
      <Stack.Screen name="GRTrackerClassic" component={StaffGRPanelScreen} />
      <Stack.Screen name="OrderDetails" component={OrderDetailsScreen} />
      <Stack.Screen name="Analytics" component={AdminAnalyticsScreen} />
      <Stack.Screen name="AuditLogs" component={AuditLogsScreen} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
      <Stack.Screen name="SystemHealth" component={SystemHealthScreen} />
      <Stack.Screen name="PendingApprovals" component={PendingApprovalsScreen} />
      <Stack.Screen name="StaffManagement" component={StaffManagementScreen} />
      <Stack.Screen name="Profile" component={ProfileScreen} />
      <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} />
      <Stack.Screen name="HelpSupport" component={HelpSupportScreen} />
    </Stack.Navigator>
  );
};

import { AdminDashboardScreen } from '../screens/admin/AdminDashboardScreen';
import { UserManagementScreen } from '../screens/admin/UserManagementScreen';
import { DriverManagementScreen } from '../screens/admin/DriverManagementScreen';
import { VehicleManagementScreen } from '../screens/admin/VehicleManagementScreen';
import { OrderManagementScreen } from '../screens/admin/OrderManagementScreen';
import { AdminGRShipmentsScreen } from '../screens/admin/AdminGRShipmentsScreen';
import { AdminCreateGRScreen } from '../screens/admin/AdminCreateGRScreen';
import { AdminGRDetailsScreen } from '../screens/admin/AdminGRDetailsScreen';
import { AdminEditGRScreen } from '../screens/admin/AdminEditGRScreen';
// Customer Tracking and GR Tracker (Classic) reuse the exact same
// components already used by the Employee stack for these roles — the GR
// lookup endpoint and the `/employee/orders` staff-panel endpoint are
// role-agnostic server-side (any GR-access role), so there's no separate
// "admin version" of this business logic to build.
import { CustomerTrackingScreen } from '../screens/customer/CustomerTrackingScreen';
import { StaffGRPanelScreen } from '../screens/employee/StaffGRPanelScreen';
import { OrderDetailsScreen } from '../screens/business/OrderDetailsScreen';
import { AdminAnalyticsScreen } from '../screens/admin/AdminAnalyticsScreen';
import { AuditLogsScreen } from '../screens/admin/AuditLogsScreen';
import { NotificationsScreen } from '../screens/common/NotificationsScreen';
import { SettingsScreen } from '../screens/common/SettingsScreen';
import { SystemHealthScreen } from '../screens/admin/SystemHealthScreen';
import { PendingApprovalsScreen } from '../screens/admin/PendingApprovalsScreen';
import { StaffManagementScreen } from '../screens/admin/StaffManagementScreen';
import { ProfileScreen } from '../screens/common/ProfileScreen';
import { ChangePasswordScreen } from '../screens/common/ChangePasswordScreen';
import { HelpSupportScreen } from '../screens/common/HelpSupportScreen';