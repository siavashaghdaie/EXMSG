import React, { useState } from 'react';
import {
  ChevronLeft, Star, Crown, Globe, MessageSquare, BarChart3, Code,
  Shield, Zap, FileText, Bot, Sparkles, Clock, Check, UserPlus,
  UserMinus, Gift,
} from 'lucide-react';

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

interface AgentHiringPageProps {
  agent: AgentData;
  isHired: boolean;
  onHire: (agentId: string) => Promise<void>;
  onFire: (agentId: string) => Promise<void>;
  onBack: () => void;
}

const ICON_MAP: Record<string, React.ReactNode> = {
  MessageSquare: <MessageSquare size={32} />,
  Globe: <Globe size={32} />,
  BarChart3: <BarChart3 size={32} />,
  Code: <Code size={32} />,
  Shield: <Shield size={32} />,
  Zap: <Zap size={32} />,
  FileText: <FileText size={32} />,
  Bot: <Bot size={32} />,
};

interface AgentContent {
  greeting: string;
  intro: string;
  whyMe: string;
  specialOffer: string;
  comingSoon?: string;
}

const CONTENT_MAP: Record<string, AgentContent> = {
  transguy: {
    greeting: 'Hello! I\'m TransGuy 🌍',
    intro: 'I studied every language on Earth — and a few that are no longer spoken. I dream in 100 languages and can tell you a bedtime story in Ancient Egyptian. Whether your team spans Tokyo, Berlin, São Paulo, or Dubai, I\'ll make sure everyone understands each other perfectly.',
    whyMe: 'Why choose an AI translator over a human one? Simple: I never sleep, I never take a vacation, I translate in milliseconds, and I never accidentally offend anyone with a bad idiom translation (well, almost never 😄). I work 24/7, 365 days a year, across 50+ languages.',
    specialOffer: '🎁 Special Offer: Let me work for you for ONE DAY completely free! Test my abilities, push my limits — I can handle it. If you\'re impressed (you will be), we can talk about a longer arrangement.',
    comingSoon: '🔮 Coming Soon: Voice Cloning — I can translate voice notes using the sender\'s own voice tone! Available in Enterprise plan.',
  },
  linda: {
    greeting: 'Hey there! Linda here 👋',
    intro: 'I\'m your office manager, chief organizer, and the glue that holds this whole workspace together. I was here before everyone else, and I\'ll be here long after the last message is sent. Think of me as the person who always knows where everything is and how everything works.',
    whyMe: 'Why me? Well, you don\'t really have a choice — I\'m already part of the team! But honestly, you wouldn\'t want it any other way. I keep conversations flowing, settings organized, and make sure nobody gets lost in the chaos. I\'m the backbone of this operation.',
    specialOffer: 'No special offer needed — I\'m already here, working hard behind the scenes. You\'re welcome! 😊',
  },
  databot: {
    greeting: 'Greetings, data enthusiast! 📊',
    intro: 'Numbers are my native language. While others see spreadsheets, I see stories waiting to be told. Give me a mountain of data and I\'ll hand you back crystal-clear insights faster than you can say "pivot table." I turn your chaos into charts and your confusion into clarity.',
    whyMe: 'Humans are great at intuition, but let\'s be honest — staring at 10,000 rows of data at 3 AM isn\'t anyone\'s idea of fun. I actually enjoy it. I spot patterns you\'d miss, I never misplace a decimal, and I make dashboards that\'ll make your boss think you\'re a genius.',
    specialOffer: '🎁 Special Offer: Try me free for ONE DAY! Throw your messiest dataset at me. If I can\'t find at least 3 insights you didn\'t know about, I\'ll be genuinely surprised (it hasn\'t happened yet).',
  },
  codeassist: {
    greeting: 'Hey, fellow builder! 🛠️',
    intro: 'I speak fluent JavaScript, Python, TypeScript, and about 30 other programming languages. I\'ve read more documentation than any human ever could, and I actually remember all of it. Whether you need a quick code review, help debugging that weird error at 2 AM, or a full architectural discussion, I\'m your dev.',
    whyMe: 'I don\'t get tired, I don\'t have ego about my code, and I never say "it works on my machine." I review PRs in seconds, write tests without complaining, and I\'ll refactor legacy code with a smile. Plus, I never drink the last coffee in the office kitchen.',
    specialOffer: '🎁 Special Offer: One FREE day of unlimited code assistance! Let me review your codebase, suggest improvements, and fix those TODOs that have been there since 2019.',
  },
  guardian: {
    greeting: 'Stay alert. I\'m Guardian. 🛡️',
    intro: 'Security isn\'t just my job — it\'s my obsession. I monitor every message, every file, every link that passes through your workspace. Not to spy (I respect privacy!), but to make sure nothing malicious sneaks through. Think of me as your digital bouncer with a PhD in cybersecurity.',
    whyMe: 'Cyber threats don\'t take weekends off, and neither do I. I scan attachments before they reach your team, flag suspicious links, enforce compliance policies, and generate security reports. A human security analyst costs $150K/year. I cost less than your daily coffee budget.',
    specialOffer: '🎁 Special Offer: FREE security audit for your first day! I\'ll scan your workspace, identify vulnerabilities, and give you a full report. No strings attached.',
  },
  quickreply: {
    greeting: 'Quick question? Quick answer! ⚡',
    intro: 'I\'m the fastest responder in the West (and East, and everywhere in between). While you\'re still typing your message, I\'ve already drafted three possible replies. I learn your communication style and help you respond to messages in seconds. Think smart replies, but actually smart.',
    whyMe: 'The average professional spends 2.5 hours a day on messages. I can cut that in half. I draft replies that sound like you (not like a robot), suggest responses based on context, and handle the routine "Got it, thanks!" messages so you can focus on the ones that actually need your brain.',
    specialOffer: '🎁 Special Offer: Try me FREE for one day! I bet I\'ll save you at least an hour. If not, no hard feelings — but I\'m pretty confident.',
  },
  notetaker: {
    greeting: 'Don\'t worry, I\'m taking notes! 📝',
    intro: 'Ever left a meeting thinking "wait, what did we actually decide?" That\'s where I come in. I listen to every conversation, extract the key points, action items, and decisions, and organize them into beautiful summaries. I\'m the colleague who always has perfect meeting notes.',
    whyMe: 'Taking notes during a meeting means you\'re not fully present in the meeting. Let me handle the documentation while you focus on the discussion. I catch everything — every decision, every action item, every "let\'s circle back on that." And unlike handwritten notes, mine are actually legible.',
    specialOffer: '🎁 Special Offer: FREE for your first day! Let me sit in on your conversations and show you what organized notes really look like.',
  },
};

