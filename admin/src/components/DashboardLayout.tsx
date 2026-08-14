'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState as useClientState } from 'react';
import { getAuthToken, getStoredUser, removeAuthToken, StoredUser } from '@/lib/auth';
import {
  LayoutDashboard,
  Users,
  Truck,
  Package,
  MapPin,
  Settings,
  BarChart3,
  LogOut,
  Menu,
  X,
  Shield,
  Building2,
  UserCheck,
  Clock,
  DollarSign,
  TrendingUp,
  Search,
  UserCog,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const ADMIN_TIER_ROLES = ['admin', 'super_admin', 'business_owner', 'dispatcher'];

// Sidebar items, each tagged with a stable key so visibility can be driven
// purely by role (never by company name — every company gets the same menu
// for the same role, per the multi-tenant requirement).
const navigation = [
  { key: 'dashboard', name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { key: 'approvals', name: 'Pending Approvals', href: '/dashboard/approvals', icon: UserCheck },
  { key: 'staff-approvals', name: 'Pending Staff Approvals', href: '/dashboard/staff-approvals', icon: UserCheck },
  { key: 'users', name: 'Users', href: '/dashboard/users', icon: Users },
  { key: 'staff', name: 'Staff', href: '/dashboard/staff', icon: UserCog },
  { key: 'companies', name: 'Companies', href: '/dashboard/companies', icon: Building2 },
  { key: 'drivers', name: 'Drivers', href: '/dashboard/drivers', icon: Truck },
  { key: 'vehicles', name: 'Vehicles', href: '/dashboard/vehicles', icon: Truck },
  { key: 'orders', name: 'GR / Shipments', href: '/dashboard/orders', icon: Package },
  { key: 'tracking', name: 'Customer Tracking', href: '/dashboard/tracking', icon: Search },
  { key: 'tracker-classic', name: 'GR Tracker (Classic)', href: '/tracker', icon: Search },
  { key: 'map', name: 'Live Map', href: '/dashboard/map', icon: MapPin },
  { key: 'analytics', name: 'Analytics', href: '/dashboard/analytics', icon: BarChart3 },
  { key: 'settings', name: 'Settings', href: '/dashboard/settings', icon: Settings },
];

// Super Admin (admin/super_admin/dispatcher) sees every module, including
// platform-level "Companies" management. Company Admin (business_owner) is
// tenant-scoped and never manages the companies table itself. Staff/Driver
// never reach this shell at all (redirected to /tracker below), but are
// listed here for completeness/robustness.
const NAV_BY_ROLE: Record<string, string[] | 'all'> = {
  super_admin: 'all',
  admin: 'all',
  dispatcher: 'all',
  business_owner: [
    'dashboard', 'approvals', 'staff-approvals', 'users', 'staff', 'drivers',
    'vehicles', 'orders', 'tracking', 'tracker-classic', 'map', 'analytics', 'settings',
  ],
  employee: ['orders', 'tracking', 'tracker-classic'],
  driver: ['orders', 'tracking', 'tracker-classic'],
};

function visibleNavigation(role: string | undefined) {
  const allowed = role ? NAV_BY_ROLE[role] : undefined;
  if (allowed === 'all' || !allowed) return navigation;
  return navigation.filter((item) => allowed.includes(item.key));
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mounted, setMounted] = useClientState(false);
  const [user, setUser] = useClientState<StoredUser | null>(null);

  useEffect(() => {
    // Defense-in-depth UX guard only — the backend is the real authorization
    // boundary (every API call here already requires AdminUser). This just
    // avoids showing Customer/Staff a broken admin shell if they land here
    // directly (e.g. a stale bookmark from before /tracker existed).
    const token = getAuthToken();
    const storedUser = getStoredUser();
    if (!token) {
      router.replace('/login');
      return;
    }
    if (storedUser && !ADMIN_TIER_ROLES.includes(storedUser.role)) {
      router.replace('/tracker');
      return;
    }
    setUser(storedUser);
    setMounted(true);
  }, [router]);

  const handleSignOut = () => {
    removeAuthToken();
    router.replace('/login');
  };

  const roleLabel = (role: string | undefined) => {
    switch (role) {
      case 'super_admin': return 'Super Admin';
      case 'admin': return 'Admin';
      case 'business_owner': return 'Company Admin';
      case 'business': return 'Company Admin';
      case 'dispatcher': return 'Dispatcher';
      case 'employee': return 'Staff';
      case 'driver': return 'Driver';
      default: return role ?? 'Unknown';
    }
  };

  if (!mounted) {
    return (
      <div className="min-h-screen bg-secondary-50">
        <div className="fixed inset-0 z-40 bg-white border-r border-secondary-200" />
        <div className="fixed inset-0 z-50 bg-white w-64 border-r border-secondary-200" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-secondary-50">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-secondary-200 transform transition-transform duration-300 ease-in-out lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
        aria-label="Sidebar navigation"
      >
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="flex h-16 items-center justify-between px-6 border-b border-secondary-200">
            <Link href="/dashboard" className="flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-600">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <span className="text-xl font-bold text-secondary-900">DeliveryHub</span>
            </Link>
            <button
              className="lg:hidden p-2 rounded-lg text-secondary-500 hover:bg-secondary-100"
              onClick={() => setSidebarOpen(false)}
              aria-label="Close sidebar"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4 space-y-1 overflow-y-auto" aria-label="Main navigation">
            {visibleNavigation(user?.role).map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary-50 text-primary-700'
                      : 'text-secondary-600 hover:bg-secondary-50 hover:text-secondary-900'
                  )}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <item.icon className={cn('w-5 h-5 flex-shrink-0', isActive ? 'text-primary-600' : 'text-secondary-400')} aria-hidden="true" />
                  {item.name}
                </Link>
              );
            })}
          </nav>

          {/* User section */}
          <div className="p-4 border-t border-secondary-200">
            <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-secondary-50">
              <div className="w-9 h-9 rounded-xl bg-primary-100 flex items-center justify-center">
                <Shield className="w-5 h-5 text-primary-600" aria-hidden="true" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-secondary-900 truncate">{user?.fullName || 'Loading...'}</p>
                <p className="text-xs text-secondary-500 truncate">{roleLabel(user?.role)}</p>
              </div>
            </div>
            <button
              onClick={handleSignOut}
              className="mt-3 w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-secondary-600 rounded-xl hover:bg-secondary-100 transition-colors"
            >
              <LogOut className="w-4 h-4" aria-hidden="true" />
              Sign Out
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="lg:pl-64 min-h-screen">
        <div className="p-6 lg:p-8">
          {children}
        </div>
      </main>

      {/* Mobile menu button */}
      <button
        className="fixed bottom-6 right-6 z-50 lg:hidden p-3 rounded-full bg-primary-600 text-white shadow-lg"
        onClick={() => setSidebarOpen(true)}
        aria-label="Open menu"
      >
        <Menu className="w-6 h-6" aria-hidden="true" />
      </button>
    </div>
  );
}