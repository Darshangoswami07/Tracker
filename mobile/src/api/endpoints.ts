/** API endpoint paths relative to the `/api/v1` base URL. */
export const ENDPOINTS = {
  auth: {
    login: '/auth/login',
    logout: '/auth/logout',
    refresh: '/auth/refresh',
    /** Separate Staff/Admin self-service portals — each only ever
     * authenticates its own role server-side (see `backend/app/api/v1/staff.py`). */
    staffRegister: '/auth/staff/register',
    staffLogin: '/auth/staff/login',
    adminLogin: '/auth/admin/login',
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
    /** Staff Approvals — separate from `pendingRequests` above (the
     * OTP/registration-request queue): the self-service Staff portal, no
     * OTP/email, available to a plain Admin (not Super-Admin-only). */
    staffApprovals: {
      list: '/admin/staff-approvals',
      approve: (id: string) => `/admin/staff-approvals/${id}/approve`,
      reject: (id: string) => `/admin/staff-approvals/${id}/reject`,
    },
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
      update: (id: string) => `/admin/orders/${id}`,
      updateStatus: (id: string) => `/admin/orders/${id}/status`,
      assignDriver: (id: string) => `/admin/orders/${id}/assign-driver`,
      assignStaff: (id: string) => `/admin/orders/${id}/assign-staff`,
      attachmentFile: (id: string, attachmentId: string) => `/admin/orders/${id}/attachments/${attachmentId}/file`,
      /** Transient OCR extraction of a transport slip image. Only the image
       * travels to the server; extracted fields are returned to the device
       * and saved locally. */
      ocrExtract: '/admin/orders/ocr-extract',
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
  /** Device binding / license (control plane). Mobile registers the physical
   * device after activation to receive its license key; business data never
   * touches these. */
  devices: {
    register: '/devices/register',
    heartbeat: '/devices/heartbeat',
    status: '/devices/status',
    list: '/devices/',
    revoke: '/devices/revoke',
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
  payments: {
    create: '/payments',
    listByOrder: (orderId: string) => `/payments/order/${orderId}`,
    summary: (orderId: string) => `/payments/summary/${orderId}`,
  },
  customers: {
    list: '/customers',
  },
} as const;