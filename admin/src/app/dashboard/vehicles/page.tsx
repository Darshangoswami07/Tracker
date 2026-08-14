'use client';

import { useState } from 'react';
import { Truck, RefreshCw, Search, ShieldAlert, Gauge } from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';
import { cn, formatDate } from '@/lib/utils';
import { useVehicles } from '@/hooks';
import { Card, Button, Select, StatusBadge, Skeleton, EmptyState } from '@/components/ui';

const STATUS_OPTIONS = [
  { value: 'All', label: 'All Statuses' },
  { value: 'available', label: 'Available' },
  { value: 'assigned', label: 'Assigned' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'inactive', label: 'Inactive' },
];

const TYPE_LABELS: Record<string, string> = {
  motorcycle: 'Motorcycle',
  sedan: 'Sedan',
  van: 'Van',
  truck: 'Truck',
  pickup: 'Pickup',
};

export default function VehiclesPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('All');
  const [page, setPage] = useState(1);

  const { data, isLoading, error, refetch, isFetching } = useVehicles({
    page,
    pageSize: 20,
    status: status === 'All' ? undefined : status,
    search: search || undefined,
  });

  const vehicles = data?.items || [];
  const total = data?.total || 0;
  const totalPages = data?.pages || 1;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-secondary-900">Vehicle Fleet</h1>
            <p className="text-secondary-500 mt-1">All vehicles across the platform — live backend data.</p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => refetch()} loading={isFetching} leftIcon={<RefreshCw className={cn('w-4 h-4', isFetching && 'animate-spin')} />}>
            Refresh
          </Button>
        </div>

        <Card className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div className="lg:col-span-2 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary-400" />
              <input
                type="text"
                placeholder="Search by plate, make, model, or VIN..."
                className="input pl-10 w-full"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              />
            </div>
            <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} options={STATUS_OPTIONS} />
          </div>
        </Card>

        {isLoading ? (
          <Card><div className="p-6 space-y-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} variant="text" className="w-full h-10" />)}</div></Card>
        ) : error ? (
          <Card className="p-12 text-center">
            <ShieldAlert className="w-12 h-12 text-rose-500 mx-auto mb-3" />
            <h3 className="text-lg font-bold text-secondary-900">Failed to load vehicles</h3>
            <p className="text-sm text-secondary-500 mt-1">{(error as any)?.message}</p>
            <Button variant="primary" size="sm" onClick={() => refetch()} className="mt-4">Retry</Button>
          </Card>
        ) : vehicles.length === 0 ? (
          <EmptyState icon={<Truck className="w-8 h-8" />} title="No vehicles found" description="Try adjusting your search or filters." />
        ) : (
          <>
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-secondary-50">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wide text-secondary-500">Plate</th>
                      <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wide text-secondary-500">Vehicle</th>
                      <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wide text-secondary-500">Type</th>
                      <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wide text-secondary-500">Assigned Driver</th>
                      <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wide text-secondary-500">Company</th>
                      <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wide text-secondary-500">Next Maintenance</th>
                      <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wide text-secondary-500">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-secondary-100">
                    {vehicles.map((v) => (
                      <tr key={v.id} className="hover:bg-secondary-50">
                        <td className="px-4 py-3 font-bold text-secondary-900">{v.licensePlate}</td>
                        <td className="px-4 py-3 text-secondary-700">
                          {[v.make, v.model].filter(Boolean).join(' ') || '—'}
                          {v.year ? ` (${v.year})` : ''}
                        </td>
                        <td className="px-4 py-3 text-secondary-700">{TYPE_LABELS[v.vehicleType] || v.vehicleType}</td>
                        <td className="px-4 py-3 text-secondary-700">{v.driverName || '—'}</td>
                        <td className="px-4 py-3 text-secondary-700">{v.companyName}</td>
                        <td className="px-4 py-3 text-secondary-700">{v.nextMaintenance ? formatDate(v.nextMaintenance) : '—'}</td>
                        <td className="px-4 py-3"><StatusBadge status={v.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            {totalPages > 1 && (
              <div className="flex items-center justify-between text-sm text-secondary-500">
                <span>{total} vehicles</span>
                <div className="flex items-center gap-2">
                  <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</Button>
                  <span>Page {page} of {totalPages}</span>
                  <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Next</Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}