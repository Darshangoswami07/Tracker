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
    userArea: (id: string) => `/admin/users/${id}/area`,
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
      remove: (id: string) => `/admin/orders/${id}`,
      /** Admin-only bulk soft-delete of every GR in scope. Same collection
       * path as `list`/`create` — the HTTP method (`DELETE`) is what makes
       * this "delete all", not a distinct `/all` segment (which would
       * otherwise collide with the `/{id}` detail route). */
      removeAll: '/admin/orders',
      /** Admin-only soft-delete of a specific set of GRs by id (checkbox
       * multi-select on the GR / Shipments list). POST (not DELETE) so the
       * id list travels in a body reliably across clients. */
      bulkDelete: '/admin/orders/bulk-delete',
      track: (grNumber: string) => `/admin/orders/track/${encodeURIComponent(grNumber)}`,
      attachments: (id: string) => `/admin/orders/${id}/attachments`,
      attachmentFile: (id: string, attachmentId: string) => `/admin/orders/${id}/attachments/${attachmentId}/file`,
      consignors: '/admin/orders/meta/consignors',
      statusCounts: '/admin/orders/meta/status-counts',
      activity: '/admin/orders/meta/activity',
      revenueOverview: '/admin/orders/meta/revenue-overview',
      todayCollection: '/admin/orders/meta/today-collection',
      receiving: '/admin/orders/receiving',
      receivingOverview: '/admin/orders/receiving/overview',
      shopsOverview: '/admin/orders/shops/overview',
      shopsCounts: '/admin/orders/shops/counts',
      import: '/admin/orders/import',
      importHistory: '/admin/orders/import-history',
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
  payments: {
    create: '/payments',
    /** Paginated payment history across every GR the caller can see — one
     * request, each row already carries the GR number + consignee (no
     * per-payment follow-up). */
    history: '/payments',
    listByOrder: (orderId: string) => `/payments/order/${orderId}`,
    summary: (orderId: string) => `/payments/summary/${orderId}`,
  },
  /** Staff Daily Collection + Admin Staff Work monitoring (read-only for
   * Admin; STAFF is always scoped to itself server-side). Mobile → FastAPI →
   * Neon; no on-device storage. */
  staffWork: {
    dailyCollection: '/staff/daily-collection',
    dailyWork: '/staff/daily-work',
    dailySummary: '/staff/daily-summary',
    /** Every staff member's daily totals in one grouped query (Payment
     * History "Staff Daily Work" section) — replaces a per-staff N+1. */
    dailySummaryAll: '/staff/daily-summary/all',
    dailyGRs: '/staff/daily-grs',
    settlements: '/staff/settlements',
  },
  customers: {
    list: '/customers',
  },
} as const;