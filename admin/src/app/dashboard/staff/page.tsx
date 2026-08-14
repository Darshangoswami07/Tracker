'use client';

import { useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { Search, RefreshCw, Ban, CheckCircle2, ShieldAlert, UserCog, Plus } from 'lucide-react';
import { cn, formatRelativeTime } from '@/lib/utils';
import { useStaffUsers, useUpdateStaffStatus, useCreateStaff } from '@/hooks';
import { Card, Button, Select, Input, Modal, StatusBadge, useToast, Skeleton, EmptyState, ConfirmDialog } from '@/components/ui';

const STATUS_OPTIONS = [
  { value: 'All', label: 'All Statuses' },
  { value: 'active', label: 'Active' },
  { value: 'pending', label: 'Pending' },
  { value: 'suspended', label: 'Removed / Suspended' },
  { value: 'rejected', label: 'Rejected' },
];

export default function StaffManagementPage() {
  const { showToast } = useToast();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('All');
  const [page, setPage] = useState(1);
  const [removeTarget, setRemoveTarget] = useState<{ id: string; name: string } | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const { data, isLoading, error, refetch, isFetching } = useStaffUsers({
    page,
    pageSize: 20,
    status: status === 'All' ? undefined : status,
    search: search || undefined,
  });
  const updateStatus = useUpdateStaffStatus();

  const staff = data?.items || [];
  const total = data?.total || 0;

  const handleReactivate = async (userId: string) => {
    try {
      await updateStatus.mutateAsync({ userId, status: 'active' });
      showToast({ title: 'Staff member reactivated.', type: 'success' });
    } catch (err: any) {
      showToast({ title: err?.message || 'Failed to reactivate staff member.', type: 'error' });
    }
  };

  const handleRemove = async () => {
    if (!removeTarget) return;
    try {
      await updateStatus.mutateAsync({ userId: removeTarget.id, status: 'suspended' });
      showToast({ title: 'Staff member removed.', type: 'success' });
      setRemoveTarget(null);
    } catch (err: any) {
      showToast({ title: err?.message || 'Failed to remove staff member.', type: 'error' });
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-secondary-900">Staff Management</h1>
            <p className="text-secondary-500 mt-1">
              View approved Staff, reactivate removed accounts, or remove active ones.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => refetch()}
              loading={isFetching}
              leftIcon={<RefreshCw className={cn('w-4 h-4', isFetching && 'animate-spin')} />}
            >
              Refresh
            </Button>
            <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)} leftIcon={<Plus className="w-4 h-4" />}>
              Create Staff
            </Button>
          </div>
        </div>

        <Card className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="lg:col-span-2 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary-400" />
              <input
                type="text"
                placeholder="Search Staff by name, email, or phone..."
                className="input pl-10 w-full"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <Select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
              options={STATUS_OPTIONS}
            />
          </div>
        </Card>

        {isLoading ? (
          <Card>
            <div className="p-6 space-y-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} variant="text" className="w-full h-10" />
              ))}
            </div>
          </Card>
        ) : error ? (
          <Card className="p-12 text-center">
            <ShieldAlert className="w-12 h-12 text-rose-500 mx-auto mb-3" />
            <h3 className="text-lg font-bold text-secondary-900">Failed to load Staff</h3>
            <p className="text-sm text-secondary-500 mt-1">{(error as any)?.message}</p>
            <Button variant="primary" size="sm" onClick={() => refetch()} className="mt-4">
              Retry
            </Button>
          </Card>
        ) : staff.length === 0 ? (
          <EmptyState
            icon={<UserCog className="w-8 h-8" />}
            title="No Staff found"
            description="Approved Staff accounts will appear here once you approve a pending request."
          />
        ) : (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-secondary-50">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-500 uppercase tracking-wider">Name</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-500 uppercase tracking-wider">Email</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-500 uppercase tracking-wider">Phone</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-500 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-500 uppercase tracking-wider">Joined</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-secondary-200">
                  {staff.map((member) => (
                    <tr key={member.id} className="hover:bg-secondary-50">
                      <td className="px-4 py-4 font-medium text-secondary-900">
                        {member.firstName} {member.lastName}
                      </td>
                      <td className="px-4 py-4 text-sm text-secondary-600">{member.email}</td>
                      <td className="px-4 py-4 text-sm text-secondary-600">{member.phone}</td>
                      <td className="px-4 py-4"><StatusBadge status={member.status} /></td>
                      <td className="px-4 py-4 text-sm text-secondary-600">{formatRelativeTime(member.createdAt)}</td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          {member.status !== 'active' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Reactivate"
                              onClick={() => handleReactivate(member.id)}
                            >
                              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            </Button>
                          )}
                          {member.status === 'active' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Remove"
                              onClick={() =>
                                setRemoveTarget({ id: member.id, name: `${member.firstName} ${member.lastName}` })
                              }
                            >
                              <Ban className="w-4 h-4 text-rose-600" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="p-4 border-t border-secondary-200 flex items-center justify-between text-sm text-secondary-500">
              <div>
                Showing <span className="font-bold text-secondary-800">{staff.length}</span> of{' '}
                <span className="font-bold text-secondary-800">{total}</span> Staff members
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </Button>
                <Button variant="ghost" size="sm" disabled={staff.length < 20} onClick={() => setPage((p) => p + 1)}>
                  Next
                </Button>
              </div>
            </div>
          </Card>
        )}
      </div>

      <ConfirmDialog
        isOpen={!!removeTarget}
        onClose={() => setRemoveTarget(null)}
        onConfirm={handleRemove}
        title="Remove Staff Member?"
        message={`Remove ${removeTarget?.name}? They will not be able to sign in until reactivated.`}
        confirmText="Remove"
        variant="danger"
        loading={updateStatus.isPending}
      />

      <CreateStaffModal isOpen={createOpen} onClose={() => setCreateOpen(false)} />
    </DashboardLayout>
  );
}

function CreateStaffModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { showToast } = useToast();
  const createStaff = useCreateStaff();
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '', password: '' });

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const canSubmit =
    form.firstName.trim() && form.lastName.trim() && form.email.trim() && form.phone.trim() && form.password.length >= 8;

  const reset = () => setForm({ firstName: '', lastName: '', email: '', phone: '', password: '' });

  const handleSubmit = async () => {
    try {
      await createStaff.mutateAsync({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        password: form.password,
      });
      showToast({ title: 'Staff account created.', type: 'success' });
      reset();
      onClose();
    } catch (err: any) {
      showToast({ title: err?.message || 'Failed to create Staff account.', type: 'error' });
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create Staff" size="md">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Input label="First Name" value={form.firstName} onChange={set('firstName')} placeholder="Jane" />
          <Input label="Last Name" value={form.lastName} onChange={set('lastName')} placeholder="Doe" />
        </div>
        <Input label="Email" type="email" value={form.email} onChange={set('email')} placeholder="jane@company.com" />
        <Input label="Phone" value={form.phone} onChange={set('phone')} placeholder="+91 98765 43210" />
        <Input label="Password" type="password" value={form.password} onChange={set('password')} placeholder="At least 8 characters" />
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!canSubmit} loading={createStaff.isPending} onClick={handleSubmit}>
            Create Staff
          </Button>
        </div>
      </div>
    </Modal>
  );
}
