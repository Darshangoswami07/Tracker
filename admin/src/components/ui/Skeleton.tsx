'use client';

import { cn } from '@/lib/utils';

interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'circular' | 'rectangular' | 'card';
  width?: string | number;
  height?: string | number;
  lines?: number;
}

export function Skeleton({ className, variant = 'text', width, height, lines = 1 }: SkeletonProps) {
  if (variant === 'card') {
    return (
      <div className={cn('animate-pulse space-y-4', className)}>
        <div className="h-6 bg-secondary-200 rounded w-3/4" />
        <div className="h-4 bg-secondary-200 rounded w-1/2" />
        <div className="h-4 bg-secondary-200 rounded w-1/3" />
        <div className="h-32 bg-secondary-200 rounded-xl" />
        <div className="flex gap-2">
          <div className="h-8 bg-secondary-200 rounded w-20" />
          <div className="h-8 bg-secondary-200 rounded w-20" />
        </div>
      </div>
    );
  }

  if (variant === 'circular') {
    return (
      <div
        className={cn('animate-pulse bg-secondary-200 rounded-full', className)}
        style={{ width, height }}
      />
    );
  }

  if (variant === 'rectangular') {
    return (
      <div
        className={cn('animate-pulse bg-secondary-200 rounded-lg', className)}
        style={{ width, height }}
      />
    );
  }

  return (
    <div className={cn('animate-pulse space-y-2', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="bg-secondary-200 rounded h-4"
          style={{
            width: i === lines - 1 && width ? width : '100%',
            height,
          }}
        />
      ))}
    </div>
  );
}

export function TableSkeleton({ columns = 6, rows = 5 }: { columns?: number; rows?: number }) {
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-secondary-50">
              {Array.from({ length: columns }).map((_, i) => (
                <th key={i} className="px-4 py-3 text-left">
                  <div className="animate-pulse bg-secondary-200 h-4 w-3/4 rounded" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-secondary-200">
            {Array.from({ length: rows }).map((_, rowIndex) => (
              <tr key={rowIndex}>
                {Array.from({ length: columns }).map((_, colIndex) => (
                  <td key={colIndex} className="px-4 py-4">
                    <div className="animate-pulse bg-secondary-100 h-4 w-3/4 rounded" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function CardSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} variant="card" />
      ))}
    </div>
  );
}

export function StatCardSkeleton() {
  return (
    <Skeleton variant="card" className="p-6" />
  );
}