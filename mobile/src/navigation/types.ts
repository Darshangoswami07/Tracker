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
  /** Area selection screen shown before Excel Import — picks which area
   * the imported GRs belong to. */
  Areas: undefined;
  /** Also registered here (in addition to `ShipmentsStackParamList`) so the
   * Dashboard's "Import GRs from Excel" quick action pushes onto THIS
   * stack — same dual-registration reasoning as `CreateGR` above.
   * `selectedArea` is set when navigating from the Areas screen. */
  ExcelImport: { selectedArea?: string } | undefined;
  ExcelImportHistory: undefined;
  PaymentHistory: undefined;
  /** Payment History → Staff Daily Work → one staff member's collections/GRs
   * for a given day (defaults to today). */
  StaffDailyWork: { staffId: string; fullName: string; area: string | null };
  /** Lists the fixed shop/area categories (Bageshwar, Almora, Garur
   * Someshwar) with per-shop GR counts. Tapping one opens `AreaShops`
   * (the shop list for that area), not the raw GR list directly. */
  AllShops: undefined;
  /** All Shops → tap an area → list of shops (consignors) with a GR in that
   * area. Tapping a shop opens `ShopHistory` pinned to it. */
  AreaShops: { area: string };
  /** One shop's GR history within one area — status tabs (Pending/Cleared/
   * Uncleared/Delivered) at top, search, nothing else: only this shop's
   * GRs, only this area's data. */
  ShopHistory: { shopName: string; area: string };
};

/** Screens reached from the Shipments tab. */
export type ShipmentsStackParamList = {
  /** `fixedArea` — when set — pins this screen to a single shop/area: the
   * location filter is hidden and back navigates to `AllShops` instead of
   * the Shipments list. Reached via the Shipments tab's own header "+" GR
   * list, not from All Shops (which now drills through `AreaShops` /
   * `ShopHistory` instead). */
  GRShipments: { fixedArea?: string } | undefined;
  CreateGR: undefined;
  GRDetails: { orderId: string };
  EditGR: { orderId: string };
  Areas: undefined;
  ExcelImport: { selectedArea?: string } | undefined;
  ExcelImportHistory: undefined;
  PaymentHistory: undefined;
  StaffDailyWork: { staffId: string; fullName: string; area: string | null };
  AllShops: undefined;
  AreaShops: { area: string };
  ShopHistory: { shopName: string; area: string };
};

/** Screens reached from the Receiving Details tab. */
export type ReceivingDetailsStackParamList = {
  ReceivingDetailsHome: undefined;
  ReceivingDetail: { orderId: string };
};

/** Screens reached from the GR Tracker (classic) tab. */
export type GRTrackerStackParamList = {
  GRTrackerClassic: undefined;
};

/** Screens reached from the More tab (account, settings, remaining admin tools). */
export type MoreStackParamList = {
  /** Named distinctly from the `More` tab itself (see `AdminTabParamList`) —
   * React Navigation logs "Found screens with the same name nested inside
   * one another" when a tab and its first nested screen share a name, which
   * makes `navigate('More', { screen: X })` dispatches from this stack
   * resolve ambiguously and silently no-op. Mirrors the Staff shell's
   * `StaffMoreTab` / `StaffMore` naming, which doesn't hit this. */
  MoreHome: undefined;
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
  CustomerTracking: { grNumber?: string } | undefined;
};

/** Union of every screen reachable inside the admin tab shell — kept for call sites that navigate by screen name without knowing which tab owns it. */
export type AdminStackParamList = DashboardStackParamList &
  ShipmentsStackParamList &
  ReceivingDetailsStackParamList &
  GRTrackerStackParamList &
  MoreStackParamList;

export type AppStackParamList = AdminStackParamList;

/** The role-aware shell wraps the active role's bottom-tab navigator. */
export type AdminTabParamList = {
  Dashboard: NavigatorScreenParams<DashboardStackParamList> | undefined;
  Shipments: NavigatorScreenParams<ShipmentsStackParamList> | undefined;
  ReceivingDetails: NavigatorScreenParams<ReceivingDetailsStackParamList> | undefined;
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
  StaffAllShops: undefined;
  StaffShopHistory: { shopName: string };
  /** Reuses the shared `AdminGRDetailsScreen`. Registered here (not just in the
   * Deliveries stack) so a GR opened from the All-Shops → Shop-History flow
   * stays inside the Dashboard stack — keeping `goBack` return to the shop's GR
   * list instead of jumping to the Deliveries tab. */
  GRDetails: { orderId: string };
};

/** Screens reached from the Staff shell's Deliveries tab (reuses the
 * existing `StaffGRPanelScreen`/`AdminCreateGRScreen` unchanged — both are
 * already role-agnostic server-side and scope every GR they create/list to
 * the signed-in Staff member's own company). */
export type StaffDeliveriesStackParamList = {
  /** `statusFilter`/`title` let a caller (e.g. the Staff Dashboard's
   * "Pending Slip"/"Delivered Slip" quick actions) pre-filter the list by
   * GR status instead of always showing every GR ("My Slips"). */
  StaffDeliveries: { statusFilter?: string; title?: string } | undefined;
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