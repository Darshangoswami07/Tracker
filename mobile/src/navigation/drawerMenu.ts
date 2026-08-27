import { ComponentProps } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Role, ROLES } from '../constants/roles';

export type IoniconName = ComponentProps<typeof Ionicons>['name'];

/** A single selectable row in the DeliveryHub drawer. */
export interface DrawerMenuItem {
  key: string;
  labelKey: string;
  icon: IoniconName;
  /** Target screen inside the role's navigation stack. */
  screen?: string;
  /** Params passed to the target screen (e.g. initial status filter). */
  params?: Record<string, unknown>;
  /** Built-in action handled by the drawer itself (logout). */
  action?: 'logout';
}

export interface DrawerMenuSection {
  key: string;
  titleKey?: string;
  items: DrawerMenuItem[];
}

const HELP: DrawerMenuItem = {
  key: 'help',
  labelKey: 'common.helpSupport',
  icon: 'help-circle-outline',
  screen: 'HelpSupport',
};
const LOGOUT: DrawerMenuItem = { key: 'logout', labelKey: 'navigation.logout', icon: 'log-out-outline', action: 'logout' };

const NOTIFICATIONS: DrawerMenuItem = {
  key: 'notifications',
  labelKey: 'navigation.notifications',
  icon: 'notifications-outline',
  screen: 'Notifications',
};
const PROFILE: DrawerMenuItem = {
  key: 'profile',
  labelKey: 'common.profile',
  icon: 'person-circle-outline',
  screen: 'Profile',
};
const SETTINGS: DrawerMenuItem = {
  key: 'settings',
  labelKey: 'navigation.settings',
  icon: 'settings-outline',
  screen: 'Settings',
};

/**
 * Returns the menu items available to a role. Only screens the role's
 * navigation stack actually contains are listed, so tapping a row always
 * resolves to a real screen.
 */
export const getDrawerMenu = (role: Role): DrawerMenuSection[] => {
  const main: DrawerMenuItem[] = [];
  const secondary: DrawerMenuItem[] = [];
  const actions: DrawerMenuItem[] = [HELP, LOGOUT];

  switch (role) {
    case ROLES.STAFF:
      main.push(
        { key: 'dashboard', labelKey: 'navigation.dashboard', icon: 'grid-outline', screen: 'StaffDashboard' },
        { key: 'deliveries', labelKey: 'navigation.deliveries', icon: 'reader-outline', screen: 'StaffDeliveries' },
      );
      secondary.push(NOTIFICATIONS, PROFILE, SETTINGS);
      break;

    case ROLES.SUPER_ADMIN:
      main.push(
        { key: 'dashboard', labelKey: 'navigation.dashboard', icon: 'grid-outline', screen: 'AdminDashboard' },
        { key: 'pending-approvals', labelKey: 'navigation.pendingApprovals', icon: 'time-outline', screen: 'PendingApprovals' },
        { key: 'staff-management', labelKey: 'navigation.staffManagement', icon: 'people-circle-outline', screen: 'StaffManagement' },
        { key: 'staff-approvals', labelKey: 'navigation.staffApprovals', icon: 'checkmark-done-circle-outline', screen: 'StaffApprovals' },
        { key: 'gr-shipments', labelKey: 'navigation.grShipments', icon: 'reader-outline', screen: 'GRShipments' },
        { key: 'gr-tracker-classic', labelKey: 'navigation.grTrackerClassic', icon: 'time-outline', screen: 'GRTrackerClassic' },
      );
      secondary.push(
        { key: 'customer-tracking', labelKey: 'navigation.customerTracking', icon: 'search-outline', screen: 'CustomerTracking' },
        NOTIFICATIONS, PROFILE, SETTINGS,
      );
      break;

    case ROLES.ADMIN:
    default:
      // Pending Approvals and Staff Management (the OTP/registration-request
      // flow) are Super Admin-only — a plain Admin's backing endpoints for
      // those stay locked server-side. Staff Approvals (the separate
      // self-service Staff portal's queue) is available to a plain Admin too.
      main.push(
        { key: 'dashboard', labelKey: 'navigation.dashboard', icon: 'grid-outline', screen: 'AdminDashboard' },
        { key: 'staff-approvals', labelKey: 'navigation.staffApprovals', icon: 'checkmark-done-circle-outline', screen: 'StaffApprovals' },
        { key: 'gr-shipments', labelKey: 'navigation.grShipments', icon: 'reader-outline', screen: 'GRShipments' },
        { key: 'gr-tracker-classic', labelKey: 'navigation.grTrackerClassic', icon: 'time-outline', screen: 'GRTrackerClassic' },
      );
      secondary.push(
        { key: 'customer-tracking', labelKey: 'navigation.customerTracking', icon: 'search-outline', screen: 'CustomerTracking' },
        NOTIFICATIONS, PROFILE, SETTINGS,
      );
      break;
  }

  const sections: DrawerMenuSection[] = [{ key: 'main', items: main }];
  if (secondary.length > 0) {
    sections.push({ key: 'general', titleKey: 'common.general', items: secondary });
  }
  if (actions.length > 0) {
    sections.push({ key: 'actions', items: actions });
  }
  return sections;
};