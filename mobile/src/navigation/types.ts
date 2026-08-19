import type { NavigatorScreenParams } from '@react-navigation/native';
import type { RegisterAccountType, RegistrationRequestResult } from '../features/auth/types';

export type AuthStackParamList = {
  Welcome: undefined;
  Login: { accountType?: 'admin' } | undefined;
  Register: { accountType?: 'admin' } | undefined;
  Terms: undefined;
  Privacy: undefined;
  ForgotPassword: undefined;
  OTPVerification: {
    requestId: string;
    isApproval?: boolean;
    isPasswordReset?: boolean;
    email?: string;
  };
  ApprovalPending: undefined;
  RegistrationPending: { request: RegistrationRequestResult };
  RegistrationRejected: { requestId: string; reason: string; accountType?: RegisterAccountType };
  RegistrationSuccess: undefined;
  ResetPassword: { requestId: string };
};

/** Screens reached from the Dashboard tab (overview + super-admin drill-downs). */
export type DashboardStackParamList = {
  AdminDashboard: undefined;
  PendingApprovals: undefined;
  StaffManagement: undefined;
  Analytics: undefined;
  AuditLogs: undefined;
  SystemHealth: undefined;
};

/** Screens reached from the Shipments tab. */
export type ShipmentsStackParamList = {
  GRShipments: undefined;
  CreateGR: undefined;
  GRDetails: { orderId: string };
  EditGR: { orderId: string };
};

/** Screens reached from the Tracking tab. */
export type TrackingStackParamList = {
  CustomerTracking: { grNumber?: string } | undefined;
};

/** Screens reached from the GR Tracker (classic) tab. */
export type GRTrackerStackParamList = {
  GRTrackerClassic: undefined;
};

/** Screens reached from the More tab (account, settings, remaining admin tools). */
export type MoreStackParamList = {
  More: undefined;
  Notifications: undefined;
  Profile: undefined;
  EditProfile: undefined;
  Settings: undefined;
  ChangePassword: undefined;
  HelpSupport: undefined;
  About: undefined;
  UserManagement: undefined;
  DriverManagement: undefined;
  VehicleManagement: undefined;
  OrderManagement: undefined;
  OrderDetails: { orderId: string };
};

/** Union of every screen reachable inside the admin tab shell — kept for call sites that navigate by screen name without knowing which tab owns it. */
export type AdminStackParamList = DashboardStackParamList &
  ShipmentsStackParamList &
  TrackingStackParamList &
  GRTrackerStackParamList &
  MoreStackParamList;

export type AppStackParamList = AdminStackParamList;

/** The role-aware shell wraps the active role's bottom-tab navigator. */
export type AdminTabParamList = {
  Dashboard: NavigatorScreenParams<DashboardStackParamList> | undefined;
  Shipments: NavigatorScreenParams<ShipmentsStackParamList> | undefined;
  Tracking: NavigatorScreenParams<TrackingStackParamList> | undefined;
  GRTracker: NavigatorScreenParams<GRTrackerStackParamList> | undefined;
  More: NavigatorScreenParams<MoreStackParamList> | undefined;
};

export type RootStackParamList = {
  Auth: NavigatorScreenParams<AuthStackParamList> | undefined;
  App: NavigatorScreenParams<AppStackParamList> | undefined;
  Main: NavigatorScreenParams<AdminTabParamList> | undefined;
  Onboarding: undefined;
  Splash: undefined;
  NoInternet: undefined;
  Maintenance: undefined;
  UpdateApp: undefined;
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}