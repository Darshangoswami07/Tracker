'use client';

import { useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import {
  Users,
  Truck,
  Package,
  Building2,
  TrendingUp,
  DollarSign,
  Clock,
  CheckCircle,
  XCircle,
  RefreshCw,
} from 'lucide-react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Skeleton,
  Button,
  Badge,
  ConfirmDialog,
  Modal,
  Textarea,
  useToast,
} from '@/components/ui';
import { formatNumber, formatCurrency, formatRelativeTime, cn } from '@/lib/utils';
import { api } from '@/lib/api/client';
import { useQuery } from '@tanstack/react-query';
import { ResponsiveContainer, AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip } from 'recharts';
import { useApproveRequest, useRejectRequest } from '@/hooks';

interface DashboardStats {
  totalOrders: number;
  todaysDeliveries: number;
  pendingOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  activeDrivers: number;
  onlineDrivers: number;
  vehicles: number;
  companies: number;
  employees: number;
  revenue: number;
  growth: number;
  pendingApprovals?: number;
}

interface ActivityItem {
  id: number;
  type: string;
  message: string;
  time: string;
  status: string;
}

async function fetchDashboardStats(): Promise<DashboardStats> {
  const response = await api.get<any>('/admin/dashboard/stats');
  return response.data;
}

async function fetchRecentActivity(): Promise<ActivityItem[]> {
  const response = await api.get<any>('/admin/dashboard/activity');
  return response.data;
}

async function fetchPendingApprovals(): Promise<any[]> {
  const response = await api.get<any>('/admin/registration-requests/pending?page=1&page_size=5');
  return response.data.items || [];
}

async function fetchOrderChartData(): Promise<{ date: string; orders: number; deliveries: number }[]> {
  const response = await api.get<any>('/admin/dashboard/charts/orders');
  return response.data;
}

function StatCard({ name, value, change, icon: Icon, color }: {
  name: string;
  value: string | number;
  change: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}) {
  return (
    <Card className="card-hover">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-secondary-500">{name}</p>
          <p className="text-3xl font-bold text-secondary-900 mt-2">{value}</p>
          <p className="text-sm text-green-600 mt-1 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
            {change} vs last month
          </p>
        </div>
        <div className={cn('p-3 rounded-xl', color)}>
          <Icon className="w-6 h-6" aria-hidden="true" />
        </div>
      </div>
    </Card>
  );
}

function ActivityItemRow({ activity }: { activity: ActivityItem }) {
  const statusIcons = {
    pending: '⏳',
    completed: '✅',
    active: '🟢',
    assigned: '📋',
    approved: '✅',
  };

  return (
    <div className="flex items-center gap-4 p-4 hover:bg-secondary-50 rounded-xl transition-colors">
      <div className="w-10 h-10 rounded-xl bg-secondary-100 flex items-center justify-center text-lg">
        {statusIcons[activity.status as keyof typeof statusIcons] || '📋'}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-secondary-900 truncate">{activity.message}</p>
        <p className="text-xs text-secondary-500 mt-0.5">{activity.time}</p>
      </div>
      <Badge variant={activity.status as any}>
        {activity.status.charAt(0).toUpperCase() + activity.status.slice(1)}
      </Badge>
    </div>
  );
}

