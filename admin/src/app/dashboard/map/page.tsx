'use client';

import { useMemo, useState } from 'react';
import { MapPin, Package, RefreshCw, Route, Navigation, ShieldAlert } from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';
import { cn, formatDate, formatRelativeTime } from '@/lib/utils';
import { useGRList } from '@/hooks';
import { GRStatus } from '@/types/gr';
import { Card, Button, Select, StatusBadge, Skeleton, EmptyState } from '@/components/ui';

const ACTIVE_STATUSES: GRStatus[] = ['pending', 'uncleared', 'cleared'];

const STATUS_OPTIONS = [
  { value: 'all', label: 'All In-Progress' },
  { value: 'pending', label: 'Pending' },
  { value: 'uncleared', label: 'Uncleared' },
  { value: 'cleared', label: 'Cleared' },
];

export default function LiveMapPage() {
  const [status, setStatus] = useState('all');

  const { data, isLoading, error, refetch, isFetching } = useGRList({
    page: 1,
    pageSize: 100,
  });

  const routes = useMemo(() => {
    const items = data?.items || [];
    return items
      .filter((gr) => ACTIVE_STATUSES.includes(gr.status))
      .filter((gr) => status === 'all' || gr.status === status);
  }, [data, status]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-secondary-900">Live Map</h1>
            <p className="text-secondary-500 mt-1">Active shipments and their routes — real order data.</p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => refetch()} loading={isFetching} leftIcon={<RefreshCw className={cn('w-4 h-4', isFetching && 'animate-spin')} />}>
            Refresh
          </Button>
        </div>

        <Card className="p-4 flex items-start gap-3">
          <Navigation className="w-5 h-5 text-blue-600 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-secondary-900">Live driver GPS tracking is coming soon.</p>
            <p className="text-sm text-secondary-500 mt-0.5">
              This page shows every in-progress shipment (pending, uncleared, cleared) with its real
              pickup → delivery route. Once driver location telemetry is connected, live positions will appear
              here on the map.
            </p>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-secondary-700">
              <Route className="w-4 h-4 text-secondary-400" />
              {routes.length} active route{routes.length === 1 ? '' : 's'}
            </div>
            <div className="sm:ml-auto w-full sm:w-56">
              <Select value={status} onChange={(e) => setStatus(e.target.value)} options={STATUS_OPTIONS} />
            </div>
          </div>
        </Card>

        {isLoading ? (
          <Card><div className="p-6 space-y-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} variant="text" className="w-full h-16" />)}</div></Card>
        ) : error ? (
          <Card className="p-12 text-center">
            <ShieldAlert className="w-12 h-12 text-rose-500 mx-auto mb-3" />
            <h3 className="text-lg font-bold text-secondary-900">Failed to load routes</h3>
            <p className="text-sm text-secondary-500 mt-1">{(error as any)?.message}</p>
            <Button variant="primary" size="sm" onClick={() => refetch()} className="mt-4">Retry</Button>
          </Card>
        ) : routes.length === 0 ? (
          <EmptyState icon={<MapPin className="w-8 h-8" />} title="No active shipments" description="New orders will appear here as soon as they are created." />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {routes.map((gr) => (
              <Card key={gr.id} className="card-hover">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Package className="w-4 h-4 text-blue-600" />
                    <span className="font-bold text-secondary-900">{gr.orderNumber}</span>
                  </div>
                  <StatusBadge status={gr.status} />
                </div>

                <div className="mt-4 space-y-3">
                  <div className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
                      <span className="w-px flex-1 bg-secondary-200 my-1" />
                      <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
                    </div>
                    <div className="space-y-2 text-sm">
                      <div>
                        <p className="text-xs text-secondary-400 font-semibold uppercase tracking-wide">Pickup</p>
                        <p className="text-secondary-800 font-medium">{gr.pickupAddress}</p>
                        {gr.consignorName && <p className="text-secondary-500 text-xs">{gr.consignorName}</p>}
                      </div>
                      <div>
                        <p className="text-xs text-secondary-400 font-semibold uppercase tracking-wide">Delivery</p>
                        <p className="text-secondary-800 font-medium">{gr.deliveryAddress}</p>
                        {gr.consigneeName && <p className="text-secondary-500 text-xs">{gr.consigneeName}</p>}
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 mt-1 border-t border-secondary-100 flex items-center justify-between text-xs text-secondary-500">
                    <span>Created {formatRelativeTime(gr.createdAt)}</span>
                    <span>{formatDate(gr.createdAt)}</span>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}