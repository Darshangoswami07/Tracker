import type { AxiosResponse } from 'axios';
import type { ApiErrorPayload, ApiSuccess } from '../types/api';

/** Error with a synthetic axios-like response so interceptors can inspect it. */
export class ApiEnvelopeError extends Error {
  readonly response: { status: number; data: ApiErrorPayload };

  constructor(payload: ApiErrorPayload, status: number) {
    super(payload.error?.message ?? 'Request failed');
    this.name = 'ApiEnvelopeError';
    this.response = { status, data: payload };
  }
}

const isErrorPayload = (value: unknown): value is ApiErrorPayload =>
  typeof value === 'object' &&
  value !== null &&
  (value as ApiErrorPayload).success === false &&
  typeof (value as ApiErrorPayload).error === 'object';

/**
 * Unwraps the consistent `{ success, message, data }` envelope returned by the
 * backend. Throws an ApiEnvelopeError carrying the original payload when the
 * request failed, so downstream error mapping stays centralised.
 */
export const unwrap = <T>(response: AxiosResponse<unknown>): T => {
  const payload = response.data as ApiSuccess<T> | ApiErrorPayload;

  if (isErrorPayload(payload)) {
    throw new ApiEnvelopeError(payload, response.status);
  }

  return payload.data as T;
};