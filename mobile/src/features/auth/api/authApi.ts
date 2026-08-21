import { apiClient } from '../../../api/client';
import { ENDPOINTS } from '../../../api/endpoints';
import { unwrap } from '../../../api/envelope';
import type { MessageResult } from '../../../types/result';
import type {
  AuthResult,
  ForgotPasswordPayload,
  LoginPayload,
  MeResult,
  OTPVerificationPayload,
  OTPVerificationResult,
  RefreshPayload,
  RegistrationRequestPayload,
  RegistrationRequestResult,
  StaffRegisterPayload,
  StaffRegisterResult,
  VerifyPasswordResetOTPPayload,
} from '../types';

/** Picks the right portal endpoint for `accountType` — Staff and Admin each
 * authenticate through their own, separate, backend-enforced endpoint.
 * Omitting `accountType` falls back to the original generic `/auth/login`. */
const LOGIN_ENDPOINT_FOR: Record<'admin' | 'staff', string> = {
  admin: ENDPOINTS.auth.adminLogin,
  staff: ENDPOINTS.auth.staffLogin,
};

/** Performs a login request and stores the session tokens + user. */
export const login = async ({ accountType, ...payload }: LoginPayload): Promise<AuthResult> => {
  const endpoint = accountType ? LOGIN_ENDPOINT_FOR[accountType] : ENDPOINTS.auth.login;
  const response = await apiClient.post<unknown>(endpoint, payload);
  return unwrap<AuthResult>(response);
};

/** Submits a self-service Staff signup — no OTP/email, PENDING until an
 * Admin approves it from the Staff Approvals screen. */
export const registerStaff = async (payload: StaffRegisterPayload): Promise<StaffRegisterResult> => {
  const response = await apiClient.post<unknown>(ENDPOINTS.auth.staffRegister, payload);
  return unwrap<StaffRegisterResult>(response);
};

/** Submits a registration request pending admin approval. */
export const register = async (payload: RegistrationRequestPayload): Promise<RegistrationRequestResult> => {
  const response = await apiClient.post<unknown>(ENDPOINTS.registrationRequests.create, payload);
  return unwrap<RegistrationRequestResult>(response);
};

/** Logs the current session out (revokes the refresh token server-side). */
export const logout = async (refreshToken?: string): Promise<void> => {
  const response = await apiClient.post<unknown>(ENDPOINTS.auth.logout, { refreshToken });
  unwrap<null>(response);
};

/** Refreshes a token pair from a refresh token. */
export const refresh = async (payload: RefreshPayload): Promise<AuthResult> => {
  const response = await apiClient.post<unknown>(ENDPOINTS.auth.refresh, payload);
  return unwrap<AuthResult>(response);
};

/** Requests a password reset OTP for the given address. */
export const forgotPasswordOTP = async (payload: ForgotPasswordPayload): Promise<MessageResult> => {
  const response = await apiClient.post<unknown>(ENDPOINTS.otp.forgotPassword, payload);
  return unwrap<MessageResult>(response);
};

/** Verifies a password-reset OTP and sets the new password in one call
 * (`POST /otp/verify-password-reset`). Revokes all sessions server-side. */
export const verifyPasswordResetOTP = async (payload: VerifyPasswordResetOTPPayload): Promise<MessageResult> => {
  const response = await apiClient.post<unknown>(ENDPOINTS.otp.verifyPasswordReset, payload);
  return unwrap<MessageResult>(response);
};

/** Verifies an OTP for account activation. */
export const verifyOTP = async (payload: OTPVerificationPayload): Promise<OTPVerificationResult> => {
  const response = await apiClient.post<unknown>(ENDPOINTS.otp.verifyApproval(payload.requestId), { otp: payload.otp });
  return unwrap<OTPVerificationResult>(response);
};

/** Returns the profile of the authenticated user. */
export const getCurrentUser = async (): Promise<MeResult> => {
  const response = await apiClient.get<unknown>(ENDPOINTS.users.me);
  return unwrap<MeResult>(response);
};