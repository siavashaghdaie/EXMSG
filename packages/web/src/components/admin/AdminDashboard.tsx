import { useState, useEffect } from 'react';
import {
  Users,
  MessageSquare,
  Hash,
  BarChart3,
  ArrowLeft,
  Search,
  RefreshCw,
  TrendingUp,
  Activity,
  Clock,
} from 'lucide-react';
import { api } from '@/services/api';
import Avatar from '@/components/common/Avatar';

interface DashboardStats {
  totalUsers: number;
  onlineUsers: number;
  totalConversations: number;
  messagesToday: number;
  messagesThisWeek: number;
  avgMessagesPerDay: number;
}

interface DashboardData {
  stats: DashboardStats;
  recentUsers: any[];
  topGroups: any[];
}

interface AdminDashboardProps {
  onBack?: () => void;
  isEmbedded?: boolean;
}

export default function AdminDashboard({ onBack, isEmbedded }: AdminDashboardProps) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [userPage, setUserPage] = useState(1);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [totalUserCount, setTotalUserCount] = useState(0);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    setIsLoading(true);
    try {
      const result = await api.getAdminDashboard();
      setData(result);
    } catch (err) {
      console.error('Dashboard load failed:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const loadUsers = async (page: number = 1, search?: string) => {
    setIsSearching(true);
    try {
      const result = await api.getAdminUsers(search, page);
      setAllUsers(result.users);
      setTotalUserCount(result.total);
      setUserPage(page);
    } catch (err) {
      console.error('Load users failed:', err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    await loadUsers(1, query);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full bg-slate-50 dark:bg-slate-900">
        <div className="text-center">
          <div className="animate-spin w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-3" />
          <p className="text-sm text-slate-500 dark:text-slate-400">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const statCards = [
    {
      label: 'Total Users',
      value: data.stats.totalUsers.toLocaleString(),
      sub: `${data.stats.onlineUsers} online`,
      icon: Users,
      color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
      trend: 'up',
    },
    {
      label: 'Messages Today',
      value: data.stats.messagesToday.toLocaleString(),
      sub: `${data.stats.avgMessagesPerDay} avg/day`,
      icon: MessageSquare,
      color: 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400',
      trend: 'up',
    },
    {
      label: 'Conversations',
      value: data.stats.totalConversations.toLocaleString(),
      sub: 'All types',
      icon: Hash,
      color: 'bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400',
      trend: 'neutral',
    },
    {
      label: 'Weekly Activity',
      value: data.stats.messagesThisWeek.toLocaleString(),
      sub: 'Last 7 days',
      icon: BarChart3,
      color: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400',
      trend: 'up',
    },
  ];

  const totalPages = Math.ceil(totalUserCount / 20);

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-900 overflow-y-auto">
      {/* Header — hidden when embedded in Settings */}
      {!isEmbedded && (
        <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-4 py-4 sticky top-0 z-10 flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition"
          >
            <ArrowLeft size={20} className="text-slate-600 dark:text-slate-300" />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">Admin Dashboard</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">OmniLink Messenger Intelligence</p>
          </div>
          <button
            onClick={loadDashboard}
            disabled={isLoading}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition disabled:opacity-50"
          >
            <RefreshCw size={18} className="text-slate-500 dark:text-slate-400" />
          </button>
        </div>
      )}

      <div className="p-4 md:p-6 space-y-6">
        {/* Stat Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map((card) => (
            <div
              key={card.label}
              className="bg-white dark:bg-slate-800 rounded-xl p-5 border border-slate-200 dark:border-slate-700 hover:shadow-md dark:hover:shadow-slate-700/50 transition"
            >
              <div className="flex items-start justify-between mb-3">
                <div className={`p-2 rounded-lg ${card.color}`}>
                  <card.icon size={20} />
                </div>
                {card.trend === 'up' && (
                  <TrendingUp size={16} className="text-green-500" />
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mb-1">
                {card.label}
              </p>
              <p className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white mb-1">
                {card.value}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{card.sub}</p>
            </div>
          ))}
        </div>

        {/* Recent Users Section */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="p-4 md:p-5 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Users</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Total: {totalUserCount}
              </p>
            </div>
            <Users size={20} className="text-slate-400" />
          </div>

          {/* Search Bar */}
          <div className="p-4 border-b border-slate-200 dark:border-slate-700">
            <div className="relative">
              <Search
                size={18}
                className="absolute left-3 top-2.5 text-slate-400 dark:text-slate-500"
              />
              <input
                type="text"
                placeholder="Search by name, email, or username..."
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Users List */}
          <div className="divide-y divide-slate-100 dark:divide-slate-700 max-h-96 overflow-y-auto">
            {isSearching ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full" />
              </div>
            ) : allUsers.length > 0 ? (
              allUsers.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center gap-3 px-4 md:px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition"
                >
                  <div className="relative flex-shrink-0">
                    <Avatar name={user.displayName || user.username} size="sm" />
                    <div
                      className={`absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-white dark:border-slate-800 ${
                        user.isOnline ? 'bg-green-500' : 'bg-slate-400'
                      }`}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                      {user.displayName || user.username}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {user.email}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span
                      className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                        user.isOnline
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400'
                      }`}
                    >
                      {user.isOnline ? 'Online' : 'Offline'}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <p className="px-4 md:px-5 py-6 text-sm text-slate-400 text-center">
                No users found
              </p>
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="p-4 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <button
                onClick={() => loadUsers(Math.max(1, userPage - 1), searchQuery)}
                disabled={userPage === 1}
                className="px-3 py-1.5 text-sm rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                Previous
              </button>
              <span className="text-sm text-slate-600 dark:text-slate-400">
                Page {userPage} of {totalPages}
              </span>
              <button
                onClick={() => loadUsers(Math.min(totalPages, userPage + 1), searchQuery)}
                disabled={userPage === totalPages}
                className="px-3 py-1.5 text-sm rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                Next
              </button>
            </div>
          )}
        </div>

        {/* Top Groups/Channels */}
        {data.topGroups.length > 0 && (
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="p-4 md:p-5 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                  Active Groups & Channels
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Top 5 by recent activity
                </p>
              </div>
              <Activity size={20} className="text-slate-400" />
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-700">
              {data.topGroups.map((group) => (
                <div
                  key={group.id}
                  className="flex items-center gap-3 px-4 md:px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition"
                >
                  <div className="w-10 h-10 bg-gradient-to-br from-violet-100 to-violet-50 dark:from-violet-900/30 dark:to-violet-800/20 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Hash size={18} className="text-violet-600 dark:text-violet-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                      {group.name || 'Unnamed'}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {group._count.members} members
                    </p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0 text-right">
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">
                        {group._count.messages}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">messages</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Quick Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-3 mb-2">
              <Clock size={16} className="text-slate-400" />
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                Last Updated
              </span>
            </div>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">
              {new Date().toLocaleTimeString()}
            </p>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-3 mb-2">
              <Activity size={16} className="text-slate-400" />
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                Avg Daily Activity
              </span>
            </div>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">
              {data.stats.avgMessagesPerDay} messages/day
            </p>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-3 mb-2">
              <TrendingUp size={16} className="text-slate-400" />
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                Engagement
              </span>
            </div>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">
              {Math.round(
                (data.stats.onlineUsers / data.stats.totalUsers) * 100
              )}% online
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
