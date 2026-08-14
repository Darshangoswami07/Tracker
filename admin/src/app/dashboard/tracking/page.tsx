'use client';

import DashboardLayout from '@/components/DashboardLayout';
import { CustomerTrackingPanel } from '@/components/tracker/CustomerTrackingPanel';

const NAVY = '#0F172A';
const AMBER = '#F97316';

export default function CustomerTrackingPage() {
  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto space-y-6 pb-12">
        <div>
          <h1 className="text-2xl font-extrabold text-secondary-900 tracking-tight">Customer Tracking</h1>
          <p className="text-sm text-secondary-500 mt-1">
            Look up any GR by number — the same view a customer sees when tracking their shipment.
          </p>
        </div>

        <div className="rounded-2xl overflow-hidden shadow-sm border border-secondary-200">
          <div style={{ backgroundColor: NAVY }} className="px-6 py-5">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-lg border-2 flex items-center justify-center font-extrabold text-sm"
                style={{ borderColor: AMBER, color: AMBER }}
              >
                DH
              </div>
              <div>
                <div className="text-white font-extrabold text-lg">DeliveryHub</div>
                <div className="text-slate-300 text-xs">GR Tracking System</div>
              </div>
            </div>
          </div>
          <div style={{ backgroundColor: AMBER, height: 4, opacity: 0.85 }} />

          <div className="bg-[#FAF6EE] p-6">
            <CustomerTrackingPanel />
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
