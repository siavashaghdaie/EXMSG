import React, { useEffect, useState, useCallback } from 'react';
import { Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed, Video, X, ArrowLeft } from 'lucide-react';
import { api } from '@/services/api';
import { useAuthStore } from '@/store/authStore';

interface CallRecord {
  id: string;
  callerId: string;
  calleeId: string;
  type: 'audio' | 'video';
  status: string;
  duration: number | null;
  createdAt: string;
  caller: { id: string; displayName?: string; username: string; avatarUrl?: string };
  callee: { id: string; displayName?: string; username: string; avatarUrl?: string };
}

interface CallsPageProps {
  onClose: () => void;
}

export default function CallsPage({ onClose }: CallsPageProps) {
  const user = useAuthStore((s) => s.user);
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCalls = useCallback(async () => {
    try {
      const data = await api.getCallHistory({ limit: 50 });
      setCalls(data.calls || []);
    } catch (err) {
      console.error('[CallsPage] Failed to load calls:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCalls();
  }, [fetchCalls]);

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '--:--';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / 86400000);
    if (days === 0) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (days === 1) return 'Yesterday';
    if (days < 7) return date.toLocaleDateString(undefined, { weekday: 'short' });
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  const getStatusIcon = (status: string, isOutgoing: boolean) => {
    if (status === 'MISSED') return <PhoneMissed size={16} className="text-red-500" />;
    if (status === 'REJECTED') return <X size={16} className="text-orange-500" />;
    if (status === 'BUSY') return <Phone size={16} className="text-red-500" />;
    return isOutgoing
      ? <PhoneOutgoing size={16} className="text-green-500" />
      : <PhoneIncoming size={16} className="text-blue-500" />;
  };

  const getStatusText = (status: string, isOutgoing: boolean) => {
    if (status === 'ENDED') return isOutgoing ? 'Outgoing' : 'Incoming';
    return status.charAt(0) + status.slice(1).toLowerCase();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ENDED': return 'text-green-600';
      case 'MISSED': return 'text-red-500';
      case 'REJECTED': return 'text-orange-500';
      case 'BUSY': return 'text-red-500';
      default: return 'text-slate-500';
    }
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-surface-900">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 dark:border-surface-700 flex-shrink-0">
        <button
          onClick={onClose}
          className="p-2 hover:bg-slate-100 dark:hover:bg-surface-700 rounded-lg transition"
        >
          <ArrowLeft size={20} className="text-slate-600 dark:text-slate-400" />
        </button>
        <div className="flex items-center gap-2">
          <Phone size={22} className="text-primary-600" />
          <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Calls</h1>
        </div>
      </div>

      {/* Call list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
          </div>
        ) : calls.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
            <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-surface-700 flex items-center justify-center mb-4">
              <Phone size={28} className="text-slate-400" />
            </div>
            <p className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-2">No Calls Yet</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Start a voice or video call from any chat conversation.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-surface-700">
            {calls.map((call) => {
              const isOutgoing = call.callerId === user?.id;
              const otherUser = isOutgoing ? call.callee : call.caller;
              const otherName = otherUser?.displayName || otherUser?.username || 'Unknown';
              const initials = otherName.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2);

              return (
                <div key={call.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-surface-800 transition">
                  {/* Avatar */}
                  <div className="w-11 h-11 rounded-full bg-primary-600 flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-sm font-bold">{initials}</span>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">{otherName}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {getStatusIcon(call.status, isOutgoing)}
                      <span className={`text-xs ${getStatusColor(call.status)}`}>
                        {getStatusText(call.status, isOutgoing)}
                      </span>
                      {call.type === 'video' ? (
                        <Video size={12} className="text-slate-400 ml-1" />
                      ) : (
                        <Phone size={12} className="text-slate-400 ml-1" />
                      )}
                    </div>
                  </div>

                  {/* Time & Duration */}
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs text-slate-500">{formatTime(call.createdAt)}</p>
                    {call.duration != null && call.duration > 0 && (
                      <p className="text-xs text-slate-400 mt-0.5">{formatDuration(call.duration)}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
