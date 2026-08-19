import { useNavigation, CommonActions } from '@react-navigation/native';
import { useUserStore } from '../store/userStore';
import type { AdminTabParamList } from '../navigation/types';

/**
 * Maps a role to the authenticated home screen. Used as the fallback target
 * when a screen has no prior history to go back to.
 */
export const getHomeScreenForRole = (role?: string): string => {
  switch (role) {
    case 'admin':
    case 'super_admin':
    default:
      return 'AdminDashboard';
  }
};

/** Which bottom tab owns each screen name, so cross-tab navigation resolves correctly. */
const SCREEN_TO_TAB: Record<string, keyof AdminTabParamList> = {
  AdminDashboard: 'Dashboard',
  PendingApprovals: 'Dashboard',
  StaffManagement: 'Dashboard',
  Analytics: 'Dashboard',
  AuditLogs: 'Dashboard',
  SystemHealth: 'Dashboard',

  GRShipments: 'Shipments',
  CreateGR: 'Shipments',
  GRDetails: 'Shipments',
  EditGR: 'Shipments',

  CustomerTracking: 'Tracking',

  GRTrackerClassic: 'GRTracker',

  More: 'More',
  Notifications: 'More',
  Profile: 'More',
  Settings: 'More',
  ChangePassword: 'More',
  HelpSupport: 'More',
  UserManagement: 'More',
  DriverManagement: 'More',
  VehicleManagement: 'More',
  OrderManagement: 'More',
  OrderDetails: 'More',
};

/**
 * Navigation helpers used by screens inside the role-aware bottom-tab shell.
 * Dashboards render these from the tab shell, so screens dispatch tab
 * navigation and navigate to the shared Notifications screen.
 */
export const useAppNav = () => {
  const navigation = useNavigation();
  const role = useUserStore((state) => state.user?.role);

  /** Opens the More tab — the mobile replacement for the old slide-out drawer menu. */
  const openDrawer = () => navigation.navigate('More' as never);
  /** No-op: there is no slide-out panel to close in the tab-based shell. Kept for API compatibility. */
  const closeDrawer = () => {};
  const goToNotifications = () =>
    navigation.navigate('Notifications' as never);

  /**
   * Navigates to a screen inside the role's tab shell, resolving which tab
   * owns it so navigation works the same whether the target is in the
   * current tab or a different one.
   */
  const navigate = (screen: string, params?: Record<string, unknown> | undefined) => {
    const tab = SCREEN_TO_TAB[screen];
    if (!tab) {
      navigation.dispatch(CommonActions.navigate(screen, params as unknown as object | undefined));
      return;
    }
    navigation.dispatch(
      CommonActions.navigate(tab, {
        screen,
        params: params as unknown as object | undefined,
      }),
    );
  };

  /**
   * Safe "back": pops the history when the stack has a previous screen;
   * otherwise lands on the authenticated user's dashboard. Preserves the
   * original navigation history when it exists.
   */
  const goBack = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigate(getHomeScreenForRole(role));
    }
  };

  return { navigation, role, openDrawer, closeDrawer, goToNotifications, goBack, navigate };
};