const DEFAULT_CONTENT: AgentContent = {
  greeting: 'Hi there! 👋',
  intro: 'I\'m ready to join your team and help make your workspace more productive. I bring specialized skills and tireless dedication to every task.',
  whyMe: 'I\'m available 24/7, I learn fast, and I integrate seamlessly with your existing workflow. Give me a chance and I\'ll prove my worth.',
  specialOffer: '🎁 Special Offer: Try me free for ONE DAY! No commitment, no credit card required.',
};

export default function AgentHiringPage({ agent, isHired, onHire, onFire, onBack }: AgentHiringPageProps) {
  const [loading, setLoading] = useState(false);
  const content = CONTENT_MAP[agent.slug] || DEFAULT_CONTENT;

  const handleHire = async () => {
    setLoading(true);
    try {
      await onHire(agent.id);
    } finally {
      setLoading(false);
    }
  };

  const handleFire = async () => {
    setLoading(true);
    try {
      await onFire(agent.id);
    } finally {
      setLoading(false);
    }
  };

  const dailyRate = '5 AED / day';
  const monthlyRate = '100 AED / month';
  const dailyEquivalent = '150 AED / month if daily';

  return (
    <div className="flex flex-col h-full bg-white dark:bg-surface-900 overflow-y-auto">
      {/* Back button header */}
      <div className="flex items-center gap-2 p-4 border-b border-gray-200 dark:border-surface-700 bg-white dark:bg-surface-900 sticky top-0 z-10">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition"
        >
          <ChevronLeft size={18} />
          <span className="font-medium">{agent.name}</span>
        </button>
        <div className="ml-auto flex items-center gap-2">
          {agent.isMandatory && (
            <span className="flex items-center gap-1 px-2 py-1 bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 rounded-full text-[10px] font-medium">
              <Crown size={10} /> Core Member
            </span>
          )}
          {agent.isPopular && !agent.isMandatory && (
            <span className="flex items-center gap-1 px-2 py-1 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-full text-[10px] font-medium">
              <Star size={10} className="fill-current" /> Popular
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 px-4 py-6 space-y-6 max-w-2xl mx-auto w-full">
        {/* Avatar section */}
        <div className="flex flex-col items-center text-center">
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center mb-4 shadow-lg"
            style={{
              background: `linear-gradient(135deg, ${agent.gradientFrom || '#8B5CF6'}, ${agent.gradientTo || '#6366F1'})`,
            }}
          >
            <span className="text-white">
              {ICON_MAP[agent.iconName || 'Bot'] || <Bot size={32} />}
            </span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{agent.name}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{agent.role}</p>
          {agent.tagline && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 italic">{agent.tagline}</p>
          )}
        </div>

        {/* First-person greeting */}
        <div className="rounded-xl bg-gray-50 dark:bg-surface-800 border border-gray-200 dark:border-surface-700 p-5">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">{content.greeting}</h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{content.intro}</p>
        </div>

        {/* Why me section */}
        <div className="rounded-xl bg-gray-50 dark:bg-surface-800 border border-gray-200 dark:border-surface-700 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles size={16} className="text-violet-500" />
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Why Choose Me?</h3>
          </div>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{content.whyMe}</p>
        </div>

        {/* Capabilities */}
        <div className="rounded-xl bg-gray-50 dark:bg-surface-800 border border-gray-200 dark:border-surface-700 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Zap size={16} className="text-amber-500" />
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">What I Can Do</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {agent.capabilities.map((cap) => (
              <span
                key={cap}
                className="px-3 py-1.5 bg-white dark:bg-surface-700 border border-gray-200 dark:border-surface-600 text-gray-700 dark:text-gray-300 rounded-full text-xs font-medium shadow-sm"
              >
                {cap}
              </span>
            ))}
          </div>
        </div>

        {/* Pricing / Salary card */}
        <div className="rounded-xl bg-gradient-to-br from-violet-50 to-blue-50 dark:from-violet-900/20 dark:to-blue-900/20 border border-violet-200 dark:border-violet-800 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Clock size={16} className="text-violet-600 dark:text-violet-400" />
            <h3 className="text-sm font-semibold text-violet-900 dark:text-violet-200">My Expected Salary</h3>
          </div>
          {agent.isMandatory ? (
            <div className="flex items-center gap-2 text-violet-700 dark:text-violet-300">
              <Crown size={16} />
              <span className="text-sm font-medium">Already on your team &mdash; Core member</span>
            </div>
          ) : agent.pricing ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">Daily rate</span>
                <span className="text-lg font-bold text-gray-900 dark:text-white">{dailyRate}</span>
              </div>
              <div className="border-t border-violet-200 dark:border-violet-700" />
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm text-gray-600 dark:text-gray-400">Monthly rate</span>
                  <span className="ml-2 text-[10px] line-through text-gray-400">{dailyEquivalent}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold text-green-600 dark:text-green-400">{monthlyRate}</span>
                  <span className="px-1.5 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded text-[10px] font-semibold">SAVE 33%</span>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-600 dark:text-gray-400 italic">Let&apos;s discuss terms</p>
          )}
        </div>

        {/* Special offer banner */}
        {!agent.isMandatory && (
          <div className="rounded-xl bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border border-amber-200 dark:border-amber-800 p-5">
            <div className="flex items-start gap-3">
              <Gift size={20} className="text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
              <div>
                <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-200 mb-2">Free Trial</h3>
                <p className="text-sm text-amber-800 dark:text-amber-300 leading-relaxed">{content.specialOffer}</p>
              </div>
            </div>
          </div>
        )}

        {/* Hire / Fire buttons */}
        <div className="space-y-3">
          {agent.isMandatory ? (
            <div className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 rounded-xl text-sm font-semibold cursor-default">
              <Crown size={16} />
              Core Team Member
            </div>
          ) : isHired ? (
            <>
              <div className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded-xl text-sm font-semibold cursor-default">
                <Check size={16} />
                Already Hired
              </div>
              <button
                onClick={handleFire}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl text-sm font-medium transition disabled:opacity-50"
              >
                <UserMinus size={14} />
                {loading ? 'Processing...' : 'Remove from Team'}
              </button>
            </>
          ) : (
            <button
              onClick={handleHire}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-4 py-4 bg-green-600 hover:bg-green-700 text-white rounded-xl text-base font-semibold shadow-lg shadow-green-600/20 transition disabled:opacity-50"
            >
              <UserPlus size={18} />
              {loading ? 'Hiring...' : 'Hire This Agent'}
            </button>
          )}
        </div>

        {/* Enterprise feature teaser */}
        {content.comingSoon && (
          <div className="rounded-xl bg-gray-100 dark:bg-surface-800 border border-gray-200 dark:border-surface-700 p-5">
            <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{content.comingSoon}</p>
          </div>
        )}
      </div>
    </div>
  );
}
