import React, { useEffect, useState } from 'react';
import { Eye, Settings2, Power, Bot, X, BarChart3 } from 'lucide-react';
import { api } from '@/services/api';

interface AgentPanelProps {
  conversationId: string;
  agentParticipants: Array<{ id: string; username: string; displayName?: string; avatar?: string; email: string }>;
  onClose: () => void;
  onViewActivities?: (agentUsername: string) => void;
  onOpenSettings?: (agentUsername: string) => void;
}

interface HiredAgentInfo {
  id: string;
  agentId: string;
  isEnabled: boolean;
  settings: any;
  hiredAt: string;
  agent: {
    id: string;
    slug: string;
    name: string;
    role: string;
    category: string;
    avatarUrl?: string;
    pricing: string;
    priceAmount?: number;
    gradientFrom?: string;
    gradientTo?: string;
  };
}

export default function AgentPanel({ conversationId, agentParticipants, onClose, onViewActivities, onOpenSettings }: AgentPanelProps) {
  const [hiredAgents, setHiredAgents] = useState<HiredAgentInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getHiredAgents()
      .then((agents: any[]) => setHiredAgents(agents))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Match participants to hired agents by username/slug
  const agentsInChat = agentParticipants.map(participant => {
    const hiredInfo = hiredAgents.find(ha =>
      ha.agent.slug === participant.username ||
      ha.agent.name.toLowerCase() === participant.username?.toLowerCase()
    );
    return {
      participant,
      hiredInfo,
    };
  });

  const handleToggleAgent = async (orgAgentId: string, currentEnabled: boolean) => {
    try {
      const agent = hiredAgents.find(a => a.id === orgAgentId);
      if (!agent) return;
      await api.updateAgentSettings(agent.agentId, { isEnabled: !currentEnabled });
      setHiredAgents(prev => prev.map(a =>
        a.id === orgAgentId ? { ...a, isEnabled: !currentEnabled } : a
      ));
    } catch (err) {
      console.error('Failed to toggle agent:', err);
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch { return ''; }
  };

  return (
    <div className="absolute inset-0 top-[57px] z-20 bg-white dark:bg-surface-900 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-surface-700">
        <div className="flex items-center gap-2">
          <Bot size={20} className="text-violet-500" />
          <h3 className="font-semibold text-slate-900 dark:text-white">Agents in Chat</h3>
          <span className="text-xs bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 px-1.5 py-0.5 rounded-full font-medium">
            {agentParticipants.length}
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition"
        >
          <X size={18} className="text-slate-500" />
        </button>
      </div>

      {/* Agent list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full" />
          </div>
        ) : (
          agentsInChat.map(({ participant, hiredInfo }) => (
            <div
              key={participant.id}
              className="bg-slate-50 dark:bg-surface-800 rounded-xl p-4 border border-slate-200 dark:border-surface-700"
            >
              {/* Agent header */}
              <div className="flex items-center gap-3 mb-3">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-lg"
                  style={{
                    background: hiredInfo?.agent?.gradientFrom && hiredInfo?.agent?.gradientTo
                      ? `linear-gradient(135deg, ${hiredInfo.agent.gradientFrom}, ${hiredInfo.agent.gradientTo})`
                      : '#8b5cf6'
                  }}
                >
                  {participant.avatar ? (
                    <img src={participant.avatar} alt="" className="w-full h-full rounded-full object-cover" />
                  ) : (
                    (participant.displayName || participant.username || '?')[0].toUpperCase()
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-slate-900 dark:text-white text-sm">
                    {participant.displayName || hiredInfo?.agent?.name || participant.username}
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {hiredInfo?.agent?.role || 'AI Agent'}
                  </p>
                </div>
                {/* On/Off toggle */}
                {hiredInfo && (
                  <button
                    onClick={() => handleToggleAgent(hiredInfo.id, hiredInfo.isEnabled)}
                    className={`relative w-10 h-5 rounded-full transition-colors ${
                      hiredInfo.isEnabled ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-surface-600'
                    }`}
                    title={hiredInfo.isEnabled ? 'Enabled — click to disable' : 'Disabled — click to enable'}
                  >
                    <span
                      className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                        hiredInfo.isEnabled ? 'left-5' : 'left-0.5'
                      }`}
                    />
                  </button>
                )}
              </div>

              {/* Action buttons row */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onViewActivities?.(participant.username)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-lg text-xs font-medium hover:bg-blue-100 dark:hover:bg-blue-900/40 transition"
                >
                  <Eye size={12} />
                  Activity Log
                </button>
                <button
                  onClick={() => onOpenSettings?.(participant.username)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-surface-700 text-slate-600 dark:text-slate-300 rounded-lg text-xs font-medium hover:bg-slate-200 dark:hover:bg-surface-600 transition"
                >
                  <Settings2 size={12} />
                  Tune
                </button>
                <button
                  onClick={() => onViewActivities?.(participant.username)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400 rounded-lg text-xs font-medium hover:bg-violet-100 dark:hover:bg-violet-900/40 transition"
                >
                  <BarChart3 size={12} />
                  Stats
                </button>
              </div>

              {/* Subscription info */}
              {hiredInfo && (
                <div className="mt-3 pt-3 border-t border-slate-200 dark:border-surface-600 flex items-center justify-between">
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-medium">Hired:</span> {formatDate(hiredInfo.hiredAt)}
                  </div>
                  <div className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    hiredInfo.agent.pricing === 'free'
                      ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
                      : 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400'
                  }`}>
                    {hiredInfo.agent.pricing === 'free' ? 'Free' :
                     hiredInfo.agent.priceAmount ? `$${hiredInfo.agent.priceAmount}/mo` : 'Subscription'}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
