import type { User } from '../../types/user';
import type { AuthResponse, TokenPair } from '../../types/token';

export interface LoginPayload {
  email: string;
  password: string;
  /** Which portal to authenticate against — picks `/auth/staff/login` vs
   *  `/auth/admin/login`. Omitted defaults to the legacy `/auth/login`. */
  accountType?: RegisterAccountType;
}

export type RequestedRole = 'admin' | 'staff';

/** Which account a user picked on the role-selection screen. */
export type RegisterAccountType = 'admin' | 'staff';

/** Maps a backend requestedRole back to the UI account type used on auth screens. */
export const ROLE_TO_ACCOUNT_TYPE: Record<RequestedRole, RegisterAccountType> = {
  admin: 'admin',
  staff: 'staff',
};

/** Safe lookup for the UI account type; falls back to admin. */
export const roleToAccountType = (role: RequestedRole | string): RegisterAccountType =>
  ROLE_TO_ACCOUNT_TYPE[role as RequestedRole] ?? 'admin';

/** Payload for the self-service Staff signup (`POST /auth/staff/register`).
 * No company field — Staff is assigned to the approving Admin's company at
 * approval time, not at signup. */
export interface StaffRegisterPayload {
  fullName: string;
  email: string;
  phone: string;
  password: string;
  /** One of the fixed operational areas (see `constants/areas.ts`) — the
   * Staff account is permanently associated with this location. */
  area: string;
}

export interface StaffRegisterResult {
  id: string;
  status: 'pending';
}

export interface RegistrationRequestPayload {
  firstName: string;
  lastName: string;
  /** Free-text company name, required for ``admin`` registrations. */
  companyName?: string;
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
  /** Free-text company name, required for ``admin`` registrations. */
  companyName?: string;
  email: string;
  phone: string;
  password: string;
  requestedRole?: RequestedRole;
}

export interface ForgotPasswordPayload {
  email: string;
}

/** Matches backend `ResetPasswordOTPRequest` (`POST /otp/verify-password-reset`). */
export interface VerifyPasswordResetOTPPayload {
  email: string;
  otp: string;
  password: string;
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