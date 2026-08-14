'use client';

/**
 * Admin -> Staff workflow hooks.
 *
 * These call the SAME generic backend endpoints the existing Super Admin
 * "Pending Approvals" / "Users" pages use (registration-requests + admin
 * users), just pre-filtered to role=employee ("Staff") and exposed under
 * their own query keys so this page's caching/invalidation never touches
 * the existing Super Admin pages' hooks (useRegistrationRequests.ts /
 * useUsers.ts are left completely untouched).
 *
 * Backend already restricts what a plain ADMIN can approve/reject/manage
 * (see approval_service.ADMIN_APPROVABLE_ROLES and rbac.can_manage) — this
 * file is UI-only convenience on top of that existing enforcement.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, endpoints } from '@/lib/api/client';
import { RegistrationRequest, RegistrationRequestListResponse } from '@/types/registration';
import { AdminUser } from './useUsers';

const STAFF_ROLE = 'employee';

interface FetchStaffRequestsParams {
  page?: number;
  pageSize?: number;
  search?: string;
}

async function fetchPendingStaffRequests(
  params: FetchStaffRequestsParams
): Promise<RegistrationRequestListResponse> {
  const searchParams = new URLSearchParams();
  if (params.page) searchParams.set('page', params.page.toString());
  if (params.pageSize) searchParams.set('page_size', params.pageSize.toString());
  if (params.search) searchParams.set('search', params.search);
  searchParams.set('role', STAFF_ROLE);

  const response = await api.get<any>(`${endpoints.admin.pendingRequests}?${searchParams.toString()}`);
  return response.data;
}

export function usePendingStaffRequests(params: FetchStaffRequestsParams) {
  return useQuery({
    queryKey: ['staff-pending-requests', params],
    queryFn: () => fetchPendingStaffRequests(params),
    staleTime: 5000,
  });
}

async function approveStaffRequest(id: string): Promise<RegistrationRequest> {
  const response = await api.post<any>(endpoints.admin.approve(id), {});
  return response.data;
}

async function rejectStaffRequest(id: string, reason: string): Promise<RegistrationRequest> {
  const response = await api.post<any>(endpoints.admin.reject(id), { reason });
  return response.data;
}

function invalidateStaffAndSharedQueries(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['staff-pending-requests'] });
  queryClient.invalidateQueries({ queryKey: ['staff-users'] });
  // Keep the existing Super Admin "Pending Approvals" / "Users" pages fresh
  // too, since they read the same underlying rows.
  queryClient.invalidateQueries({ queryKey: ['pending-requests'] });
  queryClient.invalidateQueries({ queryKey: ['all-requests'] });
  queryClient.invalidateQueries({ queryKey: ['approval-stats'] });
  queryClient.invalidateQueries({ queryKey: ['admin-users'] });
}

export function useApproveStaffRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => approveStaffRequest(id),
    onSuccess: () => invalidateStaffAndSharedQueries(queryClient),
  });
}

export function useRejectStaffRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => rejectStaffRequest(id, reason),
    onSuccess: () => invalidateStaffAndSharedQueries(queryClient),
  });
}

interface FetchStaffUsersParams {
  page?: number;
  pageSize?: number;
  status?: string;
  search?: string;
}

async function fetchStaffUsers(params: FetchStaffUsersParams) {
  const searchParams = new URLSearchParams();
  if (params.page) searchParams.set('page', params.page.toString());
  if (params.pageSize) searchParams.set('page_size', params.pageSize.toString());
  if (params.status) searchParams.set('status', params.status);
  if (params.search) searchParams.set('search', params.search);
  searchParams.set('role', STAFF_ROLE);

  const response = await api.get<any>(`${endpoints.admin.users}?${searchParams.toString()}`);
  return response.data as { items: AdminUser[]; total: number; page: number; pageSize: number; pages: number };
}

export function useStaffUsers(params: FetchStaffUsersParams) {
  return useQuery({
    queryKey: ['staff-users', params],
    queryFn: () => fetchStaffUsers(params),
    staleTime: 5000,
  });
}

async function updateStaffStatus(userId: string, status: string, reason?: string) {
  const response = await api.patch<any>(endpoints.admin.userStatus(userId), { status, reason });
  return response.data;
}

export function useUpdateStaffStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, status, reason }: { userId: string; status: string; reason?: string }) =>
      updateStaffStatus(userId, status, reason),
    onSuccess: () => invalidateStaffAndSharedQueries(queryClient),
  });
}

export interface CreateStaffPayload {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  password: string;
  // Only honoured by the backend for a Super Admin caller — a Company Admin
  // always gets the account created under their own company regardless of
  // what (if anything) is sent here.
  companyId?: string;
}

async function createStaff(payload: CreateStaffPayload) {
  const response = await api.post<any>(endpoints.admin.createStaff, payload);
  return response.data as AdminUser;
}

export function useCreateStaff() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateStaffPayload) => createStaff(payload),
    onSuccess: () => invalidateStaffAndSharedQueries(queryClient),
  });
}
