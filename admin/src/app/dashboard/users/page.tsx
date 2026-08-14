'use client';

import { useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { Search, Shield, User, Truck, RefreshCw, Ban, CheckCircle2, ShieldAlert } from 'lucide-react';
import { cn, formatRelativeTime } from '@/lib/utils';
import { useUsers, useUpdateUserStatus } from '@/hooks';
import { Card, Button, Select, StatusBadge, useToast, Skeleton, EmptyState, ConfirmDialog } from '@/components/ui';

const ROLE_OPTIONS = [
  { value: 'All', label: 'All Roles' },
  { value: 'super_admin', label: 'Super Admin' },
  { value: 'admin', label: 'Admin' },
  { value: 'business_owner', label: 'Business Owner' },
  { value: 'business', label: 'Business' },
  { value: 'dispatcher', label: 'Dispatcher' },
  { value: 'driver', label: 'Driver' },
  { value: 'employee', label: 'Employee' },
  { value: 'customer', label: 'Customer' },
];

const STATUS_OPTIONS = [
  { value: 'All', label: 'All Statuses' },
  { value: 'active', label: 'Active' },
  { value: 'pending', label: 'Pending' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'rejected', label: 'Rejected' },
];

const roleIcon = (role: string) => {
  if (role === 'driver') return Truck;
  if (role.includes('admin')) return Shield;
  return User;
};

export default function UsersPage() {
  const { showToast } = useToast();
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('All');
  const [status, setStatus] = useState('All');
  const [page, setPage] = useState(1);
  const [suspendTarget, setSuspendTarget] = useState<{ id: string; name: string } | null>(null);

  const { data, isLoading, error, refetch, isFetching } = useUsers({
    page,
    pageSize: 20,
    role: role === 'All' ? undefined : role,
    status: status === 'All' ? undefined : status,
    search: search || undefined,
  });
  const updateStatus = useUpdateUserStatus();

  const users = data?.items || [];
  const total = data?.total || 0;

  const handleActivate = async (userId: string) => {
    try {
      await updateStatus.mutateAsync({ userId, status: 'active' });
      showToast({ title: 'User activated.', type: 'success' });
    } catch (err: any) {
      showToast({ title: err?.message || 'Failed to activate user.', type: 'error' });
    }
  };

  const handleSuspend = async () => {
    if (!suspendTarget) return;
    try {
      await updateStatus.mutateAsync({ userId: suspendTarget.id, status: 'suspended' });
      showToast({ title: 'User suspended.', type: 'success' });
      setSuspendTarget(null);
    } catch (err: any) {
      showToast({ title: err?.message || 'Failed to suspend user.', type: 'error' });
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-secondary-900">User Management</h1>
            <p className="text-secondary-500 mt-1">Manage all users across the platform — live backend data.</p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => refetch()} loading={isFetching} leftIcon={<RefreshCw className={cn('w-4 h-4', isFetching && 'animate-spin')} />}>
            Refresh
          </Button>
        </div>

        <Card className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="lg:col-span-2 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary-400" />
              <input
                type="text"
                placeholder="Search by name, email, or phone..."
                className="input pl-10 w-full"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              />
            </div>
            <Select value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }} options={ROLE_OPTIONS} />
            <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} options={STATUS_OPTIONS} />
          </div>
        </Card>

        {isLoading ? (
          <Card><div className="p-6 space-y-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} variant="text" className="w-full h-10" />)}</div></Card>
        ) : error ? (
          <Card className="p-12 text-center">
            <ShieldAlert className="w-12 h-12 text-rose-500 mx-auto mb-3" />
            <h3 className="text-lg font-bold text-secondary-900">Failed to load users</h3>
            <p className="text-sm text-secondary-500 mt-1">{(error as any)?.message}</p>
            <Button variant="primary" size="sm" onClick={() => refetch()} className="mt-4">Retry</Button>
          </Card>
        ) : users.length === 0 ? (
          <EmptyState icon={<User className="w-8 h-8" />} title="No users found" description="Try adjusting your search or filters." />
        ) : (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-secondary-50">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-500 uppercase tracking-wider">Name</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-500 uppercase tracking-wider">Email</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-500 uppercase tracking-wider">Phone</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-500 uppercase tracking-wider">Role</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-500 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-500 uppercase tracking-wider">Joined</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-secondary-200">
                  {users.map((user) => {
                    const RoleIcon = roleIcon(user.role);
                    return (
                      <tr key={user.id} className="hover:bg-secondary-50">
                        <td className="px-4 py-4 font-medium text-secondary-900">{user.firstName} {user.lastName}</td>
                        <td className="px-4 py-4 text-sm text-secondary-600">{user.email}</td>
                        <td className="px-4 py-4 text-sm text-secondary-600">{user.phone}</td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-1.5 text-sm text-secondary-600 capitalize">
                            <RoleIcon className="w-4 h-4 text-secondary-400" /> {user.role.replace('_', ' ')}
                          </div>
                        </td>
                        <td className="px-4 py-4"><StatusBadge status={user.status} /></td>
                        <td className="px-4 py-4 text-sm text-secondary-600">{formatRelativeTime(user.createdAt)}</td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2">
                            {user.status !== 'active' && (
                              <Button variant="ghost" size="sm" title="Activate" onClick={() => handleActivate(user.id)}>
                                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                              </Button>
                            )}
                            {user.status !== 'suspended' && (
                              <Button variant="ghost" size="sm" title="Suspend" onClick={() => setSuspendTarget({ id: user.id, name: `${user.firstName} ${user.lastName}` })}>
                                <Ban className="w-4 h-4 text-rose-600" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="p-4 border-t border-secondary-200 flex items-center justify-between text-sm text-secondary-500">
              <div>Showing <span className="font-bold text-secondary-800">{users.length}</span> of <span className="font-bold text-secondary-800">{total}</span> users</div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                <Button variant="ghost" size="sm" disabled={users.length < 20} onClick={() => setPage((p) => p + 1)}>Next</Button>
              </div>
            </div>
          </Card>
        )}
      </div>

      <ConfirmDialog
        isOpen={!!suspendTarget}
        onClose={() => setSuspendTarget(null)}
        onConfirm={handleSuspend}
        title="Suspend User?"
        message={`Suspend ${suspendTarget?.name}? They will not be able to sign in until reactivated.`}
        confirmText="Suspend"
        variant="danger"
        loading={updateStatus.isPending}
      />
    </DashboardLayout>
  );
}
