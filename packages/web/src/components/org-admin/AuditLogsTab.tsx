import React, { useState, useEffect } from 'react';
import {
  Search,
  RefreshCw,
  Download,
  Filter,
  ChevronLeft,
  ChevronRight,
  Shield,
  AlertTriangle,
  Info,
  Clock,
} from 'lucide-react';
import { api } from '@/services/api';

interface AuditLog {
  id: string;
  actorName: string | null;
  actorEmail: string | null;
  action: string;
  category: string;
  severity: string;
  targetType: string | null;
  targetId: string | null;
  details: any;
  ipAddress: string | null;
  createdAt: string;
}

interface AuditSummary {
  total: number;
  last24h: number;
  last7d: number;
  critical: number;
  byCategory: { category: string; count: number }[];
  bySeverity: { severity: string; count: number }[];
}

const SEVERITY_CONFIG: Record<string, { color: string; bg: string; icon: React.ReactNode }> = {
  info: {
    color: 'text-blue-600 dark:text-blue-400',
    bg: 'bg-blue-50 dark:bg-blue-900/20',
    icon: <Info size={14} />,
  },
  warning: {
    color: 'text-amber-600 dark:text-amber-400',
    bg: 'bg-amber-50 dark:bg-amber-900/20',
    icon: <AlertTriangle size={14} />,
  },
  critical: {
    color: 'text-red-600 dark:text-red-400',
    bg: 'bg-red-50 dark:bg-red-900/20',
    icon: <Shield size={14} />,
  },
};

const CATEGORY_COLORS: Record<string, string> = {
  auth: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  messaging: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  member: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  admin: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  settings: 'bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-300',
  agent: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
  general: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-300',
};

