'use client';

import { useState, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Download,
  RotateCcw,
  RefreshCw,
  UserCheck,
  XCircle,
  Clock,
  CheckCircle2,
  Building2,
  Mail,
  Phone,
  Calendar,
  ShieldAlert,
  ChevronRight,
  X,
  Sparkles,
} from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';
import {
  usePendingRequests,
  useApproveRequest,
  useRejectRequest,
  useApprovalStats,
} from '@/hooks';
import {
  Card,
  Button,
  Badge,
  StatusBadge,
  Input,
  Select,
  ConfirmDialog,
  Modal,
  Textarea,
  useToast,
  Skeleton,
} from '@/components/ui';
import { formatRelativeTime, cn } from '@/lib/utils';
import { RegistrationRequest } from '@/types/registration';

const roleMap: Record<string, string> = {
  business: 'Business Owner',
  business_owner: 'Business Owner',
  dispatcher: 'Dispatcher',
  driver: 'Driver',
  employee: 'Employee',
  admin: 'Admin',
  customer: 'Customer',
  super_admin: 'Super Admin',
};

function formatRole(role: string) {
  return roleMap[role] || role;
}

function getInitials(firstName?: string, lastName?: string, fallback = 'U'): string {
  const f = firstName ? firstName.charAt(0).toUpperCase() : '';
  const l = lastName ? lastName.charAt(0).toUpperCase() : '';
  return f + l || fallback;
}

