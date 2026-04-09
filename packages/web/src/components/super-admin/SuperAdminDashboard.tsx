import React, { useEffect, useState } from 'react';
import { Building2, Users, MessageSquare, TrendingUp, DollarSign } from 'lucide-react';
import { api } from '@/services/api';

interface DashboardData {
  stats: {
    totalOrganizations: number;
    totalUsers: number;
    totalMessages: number;
    activeUsersToday: number;
    messagesToday: number;
    revenue: number;
  };
  charts: {
    newSignupsByDay: Record<string, number>;
    messagesPerDay: Record<string, number>;
  };
  topOrganizations: Array<{
    id: string;
    name: string;
    slug: string;
    createdAt: string;
    _count: {
      members: number;
      channels: number;
    };
  }>;
}

const SuperAdminDashboard: React.FC = () => {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        setIsLoading(true);
        const data = await api.getSuperAdminDashboard();
        setDashboardData(data);
        setError(null);
      } catch (err: any) {
        setError(err.message || 'Failed to load dashboard');
      } finally {
        setIsLoading(false);
      }
    };

    fetchDashboard();
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-900/30 border border-red-600 text-red-200 px-4 py-3 rounded-lg">
        {error}
      </div>
    );
  }

  if (!dashboardData) {
    return <div className="text-slate-400">No data available</div>;
  }

  const { stats, charts, topOrganizations } = dashboardData;

  const statCards = [
    {
      label: 'Total Organizations',
      value: stats.totalOrganizations,
      icon: Building2,
      color: 'bg-blue-500',
    },
    {
      label: 'Total Users',
      value: stats.totalUsers,
      icon: Users,
      color: 'bg-purple-500',
    },
    {
      label: 'Active Today',
      value: stats.activeUsersToday,
      icon: TrendingUp,
      color: 'bg-green-500',
    },
    {
      label: 'Messages Today',
      value: stats.messagesToday,
      icon: MessageSquare,
      color: 'bg-orange-500',
    },
    {
      label: 'Revenue',
      value: `$${stats.revenue}`,
      icon: DollarSign,
      color: 'bg-pink-500',
    },
  ];

  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - i);
    return date.toISOString().split('T')[0];
  }).reverse();

  const maxSignups = Math.max(...last7Days.map((d) => charts.newSignupsByDay[d] || 0), 1);
  const maxMessages = Math.max(...last7Days.map((d) => charts.messagesPerDay[d] || 0), 1);

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {statCards.map((card, idx) => {
          const Icon = card.icon;
          return (
            <div
              key={idx}
              className="bg-slate-800 rounded-lg p-6 border border-slate-700 hover:border-slate-600 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-400 text-sm mb-2">{card.label}</p>
                  <p className="text-3xl font-bold text-white">{card.value}</p>
                </div>
                <div className={`${card.color} p-3 rounded-lg`}>
                  <Icon className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
          <h3 className="text-lg font-semibold text-white mb-6">New Signups (Last 7 Days)</h3>
          <div className="space-y-4">
            {last7Days.map((date) => {
              const value = charts.newSignupsByDay[date] || 0;
              const percentage = (value / maxSignups) * 100;
              const dateObj = new Date(date);
              const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });

              return (
                <div key={date}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-slate-400">{dayName}</span>
                    <span className="text-sm font-semibold text-white">{value}</span>
                  </div>
                  <div className="bg-slate-700 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-blue-500 to-blue-600 h-full transition-all"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
          <h3 className="text-lg font-semibold text-white mb-6">Messages (Last 7 Days)</h3>
          <div className="space-y-4">
            {last7Days.map((date) => {
              const value = charts.messagesPerDay[date] || 0;
              const percentage = (value / maxMessages) * 100;
              const dateObj = new Date(date);
              const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });

              return (
                <div key={date}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-slate-400">{dayName}</span>
                    <span className="text-sm font-semibold text-white">{value}</span>
                  </div>
                  <div className="bg-slate-700 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-orange-500 to-orange-600 h-full transition-all"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
        <h3 className="text-lg font-semibold text-white mb-6">Top Organizations</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left py-3 px-4 text-sm font-semibold text-slate-300">Name</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-slate-300">Slug</th>
                <th className="text-center py-3 px-4 text-sm font-semibold text-slate-300">Members</th>
                <th className="text-center py-3 px-4 text-sm font-semibold text-slate-300">Channels</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-slate-300">Created</th>
              </tr>
            </thead>
            <tbody>
              {topOrganizations.map((org) => (
                <tr key={org.id} className="border-b border-slate-700 hover:bg-slate-700/50 transition-colors">
                  <td className="py-3 px-4 text-white">{org.name}</td>
                  <td className="py-3 px-4 text-slate-400 text-sm">{org.slug}</td>
                  <td className="py-3 px-4 text-center text-slate-300">{org._count.members}</td>
                  <td className="py-3 px-4 text-center text-slate-300">{org._count.channels}</td>
                  <td className="py-3 px-4 text-slate-400 text-sm">
                    {new Date(org.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default SuperAdminDashboard;
