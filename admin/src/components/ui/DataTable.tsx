'use client';

import {
  useState,
  useMemo,
  useRef,
  useEffect,
  createContext,
  useContext,
  ReactNode,
} from 'react';
import {
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Check,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './Button';
import { Input } from './Input';

export interface Column<T> {
  key: string;
  header: string;
  accessor: (row: T) => ReactNode;
  sortable?: boolean;
  filterable?: boolean;
  width?: string;
  align?: 'left' | 'center' | 'right';
  render?: (value: any, row: T) => ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyAccessor: (row: T) => string;
  isLoading?: boolean;
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
  selection?: {
    enabled: boolean;
    selectedKeys: Set<string>;
    onSelectionChange: (keys: Set<string>) => void;
  };
  pagination?: {
    enabled: boolean;
    page: number;
    pageSize: number;
    total: number;
    onPageChange: (page: number) => void;
    onPageSizeChange: (pageSize: number) => void;
  };
  sorting?: {
    enabled: boolean;
    sortColumn?: string;
    sortDirection?: 'asc' | 'desc';
    onSortChange: (column: string, direction: 'asc' | 'desc') => void;
  };
  filtering?: {
    enabled: boolean;
    filters: Record<string, string>;
    onFilterChange: (filters: Record<string, string>) => void;
  };
  toolbar?: ReactNode;
  rowClassName?: (row: T) => string;
}

function Checkbox({ checked, indeterminate, onChange, disabled, className }: {
  checked?: boolean;
  indeterminate?: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.indeterminate = indeterminate || false;
    }
  }, [indeterminate]);

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange?.(e.target.checked)}
      disabled={disabled}
      className={cn(
        'w-4 h-4 rounded border-secondary-300 text-primary-600 focus:ring-primary-500',
        'cursor-pointer transition-colors',
        disabled && 'opacity-50 cursor-not-allowed',
        className
      )}
    />
  );
}

