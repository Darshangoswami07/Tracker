'use client';

import { useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { Search, Truck, Star, RefreshCw, ShieldAlert, Plus } from 'lucide-react';
import { cn, formatRelativeTime } from '@/lib/utils';
import { useDrivers, useCreateDriver } from '@/hooks';
import { Card, Button, Select, Input, Modal, StatusBadge, Skeleton, EmptyState, useToast } from '@/components/ui';

const STATUS_OPTIONS = [
  { value: 'All', label: 'All Statuses' },
  { value: 'online', label: 'Online' },
  { value: 'offline', label: 'Offline' },
  { value: 'available', label: 'Available' },
  { value: 'busy', label: 'Busy' },
  { value: 'break', label: 'On Break' },
];

export default function DriversPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('All');
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);

  const { data, isLoading, error, refetch, isFetching } = useDrivers({
    page,
    pageSize: 20,
    status: status === 'All' ? undefined : status,
    search: search || undefined,
  });

  const drivers = data?.items || [];
  const total = data?.total || 0;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-secondary-900">Drivers</h1>
            <p className="text-secondary-500 mt-1">Manage registered drivers — live backend data.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => refetch()} loading={isFetching} leftIcon={<RefreshCw className={cn('w-4 h-4', isFetching && 'animate-spin')} />}>
              Refresh
            </Button>
            <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)} leftIcon={<Plus className="w-4 h-4" />}>
              Create Driver
            </Button>
          </div>
        </div>

        <Card className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary-400" />
              <input
                type="text"
                placeholder="Search by license number..."
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
            <h3 className="text-lg font-bold text-secondary-900">Failed to load drivers</h3>
            <p className="text-sm text-secondary-500 mt-1">{(error as any)?.message}</p>
            <Button variant="primary" size="sm" onClick={() => refetch()} className="mt-4">Retry</Button>
          </Card>
        ) : drivers.length === 0 ? (
          <EmptyState icon={<Truck className="w-8 h-8" />} title="No drivers found" description="Try adjusting your search or filters." />
        ) : (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-secondary-50">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-500 uppercase tracking-wider">Name</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-500 uppercase tracking-wider">Contact</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-500 uppercase tracking-wider">License</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-500 uppercase tracking-wider">Rating</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-500 uppercase tracking-wider">Deliveries</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-500 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-500 uppercase tracking-wider">Joined</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-secondary-200">
                  {drivers.map((driver) => (
                    <tr key={driver.id} className="hover:bg-secondary-50">
                      <td className="px-4 py-4 font-medium text-secondary-900">{driver.fullName}</td>
                      <td className="px-4 py-4 text-sm text-secondary-600">
                        <div>{driver.email || '—'}</div>
                        <div className="text-xs text-secondary-400">{driver.phone || '—'}</div>
                      </td>
                      <td className="px-4 py-4 text-sm text-secondary-600 font-mono">{driver.licenseNumber || '—'}</td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-1 text-sm text-secondary-700">
                          <Star className="w-3.5 h-3.5 text-amber-500" /> {driver.rating.toFixed(1)}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-sm text-secondary-600">{driver.totalDeliveries}</td>
                      <td className="px-4 py-4"><StatusBadge status={driver.status} /></td>
                      <td className="px-4 py-4 text-sm text-secondary-600">{formatRelativeTime(driver.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="p-4 border-t border-secondary-200 flex items-center justify-between text-sm text-secondary-500">
              <div>Showing <span className="font-bold text-secondary-800">{drivers.length}</span> of <span className="font-bold text-secondary-800">{total}</span> drivers</div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                <Button variant="ghost" size="sm" disabled={drivers.length < 20} onClick={() => setPage((p) => p + 1)}>Next</Button>
              </div>
            </div>
          </Card>
        )}
      </div>

      <CreateDriverModal isOpen={createOpen} onClose={() => setCreateOpen(false)} />
    </DashboardLayout>
  );
}

function CreateDriverModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { showToast } = useToast();
  const createDriver = useCreateDriver();
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '', password: '', licenseNumber: '' });

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const canSubmit =
    form.firstName.trim() && form.lastName.trim() && form.email.trim() && form.phone.trim() && form.password.length >= 8;

  const reset = () => setForm({ firstName: '', lastName: '', email: '', phone: '', password: '', licenseNumber: '' });

  const handleSubmit = async () => {
    try {
      await createDriver.mutateAsync({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        password: form.password,
        licenseNumber: form.licenseNumber.trim() || undefined,
      });
      showToast({ title: 'Driver account created.', type: 'success' });
      reset();
      onClose();
    } catch (err: any) {
      showToast({ title: err?.message || 'Failed to create driver account.', type: 'error' });
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create Driver" size="md">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Input label="First Name" value={form.firstName} onChange={set('firstName')} placeholder="Jane" />
          <Input label="Last Name" value={form.lastName} onChange={set('lastName')} placeholder="Doe" />
        </div>
        <Input label="Email" type="email" value={form.email} onChange={set('email')} placeholder="jane@company.com" />
        <Input label="Phone" value={form.phone} onChange={set('phone')} placeholder="+91 98765 43210" />
        <Input label="License Number" value={form.licenseNumber} onChange={set('licenseNumber')} placeholder="DL-1234567890" />
        <Input label="Password" type="password" value={form.password} onChange={set('password')} placeholder="At least 8 characters" />
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!canSubmit} loading={createDriver.isPending} onClick={handleSubmit}>
            Create Driver
          </Button>
        </div>
      </div>
    </Modal>
  );
}
