import type { NavigatorScreenParams } from '@react-navigation/native';
import type { RegisterAccountType, RegistrationRequestResult } from '../features/auth/types';

export type AuthStackParamList = {
  Welcome: undefined;
  RoleSelection: undefined;
  Login: { accountType?: RegisterAccountType } | undefined;
  Register: { accountType?: RegisterAccountType } | undefined;
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
  /** Shown right after Staff signup, and when a PENDING Staff account tries
   * to log in. No requestId — the self-service Staff flow doesn't use the
   * `registration_requests` table at all. */
  StaffApprovalPending: undefined;
  /** Shown when a REJECTED Staff account tries to log in. */
  StaffRejected: { reason?: string };
};

/** Screens reached from the Dashboard tab (overview + super-admin drill-downs).
 * `CreateGR` is also registered here (in addition to `ShipmentsStackParamList`)
 * so the Dashboard's own "Create GR / Shipment" quick action pushes it onto
 * the Dashboard tab's own stack — keeping normal `goBack()` navigation
 * returning to the screen the user actually came from, instead of jumping
 * tabs into Shipments' stack. */
export type DashboardStackParamList = {
  AdminDashboard: undefined;
  PendingApprovals: undefined;
  StaffManagement: undefined;
  /** Separate from PendingApprovals/StaffManagement (the existing
   * OTP/registration-request queue, Super-Admin-only) — the self-service
   * Staff portal's approval queue, available to a plain Admin too. */
  StaffApprovals: undefined;
  /** Every self-service Staff account (any status), with a Remove
   * (suspend, not delete) / Reactivate toggle. Available to a plain Admin. */
  AllStaff: undefined;
  Analytics: undefined;
  AuditLogs: undefined;
  SystemHealth: undefined;
  CreateGR: undefined;
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

/** Screens reached from the Staff shell's Dashboard tab.
 * `CreateGR` is also registered here (in addition to
 * `StaffDeliveriesStackParamList`), same reasoning as the Admin shell's
 * `DashboardStackParamList`: a quick action from the Dashboard pushes onto
 * the Dashboard tab's own stack so `goBack()` returns to the screen the
 * user actually came from, instead of jumping into the Deliveries tab. */
export type StaffDashboardStackParamList = {
  StaffDashboard: undefined;
  CreateGR: undefined;
};

/** Screens reached from the Staff shell's Deliveries tab (reuses the
 * existing `StaffGRPanelScreen`/`AdminCreateGRScreen` unchanged — both are
 * already role-agnostic server-side and scope every GR they create/list to
 * the signed-in Staff member's own company). */
export type StaffDeliveriesStackParamList = {
  StaffDeliveries: undefined;
  CreateGR: undefined;
  GRDetails: { orderId: string };
  EditGR: { orderId: string };
};

/** Screens reached from the Staff shell's More tab — reuses the same common
 * screens the Admin shell uses, minus every Admin-only management screen. */
export type StaffMoreStackParamList = {
  StaffMore: undefined;
  Notifications: undefined;
  Profile: undefined;
  EditProfile: undefined;
  Settings: undefined;
  ChangePassword: undefined;
  HelpSupport: undefined;
  About: undefined;
};

/** The Staff role's own small bottom-tab shell — deliberately smaller than
 * `AdminTabParamList` and containing no Admin-only screens. */
export type StaffTabParamList = {
  StaffDashboardTab: NavigatorScreenParams<StaffDashboardStackParamList> | undefined;
  StaffDeliveriesTab: NavigatorScreenParams<StaffDeliveriesStackParamList> | undefined;
  StaffMoreTab: NavigatorScreenParams<StaffMoreStackParamList> | undefined;
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