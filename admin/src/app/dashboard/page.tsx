'use client';

import { useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import {
  Users,
  Truck,
  Package,
  TrendingUp,
  TrendingDown,
  CheckCircle,
  RefreshCw,
  CalendarDays,
  CalendarRange,
  Calendar,
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
import { formatNumber, formatINR, formatRelativeTime, cn } from '@/lib/utils';
import { api } from '@/lib/api/client';
import { useQuery } from '@tanstack/react-query';
import { ResponsiveContainer, AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip } from 'recharts';
import { useApproveRequest, useRejectRequest } from '@/hooks';

interface DashboardStats {
  totalOrders: number;
  todaysDeliveries: number;
  pendingOrders: number;
  completedOrders: number;
  unclearedOrders: number;
  activeDrivers: number;
  onlineDrivers: number;
  vehicles: number;
  companies: number;
  employees: number;
  revenue: number;
  growth: number;
  pendingApprovals?: number;
}

interface RevenueOverview {
  today: number;
  yesterday: number;
  week: number;
  prevWeek: number;
  month: number;
  prevMonth: number;
  totalCollected: number;
  outstandingAmount: number;
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

async function fetchRevenueOverview(): Promise<RevenueOverview> {
  const response = await api.get<any>('/admin/dashboard/revenue');
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

function RevenueCard({ label, amount, icon: Icon, color, comparison }: {
  label: string;
  amount: number;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  comparison?: { value: number; label: string } | null;
}) {
  return (
    <Card className="card-hover relative overflow-hidden">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-secondary-500">{label}</p>
          <p className="text-3xl font-bold text-secondary-900 mt-2 tracking-tight">
            {formatINR(amount)}
          </p>
          {comparison && (
            <p className={cn(
              'text-sm mt-1.5 flex items-center gap-1 font-medium',
              comparison.value >= 0 ? 'text-green-600' : 'text-red-500'
            )}>
              {comparison.value >= 0 ? (
                <TrendingUp className="w-3.5 h-3.5" />
              ) : (
                <TrendingDown className="w-3.5 h-3.5" />
              )}
              {comparison.value >= 0 ? '↑' : '↓'} {Math.abs(comparison.value).toFixed(1)}% {comparison.label}
            </p>
          )}
          {!comparison && (
            <p className="text-sm text-secondary-400 mt-1.5 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-secondary-300" />
              No prior data
            </p>
          )}
        </div>
        <div className={cn('p-3 rounded-xl', color)}>
          <Icon className="w-6 h-6" aria-hidden="true" />
        </div>
      </div>
    </Card>
  );
}

function RevenueCardSkeleton() {
  return (
    <Card className="p-6">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <Skeleton variant="text" className="w-24 h-4" />
          <Skeleton variant="text" className="w-36 h-9 mt-3" />
          <Skeleton variant="text" className="w-40 h-4 mt-2" />
        </div>
        <Skeleton variant="rectangular" className="w-12 h-12 rounded-xl" />
      </div>
    </Card>
  );
}

function ActivityItemRow({ activity }: { activity: ActivityItem }) {
  const statusIcons = {
    pending: '⏳',
    completed: '✅',
    active: '🟢',
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

  const { data: revenue, isLoading: revenueLoading, isError: revenueError, refetch: refetchRevenue } = useQuery({
    queryKey: ['revenue-overview'],
    queryFn: fetchRevenueOverview,
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

  const getPercentChange = (current: number, previous: number): number | null => {
    if (previous === 0 && current === 0) return null;
    if (previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / previous) * 100;
  };

  const revenueCards = revenue
    ? [
        {
          label: "Today's Revenue",
          amount: revenue.today,
          icon: CalendarDays,
          color: 'text-blue-600 bg-blue-50',
          comparison: (() => {
            const pct = getPercentChange(revenue.today, revenue.yesterday);
            return pct !== null ? { value: pct, label: 'from yesterday' } : null;
          })(),
        },
        {
          label: 'This Week',
          amount: revenue.week,
          icon: CalendarRange,
          color: 'text-green-600 bg-green-50',
          comparison: (() => {
            const pct = getPercentChange(revenue.week, revenue.prevWeek);
            return pct !== null ? { value: pct, label: 'from last week' } : null;
          })(),
        },
        {
          label: 'This Month',
          amount: revenue.month,
          icon: Calendar,
          color: 'text-purple-600 bg-purple-50',
          comparison: (() => {
            const pct = getPercentChange(revenue.month, revenue.prevMonth);
            return pct !== null ? { value: pct, label: 'from last month' } : null;
          })(),
        },
        {
          label: 'Total Collected',
          amount: revenue.totalCollected,
          icon: CheckCircle,
          color: 'text-teal-600 bg-teal-50',
          comparison: null,
        },
        {
          label: 'Outstanding',
          amount: revenue.outstandingAmount,
          icon: TrendingUp,
          color: 'text-amber-600 bg-amber-50',
          comparison: null,
        },
      ]
    : [];

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

        {/* Revenue Overview */}
        <div>
          <h2 className="text-lg font-semibold text-secondary-900 mb-4">Revenue Overview</h2>
          {revenueLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
              {Array.from({ length: 5 }).map((_, i) => (
                <RevenueCardSkeleton key={i} />
              ))}
            </div>
          ) : revenueError ? (
            <Card className="p-8 text-center">
              <TrendingUp className="w-10 h-10 mx-auto text-red-400 mb-3" />
              <p className="font-medium text-secondary-700">Failed to load revenue data</p>
              <p className="text-sm text-secondary-500 mt-1 mb-4">Please check your connection and try again.</p>
              <Button variant="secondary" size="sm" onClick={() => refetchRevenue()} leftIcon={<RefreshCw className="w-3.5 h-3.5" />}>
                Retry
              </Button>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
              {revenueCards.map((card) => (
                <RevenueCard key={card.label} {...card} />
              ))}
            </div>
          )}
        </div>

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