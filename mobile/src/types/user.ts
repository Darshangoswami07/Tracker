import { Role } from '../constants/roles';

/** Public representation of an authenticated user exposed by the API. */
export interface User {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  role: Role;
  profileImage: string | null;
  isActive: boolean;
  /** Assigned operational area (staff users only). Null for admin/owner roles. */
  area: string | null;
  createdAt: string;
  updatedAt: string;
}