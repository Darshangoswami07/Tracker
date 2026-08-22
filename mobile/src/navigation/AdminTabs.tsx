import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../theme/useAppTheme';
import type {
  AdminTabParamList,
  DashboardStackParamList,
  ShipmentsStackParamList,
  TrackingStackParamList,
  GRTrackerStackParamList,
  MoreStackParamList,
} from './types';

import { AdminDashboardScreen } from '../screens/admin/AdminDashboardScreen';
import { PendingApprovalsScreen } from '../screens/admin/PendingApprovalsScreen';
import { StaffManagementScreen } from '../screens/admin/StaffManagementScreen';
import { StaffApprovalsScreen } from '../screens/admin/StaffApprovalsScreen';
import { AllStaffScreen } from '../screens/admin/AllStaffScreen';
import { AdminAnalyticsScreen } from '../screens/admin/AdminAnalyticsScreen';
import { AuditLogsScreen } from '../screens/admin/AuditLogsScreen';
import { SystemHealthScreen } from '../screens/admin/SystemHealthScreen';

import { AdminGRShipmentsScreen } from '../screens/admin/AdminGRShipmentsScreen';
import { AdminCreateGRScreen } from '../screens/admin/AdminCreateGRScreen';
import { AdminGRDetailsScreen } from '../screens/admin/AdminGRDetailsScreen';
import { AdminEditGRScreen } from '../screens/admin/AdminEditGRScreen';
import { AdminExcelImportScreen } from '../screens/admin/AdminExcelImportScreen';
import { ExcelImportHistoryScreen } from '../screens/admin/ExcelImportHistoryScreen';

// Customer Tracking and GR Tracker (Classic) reuse the exact same components
// already used by the Customer/Employee stacks for these roles — the GR
// lookup endpoint and the `/employee/orders` staff-panel endpoint are
// role-agnostic server-side (any GR-access role), so there's no separate
// "admin version" of this business logic to build.
import { CustomerTrackingScreen } from '../screens/customer/CustomerTrackingScreen';
import { StaffGRPanelScreen } from '../screens/employee/StaffGRPanelScreen';

import { MoreScreen } from '../screens/common/MoreScreen';
import { NotificationsScreen } from '../screens/common/NotificationsScreen';
import { ProfileScreen } from '../screens/common/ProfileScreen';
import { EditProfileScreen } from '../screens/common/EditProfileScreen';
import { SettingsScreen } from '../screens/common/SettingsScreen';
import { ChangePasswordScreen } from '../screens/common/ChangePasswordScreen';
import { HelpSupportScreen } from '../screens/common/HelpSupportScreen';
import { AboutScreen } from '../screens/common/AboutScreen';
import { UserManagementScreen } from '../screens/admin/UserManagementScreen';
import { DriverManagementScreen } from '../screens/admin/DriverManagementScreen';
import { VehicleManagementScreen } from '../screens/admin/VehicleManagementScreen';
import { OrderManagementScreen } from '../screens/admin/OrderManagementScreen';
import { OrderDetailsScreen } from '../screens/business/OrderDetailsScreen';

const Tab = createBottomTabNavigator<AdminTabParamList>();
const DashboardStack = createNativeStackNavigator<DashboardStackParamList>();
const ShipmentsStack = createNativeStackNavigator<ShipmentsStackParamList>();
const TrackingStack = createNativeStackNavigator<TrackingStackParamList>();
const GRTrackerStack = createNativeStackNavigator<GRTrackerStackParamList>();
const MoreStack = createNativeStackNavigator<MoreStackParamList>();

const useStackScreenOptions = () => {
  const { colors } = useAppTheme();
  return {
    headerShown: false,
    animation: 'slide_from_right' as const,
    contentStyle: { backgroundColor: colors.background },
  };
};

const DashboardTabStack = () => (
  <DashboardStack.Navigator screenOptions={useStackScreenOptions()}>
    <DashboardStack.Screen name="AdminDashboard" component={AdminDashboardScreen} />
    <DashboardStack.Screen name="PendingApprovals" component={PendingApprovalsScreen} />
    <DashboardStack.Screen name="StaffManagement" component={StaffManagementScreen} />
    <DashboardStack.Screen name="StaffApprovals" component={StaffApprovalsScreen} />
    <DashboardStack.Screen name="AllStaff" component={AllStaffScreen} />
    <DashboardStack.Screen name="Analytics" component={AdminAnalyticsScreen} />
    <DashboardStack.Screen name="AuditLogs" component={AuditLogsScreen} />
    <DashboardStack.Screen name="SystemHealth" component={SystemHealthScreen} />
    {/* Also registered here (in addition to ShipmentsTabStack below) so the
     * Dashboard quick action pushes Create GR onto THIS stack — normal
     * goBack() then returns to AdminDashboard, the screen the user actually
     * came from, instead of jumping into the Shipments tab. See useAppNav.ts. */}
    <DashboardStack.Screen name="CreateGR" component={AdminCreateGRScreen} />
    <DashboardStack.Screen name="ExcelImport" component={AdminExcelImportScreen} />
    <DashboardStack.Screen name="ExcelImportHistory" component={ExcelImportHistoryScreen} />
  </DashboardStack.Navigator>
);

