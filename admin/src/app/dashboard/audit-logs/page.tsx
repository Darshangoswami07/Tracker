'use client';

import { useState } from 'react';
import { ShieldAlert, RefreshCw, Search, ScrollText } from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';
import { cn, formatRelativeTime, formatDate } from '@/lib/utils';
import { api } from '@/lib/api/client';
import { useQuery } from '@tanstack/react-query';
import { Card, Button, Skeleton, EmptyState } from '@/components/ui';

interface AuditLog {
  id: string;
  userId: string | null;
  adminId: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  oldValues: string | null;
  newValues: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

async function fetchAuditLogs(params: { page: number; action?: string }): Promise<{
  items: AuditLog[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}> {
  const searchParams = new URLSearchParams({
    page: params.page.toString(),
    page_size: '20',
  });
  if (params.action) searchParams.set('action', params.action);
  const response = await api.get<any>(`/admin/audit-logs?${searchParams.toString()}`);
  return response.data;
}

export default function AuditLogsPage() {
  const [action, setAction] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['audit-logs', page, action],
    queryFn: () => fetchAuditLogs({ page, action: action || undefined }),
    staleTime: 10000,
  });

  const logs = data?.items || [];
  const total = data?.total || 0;
  const totalPages = data?.pages || 1;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-secondary-900">Audit Logs</h1>
            <p className="text-secondary-500 mt-1">Every admin action across the platform — live backend data.</p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => refetch()} loading={isFetching} leftIcon={<RefreshCw className={cn('w-4 h-4', isFetching && 'animate-spin')} />}>
            Refresh
          </Button>
        </div>

        <Card className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary-400" />
            <input
              type="text"
              placeholder="Filter by action (e.g. approve, reject, status)..."
              className="input pl-10 w-full"
              value={action}
              onChange={(e) => { setAction(e.target.value); setPage(1); }}
            />
          </div>
        </Card>

        {isLoading ? (
          <Card><div className="p-6 space-y-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} variant="text" className="w-full h-10" />)}</div></Card>
        ) : error ? (
          <Card className="p-12 text-center">
            <ShieldAlert className="w-12 h-12 text-rose-500 mx-auto mb-3" />
            <h3 className="text-lg font-bold text-secondary-900">Failed to load audit logs</h3>
            <p className="text-sm text-secondary-500 mt-1">{(error as any)?.message}</p>
            <Button variant="primary" size="sm" onClick={() => refetch()} className="mt-4">Retry</Button>
          </Card>
        ) : logs.length === 0 ? (
          <EmptyState icon={<ScrollText className="w-8 h-8" />} title="No audit logs found" description="Try clearing the action filter." />
        ) : (
          <>
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-secondary-50">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wide text-secondary-500">Action</th>
                      <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wide text-secondary-500">Entity</th>
                      <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wide text-secondary-500">Admin</th>
                      <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wide text-secondary-500">IP Address</th>
                      <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wide text-secondary-500">When</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-secondary-100">
                    {logs.map((log) => (
                      <tr key={log.id} className="hover:bg-secondary-50">
                        <td className="px-4 py-3">
                          <span className="px-2.5 py-1 rounded-lg bg-secondary-100 text-secondary-800 text-xs font-bold">{log.action}</span>
                        </td>
                        <td className="px-4 py-3 text-secondary-700">
                          {log.entityType ? (
                            <div>
                              <p className="text-sm font-medium text-secondary-800">{log.entityType}</p>
                              {log.entityId && <p className="text-xs text-secondary-400">{log.entityId.slice(0, 8)}</p>}
                            </div>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-4 py-3 text-secondary-700">{log.adminId ? log.adminId.slice(0, 8) : '—'}</td>
                        <td className="px-4 py-3 text-secondary-700">{log.ipAddress || '—'}</td>
                        <td className="px-4 py-3">
                          <p className="text-sm text-secondary-700" title={formatDate(log.createdAt)}>{formatRelativeTime(log.createdAt)}</p>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            {totalPages > 1 && (
              <div className="flex items-center justify-between text-sm text-secondary-500">
                <span>{total} log entries</span>
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