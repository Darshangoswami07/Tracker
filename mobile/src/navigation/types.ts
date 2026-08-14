import type { NavigatorScreenParams } from '@react-navigation/native';
import type { RegisterAccountType, RegistrationRequestResult } from '../features/auth/types';

export type AuthStackParamList = {
  Welcome: undefined;
  AccountType: { mode: 'register' | 'login' };
  Login: { accountType?: 'customer' | 'staff' | 'driver' | 'admin' } | undefined;
  Register: { accountType?: 'customer' | 'staff' | 'driver' | 'admin' } | undefined;
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

export type BusinessStackParamList = {
  BusinessDashboard: undefined;
  Orders: undefined;
  OrderDetails: { orderId: string };
  CreateOrder: undefined;
  AssignDriver: { orderId: string };
  AssignVehicle: { orderId: string };
  Analytics: undefined;
  Drivers: undefined;
  DriverDetails: { driverId: string };
  Vehicles: undefined;
  VehicleDetails: { vehicleId: string };
  Customers: undefined;
  CustomerDetails: { customerId: string };
  Reports: undefined;
  Notifications: undefined;
  Profile: undefined;
  Settings: undefined;
  ChangePassword: undefined;
  HelpSupport: undefined;
};

export type DriverStackParamList = {
  DriverDashboard: undefined;
  TodayDeliveries: undefined;
  AssignedOrders: undefined;
  OrderDetails: { orderId: string };
  Navigation: { orderId: string };
  Pickup: { orderId: string };
  Drop: { orderId: string };
  DeliveryProof: { orderId: string };
  CompletedOrders: undefined;
  Earnings: undefined;
  VehicleStatus: undefined;
  Notifications: undefined;
  Profile: undefined;
  Settings: undefined;
  ChangePassword: undefined;
  HelpSupport: undefined;
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
  CustomerTracking: undefined;
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
};

export type EmployeeStackParamList = {
  EmployeeDashboard: undefined;
  StaffGRPanel: undefined;
  CustomerTracking: undefined;
  Orders: undefined;
  OrderDetails: { orderId: string };
  Drivers: undefined;
  DriverDetails: { driverId: string };
  Vehicles: undefined;
  VehicleDetails: { vehicleId: string };
  Customers: undefined;
  CustomerDetails: { customerId: string };
  Reports: undefined;
  Notifications: undefined;
  Profile: undefined;
  Settings: undefined;
  ChangePassword: undefined;
  HelpSupport: undefined;
};

export type CustomerStackParamList = {
  CustomerDashboard: undefined;
  CustomerTracking: { grNumber?: string } | undefined;
  CreateOrder: undefined;
  MyOrders: undefined;
  OrderDetails: { orderId: string };
  LiveTracking: { orderId: string };
  Addresses: undefined;
  PaymentMethods: undefined;
  Notifications: undefined;
  Profile: undefined;
  Settings: undefined;
  ChangePassword: undefined;
  HelpSupport: undefined;
};

export type AppStackParamList =
  | BusinessStackParamList
  | DriverStackParamList
  | AdminStackParamList
  | EmployeeStackParamList
  | CustomerStackParamList;

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