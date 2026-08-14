import type { AxiosError } from 'axios';
import { ErrorCodes } from '../constants/errorCodes';
import { TransportCodes, type AppError, type ApiErrorPayload } from '../types/api';

const FRIENDLY_MESSAGES: Record<string, string> = {
  [ErrorCodes.INVALID_CREDENTIALS]: 'Invalid email or password.',
  [ErrorCodes.USER_NOT_FOUND]: 'No account found with this email address.',
  [ErrorCodes.EMAIL_ALREADY_REGISTERED]: 'Email already registered. Please sign in instead.',
  [ErrorCodes.PHONE_ALREADY_REGISTERED]: 'An account already exists with this phone number.',
  [ErrorCodes.USER_INACTIVE]: 'Your account is waiting for administrator approval.',
  [ErrorCodes.USER_NOT_APPROVED]: 'Your registration request was rejected. You may submit a new application.',
  [ErrorCodes.USER_NOT_VERIFIED]:
    'Your account has been approved. Please check your email for the verification code.',
  [ErrorCodes.TOKEN_EXPIRED]: 'Your session has expired. Please sign in again.',
  [ErrorCodes.TOKEN_INVALID]: 'Your session is no longer valid. Please sign in again.',
  [ErrorCodes.RESET_TOKEN_INVALID]: 'This password reset link is invalid or has expired. Please request a new one.',
  [ErrorCodes.UNAUTHORIZED]: 'You are not authorized to perform this action.',
  [ErrorCodes.FORBIDDEN]: 'You do not have permission to perform this action.',
  [ErrorCodes.NOT_FOUND]: 'The requested item could not be found.',
  [ErrorCodes.VALIDATION_ERROR]: 'Please review the highlighted fields and try again.',
  [ErrorCodes.RATE_LIMITED]: 'Too many attempts. Please try again in a minute.',
  [ErrorCodes.OTP_EXPIRED]: 'Verification code expired. A new code has been sent to your email.',
  [ErrorCodes.OTP_INVALID]: 'Invalid verification code. Please try again.',
  [ErrorCodes.OTP_MAX_ATTEMPTS]:
    'Too many incorrect attempts. A new verification code has been sent to your email.',
  [ErrorCodes.OTP_RESEND_COOLDOWN]:
    'You can request a new code shortly. Please wait a moment before trying again.',
  [ErrorCodes.EMAIL_SEND_FAILED]: "We couldn't send the verification email. Please try again.",
  [ErrorCodes.REGISTRATION_REQUEST_EXISTS]:
    'Your registration request is already under review. Please wait for admin approval.',
  [ErrorCodes.REGISTRATION_STATE_CONFLICT]:
    'This registration request cannot be processed in its current state. Please try again.',
  [ErrorCodes.ALREADY_APPROVED]: 'This registration request has already been approved.',
  [ErrorCodes.INTERNAL_ERROR]: 'Something went wrong. Please try again in a few moments.',
  [ErrorCodes.NOT_IMPLEMENTED]: 'This feature is not available yet.',
  [TransportCodes.NETWORK]: 'Unable to reach the server. Check your internet connection.',
  [TransportCodes.TIMEOUT]: 'The request took too long. Please try again.',
  [TransportCodes.SERVER]: 'The server is unavailable. Please try again later.',
  [TransportCodes.CANCELED]: 'The request was canceled.',
};

/** Developer-only substrings that must never reach the user. */
const RAW_MARKERS: RegExp[] = [
  /Request failed with status code/i,
  /AxiosError/i,
  /Network Error/i,
  /Internal Server Error/i,
  /ValidationError/i,
  /Traceback/i,
];

const isRaw = (value: string): boolean => RAW_MARKERS.some((marker) => marker.test(value));

const fallbackMessage = (status?: number) =>
  status && status >= 500 ? FRIENDLY_MESSAGES[TransportCodes.SERVER] : FRIENDLY_MESSAGES[ErrorCodes.INTERNAL_ERROR];

const isErrorPayload = (value: unknown): value is ApiErrorPayload =>
  typeof value === 'object' &&
  value !== null &&
  (value as ApiErrorPayload).success === false &&
  typeof (value as ApiErrorPayload).error === 'object';

/**
 * Normalises any thrown value (Axios error, API envelope, plain Error) into a
 * user-friendly AppError. Screens and stores only ever handle AppError.
 * Raw HTTP/axios strings are always replaced with a friendly message.
 */
export const toAppError = (raw: unknown): AppError => {
  // Already-normalised AppError (a plain object with an app-level code).
  // AxiosError / ApiEnvelopeError also carry a string `code` and `message`, so
  // they must be excluded here or the raw "Request failed with status code X"
  // text would leak straight through to the UI instead of the real message.
  if (
    raw &&
    typeof raw === 'object' &&
    !(raw instanceof Error) &&
    'message' in raw &&
    typeof (raw as AppError).code === 'string'
  ) {
    return raw as AppError;
  }

  const error = raw as AxiosError<ApiErrorPayload>;

  if (error?.response) {
    const payload = error.response.data;
    if (isErrorPayload(payload)) {
      const code = payload.error.code;
      const mapped = FRIENDLY_MESSAGES[code];
      const backendMessage = payload.error.message;
      const message = mapped || (backendMessage && !isRaw(backendMessage) ? backendMessage : fallbackMessage(error.response.status));
      return {
        code,
        message,
        httpStatus: error.response.status,
        details: payload.error.details,
      };
    }
    return {
      code: TransportCodes.SERVER,
      message: fallbackMessage(error.response.status),
      httpStatus: error.response.status,
    };
  }

  if (error?.code === 'ECONNABORTED') {
    return { code: TransportCodes.TIMEOUT, message: FRIENDLY_MESSAGES[TransportCodes.TIMEOUT] };
  }

  if (error?.request) {
    return { code: TransportCodes.NETWORK, message: FRIENDLY_MESSAGES[TransportCodes.NETWORK] };
  }

  if (raw instanceof Error) {
    const msg = raw.message;
    return {
      code: ErrorCodes.INTERNAL_ERROR,
      message: msg && !isRaw(msg) ? msg : FRIENDLY_MESSAGES[ErrorCodes.INTERNAL_ERROR],
    };
  }

  return { code: ErrorCodes.INTERNAL_ERROR, message: FRIENDLY_MESSAGES[ErrorCodes.INTERNAL_ERROR] };
};

export const FRIENDLY = FRIENDLY_MESSAGES;