const ShipmentsTabStack = () => (
  <ShipmentsStack.Navigator screenOptions={useStackScreenOptions()}>
    <ShipmentsStack.Screen name="GRShipments" component={AdminGRShipmentsScreen} />
    <ShipmentsStack.Screen name="CreateGR" component={AdminCreateGRScreen} />
    <ShipmentsStack.Screen name="GRDetails" component={AdminGRDetailsScreen} />
    <ShipmentsStack.Screen name="EditGR" component={AdminEditGRScreen} />
    <ShipmentsStack.Screen name="ExcelImport" component={AdminExcelImportScreen} />
    <ShipmentsStack.Screen name="ExcelImportHistory" component={ExcelImportHistoryScreen} />
  </ShipmentsStack.Navigator>
);

const TrackingTabStack = () => (
  <TrackingStack.Navigator screenOptions={useStackScreenOptions()}>
    <TrackingStack.Screen name="CustomerTracking" component={CustomerTrackingScreen} />
  </TrackingStack.Navigator>
);

const GRTrackerTabStack = () => (
  <GRTrackerStack.Navigator screenOptions={useStackScreenOptions()}>
    <GRTrackerStack.Screen name="GRTrackerClassic" component={StaffGRPanelScreen} />
  </GRTrackerStack.Navigator>
);

const MoreTabStack = () => (
  <MoreStack.Navigator screenOptions={useStackScreenOptions()}>
    <MoreStack.Screen name="More" component={MoreScreen} />
    <MoreStack.Screen name="Notifications" component={NotificationsScreen} />
    <MoreStack.Screen name="Profile" component={ProfileScreen} />
    <MoreStack.Screen name="EditProfile" component={EditProfileScreen} />
    <MoreStack.Screen name="Settings" component={SettingsScreen} />
    <MoreStack.Screen name="ChangePassword" component={ChangePasswordScreen} />
    <MoreStack.Screen name="HelpSupport" component={HelpSupportScreen} />
    <MoreStack.Screen name="About" component={AboutScreen} />
    <MoreStack.Screen name="UserManagement" component={UserManagementScreen} />
    <MoreStack.Screen name="DriverManagement" component={DriverManagementScreen} />
    <MoreStack.Screen name="VehicleManagement" component={VehicleManagementScreen} />
    <MoreStack.Screen name="OrderManagement" component={OrderManagementScreen} />
    <MoreStack.Screen name="OrderDetails" component={OrderDetailsScreen} />
  </MoreStack.Navigator>
);

const TAB_ICONS: Record<keyof AdminTabParamList, { active: keyof typeof Ionicons.glyphMap; inactive: keyof typeof Ionicons.glyphMap }> = {
  Dashboard: { active: 'grid', inactive: 'grid-outline' },
  Shipments: { active: 'reader', inactive: 'reader-outline' },
  Tracking: { active: 'search', inactive: 'search-outline' },
  GRTracker: { active: 'time', inactive: 'time-outline' },
  More: { active: 'ellipsis-horizontal-circle', inactive: 'ellipsis-horizontal-outline' },
};

const TAB_LABELS: Record<keyof AdminTabParamList, string> = {
  Dashboard: 'Dashboard',
  Shipments: 'Shipments',
  Tracking: 'Tracking',
  GRTracker: 'GR Tracker',
  More: 'More',
};

/**
 * Primary mobile navigation shell for admin/super_admin roles: five
 * thumb-reachable bottom tabs, each wrapping its own small native-stack so
 * push navigation (details, create/edit) stays within the tab it belongs to.
 */
export const AdminTabs = () => {
  const { colors, fonts } = useAppTheme();
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 60 + insets.bottom,
          paddingBottom: Math.max(insets.bottom, 8),
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: fonts.size.xxs, fontWeight: '700' },
        tabBarIcon: ({ focused, color, size }) => (
          <Ionicons
            name={focused ? TAB_ICONS[route.name].active : TAB_ICONS[route.name].inactive}
            color={color}
            size={size}
          />
        ),
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardTabStack} options={{ tabBarLabel: TAB_LABELS.Dashboard }} />
      <Tab.Screen name="Shipments" component={ShipmentsTabStack} options={{ tabBarLabel: TAB_LABELS.Shipments }} />
      <Tab.Screen name="Tracking" component={TrackingTabStack} options={{ tabBarLabel: TAB_LABELS.Tracking }} />
      <Tab.Screen name="GRTracker" component={GRTrackerTabStack} options={{ tabBarLabel: TAB_LABELS.GRTracker }} />
      <Tab.Screen name="More" component={MoreTabStack} options={{ tabBarLabel: TAB_LABELS.More }} />
    </Tab.Navigator>
  );
};

export default AdminTabs;
