'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { getAuthToken, getStoredUser, removeAuthToken, StoredUser } from '@/lib/auth';
import { CustomerTrackingPanel } from '@/components/tracker/CustomerTrackingPanel';
import { StaffPanel } from '@/components/tracker/StaffPanel';

const NAVY = '#0F172A';
const AMBER = '#F97316';

const ADMIN_TIER_ROLES = ['admin', 'super_admin', 'business_owner', 'dispatcher'];
const STAFF_TIER_ROLES = ['employee', 'driver', ...ADMIN_TIER_ROLES];

type Tab = 'tracking' | 'panel';

/** Standalone (no admin sidebar) role-gated tracker page — one shared visual
 * shell for Customer, Staff, Driver, and Admin. Customer gets tracking only;
 * Staff, Driver, and Admin get both tabs, with GR creation reserved for
 * Admin-tier (backend enforces this too — `POST /admin/orders` requires
 * `AdminUser`). Driver currently sees the same Staff Panel table as Staff
 * (view/update any GR) rather than an assigned-only view — the mobile app's
 * `DriverOrderDetailsScreen` already enforces the tighter "assigned GRs
 * only" scope for Driver; this web view has not been narrowed to match yet. */
export default function TrackerPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [user, setUser] = useState<StoredUser | null>(null);
  const [tab, setTab] = useState<Tab>('tracking');

  useEffect(() => {
    const token = getAuthToken();
    const storedUser = getStoredUser();
    if (!token || !storedUser) {
      router.replace('/login');
      return;
    }
    setUser(storedUser);
    setTab(STAFF_TIER_ROLES.includes(storedUser.role) ? 'panel' : 'tracking');
    setMounted(true);
  }, [router]);

  const handleLogout = () => {
    removeAuthToken();
    router.replace('/login');
  };

  if (!mounted || !user) {
    return <div className="min-h-screen bg-[#FAF6EE]" />;
  }

  const canSeeStaffPanel = STAFF_TIER_ROLES.includes(user.role);
  const canCreate = ADMIN_TIER_ROLES.includes(user.role);

  return (
    <div className="min-h-screen bg-[#FAF6EE]">
      <div style={{ backgroundColor: NAVY }} className="px-6 py-5">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div
              className="w-11 h-11 rounded-lg border-2 flex items-center justify-center font-extrabold text-sm flex-shrink-0"
              style={{ borderColor: AMBER, color: AMBER }}
            >
              DH
            </div>
            <div>
              <div className="text-white font-extrabold text-lg leading-tight">DeliveryHub</div>
              <div className="text-slate-300 text-xs">GR Tracking System</div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <div className="text-white text-sm font-semibold">{user.fullName}</div>
              <div className="text-slate-400 text-xs capitalize">{user.role.replace('_', ' ')}</div>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-slate-300 hover:text-white text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-white/10"
            >
              <LogOut className="w-4 h-4" /> Sign Out
            </button>
          </div>
        </div>

        {canSeeStaffPanel && (
          <div className="max-w-5xl mx-auto flex gap-2 mt-5">
            <button
              onClick={() => setTab('tracking')}
              className="px-4 py-2 rounded-t-lg text-sm font-bold transition-colors"
              style={{
                backgroundColor: tab === 'tracking' ? '#FAF6EE' : 'transparent',
                color: tab === 'tracking' ? NAVY : '#CBD5E1',
              }}
            >
              Customer Tracking
            </button>
            <button
              onClick={() => setTab('panel')}
              className="px-4 py-2 rounded-t-lg text-sm font-bold transition-colors"
              style={{
                backgroundColor: tab === 'panel' ? '#FAF6EE' : 'transparent',
                color: tab === 'panel' ? NAVY : '#CBD5E1',
              }}
            >
              Staff Panel
            </button>
          </div>
        )}
      </div>

      <div
        style={{
          height: 4,
          backgroundImage: `repeating-linear-gradient(90deg, ${AMBER} 0 10px, transparent 10px 16px)`,
        }}
      />

      <div className="max-w-5xl mx-auto px-6 py-8">
        {tab === 'tracking' || !canSeeStaffPanel ? (
          <CustomerTrackingPanel />
        ) : (
          <StaffPanel canCreate={canCreate} />
        )}
      </div>
    </div>
  );
}
