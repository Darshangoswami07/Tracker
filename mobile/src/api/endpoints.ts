/** API endpoint paths relative to the `/api/v1` base URL. */
export const ENDPOINTS = {
  auth: {
    login: '/auth/login',
    logout: '/auth/logout',
    refresh: '/auth/refresh',
  },
  registrationRequests: {
    create: '/registration-requests',
    list: '/registration-requests',
    pending: '/registration-requests/pending',
    detail: (id: string) => `/registration-requests/${id}`,
  },
  admin: {
    pendingRequests: '/admin/registration-requests/pending',
    approve: (id: string) => `/admin/registration-requests/${id}/approve`,
    reject: (id: string) => `/admin/registration-requests/${id}/reject`,
    resendOTP: (id: string) => `/admin/registration-requests/${id}/resend-otp`,
    logs: (id: string) => `/admin/registration-requests/${id}/logs`,
    users: '/admin/users',
    userDetail: (id: string) => `/admin/users/${id}`,
    userStatus: (id: string) => `/admin/users/${id}/status`,
    resendUserOTP: (id: string) => `/admin/users/${id}/resend-otp`,
    approvalLogs: '/admin/approval-logs',
    auditLogs: '/admin/audit-logs',
    /** Driver picker for GR assignment — `/admin/users?role=employee` (Staff
     * picker) reuses the existing `users` entry above with a `role` param. */
    drivers: '/admin/drivers',
    /** Company picker for Create GR — only Super Admin needs this (every
     * other GR-access role always creates under their own company; the
     * backend ignores `companyId` in the payload for them). */
    companies: '/admin/companies',
    /** GR/Shipment management — Super Admin sees every company, every other
     * GR-access role (Admin, Company Admin, Staff, Driver) is scoped to
     * their own company server-side. Mirrors the web Admin GR/Shipments
     * page's `/admin/orders` endpoints (`admin/src/lib/api/client.ts`). */
    orders: {
      create: '/admin/orders',
      list: '/admin/orders',
      detail: (id: string) => `/admin/orders/${id}`,
      updateStatus: (id: string) => `/admin/orders/${id}/status`,
      assignDriver: (id: string) => `/admin/orders/${id}/assign-driver`,
      assignStaff: (id: string) => `/admin/orders/${id}/assign-staff`,
      attachmentFile: (id: string, attachmentId: string) => `/admin/orders/${id}/attachments/${attachmentId}/file`,
    },
  },
  otp: {
    verifyApproval: (requestId: string) => `/otp/verify-approval?request_id=${requestId}`,
    verifyPasswordReset: '/otp/verify-password-reset',
    forgotPassword: '/otp/forgot-password',
    resendApproval: (id: string) => `/otp/resend-approval/${id}`,
    resendPasswordReset: '/otp/resend-password-reset',
  },
  users: {
    me: '/users/me',
  },
  /** Still used by the admin-reused "GR Tracker (Classic)" screen
   * (StaffGRPanelScreen) — role-agnostic server-side for any GR-access role. */
  employee: '/employee',
  notifications: '/notifications',
  orders: {
    detail: (id: string) => `/orders/${id}`,
    track: (grNumber: string) => `/orders/track/${encodeURIComponent(grNumber)}`,
    updateStatus: (id: string) => `/orders/${id}/status`,
    uploadAttachment: (id: string) => `/orders/${id}/attachments`,
    attachmentFile: (id: string, attachmentId: string) => `/orders/${id}/attachments/${attachmentId}/file`,
  },
} as const;