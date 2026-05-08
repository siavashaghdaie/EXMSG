import { useEffect, useState } from 'react';
import { Eye, Settings2, Bot, X, BarChart3, UserPlus } from 'lucide-react';
import { api } from '@/services/api';

interface AgentPanelProps {
  agentParticipants: Array<{ id: string; username: string; displayName?: string; avatar?: string; email: string }>;
  conversationId: string;
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

export default function AgentPanel({ agentParticipants, conversationId, onClose, onViewActivities, onOpenSettings }: AgentPanelProps) {
  const [hiredAgents, setHiredAgents] = useState<HiredAgentInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingAgent, setAddingAgent] = useState<string | null>(null);

  useEffect(() => {
    api.getHiredAgents()
      .then((agents: any[]) => setHiredAgents(agents))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Determine which hired agents are in the chat as participants
  const agentParticipantSlugs = new Set(
    agentParticipants.map(p => p.username)
  );

  // Show agents that are either: (1) participants in this chat, OR (2) hired and enabled
  const visibleAgents = hiredAgents.filter(
    ha => agentParticipantSlugs.has(ha.agent.slug) || ha.isEnabled
  );

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

  const handleAddToChat = async (agentSlug: string) => {
    try {
      setAddingAgent(agentSlug);
      // Search for the agent's system user
      const results = await api.searchUsers(agentSlug);
      const agentUser = results.find((u: any) =>
        u.username === agentSlug || u.email?.endsWith('@omnilink.system')
      );
      if (agentUser) {
        await api.addMemberToConversation(conversationId, agentUser.id);
        // Refresh page to show updated participants
        window.location.reload();
      }
    } catch (err) {
      console.error('Failed to add agent to chat:', err);
    } finally {
      setAddingAgent(null);
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
          <h3 className="font-semibold text-slate-900 dark:text-white">AI Agents</h3>
          <span className="text-xs bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 px-1.5 py-0.5 rounded-full font-medium">
            {visibleAgents.length}
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
        ) : visibleAgents.length === 0 ? (
          <div className="text-center py-8 text-slate-500 dark:text-slate-400 text-sm">
            No active agents in this chat.
          </div>
        ) : (
          visibleAgents.map((ha) => {
            const isInChat = agentParticipantSlugs.has(ha.agent.slug);

            return (
              <div
                key={ha.id}
                className={`rounded-xl p-4 border ${isInChat
                  ? 'bg-slate-50 dark:bg-surface-800 border-slate-200 dark:border-surface-700'
                  : 'bg-slate-50/50 dark:bg-surface-800/50 border-dashed border-slate-300 dark:border-surface-600'
                }`}
              >
                {/* Agent header */}
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-lg"
                    style={{
                      background: ha.agent.gradientFrom && ha.agent.gradientTo
                        ? `linear-gradient(135deg, ${ha.agent.gradientFrom}, ${ha.agent.gradientTo})`
                        : '#8b5cf6'
                    }}
                  >
                    {ha.agent.name[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h4 className="font-semibold text-slate-900 dark:text-white text-sm">
                        {ha.agent.name}
                      </h4>
                      {isInChat ? (
                        <span className="text-[9px] px-1.5 py-0.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-full font-medium">
                          IN CHAT
                        </span>
                      ) : ha.isEnabled ? (
                        <span className="text-[9px] px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full font-medium">
                          ACTIVE
                        </span>
                      ) : null}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {ha.agent.role}
                    </p>
                  </div>
                  {/* On/Off toggle */}
                  <button
                    onClick={() => handleToggleAgent(ha.id, ha.isEnabled)}
                    className={`relative w-10 h-5 rounded-full transition-colors ${
                      ha.isEnabled ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-surface-600'
                    }`}
                    title={ha.isEnabled ? 'Enabled — click to disable' : 'Disabled — click to enable'}
                  >
                    <span
                      className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                        ha.isEnabled ? 'left-5' : 'left-0.5'
                      }`}
                    />
                  </button>
                </div>

                {/* Action buttons row */}
                <div className="flex items-center gap-2 flex-wrap">
                  {!isInChat && !ha.isEnabled && (
                    <button
                      onClick={() => handleAddToChat(ha.agent.slug)}
                      disabled={addingAgent === ha.agent.slug}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400 rounded-lg text-xs font-medium hover:bg-violet-100 dark:hover:bg-violet-900/40 transition disabled:opacity-50"
                    >
                      {addingAgent === ha.agent.slug ? (
                        <div className="animate-spin w-3 h-3 border border-violet-500 border-t-transparent rounded-full" />
                      ) : (
                        <UserPlus size={12} />
                      )}
                      Add to Chat
                    </button>
                  )}
                  {(isInChat || ha.isEnabled) && (
                    <>
                      <button
                        onClick={() => onViewActivities?.(ha.agent.slug)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-lg text-xs font-medium hover:bg-blue-100 dark:hover:bg-blue-900/40 transition"
                      >
                        <Eye size={12} />
                        Activity Log
                      </button>
                      <button
                        onClick={() => onOpenSettings?.(ha.agent.slug)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-surface-700 text-slate-600 dark:text-slate-300 rounded-lg text-xs font-medium hover:bg-slate-200 dark:hover:bg-surface-600 transition"
                      >
                        <Settings2 size={12} />
                        Tune
                      </button>
                      <button
                        onClick={() => onViewActivities?.(ha.agent.slug)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400 rounded-lg text-xs font-medium hover:bg-violet-100 dark:hover:bg-violet-900/40 transition"
                      >
                        <BarChart3 size={12} />
                        Stats
                      </button>
                    </>
                  )}
                </div>

                {/* Subscription info */}
                <div className="mt-3 pt-3 border-t border-slate-200 dark:border-surface-600 flex items-center justify-between">
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-medium">Hired:</span> {formatDate(ha.hiredAt)}
                  </div>
                  <div className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    ha.agent.pricing === 'free'
                      ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
                      : 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400'
                  }`}>
                    {ha.agent.pricing === 'free' ? 'Free' :
                     ha.agent.priceAmount ? `$${ha.agent.priceAmount}/mo` : 'Subscription'}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
