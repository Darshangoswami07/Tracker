import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../theme/useAppTheme';
import type {
  StaffTabParamList,
  StaffDashboardStackParamList,
  StaffDeliveriesStackParamList,
  StaffMoreStackParamList,
} from './types';

import { StaffDashboardScreen } from '../screens/staff/StaffDashboardScreen';
// Reuses the existing Staff GR panel unchanged — it already does
// search/filter/status-update/slip-upload against the company-scoped GR
// endpoints (`/admin/orders/*`), which now also admit the STAFF role (see
// `backend/app/api/deps.py::_require_gr_access`).
import { StaffGRPanelScreen } from '../screens/employee/StaffGRPanelScreen';

// The More tab reuses the exact same generic, drawerMenu-driven MoreScreen
// the Admin shell uses — it already renders only the sections relevant to
// the signed-in role (see `navigation/drawerMenu.ts`'s `ROLES.STAFF` case),
// so no Admin-only management screens are ever exposed to Staff.
import { MoreScreen } from '../screens/common/MoreScreen';
import { NotificationsScreen } from '../screens/common/NotificationsScreen';
import { ProfileScreen } from '../screens/common/ProfileScreen';
import { EditProfileScreen } from '../screens/common/EditProfileScreen';
import { SettingsScreen } from '../screens/common/SettingsScreen';
import { ChangePasswordScreen } from '../screens/common/ChangePasswordScreen';
import { HelpSupportScreen } from '../screens/common/HelpSupportScreen';
import { AboutScreen } from '../screens/common/AboutScreen';

const Tab = createBottomTabNavigator<StaffTabParamList>();
const DashboardStack = createNativeStackNavigator<StaffDashboardStackParamList>();
const DeliveriesStack = createNativeStackNavigator<StaffDeliveriesStackParamList>();
const MoreStack = createNativeStackNavigator<StaffMoreStackParamList>();

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
    <DashboardStack.Screen name="StaffDashboard" component={StaffDashboardScreen} />
  </DashboardStack.Navigator>
);

const DeliveriesTabStack = () => (
  <DeliveriesStack.Navigator screenOptions={useStackScreenOptions()}>
    <DeliveriesStack.Screen name="StaffDeliveries" component={StaffGRPanelScreen} />
  </DeliveriesStack.Navigator>
);

const MoreTabStack = () => (
  <MoreStack.Navigator screenOptions={useStackScreenOptions()}>
    <MoreStack.Screen name="StaffMore" component={MoreScreen} />
    <MoreStack.Screen name="Notifications" component={NotificationsScreen} />
    <MoreStack.Screen name="Profile" component={ProfileScreen} />
    <MoreStack.Screen name="EditProfile" component={EditProfileScreen} />
    <MoreStack.Screen name="Settings" component={SettingsScreen} />
    <MoreStack.Screen name="ChangePassword" component={ChangePasswordScreen} />
    <MoreStack.Screen name="HelpSupport" component={HelpSupportScreen} />
    <MoreStack.Screen name="About" component={AboutScreen} />
  </MoreStack.Navigator>
);

const TAB_ICONS: Record<keyof StaffTabParamList, { active: keyof typeof Ionicons.glyphMap; inactive: keyof typeof Ionicons.glyphMap }> = {
  StaffDashboardTab: { active: 'grid', inactive: 'grid-outline' },
  StaffDeliveriesTab: { active: 'reader', inactive: 'reader-outline' },
  StaffMoreTab: { active: 'ellipsis-horizontal-circle', inactive: 'ellipsis-horizontal-outline' },
};

const TAB_LABELS: Record<keyof StaffTabParamList, string> = {
  StaffDashboardTab: 'Dashboard',
  StaffDeliveriesTab: 'Deliveries',
  StaffMoreTab: 'More',
};

/**
 * The Staff role's own navigation shell — deliberately small (3 tabs, no
 * Admin controls) and completely separate from `AdminTabs`. Mirrors
 * `AdminTabs.tsx`'s construction pattern (bottom tabs, each wrapping its
 * own small native-stack) at a fraction of the size.
 */
export const StaffShell = () => {
  const { colors, fonts } = useAppTheme();

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
          height: 60,
          paddingBottom: 8,
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
      <Tab.Screen name="StaffDashboardTab" component={DashboardTabStack} options={{ tabBarLabel: TAB_LABELS.StaffDashboardTab }} />
      <Tab.Screen name="StaffDeliveriesTab" component={DeliveriesTabStack} options={{ tabBarLabel: TAB_LABELS.StaffDeliveriesTab }} />
      <Tab.Screen name="StaffMoreTab" component={MoreTabStack} options={{ tabBarLabel: TAB_LABELS.StaffMoreTab }} />
    </Tab.Navigator>
  );
};

export default StaffShell;