function formatAction(action: string): string {
  return action
    .replace(/\./g, ' > ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (l) => l.toUpperCase());
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export default function AuditLogsTab() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [summary, setSummary] = useState<AuditSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Filters
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const fetchLogs = async (p = 1) => {
    setIsLoading(true);
    try {
      const params: any = { page: p, limit: 50 };
      if (search) params.search = search;
      if (categoryFilter) params.category = categoryFilter;
      if (severityFilter) params.severity = severityFilter;

      const data = await api.getAuditLogs(params);
      setLogs(data.logs);
      setTotalPages(data.pagination.totalPages);
      setTotal(data.pagination.total);
      setPage(p);
    } catch (err) {
      console.error('Failed to fetch audit logs:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchSummary = async () => {
    try {
      const data = await api.getAuditSummary();
      setSummary(data);
    } catch (err) {
      console.error('Failed to fetch audit summary:', err);
    }
  };

  const handleExport = async () => {
    try {
      const blob = await api.exportAuditLogs();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export audit logs:', err);
    }
  };

  useEffect(() => {
    fetchLogs(1);
    fetchSummary();
  }, []);

  useEffect(() => {
    fetchLogs(1);
  }, [categoryFilter, severityFilter]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchLogs(1);
  };

  return (
    <div className="p-4 space-y-4">
      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
            <div className="text-sm text-slate-500 dark:text-slate-400">Total Events</div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{summary.total.toLocaleString()}</div>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
            <div className="text-sm text-slate-500 dark:text-slate-400">Last 24 Hours</div>
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-1">{summary.last24h.toLocaleString()}</div>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
            <div className="text-sm text-slate-500 dark:text-slate-400">Last 7 Days</div>
            <div className="text-2xl font-bold text-green-600 dark:text-green-400 mt-1">{summary.last7d.toLocaleString()}</div>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
            <div className="text-sm text-slate-500 dark:text-slate-400">Critical Events</div>
            <div className="text-2xl font-bold text-red-600 dark:text-red-400 mt-1">{summary.critical.toLocaleString()}</div>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <form onSubmit={handleSearch} className="flex-1 min-w-[200px]">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search actions, users..."
              className="w-full pl-9 pr-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-slate-900 dark:text-white"
            />
          </div>
        </form>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border transition ${
            showFilters || categoryFilter || severityFilter
              ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400'
              : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
          }`}
        >
          <Filter size={14} />
          Filters
          {(categoryFilter || severityFilter) && (
            <span className="w-2 h-2 rounded-full bg-blue-500" />
          )}
        </button>
        <button
          onClick={() => { fetchLogs(page); fetchSummary(); }}
          className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700"
        >
          <RefreshCw size={14} />
          Refresh
        </button>
        <button
          onClick={handleExport}
          className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700"
        >
          <Download size={14} />
          Export CSV
        </button>
      </div>

      {/* Filter dropdowns */}
      {showFilters && (
        <div className="flex flex-wrap items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Category:</span>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="text-sm border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
            >
              <option value="">All</option>
              <option value="auth">Auth</option>
              <option value="messaging">Messaging</option>
              <option value="member">Member</option>
              <option value="admin">Admin</option>
              <option value="settings">Settings</option>
              <option value="agent">Agent</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Severity:</span>
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="text-sm border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
            >
              <option value="">All</option>
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="critical">Critical</option>
            </select>
          </div>
          {(categoryFilter || severityFilter) && (
            <button
              onClick={() => { setCategoryFilter(''); setSeverityFilter(''); }}
              className="text-xs text-blue-500 hover:text-blue-700 underline"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* Logs Table */}
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw size={20} className="animate-spin text-slate-400" />
            <span className="ml-2 text-sm text-slate-500">Loading audit logs...</span>
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-400">
            <Shield size={32} className="mb-2 opacity-50" />
            <p className="text-sm">No audit logs found</p>
            <p className="text-xs mt-1">Activity will appear here as users interact with the platform</p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900/50 text-left">
                    <th className="px-4 py-3 font-medium text-slate-500 dark:text-slate-400">Time</th>
                    <th className="px-4 py-3 font-medium text-slate-500 dark:text-slate-400">Actor</th>
                    <th className="px-4 py-3 font-medium text-slate-500 dark:text-slate-400">Action</th>
                    <th className="px-4 py-3 font-medium text-slate-500 dark:text-slate-400">Category</th>
                    <th className="px-4 py-3 font-medium text-slate-500 dark:text-slate-400">Severity</th>
                    <th className="px-4 py-3 font-medium text-slate-500 dark:text-slate-400">IP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {logs.map((log) => {
                    const sev = SEVERITY_CONFIG[log.severity] || SEVERITY_CONFIG.info;
                    const catColor = CATEGORY_COLORS[log.category] || CATEGORY_COLORS.general;
                    return (
                      <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                            <Clock size={12} />
                            <span title={new Date(log.createdAt).toLocaleString()}>{timeAgo(log.createdAt)}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-slate-900 dark:text-white font-medium">{log.actorName || 'System'}</div>
                          {log.actorEmail && (
                            <div className="text-xs text-slate-400">{log.actorEmail}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                          {formatAction(log.action)}
                          {log.targetType && (
                            <span className="text-xs text-slate-400 ml-1">
                              ({log.targetType})
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${catColor}`}>
                            {log.category}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${sev.bg} ${sev.color}`}>
                            {sev.icon}
                            {log.severity}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-400 font-mono">
                          {log.ipAddress || '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-700">
              {logs.map((log) => {
                const sev = SEVERITY_CONFIG[log.severity] || SEVERITY_CONFIG.info;
                const catColor = CATEGORY_COLORS[log.category] || CATEGORY_COLORS.general;
                return (
                  <div key={log.id} className="p-3 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-900 dark:text-white">
                        {formatAction(log.action)}
                      </span>
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs ${sev.bg} ${sev.color}`}>
                        {sev.icon}
                        {log.severity}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span>{log.actorName || 'System'}</span>
                      <span className={`px-1.5 py-0.5 rounded-full ${catColor}`}>{log.category}</span>
                      <span className="ml-auto">{timeAgo(log.createdAt)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-1">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Showing page {page} of {totalPages} ({total.toLocaleString()} events)
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => fetchLogs(page - 1)}
              disabled={page <= 1}
              className="p-1.5 rounded border border-slate-200 dark:border-slate-700 disabled:opacity-30 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => fetchLogs(page + 1)}
              disabled={page >= totalPages}
              className="p-1.5 rounded border border-slate-200 dark:border-slate-700 disabled:opacity-30 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
