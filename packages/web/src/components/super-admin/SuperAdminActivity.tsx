import React, { useEffect, useState } from 'react';
import { UserPlus, MessageCircle, Building2, Clock } from 'lucide-react';
import { api } from '@/services/api';

interface Activity {
  id: string;
  type: 'user_signup' | 'message_sent' | 'org_created';
  description: string;
  user?: {
    username?: string;
    displayName?: string;
    email?: string;
  };
  timestamp: string;
}

interface ActivityResponse {
  activities: Activity[];
}

const SuperAdminActivity: React.FC = () => {
  const [data, setData] = useState<ActivityResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchActivity = async () => {
      try {
        setIsLoading(true);
        const response = await api.getSuperAdminActivity();
        setData(response);
        setError(null);
      } catch (err: any) {
        setError(err.message || 'Failed to load activity');
      } finally {
        setIsLoading(false);
      }
    };

    fetchActivity();
  }, []);

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'user_signup':
        return <UserPlus className="w-5 h-5 text-green-500" />;
      case 'message_sent':
        return <MessageCircle className="w-5 h-5 text-blue-500" />;
      case 'org_created':
        return <Building2 className="w-5 h-5 text-purple-500" />;
      default:
        return <Clock className="w-5 h-5 text-slate-500" />;
    }
  };

  const getActivityColor = (type: string) => {
    switch (type) {
      case 'user_signup':
        return 'bg-green-500/10 border-green-500/20';
      case 'message_sent':
        return 'bg-blue-500/10 border-blue-500/20';
      case 'org_created':
        return 'bg-purple-500/10 border-purple-500/20';
      default:
        return 'bg-slate-500/10 border-slate-500/20';
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (seconds < 60) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Activity Log</h1>
        <p className="text-slate-400">Recent platform activity (Last 50 events)</p>
      </div>

      <div className="space-y-3">
        {!data || data.activities.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            No activity recorded yet
          </div>
        ) : (
          data.activities.map((activity) => (
            <div
              key={activity.id}
              className={`flex gap-4 p-4 rounded-lg border transition-colors hover:bg-slate-700/20 ${getActivityColor(
                activity.type
              )}`}
            >
              <div className="flex-shrink-0 pt-1">{getActivityIcon(activity.type)}</div>

              <div className="flex-1 min-w-0">
                <p className="text-white font-medium text-sm">{activity.description}</p>
                {activity.user?.email && (
                  <p className="text-xs text-slate-400 mt-1">Email: {activity.user.email}</p>
                )}
              </div>

              <div className="flex-shrink-0 text-right">
                <p className="text-xs text-slate-400">{formatTime(activity.timestamp)}</p>
                <p className="text-xs text-slate-500 mt-1">
                  {new Date(activity.timestamp).toLocaleTimeString()}
                </p>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="bg-slate-700/30 border border-slate-700 rounded-lg p-4">
        <p className="text-sm text-slate-400">
          Activity log shows the last 50 events. Refresh the page to see the latest activity.
        </p>
      </div>
    </div>
  );
};

export default SuperAdminActivity;
