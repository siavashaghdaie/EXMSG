import React, { useEffect, useState } from 'react';
import { Search, Plus, Pencil, Trash2, X } from 'lucide-react';
import { api } from '@/services/api';

interface Organization {
  id: string;
  name: string;
  slug: string;
  avatarUrl?: string;
  description?: string;
  createdAt: string;
  messageCount: number;
  _count: {
    members: number;
    channels: number;
  };
}

interface OrganizationsResponse {
  organizations: Organization[];
  total: number;
  page: number;
  totalPages: number;
}

interface OrgFormData {
  name: string;
  slug: string;
  description: string;
}

const SuperAdminOrgs: React.FC = () => {
  const [data, setData] = useState<OrganizationsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingOrg, setEditingOrg] = useState<Organization | null>(null);
  const [formData, setFormData] = useState<OrgFormData>({ name: '', slug: '', description: '' });
  const [formError, setFormError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Delete confirmation
  const [deletingOrg, setDeletingOrg] = useState<Organization | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchOrganizations = async () => {
    try {
      setIsLoading(true);
      const response = await api.getSuperAdminOrganizations(debouncedSearch, currentPage, 20);
      setData(response);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load organizations');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOrganizations();
  }, [debouncedSearch, currentPage]);

  const openCreateModal = () => {
    setEditingOrg(null);
    setFormData({ name: '', slug: '', description: '' });
    setFormError('');
    setShowModal(true);
  };

  const openEditModal = (org: Organization) => {
    setEditingOrg(org);
    setFormData({ name: org.name, slug: org.slug, description: org.description || '' });
    setFormError('');
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim() || !formData.slug.trim()) {
      setFormError('Name and slug are required');
      return;
    }

    setIsSaving(true);
    setFormError('');
    try {
      if (editingOrg) {
        await api.updateSuperAdminOrganization(editingOrg.id, formData);
      } else {
        await api.createSuperAdminOrganization(formData);
      }
      setShowModal(false);
      fetchOrganizations();
    } catch (err: any) {
      setFormError(err.response?.data?.error || 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingOrg) return;
    setIsDeleting(true);
    try {
      await api.deleteSuperAdminOrganization(deletingOrg.id);
      setDeletingOrg(null);
      fetchOrganizations();
    } catch (err: any) {
      setFormError(err.response?.data?.error || 'Failed to delete');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleNameChange = (value: string) => {
    setFormData(prev => ({
      ...prev,
      name: value,
      ...(!editingOrg ? { slug: value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') } : {}),
    }));
  };

  if (error) {
    return (
      <div className="bg-red-900/30 border border-red-600 text-red-200 px-4 py-3 rounded-lg">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Organizations</h1>
          <p className="text-slate-400">Manage all organizations on the platform</p>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Organization
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-3.5 w-5 h-5 text-slate-500" />
        <input
          type="text"
          placeholder="Search by name or slug..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
        />
      </div>

      <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-96">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        ) : !data || data.organizations.length === 0 ? (
          <div className="flex items-center justify-center h-96 text-slate-400">
            No organizations found
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-700/50 border-b border-slate-700">
                  <tr>
                    <th className="text-left py-4 px-6 text-sm font-semibold text-slate-300">Name</th>
                    <th className="text-left py-4 px-6 text-sm font-semibold text-slate-300">Slug</th>
                    <th className="text-center py-4 px-6 text-sm font-semibold text-slate-300">Members</th>
                    <th className="text-center py-4 px-6 text-sm font-semibold text-slate-300">Channels</th>
                    <th className="text-center py-4 px-6 text-sm font-semibold text-slate-300">Messages</th>
                    <th className="text-left py-4 px-6 text-sm font-semibold text-slate-300">Created</th>
                    <th className="text-center py-4 px-6 text-sm font-semibold text-slate-300">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.organizations.map((org, idx) => (
                    <tr
                      key={org.id}
                      className={`border-b border-slate-700 hover:bg-slate-700/30 transition-colors ${
                        idx % 2 === 0 ? 'bg-slate-800/50' : ''
                      }`}
                    >
                      <td className="py-4 px-6">
                        <div className="flex items-center space-x-3">
                          <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold">
                            {org.name.charAt(0).toUpperCase()}
                          </div>
                          <span className="text-white font-medium">{org.name}</span>
                        </div>
                      </td>
                      <td className="py-4 px-6 text-slate-400 text-sm">{org.slug}</td>
                      <td className="py-4 px-6 text-center text-slate-300">{org._count.members}</td>
                      <td className="py-4 px-6 text-center text-slate-300">{org._count.channels}</td>
                      <td className="py-4 px-6 text-center text-slate-300">{org.messageCount}</td>
                      <td className="py-4 px-6 text-slate-400 text-sm">
                        {new Date(org.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-4 px-6">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => openEditModal(org)}
                            className="p-2 text-slate-400 hover:text-blue-400 hover:bg-slate-700 rounded-lg transition-colors"
                            title="Edit"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setDeletingOrg(org)}
                            className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded-lg transition-colors"
                            title="Delete"
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

            {data.totalPages > 1 && (
              <div className="bg-slate-700/30 border-t border-slate-700 px-6 py-4 flex items-center justify-between">
                <p className="text-sm text-slate-400">
                  Page {data.page} of {data.totalPages} (Total: {data.total})
                </p>
                <div className="flex space-x-2">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm transition-colors"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setCurrentPage((p) => Math.min(data.totalPages, p + 1))}
                    disabled={currentPage === data.totalPages}
                    className="px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm transition-colors"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-lg border border-slate-700 w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-semibold text-white">
                {editingOrg ? 'Edit Organization' : 'New Organization'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="bg-red-900/30 border border-red-600 text-red-200 px-3 py-2 rounded-lg text-sm mb-4">
                {formError}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  placeholder="Acme Corp"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Slug</label>
                <input
                  type="text"
                  value={formData.slug}
                  onChange={(e) => setFormData(prev => ({ ...prev, slug: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  placeholder="acme-corp"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  rows={3}
                  placeholder="Optional description..."
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg transition-colors"
              >
                {isSaving ? 'Saving...' : editingOrg ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingOrg && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-lg border border-slate-700 w-full max-w-sm p-6">
            <h3 className="text-xl font-semibold text-white mb-2">Delete Organization</h3>
            <p className="text-slate-400 text-sm mb-6">
              Are you sure you want to delete <strong className="text-white">{deletingOrg.name}</strong>? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeletingOrg(null)}
                className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg transition-colors"
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SuperAdminOrgs;
