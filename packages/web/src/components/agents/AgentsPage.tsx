import React, { useState } from 'react';
import { Bot, MessageSquare, FileText, Search, Zap, Shield, Globe, Code, Plus, ChevronRight, X, Star } from 'lucide-react';

interface Agent {
  id: string;
  name: string;
  description: string;
  capabilities: string[];
  icon: React.ReactNode;
  category: 'productivity' | 'communication' | 'analysis' | 'security';
  color: string;
  popular?: boolean;
}

interface AgentsPageProps {
  onClose?: () => void;
  isEmbedded?: boolean;
}

const AVAILABLE_AGENTS: Agent[] = [
  {
    id: 'linda',
    name: 'Linda',
    description: 'AI secretary that manages your conversations, schedules, and daily tasks with natural language understanding.',
    capabilities: ['Message summarization', 'Meeting scheduling', 'Task delegation', 'Smart replies'],
    icon: <Bot size={20} />,
    category: 'productivity',
    color: 'from-violet-500 to-blue-500',
    popular: true,
  },
  {
    id: 'analyst',
    name: 'DataBot',
    description: 'Analyzes conversations and documents to extract insights, trends, and actionable data for your team.',
    capabilities: ['Conversation analytics', 'Sentiment analysis', 'Report generation', 'Trend detection'],
    icon: <FileText size={20} />,
    category: 'analysis',
    color: 'from-emerald-500 to-teal-500',
  },
  {
    id: 'translator',
    name: 'LinguaBot',
    description: 'Real-time message translation across 50+ languages with context-aware accuracy for global teams.',
    capabilities: ['Real-time translation', 'Language detection', 'Cultural context', 'Multi-language threads'],
    icon: <Globe size={20} />,
    category: 'communication',
    color: 'from-blue-500 to-cyan-500',
    popular: true,
  },
  {
    id: 'codebot',
    name: 'CodeAssist',
    description: 'Helps developers share, review, and discuss code snippets with syntax highlighting and AI suggestions.',
    capabilities: ['Code review', 'Syntax highlighting', 'Bug detection', 'Documentation'],
    icon: <Code size={20} />,
    category: 'productivity',
    color: 'from-orange-500 to-red-500',
  },
  {
    id: 'guardian',
    name: 'Guardian',
    description: 'Monitors conversations for compliance, sensitive data leaks, and policy violations in real-time.',
    capabilities: ['DLP monitoring', 'Compliance checks', 'Threat detection', 'Audit logging'],
    icon: <Shield size={20} />,
    category: 'security',
    color: 'from-red-500 to-pink-500',
  },
  {
    id: 'quickbot',
    name: 'QuickReply',
    description: 'Generates smart, context-aware reply suggestions to help you respond faster in busy conversations.',
    capabilities: ['Smart suggestions', 'Tone adjustment', 'Template responses', 'Priority detection'],
    icon: <Zap size={20} />,
    category: 'communication',
    color: 'from-amber-500 to-yellow-500',
  },
];

const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'productivity', label: 'Productivity' },
  { id: 'communication', label: 'Comms' },
  { id: 'analysis', label: 'Analysis' },
  { id: 'security', label: 'Security' },
];

export default function AgentsPage({ onClose, isEmbedded = false }: AgentsPageProps) {
  const [activeCategory, setActiveCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [enabledAgents, setEnabledAgents] = useState<Set<string>>(new Set(['linda']));
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  const [isMobile] = useState(window.innerWidth < 768);

  const filteredAgents = AVAILABLE_AGENTS.filter((agent) => {
    const matchesCategory = activeCategory === 'all' || agent.category === activeCategory;
    const matchesSearch =
      !searchQuery ||
      agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      agent.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const toggleAgent = (agentId: string) => {
    setEnabledAgents((prev) => {
      const next = new Set(prev);
      if (next.has(agentId)) {
        next.delete(agentId);
      } else {
        next.add(agentId);
      }
      return next;
    });
  };

  const content = (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header - only show when not embedded in settings */}
      {!isEmbedded && (
        <div className="flex items-center gap-3 p-3 border-b border-gray-200 dark:border-surface-700 bg-white dark:bg-surface-900 flex-shrink-0">
          <div className="w-9 h-9 bg-gradient-to-br from-violet-500 to-blue-500 rounded-full flex items-center justify-center flex-shrink-0">
            <Bot size={18} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-sm text-gray-900 dark:text-white">AI Agents</h2>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">
              {enabledAgents.size} active
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

      {/* Category Tabs — constrained with proper overflow */}
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
        {filteredAgents.map((agent) => {
          const isEnabled = enabledAgents.has(agent.id);
          const isExpanded = expandedAgent === agent.id;

          return (
            <div
              key={agent.id}
              className={`rounded-xl border transition-all overflow-hidden ${
                isEnabled
                  ? 'border-primary-200 dark:border-primary-800 bg-primary-50/50 dark:bg-primary-900/10'
                  : 'border-gray-200 dark:border-surface-700 bg-white dark:bg-surface-800'
              }`}
            >
              {/* Agent Card Header */}
              <div
                className="flex items-center gap-2.5 p-3 cursor-pointer"
                onClick={() => setExpandedAgent(isExpanded ? null : agent.id)}
              >
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${agent.color} flex items-center justify-center flex-shrink-0`}>
                  <span className="text-white">{agent.icon}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h3 className="font-semibold text-sm text-gray-900 dark:text-white truncate">{agent.name}</h3>
                    {agent.popular && (
                      <span className="flex items-center gap-0.5 px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded text-[9px] font-medium flex-shrink-0">
                        <Star size={7} className="fill-current" /> Popular
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate mt-0.5">{agent.description}</p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {/* Toggle switch */}
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
                      style={{
                        width: 18,
                        height: 18,
                        top: 3,
                        left: isEnabled ? 23 : 3,
                        transition: 'left 0.2s ease',
                      }}
                    />
                  </button>
                  <ChevronRight
                    size={14}
                    className={`text-gray-400 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-90' : ''}`}
                  />
                </div>
              </div>

              {/* Expanded Details */}
              {isExpanded && (
                <div className="px-3 pb-3 border-t border-gray-100 dark:border-surface-700 pt-2.5">
                  <p className="text-[11px] text-gray-600 dark:text-gray-400 mb-2.5 leading-relaxed">{agent.description}</p>
                  <div className="space-y-1.5">
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
                  {isEnabled ? (
                    <button className="mt-2.5 w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-xs font-medium transition">
                      <MessageSquare size={13} />
                      Add to Conversation
                    </button>
                  ) : (
                    <button
                      onClick={() => toggleAgent(agent.id)}
                      className="mt-2.5 w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-gray-100 dark:bg-surface-700 hover:bg-gray-200 dark:hover:bg-surface-600 text-gray-700 dark:text-gray-300 rounded-lg text-xs font-medium transition"
                    >
                      <Plus size={13} />
                      Enable Agent
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {filteredAgents.length === 0 && (
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
