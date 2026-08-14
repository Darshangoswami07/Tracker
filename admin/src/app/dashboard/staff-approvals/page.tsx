'use client';

import { useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import {
  Search,
  RefreshCw,
  UserCheck,
  Mail,
  Phone,
  Calendar,
  ShieldAlert,
  CheckCircle2,
} from 'lucide-react';
import {
  usePendingStaffRequests,
  useApproveStaffRequest,
  useRejectStaffRequest,
} from '@/hooks';
import {
  Card,
  Button,
  Input,
  Badge,
  StatusBadge,
  ConfirmDialog,
  Modal,
  Textarea,
  useToast,
  Skeleton,
  EmptyState,
} from '@/components/ui';
import { cn, formatRelativeTime } from '@/lib/utils';

function getInitials(firstName?: string, lastName?: string): string {
  const f = firstName ? firstName.charAt(0).toUpperCase() : '';
  const l = lastName ? lastName.charAt(0).toUpperCase() : '';
  return f + l || 'S';
}

export default function PendingStaffApprovalsPage() {
  const { showToast } = useToast();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [approveId, setApproveId] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const { data, isLoading, error, refetch, isFetching } = usePendingStaffRequests({
    page,
    pageSize: 20,
    search: search || undefined,
  });

  const approveMutation = useApproveStaffRequest();
  const rejectMutation = useRejectStaffRequest();

  const requests = data?.items || [];
  const total = data?.total || 0;

  const handleApprove = async () => {
    if (!approveId) return;
    try {
      await approveMutation.mutateAsync(approveId);
      showToast({ title: 'Staff request approved! OTP sent to their email.', type: 'success' });
      setApproveId(null);
    } catch (err: any) {
      showToast({ title: err?.message || 'Failed to approve staff request.', type: 'error' });
    }
  };

  const handleReject = async () => {
    if (!rejectId || !rejectReason.trim()) return;
    try {
      await rejectMutation.mutateAsync({ id: rejectId, reason: rejectReason.trim() });
      showToast({ title: 'Staff request rejected.', type: 'success' });
      setRejectId(null);
      setRejectReason('');
    } catch (err: any) {
      showToast({ title: err?.message || 'Failed to reject staff request.', type: 'error' });
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-6xl mx-auto pb-12">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-secondary-900">Pending Staff Approvals</h1>
            <p className="text-secondary-500 mt-1">
              Review new Staff signups and approve or reject them before they can log in.
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => refetch()}
            loading={isFetching}
            leftIcon={<RefreshCw className={cn('w-4 h-4', isFetching && 'animate-spin')} />}
          >
            Refresh
          </Button>
        </div>

        <Card className="p-4">
          <Input
            placeholder="Search by name, email, or phone..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            leftIcon={<Search className="w-4 h-4 text-secondary-400" />}
          />
        </Card>

        {isLoading ? (
          <Card>
            <div className="p-6 space-y-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} variant="text" className="w-full h-12" />
              ))}
            </div>
          </Card>
        ) : error ? (
          <Card className="p-12 text-center">
            <ShieldAlert className="w-12 h-12 text-rose-500 mx-auto mb-3" />
            <h3 className="text-lg font-bold text-secondary-900">Failed to load pending staff requests</h3>
            <p className="text-sm text-secondary-500 mt-1">{(error as any)?.message}</p>
            <Button variant="primary" size="sm" onClick={() => refetch()} className="mt-4">
              Retry
            </Button>
          </Card>
        ) : requests.length === 0 ? (
          <EmptyState
            icon={<CheckCircle2 className="w-8 h-8" />}
            title="No pending Staff approvals"
            description="Every submitted Staff signup request has been reviewed."
          />
        ) : (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-secondary-50">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-500 uppercase tracking-wider">Name</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-500 uppercase tracking-wider">Contact</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-500 uppercase tracking-wider">Created</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-500 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-secondary-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-secondary-200">
                  {requests.map((request) => (
                    <tr key={request.id} className="hover:bg-secondary-50">
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary-500 to-indigo-600 text-white font-bold text-xs flex items-center justify-center">
                            {getInitials(request.firstName, request.lastName)}
                          </div>
                          <div>
                            <div className="font-medium text-secondary-900">
                              {request.firstName} {request.lastName}
                            </div>
                            <Badge variant="pending" size="sm">Staff</Badge>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-sm text-secondary-600">
                        <div className="flex items-center gap-1.5">
                          <Mail className="w-3.5 h-3.5 text-secondary-400" /> {request.email}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5 text-secondary-500">
                          <Phone className="w-3.5 h-3.5 text-secondary-400" /> {request.phone}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-xs text-secondary-500">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-secondary-400" /> {formatRelativeTime(request.createdAt)}
                        </div>
                      </td>
                      <td className="px-4 py-4"><StatusBadge status="Pending" /></td>
                      <td className="px-4 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button variant="primary" size="sm" onClick={() => setApproveId(request.id)}>
                            Approve
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => {
                              setRejectId(request.id);
                              setRejectReason('');
                            }}
                          >
                            Reject
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="p-4 border-t border-secondary-200 flex items-center justify-between text-sm text-secondary-500">
              <div>
                Showing <span className="font-bold text-secondary-800">{requests.length}</span> of{' '}
                <span className="font-bold text-secondary-800">{total}</span> pending Staff requests
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </Button>
                <Button variant="ghost" size="sm" disabled={requests.length < 20} onClick={() => setPage((p) => p + 1)}>
                  Next
                </Button>
              </div>
            </div>
          </Card>
        )}
      </div>

      <ConfirmDialog
        isOpen={!!approveId}
        onClose={() => setApproveId(null)}
        title="Approve Staff Request?"
        message="This Staff member will receive an OTP via email to complete verification, then can log in."
        confirmText="Approve & Send OTP"
        cancelText="Cancel"
        variant="primary"
        loading={approveMutation.isPending}
        onConfirm={handleApprove}
      />

      <Modal isOpen={!!rejectId} onClose={() => setRejectId(null)} title="Reject Staff Request" size="md">
        <div className="space-y-4 pt-2">
          <p className="text-sm text-secondary-600">
            State the reason for rejecting this Staff signup. They will be notified and will not be able to log in.
          </p>
          <div>
            <label className="block text-xs font-bold text-secondary-700 uppercase tracking-wider mb-1.5">
              Rejection Reason *
            </label>
            <Textarea
              rows={4}
              placeholder="e.g. Could not verify employment details."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-3 pt-3 border-t border-secondary-200">
            <Button variant="secondary" onClick={() => setRejectId(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={!rejectReason.trim() || rejectMutation.isPending}
              loading={rejectMutation.isPending}
              onClick={handleReject}
            >
              Reject Request
            </Button>
          </div>
        </div>
      </Modal>
    </DashboardLayout>
  );
}
