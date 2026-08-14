'use client';

import { useState, useRef, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Search,
  Plus,
  RefreshCw,
  Package,
  MapPin,
  User,
  FileText,
  Upload,
  Download,
  X,
  ChevronRight,
  ShieldAlert,
  Truck,
  Eye,
  ImageOff,
} from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';
import { getStoredUser, getAuthToken } from '@/lib/auth';
import { downloadAttachment } from '@/lib/downloadAttachment';
import {
  useGRList,
  useGRDetail,
  useCreateGR,
  useUpdateGRStatus,
  useUploadSlip,
  useCompanies,
} from '@/hooks';
import {
  Card,
  Button,
  Badge,
  StatusBadge,
  Input,
  Select,
  Modal,
  Textarea,
  useToast,
  Skeleton,
  EmptyState,
} from '@/components/ui';
import { formatDate, cn } from '@/lib/utils';
import { GR, GRStatus } from '@/types/gr';

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: 'All', label: 'All Statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'assigned', label: 'Assigned' },
  { value: 'pickup', label: 'Pickup' },
  { value: 'in_transit', label: 'In Transit' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'failed', label: 'Failed' },
  { value: 'returned', label: 'Returned' },
  { value: 'cancelled', label: 'Cancelled' },
];

const STATUS_OPTIONS: { value: GRStatus; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'assigned', label: 'Assigned' },
  { value: 'pickup', label: 'Pickup' },
  { value: 'in_transit', label: 'In Transit' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'failed', label: 'Failed' },
  { value: 'returned', label: 'Returned' },
  { value: 'cancelled', label: 'Cancelled' },
];

// Slip/Documents upload — mirrors the server's allow-list in
// backend/app/services/storage_service.py (ALLOWED_SLIP_MIME_TYPES) and
// MAX_UPLOAD_SIZE. The server independently re-validates both; this is only
// to reject obviously-bad files before spending an upload round trip.
const ALLOWED_SLIP_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_SLIP_FILE_SIZE = 10 * 1024 * 1024;

/** Fetches an attachment's file with the bearer token attached and exposes it
 * as an object URL for inline `<img>` preview. The attachment endpoint
 * requires auth (GRAccessUser), so a plain `<img src>` would 401 — the
 * browser never sends the Authorization header for image requests. */