export default function PendingApprovalsPage() {
  const { showToast } = useToast();

  // Filters state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRole, setSelectedRole] = useState('All');
  const [selectedStatus, setSelectedStatus] = useState('Pending');
  const [selectedCompany, setSelectedCompany] = useState('All');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Modals & Drawer state
  const [selectedRequest, setSelectedRequest] = useState<RegistrationRequest | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [approveConfirmId, setApproveConfirmId] = useState<string | null>(null);
  const [rejectModalId, setRejectModalId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  // Queries & Mutations
  const { data: statsData, isLoading: statsLoading, refetch: refetchStats } = useApprovalStats();
  const { data, isLoading, error, refetch, isFetching } = usePendingRequests({
    page,
    pageSize,
    search: searchQuery || undefined,
  });

  const approveMutation = useApproveRequest();
  const rejectMutation = useRejectRequest();

  // Guards against a double submission in the same event-loop tick (two rapid
  // clicks before React re-renders with `isPending`). A duplicate approve must
  // never fire a second network request — the backend would correctly return
  // 409 "already approved", but one request per click is the contract here.
  const approveInFlightRef = useRef(false);
  const rejectInFlightRef = useRef(false);

  const requests = data?.items || [];
  const totalItems = data?.total || 0;

  // Extract unique companies for filter dropdown
  const companiesList = useMemo(() => {
    const set = new Set<string>();
    requests.forEach((r) => {
      if (r.companyName) set.add(r.companyName);
    });
    return ['All', ...Array.from(set)];
  }, [requests]);

  // Client-side filtering for role & status & company if needed
  const filteredRequests = useMemo(() => {
    return requests.filter((item) => {
      if (selectedRole !== 'All') {
        const itemRole = formatRole(item.requestedRole).toLowerCase();
        if (!itemRole.includes(selectedRole.toLowerCase())) return false;
      }
      if (selectedCompany !== 'All' && item.companyName !== selectedCompany) {
        return false;
      }
      if (selectedStatus !== 'All') {
        if (selectedStatus === 'Pending' && item.status !== 'pending') return false;
        if (selectedStatus === 'Approved' && !item.isApproved) return false;
        if (selectedStatus === 'Rejected' && item.status !== 'rejected') return false;
      }
      return true;
    });
  }, [requests, selectedRole, selectedStatus, selectedCompany]);

  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedRole('All');
    setSelectedStatus('Pending');
    setSelectedCompany('All');
    setPage(1);
  };

  const handleExportCSV = () => {
    if (!filteredRequests.length) {
      showToast({ title: 'No data available to export.', type: 'error' });
      return;
    }
    const headers = ['ID', 'Name', 'Company', 'Email', 'Phone', 'Role', 'Status', 'Submitted At'];
    const rows = filteredRequests.map((r) => [
      r.id,
      `"${r.firstName} ${r.lastName}"`,
      `"${r.companyName}"`,
      r.email,
      r.phone,
      formatRole(r.requestedRole),
      r.status,
      r.createdAt,
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `pending_approvals_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast({ title: 'Exported approvals CSV successfully.', type: 'success' });
  };

  const handleConfirmApprove = async () => {
    if (!approveConfirmId || approveInFlightRef.current) return;
    approveInFlightRef.current = true;
    try {
      await approveMutation.mutateAsync(approveConfirmId);
      showToast({ title: 'Registration approved! OTP sent to user email.', type: 'success' });
      setApproveConfirmId(null);
      if (selectedRequest?.id === approveConfirmId) {
        setDrawerOpen(false);
        setSelectedRequest(null);
      }
      refetch();
      refetchStats();
    } catch (err: any) {
      showToast({ title: err?.message || 'Failed to approve registration.', type: 'error' });
    } finally {
      approveInFlightRef.current = false;
    }
  };

  const handleConfirmReject = async () => {
    if (!rejectModalId || !rejectReason.trim() || rejectInFlightRef.current) return;
    rejectInFlightRef.current = true;
    try {
      await rejectMutation.mutateAsync({ id: rejectModalId, reason: rejectReason.trim() });
      showToast({ title: 'Registration rejected successfully.', type: 'success' });
      setRejectModalId(null);
      setRejectReason('');
      if (selectedRequest?.id === rejectModalId) {
        setDrawerOpen(false);
        setSelectedRequest(null);
      }
      refetch();
      refetchStats();
    } catch (err: any) {
      showToast({ title: err?.message || 'Failed to reject registration.', type: 'error' });
    } finally {
      rejectInFlightRef.current = false;
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-7xl mx-auto pb-12">
        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-extrabold text-secondary-900 tracking-tight">Pending Approvals</h1>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
                <Sparkles className="w-3 h-3 mr-1 text-amber-600" /> Action Required
              </span>
            </div>
            <p className="text-sm text-secondary-500 mt-1">
              Review and approve new business, dispatcher, and driver registrations before granting platform access.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                refetch();
                refetchStats();
              }}
              loading={isFetching}
              leftIcon={<RefreshCw className={cn('w-4 h-4', isFetching && 'animate-spin')} />}
            >
              Refresh
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleExportCSV}
              leftIcon={<Download className="w-4 h-4" />}
            >
              Export CSV
            </Button>
          </div>
        </div>

        {/* Top Statistics Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Pending Card */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.05 }}
            className="p-5 rounded-2xl bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/20 shadow-sm relative overflow-hidden group hover:shadow-md transition-shadow"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">Pending Review</p>
                <h3 className="text-3xl font-black text-secondary-900 mt-2">
                  {statsLoading ? <Skeleton variant="text" className="w-16 h-8" /> : statsData?.pending ?? totalItems}
                </h3>
                <p className="text-xs text-amber-700/80 mt-1 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" /> Requires admin sign-off
                </p>
              </div>
              <div className="p-3.5 rounded-2xl bg-amber-500/15 text-amber-600 group-hover:scale-110 transition-transform">
                <UserCheck className="w-6 h-6" />
              </div>
            </div>
          </motion.div>

          {/* Approved Today Card */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
            className="p-5 rounded-2xl bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent border border-emerald-500/20 shadow-sm relative overflow-hidden group hover:shadow-md transition-shadow"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Approved Today</p>
                <h3 className="text-3xl font-black text-secondary-900 mt-2">
                  {statsLoading ? <Skeleton variant="text" className="w-16 h-8" /> : statsData?.approvedToday ?? 0}
                </h3>
                <p className="text-xs text-emerald-700/80 mt-1 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> OTP issued &amp; verified
                </p>
              </div>
              <div className="p-3.5 rounded-2xl bg-emerald-500/15 text-emerald-600 group-hover:scale-110 transition-transform">
                <CheckCircle2 className="w-6 h-6" />
              </div>
            </div>
          </motion.div>

          {/* Rejected Today Card */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.15 }}
            className="p-5 rounded-2xl bg-gradient-to-br from-rose-500/10 via-rose-500/5 to-transparent border border-rose-500/20 shadow-sm relative overflow-hidden group hover:shadow-md transition-shadow"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-rose-700">Rejected Today</p>
                <h3 className="text-3xl font-black text-secondary-900 mt-2">
                  {statsLoading ? <Skeleton variant="text" className="w-16 h-8" /> : statsData?.rejectedToday ?? 0}
                </h3>
                <p className="text-xs text-rose-700/80 mt-1 flex items-center gap-1">
                  <XCircle className="w-3.5 h-3.5" /> Compliance declined
                </p>
              </div>
              <div className="p-3.5 rounded-2xl bg-rose-500/15 text-rose-600 group-hover:scale-110 transition-transform">
                <XCircle className="w-6 h-6" />
              </div>
            </div>
          </motion.div>

          {/* Avg Review Time Card */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.2 }}
            className="p-5 rounded-2xl bg-gradient-to-br from-blue-500/10 via-blue-500/5 to-transparent border border-blue-500/20 shadow-sm relative overflow-hidden group hover:shadow-md transition-shadow"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-blue-700">Avg Review Time</p>
                <h3 className="text-3xl font-black text-secondary-900 mt-2">
                  {statsLoading ? <Skeleton variant="text" className="w-16 h-8" /> : statsData?.avgReviewTime ?? '12m'}
                </h3>
                <p className="text-xs text-blue-700/80 mt-1 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" /> Target &lt; 30 minutes
                </p>
              </div>
              <div className="p-3.5 rounded-2xl bg-blue-500/15 text-blue-600 group-hover:scale-110 transition-transform">
                <Clock className="w-6 h-6" />
              </div>
            </div>
          </motion.div>
        </div>

        {/* Filters Bar */}
        <Card className="p-4 shadow-sm border-secondary-200/80">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {/* Search Input */}
            <div className="lg:col-span-2">
              <Input
                placeholder="Search owner, company, email, or phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                leftIcon={<Search className="w-4 h-4 text-secondary-400" />}
              />
            </div>

            {/* Role Filter */}
            <div>
              <Select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value)}
                options={[
                  { value: 'All', label: 'All Roles' },
                  { value: 'Admin', label: 'Admin' },
                  { value: 'Business Owner', label: 'Business Owner' },
                  { value: 'Dispatcher', label: 'Dispatcher' },
                  { value: 'Driver', label: 'Driver' },
                  { value: 'Employee', label: 'Employee' },
                ]}
              />
            </div>

            {/* Company Filter */}
            <div>
              <Select
                value={selectedCompany}
                onChange={(e) => setSelectedCompany(e.target.value)}
                options={companiesList.map((c) => ({ value: c, label: c === 'All' ? 'All Companies' : c }))}
              />
            </div>

            {/* Reset Filters */}
            <div className="flex items-center justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleResetFilters}
                className="w-full text-secondary-600 hover:text-secondary-900"
                leftIcon={<RotateCcw className="w-4 h-4" />}
              >
                Reset Filters
              </Button>
            </div>
          </div>
        </Card>

        {/* Main Content: Data Table / States */}
        {isLoading ? (
          <Card>
            <div className="p-6 space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between gap-4 py-3 border-b border-secondary-100 last:border-0">
                  <div className="flex items-center gap-3">
                    <Skeleton variant="circular" className="w-10 h-10" />
                    <div>
                      <Skeleton variant="text" className="w-36 h-4" />
                      <Skeleton variant="text" className="w-24 h-3 mt-1" />
                    </div>
                  </div>
                  <Skeleton variant="text" className="w-32 h-4" />
                  <Skeleton variant="text" className="w-20 h-6 rounded-full" />
                  <Skeleton variant="text" className="w-28 h-8 rounded-lg" />
                </div>
              ))}
            </div>
          </Card>
        ) : error ? (
          <Card className="p-12 text-center">
            <div className="max-w-md mx-auto space-y-3">
              <ShieldAlert className="w-12 h-12 text-rose-500 mx-auto" />
              <h3 className="text-lg font-bold text-secondary-900">Failed to load registration approvals</h3>
              <p className="text-sm text-secondary-500">
                {(error as any)?.message || 'An error occurred while fetching pending requests from the backend.'}
              </p>
              <Button variant="primary" size="sm" onClick={() => refetch()} className="mt-4">
                Retry Connection
              </Button>
            </div>
          </Card>
        ) : filteredRequests.length === 0 ? (
          <Card className="p-12 text-center border-dashed border-2 border-secondary-200">
            <div className="max-w-md mx-auto space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-inner">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-xl font-extrabold text-secondary-900">No Pending Approvals</h3>
                <p className="text-sm text-secondary-500 mt-1">
                  You&apos;re completely caught up! All submitted business and driver registration requests have been reviewed.
                </p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => refetch()}
                leftIcon={<RefreshCw className="w-4 h-4" />}
              >
                Refresh Approval Queue
              </Button>
            </div>
          </Card>
        ) : (
          <Card className="overflow-hidden shadow-sm border-secondary-200/80">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-secondary-50/80 border-b border-secondary-200 text-xs font-semibold text-secondary-500 uppercase tracking-wider">
                    <th className="px-6 py-3.5">Applicant / Owner</th>
                    <th className="px-6 py-3.5">Company</th>
                    <th className="px-6 py-3.5">Contact Details</th>
                    <th className="px-6 py-3.5">Requested Role</th>
                    <th className="px-6 py-3.5">Submitted</th>
                    <th className="px-6 py-3.5">Status</th>
                    <th className="px-6 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-secondary-200/70">
                  {filteredRequests.map((request) => {
                    const initials = getInitials(request.firstName, request.lastName);
                    const roleLabel = formatRole(request.requestedRole);

                    return (
                      <motion.tr
                        key={request.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="hover:bg-secondary-50/80 transition-colors cursor-pointer group"
                        onClick={() => {
                          setSelectedRequest(request);
                          setDrawerOpen(true);
                        }}
                      >
                        {/* Applicant */}
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-500 to-indigo-600 text-white font-bold text-sm flex items-center justify-center shadow-sm">
                              {initials}
                            </div>
                            <div>
                              <div className="font-bold text-secondary-900 group-hover:text-primary-600 transition-colors">
                                {request.firstName} {request.lastName}
                              </div>
                              <div className="text-xs text-secondary-500 font-mono">ID: {request.id.slice(0, 8)}</div>
                            </div>
                          </div>
                        </td>

                        {/* Company */}
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2 font-semibold text-secondary-800 text-sm">
                            <Building2 className="w-4 h-4 text-secondary-400" />
                            {request.companyName}
                          </div>
                        </td>

                        {/* Contact */}
                        <td className="px-6 py-4 text-sm text-secondary-600">
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1.5 text-xs text-secondary-700 font-medium">
                              <Mail className="w-3.5 h-3.5 text-secondary-400" />
                              {request.email}
                            </div>
                            <div className="flex items-center gap-1.5 text-xs text-secondary-500">
                              <Phone className="w-3.5 h-3.5 text-secondary-400" />
                              {request.phone}
                            </div>
                          </div>
                        </td>

                        {/* Role Badge */}
                        <td className="px-6 py-4">
                          <Badge variant="pending" className="font-semibold text-xs py-1 px-2.5">
                            {roleLabel}
                          </Badge>
                        </td>

                        {/* Submitted */}
                        <td className="px-6 py-4 text-xs text-secondary-500">
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-secondary-400" />
                            {formatRelativeTime(request.createdAt)}
                          </div>
                        </td>

                        {/* Status */}
                        <td className="px-6 py-4">
                          <StatusBadge status="Pending" />
                        </td>

                        {/* Actions */}
                        <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="primary"
                              size="sm"
                              className="h-8 text-xs font-semibold px-3"
                              onClick={() => setApproveConfirmId(request.id)}
                            >
                              Approve
                            </Button>
                            <Button
                              variant="danger"
                              size="sm"
                              className="h-8 text-xs font-semibold px-3"
                              onClick={() => {
                                setRejectModalId(request.id);
                                setRejectReason('');
                              }}
                            >
                              Reject
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-secondary-500 hover:text-secondary-900"
                              onClick={() => {
                                setSelectedRequest(request);
                                setDrawerOpen(true);
                              }}
                            >
                              <ChevronRight className="w-4 h-4" />
                            </Button>
                          </div>
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Table Footer */}
            <div className="px-6 py-4 bg-secondary-50/50 border-t border-secondary-200 flex items-center justify-between text-xs text-secondary-500">
              <div>
                Showing <span className="font-bold text-secondary-800">{filteredRequests.length}</span> of{' '}
                <span className="font-bold text-secondary-800">{totalItems}</span> pending registration requests
              </div>
              <div className="font-medium text-secondary-600">
                Click any row for applicant documentation &amp; full audit trace.
              </div>
            </div>
          </Card>
        )}
      </div>

      {/* Slide-Over Right-Side Detail Drawer */}
      <AnimatePresence>
        {drawerOpen && selectedRequest && (
          <div className="fixed inset-0 z-50 overflow-hidden">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-secondary-900/60 backdrop-blur-xs"
              onClick={() => setDrawerOpen(false)}
            />

            <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
              <motion.div
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="w-screen max-w-xl bg-white dark:bg-secondary-900 shadow-2xl flex flex-col"
              >
                {/* Drawer Header */}
                <div className="p-6 border-b border-secondary-200 dark:border-secondary-800 flex items-center justify-between bg-secondary-50/50 dark:bg-secondary-800/50">
                  <div>
                    <span className="text-xs font-semibold uppercase tracking-wider text-primary-600">
                      Registration Request
                    </span>
                    <h2 className="text-xl font-bold text-secondary-900 dark:text-white mt-0.5">
                      {selectedRequest.firstName} {selectedRequest.lastName}
                    </h2>
                  </div>
                  <button
                    onClick={() => setDrawerOpen(false)}
                    className="p-2 text-secondary-400 hover:text-secondary-700 dark:hover:text-secondary-200 rounded-full hover:bg-secondary-100 dark:hover:bg-secondary-800 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Drawer Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                  {/* Applicant Profile Summary */}
                  <div className="p-5 rounded-2xl bg-gradient-to-r from-primary-50 to-indigo-50 dark:from-primary-950/30 dark:to-indigo-950/30 border border-primary-100 dark:border-primary-900/50 flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-primary-600 text-white font-bold text-xl flex items-center justify-center shadow-md">
                      {getInitials(selectedRequest.firstName, selectedRequest.lastName)}
                    </div>
                    <div>
                      <h3 className="font-bold text-secondary-900 dark:text-white text-lg">
                        {selectedRequest.firstName} {selectedRequest.lastName}
                      </h3>
                      <p className="text-xs text-secondary-500 font-medium mt-0.5">{selectedRequest.companyName}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <Badge variant="pending" className="text-xs">
                          {formatRole(selectedRequest.requestedRole)}
                        </Badge>
                        <StatusBadge status="Pending Review" />
                      </div>
                    </div>
                  </div>

                  {/* Business & Personal Details */}
                  <div className="space-y-4">
                    <h4 className="text-xs font-bold text-secondary-400 uppercase tracking-wider">
                      Business &amp; Personal Info
                    </h4>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div className="p-3.5 rounded-xl bg-secondary-50 dark:bg-secondary-800/40 border border-secondary-100 dark:border-secondary-800">
                        <p className="text-xs text-secondary-400 font-medium">Company Name</p>
                        <p className="font-semibold text-secondary-900 dark:text-white mt-1">
                          {selectedRequest.companyName}
                        </p>
                      </div>
                      <div className="p-3.5 rounded-xl bg-secondary-50 dark:bg-secondary-800/40 border border-secondary-100 dark:border-secondary-800">
                        <p className="text-xs text-secondary-400 font-medium">Requested Role</p>
                        <p className="font-semibold text-secondary-900 dark:text-white mt-1">
                          {formatRole(selectedRequest.requestedRole)}
                        </p>
                      </div>
                      <div className="p-3.5 rounded-xl bg-secondary-50 dark:bg-secondary-800/40 border border-secondary-100 dark:border-secondary-800">
                        <p className="text-xs text-secondary-400 font-medium">Email Address</p>
                        <p className="font-semibold text-secondary-900 dark:text-white mt-1 truncate">
                          {selectedRequest.email}
                        </p>
                      </div>
                      <div className="p-3.5 rounded-xl bg-secondary-50 dark:bg-secondary-800/40 border border-secondary-100 dark:border-secondary-800">
                        <p className="text-xs text-secondary-400 font-medium">Phone Number</p>
                        <p className="font-semibold text-secondary-900 dark:text-white mt-1">
                          {selectedRequest.phone}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Verification Checklist */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-secondary-400 uppercase tracking-wider">
                      Compliance Checklist
                    </h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-900/40">
                        <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-medium text-xs">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Duplicate Email &amp; Phone Check
                        </div>
                        <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">PASSED</span>
                      </div>

                      <div className="flex items-center justify-between p-3 rounded-xl bg-amber-50/60 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-900/40">
                        <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-medium text-xs">
                          <Clock className="w-4 h-4 text-amber-600" /> Admin Manual Approval
                        </div>
                        <span className="text-xs font-bold text-amber-700 dark:text-amber-400">PENDING</span>
                      </div>

                      <div className="flex items-center justify-between p-3 rounded-xl bg-secondary-50 dark:bg-secondary-800/40 border border-secondary-100 dark:border-secondary-800">
                        <div className="flex items-center gap-2 text-secondary-600 dark:text-secondary-400 font-medium text-xs">
                          <Mail className="w-4 h-4 text-secondary-400" /> Post-Approval OTP Email
                        </div>
                        <span className="text-xs font-bold text-secondary-500">NEXT STEP</span>
                      </div>
                    </div>
                  </div>

                  {/* Timestamps & Identifiers */}
                  <div className="p-4 rounded-xl bg-secondary-50 dark:bg-secondary-800/40 space-y-2 text-xs text-secondary-500">
                    <div className="flex justify-between">
                      <span>Request ID:</span>
                      <span className="font-mono text-secondary-800 dark:text-secondary-300">{selectedRequest.id}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Registration Date:</span>
                      <span className="font-semibold text-secondary-800 dark:text-secondary-300">
                        {new Date(selectedRequest.createdAt).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Drawer Footer Actions */}
                <div className="p-6 border-t border-secondary-200 dark:border-secondary-800 bg-secondary-50/50 dark:bg-secondary-800/50 flex items-center justify-end gap-3">
                  <Button
                    variant="danger"
                    onClick={() => {
                      setRejectModalId(selectedRequest.id);
                      setRejectReason('');
                    }}
                  >
                    Reject Registration
                  </Button>
                  <Button
                    variant="primary"
                    onClick={() => setApproveConfirmId(selectedRequest.id)}
                  >
                    Approve &amp; Send OTP
                  </Button>
                </div>
              </motion.div>
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* Confirm Approve Modal Dialog */}
      <ConfirmDialog
        isOpen={!!approveConfirmId}
        onClose={() => setApproveConfirmId(null)}
        title="Approve Registration?"
        message="The applicant will receive an OTP via email to complete account verification. Their pending status will be updated immediately."
        confirmText="Approve & Send OTP"
        cancelText="Cancel"
        variant="primary"
        loading={approveMutation.isPending}
        onConfirm={handleConfirmApprove}
      />

      {/* Reject Modal Dialog with Required Reason */}
      <Modal
        isOpen={!!rejectModalId}
        onClose={() => setRejectModalId(null)}
        title="Reject Registration Request"
        size="md"
      >
        <div className="space-y-4 pt-2">
          <p className="text-sm text-secondary-600 dark:text-secondary-400">
            Please state the official reason for rejecting this registration request. An automated notice will be emailed to the applicant.
          </p>
          <div>
            <label className="block text-xs font-bold text-secondary-700 dark:text-secondary-300 uppercase tracking-wider mb-1.5">
              Rejection Reason *
            </label>
            <Textarea
              rows={4}
              placeholder="e.g. Unverifiable business credentials or duplicate submission."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-3 pt-3 border-t border-secondary-200 dark:border-secondary-800">
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