import React, { useState, useEffect } from 'react';
import {
  Bot, MessageSquare, FileText, Search, Zap, Shield, Globe, Code,
  ChevronRight, X, Star, SlidersHorizontal, Crown, BarChart3,
  UserPlus, UserMinus,
} from 'lucide-react';
import { api } from '../../services/api';
import AgentHiringPage from './AgentHiringPage';

interface AgentData {
  id: string;
  slug: string;
  name: string;
  role: string;
  tagline: string | null;
  description: string;
  category: string;
  capabilities: string[];
  avatarUrl: string | null;
  gradientFrom: string | null;
  gradientTo: string | null;
  iconName: string | null;
  pricing: string;
  isBuiltIn: boolean;
  isMandatory: boolean;
  isPopular: boolean;
}

interface OrgAgentData {
  id: string;
  agentId: string;
  isEnabled: boolean;
  settings: any;
  agent: AgentData;
}

interface AgentsPageProps {
  onClose?: () => void;
  isEmbedded?: boolean;
  initialAgentSlug?: string; // Navigate directly to this agent's hiring page
}

const ICON_MAP: Record<string, React.ReactNode> = {
  MessageSquare: <MessageSquare size={20} />,
  Globe: <Globe size={20} />,
  BarChart3: <BarChart3 size={20} />,
  Code: <Code size={20} />,
  Shield: <Shield size={20} />,
  Zap: <Zap size={20} />,
  FileText: <FileText size={20} />,
  Bot: <Bot size={20} />,
};

const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'productivity', label: 'Productivity' },
  { id: 'communication', label: 'Comms' },
  { id: 'analysis', label: 'Analysis' },
  { id: 'security', label: 'Security' },
];

