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
  createdAt: string;
  updatedAt: string;
}