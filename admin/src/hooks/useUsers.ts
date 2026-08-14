'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, endpoints } from '@/lib/api/client';

export interface AdminUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: string;
  status: string;
  isVerified: boolean;
  isApproved: boolean;
  isActive: boolean;
  otpVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

interface FetchUsersParams {
  page?: number;
  pageSize?: number;
  status?: string;
  role?: string;
  search?: string;
}

async function fetchUsers(params: FetchUsersParams) {
  const searchParams = new URLSearchParams();
  if (params.page) searchParams.set('page', params.page.toString());
  if (params.pageSize) searchParams.set('page_size', params.pageSize.toString());
  if (params.status) searchParams.set('status', params.status);
  if (params.role) searchParams.set('role', params.role);
  if (params.search) searchParams.set('search', params.search);

  const response = await api.get<any>(`/admin/users?${searchParams.toString()}`);
  return response.data as { items: AdminUser[]; total: number; page: number; pageSize: number; pages: number };
}

async function updateUserStatus(userId: string, status: string, reason?: string) {
  const response = await api.patch<any>(`/admin/users/${userId}/status`, { status, reason });
  return response.data;
}

async function deleteUser(userId: string) {
  const response = await api.delete<any>(`/admin/users/${userId}`);
  return response.data;
}

export function useUsers(params: FetchUsersParams) {
  return useQuery({
    queryKey: ['admin-users', params],
    queryFn: () => fetchUsers(params),
    staleTime: 5000,
  });
}

export function useUpdateUserStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, status, reason }: { userId: string; status: string; reason?: string }) =>
      updateUserStatus(userId, status, reason),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-users'] }),
  });
}

export function useDeleteUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => deleteUser(userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-users'] }),
  });
}

// --------------------------------------------------------------------------- //
// Drivers
// --------------------------------------------------------------------------- //
export interface AdminDriver {
  id: string;
  userId: string | null;
  fullName: string;
  email: string | null;
  phone: string | null;
  companyId: string | null;
  licenseNumber: string | null;
  rating: number;
  totalDeliveries: number;
  status: string;
  isActive: boolean;
  createdAt: string;
}

interface FetchDriversParams {
  page?: number;
  pageSize?: number;
  status?: string;
  search?: string;
}

async function fetchDrivers(params: FetchDriversParams) {
  const searchParams = new URLSearchParams();
  if (params.page) searchParams.set('page', params.page.toString());
  if (params.pageSize) searchParams.set('page_size', params.pageSize.toString());
  if (params.status) searchParams.set('status', params.status);
  if (params.search) searchParams.set('search', params.search);

  const response = await api.get<any>(`/admin/drivers?${searchParams.toString()}`);
  return response.data as { items: AdminDriver[]; total: number; page: number; pageSize: number; pages: number };
}

export function useDrivers(params: FetchDriversParams) {
  return useQuery({
    queryKey: ['admin-drivers', params],
    queryFn: () => fetchDrivers(params),
    staleTime: 5000,
  });
}

export interface CreateDriverPayload {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  password: string;
  licenseNumber?: string;
  // Only honoured by the backend for a Super Admin caller — a Company Admin
  // always gets the driver created under their own company.
  companyId?: string;
}

async function createDriver(payload: CreateDriverPayload) {
  const response = await api.post<any>(endpoints.admin.createDriver, payload);
  return response.data;
}

export function useCreateDriver() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateDriverPayload) => createDriver(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-drivers'] }),
  });
}

// --------------------------------------------------------------------------- //
// Vehicles
// --------------------------------------------------------------------------- //
export interface AdminVehicle {
  id: string;
  licensePlate: string;
  vehicleType: string;
  make: string | null;
  model: string | null;
  year: number | null;
  status: string;
  companyName: string;
  driverName: string | null;
  fuelLevel: number;
  lastMaintenance: string | null;
  nextMaintenance: string | null;
}

interface FetchVehiclesParams {
  page?: number;
  pageSize?: number;
  status?: string;
  search?: string;
}

async function fetchVehicles(params: FetchVehiclesParams) {
  const searchParams = new URLSearchParams();
  if (params.page) searchParams.set('page', params.page.toString());
  if (params.pageSize) searchParams.set('page_size', params.pageSize.toString());
  if (params.status) searchParams.set('status', params.status);
  if (params.search) searchParams.set('search', params.search);

  const response = await api.get<any>(`/admin/vehicles?${searchParams.toString()}`);
  return response.data as { items: AdminVehicle[]; total: number; page: number; pageSize: number; pages: number };
}

export function useVehicles(params: FetchVehiclesParams) {
  return useQuery({
    queryKey: ['admin-vehicles', params],
    queryFn: () => fetchVehicles(params),
    staleTime: 5000,
  });
}
