'use client';

import { useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { Users, Truck, Package, Building2, DollarSign, RefreshCw, TrendingUp, Clock, CheckCircle, XCircle } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, Skeleton, Button, Badge } from '@/components/ui';
import { formatNumber, formatCurrency, formatRelativeTime, cn } from '@/lib/utils';
import { api } from '@/lib/api/client';
import { useQuery } from '@tanstack/react-query';
import { ResponsiveContainer, AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip } from 'recharts';

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
  totalUsers?: number;
}

interface ActivityItem {
  id: number;
  type: string;
  message: string;
  time: string;
  status: string;
}

async function fetchAnalyticsStats(): Promise<DashboardStats> {
  const response = await api.get<any>('/admin/dashboard/stats');
  return response.data;
}

async function fetchOrderChartData(days: number): Promise<{ date: string; orders: number; deliveries: number }[]> {
  const response = await api.get<any>(`/admin/dashboard/charts/orders?days=${days}`);
  return response.data;
}

async function fetchRecentActivity(): Promise<ActivityItem[]> {
  const response = await api.get<any>('/admin/dashboard/activity?limit=8');
  return response.data;
}

function AnalyticsStatCard({ name, value, icon: Icon, color }: {
  name: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}) {
  return (
    <Card className="card-hover">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-secondary-500">{name}</p>
          <p className="text-2xl font-bold text-secondary-900 mt-2">{value}</p>
        </div>
        <div className={cn('p-3 rounded-xl', color)}>
          <Icon className="w-5 h-5" aria-hidden="true" />
        </div>
      </div>
    </Card>
  );
}

export default function AnalyticsPage() {
  const [days, setDays] = useState(30);

  const { data: stats, isLoading: statsLoading, refetch: refetchStats, isFetching: statsFetching } = useQuery({
    queryKey: ['analytics-stats'],
    queryFn: fetchAnalyticsStats,
    staleTime: 10000,
  });

  const { data: chartData, isLoading: chartLoading } = useQuery({
    queryKey: ['analytics-chart', days],
    queryFn: () => fetchOrderChartData(days),
    staleTime: 300000,
  });

  const { data: activity, isLoading: activityLoading } = useQuery({
    queryKey: ['analytics-activity'],
    queryFn: fetchRecentActivity,
    staleTime: 30000,
  });

  const isLoading = statsLoading || chartLoading || activityLoading;

  const statCards = stats ? [
    { name: 'Total Orders', value: formatNumber(stats.totalOrders), icon: Package, color: 'text-blue-600 bg-blue-50' },
    { name: "Today's Deliveries", value: formatNumber(stats.todaysDeliveries), icon: Truck, color: 'text-green-600 bg-green-50' },
    { name: 'Pending Orders', value: formatNumber(stats.pendingOrders), icon: Clock, color: 'text-yellow-600 bg-yellow-50' },
    { name: 'Completed Orders', value: formatNumber(stats.completedOrders), icon: CheckCircle, color: 'text-green-600 bg-green-50' },
    { name: 'Uncleared Orders', value: formatNumber(stats.unclearedOrders), icon: XCircle, color: 'text-orange-600 bg-orange-50' },
    { name: 'Active Drivers', value: formatNumber(stats.activeDrivers), icon: Truck, color: 'text-blue-600 bg-blue-50' },
    { name: 'Vehicles', value: formatNumber(stats.vehicles), icon: Truck, color: 'text-purple-600 bg-purple-50' },
    { name: 'Companies', value: formatNumber(stats.companies), icon: Building2, color: 'text-indigo-600 bg-indigo-50' },
    { name: 'Employees', value: formatNumber(stats.employees), icon: Users, color: 'text-pink-600 bg-pink-50' },
    { name: 'Revenue', value: formatCurrency(stats.revenue), icon: DollarSign, color: 'text-green-600 bg-green-50' },
    { name: 'Growth', value: `${stats.growth}%`, icon: TrendingUp, color: 'text-emerald-600 bg-emerald-50' },
  ] : [];

  const statusIcons: Record<string, string> = {
    pending: '⏳',
    completed: '✅',
    active: '🟢',
    approved: '✅',
  };

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-secondary-900">Analytics</h1>
            <p className="text-secondary-500 mt-1">Platform performance and order trends — live backend data.</p>
          </div>
          <Button variant="secondary" onClick={() => refetchStats()} loading={statsFetching} leftIcon={<RefreshCw className="w-4 h-4" />}>
            Refresh
          </Button>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} variant="card" className="p-6" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {statCards.map((stat) => (
              <AnalyticsStatCard key={stat.name} {...stat} />
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <CardTitle subtitle="Order volume and deliveries over the selected period">
                    Orders &amp; Deliveries
                  </CardTitle>
                  <div className="flex items-center gap-1">
                    {[7, 30, 90].map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setDays(d)}
                        className={cn(
                          'px-3 py-1.5 rounded-lg text-xs font-bold transition-colors',
                          days === d
                            ? 'bg-secondary-900 text-white'
                            : 'bg-secondary-100 text-secondary-600 hover:bg-secondary-200'
                        )}
                      >
                        {d}D
                      </button>
                    ))}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="h-72">
                  {chartLoading || !chartData ? (
                    <Skeleton variant="text" className="w-full h-72" />
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
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
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle subtitle="Latest audit trail events">Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              {activityLoading ? (
                <div className="space-y-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} variant="text" className="w-full h-12" />)}</div>
              ) : !activity || activity.length === 0 ? (
                <p className="text-sm text-secondary-500 text-center py-8">No recent activity.</p>
              ) : (
                <div className="space-y-1">
                  {activity.map((a) => (
                    <div key={a.id} className="flex items-center gap-4 p-3 hover:bg-secondary-50 rounded-xl transition-colors">
                      <div className="w-10 h-10 rounded-xl bg-secondary-100 flex items-center justify-center text-lg">
                        {statusIcons[a.status as keyof typeof statusIcons] || '📋'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-secondary-900 truncate">{a.message}</p>
                        <p className="text-xs text-secondary-500 mt-0.5">{formatRelativeTime(a.time)}</p>
                      </div>
                      <Badge variant={a.status as any}>
                        {a.status.charAt(0).toUpperCase() + a.status.slice(1)}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}