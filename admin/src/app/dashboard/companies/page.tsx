'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import DashboardLayout from '@/components/DashboardLayout';
import { Search, Filter, Truck, Building2, Plus, MoreVertical, Edit, Trash2, Eye, MapPin, Wrench, Fuel, CheckCircle, Users } from 'lucide-react';
import { cn, formatRelativeTime, formatNumber } from '@/lib/utils';
import { api, endpoints } from '@/lib/api/client';
import { useCreateCompany, useUpdateCompany, useDeleteCompany, CompanyInput } from '@/hooks/useGR';
import { Modal, ConfirmDialog, Input, Button, useToast } from '@/components/ui';

interface Company {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  status: string;
  employees: number;
  fleet: number;
  branches: number;
  logo: string | null;
  createdAt: string;
}

async function fetchCompanies(): Promise<Company[]> {
  const response = await api.get<any>(`${endpoints.admin.companies}?page_size=100`);
  return response.data.items;
}

const statusColors = {
  active: 'badge-active',
  pending: 'badge-pending',
  rejected: 'badge-rejected',
  suspended: 'badge-suspended',
  closed: 'badge-rejected',
};

export default function CompaniesPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('All');
  const [sortColumn, setSortColumn] = useState<'name' | 'email' | 'employees' | 'fleet' | 'createdAt'>('createdAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [viewingCompany, setViewingCompany] = useState<Company | null>(null);
  const [deletingCompany, setDeletingCompany] = useState<Company | null>(null);
  const { showToast } = useToast();
  const deleteMutation = useDeleteCompany();

  const statusOptions = ['All', 'Active', 'Suspended', 'Closed'];

  const { data: companies = [], isLoading } = useQuery({
    queryKey: ['admin-companies'],
    queryFn: fetchCompanies,
  });

  const filteredCompanies = companies.filter((company) => {
    const matchesSearch =
      company.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (company.email ?? '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (company.phone ?? '').includes(searchQuery) ||
      (company.address ?? '').toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = selectedStatus === 'All' || company.status === selectedStatus.toLowerCase();
    
    return matchesSearch && matchesStatus;
  });

  const sortedCompanies = [...filteredCompanies].sort((a, b) => {
    let aVal: string | number = a[sortColumn] as string | number;
    let bVal: string | number = b[sortColumn] as string | number;
    
    if (sortColumn === 'createdAt') {
      aVal = new Date(String(aVal)).getTime();
      bVal = new Date(String(bVal)).getTime();
    }
    
    if (typeof aVal === 'string') {
      aVal = aVal.toLowerCase();
      bVal = String(bVal).toLowerCase();
    }
    
    if (sortDirection === 'asc') {
      return aVal > bVal ? 1 : -1;
    }
    return aVal < bVal ? 1 : -1;
  });

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column as typeof sortColumn);
      setSortDirection('asc');
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-secondary-900">Company Management</h1>
            <p className="text-secondary-500 mt-1">Manage all companies and their details</p>
          </div>
          <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Add Company
          </button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="card p-6 card-hover">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-secondary-500">Total Companies</p>
                <p className="text-3xl font-bold text-secondary-900 mt-2">{companies.length}</p>
              </div>
              <div className="p-3 rounded-xl text-blue-600 bg-blue-50">
                <Building2 className="w-6 h-6" />
              </div>
            </div>
          </div>
          <div className="card p-6 card-hover">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-secondary-500">Active Companies</p>
                <p className="text-3xl font-bold text-secondary-900 mt-2">{companies.filter(c => c.status === 'active').length}</p>
              </div>
              <div className="p-3 rounded-xl text-green-600 bg-green-50">
                <CheckCircle className="w-6 h-6" />
              </div>
            </div>
          </div>
          <div className="card p-6 card-hover">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-secondary-500">Total Employees</p>
                <p className="text-3xl font-bold text-secondary-900 mt-2">{formatNumber(companies.reduce((sum, c) => sum + c.employees, 0))}</p>
              </div>
              <div className="p-3 rounded-xl text-purple-600 bg-purple-50">
                <Users className="w-6 h-6" />
              </div>
            </div>
          </div>
          <div className="card p-6 card-hover">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-secondary-500">Total Fleet</p>
                <p className="text-3xl font-bold text-secondary-900 mt-2">{formatNumber(companies.reduce((sum, c) => sum + c.fleet, 0))}</p>
              </div>
              <div className="p-3 rounded-xl text-orange-600 bg-orange-50">
                <Truck className="w-6 h-6" />
              </div>
            </div>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="card p-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-secondary-400" />
              <input
                type="text"
                placeholder="Search by name, email, phone, or address..."
                className="input pl-10"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            
            <div className="flex flex-wrap gap-2">
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="input w-auto"
              >
                <option value="All">All Statuses</option>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
                <option value="closed">Closed</option>
              </select>
            </div>
          </div>
        </div>

        {/* Companies Table */}
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-secondary-50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-500 uppercase tracking-wider">Logo</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-500 uppercase tracking-wider">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-500 uppercase tracking-wider">Contact</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-500 uppercase tracking-wider">Address</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-500 uppercase tracking-wider">Branches</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-500 uppercase tracking-wider">Employees</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-500 uppercase tracking-wider">Fleet</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-500 uppercase tracking-wider">Created</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-secondary-200">
                {isLoading ? (
                  <tr><td colSpan={10} className="px-4 py-8 text-center text-secondary-400">Loading companies…</td></tr>
                ) : sortedCompanies.length === 0 ? (
                  <tr><td colSpan={10} className="px-4 py-8 text-center text-secondary-400">No companies found.</td></tr>
                ) : sortedCompanies.map((company) => (
                  <tr key={company.id} className="hover:bg-secondary-50">
                    <td className="px-4 py-4">
                      <div className="w-10 h-10 rounded-lg bg-secondary-100 flex items-center justify-center">
                        <Building2 className="w-5 h-5 text-secondary-400" />
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="font-medium text-secondary-900">{company.name}</div>
                    </td>
                    <td className="px-4 py-4 text-sm text-secondary-600">
                      <div>{company.email ?? '—'}</div>
                      <div>{company.phone ?? '—'}</div>
                    </td>
                    <td className="px-4 py-4 text-sm text-secondary-600 max-w-xs truncate">{company.address ?? '—'}</td>
                    <td className="px-4 py-4 text-sm text-secondary-600">{company.branches}</td>
                    <td className="px-4 py-4 text-sm text-secondary-600">{formatNumber(company.employees)}</td>
                    <td className="px-4 py-4 text-sm text-secondary-600">{formatNumber(company.fleet)}</td>
                    <td className="px-4 py-4">
                      <span className={cn('badge', statusColors[company.status as keyof typeof statusColors] || 'badge-pending')}>
                        {company.status.charAt(0).toUpperCase() + company.status.slice(1)}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-sm text-secondary-600">
                      {new Date(company.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <button className="btn btn-ghost btn-sm" title="View Details" onClick={() => setViewingCompany(company)}>
                          <Eye className="w-4 h-4" />
                        </button>
                        <button className="btn btn-ghost btn-sm" title="Edit" onClick={() => setEditingCompany(company)}>
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          className="btn btn-ghost btn-sm text-red-600 hover:text-red-700 hover:bg-red-50"
                          title="Delete"
                          onClick={() => setDeletingCompany(company)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="p-4 border-t border-secondary-200 flex items-center justify-between">
            <div className="text-sm text-secondary-500">
              Showing 1 to {sortedCompanies.length} of {sortedCompanies.length} results
            </div>
            <div className="flex items-center gap-2">
              <button className="btn btn-ghost btn-sm" disabled>Previous</button>
              <button className="btn btn-primary btn-sm">1</button>
              <button className="btn btn-ghost btn-sm">Next</button>
            </div>
          </div>
        </div>
      </div>

      <CompanyFormModal
        isOpen={showCreateModal}
        title="Add Company"
        onClose={() => setShowCreateModal(false)}
      />

      <CompanyFormModal
        isOpen={!!editingCompany}
        title="Edit Company"
        company={editingCompany}
        onClose={() => setEditingCompany(null)}
      />

      <Modal isOpen={!!viewingCompany} onClose={() => setViewingCompany(null)} title={viewingCompany?.name} size="md">
        {viewingCompany && (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-secondary-400 text-xs font-medium">Email</p>
                <p className="text-secondary-900 font-medium">{viewingCompany.email ?? '—'}</p>
              </div>
              <div>
                <p className="text-secondary-400 text-xs font-medium">Phone</p>
                <p className="text-secondary-900 font-medium">{viewingCompany.phone ?? '—'}</p>
              </div>
            </div>
            <div>
              <p className="text-secondary-400 text-xs font-medium">Address</p>
              <p className="text-secondary-900 font-medium">{viewingCompany.address ?? '—'}</p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="text-secondary-400 text-xs font-medium">Status</p>
                <p className="text-secondary-900 font-medium capitalize">{viewingCompany.status}</p>
              </div>
              <div>
                <p className="text-secondary-400 text-xs font-medium">Employees</p>
                <p className="text-secondary-900 font-medium">{viewingCompany.employees}</p>
              </div>
              <div>
                <p className="text-secondary-400 text-xs font-medium">Fleet</p>
                <p className="text-secondary-900 font-medium">{viewingCompany.fleet}</p>
              </div>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        isOpen={!!deletingCompany}
        onClose={() => setDeletingCompany(null)}
        title="Delete Company"
        message={`Delete "${deletingCompany?.name}"? This cannot be undone from the UI.`}
        confirmText="Delete"
        variant="danger"
        loading={deleteMutation.isPending}
        onConfirm={async () => {
          if (!deletingCompany) return;
          try {
            await deleteMutation.mutateAsync(deletingCompany.id);
            showToast({ title: 'Company deleted.', type: 'success' });
          } catch (err: any) {
            showToast({ title: err?.message || 'Failed to delete company.', type: 'error' });
          }
        }}
      />
    </DashboardLayout>
  );
}

// --------------------------------------------------------------------------- //
// Create / Edit company modal
// --------------------------------------------------------------------------- //
function CompanyFormModal({
  isOpen,
  title,
  company,
  onClose,
}: {
  isOpen: boolean;
  title: string;
  company?: Company | null;
  onClose: () => void;
}) {
  const { showToast } = useToast();
  const createMutation = useCreateCompany();
  const updateMutation = useUpdateCompany();
  const isEdit = !!company;

  const [form, setForm] = useState<CompanyInput>({
    name: company?.name || '',
    email: company?.email || '',
    phone: company?.phone || '',
    address: company?.address || '',
  });

  // Reset local form state whenever the modal is opened for a different company.
  const [lastCompanyId, setLastCompanyId] = useState<string | null | undefined>(company?.id);
  if (isOpen && company?.id !== lastCompanyId) {
    setLastCompanyId(company?.id ?? null);
    setForm({
      name: company?.name || '',
      email: company?.email || '',
      phone: company?.phone || '',
      address: company?.address || '',
    });
  }

  const set = (key: keyof CompanyInput) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const mutation = isEdit ? updateMutation : createMutation;
  const canSubmit = form.name.trim().length > 0;

  const handleSubmit = async () => {
    try {
      const input: CompanyInput = {
        name: form.name.trim(),
        email: form.email?.trim() || undefined,
        phone: form.phone?.trim() || undefined,
        address: form.address?.trim() || undefined,
      };
      if (isEdit && company) {
        await updateMutation.mutateAsync({ id: company.id, input });
        showToast({ title: 'Company updated.', type: 'success' });
      } else {
        await createMutation.mutateAsync(input);
        showToast({ title: 'Company created.', type: 'success' });
      }
      onClose();
    } catch (err: any) {
      showToast({ title: err?.message || 'Failed to save company.', type: 'error' });
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="md">
      <div className="space-y-4">
        <Input label="Company Name" value={form.name} onChange={set('name')} placeholder="Acme Logistics" />
        <Input label="Email" value={form.email} onChange={set('email')} placeholder="ops@acme.com" />
        <Input label="Phone" value={form.phone} onChange={set('phone')} placeholder="+91 98765 43210" />
        <Input label="Address" value={form.address} onChange={set('address')} placeholder="123 Main St, City" />
      </div>
      <Modal.Footer>
        <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
          Cancel
        </Button>
        <Button variant="primary" onClick={handleSubmit} disabled={!canSubmit} loading={mutation.isPending}>
          {isEdit ? 'Save Changes' : 'Create Company'}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}