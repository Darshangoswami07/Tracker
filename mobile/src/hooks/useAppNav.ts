import { useNavigation, CommonActions } from '@react-navigation/native';
import { useUserStore } from '../store/userStore';
import type { AdminTabParamList, StaffTabParamList } from '../navigation/types';

/**
 * Maps a role to the authenticated home screen. Used as the fallback target
 * when a screen has no prior history to go back to.
 */
export const getHomeScreenForRole = (role?: string): string => {
  switch (role) {
    case 'staff':
      return 'StaffDashboard';
    case 'admin':
    case 'super_admin':
    default:
      return 'AdminDashboard';
  }
};

/** Which bottom tab owns each screen name, so cross-tab navigation resolves correctly.
 * `CreateGR` is deliberately NOT listed here: it's registered directly in
 * every stack that can open it (Dashboard and Shipments — see AdminTabs.tsx),
 * so `navigate('CreateGR')` below falls through to the generic branch and
 * pushes it onto whichever stack the caller is actually in. That keeps
 * `goBack()` returning to the real previous screen regardless of which tab
 * opened it, instead of always jumping to one hardcoded owning tab. */
const ADMIN_SCREEN_TO_TAB: Record<string, keyof AdminTabParamList> = {
  AdminDashboard: 'Dashboard',
  PendingApprovals: 'Dashboard',
  StaffManagement: 'Dashboard',
  StaffApprovals: 'Dashboard',
  AllStaff: 'Dashboard',
  Analytics: 'Dashboard',
  AuditLogs: 'Dashboard',
  SystemHealth: 'Dashboard',

  GRShipments: 'Shipments',
  GRDetails: 'Shipments',
  EditGR: 'Shipments',

  CustomerTracking: 'More',

  GRTrackerClassic: 'GRTracker',

  MoreHome: 'More',
  Notifications: 'More',
  Profile: 'More',
  EditProfile: 'More',
  Settings: 'More',
  ChangePassword: 'More',
  HelpSupport: 'More',
  About: 'More',
  UserManagement: 'More',
  DriverManagement: 'More',
  VehicleManagement: 'More',
  OrderManagement: 'More',
  OrderDetails: 'More',
};

/** Same idea as `ADMIN_SCREEN_TO_TAB`, for the much smaller Staff shell
 * (`StaffShell.tsx`) — kept as a separate map since Staff's tabs are named
 * differently and don't include any Admin-only screen. */
const STAFF_SCREEN_TO_TAB: Record<string, keyof StaffTabParamList> = {
  StaffDashboard: 'StaffDashboardTab',
  StaffDeliveries: 'StaffDeliveriesTab',
  GRDetails: 'StaffDeliveriesTab',
  EditGR: 'StaffDeliveriesTab',
  StaffMore: 'StaffMoreTab',
  Notifications: 'StaffMoreTab',
  Profile: 'StaffMoreTab',
  EditProfile: 'StaffMoreTab',
  Settings: 'StaffMoreTab',
  ChangePassword: 'StaffMoreTab',
  HelpSupport: 'StaffMoreTab',
  About: 'StaffMoreTab',
};

/**
 * Navigation helpers used by screens inside the role-aware bottom-tab shell.
 * Dashboards render these from the tab shell, so screens dispatch tab
 * navigation and navigate to the shared Notifications screen.
 */
export const useAppNav = () => {
  const navigation = useNavigation();
  const role = useUserStore((state) => state.user?.role);
  const screenToTab = role === 'staff' ? STAFF_SCREEN_TO_TAB : ADMIN_SCREEN_TO_TAB;

  /** Opens the More tab — the mobile replacement for the old slide-out drawer menu. */
  const openDrawer = () => navigation.navigate((role === 'staff' ? 'StaffMoreTab' : 'More') as never);
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
    const tab = screenToTab[screen];
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
