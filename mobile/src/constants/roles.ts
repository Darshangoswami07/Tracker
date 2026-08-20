/** User roles supported by the transport management system. */
export const ROLES = {
  CUSTOMER: 'customer',
  EMPLOYEE: 'employee',
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