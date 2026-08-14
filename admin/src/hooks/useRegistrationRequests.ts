'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, endpoints } from '@/lib/api/client';
import { RegistrationRequest, RegistrationRequestListResponse } from '@/types/registration';

interface FetchRequestsParams {
  page?: number;
  pageSize?: number;
  status?: string;
  search?: string;
}

export interface RegistrationStats {
  pending: number;
  approvedToday: number;
  rejectedToday: number;
  avgReviewTime: string;
}

async function fetchPendingRequests(params: FetchRequestsParams): Promise<RegistrationRequestListResponse> {
  const searchParams = new URLSearchParams();
  if (params.page) searchParams.set('page', params.page.toString());
  if (params.pageSize) searchParams.set('page_size', params.pageSize.toString());
  if (params.search) searchParams.set('search', params.search);

  const response = await api.get<any>(`${endpoints.admin.pendingRequests}?${searchParams.toString()}`);
  return response.data;
}

async function fetchAllRequests(params: FetchRequestsParams): Promise<RegistrationRequestListResponse> {
  const searchParams = new URLSearchParams();
  if (params.page) searchParams.set('page', params.page.toString());
  if (params.pageSize) searchParams.set('page_size', params.pageSize.toString());
  if (params.status) searchParams.set('status', params.status);
  if (params.search) searchParams.set('search', params.search);

  const response = await api.get<any>(`${endpoints.registrationRequests.list}?${searchParams.toString()}`);
  return response.data;
}

async function fetchApprovalStats(): Promise<RegistrationStats> {
  const response = await api.get<any>(endpoints.admin.stats);
  return response.data;
}

async function approveRequest(id: string): Promise<RegistrationRequest> {
  const response = await api.post<any>(endpoints.admin.approve(id), {});
  return response.data;
}

async function rejectRequest(id: string, reason: string): Promise<RegistrationRequest> {
  const response = await api.post<any>(endpoints.admin.reject(id), { reason });
  return response.data;
}

async function resendOTP(id: string): Promise<void> {
  await api.post(endpoints.registrationRequests.resendOTP(id));
}

export function usePendingRequests(params: FetchRequestsParams) {
  return useQuery({
    queryKey: ['pending-requests', params],
    queryFn: () => fetchPendingRequests(params),
    staleTime: 5000,
  });
}

export function useAllRequests(params: FetchRequestsParams) {
  return useQuery({
    queryKey: ['all-requests', params],
    queryFn: () => fetchAllRequests(params),
    staleTime: 5000,
  });
}

export function useApprovalStats() {
  return useQuery({
    queryKey: ['approval-stats'],
    queryFn: fetchApprovalStats,
    staleTime: 5000,
  });
}

export function useApproveRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => approveRequest(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-requests'] });
      queryClient.invalidateQueries({ queryKey: ['pending-approvals'] });
      queryClient.invalidateQueries({ queryKey: ['all-requests'] });
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['approval-stats'] });
    },
  });
}

export function useRejectRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => rejectRequest(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-requests'] });
      queryClient.invalidateQueries({ queryKey: ['pending-approvals'] });
      queryClient.invalidateQueries({ queryKey: ['all-requests'] });
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['approval-stats'] });
    },
  });
}

export function useResendOTP() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => resendOTP(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-requests'] });
      queryClient.invalidateQueries({ queryKey: ['pending-approvals'] });
      queryClient.invalidateQueries({ queryKey: ['all-requests'] });
    },
  });
}

export function useRequestDetail(id: string) {
  return useQuery({
    queryKey: ['request-detail', id],
    queryFn: async () => {
      const response = await api.get<any>(endpoints.registrationRequests.detail(id));
      return response.data as RegistrationRequest;
    },
    enabled: !!id,
  });
}