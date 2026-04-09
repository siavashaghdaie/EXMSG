import React, { useEffect, useState } from 'react';
import { Search, Circle } from 'lucide-react';
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

const SuperAdminUsers: React.FC = () => {
  const [data, setData] = useState<UsersResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
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
    </div>
  );
};

export default SuperAdminUsers;
