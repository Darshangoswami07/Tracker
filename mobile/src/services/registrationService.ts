import { apiClient } from '../api/client';
import { ENDPOINTS } from '../api/endpoints';
import { unwrap } from '../api/envelope';
import type { RegistrationRequestResult } from '../features/auth/types';

/** Resend OTP response shape from the backend envelope. */
interface ResendResult {
  resent: boolean;
}

/**
 * Data access for the registration-approval flow. These endpoints are public
 * (no auth header required) because they are used before a session exists.
 */
export const registrationService = {
  /** Fetches the latest state of a registration request by its id. */
  async getRegistrationRequest(id: string): Promise<RegistrationRequestResult> {
    const response = await apiClient.get<unknown>(ENDPOINTS.registrationRequests.detail(id));
    return unwrap<RegistrationRequestResult>(response);
  },

  /** Requests a fresh approval OTP for an approved registration request. */
  async resendApprovalOTP(id: string): Promise<ResendResult> {
    const response = await apiClient.post<unknown>(ENDPOINTS.otp.resendApproval(id));
    return unwrap<ResendResult>(response);
  },

  /** Requests a fresh password-reset OTP for an active account. */
  async resendPasswordResetOTP(email: string): Promise<{ message: string }> {
    const response = await apiClient.post<unknown>(ENDPOINTS.otp.resendPasswordReset, { email });
    return unwrap<{ message: string }>(response);
  },
};
