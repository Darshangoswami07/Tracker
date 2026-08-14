import type { User } from '../../types/user';
import type { AuthResponse, TokenPair } from '../../types/token';

export interface LoginPayload {
  email: string;
  password: string;
}

export type RequestedRole = 'employee' | 'driver' | 'admin';

/** Which account a user picked on the role-selection screen (Customer/Staff/Driver/Admin). */
export type RegisterAccountType = 'customer' | 'staff' | 'driver' | 'admin';

/** Maps a backend requestedRole back to the UI account type used on auth screens. */
export const ROLE_TO_ACCOUNT_TYPE: Record<RequestedRole, RegisterAccountType> = {
  employee: 'staff',
  driver: 'driver',
  admin: 'admin',
};

/** Safe lookup for the UI account type; falls back to staff (never customer). */
export const roleToAccountType = (role: RequestedRole | string): RegisterAccountType =>
  ROLE_TO_ACCOUNT_TYPE[role as RequestedRole] ?? 'staff';

/** A company the user can join, returned by the public companies endpoint. */
export interface CompanyOption {
  id: string;
  name: string;
}

export interface RegistrationRequestPayload {
  firstName: string;
  lastName: string;
  /** Free-text company name, required for ``admin`` registrations only. */
  companyName?: string;
  /** Selected company id, required for ``employee``/``driver`` registrations. */
  companyId?: string;
  email: string;
  phone: string;
  password: string;
  requestedRole?: RequestedRole;
}

export interface RegistrationRequestResult {
  id: string;
  firstName: string;
  lastName: string;
  companyName: string;
  companyId?: string | null;
  email: string;
  phone: string;
  requestedRole: RequestedRole | string;
  status: string;
  isVerified: boolean;
  isApproved: boolean;
  isActive: boolean;
  otpVerified: boolean;
  rejectionReason?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RegisterPayload {
  firstName: string;
  lastName: string;
  /** Free-text company name, required for ``admin`` registrations only. */
  companyName?: string;
  /** Selected company id, required for ``employee``/``driver`` registrations. */
  companyId?: string;
  email: string;
  phone: string;
  password: string;
  requestedRole?: RequestedRole;
}

/** Self-service signup payload for end-user customer accounts (no company, no approval). */
export interface RegisterCustomerPayload {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  password: string;
}

export interface ForgotPasswordPayload {
  email: string;
}

export interface ResetPasswordPayload {
  token: string;
  password: string;
}

export interface RefreshPayload {
  refreshToken: string;
}

export interface OTPVerificationPayload {
  otp: string;
  requestId: string;
  isPasswordReset?: boolean;
}

export interface OTPVerificationResult {
  user: User;
  tokens: TokenPair;
}

export type AuthResult = AuthResponse;

export type MeResult = User;

export type { TokenPair, User };