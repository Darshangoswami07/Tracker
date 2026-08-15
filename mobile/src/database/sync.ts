import { api } from '../api/client';
import { ENDPOINTS } from '../api/endpoints';
import { orderRepository } from './repositories/orderRepository';

/**
 * Best-effort seeding of the local GR picker lookup tables (companies,
 * drivers, staff) from the control plane. Used to populate pickers while
 * online; the seeded rows are cached on-device and keep the pickers working
 * offline afterwards. Never throws — failures leave the local tables as-is.
 */
export const syncLookupTables = async (accessToken: string | null): Promise<void> => {
  if (!accessToken) return;

  const safeFetch = async <T>(url: string, params: Record<string, unknown>): Promise<T[]> => {
    try {
      const res = await api.get(url, { params });
      return (res.data?.data?.items ?? []) as T[];
    } catch {
      return [];
    }
  };

  const [companies, drivers, staff] = await Promise.all([
    safeFetch<{ id: string; name: string }>(ENDPOINTS.admin.companies, { page_size: 100 }),
    safeFetch<{ id: string; fullName: string }>(ENDPOINTS.admin.drivers, { page_size: 100 }),
    safeFetch<{ id: string; firstName?: string; lastName?: string; email: string }>(ENDPOINTS.admin.users, {
      page_size: 100,
      role: 'employee',
    }),
  ]);

  await Promise.all([
    orderRepository.upsertCompanies(companies),
    orderRepository.upsertDrivers(drivers),
    orderRepository.upsertStaff(
      staff.map((u) => ({ id: u.id, name: `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email }))
    ),
  ]);
};