export default function AgentsPage({ onClose, isEmbedded = false, initialAgentSlug }: AgentsPageProps) {
  const [catalog, setCatalog] = useState<AgentData[]>([]);
  const [hiredAgents, setHiredAgents] = useState<OrgAgentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedAgent] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [tuningAgent, setTuningAgent] = useState<string | null>(null);
  const [agentSettings, setAgentSettings] = useState<Record<string, { responsiveness: number; creativity: number; verbosity: number }>>({});
  const [isMobile] = useState(window.innerWidth < 768);
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  // Navigate to specific agent when initialAgentSlug is provided
  useEffect(() => {
    if (initialAgentSlug && catalog.length > 0) {
      const agent = catalog.find(a => a.slug === initialAgentSlug);
      if (agent) {
        setSelectedAgent(agent.id);
      }
    }
  }, [initialAgentSlug, catalog]);

  const loadData = async () => {
    try {
      // Load catalog and hired agents independently so one failure doesn't block the other
      const [catalogResult, hiredResult] = await Promise.allSettled([
        api.getAgentCatalog(),
        api.getHiredAgents(),
      ]);

      if (catalogResult.status === 'fulfilled') {
        setCatalog(catalogResult.value);
      } else {
        console.error('Failed to load agent catalog:', catalogResult.reason);
      }

      if (hiredResult.status === 'fulfilled') {
        const hiredData = hiredResult.value;
        setHiredAgents(Array.isArray(hiredData) ? hiredData : []);
        // Initialize settings from hired agents
        const settings: Record<string, any> = {};
        (Array.isArray(hiredData) ? hiredData : []).forEach((ha: OrgAgentData) => {
          if (ha.settings) {
            settings[ha.agentId] = ha.settings;
          }
        });
        setAgentSettings(settings);
      } else {
        console.error('Failed to load hired agents:', hiredResult.reason);
        setHiredAgents([]);
      }
    } catch (err) {
      console.error('Failed to load agents:', err);
    } finally {
      setLoading(false);
    }
  };

  const hiredMap = new Map(hiredAgents.map(ha => [ha.agentId, ha]));

  const getAgentSetting = (agentId: string) =>
    agentSettings[agentId] || { responsiveness: 70, creativity: 50, verbosity: 60 };

  const updateAgentSetting = (agentId: string, key: string, value: number) => {
    setAgentSettings(prev => ({
      ...prev,
      [agentId]: { ...getAgentSetting(agentId), [key]: value },
    }));
  };

  const saveAgentSettings = async (agentId: string) => {
    setSavingSettings(true);
    try {
      await api.updateAgentSettings(agentId, { settings: getAgentSetting(agentId) });
      setTuningAgent(null);
    } catch (err) {
      console.error('Failed to save settings:', err);
    } finally {
      setSavingSettings(false);
    }
  };

  const toggleAgent = async (agentId: string) => {
    const hired = hiredMap.get(agentId);
    if (!hired) return;
    const agent = catalog.find(a => a.id === agentId);
    if (agent?.isMandatory) return;

    try {
      const updated = await api.updateAgentSettings(agentId, { isEnabled: !hired.isEnabled });
      setHiredAgents(prev => prev.map(ha => ha.agentId === agentId ? { ...ha, isEnabled: updated.isEnabled } : ha));
    } catch (err) {
      console.error('Failed to toggle agent:', err);
    }
  };

  const handleHire = async (agentId: string) => {
    try {
      const result = await api.hireAgent(agentId);
      setHiredAgents(prev => [...prev, result]);
    } catch (err) {
      console.error('Failed to hire agent:', err);
    }
  };

  const handleFire = async (agentId: string) => {
    try {
      await api.fireAgent(agentId);
      setHiredAgents(prev => prev.filter(ha => ha.agentId !== agentId));
    } catch (err) {
      console.error('Failed to fire agent:', err);
    }
  };

  const filteredAgents = catalog.filter((agent) => {
    const matchesCategory = activeCategory === 'all' || agent.category === activeCategory;
    const matchesSearch =
      !searchQuery ||
      agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      agent.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  // Show hiring page if agent selected
  const selectedAgentData = selectedAgent ? catalog.find(a => a.id === selectedAgent) : null;
  if (selectedAgentData) {
    const hired = hiredMap.has(selectedAgentData.id);
    const hiringPage = (
      <AgentHiringPage
        agent={selectedAgentData}
        isHired={hired}
        onHire={async (agentId) => {
          await handleHire(agentId);
        }}
        onFire={async (agentId) => {
          await handleFire(agentId);
          // Navigate back to agent list after firing so user can re-hire
          setSelectedAgent(null);
        }}
        onBack={() => setSelectedAgent(null)}
      />
    );
    if (isEmbedded) {
      return <div className="max-w-2xl h-full">{hiringPage}</div>;
    }
    return <div className="flex flex-col h-full bg-white dark:bg-surface-900 overflow-hidden">{hiringPage}</div>;
  }

  const content = (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      {!isEmbedded && (
        <div className="flex items-center gap-3 p-3 border-b border-gray-200 dark:border-surface-700 bg-white dark:bg-surface-900 flex-shrink-0">
          <div className="w-9 h-9 bg-gradient-to-br from-violet-500 to-blue-500 rounded-full flex items-center justify-center flex-shrink-0">
            <Bot size={18} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-sm text-gray-900 dark:text-white">AI Agents</h2>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">
              {hiredAgents.filter(ha => ha.isEnabled).length} active of {hiredAgents.length} hired
            </p>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 dark:hover:bg-surface-800 rounded-lg transition flex-shrink-0"
            >
              <X size={18} className="text-gray-500" />
            </button>
          )}
        </div>
      )}

      {/* Search */}
      <div className={`px-3 ${isEmbedded ? 'pt-0' : 'pt-3'} pb-2 flex-shrink-0`}>
        {isEmbedded && (
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4">Agents Management</h2>
        )}
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search agents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-gray-100 dark:bg-surface-800 border border-gray-200 dark:border-surface-700 rounded-lg text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Category Tabs */}
      <div className="px-3 pb-2 flex-shrink-0 overflow-hidden">
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-0.5 px-0.5" style={{ WebkitOverflowScrolling: 'touch' }}>
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                activeCategory === cat.id
                  ? 'bg-primary-600 text-white shadow-sm'
                  : 'bg-gray-100 dark:bg-surface-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-surface-700'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Agent List */}
      <div className={`flex-1 overflow-y-auto px-3 space-y-2.5 ${isMobile && !isEmbedded ? 'pb-20' : 'pb-4'}`}>
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="w-8 h-8 border-3 border-violet-500 border-t-transparent rounded-full animate-spin" />
            <p className="mt-3 text-sm text-slate-500">Loading agents...</p>
          </div>
        ) : filteredAgents.map((agent) => {
          const hired = hiredMap.get(agent.id);
          const isEnabled = hired?.isEnabled ?? false;
          const isHired = !!hired;
          const isExpanded = expandedAgent === agent.id;

          return (
            <div
              key={agent.id}
              className={`rounded-xl border transition-all overflow-hidden ${
                isHired && isEnabled
                  ? 'border-primary-200 dark:border-primary-800 bg-primary-50/50 dark:bg-primary-900/10'
                  : isHired
                  ? 'border-gray-200 dark:border-surface-700 bg-gray-50 dark:bg-surface-800'
                  : 'border-gray-200 dark:border-surface-700 bg-white dark:bg-surface-800'
              }`}
            >
              {/* Agent Card Header */}
              <div
                className="flex items-center gap-2.5 p-3 cursor-pointer"
                onClick={() => setSelectedAgent(agent.id)}
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{
                    background: `linear-gradient(135deg, ${agent.gradientFrom || '#8B5CF6'}, ${agent.gradientTo || '#6366F1'})`,
                  }}
                >
                  <span className="text-white">{ICON_MAP[agent.iconName || 'Bot'] || <Bot size={20} />}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h3 className="font-semibold text-sm text-gray-900 dark:text-white truncate">{agent.name}</h3>
                    {agent.isMandatory && (
                      <span className="flex items-center gap-0.5 px-1.5 py-0.5 bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 rounded text-[9px] font-medium flex-shrink-0">
                        <Crown size={7} /> Mandatory
                      </span>
                    )}
                    {agent.isPopular && !agent.isMandatory && (
                      <span className="flex items-center gap-0.5 px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded text-[9px] font-medium flex-shrink-0">
                        <Star size={7} className="fill-current" /> Popular
                      </span>
                    )}
                    {!isHired && !agent.isMandatory && (
                      <span className="px-1.5 py-0.5 bg-slate-100 dark:bg-surface-700 text-slate-500 dark:text-slate-400 rounded text-[9px] font-medium flex-shrink-0">
                        Not hired
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate mt-0.5">{agent.role}</p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {/* Tuning button */}
                  {isHired && isEnabled && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setTuningAgent(tuningAgent === agent.id ? null : agent.id);
                      }}
                      className={`p-1.5 rounded-lg transition flex-shrink-0 ${
                        tuningAgent === agent.id
                          ? 'bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400'
                          : 'hover:bg-gray-100 dark:hover:bg-surface-700 text-gray-400 dark:text-gray-500'
                      }`}
                      title="Tune agent settings"
                    >
                      <SlidersHorizontal size={14} />
                    </button>
                  )}
                  {/* Toggle switch — mandatory agents always show ON + locked */}
                  {agent.isMandatory ? (
                    <div
                      className="relative rounded-full bg-primary-600 opacity-70 cursor-not-allowed flex-shrink-0"
                      style={{ width: 44, height: 24, minWidth: 44, boxSizing: 'border-box' }}
                      title="Mandatory agent — always active"
                    >
                      <div className="absolute bg-white rounded-full shadow-sm" style={{ width: 18, height: 18, top: 3, left: 23 }} />
                    </div>
                  ) : isHired ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleAgent(agent.id);
                        }}
                        className={`relative rounded-full transition-colors flex-shrink-0 ${
                          isEnabled ? 'bg-primary-600' : 'bg-gray-300 dark:bg-surface-600'
                        }`}
                        style={{ width: 44, height: 24, minWidth: 44, boxSizing: 'border-box' }}
                      >
                        <div
                          className="absolute bg-white rounded-full shadow-sm"
                          style={{ width: 18, height: 18, top: 3, left: isEnabled ? 23 : 3, transition: 'left 0.2s ease' }}
                        />
                      </button>
                  ) : null}
                  <ChevronRight
                    size={14}
                    className={`text-gray-400 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-90' : ''}`}
                  />
                </div>
              </div>

              {/* Tuning Panel */}
              {tuningAgent === agent.id && isHired && isEnabled && (
                <div className="px-3 pb-3 border-t border-violet-100 dark:border-violet-900/30 pt-3 bg-gradient-to-b from-violet-50/50 to-transparent dark:from-violet-900/10 dark:to-transparent">
                  <div className="flex items-center gap-2 mb-3">
                    <SlidersHorizontal size={13} className="text-violet-600 dark:text-violet-400" />
                    <p className="text-xs font-semibold text-violet-700 dark:text-violet-300">Agent Tuning</p>
                  </div>
                  <div className="space-y-3">
                    {[
                      { key: 'responsiveness', label: 'Responsiveness', desc: 'How quickly the agent reacts' },
                      { key: 'creativity', label: 'Creativity', desc: 'Balance between precise and creative' },
                      { key: 'verbosity', label: 'Verbosity', desc: 'How detailed responses are' },
                    ].map(({ key, label, desc }) => (
                      <div key={key}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[11px] font-medium text-gray-700 dark:text-gray-300">{label}</span>
                          <span className="text-[10px] text-violet-600 dark:text-violet-400 font-semibold">
                            {getAgentSetting(agent.id)[key as keyof ReturnType<typeof getAgentSetting>]}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={getAgentSetting(agent.id)[key as keyof ReturnType<typeof getAgentSetting>]}
                          onChange={(e) => updateAgentSetting(agent.id, key, parseInt(e.target.value))}
                          className="w-full h-1.5 bg-gray-200 dark:bg-surface-700 rounded-full appearance-none cursor-pointer accent-violet-600"
                        />
                        <p className="text-[9px] text-gray-400 dark:text-gray-500 mt-0.5">{desc}</p>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      saveAgentSettings(agent.id);
                    }}
                    disabled={savingSettings}
                    className="mt-3 w-full flex items-center justify-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-xs font-medium transition disabled:opacity-50"
                  >
                    {savingSettings ? 'Saving...' : 'Save Settings'}
                  </button>
                </div>
              )}

              {/* Expanded Details */}
              {isExpanded && tuningAgent !== agent.id && (
                <div className="px-3 pb-3 border-t border-gray-100 dark:border-surface-700 pt-2.5">
                  <p className="text-[11px] text-gray-600 dark:text-gray-400 mb-2.5 leading-relaxed">{agent.description}</p>
                  <div className="space-y-1.5 mb-3">
                    <p className="text-[9px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-semibold">Capabilities</p>
                    <div className="flex flex-wrap gap-1">
                      {agent.capabilities.map((cap) => (
                        <span
                          key={cap}
                          className="px-2 py-0.5 bg-gray-100 dark:bg-surface-700 text-gray-600 dark:text-gray-300 rounded text-[10px] font-medium"
                        >
                          {cap}
                        </span>
                      ))}
                    </div>
                  </div>
                  {isHired ? (
                    !agent.isMandatory && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleFire(agent.id);
                        }}
                        className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg text-xs font-medium transition"
                      >
                        <UserMinus size={13} />
                        Remove from Office
                      </button>
                    )
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleHire(agent.id);
                      }}
                      className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-xs font-medium transition"
                    >
                      <UserPlus size={13} />
                      Hire Agent
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {!loading && filteredAgents.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Search size={28} className="text-gray-300 dark:text-gray-600 mb-3" />
            <p className="text-sm text-gray-500 dark:text-gray-400">No agents found</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Try a different search or category</p>
          </div>
        )}
      </div>
    </div>
  );

  if (isEmbedded) {
    return <div className="max-w-2xl h-full">{content}</div>;
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-surface-900 overflow-hidden">
      {content}
    </div>
  );
}
