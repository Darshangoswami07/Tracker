'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { User, Mail, Phone, Shield, Building2, Moon, Sun, LogOut, RefreshCw, ShieldAlert } from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardHeader, CardTitle, CardContent, Button, Skeleton, StatusBadge, useToast } from '@/components/ui';
import { api } from '@/lib/api/client';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '@/contexts/ThemeContext';
import { removeAuthToken, getStoredUser } from '@/lib/auth';
import { formatDate, cn } from '@/lib/utils';

interface MeUser {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  role: string;
  companyId: string | null;
  profileImage: string | null;
  isActive: boolean;
  status: string;
  createdAt: string;
  updatedAt: string;
}

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  business_owner: 'Business Owner',
  business: 'Business',
  dispatcher: 'Dispatcher',
  driver: 'Driver',
  employee: 'Employee',
  customer: 'Customer',
};

async function fetchMe(): Promise<MeUser> {
  const response = await api.get<any>('/users/me');
  return response.data;
}

export default function SettingsPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const { theme, toggleTheme } = useTheme();
  const [signingOut, setSigningOut] = useState(false);

  const { data: me, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['settings-me'],
    queryFn: fetchMe,
    staleTime: 30000,
  });

  const stored = getStoredUser();
  const roleLabel = (me?.role && ROLE_LABELS[me.role]) || me?.role || stored?.role || 'Unknown';

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await api.post('/auth/logout').catch(() => {});
    } finally {
      removeAuthToken();
      router.replace('/login');
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-secondary-900">Settings</h1>
            <p className="text-secondary-500 mt-1">Account profile and preferences.</p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => refetch()} loading={isFetching} leftIcon={<RefreshCw className={cn('w-4 h-4', isFetching && 'animate-spin')} />}>
            Refresh
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle subtitle="Your profile from the live account endpoint">Account</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} variant="text" className="w-full h-10" />)}</div>
              ) : error ? (
                <div className="text-center py-8">
                  <ShieldAlert className="w-10 h-10 text-rose-500 mx-auto mb-3" />
                  <p className="text-sm text-secondary-500">{(error as any)?.message}</p>
                </div>
              ) : me ? (
                <div className="space-y-5">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-secondary-900 text-white flex items-center justify-center text-xl font-bold">
                      {me.fullName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-lg font-bold text-secondary-900">{me.fullName}</p>
                      <StatusBadge status={me.status} />
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 text-sm">
                      <Mail className="w-4 h-4 text-secondary-400" />
                      <span className="text-secondary-700">{me.email}</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <Phone className="w-4 h-4 text-secondary-400" />
                      <span className="text-secondary-700">{me.phone || '—'}</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <Shield className="w-4 h-4 text-secondary-400" />
                      <span className="text-secondary-700">{roleLabel}</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <Building2 className="w-4 h-4 text-secondary-400" />
                      <span className="text-secondary-700">{me.companyId || 'Platform-wide (no company scope)'}</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <User className="w-4 h-4 text-secondary-400" />
                      <span className="text-secondary-700">Member since {formatDate(me.createdAt)}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-secondary-500 text-center py-8">Sign in to view your profile.</p>
              )}
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle subtitle="Switch between light and dark appearance">Appearance</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {theme === 'dark' ? <Moon className="w-5 h-5 text-secondary-600" /> : <Sun className="w-5 h-5 text-secondary-600" />}
                    <div>
                      <p className="text-sm font-semibold text-secondary-900">{theme === 'dark' ? 'Dark mode' : 'Light mode'}</p>
                      <p className="text-xs text-secondary-500">Currently enabled</p>
                    </div>
                  </div>
                  <Button variant="secondary" size="sm" onClick={toggleTheme}>
                    Switch to {theme === 'dark' ? 'Light' : 'Dark'}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle subtitle="End your session on this device">Session</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-secondary-600 mb-4">
                  Signing out clears your stored tokens and returns you to the login screen.
                </p>
                <Button variant="danger" onClick={handleSignOut} loading={signingOut} leftIcon={<LogOut className="w-4 h-4" />}>
                  Sign Out
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}