export function DataTable<T>({
  columns,
  data,
  keyAccessor,
  isLoading = false,
  emptyMessage = 'No data available',
  onRowClick,
  selection,
  pagination,
  sorting,
  filtering,
  toolbar,
  rowClassName,
}: DataTableProps<T>) {
  const [sortColumn, setSortColumn] = useState<string | undefined>(sorting?.sortColumn);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>(sorting?.sortDirection || 'asc');
  const [filters, setFilters] = useState<Record<string, string>>(filtering?.filters || {});
  const [showFilters, setShowFilters] = useState(false);

  const handleSort = (columnKey: string) => {
    if (!sorting?.enabled) return;

    if (sortColumn === columnKey) {
      const newDirection = sortDirection === 'asc' ? 'desc' : 'asc';
      setSortDirection(newDirection);
      sorting.onSortChange(columnKey, newDirection);
    } else {
      setSortColumn(columnKey);
      setSortDirection('asc');
      sorting.onSortChange(columnKey, 'asc');
    }
  };

  const handleFilterChange = (columnKey: string, value: string) => {
    if (!filtering?.enabled) return;

    const newFilters = { ...filters, [columnKey]: value };
    setFilters(newFilters);
    filtering.onFilterChange(newFilters);
  };

  const handleFilterInputChange = (columnKey: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFilterChange(columnKey, e.target.value);
  };

  const processedData = useMemo(() => {
    let result = [...data];

    if (sorting?.enabled && sortColumn) {
      const column = columns.find((c) => c.key === sortColumn);
      if (column) {
        result.sort((a, b) => {
          const aVal = column.accessor(a);
          const bVal = column.accessor(b);
          const aStr = String(aVal).toLowerCase();
          const bStr = String(bVal).toLowerCase();
          if (sortDirection === 'asc') {
            return aStr > bStr ? 1 : -1;
          }
          return aStr < bStr ? 1 : -1;
        });
      }
    }

    return result;
  }, [data, columns, sortColumn, sortDirection, sorting?.enabled]);

  const paginatedData = useMemo(() => {
    if (!pagination?.enabled) return processedData;
    const start = (pagination.page - 1) * pagination.pageSize;
    return processedData.slice(start, start + pagination.pageSize);
  }, [processedData, pagination]);

  if (isLoading) {
    return (
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full" role="grid">
            <thead>
              <tr className="bg-secondary-50">
                {columns.map((column) => (
                  <th
                    key={column.key}
                    className="px-4 py-3 text-left text-xs font-semibold text-secondary-500 uppercase tracking-wider"
                    style={{ width: column.width }}
                  >
                    <div className="animate-pulse bg-secondary-200 h-4 w-3/4 rounded" />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-secondary-200">
              {Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  {columns.map((column) => (
                    <td key={column.key} className="px-4 py-4">
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

  return (
    <div className="card overflow-hidden">
      {toolbar && (
        <div className="p-4 border-b border-secondary-200">
          {toolbar}
        </div>
      )}

      {filtering?.enabled && (
        <div className={cn('border-b border-secondary-200 transition-all duration-200', showFilters ? '' : 'hidden')}>
          <div className="p-4 bg-secondary-50">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {columns
                .filter((c) => c.filterable)
                .map((column) => (
                  <div key={column.key}>
                    <label className="label text-xs">{column.header}</label>
                    <Input
                      placeholder={`Filter ${column.header}...`}
                      value={filters[column.key] || ''}
                      onChange={handleFilterInputChange(column.key)}
                      className="mt-1"
                    />
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full" role="grid">
          <thead>
            <tr className="bg-secondary-50">
              {selection?.enabled && (
                <th className="px-4 py-3 text-left w-12">
                  <Checkbox
                    checked={selection.selectedKeys.size === paginatedData.length && paginatedData.length > 0}
                    indeterminate={selection.selectedKeys.size > 0 && selection.selectedKeys.size < paginatedData.length}
                    onChange={(checked) => {
                      if (checked) {
                        selection.onSelectionChange(
                          new Set(paginatedData.map(keyAccessor))
                        );
                      } else {
                        selection.onSelectionChange(new Set());
                      }
                    }}
                  />
                </th>
              )}
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={cn(
                    'px-4 py-3 text-left text-xs font-semibold text-secondary-500 uppercase tracking-wider',
                    column.sortable && sorting?.enabled && 'cursor-pointer hover:bg-secondary-100 select-none',
                    column.align === 'center' && 'text-center',
                    column.align === 'right' && 'text-right'
                  )}
                  style={{ width: column.width }}
                  onClick={() => column.sortable && sorting?.enabled && handleSort(column.key)}
                >
                  <div className="flex items-center gap-1">
                    {column.header}
                    {column.sortable && sorting?.enabled && sortColumn === column.key && (
                      <span className="text-primary-600">
                        {sortDirection === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </span>
                    )}
                    {column.sortable && sorting?.enabled && sortColumn !== column.key && (
                      <ChevronsUpDown className="w-4 h-4 text-secondary-300" />
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-secondary-200">
            {paginatedData.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (selection?.enabled ? 1 : 0)} className="px-4 py-12 text-center text-secondary-500">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              paginatedData.map((row) => {
                const rowKey = keyAccessor(row);
                const isSelected = selection?.selectedKeys.has(rowKey);

                return (
                  <tr
                    key={rowKey}
                    className={cn(
                      'hover:bg-secondary-50 transition-colors',
                      isSelected && 'bg-primary-50',
                      onRowClick && 'cursor-pointer',
                      rowClassName?.(row)
                    )}
                    onClick={() => onRowClick?.(row)}
                  >
                    {selection?.enabled && (
                      <td className="px-4 py-4">
                        <Checkbox
                          checked={isSelected}
                          onChange={(checked) => {
                            const newSelection = new Set(selection.selectedKeys);
                            if (checked) {
                              newSelection.add(rowKey);
                            } else {
                              newSelection.delete(rowKey);
                            }
                            selection.onSelectionChange(newSelection);
                          }}
                        />
                      </td>
                    )}
                    {columns.map((column) => (
                      <td
                        key={column.key}
                        className={cn(
                          'px-4 py-4',
                          column.align === 'center' && 'text-center',
                          column.align === 'right' && 'text-right'
                        )}
                      >
                        {column.render
                          ? column.render(column.accessor(row), row)
                          : column.accessor(row)}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {pagination?.enabled && (
        <div className="p-4 border-t border-secondary-200 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-sm text-secondary-500">
            Showing{' '}
            <span className="font-medium">
              {((pagination.page - 1) * pagination.pageSize) + 1}
            </span>{' '}
            to{' '}
            <span className="font-medium">
              {Math.min(pagination.page * pagination.pageSize, pagination.total)}
            </span>{' '}
            of{' '}
            <span className="font-medium">{pagination.total}</span>{' '}
            results
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-secondary-500">Rows per page:</span>
              <select
                value={pagination.pageSize}
                onChange={(e) => pagination.onPageSizeChange(Number(e.target.value))}
                className="input w-auto py-1.5 text-sm"
              >
                {[10, 20, 50, 100].map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => pagination.onPageChange(pagination.page - 1)}
                disabled={pagination.page <= 1}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm text-secondary-600">
                Page {pagination.page} of {Math.ceil(pagination.total / pagination.pageSize) || 1}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => pagination.onPageChange(pagination.page + 1)}
                disabled={pagination.page >= Math.ceil(pagination.total / pagination.pageSize)}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {filtering?.enabled && (
        <button
          className="absolute top-4 right-4 btn btn-ghost btn-sm"
          onClick={() => setShowFilters(!showFilters)}
        >
          {showFilters ? 'Hide Filters' : 'Show Filters'}
        </button>
      )}
    </div>
  );
}