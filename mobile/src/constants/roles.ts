/** User roles supported by the transport management system. */
export const ROLES = {
  CUSTOMER: 'customer',
  EMPLOYEE: 'employee',
  STAFF: 'staff',
  DRIVER: 'driver',
  DISPATCHER: 'dispatcher',
  BUSINESS: 'business',
  BUSINESS_OWNER: 'business_owner',
  ADMIN: 'admin',
  SUPER_ADMIN: 'super_admin',
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

/** Roles allowed to delete a GR — Admin-tier only, matching the backend's
 * `is_admin` check (see `backend/app/core/rbac.py`: ADMIN/SUPER_ADMIN).
 * Deliberately narrower than the roles that can already reach GR screens
 * (which also include Dispatcher/Staff/Driver via `GRAccessUser`) —
 * Delete must stay Admin-only. Shared by every GR list screen so the rule
 * only needs to be maintained in one place. */
export const canDeleteGR = (role?: string | null): boolean =>
  role === ROLES.ADMIN || role === ROLES.SUPER_ADMIN;

/** Roles allowed to bulk-import GRs from Excel — Admin-tier only, same
 * reasoning/shape as [[canDeleteGR]]. Staff/Dispatcher/Driver never see the
 * Excel Import entry points (Dashboard quick action, Shipments "+" menu),
 * and the screens themselves are only registered in the Admin tab
 * navigator (`AdminTabs.tsx`), not the Staff shell. */
export const canImportExcel = (role?: string | null): boolean =>
  role === ROLES.ADMIN || role === ROLES.SUPER_ADMIN;

/** All four canonical GR reporting statuses (backend `OrderStatus` /
 * `gr_status_service.REPORTING_STATUSES`). */
export const GR_STATUSES = ['pending', 'cleared', 'uncleared', 'delivered'] as const;

/**
 * Workflow statuses `role` is allowed to move a GR *to*, given its current
 * status. Mirrors the backend rule in
 * `gr_status_service.assert_status_transition_allowed` — the backend is the
 * real gate; this only keeps the UI from offering an option the API rejects.
 *
 *  - Staff / Employee: their ONLY workflow step is Pending → Delivered.
 *    A GR that is not Pending is read-only for them.
 *  - Every other GR-access role (Admin / Owner / Dispatcher …): unchanged —
 *    any status, matching the existing admin workflow.
 */
export const allowedGrStatusTargets = (
  role: string | null | undefined,
  currentStatus: string,
): string[] => {
  if (role === ROLES.STAFF || role === ROLES.EMPLOYEE) {
    return currentStatus === 'pending' ? ['delivered'] : [];
  }
  return [...GR_STATUSES];
};