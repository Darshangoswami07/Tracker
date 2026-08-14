import { ComponentProps } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Role, ROLES } from '../constants/roles';

export type IoniconName = ComponentProps<typeof Ionicons>['name'];

/** A single selectable row in the DeliveryHub drawer. */
export interface DrawerMenuItem {
  key: string;
  label: string;
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
  title?: string;
  items: DrawerMenuItem[];
}

const HELP: DrawerMenuItem = {
  key: 'help',
  label: 'Help & Support',
  icon: 'help-circle-outline',
  screen: 'HelpSupport',
};
const LOGOUT: DrawerMenuItem = { key: 'logout', label: 'Logout', icon: 'log-out-outline', action: 'logout' };

const NOTIFICATIONS: DrawerMenuItem = {
  key: 'notifications',
  label: 'Notifications',
  icon: 'notifications-outline',
  screen: 'Notifications',
};
const PROFILE: DrawerMenuItem = {
  key: 'profile',
  label: 'Profile',
  icon: 'person-circle-outline',
  screen: 'Profile',
};
const SETTINGS: DrawerMenuItem = {
  key: 'settings',
  label: 'Settings',
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
    case ROLES.SUPER_ADMIN:
      main.push(
        { key: 'dashboard', label: 'Dashboard', icon: 'grid-outline', screen: 'AdminDashboard' },
        { key: 'pending-approvals', label: 'Pending Approvals', icon: 'time-outline', screen: 'PendingApprovals' },
        { key: 'staff-management', label: 'Staff Management', icon: 'people-circle-outline', screen: 'StaffManagement' },
        { key: 'order-management', label: 'Orders', icon: 'cube-outline', screen: 'OrderManagement' },
        { key: 'gr-shipments', label: 'GR / Shipments', icon: 'reader-outline', screen: 'GRShipments' },
        { key: 'customer-tracking', label: 'Customer Tracking', icon: 'search-outline', screen: 'CustomerTracking' },
        { key: 'gr-tracker-classic', label: 'GR Tracker (Classic)', icon: 'time-outline', screen: 'GRTrackerClassic' },
      );
      secondary.push(NOTIFICATIONS, PROFILE, SETTINGS);
      break;

    case ROLES.ADMIN:
    default:
      // Pending Approvals and Staff Management are Super Admin-only — a plain
      // Admin's backing endpoints for the former are also locked server-side.
      main.push(
        { key: 'dashboard', label: 'Dashboard', icon: 'grid-outline', screen: 'AdminDashboard' },
        { key: 'order-management', label: 'Orders', icon: 'cube-outline', screen: 'OrderManagement' },
        { key: 'gr-shipments', label: 'GR / Shipments', icon: 'reader-outline', screen: 'GRShipments' },
        { key: 'customer-tracking', label: 'Customer Tracking', icon: 'search-outline', screen: 'CustomerTracking' },
        { key: 'gr-tracker-classic', label: 'GR Tracker (Classic)', icon: 'time-outline', screen: 'GRTrackerClassic' },
      );
      secondary.push(NOTIFICATIONS, PROFILE, SETTINGS);
      break;
  }

  const sections: DrawerMenuSection[] = [{ key: 'main', items: main }];
  if (secondary.length > 0) {
    sections.push({ key: 'general', title: 'General', items: secondary });
  }
  if (actions.length > 0) {
    sections.push({ key: 'actions', items: actions });
  }
  return sections;
};