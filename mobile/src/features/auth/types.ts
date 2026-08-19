import type { User } from '../../types/user';
import type { AuthResponse, TokenPair } from '../../types/token';

export interface LoginPayload {
  email: string;
  password: string;
}

export type RequestedRole = 'admin';

/** Which account a user picked on the role-selection screen (Admin only). */
export type RegisterAccountType = 'admin';

/** Maps a backend requestedRole back to the UI account type used on auth screens. */
export const ROLE_TO_ACCOUNT_TYPE: Record<RequestedRole, RegisterAccountType> = {
  admin: 'admin',
};

/** Safe lookup for the UI account type; falls back to admin. */
export const roleToAccountType = (role: RequestedRole | string): RegisterAccountType =>
  ROLE_TO_ACCOUNT_TYPE[role as RequestedRole] ?? 'admin';

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