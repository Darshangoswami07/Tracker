'use client';

import { cn } from '@/lib/utils';
import { Button } from './Button';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
    variant?: 'primary' | 'secondary';
  };
  className?: string;
  illustration?: React.ReactNode;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  illustration,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center py-16 px-4',
        className
      )}
    >
      {illustration || (
        <div className={cn(
          'w-16 h-16 rounded-2xl flex items-center justify-center mb-6',
          'bg-secondary-100 text-secondary-400'
        )}>
          {icon || (
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )}
        </div>
      )}
      <h3 className="text-lg font-semibold text-secondary-900 mb-2">{title}</h3>
      {description && (
        <p className="text-secondary-500 max-w-sm mb-6">{description}</p>
      )}
      {action && (
        <Button variant={action.variant || 'primary'} onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}

export function TableEmptyState({
  message = 'No data available',
  description,
  action,
}: {
  message?: string;
  description?: string;
  action?: EmptyStateProps['action'];
}) {
  return (
    <div className="card overflow-hidden">
      <div className="p-12">
        <EmptyState
          title={message}
          description={description}
          action={action}
        />
      </div>
    </div>
  );
}

export function PageEmptyState({
  title = 'Nothing here yet',
  description = 'Get started by creating your first item.',
  action,
}: {
  title?: string;
  description?: string;
  action?: EmptyStateProps['action'];
}) {
  return (
    <div className="min-h-[400px] flex items-center justify-center">
      <EmptyState title={title} description={description} action={action} />
    </div>
  );
}