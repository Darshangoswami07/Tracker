'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, endpoints } from '@/lib/api/client';
import { GR, GRCreateInput, GRListResponse, GRStatus, OrderAttachment } from '@/types/gr';

interface FetchGRsParams {
  page?: number;
  pageSize?: number;
  status?: string;
  search?: string;
}

async function fetchGRs(params: FetchGRsParams): Promise<GRListResponse> {
  const searchParams = new URLSearchParams();
  if (params.page) searchParams.set('page', params.page.toString());
  if (params.pageSize) searchParams.set('page_size', params.pageSize.toString());
  if (params.status) searchParams.set('status', params.status);
  if (params.search) searchParams.set('search', params.search);

  const response = await api.get<any>(`${endpoints.gr.list}?${searchParams.toString()}`);
  return response.data;
}

async function fetchGRDetail(id: string): Promise<GR> {
  const response = await api.get<any>(endpoints.gr.detail(id));
  return response.data;
}

async function createGR(input: GRCreateInput): Promise<GR> {
  const response = await api.post<any>(endpoints.gr.create, input);
  return response.data;
}

async function updateGRStatus(id: string, status: GRStatus, notes?: string): Promise<GR> {
  const response = await api.patch<any>(endpoints.gr.updateStatus(id), { status, notes });
  return response.data;
}

async function assignDriver(id: string, driverId: string): Promise<GR> {
  const response = await api.post<any>(endpoints.gr.assignDriver(id), { driverId });
  return response.data;
}

async function assignStaff(id: string, staffId: string): Promise<GR> {
  const response = await api.post<any>(endpoints.gr.assignStaff(id), { staffId });
  return response.data;
}

/** Goes through the axios `api` client (not a raw `fetch`) so the upload gets
 * the same auth handling as every other admin request: the request
 * interceptor attaches the bearer token, and the response interceptor
 * transparently refreshes an expired access token and retries once instead
 * of surfacing a 401. Axios detects the FormData body and sets the
 * multipart Content-Type/boundary itself, overriding the client's default
 * JSON header. */
async function uploadSlip(id: string, file: File, fileKind: string = 'generic'): Promise<OrderAttachment> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('fileKind', fileKind);

  const response = await api.post<any>(endpoints.gr.uploadAttachment(id), formData);
  return response.data;
}

export function useGRList(params: FetchGRsParams) {
  return useQuery({
    queryKey: ['gr-list', params],
    queryFn: () => fetchGRs(params),
    staleTime: 5000,
  });
}

export function useGRDetail(id: string | null) {
  return useQuery({
    queryKey: ['gr-detail', id],
    queryFn: () => fetchGRDetail(id as string),
    enabled: !!id,
  });
}

export function useCreateGR() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: GRCreateInput) => createGR(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gr-list'] });
    },
  });
}

export function useUpdateGRStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status, notes }: { id: string; status: GRStatus; notes?: string }) =>
      updateGRStatus(id, status, notes),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['gr-list'] });
      queryClient.invalidateQueries({ queryKey: ['gr-detail', variables.id] });
    },
  });
}

export function useAssignDriver() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, driverId }: { id: string; driverId: string }) => assignDriver(id, driverId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['gr-list'] });
      queryClient.invalidateQueries({ queryKey: ['gr-detail', variables.id] });
    },
  });
}

export function useAssignStaff() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, staffId }: { id: string; staffId: string }) => assignStaff(id, staffId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['gr-list'] });
      queryClient.invalidateQueries({ queryKey: ['gr-detail', variables.id] });
    },
  });
}

export interface CompanyOption {
  id: string;
  name: string;
  status: string;
}

async function fetchCompanies(): Promise<{ items: CompanyOption[] }> {
  const response = await api.get<any>(`${endpoints.admin.companies}?page_size=100`);
  return response.data;
}

export function useCompanies() {
  return useQuery({
    queryKey: ['companies-picker'],
    queryFn: fetchCompanies,
    staleTime: 60000,
  });
}

export interface CompanyInput {
  name: string;
  legalName?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  website?: string;
}

async function createCompany(input: CompanyInput) {
  const response = await api.post<any>(endpoints.admin.companies, input);
  return response.data;
}

async function updateCompany(id: string, input: Partial<CompanyInput> & { status?: string }) {
  const response = await api.patch<any>(`${endpoints.admin.companies}/${id}`, input);
  return response.data;
}

async function deleteCompany(id: string) {
  const response = await api.delete<any>(`${endpoints.admin.companies}/${id}`);
  return response.data;
}

function invalidateCompanyLists(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['admin-companies'] });
  queryClient.invalidateQueries({ queryKey: ['companies-picker'] });
}

export function useCreateCompany() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CompanyInput) => createCompany(input),
    onSuccess: () => invalidateCompanyLists(queryClient),
  });
}

export function useUpdateCompany() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<CompanyInput> & { status?: string } }) =>
      updateCompany(id, input),
    onSuccess: () => invalidateCompanyLists(queryClient),
  });
}

export function useDeleteCompany() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteCompany(id),
    onSuccess: () => invalidateCompanyLists(queryClient),
  });
}

export function useUploadSlip() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, file, fileKind }: { id: string; file: File; fileKind?: string }) =>
      uploadSlip(id, file, fileKind),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['gr-list'] });
      queryClient.invalidateQueries({ queryKey: ['gr-detail', variables.id] });
    },
  });
}
