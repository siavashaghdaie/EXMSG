import React from 'react';
import { ArrowLeft, Building2, Cpu, Zap, Shield, Globe, MessageSquare, BarChart3 } from 'lucide-react';

interface Agent {
  id: string;
  name: string;
  role: string;
  status: 'active' | 'idle' | 'offline';
  description: string;
  currentTask: string | null;
  icon: React.ReactNode;
  color: string;
}

const agents: Agent[] = [
  {
    id: 'linda',
    name: 'Linda',
    role: 'AI Secretary',
    status: 'active',
    description: 'Manages tasks, announcements, and team coordination. Responds to messages and voice notes.',
    currentTask: 'Monitoring conversations and task updates',
    icon: <MessageSquare size={22} />,
    color: 'from-purple-500 to-indigo-600',
  },
  {
    id: 'databot',
    name: 'DataBot',
    role: 'Data Analyst',
    status: 'idle',
    description: 'Analyzes spreadsheets, generates reports, and provides data insights for decision-making.',
    currentTask: null,
    icon: <BarChart3 size={22} />,
    color: 'from-blue-500 to-cyan-600',
  },
  {
    id: 'linguabot',
    name: 'LinguaBot',
    role: 'Translator',
    status: 'active',
    description: 'Real-time message translation across 50+ languages. Auto-detects language and translates seamlessly.',
    currentTask: 'Auto-translating chat messages',
    icon: <Globe size={22} />,
    color: 'from-green-500 to-emerald-600',
  },
  {
    id: 'codeassist',
    name: 'CodeAssist',
    role: 'Developer Assistant',
    status: 'idle',
    description: 'Reviews code, suggests improvements, and helps debug technical issues shared in conversations.',
    currentTask: null,
    icon: <Cpu size={22} />,
    color: 'from-orange-500 to-amber-600',
  },
  {
    id: 'guardian',
    name: 'Guardian',
    role: 'Security Monitor',
    status: 'active',
    description: 'Monitors for sensitive data leaks, phishing attempts, and suspicious activity in messages.',
    currentTask: 'Scanning messages for security threats',
    icon: <Shield size={22} />,
    color: 'from-red-500 to-rose-600',
  },
  {
    id: 'quickreply',
    name: 'QuickReply',
    role: 'Auto-Responder',
    status: 'idle',
    description: 'Drafts quick replies and suggests responses based on conversation context and tone.',
    currentTask: null,
    icon: <Zap size={22} />,
    color: 'from-yellow-500 to-orange-500',
  },
];

interface OfficePageProps {
  onClose: () => void;
}

export default function OfficePage({ onClose }: OfficePageProps) {
  const activeCount = agents.filter(a => a.status === 'active').length;

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
          <Building2 size={22} className="text-primary-600" />
          <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Office</h1>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
            {activeCount} active
          </span>
        </div>
      </div>

      {/* Summary Banner */}
      <div className="mx-4 mt-4 p-4 rounded-xl bg-gradient-to-r from-primary-50 to-indigo-50 dark:from-surface-800 dark:to-surface-700 border border-primary-100 dark:border-surface-600">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary-100 dark:bg-primary-900 flex items-center justify-center">
            <Building2 size={20} className="text-primary-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              {agents.length} AI Agents in your Office
            </p>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              {activeCount} working right now, {agents.length - activeCount} on standby
            </p>
          </div>
        </div>
      </div>

      {/* Agent Cards */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {agents.map((agent) => (
          <div
            key={agent.id}
            className="rounded-xl border border-slate-200 dark:border-surface-600 bg-white dark:bg-surface-800 overflow-hidden hover:shadow-md transition-shadow"
          >
            <div className="flex items-start gap-3 p-4">
              {/* Agent Icon */}
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${agent.color} flex items-center justify-center flex-shrink-0 text-white shadow-sm`}>
                {agent.icon}
              </div>

              {/* Agent Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">{agent.name}</h3>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                    agent.status === 'active'
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                      : agent.status === 'idle'
                      ? 'bg-slate-100 text-slate-600 dark:bg-surface-700 dark:text-slate-400'
                      : 'bg-red-100 text-red-600'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      agent.status === 'active' ? 'bg-green-500' : agent.status === 'idle' ? 'bg-slate-400' : 'bg-red-500'
                    }`} />
                    {agent.status.charAt(0).toUpperCase() + agent.status.slice(1)}
                  </span>
                </div>
                <p className="text-xs font-medium text-primary-600 dark:text-primary-400 mb-1">{agent.role}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{agent.description}</p>

                {/* Current Task */}
                {agent.currentTask && (
                  <div className="mt-2 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-800">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                    <span className="text-[11px] text-green-700 dark:text-green-400 font-medium">
                      {agent.currentTask}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
