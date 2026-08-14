export interface RegistrationRequest {
  id: string;
  firstName: string;
  lastName: string;
  companyName: string;
  email: string;
  phone: string;
  requestedRole:
    | 'super_admin'
    | 'admin'
    | 'dispatcher'
    | 'business'
    | 'business_owner'
    | 'employee'
    | 'driver'
    | 'customer';
  status: 'pending' | 'approved_pending_otp' | 'completed' | 'rejected' | 'active' | 'suspended';
  isVerified: boolean;
  isApproved: boolean;
  isActive: boolean;
  otpVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RegistrationRequestListResponse {
  items: RegistrationRequest[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}

export interface ApproveRequest {
  // Empty for now
}

export interface RejectRequest {
  reason: string;
}

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role:
    | 'super_admin'
    | 'admin'
    | 'dispatcher'
    | 'business'
    | 'business_owner'
    | 'employee'
    | 'driver'
    | 'customer';
  status: 'pending' | 'approved_pending_otp' | 'completed' | 'rejected' | 'active' | 'suspended';
  isVerified: boolean;
  isApproved: boolean;
  isActive: boolean;
  otpVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UserListResponse {
  items: User[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message: string;
  code?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}