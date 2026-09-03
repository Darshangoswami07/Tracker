import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useAppTheme } from '../theme/useAppTheme';
import type {
  AdminTabParamList,
  DashboardStackParamList,
  ShipmentsStackParamList,
  ReceivingDetailsStackParamList,
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
import { AdminAreasScreen } from '../screens/admin/AdminAreasScreen';
import { AdminSelectStaffScreen } from '../screens/admin/AdminSelectStaffScreen';
import { AdminExcelImportScreen } from '../screens/admin/AdminExcelImportScreen';
import { ExcelImportHistoryScreen } from '../screens/admin/ExcelImportHistoryScreen';
import { PaymentHistoryScreen } from '../screens/admin/PaymentHistoryScreen';
import { AdminAllShopsScreen } from '../screens/admin/AdminAllShopsScreen';
import { AdminAreaShopsScreen } from '../screens/admin/AdminAreaShopsScreen';
import { AdminShopHistoryScreen } from '../screens/admin/AdminShopHistoryScreen';
import { AdminStaffDailyWorkScreen } from '../screens/admin/AdminStaffDailyWorkScreen';

// Customer Tracking and GR Tracker (Classic) reuse the exact same components
// already used by the Customer/Employee stacks for these roles — the GR
// lookup endpoint and the `/employee/orders` staff-panel endpoint are
// role-agnostic server-side (any GR-access role), so there's no separate
// "admin version" of this business logic to build.
import { ReceivingDetailsScreen } from '../screens/admin/ReceivingDetailsScreen';
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
import { CustomerTrackingScreen } from '../screens/customer/CustomerTrackingScreen';

const Tab = createBottomTabNavigator<AdminTabParamList>();
const DashboardStack = createNativeStackNavigator<DashboardStackParamList>();
const ShipmentsStack = createNativeStackNavigator<ShipmentsStackParamList>();
const ReceivingDetailsStack = createNativeStackNavigator<ReceivingDetailsStackParamList>();
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
    <DashboardStack.Screen name="Areas" component={AdminAreasScreen} />
    <DashboardStack.Screen name="SelectStaff" component={AdminSelectStaffScreen} />
    <DashboardStack.Screen name="ExcelImport" component={AdminExcelImportScreen} />
    <DashboardStack.Screen name="ExcelImportHistory" component={ExcelImportHistoryScreen} />
    <DashboardStack.Screen name="PaymentHistory" component={PaymentHistoryScreen} />
    <DashboardStack.Screen name="StaffDailyWork" component={AdminStaffDailyWorkScreen} />
    <DashboardStack.Screen name="AllShops" component={AdminAllShopsScreen} />
    <DashboardStack.Screen name="AreaShops" component={AdminAreaShopsScreen} />
    <DashboardStack.Screen name="ShopHistory" component={AdminShopHistoryScreen} />
  </DashboardStack.Navigator>
);

const ShipmentsTabStack = () => (
  <ShipmentsStack.Navigator screenOptions={useStackScreenOptions()}>
    <ShipmentsStack.Screen name="GRShipments" component={AdminGRShipmentsScreen} />
    <ShipmentsStack.Screen name="CreateGR" component={AdminCreateGRScreen} />
    <ShipmentsStack.Screen name="GRDetails" component={AdminGRDetailsScreen} />
    <ShipmentsStack.Screen name="EditGR" component={AdminEditGRScreen} />
    <ShipmentsStack.Screen name="Areas" component={AdminAreasScreen} />
    <ShipmentsStack.Screen name="SelectStaff" component={AdminSelectStaffScreen} />
    <ShipmentsStack.Screen name="ExcelImport" component={AdminExcelImportScreen} />
    <ShipmentsStack.Screen name="ExcelImportHistory" component={ExcelImportHistoryScreen} />
    <ShipmentsStack.Screen name="PaymentHistory" component={PaymentHistoryScreen} />
    <ShipmentsStack.Screen name="StaffDailyWork" component={AdminStaffDailyWorkScreen} />
    <ShipmentsStack.Screen name="AllShops" component={AdminAllShopsScreen} />
    <ShipmentsStack.Screen name="AreaShops" component={AdminAreaShopsScreen} />
    <ShipmentsStack.Screen name="ShopHistory" component={AdminShopHistoryScreen} />
  </ShipmentsStack.Navigator>
);

const ReceivingDetailsTabStack = () => (
  <ReceivingDetailsStack.Navigator screenOptions={useStackScreenOptions()}>
    <ReceivingDetailsStack.Screen name="ReceivingDetailsHome" component={ReceivingDetailsScreen} />
  </ReceivingDetailsStack.Navigator>
);

const GRTrackerTabStack = () => (
  <GRTrackerStack.Navigator screenOptions={useStackScreenOptions()}>
    <GRTrackerStack.Screen name="GRTrackerClassic" component={StaffGRPanelScreen} />
  </GRTrackerStack.Navigator>
);

const MoreTabStack = () => (
  <MoreStack.Navigator screenOptions={useStackScreenOptions()}>
    <MoreStack.Screen name="MoreHome" component={MoreScreen} />
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
    <MoreStack.Screen name="CustomerTracking" component={CustomerTrackingScreen} />
  </MoreStack.Navigator>
);

const TAB_ICONS: Record<keyof AdminTabParamList, { active: keyof typeof Ionicons.glyphMap; inactive: keyof typeof Ionicons.glyphMap }> = {
  Dashboard: { active: 'grid', inactive: 'grid-outline' },
  Shipments: { active: 'reader', inactive: 'reader-outline' },
  ReceivingDetails: { active: 'wallet', inactive: 'wallet-outline' },
  GRTracker: { active: 'time', inactive: 'time-outline' },
  More: { active: 'ellipsis-horizontal-circle', inactive: 'ellipsis-horizontal-outline' },
};

const TAB_LABEL_KEYS: Record<keyof AdminTabParamList, string> = {
  Dashboard: 'navigation.dashboard',
  Shipments: 'navigation.grShipments',
  ReceivingDetails: 'navigation.receivingDetails',
  GRTracker: 'navigation.grTrackerClassic',
  More: 'common.more',
};

/**
 * Primary mobile navigation shell for admin/super_admin roles: five
 * thumb-reachable bottom tabs, each wrapping its own small native-stack so
 * push navigation (details, create/edit) stays within the tab it belongs to.
 */
export const AdminTabs = () => {
  const { t } = useTranslation();
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
      <Tab.Screen name="Dashboard" component={DashboardTabStack} options={{ tabBarLabel: t(TAB_LABEL_KEYS.Dashboard) }} />
      <Tab.Screen name="Shipments" component={ShipmentsTabStack} options={{ tabBarLabel: t(TAB_LABEL_KEYS.Shipments) }} />
      <Tab.Screen name="ReceivingDetails" component={ReceivingDetailsTabStack} options={{ tabBarLabel: t(TAB_LABEL_KEYS.ReceivingDetails) }} />
      <Tab.Screen name="GRTracker" component={GRTrackerTabStack} options={{ tabBarLabel: t(TAB_LABEL_KEYS.GRTracker) }} />
      <Tab.Screen name="More" component={MoreTabStack} options={{ tabBarLabel: t(TAB_LABEL_KEYS.More) }} />
    </Tab.Navigator>
  );
};

export default AdminTabs;
