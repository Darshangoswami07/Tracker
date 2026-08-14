'use client';

import { cn } from '@/lib/utils';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'pending' | 'approved' | 'rejected' | 'active' | 'suspended';
  size?: 'sm' | 'md';
  className?: string;
}

export function Badge({ children, variant = 'default', size = 'md', className }: BadgeProps) {
  const baseStyles = 'inline-flex items-center font-medium rounded-full';

  const variants = {
    default: 'bg-secondary-100 text-secondary-700',
    primary: 'bg-primary-100 text-primary-700',
    success: 'bg-green-100 text-green-700',
    warning: 'bg-yellow-100 text-yellow-700',
    danger: 'bg-red-100 text-red-700',
    info: 'bg-blue-100 text-blue-700',
    pending: 'bg-yellow-100 text-yellow-700',
    approved: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-700',
    active: 'bg-green-100 text-green-700',
    suspended: 'bg-gray-100 text-gray-700',
  };

  const sizes = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-sm',
  };

  return (
    <span className={cn(baseStyles, variants[variant], sizes[size], className)}>
      {children}
    </span>
  );
}

interface StatusBadgeProps {
  status: string;
  className?: string;
}

const statusVariantMap: Record<string, BadgeProps['variant']> = {
  pending: 'pending',
  approved: 'approved',
  rejected: 'rejected',
  active: 'active',
  suspended: 'suspended',
  in_progress: 'info',
  in_transit: 'info',
  pickup: 'primary',
  returned: 'warning',
  completed: 'success',
  cancelled: 'danger',
  assigned: 'primary',
  picked_up: 'info',
  delivered: 'success',
  failed: 'danger',
  online: 'success',
  offline: 'default',
  on_trip: 'primary',
  available: 'success',
  busy: 'warning',
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const variant = statusVariantMap[status.toLowerCase()] || 'default';
  const label = status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' ');

  return <Badge variant={variant} className={className}>{label}</Badge>;
}