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

export type AdminStackParamList = {
  AdminDashboard: undefined;
  UserManagement: undefined;
  DriverManagement: undefined;
  VehicleManagement: undefined;
  OrderManagement: undefined;
  GRShipments: undefined;
  CreateGR: undefined;
  GRDetails: { orderId: string };
  EditGR: { orderId: string };
  CustomerTracking: { grNumber?: string } | undefined;
  GRTrackerClassic: undefined;
  OrderDetails: { orderId: string };
  Analytics: undefined;
  AuditLogs: undefined;
  Notifications: undefined;
  Settings: undefined;
  SystemHealth: undefined;
  PendingApprovals: undefined;
  StaffManagement: undefined;
  Profile: undefined;
  ChangePassword: undefined;
  HelpSupport: undefined;
  /** TEMPORARY dev-only SQLite diagnostics. Remove before shipping. */
  SQLiteDiagnostics: undefined;
};

export type AppStackParamList = AdminStackParamList;

/** The role-aware drawer wraps the active role stack as its single screen. */
export type MainDrawerParamList = {
  Home: NavigatorScreenParams<AppStackParamList> | undefined;
};

export type RootStackParamList = {
  Auth: NavigatorScreenParams<AuthStackParamList> | undefined;
  App: NavigatorScreenParams<AppStackParamList> | undefined;
  Main: NavigatorScreenParams<MainDrawerParamList> | undefined;
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