function useAttachmentPreview(url: string | null) {
  const [state, setState] = useState<{ status: 'idle' | 'loading' | 'ready' | 'error'; objectUrl?: string }>({
    status: 'idle',
  });

  useEffect(() => {
    if (!url) {
      setState({ status: 'idle' });
      return;
    }
    let cancelled = false;
    let objectUrl: string | undefined;
    setState({ status: 'loading' });
    (async () => {
      try {
        const token = getAuthToken();
        const response = await fetch(url, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        if (!response.ok) throw new Error(`Failed to load preview (${response.status}).`);
        const blob = await response.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setState({ status: 'ready', objectUrl });
      } catch {
        if (!cancelled) setState({ status: 'error' });
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);

  return state;
}

export default function GRShipmentsPage() {
  const { showToast } = useToast();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const { data, isLoading, error, refetch, isFetching } = useGRList({
    page,
    pageSize: 20,
    status: statusFilter === 'All' ? undefined : statusFilter,
    search: search || undefined,
  });

  const grs = data?.items || [];
  const total = data?.total || 0;

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-7xl mx-auto pb-12">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold text-secondary-900 tracking-tight">GR / Shipments</h1>
            <p className="text-sm text-secondary-500 mt-1">
              Create and track transport GR entries, assign staff/drivers, and manage slip uploads.
            </p>
          </div>
          <div className="flex items-center gap-3">
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
              Create GR
            </Button>
          </div>
        </div>

        <Card className="p-4 shadow-sm border-secondary-200/80">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="lg:col-span-2">
              <Input
                placeholder="Search GR number, consignor, consignee..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                leftIcon={<Search className="w-4 h-4 text-secondary-400" />}
              />
            </div>
            <div>
              <Select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
                options={STATUS_FILTERS}
              />
            </div>
          </div>
        </Card>

        {isLoading ? (
          <Card>
            <div className="p-6 space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} variant="text" className="w-full h-12" />
              ))}
            </div>
          </Card>
        ) : error ? (
          <Card className="p-12 text-center">
            <ShieldAlert className="w-12 h-12 text-rose-500 mx-auto mb-3" />
            <h3 className="text-lg font-bold text-secondary-900">Failed to load GRs</h3>
            <p className="text-sm text-secondary-500 mt-1">{(error as any)?.message}</p>
            <Button variant="primary" size="sm" onClick={() => refetch()} className="mt-4">
              Retry
            </Button>
          </Card>
        ) : grs.length === 0 ? (
          <EmptyState
            icon={<Package className="w-8 h-8" />}
            title="No GR entries found"
            description={search || statusFilter !== 'All' ? 'Try adjusting your search or filters.' : 'Create your first GR to get started.'}
          />
        ) : (
          <Card className="overflow-hidden shadow-sm border-secondary-200/80">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-secondary-50/80 border-b border-secondary-200 text-xs font-semibold text-secondary-500 uppercase tracking-wider">
                    <th className="px-6 py-3.5">GR No</th>
                    <th className="px-6 py-3.5">Consignor / Consignee</th>
                    <th className="px-6 py-3.5">Route</th>
                    <th className="px-6 py-3.5">Slip</th>
                    <th className="px-6 py-3.5">Status</th>
                    <th className="px-6 py-3.5">Created</th>
                    <th className="px-6 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-secondary-200/70">
                  {grs.map((gr) => (
                    <tr
                      key={gr.id}
                      className="hover:bg-secondary-50/80 transition-colors cursor-pointer"
                      onClick={() => setSelectedId(gr.id)}
                    >
                      <td className="px-6 py-4 font-bold text-secondary-900 font-mono text-sm">{gr.orderNumber}</td>
                      <td className="px-6 py-4 text-sm">
                        <div className="font-semibold text-secondary-800">{gr.consignorName || '—'}</div>
                        <div className="text-xs text-secondary-500">→ {gr.consigneeName || '—'}</div>
                      </td>
                      <td className="px-6 py-4 text-xs text-secondary-600">
                        <div className="flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-secondary-400" />
                          {gr.pickupAddress} → {gr.deliveryAddress}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {gr.hasSlip ? (
                          <Badge variant="success" size="sm">
                            <FileText className="w-3 h-3 mr-1" /> Uploaded
                          </Badge>
                        ) : (
                          <Badge variant="default" size="sm">None</Badge>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge status={gr.status} />
                      </td>
                      <td className="px-6 py-4 text-xs text-secondary-500">{formatDate(gr.createdAt)}</td>
                      <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="sm" onClick={() => setSelectedId(gr.id)}>
                          <ChevronRight className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-6 py-4 bg-secondary-50/50 border-t border-secondary-200 flex items-center justify-between text-xs text-secondary-500">
              <div>
                Showing <span className="font-bold text-secondary-800">{grs.length}</span> of{' '}
                <span className="font-bold text-secondary-800">{total}</span> GR entries
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={grs.length < 20}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </Card>
        )}
      </div>

      <CreateGRModal isOpen={createOpen} onClose={() => setCreateOpen(false)} onSuccess={() => showToast({ title: 'GR created successfully.', type: 'success' })} />
      <GRDetailDrawer id={selectedId} onClose={() => setSelectedId(null)} />
    </DashboardLayout>
  );
}

// --------------------------------------------------------------------------- //
// Create GR modal
// --------------------------------------------------------------------------- //
function CreateGRModal({ isOpen, onClose, onSuccess }: { isOpen: boolean; onClose: () => void; onSuccess: () => void }) {
  const { showToast } = useToast();
  const createMutation = useCreateGR();
  const { data: companiesData } = useCompanies();
  const companies = companiesData?.items || [];

  // Only Super Admin picks a company — Company Admin always creates GRs
  // under their own company (the backend enforces this too, ignoring any
  // companyId sent by a non-Super-Admin caller).
  const currentUser = getStoredUser();
  const isSuperAdminTier = ['admin', 'super_admin', 'dispatcher'].includes(currentUser?.role || '');
  const ownCompanyId = currentUser?.companyId || '';

  const [form, setForm] = useState({
    grNumber: '',
    companyId: isSuperAdminTier ? '' : ownCompanyId,
    consignorName: '',
    consigneeName: '',
    pickupAddress: '',
    deliveryAddress: '',
    pickupTime: '',
    particulars: '',
    packageCount: '',
    weight: '',
  });

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const canSubmit =
    form.grNumber.trim() &&
    form.companyId &&
    form.consignorName.trim() &&
    form.consigneeName.trim() &&
    form.pickupAddress.trim() &&
    form.deliveryAddress.trim() &&
    form.pickupTime;

  const handleSubmit = async () => {
    try {
      await createMutation.mutateAsync({
        grNumber: form.grNumber.trim(),
        companyId: form.companyId,
        consignorName: form.consignorName.trim(),
        consigneeName: form.consigneeName.trim(),
        pickupAddress: form.pickupAddress.trim(),
        deliveryAddress: form.deliveryAddress.trim(),
        pickupTime: new Date(form.pickupTime).toISOString(),
        particulars: form.particulars.trim() || undefined,
        packageCount: form.packageCount ? Number(form.packageCount) : undefined,
        weight: form.weight ? Number(form.weight) : undefined,
      });
      onSuccess();
      onClose();
      setForm({
        grNumber: '',
        companyId: isSuperAdminTier ? '' : ownCompanyId,
        consignorName: '',
        consigneeName: '',
        pickupAddress: '',
        deliveryAddress: '',
        pickupTime: '',
        particulars: '',
        packageCount: '',
        weight: '',
      });
    } catch (err: any) {
      showToast({ title: err?.message || 'Failed to create GR.', type: 'error' });
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create GR" size="lg">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Input label="GR Number" value={form.grNumber} onChange={set('grNumber')} placeholder="GR006404" />
          {isSuperAdminTier ? (
            <Select
              label="Company"
              value={form.companyId}
              onChange={set('companyId') as any}
              options={companies.map((c) => ({ value: c.id, label: c.name }))}
              placeholder="Select company"
            />
          ) : (
            <Input
              label="Company"
              value={companies.find((c) => c.id === ownCompanyId)?.name || 'Your company'}
              disabled
            />
          )}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Input label="Consignor" value={form.consignorName} onChange={set('consignorName')} placeholder="Sender name" />
          <Input label="Consignee" value={form.consigneeName} onChange={set('consigneeName')} placeholder="Receiver name" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Input label="From (Pickup)" value={form.pickupAddress} onChange={set('pickupAddress')} placeholder="Haldwani" />
          <Input label="To (Delivery)" value={form.deliveryAddress} onChange={set('deliveryAddress')} placeholder="Bageshwar" />
        </div>
        <Input label="Pickup Date/Time" type="datetime-local" value={form.pickupTime} onChange={set('pickupTime')} />
        <Textarea label="Particulars" value={form.particulars} onChange={set('particulars')} placeholder="Goods description" rows={2} />
        <div className="grid grid-cols-2 gap-4">
          <Input label="Package Count" type="number" value={form.packageCount} onChange={set('packageCount')} placeholder="3" />
          <Input label="Weight (kg)" type="number" value={form.weight} onChange={set('weight')} placeholder="45.5" />
        </div>
      </div>
      <Modal.Footer>
        <Button variant="ghost" onClick={onClose} disabled={createMutation.isPending}>
          Cancel
        </Button>
        <Button variant="primary" onClick={handleSubmit} disabled={!canSubmit} loading={createMutation.isPending}>
          Create GR
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

// --------------------------------------------------------------------------- //
// GR detail drawer (view, status update, slip upload)
// --------------------------------------------------------------------------- //
function GRDetailDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { showToast } = useToast();
  const { data: gr, isLoading, refetch } = useGRDetail(id);
  const updateStatusMutation = useUpdateGRStatus();
  const uploadMutation = useUploadSlip();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const currentSlip = gr?.attachments?.[0] ?? null;
  const olderAttachments = gr?.attachments?.slice(1) ?? [];
  const isImageSlip = !!currentSlip && currentSlip.mimeType.startsWith('image/');
  const slipPreview = useAttachmentPreview(isImageSlip ? currentSlip!.url : null);

  useEffect(() => {
    setLightboxOpen(false);
  }, [id]);

  const handleStatusChange = async (status: GRStatus) => {
    if (!id) return;
    try {
      await updateStatusMutation.mutateAsync({ id, status });
      showToast({ title: 'GR status updated.', type: 'success' });
    } catch (err: any) {
      showToast({ title: err?.message || 'Failed to update status.', type: 'error' });
    }
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (!file || !id) return;

    if (!ALLOWED_SLIP_MIME_TYPES.includes(file.type)) {
      showToast({ title: 'Unsupported file type. Upload a JPG, PNG, WEBP, or PDF.', type: 'error' });
      return;
    }
    if (file.size > MAX_SLIP_FILE_SIZE) {
      showToast({ title: 'File is too large. Maximum size is 10 MB.', type: 'error' });
      return;
    }

    try {
      await uploadMutation.mutateAsync({ id, file });
      showToast({ title: 'Slip uploaded successfully.', type: 'success' });
      refetch();
    } catch (err: any) {
      showToast({ title: err?.message || 'Failed to upload slip. Please try again.', type: 'error' });
    }
  };

  return (
    <AnimatePresence>
      {id && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.5 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-secondary-900/60 backdrop-blur-xs"
            onClick={onClose}
          />
          <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="w-screen max-w-xl bg-white shadow-2xl flex flex-col"
            >
              <div className="p-6 border-b border-secondary-200 flex items-center justify-between bg-secondary-50/50">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-primary-600">GR Details</span>
                  <h2 className="text-xl font-bold text-secondary-900 mt-0.5 font-mono">{gr?.orderNumber ?? '...'}</h2>
                </div>
                <button onClick={onClose} className="p-2 text-secondary-400 hover:text-secondary-700 rounded-full hover:bg-secondary-100">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {isLoading || !gr ? (
                  <div className="space-y-3">
                    <Skeleton variant="text" className="w-full h-6" />
                    <Skeleton variant="text" className="w-full h-6" />
                    <Skeleton variant="text" className="w-full h-6" />
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-3">
                      <StatusBadge status={gr.status} />
                      {gr.trackingCode && (
                        <span className="text-xs text-secondary-500 font-mono">Tracking: {gr.trackingCode}</span>
                      )}
                    </div>

                    <div className="space-y-2">
                      <h4 className="text-xs font-bold text-secondary-400 uppercase tracking-wider">Route</h4>
                      <div className="p-3.5 rounded-xl bg-secondary-50 border border-secondary-100 text-sm space-y-1">
                        <div className="flex items-center gap-2">
                          <MapPin className="w-4 h-4 text-emerald-500" /> {gr.pickupAddress}
                        </div>
                        <div className="flex items-center gap-2">
                          <MapPin className="w-4 h-4 text-rose-500" /> {gr.deliveryAddress}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div className="p-3.5 rounded-xl bg-secondary-50 border border-secondary-100">
                        <p className="text-xs text-secondary-400 font-medium">Consignor</p>
                        <p className="font-semibold text-secondary-900 mt-1">{gr.consignorName || '—'}</p>
                      </div>
                      <div className="p-3.5 rounded-xl bg-secondary-50 border border-secondary-100">
                        <p className="text-xs text-secondary-400 font-medium">Consignee</p>
                        <p className="font-semibold text-secondary-900 mt-1">{gr.consigneeName || '—'}</p>
                      </div>
                      <div className="p-3.5 rounded-xl bg-secondary-50 border border-secondary-100">
                        <p className="text-xs text-secondary-400 font-medium">Package Count</p>
                        <p className="font-semibold text-secondary-900 mt-1">{gr.packageCount ?? '—'}</p>
                      </div>
                      <div className="p-3.5 rounded-xl bg-secondary-50 border border-secondary-100">
                        <p className="text-xs text-secondary-400 font-medium">Weight</p>
                        <p className="font-semibold text-secondary-900 mt-1">{gr.weight ? `${gr.weight} kg` : '—'}</p>
                      </div>
                    </div>

                    {gr.particulars && (
                      <div className="p-3.5 rounded-xl bg-secondary-50 border border-secondary-100 text-sm">
                        <p className="text-xs text-secondary-400 font-medium">Particulars</p>
                        <p className="font-semibold text-secondary-900 mt-1">{gr.particulars}</p>
                      </div>
                    )}

                    <div className="space-y-2">
                      <h4 className="text-xs font-bold text-secondary-400 uppercase tracking-wider">Update Status</h4>
                      <Select
                        value={gr.status}
                        onChange={(e) => handleStatusChange(e.target.value as GRStatus)}
                        options={STATUS_OPTIONS}
                      />
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold text-secondary-400 uppercase tracking-wider">Slip / Documents</h4>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/jpeg,image/png,image/webp,application/pdf"
                          className="hidden"
                          onChange={handleFileSelected}
                        />
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={uploadMutation.isPending}
                          loading={uploadMutation.isPending}
                          leftIcon={<Upload className="w-4 h-4" />}
                        >
                          {gr.attachments.length > 0 ? 'Replace Slip' : 'Upload Slip'}
                        </Button>
                      </div>

                      {uploadMutation.isPending && (
                        <p className="text-sm text-secondary-500">Uploading slip...</p>
                      )}

                      {gr.attachments.length === 0 && !uploadMutation.isPending ? (
                        <p className="text-sm text-secondary-500">No slip or photos uploaded yet.</p>
                      ) : null}

                      {currentSlip && (
                        <div className="space-y-2">
                          {isImageSlip ? (
                            <>
                              <button
                                type="button"
                                onClick={() => setLightboxOpen(true)}
                                className="block w-full aspect-video rounded-xl overflow-hidden border border-secondary-100 bg-secondary-50"
                              >
                                {slipPreview.status === 'ready' && slipPreview.objectUrl ? (
                                  <img
                                    src={slipPreview.objectUrl}
                                    alt="Slip preview"
                                    className="w-full h-full object-contain"
                                  />
                                ) : slipPreview.status === 'error' ? (
                                  <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 text-secondary-400">
                                    <ImageOff className="w-5 h-5" />
                                    <span className="text-xs">Failed to load preview</span>
                                  </div>
                                ) : (
                                  <Skeleton variant="rectangular" className="w-full h-full" />
                                )}
                              </button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setLightboxOpen(true)}
                                disabled={slipPreview.status !== 'ready'}
                                leftIcon={<Eye className="w-4 h-4" />}
                              >
                                View Full Size
                              </Button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                downloadAttachment(currentSlip.url, currentSlip.originalFilename).catch(() =>
                                  showToast({ title: 'Failed to download attachment.', type: 'error' })
                                )
                              }
                              className="w-full flex items-center justify-between p-3 rounded-xl bg-secondary-50 border border-secondary-100 hover:bg-secondary-100 transition-colors text-sm cursor-pointer"
                            >
                              <div className="flex items-center gap-2 text-secondary-800">
                                <FileText className="w-4 h-4 text-secondary-400" />
                                {currentSlip.originalFilename}
                              </div>
                              <Download className="w-4 h-4 text-secondary-400" />
                            </button>
                          )}
                        </div>
                      )}

                      {olderAttachments.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-xs text-secondary-400 font-medium">Previous uploads</p>
                          {olderAttachments.map((a) => (
                            <button
                              key={a.id}
                              type="button"
                              onClick={() =>
                                downloadAttachment(a.url, a.originalFilename).catch(() =>
                                  showToast({ title: 'Failed to download attachment.', type: 'error' })
                                )
                              }
                              className="w-full flex items-center justify-between p-3 rounded-xl bg-secondary-50 border border-secondary-100 hover:bg-secondary-100 transition-colors text-sm cursor-pointer"
                            >
                              <div className="flex items-center gap-2 text-secondary-800">
                                <FileText className="w-4 h-4 text-secondary-400" />
                                {a.originalFilename}
                              </div>
                              <Download className="w-4 h-4 text-secondary-400" />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          </div>

          {currentSlip && isImageSlip && (
            <Modal
              isOpen={lightboxOpen}
              onClose={() => setLightboxOpen(false)}
              title={currentSlip.originalFilename}
              size="full"
            >
              {slipPreview.status === 'ready' && slipPreview.objectUrl ? (
                <img
                  src={slipPreview.objectUrl}
                  alt="Slip full size"
                  className="w-full max-h-[75vh] object-contain rounded-xl"
                />
              ) : (
                <p className="text-sm text-secondary-500">Loading preview…</p>
              )}
            </Modal>
          )}
        </div>
      )}
    </AnimatePresence>
  );
}
