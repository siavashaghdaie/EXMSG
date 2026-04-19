import React, { useEffect, useState } from 'react';
import { Search, Circle, Pencil, Trash2, KeyRound, X } from 'lucide-react';
import { api } from '@/services/api';

interface User {
  id: string;
  email: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  role: string;
  isOnline: boolean;
  lastSeenAt?: string;
  createdAt: string;
  messageCount: number;
  organizations: Array<{ id: string; name: string; slug: string }>;
}

interface UsersResponse {
  users: User[];
  total: number;
  page: number;
  totalPages: number;
}

interface EditFormData {
  displayName: string;
  username: string;
  role: string;
  emailVerified: boolean;
}

const SuperAdminUsers: React.FC = () => {
  const [data, setData] = useState<UsersResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Edit modal state
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editForm, setEditForm] = useState<EditFormData>({ displayName: '', username: '', role: 'USER', emailVerified: false });
  const [formError, setFormError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Delete confirmation
  const [deletingUser, setDeletingUser] = useState<User | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Reset password modal
  const [resetUser, setResetUser] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchUsers = async () => {
    try {
      setIsLoading(true);
      const response = await api.getSuperAdminUsers(debouncedSearch, currentPage, 20, roleFilter);
      setData(response);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load users');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [debouncedSearch, currentPage, roleFilter]);

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'SUPER_ADMIN':
        return 'bg-red-500/20 text-red-300 border-red-500/30';
      case 'ORG_ADMIN':
        return 'bg-orange-500/20 text-orange-300 border-orange-500/30';
      default:
        return 'bg-slate-600/20 text-slate-300 border-slate-600/30';
    }
  };

  const openEditModal = (user: User) => {
    setEditingUser(user);
    setEditForm({
      displayName: user.displayName,
      username: user.username,
      role: user.role,
      emailVerified: true, // assume verified unless toggled
    });
    setFormError('');
    setIsSaving(false);
  };

  const handleSaveEdit = async () => {
    if (!editingUser) return;
    if (!editForm.displayName.trim() || !editForm.username.trim()) {
      setFormError('Display name and username are required');
      return;
    }
    setIsSaving(true);
    setFormError('');
    try {
      await api.updateSuperAdminUser(editingUser.id, editForm);
      setEditingUser(null);
      fetchUsers();
    } catch (err: any) {
      setFormError(err.response?.data?.error || 'Failed to update user');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingUser) return;
    setIsDeleting(true);
    setFormError('');
    try {
      await api.deleteSuperAdminUser(deletingUser.id);
      setDeletingUser(null);
      fetchUsers();
    } catch (err: any) {
      setFormError(err.response?.data?.error || 'Failed to delete user');
    } finally {
      setIsDeleting(false);
    }
  };

  const openResetModal = (user: User) => {
    setResetUser(user);
    setNewPassword('');
    setFormError('');
    setResetSuccess(false);
    setIsResetting(false);
  };

  const handleResetPassword = async () => {
    if (!resetUser) return;
    if (newPassword.length < 6) {
      setFormError('Password must be at least 6 characters');
      return;
    }
    setIsResetting(true);
    setFormError('');
    try {
      await api.resetSuperAdminUserPassword(resetUser.id, newPassword);
      setResetSuccess(true);
    } catch (err: any) {
      setFormError(err.response?.data?.error || 'Failed to reset password');
    } finally {
      setIsResetting(false);
    }
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
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Users</h1>
        <p className="text-slate-400">Manage all users across the platform</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="relative">
          <Search className="absolute left-3 top-3.5 w-5 h-5 text-slate-500" />
          <input
            type="text"
            placeholder="Search by name, email, or username..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>

        <select
          value={roleFilter}
          onChange={(e) => {
            setRoleFilter(e.target.value);
            setCurrentPage(1);
          }}
          className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
        >
          <option value="">All Roles</option>
          <option value="USER">User</option>
          <option value="ORG_ADMIN">Organization Admin</option>
          <option value="SUPER_ADMIN">Super Admin</option>
        </select>
      </div>

      <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-96">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        ) : !data || data.users.length === 0 ? (
          <div className="flex items-center justify-center h-96 text-slate-400">
            No users found
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-700/50 border-b border-slate-700">
                  <tr>
                    <th className="text-left py-4 px-6 text-sm font-semibold text-slate-300">User</th>
                    <th className="text-left py-4 px-6 text-sm font-semibold text-slate-300">Email</th>
                    <th className="text-left py-4 px-6 text-sm font-semibold text-slate-300">Role</th>
                    <th className="text-center py-4 px-6 text-sm font-semibold text-slate-300">Status</th>
                    <th className="text-center py-4 px-6 text-sm font-semibold text-slate-300">Messages</th>
                    <th className="text-left py-4 px-6 text-sm font-semibold text-slate-300">Last Seen</th>
                    <th className="text-center py-4 px-6 text-sm font-semibold text-slate-300">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.users.map((user, idx) => (
                    <tr
                      key={user.id}
                      className={`border-b border-slate-700 hover:bg-slate-700/30 transition-colors ${
                        idx % 2 === 0 ? 'bg-slate-800/50' : ''
                      }`}
                    >
                      <td className="py-4 px-6">
                        <div className="flex items-center space-x-3">
                          {user.avatarUrl ? (
                            <img
                              src={user.avatarUrl}
                              alt={user.displayName}
                              className="w-8 h-8 rounded-full"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold">
                              {user.displayName.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div>
                            <p className="text-white font-medium">{user.displayName}</p>
                            <p className="text-xs text-slate-400">@{user.username}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-6 text-slate-400 text-sm">{user.email}</td>
                      <td className="py-4 px-6">
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-semibold border ${getRoleColor(
                            user.role
                          )}`}
                        >
                          {user.role}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-center">
                        <div className="flex items-center justify-center space-x-2">
                          <Circle
                            className={`w-3 h-3 ${
                              user.isOnline ? 'fill-green-500 text-green-500' : 'text-slate-500'
                            }`}
                          />
                          <span className="text-sm text-slate-400">
                            {user.isOnline ? 'Online' : 'Offline'}
                          </span>
                        </div>
                      </td>
                      <td className="py-4 px-6 text-center text-slate-300">{user.messageCount}</td>
                      <td className="py-4 px-6 text-slate-400 text-sm">
                        {user.lastSeenAt ? new Date(user.lastSeenAt).toLocaleDateString() : 'Never'}
                      </td>
                      <td className="py-4 px-6">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => openEditModal(user)}
                            className="p-2 text-slate-400 hover:text-blue-400 hover:bg-slate-700 rounded-lg transition-colors"
                            title="Edit User"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => openResetModal(user)}
                            className="p-2 text-slate-400 hover:text-yellow-400 hover:bg-slate-700 rounded-lg transition-colors"
                            title="Reset Password"
                          >
                            <KeyRound className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setDeletingUser(user)}
                            className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded-lg transition-colors"
                            title="Delete User"
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

      {/* Edit User Modal */}
      {editingUser && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-lg border border-slate-700 w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-semibold text-white">Edit User</h3>
              <button onClick={() => setEditingUser(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm text-slate-400 mb-4">{editingUser.email}</p>

            {formError && (
              <div className="bg-red-900/30 border border-red-600 text-red-200 px-3 py-2 rounded-lg text-sm mb-4">
                {formError}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Display Name</label>
                <input
                  type="text"
                  value={editForm.displayName}
                  onChange={(e) => setEditForm(prev => ({ ...prev, displayName: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Username</label>
                <input
                  type="text"
                  value={editForm.username}
                  onChange={(e) => setEditForm(prev => ({ ...prev, username: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Role</label>
                <select
                  value={editForm.role}
                  onChange={(e) => setEditForm(prev => ({ ...prev, role: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="USER">User</option>
                  <option value="ORG_ADMIN">Organization Admin</option>
                  <option value="SUPER_ADMIN">Super Admin</option>
                </select>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="emailVerified"
                  checked={editForm.emailVerified}
                  onChange={(e) => setEditForm(prev => ({ ...prev, emailVerified: e.target.checked }))}
                  className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="emailVerified" className="text-sm text-slate-300">Email Verified</label>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setEditingUser(null)}
                className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={isSaving}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg transition-colors"
              >
                {isSaving ? 'Saving...' : 'Update'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingUser && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-lg border border-slate-700 w-full max-w-sm p-6">
            <h3 className="text-xl font-semibold text-white mb-2">Delete User</h3>
            <p className="text-slate-400 text-sm mb-6">
              Are you sure you want to delete <strong className="text-white">{deletingUser.displayName}</strong> ({deletingUser.email})? This action cannot be undone.
            </p>
            {formError && (
              <div className="bg-red-900/30 border border-red-600 text-red-200 px-3 py-2 rounded-lg text-sm mb-4">
                {formError}
              </div>
            )}
            <div className="flex justify-end gap-3">
              <button
                onClick={() => { setDeletingUser(null); setFormError(''); }}
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

      {/* Reset Password Modal */}
      {resetUser && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-lg border border-slate-700 w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold text-white">Reset Password</h3>
              <button onClick={() => setResetUser(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm text-slate-400 mb-4">
              Set a new password for <strong className="text-white">{resetUser.displayName}</strong>
            </p>

            {formError && (
              <div className="bg-red-900/30 border border-red-600 text-red-200 px-3 py-2 rounded-lg text-sm mb-4">
                {formError}
              </div>
            )}

            {resetSuccess ? (
              <div className="bg-green-900/30 border border-green-600 text-green-200 px-3 py-2 rounded-lg text-sm mb-4">
                Password has been reset successfully.
              </div>
            ) : (
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-300 mb-1">New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  placeholder="Min 6 characters"
                />
              </div>
            )}

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setResetUser(null)}
                className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
              >
                {resetSuccess ? 'Close' : 'Cancel'}
              </button>
              {!resetSuccess && (
                <button
                  onClick={handleResetPassword}
                  disabled={isResetting}
                  className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 disabled:opacity-50 text-white rounded-lg transition-colors"
                >
                  {isResetting ? 'Resetting...' : 'Reset Password'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SuperAdminUsers;
