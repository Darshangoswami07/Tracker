import { ErrorCode } from '../constants/errorCodes';

/**
 * Consistent envelope used by the backend for every response.
 * `data` is omitted for operations without a payload.
 */
export interface ApiSuccess<T> {
  success: true;
  message: string;
  data: T | null;
}

/** Envelope of an API failure, regardless of HTTP status. */
export interface ApiErrorPayload {
  success: false;
  error: {
    code: ErrorCode | string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiErrorPayload;

/** Error codes related to transport/network failures on the client. */
export const TransportCodes = {
  NETWORK: 'network_failure',
  TIMEOUT: 'request_timeout',
  SERVER: 'server_error',
  CANCELED: 'request_canceled',
} as const;

/** Normalised error used across the UI (from API or client). */
export interface AppError {
  code: string;
  message: string;
  httpStatus?: number;
  details?: Record<string, unknown>;
}

/** Form field-level validation errors returned by the server. */
export interface FieldErrors {
  [field: string]: string;
}