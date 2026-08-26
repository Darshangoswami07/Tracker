'use client';

import { useState } from 'react';
import { Search, Loader2, AlertCircle, Image as ImageIcon } from 'lucide-react';
import { api, endpoints } from '@/lib/api/client';
import { formatDate } from '@/lib/utils';
import { downloadAttachment } from '@/lib/downloadAttachment';

const AMBER = '#F97316';

const STATUS_STEPS = ['pending', 'uncleared', 'cleared', 'delivered'];
const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  uncleared: 'Uncleared',
  cleared: 'Cleared',
  delivered: 'Delivered',
};

interface TrackedShipment {
  id: string;
  orderNumber: string;
  status: string;
  createdAt: string;
  pickupAddress: string;
  deliveryAddress: string;
  consignorName?: string;
  consigneeName?: string;
  particulars?: string;
  packageCount?: number;
  weight?: number;
  customerName?: string;
  customerPhone?: string;
  attachments: { id: string; originalFilename: string; url: string }[];
}

/** GR-number search + result card. Shared by the Admin dashboard's standalone
 * "Customer Tracking" page and the role-gated `/tracker` tab experience —
 * kept as one component so the tracking behaviour never drifts between the two. */
export function CustomerTrackingPanel() {
  const [grNumber, setGrNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shipment, setShipment] = useState<TrackedShipment | null>(null);

  const handleTrack = async () => {
    const trimmed = grNumber.trim();
    if (!trimmed) return;
    setLoading(true);
    setSearched(true);
    setError(null);
    setShipment(null);
    try {
      const response = await api.get<any>(endpoints.gr.track(trimmed));
      setShipment(response.data);
    } catch (err: any) {
      setError(err?.message || 'No shipment found with that GR number.');
    } finally {
      setLoading(false);
    }
  };

  const activeStepIndex = shipment ? STATUS_STEPS.indexOf(shipment.status) : -1;

  return (
    <div>
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary-400" />
          <input
            type="text"
            placeholder="Enter GR Number"
            className="w-full pl-10 pr-4 py-3 rounded-xl border border-secondary-200 bg-white focus:outline-none focus:ring-2"
            style={{ ['--tw-ring-color' as any]: AMBER }}
            value={grNumber}
            onChange={(e) => setGrNumber(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleTrack()}
          />
        </div>
        <button
          onClick={handleTrack}
          disabled={loading || !grNumber.trim()}
          className="px-6 rounded-xl font-bold text-secondary-900 disabled:opacity-50 flex items-center gap-2"
          style={{ backgroundColor: AMBER }}
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Track
        </button>
      </div>

      {searched && !loading && error && (
        <div className="mt-6 flex flex-col items-center text-center py-8 gap-2">
          <AlertCircle className="w-10 h-10 text-rose-400" />
          <p className="text-secondary-600 font-medium">{error}</p>
        </div>
      )}

      {shipment && (
        <div className="mt-6 bg-white rounded-xl border border-secondary-200 p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-xs text-secondary-400 font-semibold uppercase">GR No</p>
              <p className="text-xl font-extrabold text-secondary-900">{shipment.orderNumber}</p>
              <p className="text-xs text-secondary-500 mt-1">{formatDate(shipment.createdAt)}</p>
            </div>
            <span
              className="px-3 py-1.5 rounded-full text-xs font-bold"
              style={{ backgroundColor: `${AMBER}20`, color: '#B45309' }}
            >
              {(STATUS_LABELS[shipment.status] || shipment.status).toUpperCase()}
            </span>
          </div>

          <div className="flex items-center mb-1">
            {STATUS_STEPS.map((step, i) => (
              <div key={step} className="flex items-center flex-1">
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: i <= activeStepIndex ? AMBER : '#E5E7EB' }}
                />
                {i < STATUS_STEPS.length - 1 && (
                  <div className="flex-1 h-0.5" style={{ backgroundColor: i < activeStepIndex ? AMBER : '#E5E7EB' }} />
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-between text-xs text-secondary-500 font-medium mb-6">
            <span>Pending</span>
            <span>Delivered</span>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-secondary-100">
            <div>
              <p className="text-[10px] text-secondary-400 font-bold uppercase tracking-wide">Consignor</p>
              <p className="text-sm font-semibold text-secondary-900 mt-1">{shipment.consignorName || '—'}</p>
            </div>
            <div>
              <p className="text-[10px] text-secondary-400 font-bold uppercase tracking-wide">Consignee</p>
              <p className="text-sm font-semibold text-secondary-900 mt-1">{shipment.consigneeName || '—'}</p>
            </div>
            <div>
              <p className="text-[10px] text-secondary-400 font-bold uppercase tracking-wide">From → To</p>
              <p className="text-sm font-semibold text-secondary-900 mt-1">{shipment.pickupAddress} → {shipment.deliveryAddress}</p>
            </div>
            <div>
              <p className="text-[10px] text-secondary-400 font-bold uppercase tracking-wide">Delivery At</p>
              <p className="text-sm font-semibold text-secondary-900 mt-1">
                {shipment.customerName || '—'}{shipment.customerPhone ? `, Ph: ${shipment.customerPhone}` : ''}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 pt-4 mt-4 border-t border-secondary-100">
            <div className="col-span-2">
              <p className="text-[10px] text-secondary-400 font-bold uppercase tracking-wide">Particulars</p>
              <p className="text-sm font-semibold text-secondary-900 mt-1">{shipment.particulars || '—'}</p>
            </div>
            <div>
              <p className="text-[10px] text-secondary-400 font-bold uppercase tracking-wide">Packages</p>
              <p className="text-sm font-semibold text-secondary-900 mt-1">{shipment.packageCount ?? '—'}</p>
            </div>
          </div>

          <div className="pt-4 mt-4 border-t border-secondary-100">
            <p className="text-[10px] text-secondary-400 font-bold uppercase tracking-wide mb-2">Photos / Slip</p>
            {shipment.attachments.length === 0 ? (
              <p className="text-sm text-secondary-400 italic">No photos uploaded yet.</p>
            ) : (
              <div className="space-y-2">
                {shipment.attachments.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() =>
                      downloadAttachment(a.url, a.originalFilename).catch(() =>
                        alert('Failed to download attachment.')
                      )
                    }
                    className="w-full flex items-center gap-2 p-2.5 rounded-lg bg-secondary-50 hover:bg-secondary-100 text-sm text-secondary-800 font-medium cursor-pointer text-left"
                  >
                    <ImageIcon className="w-4 h-4 text-secondary-400" /> {a.originalFilename}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
