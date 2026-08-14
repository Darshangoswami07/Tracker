import axios, { AxiosError, AxiosInstance, AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios';
import { getAuthToken, getRefreshToken, removeAuthToken, setAuthToken, setRefreshToken } from '../auth';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

class ApiClient {
  private client: AxiosInstance;
  private refreshTokenPromise: Promise<string> | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      // No default Content-Type here: axios already sets
      // 'application/json' itself for plain object payloads. A blanket
      // instance-level default would instead make axios JSON-stringify
      // FormData bodies (its transformRequest treats a pre-existing JSON
      // content type as "serialize this"), which silently breaks every
      // multipart upload — e.g. the slip/document upload endpoint.
      timeout: 30000,
    });

    this.setupInterceptors();
  }

  private setupInterceptors() {
    // Request interceptor
    this.client.interceptors.request.use(
      (config: InternalAxiosRequestConfig) => {
        const token = getAuthToken();
        if (token && config.headers) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const originalRequest = error.config as AxiosRequestConfig & { _retry?: boolean };

        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;

          try {
            const newToken = await this.refreshAccessToken();
            if (originalRequest.headers) {
              originalRequest.headers.Authorization = `Bearer ${newToken}`;
            }
            return this.client(originalRequest);
          } catch (refreshError) {
            removeAuthToken();
            if (typeof window !== 'undefined') {
              window.location.href = '/login';
            }
            return Promise.reject(refreshError);
          }
        }

        return Promise.reject(this.formatError(error));
      }
    );
  }

  private async refreshAccessToken(): Promise<string> {
    if (this.refreshTokenPromise) {
      return this.refreshTokenPromise;
    }

    this.refreshTokenPromise = (async () => {
      try {
        const refreshToken = getRefreshToken();
        if (!refreshToken) {
          throw new Error('No refresh token available');
        }
        const response = await axios.post(`${API_BASE_URL}/auth/refresh`, {
          refreshToken,
        });
        const { tokens } = response.data.data;
        setAuthToken(tokens.accessToken);
        setRefreshToken(tokens.refreshToken);
        return tokens.accessToken as string;
      } finally {
        this.refreshTokenPromise = null;
      }
    })();

    return this.refreshTokenPromise;
  }

  private formatError(error: AxiosError) {
    if (error.response?.data) {
      const data = error.response.data as any;
      const envelope = data?.error ?? data;

      const code: string = envelope?.code || 'ERROR';
      const message: string = this.toErrorMessage(code, envelope?.message, error.response.status);

      return {
        message,
        code,
        status: error.response.status,
        details: envelope?.details,
      };
    }

    if (error.message === 'Network Error') {
      return {
        message: 'Unable to connect to server. Please check your connection.',
        code: 'NETWORK_ERROR',
        status: 0,
      };
    }

    if (error.code === 'ECONNABORTED') {
      return {
        message: 'Request timed out. Please try again.',
        code: 'TIMEOUT',
        status: 408,
      };
    }

    return {
      message: 'An unexpected error occurred. Please try again.',
      code: 'UNKNOWN_ERROR',
      status: error.response?.status || 500,
    };
  }

  /**
   * Maps a backend error code to a friendly, actionable message. Falls back to
   * the backend-provided message when it is safe (not a raw HTTP/axios string),
   * otherwise returns a generic friendly message.
   */
  private toErrorMessage(code: string, backendMessage?: string, status?: number) {
    const friendly: Record<string, string> = {
      invalid_credentials: 'Invalid email or password.',
      user_not_found: 'No account found with this email address.',
      email_already_registered: 'An account already exists with this email. Please sign in instead.',
      phone_already_registered: 'An account already exists with this phone number.',
      user_inactive: 'Your account is waiting for administrator approval.',
      user_not_approved: 'Your registration request was rejected. You may submit a new application.',
      user_not_verified:
        'Your account has been approved. Please check your email for the verification code.',
      token_expired: 'Your session has expired. Please sign in again.',
      token_invalid: 'Your session is no longer valid. Please sign in again.',
      reset_token_invalid: 'This reset link is invalid or has expired. Please request a new one.',
      unauthorized: 'You are not authorized to perform this action.',
      forbidden: 'You do not have permission to perform this action.',
      not_found: 'The requested item could not be found.',
      validation_error: 'Please review the highlighted fields and try again.',
      rate_limited: 'Too many attempts. Please try again in a minute.',
      otp_expired: 'Verification code expired. A new code has been sent to your email.',
      otp_invalid: 'Invalid verification code. Please try again.',
      otp_max_attempts:
        'Too many incorrect attempts. A new verification code has been sent to your email.',
      email_send_failed: "We couldn't send the verification email. Please try again.",
      already_approved: 'This registration request has already been approved.',
      registration_request_exists:
        'Your registration request is already under review. Please wait for admin approval.',
      registration_state_conflict:
        'This registration request cannot be processed in its current state. Please try again.',
      internal_error: 'Something went wrong. Please try again in a few moments.',
    };

    const mapped = friendly[code];
    if (mapped) return mapped;

    const rawMarkers = /(Request failed with status code|AxiosError|Network Error|Internal Server Error|ValidationError|Traceback)/i;
    if (backendMessage && !rawMarkers.test(backendMessage)) return backendMessage;

    return (status ?? 0) >= 500
      ? 'The server is unavailable. Please try again later.'
      : 'An unexpected error occurred. Please try again.';
  }

  async get<T>(url: string, config?: AxiosRequestConfig) {
    const response = await this.client.get<T>(url, config);
    return response.data;
  }

  async post<T>(url: string, data?: any, config?: AxiosRequestConfig) {
    const response = await this.client.post<T>(url, data, config);
    return response.data;
  }

  async put<T>(url: string, data?: any, config?: AxiosRequestConfig) {
    const response = await this.client.put<T>(url, data, config);
    return response.data;
  }

  async patch<T>(url: string, data?: any, config?: AxiosRequestConfig) {
    const response = await this.client.patch<T>(url, data, config);
    return response.data;
  }

  async delete<T>(url: string, config?: AxiosRequestConfig) {
    const response = await this.client.delete<T>(url, config);
    return response.data;
  }
}

