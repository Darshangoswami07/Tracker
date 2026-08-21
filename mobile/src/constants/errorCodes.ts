/**
 * Backend error codes returned by the API's consistent error envelope.
 * These are mapped to user-friendly messages in `services/errorMapper.ts`.
 */
export const ErrorCodes = {
  INVALID_CREDENTIALS: 'invalid_credentials',
  USER_NOT_FOUND: 'user_not_found',
  EMAIL_ALREADY_REGISTERED: 'email_already_registered',
  PHONE_ALREADY_REGISTERED: 'phone_already_registered',
  USER_INACTIVE: 'user_inactive',
  USER_NOT_APPROVED: 'user_not_approved',
  USER_NOT_VERIFIED: 'user_not_verified',
  WRONG_PORTAL: 'wrong_portal',
  TOKEN_EXPIRED: 'token_expired',
  TOKEN_INVALID: 'token_invalid',
  RESET_TOKEN_INVALID: 'reset_token_invalid',
  UNAUTHORIZED: 'unauthorized',
  FORBIDDEN: 'forbidden',
  NOT_FOUND: 'not_found',
  VALIDATION_ERROR: 'validation_error',
  RATE_LIMITED: 'rate_limited',
  OTP_EXPIRED: 'otp_expired',
  OTP_INVALID: 'otp_invalid',
  OTP_MAX_ATTEMPTS: 'otp_max_attempts',
  OTP_RESEND_COOLDOWN: 'otp_resend_cooldown',
  EMAIL_SEND_FAILED: 'email_send_failed',
  REGISTRATION_REQUEST_EXISTS: 'registration_request_exists',
  REGISTRATION_STATE_CONFLICT: 'registration_state_conflict',
  ALREADY_APPROVED: 'already_approved',
  INTERNAL_ERROR: 'internal_error',
  NOT_IMPLEMENTED: 'not_implemented',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];