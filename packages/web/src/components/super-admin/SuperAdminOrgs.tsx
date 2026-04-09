import React, { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
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

const SuperAdminOrgs: React.FC = () => {
  const [data, setData] = useState<OrganizationsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
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

    fetchOrganizations();
  }, [debouncedSearch, currentPage]);

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
        <h1 className="text-3xl font-bold text-white mb-2">Organizations</h1>
        <p className="text-slate-400">Manage all organizations on the platform</p>
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
                          {org.avatarUrl ? (
                            <img
                              src={org.avatarUrl}
                              alt={org.name}
                              className="w-8 h-8 rounded-full"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold">
                              {org.name.charAt(0).toUpperCase()}
                            </div>
                          )}
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

export default SuperAdminOrgs;