export const api = new ApiClient();

export const endpoints = {
  auth: {
    login: '/auth/login',
    logout: '/auth/logout',
    refresh: '/auth/refresh',
    me: '/users/me',
  },
  registrationRequests: {
    list: '/registration-requests',
    pending: '/registration-requests/pending',
    detail: (id: string) => `/registration-requests/${id}`,
    approve: (id: string) => `/registration-requests/${id}/approve`,
    reject: (id: string) => `/registration-requests/${id}/reject`,
    resendOTP: (id: string) => `/registration-requests/${id}/resend-otp`,
  },
  admin: {
    pendingRequests: '/admin/registration-requests/pending',
    stats: '/admin/registration-requests/stats',
    approve: (id: string) => `/admin/registration-requests/${id}/approve`,
    reject: (id: string) => `/admin/registration-requests/${id}/reject`,
    users: '/admin/users',
    userDetail: (id: string) => `/admin/users/${id}`,
    userStatus: (id: string) => `/admin/users/${id}/status`,
    resendUserOTP: (id: string) => `/admin/users/${id}/resend-otp`,
    drivers: '/admin/drivers',
    createStaff: '/admin/staff',
    createDriver: '/admin/drivers',
    companies: '/admin/companies',
    approvalLogs: '/admin/approval-logs',
    auditLogs: '/admin/audit-logs',
    auditLogDetail: (id: string) => `/admin/audit-logs/${id}`,
  },
  gr: {
    list: '/admin/orders',
    create: '/admin/orders',
    detail: (id: string) => `/admin/orders/${id}`,
    update: (id: string) => `/admin/orders/${id}`,
    updateStatus: (id: string) => `/admin/orders/${id}/status`,
    assignDriver: (id: string) => `/admin/orders/${id}/assign-driver`,
    assignStaff: (id: string) => `/admin/orders/${id}/assign-staff`,
    uploadAttachment: (id: string) => `/admin/orders/${id}/attachments`,
    attachments: (id: string) => `/admin/orders/${id}/attachments`,
    attachmentFile: (id: string, attachmentId: string) => `/admin/orders/${id}/attachments/${attachmentId}/file`,
    track: (grNumber: string) => `/orders/track/${encodeURIComponent(grNumber)}`,
  },
  // Shared (non-Admin-tier) GR endpoints — reachable by Staff/Driver/Admin,
  // unlike the `/admin/orders/*` set above which requires true AdminUser.
  // Used by the `/tracker` Staff Panel so Staff/Driver web logins actually
  // get data back instead of a 403 from the admin-only endpoints.
  sharedOrders: {
    list: '/employee/orders',
    updateStatus: (id: string) => `/orders/${id}/status`,
    uploadAttachment: (id: string) => `/orders/${id}/attachments`,
  },
  otp: {
    verifyApproval: (requestId: string) => `/otp/verify-approval?request_id=${requestId}`,
    verifyPasswordReset: '/otp/verify-password-reset',
    forgotPassword: '/otp/forgot-password',
    resendApproval: (id: string) => `/otp/resend-approval/${id}`,
    resendPasswordReset: '/otp/resend-password-reset',
  },
} as const;

export type ApiError = {
  message: string;
  code: string;
  status: number;
  details?: any;
};