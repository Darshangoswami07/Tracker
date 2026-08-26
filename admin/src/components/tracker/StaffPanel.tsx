'use client';

import { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Loader2, Camera, FileCheck2 } from 'lucide-react';
import Link from 'next/link';
import { api, endpoints } from '@/lib/api/client';
import { GRStatus } from '@/types/gr';

const NAVY = '#0F172A';
const AMBER = '#F97316';

const STATUS_OPTIONS: { value: GRStatus; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'cleared', label: 'Cleared' },
  { value: 'uncleared', label: 'Uncleared' },
  { value: 'delivered', label: 'Delivered' },
];

interface SharedOrderRow {
  id: string;
  orderNumber: string;
  status: GRStatus;
  pickupAddress: string;
  deliveryAddress: string;
  consignorName: string | null;
  consigneeName: string | null;
  hasSlip: boolean;
}

/** Lists via `/employee/orders` (any authenticated role, not Admin-tier-only)
 * — unlike `admin/src/hooks/useGR.ts`'s `useGRList`, which hits
 * `/admin/orders` and 403s for Staff/Driver. This is why the Staff Panel has
 * its own small data layer instead of reusing the Admin GR page's hooks. */
function useSharedOrderList(search: string) {
  return useQuery({
    queryKey: ['shared-orders', search],
    queryFn: async () => {
      const params = new URLSearchParams({ page: '1', page_size: '50' });
      if (search) params.set('search', search);
      const response = await api.get<any>(`${endpoints.sharedOrders.list}?${params.toString()}`);
      return response.data as { items: SharedOrderRow[] };
    },
    staleTime: 5000,
  });
}

function useSharedUpdateStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: GRStatus }) =>
      api.patch(endpoints.sharedOrders.updateStatus(id), { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['shared-orders'] }),
  });
}

function useSharedUploadSlip() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, file }: { id: string; file: File }) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('fileKind', 'generic');
      return api.post(endpoints.sharedOrders.uploadAttachment(id), formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['shared-orders'] }),
  });
}

/** The GR table view matching the "Staff Panel" reference design. Shared by
 * the standalone `/tracker` role-gated experience (Staff, Driver, Admin).
 * `canCreate` controls the "+ New Entry" button — GR creation is Admin-tier
 * only server-side (`POST /admin/orders` requires `AdminUser`), so Staff and
 * Driver never see it. */
export function StaffPanel({ canCreate }: { canCreate: boolean }) {
  const [search, setSearch] = useState('');
  const { data, isLoading } = useSharedOrderList(search);
  const updateStatus = useSharedUpdateStatus();
  const uploadSlip = useSharedUploadSlip();
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  const grs = data?.items || [];

  const handleFileChange = async (id: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingId(id);
    try {
      await uploadSlip.mutateAsync({ id, file });
    } finally {
      setUploadingId(null);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <input
          type="text"
          placeholder="Search GR No, Consignor, Consignee..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[220px] px-4 py-2.5 rounded-xl border border-secondary-200 bg-white focus:outline-none focus:ring-2"
          style={{ ['--tw-ring-color' as any]: AMBER }}
        />
        {canCreate && (
          <Link
            href="/dashboard/orders"
            className="px-4 py-2.5 rounded-xl font-bold text-white flex items-center gap-2 text-sm flex-shrink-0"
            style={{ backgroundColor: NAVY }}
          >
            <Plus className="w-4 h-4" /> New Entry
          </Link>
        )}
      </div>

      <div className="bg-white rounded-xl border border-secondary-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: NAVY }}>
                <th className="text-left px-4 py-3 text-white font-bold text-xs uppercase tracking-wide">GR No</th>
                <th className="text-left px-4 py-3 text-white font-bold text-xs uppercase tracking-wide">Consignor / Consignee</th>
                <th className="text-left px-4 py-3 text-white font-bold text-xs uppercase tracking-wide">Route</th>
                <th className="text-left px-4 py-3 text-white font-bold text-xs uppercase tracking-wide">Status</th>
                <th className="text-left px-4 py-3 text-white font-bold text-xs uppercase tracking-wide">Photo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-secondary-100">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-secondary-400">
                    <Loader2 className="w-5 h-5 animate-spin inline" />
                  </td>
                </tr>
              ) : grs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-secondary-400">No GR entries found.</td>
                </tr>
              ) : (
                grs.map((gr) => (
                  <tr key={gr.id} className="hover:bg-secondary-50">
                    <td className="px-4 py-3 font-bold text-secondary-900">{gr.orderNumber}</td>
                    <td className="px-4 py-3 text-secondary-700">
                      {gr.consignorName || '—'} → {gr.consigneeName || '—'}
                    </td>
                    <td className="px-4 py-3 text-secondary-700">
                      {gr.pickupAddress} → {gr.deliveryAddress}
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={gr.status}
                        onChange={(e) =>
                          updateStatus.mutate({ id: gr.id, status: e.target.value as GRStatus })
                        }
                        className="px-2.5 py-1.5 rounded-lg border border-secondary-200 text-xs font-semibold bg-white"
                      >
                        {STATUS_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <input
                        ref={(el) => { fileInputs.current[gr.id] = el; }}
                        type="file"
                        accept="image/jpeg,image/png,application/pdf"
                        className="hidden"
                        onChange={(e) => handleFileChange(gr.id, e)}
                      />
                      <button
                        onClick={() => fileInputs.current[gr.id]?.click()}
                        disabled={uploadingId === gr.id}
                        className="flex items-center gap-1.5 text-xs font-bold px-2.5 py-1.5 rounded-lg"
                        style={{ color: gr.hasSlip ? '#059669' : '#B45309', backgroundColor: gr.hasSlip ? '#05966915' : `${AMBER}15` }}
                      >
                        {uploadingId === gr.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : gr.hasSlip ? (
                          <FileCheck2 className="w-3.5 h-3.5" />
                        ) : (
                          <Camera className="w-3.5 h-3.5" />
                        )}
                        {gr.hasSlip ? 'Slip on file' : 'Upload'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
