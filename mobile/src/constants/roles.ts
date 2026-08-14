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