import React, { useState, useEffect } from 'react';
import {
  ArrowLeft, Building2, Search, Globe, MessageSquare, BarChart3,
  Code, Shield, Zap, FileText, Sparkles, Check, UserPlus, UserMinus,
  ChevronDown, ChevronUp, Star, Crown, Bot,
} from 'lucide-react';
import { api } from '../../services/api';

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
  priceAmount: number | null;
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

const ICON_MAP: Record<string, React.ReactNode> = {
  MessageSquare: <MessageSquare size={24} />,
  Globe: <Globe size={24} />,
  BarChart3: <BarChart3 size={24} />,
  Code: <Code size={24} />,
  Shield: <Shield size={24} />,
  Zap: <Zap size={24} />,
  FileText: <FileText size={24} />,
  Bot: <Bot size={24} />,
};

const CATEGORIES = [
  { id: 'all', label: 'All Agents', icon: <Sparkles size={14} /> },
  { id: 'productivity', label: 'Productivity', icon: <Zap size={14} /> },
  { id: 'communication', label: 'Communication', icon: <Globe size={14} /> },
  { id: 'analysis', label: 'Analysis', icon: <BarChart3 size={14} /> },
  { id: 'security', label: 'Security', icon: <Shield size={14} /> },
];

interface OfficePageProps {
  onClose: () => void;
}