function OrdersChart({ data }: { data: { date: string; orders: number; deliveries: number }[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle subtitle="Order trends over the last 30 days">Orders & Deliveries</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorOrders" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorDeliveries" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="date" stroke="#9ca3af" fontSize={12} tick={{ fill: '#9ca3af' }} tickLine={false} axisLine={false} />
              <YAxis stroke="#9ca3af" fontSize={12} tick={{ fill: '#9ca3af' }} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#fff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                }}
                labelStyle={{ color: '#374151' }}
              />
              <Area type="monotone" dataKey="orders" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorOrders)" />
              <Area type="monotone" dataKey="deliveries" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorDeliveries)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const { showToast } = useToast();
  const approveMutation = useApproveRequest();
  const rejectMutation = useRejectRequest();

  const [approveConfirmId, setApproveConfirmId] = useState<string | null>(null);
  const [rejectModalId, setRejectModalId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: fetchDashboardStats,
    staleTime: 10000,
  });

  const { data: activity, isLoading: activityLoading } = useQuery({
    queryKey: ['recent-activity'],
    queryFn: fetchRecentActivity,
    staleTime: 30000,
  });

  const { data: pendingApprovals, isLoading: approvalsLoading, refetch: refetchApprovals } = useQuery({
    queryKey: ['pending-approvals'],
    queryFn: fetchPendingApprovals,
    staleTime: 10000,
  });

  const { data: chartData, isLoading: chartLoading } = useQuery({
    queryKey: ['order-chart'],
    queryFn: fetchOrderChartData,
    staleTime: 300000,
  });

  const isLoading = statsLoading || activityLoading || approvalsLoading;

  const handleConfirmApprove = async () => {
    if (!approveConfirmId) return;
    try {
      await approveMutation.mutateAsync(approveConfirmId);
      showToast({ title: 'Registration approved successfully. OTP sent to applicant email.', type: 'success' });
      setApproveConfirmId(null);
      refetchStats();
      refetchApprovals();
    } catch (err: any) {
      showToast({ title: err?.message || 'Failed to approve registration.', type: 'error' });
    }
  };

  const handleConfirmReject = async () => {
    if (!rejectModalId || !rejectReason.trim()) return;
    try {
      await rejectMutation.mutateAsync({ id: rejectModalId, reason: rejectReason.trim() });
      showToast({ title: 'Registration request rejected.', type: 'success' });
      setRejectModalId(null);
      setRejectReason('');
      refetchStats();
      refetchApprovals();
    } catch (err: any) {
      showToast({ title: err?.message || 'Failed to reject registration.', type: 'error' });
    }
  };

  const statCards = stats ? [
    { name: 'Total Orders', value: formatNumber(stats.totalOrders), change: '+12%', icon: Package, color: 'text-blue-600 bg-blue-50' },
    { name: "Today's Deliveries", value: formatNumber(stats.todaysDeliveries), change: '+5%', icon: Truck, color: 'text-green-600 bg-green-50' },
    { name: 'Pending Orders', value: formatNumber(stats.pendingOrders), change: '-3%', icon: Clock, color: 'text-yellow-600 bg-yellow-50' },
    { name: 'Completed Orders', value: formatNumber(stats.completedOrders), change: '+8%', icon: CheckCircle, color: 'text-green-600 bg-green-50' },
    { name: 'Cancelled Orders', value: formatNumber(stats.cancelledOrders), change: '-2%', icon: XCircle, color: 'text-red-600 bg-red-50' },
    { name: 'Active Drivers', value: formatNumber(stats.activeDrivers), change: '+3', icon: Truck, color: 'text-blue-600 bg-blue-50' },
    { name: 'Online Drivers', value: formatNumber(stats.onlineDrivers), change: '+2', icon: Truck, color: 'text-green-600 bg-green-50' },
    { name: 'Vehicles', value: formatNumber(stats.vehicles), change: '+5', icon: Truck, color: 'text-purple-600 bg-purple-50' },
    { name: 'Companies', value: formatNumber(stats.companies), change: '+2', icon: Building2, color: 'text-indigo-600 bg-indigo-50' },
    { name: 'Employees', value: formatNumber(stats.employees), change: '+8', icon: Users, color: 'text-pink-600 bg-pink-50' },
    { name: 'Revenue', value: formatCurrency(stats.revenue), change: '+15%', icon: DollarSign, color: 'text-green-600 bg-green-50' },
    { name: 'Growth', value: `${stats.growth}%`, change: '+2.1%', icon: TrendingUp, color: 'text-emerald-600 bg-emerald-50' },
  ] : [];

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-secondary-900">Dashboard</h1>
            <p className="text-secondary-500 mt-1">Overview of your logistics operations</p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="secondary" onClick={() => { refetchStats(); refetchApprovals(); }} leftIcon={<RefreshCw className="w-4 h-4" />}>
              Refresh
            </Button>
          </div>
        </div>

        {/* Stats Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {Array.from({ length: 12 }).map((_, i) => (
              <Skeleton key={i} variant="card" className="p-6" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {statCards.map((stat) => (
              <StatCard key={stat.name} {...stat} />
            ))}
          </div>
        )}

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {chartData && !chartLoading ? (
            <OrdersChart data={chartData} />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle subtitle="Order trends over the last 30 days">Orders & Deliveries</CardTitle>
              </CardHeader>
              <CardContent>
                <Skeleton variant="rectangular" className="h-64 w-full" />
              </CardContent>
            </Card>
          )}
        </div>

        {/* Recent Activity & Pending Approvals */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Activity */}
          <Card>
            <CardHeader action={<a href="/dashboard/audit-logs" className="btn btn-ghost btn-sm text-xs font-semibold">View All</a>}>
              <CardTitle>Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="divide-y divide-secondary-200">
                {activityLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} variant="rectangular" className="h-16 w-full" />
                  ))
                ) : activity?.map((act) => (
                  <ActivityItemRow key={act.id} activity={act} />
                )) || (
                  <div className="py-8 text-center text-secondary-500">No recent activity</div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Pending Approvals */}
          <Card>
            <CardHeader action={
              <a href="/dashboard/approvals" className="btn btn-ghost btn-sm text-xs font-semibold text-primary-600 hover:text-primary-700">View All</a>
            }>
              <CardTitle>
                Pending Approvals
                <span className="ml-2 text-sm font-normal">
                  <Badge variant="pending">{pendingApprovals?.length || 0} pending</Badge>
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-secondary-50 text-xs font-semibold text-secondary-500 uppercase tracking-wider">
                      <th className="px-4 py-3">Name & Company</th>
                      <th className="px-4 py-3">Email</th>
                      <th className="px-4 py-3">Role</th>
                      <th className="px-4 py-3">Time</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-secondary-200">
                    {approvalsLoading ? (
                      Array.from({ length: 5 }).map((_, i) => (
                        <tr key={i}>
                          <td className="px-4 py-4"><Skeleton variant="text" className="w-32" /></td>
                          <td className="px-4 py-4"><Skeleton variant="text" className="w-40" /></td>
                          <td className="px-4 py-4"><Skeleton variant="text" className="w-20" /></td>
                          <td className="px-4 py-4"><Skeleton variant="text" className="w-20" /></td>
                          <td className="px-4 py-4"><Skeleton variant="text" className="w-16" /></td>
                          <td className="px-4 py-4"><Skeleton variant="text" className="w-28 ml-auto" /></td>
                        </tr>
                      ))
                    ) : pendingApprovals && pendingApprovals.length > 0 ? (
                      pendingApprovals.map((req: any) => {
                        const name = req.firstName && req.lastName ? `${req.firstName} ${req.lastName}` : req.name || 'N/A';
                        const company = req.companyName || req.company || 'N/A';
                        const email = req.email || 'N/A';
                        const role = req.requestedRole || req.role || 'User';
                        const createdAt = req.createdAt || req.date || new Date().toISOString();

                        return (
                          <tr key={req.id} className="hover:bg-secondary-50/70 transition-colors">
                            <td className="px-4 py-4">
                              <div className="font-semibold text-secondary-900">{name}</div>
                              <div className="text-xs text-secondary-500">{company}</div>
                            </td>
                            <td className="px-4 py-4 text-xs text-secondary-600 truncate max-w-[160px]">{email}</td>
                            <td className="px-4 py-4">
                              <Badge variant="pending" className="capitalize text-xs">{role}</Badge>
                            </td>
                            <td className="px-4 py-4 text-xs text-secondary-500">
                              {formatRelativeTime(createdAt)}
                            </td>
                            <td className="px-4 py-4">
                              <Badge variant="pending" className="text-xs">Pending</Badge>
                            </td>
                            <td className="px-4 py-4 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <Button
                                  variant="primary"
                                  size="sm"
                                  className="h-8 text-xs px-2.5"
                                  onClick={() => setApproveConfirmId(req.id)}
                                >
                                  Approve
                                </Button>
                                <Button
                                  variant="danger"
                                  size="sm"
                                  className="h-8 text-xs px-2.5"
                                  onClick={() => {
                                    setRejectModalId(req.id);
                                    setRejectReason('');
                                  }}
                                >
                                  Reject
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={6} className="px-4 py-12 text-center text-secondary-500">
                          <div className="flex flex-col items-center justify-center">
                            <CheckCircle className="w-10 h-10 text-green-500 mb-2 opacity-80" />
                            <p className="font-medium text-secondary-700">No pending approvals</p>
                            <p className="text-xs text-secondary-500 mt-1">You&apos;re all caught up!</p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <a href="/dashboard/approvals" className="card p-6 text-center card-hover group">
                <Users className="w-10 h-10 mx-auto text-primary-600 group-hover:scale-110 transition-transform mb-3" />
                <h3 className="font-semibold text-secondary-900">Approve Users</h3>
                <p className="text-sm text-secondary-500 mt-1">Review pending registrations</p>
              </a>
              <a href="/dashboard/orders" className="card p-6 text-center card-hover group">
                <Package className="w-10 h-10 mx-auto text-blue-600 group-hover:scale-110 transition-transform mb-3" />
                <h3 className="font-semibold text-secondary-900">Manage Orders</h3>
                <p className="text-sm text-secondary-500 mt-1">View and manage all orders</p>
              </a>
              <a href="/dashboard/drivers" className="card p-6 text-center card-hover group">
                <Truck className="w-10 h-10 mx-auto text-green-600 group-hover:scale-110 transition-transform mb-3" />
                <h3 className="font-semibold text-secondary-900">Driver Management</h3>
                <p className="text-sm text-secondary-500 mt-1">Track and manage drivers</p>
              </a>
              <a href="/dashboard/analytics" className="card p-6 text-center card-hover group">
                <TrendingUp className="w-10 h-10 mx-auto text-purple-600 group-hover:scale-110 transition-transform mb-3" />
                <h3 className="font-semibold text-secondary-900">View Analytics</h3>
                <p className="text-sm text-secondary-500 mt-1">Business insights and reports</p>
              </a>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Confirm Approve Modal */}
      <ConfirmDialog
        isOpen={!!approveConfirmId}
        onClose={() => setApproveConfirmId(null)}
        title="Approve Registration?"
        message="The applicant will receive an OTP via email to complete account verification."
        confirmText="Approve & Send OTP"
        cancelText="Cancel"
        variant="primary"
        loading={approveMutation.isPending}
        onConfirm={handleConfirmApprove}
      />

      {/* Reject Modal with Reason */}
      <Modal
        isOpen={!!rejectModalId}
        onClose={() => setRejectModalId(null)}
        title="Reject Registration"
        size="md"
      >
        <div className="space-y-4 pt-2">
          <p className="text-sm text-secondary-600">
            Please provide a clear reason for rejecting this registration request. The applicant will receive an email notice.
          </p>
          <div>
            <label className="block text-xs font-semibold text-secondary-700 uppercase tracking-wider mb-1.5">
              Rejection Reason *
            </label>
            <Textarea
              rows={4}
              placeholder="e.g. Invalid business documentation or duplicate company registration request."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-3 pt-3 border-t border-secondary-200">
            <Button variant="secondary" onClick={() => setRejectModalId(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={!rejectReason.trim() || rejectMutation.isPending}
              loading={rejectMutation.isPending}
              onClick={handleConfirmReject}
            >
              Reject Registration
            </Button>
          </div>
        </div>
      </Modal>
    </DashboardLayout>
  );
}