export default function OfficePage({ onClose }: OfficePageProps) {
  const [catalog, setCatalog] = useState<AgentData[]>([]);
  const [hiredAgents, setHiredAgents] = useState<OrgAgentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  const [hiringId, setHiringId] = useState<string | null>(null);
  const [firingId, setFiringId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [catalogData, hiredData] = await Promise.all([
        api.getAgentCatalog(),
        api.getHiredAgents(),
      ]);
      setCatalog(catalogData);
      setHiredAgents(hiredData);
    } catch (err) {
      console.error('Failed to load agents:', err);
    } finally {
      setLoading(false);
    }
  };

  const hiredAgentIds = new Set(hiredAgents.map(ha => ha.agentId));

  const handleHire = async (agentId: string) => {
    setHiringId(agentId);
    try {
      const result = await api.hireAgent(agentId);
      setHiredAgents(prev => [...prev, result]);
    } catch (err) {
      console.error('Failed to hire agent:', err);
    } finally {
      setHiringId(null);
    }
  };

  const handleFire = async (agentId: string) => {
    setFiringId(agentId);
    try {
      await api.fireAgent(agentId);
      setHiredAgents(prev => prev.filter(ha => ha.agentId !== agentId));
    } catch (err) {
      console.error('Failed to fire agent:', err);
    } finally {
      setFiringId(null);
    }
  };

  const filteredAgents = catalog.filter((agent) => {
    const matchesCategory = activeCategory === 'all' || agent.category === activeCategory;
    const matchesSearch = !searchQuery ||
      agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      agent.role.toLowerCase().includes(searchQuery.toLowerCase()) ||
      agent.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const hiredCount = hiredAgents.length;
  const activeCount = hiredAgents.filter(ha => ha.isEnabled).length;

  return (
    <div className="flex flex-col h-full bg-white dark:bg-surface-900">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 dark:border-surface-700 flex-shrink-0 bg-gradient-to-r from-white to-slate-50 dark:from-surface-900 dark:to-surface-800">
        <button
          onClick={onClose}
          className="p-2 hover:bg-slate-100 dark:hover:bg-surface-700 rounded-lg transition"
        >
          <ArrowLeft size={20} className="text-slate-600 dark:text-slate-400" />
        </button>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
            <Building2 size={16} className="text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-900 dark:text-white">AI Office</h1>
            <p className="text-[10px] text-slate-500 dark:text-slate-400">
              {hiredCount} hired, {activeCount} active
            </p>
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="px-4 pt-3 pb-2 flex-shrink-0">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search agents by name, role, or skill..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-100 dark:bg-surface-800 border border-slate-200 dark:border-surface-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition"
          />
        </div>
      </div>

      {/* Category Filter Tabs */}
      <div className="px-4 pb-3 flex-shrink-0">
        <div className="flex gap-1.5 overflow-x-auto pb-1" style={{ WebkitOverflowScrolling: 'touch' }}>
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`flex items-center gap-1.5 flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                activeCategory === cat.id
                  ? 'bg-violet-600 text-white shadow-sm shadow-violet-200 dark:shadow-none'
                  : 'bg-slate-100 dark:bg-surface-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-surface-700'
              }`}
            >
              {cat.icon}
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Agent Cards */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="w-10 h-10 border-3 border-violet-500 border-t-transparent rounded-full animate-spin" />
            <p className="mt-3 text-sm text-slate-500">Loading agents...</p>
          </div>
        ) : filteredAgents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Search size={32} className="text-slate-300 dark:text-slate-600 mb-3" />
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">No agents found</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Try a different search or category</p>
          </div>
        ) : (
          filteredAgents.map((agent) => {
            const isHired = hiredAgentIds.has(agent.id);
            const isExpanded = expandedAgent === agent.id;
            const isHiring = hiringId === agent.id;
            const isFiring = firingId === agent.id;

            return (
              <div
                key={agent.id}
                className={`rounded-2xl border overflow-hidden transition-all ${
                  isHired
                    ? 'border-violet-200 dark:border-violet-800/50 bg-gradient-to-r from-violet-50/50 to-white dark:from-violet-900/10 dark:to-surface-800 shadow-sm'
                    : 'border-slate-200 dark:border-surface-700 bg-white dark:bg-surface-800 hover:shadow-md'
                }`}
              >
                {/* Main Card */}
                <div
                  className="flex items-start gap-3 p-4 cursor-pointer"
                  onClick={() => setExpandedAgent(isExpanded ? null : agent.id)}
                >
                  {/* Agent Avatar */}
                  <div
                    className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0 text-white shadow-lg"
                    style={{
                      background: `linear-gradient(135deg, ${agent.gradientFrom || '#8B5CF6'}, ${agent.gradientTo || '#6366F1'})`,
                    }}
                  >
                    {agent.avatarUrl ? (
                      <img src={agent.avatarUrl} alt={agent.name} className="w-full h-full rounded-xl object-cover" />
                    ) : (
                      ICON_MAP[agent.iconName || 'Bot'] || <Bot size={24} />
                    )}
                  </div>

                  {/* Agent Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 truncate">
                        {agent.name}
                      </h3>
                      {agent.isMandatory && (
                        <span className="flex items-center gap-0.5 px-1.5 py-0.5 bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 rounded text-[9px] font-semibold flex-shrink-0">
                          <Crown size={8} /> Core
                        </span>
                      )}
                      {agent.isPopular && !agent.isMandatory && (
                        <span className="flex items-center gap-0.5 px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded text-[9px] font-semibold flex-shrink-0">
                          <Star size={8} className="fill-current" /> Popular
                        </span>
                      )}
                      {isHired && (
                        <span className="flex items-center gap-0.5 px-1.5 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded text-[9px] font-semibold flex-shrink-0">
                          <Check size={8} /> Hired
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-medium text-violet-600 dark:text-violet-400 mb-1">
                      {agent.role}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-2">
                      {agent.tagline || agent.description}
                    </p>
                  </div>

                  {/* Expand Arrow */}
                  <div className="flex-shrink-0 pt-1">
                    {isExpanded ? (
                      <ChevronUp size={16} className="text-slate-400" />
                    ) : (
                      <ChevronDown size={16} className="text-slate-400" />
                    )}
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-slate-100 dark:border-surface-700">
                    {/* Full Description */}
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed mt-3 mb-3">
                      {agent.description}
                    </p>

                    {/* Capabilities */}
                    <div className="mb-4">
                      <p className="text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500 font-bold mb-2">
                        Capabilities
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {agent.capabilities.map((cap) => (
                          <span
                            key={cap}
                            className="inline-flex items-center gap-1 px-2 py-1 bg-slate-100 dark:bg-surface-700 text-slate-600 dark:text-slate-300 rounded-lg text-[10px] font-medium"
                          >
                            <Sparkles size={9} className="text-violet-500" />
                            {cap}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Pricing */}
                    <div className="flex items-center gap-2 mb-4">
                      <span className="text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500 font-bold">
                        Pricing:
                      </span>
                      <span className="px-2.5 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full text-[11px] font-bold">
                        {agent.pricing === 'free' ? 'Free' : `$${agent.priceAmount}/mo`}
                      </span>
                    </div>

                    {/* Action Button */}
                    {agent.isMandatory ? (
                      <div className="flex items-center gap-2 px-4 py-2.5 bg-violet-50 dark:bg-violet-900/20 rounded-xl text-violet-700 dark:text-violet-300 text-xs font-medium">
                        <Crown size={14} />
                        Core agent — always active in your workspace
                      </div>
                    ) : isHired ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleFire(agent.id);
                        }}
                        disabled={isFiring}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 rounded-xl text-xs font-semibold transition disabled:opacity-50"
                      >
                        {isFiring ? (
                          <div className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <UserMinus size={14} />
                        )}
                        {isFiring ? 'Removing...' : 'Remove from Office'}
                      </button>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleHire(agent.id);
                        }}
                        disabled={isHiring}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs font-semibold transition shadow-sm disabled:opacity-50"
                      >
                        {isHiring ? (
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <UserPlus size={14} />
                        )}
                        {isHiring ? 'Hiring...' : 'Hire Agent'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
