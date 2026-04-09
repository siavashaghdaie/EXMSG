import { useState, useEffect, useMemo } from 'react';
import {
  Users,
  MessageSquare,
  ArrowLeft,
  Search,
  RefreshCw,
  Briefcase,
  Activity,
  Download,
  AlertCircle,
  CheckCircle,
  Circle,
  X,
  UserPlus,
  Trash2,
  Building2,
  Plus,
  Copy,
  ChevronDown,
} from 'lucide-react';
import { api } from '@/services/api';
import Avatar from '@/components/common/Avatar';

interface OrgAdminDashboardProps {
  onBack: () => void;
}

type TabType = 'overview' | 'members' | 'messages' | 'tasks' | 'reports';

interface OrgSummary {
  id: string;
  name: string;
  slug: string;
  avatarUrl?: string | null;
  description?: string | null;
  _count?: { members: number };
}

const extractError = (err: any): string => {
  return (
    err?.response?.data?.error ||
    err?.response?.data?.message ||
    err?.message ||
    'Something went wrong'
  );
};

export default function OrgAdminDashboard({ onBack }: OrgAdminDashboardProps) {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [membersData, setMembersData] = useState<any>(null);
  const [selectedMember, setSelectedMember] = useState<any>(null);
  const [memberActivityData, setMemberActivityData] = useState<any>(null);
  const [messagesData, setMessagesData] = useState<any>(null);
  const [tasksData, setTasksData] = useState<any>(null);
  const [reportsData, setReportsData] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showFullContent, setShowFullContent] = useState(false);
  const [page, setPage] = useState(1);
  const [reportDate, setReportDate] = useState(new Date().toISOString().split('T')[0]);
  const [memberFilter] = useState<string>('');

  // --- Multi-org support ---------------------------------------------------
  const [organizations, setOrganizations] = useState<OrgSummary[]>([]);
  const [currentOrgId, setCurrentOrgId] = useState<string | null>(null);
  const [orgMenuOpen, setOrgMenuOpen] = useState(false);

  // --- Add Member modal ----------------------------------------------------
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [addMemberEmail, setAddMemberEmail] = useState('');
  const [addMemberDisplayName, setAddMemberDisplayName] = useState('');
  const [addMemberRole, setAddMemberRole] = useState<'OWNER' | 'ADMIN' | 'MEMBER'>('MEMBER');
  const [addMemberLoading, setAddMemberLoading] = useState(false);
  const [addMemberError, setAddMemberError] = useState<string | null>(null);
  const [addMemberSuccess, setAddMemberSuccess] = useState<{
    email: string;
    tempPassword?: string;
  } | null>(null);

  // --- Create Organization modal ------------------------------------------
  const [createOrgOpen, setCreateOrgOpen] = useState(false);
  const [createOrgName, setCreateOrgName] = useState('');
  const [createOrgDescription, setCreateOrgDescription] = useState('');
  const [createOrgLoading, setCreateOrgLoading] = useState(false);
  const [createOrgError, setCreateOrgError] = useState<string | null>(null);

  const currentOrg = useMemo(
    () => organizations.find((o) => o.id === currentOrgId) || null,
    [organizations, currentOrgId]
  );

  // Load organizations on mount, then dashboard
  useEffect(() => {
    loadOrganizations();
  }, []);

  // When current org changes, reload everything
  useEffect(() => {
    if (currentOrgId) {
      loadDashboard();
      // If a tab other than overview is active, refresh that too
      if (activeTab === 'members') loadMembers(1);
      if (activeTab === 'messages') loadMessages();
      if (activeTab === 'tasks') loadTasks();
      if (activeTab === 'reports') loadReports();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOrgId]);

  const loadOrganizations = async () => {
    try {
      const res = await api.listOrgAdminOrganizations();
      const orgs = (res?.organizations || []) as OrgSummary[];
      setOrganizations(orgs);
      if (orgs.length > 0) {
        setCurrentOrgId((prev) => prev || orgs[0].id);
      } else {
        // No orgs: still stop loading, but surface an actionable error
        setIsLoading(false);
        setLoadError('No organization is available yet. Create one to get started.');
      }
    } catch (err) {
      console.error('Load organizations failed:', err);
      setIsLoading(false);
      setLoadError(extractError(err));
    }
  };

  const loadDashboard = async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const data = await api.getOrgAdminDashboard(currentOrgId || undefined);
      setDashboardData(data);
    } catch (err) {
      console.error('Dashboard load failed:', err);
      setLoadError(extractError(err));
    } finally {
      setIsLoading(false);
    }
  };

  const loadMembers = async (pageNum: number = 1) => {
    try {
      const data = await api.getOrgAdminMembers(
        searchQuery || undefined,
        pageNum,
        20,
        currentOrgId || undefined
      );
      setMembersData(data);
      setPage(pageNum);
    } catch (err) {
      console.error('Load members failed:', err);
      setLoadError(extractError(err));
    }
  };

  const loadMemberActivity = async (userId: string) => {
    try {
      const data = await api.getOrgAdminMemberActivity(userId, currentOrgId || undefined);
      setMemberActivityData(data);
      setSelectedMember(userId);
    } catch (err) {
      console.error('Load member activity failed:', err);
    }
  };

  const loadMessages = async () => {
    try {
      const data = await api.getOrgAdminMessages(
        page,
        memberFilter || undefined,
        searchQuery || undefined,
        20,
        currentOrgId || undefined
      );
      setMessagesData(data);
    } catch (err) {
      console.error('Load messages failed:', err);
    }
  };

  const loadTasks = async () => {
    try {
      const data = await api.getOrgAdminTaskReport(currentOrgId || undefined);
      setTasksData(data);
    } catch (err) {
      console.error('Load tasks failed:', err);
    }
  };

  const loadReports = async () => {
    try {
      const data = await api.getOrgAdminDailyReport(reportDate, currentOrgId || undefined);
      setReportsData(data);
    } catch (err) {
      console.error('Load reports failed:', err);
    }
  };

  // --- Mutations -----------------------------------------------------------
  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddMemberError(null);
    setAddMemberSuccess(null);
    if (!addMemberEmail.trim() || !addMemberEmail.includes('@')) {
      setAddMemberError('Please enter a valid email address');
      return;
    }
    setAddMemberLoading(true);
    try {
      const result = await api.addOrgAdminMember(
        {
          email: addMemberEmail.trim(),
          displayName: addMemberDisplayName.trim() || undefined,
          role: addMemberRole,
        },
        currentOrgId || undefined
      );
      setAddMemberSuccess({
        email: result?.member?.email || addMemberEmail,
        tempPassword: result?.temporaryPassword,
      });
      // Reset the form fields but keep the success panel visible
      setAddMemberEmail('');
      setAddMemberDisplayName('');
      setAddMemberRole('MEMBER');
      // Refresh list + dashboard counters
      await Promise.all([loadMembers(1), loadDashboard()]);
    } catch (err) {
      setAddMemberError(extractError(err));
    } finally {
      setAddMemberLoading(false);
    }
  };

  const handleRemoveMember = async (userId: string, displayName: string) => {
    if (!confirm(`Remove ${displayName} from this organization?`)) return;
    try {
      await api.removeOrgAdminMember(userId, currentOrgId || undefined);
      await Promise.all([loadMembers(page), loadDashboard()]);
    } catch (err) {
      alert(extractError(err));
    }
  };

  const handleChangeRole = async (userId: string, newRole: 'OWNER' | 'ADMIN' | 'MEMBER') => {
    try {
      await api.updateOrgAdminMemberRole(userId, newRole, currentOrgId || undefined);
      await loadMembers(page);
    } catch (err) {
      alert(extractError(err));
    }
  };

  const handleCreateOrganization = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateOrgError(null);
    if (!createOrgName.trim()) {
      setCreateOrgError('Organization name is required');
      return;
    }
    setCreateOrgLoading(true);
    try {
      const res = await api.createOrgAdminOrganization({
        name: createOrgName.trim(),
        description: createOrgDescription.trim() || undefined,
      });
      const newOrg = res?.organization as OrgSummary;
      // Refresh org list and switch to the new one
      await loadOrganizations();
      if (newOrg?.id) setCurrentOrgId(newOrg.id);
      setCreateOrgName('');
      setCreateOrgDescription('');
      setCreateOrgOpen(false);
    } catch (err) {
      setCreateOrgError(extractError(err));
    } finally {
      setCreateOrgLoading(false);
    }
  };

  const closeAddMemberModal = () => {
    setAddMemberOpen(false);
    setAddMemberError(null);
    setAddMemberSuccess(null);
    setAddMemberEmail('');
    setAddMemberDisplayName('');
    setAddMemberRole('MEMBER');
  };

  // Tab-specific loaders
  useEffect(() => {
    if (!currentOrgId) return;
    if (activeTab === 'members') {
      loadMembers();
    } else if (activeTab === 'messages') {
      loadMessages();
    } else if (activeTab === 'tasks') {
      loadTasks();
    } else if (activeTab === 'reports') {
      loadReports();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, currentOrgId]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full bg-slate-50 dark:bg-slate-900">
        <div className="text-center">
          <div className="animate-spin w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-3" />
          <p className="text-sm text-slate-500 dark:text-slate-400">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  // If we couldn't load the dashboard at all (no org / permission issue), show an empty state
  if (loadError && !dashboardData) {
    return (
      <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-900">
        <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-4 py-4 flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition"
          >
            <ArrowLeft size={20} className="text-slate-600 dark:text-slate-300" />
          </button>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">
            Organization Dashboard
          </h1>
        </div>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white dark:bg-slate-800 rounded-xl p-8 border border-slate-200 dark:border-slate-700 text-center">
            <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <AlertCircle className="w-7 h-7 text-amber-600 dark:text-amber-400" />
            </div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
              Couldn't load the dashboard
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">{loadError}</p>
            <div className="flex items-center justify-center gap-2 flex-wrap">
              <button
                onClick={() => {
                  setLoadError(null);
                  loadOrganizations();
                }}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-600 transition flex items-center gap-2"
              >
                <RefreshCw size={16} /> Retry
              </button>
              <button
                onClick={() => setCreateOrgOpen(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition flex items-center gap-2"
              >
                <Plus size={16} /> Create organization
              </button>
            </div>
          </div>
        </div>

        {createOrgOpen && (
          <CreateOrgModal
            name={createOrgName}
            setName={setCreateOrgName}
            description={createOrgDescription}
            setDescription={setCreateOrgDescription}
            loading={createOrgLoading}
            error={createOrgError}
            onClose={() => {
              setCreateOrgOpen(false);
              setCreateOrgError(null);
            }}
            onSubmit={handleCreateOrganization}
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-900 overflow-y-auto">
      {/* Header */}
      <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-4 py-4 sticky top-0 z-10 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onBack}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition"
          >
            <ArrowLeft size={20} className="text-slate-600 dark:text-slate-300" />
          </button>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white truncate">
            Organization Dashboard
          </h1>
        </div>

        <div className="flex items-center gap-2">
          {/* Org switcher */}
          {organizations.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setOrgMenuOpen((v) => !v)}
                className="flex items-center gap-2 px-3 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg text-sm text-slate-700 dark:text-slate-200 font-medium transition"
              >
                <Building2 size={16} />
                <span className="max-w-[160px] truncate">
                  {currentOrg?.name || 'Select organization'}
                </span>
                <ChevronDown size={14} />
              </button>
              {orgMenuOpen && (
                <div className="absolute right-0 top-full mt-2 w-72 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg z-50 py-2 max-h-80 overflow-y-auto">
                  {organizations.map((org) => (
                    <button
                      key={org.id}
                      onClick={() => {
                        setCurrentOrgId(org.id);
                        setOrgMenuOpen(false);
                      }}
                      className={`w-full text-left px-4 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition ${
                        org.id === currentOrgId
                          ? 'text-blue-600 dark:text-blue-400 font-semibold bg-blue-50/60 dark:bg-blue-900/20'
                          : 'text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <div className="truncate">{org.name}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        {org._count?.members ?? 0} members · {org.slug}
                      </div>
                    </button>
                  ))}
                  <div className="border-t border-slate-200 dark:border-slate-700 mt-2 pt-2 px-2">
                    <button
                      onClick={() => {
                        setOrgMenuOpen(false);
                        setCreateOrgOpen(true);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition"
                    >
                      <Plus size={14} /> Create new organization
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <button
            onClick={() => {
              loadDashboard();
              if (activeTab === 'members') loadMembers(page);
              if (activeTab === 'messages') loadMessages();
              if (activeTab === 'tasks') loadTasks();
              if (activeTab === 'reports') loadReports();
            }}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition"
            title="Refresh"
          >
            <RefreshCw size={18} className="text-slate-500 dark:text-slate-400" />
          </button>
        </div>
      </div>

      {/* Inline non-fatal error banner */}
      {loadError && dashboardData && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800 px-4 py-2 text-sm text-amber-700 dark:text-amber-300 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertCircle size={14} />
            <span className="truncate">{loadError}</span>
          </div>
          <button onClick={() => setLoadError(null)} className="shrink-0 p-1 hover:bg-amber-100 dark:hover:bg-amber-800/40 rounded">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-4 sticky top-16 z-10">
        <div className="flex gap-1">
          {[
            { id: 'overview' as TabType, label: 'Overview' },
            { id: 'members' as TabType, label: 'Members' },
            { id: 'messages' as TabType, label: 'Messages' },
            { id: 'tasks' as TabType, label: 'Tasks' },
            { id: 'reports' as TabType, label: 'Reports' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 p-4 md:p-6 overflow-y-auto">
        {/* Overview Tab */}
        {activeTab === 'overview' && dashboardData && (
          <div className="space-y-6">
            {/* Stat Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                {
                  label: 'Total Members',
                  value: dashboardData.totalMembers,
                  icon: Users,
                  color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
                },
                {
                  label: 'Active Today',
                  value: dashboardData.activeToday,
                  icon: Activity,
                  color: 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400',
                },
                {
                  label: 'Messages Today',
                  value: dashboardData.totalMessages,
                  icon: MessageSquare,
                  color: 'bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400',
                },
                {
                  label: 'Open Tasks',
                  value: dashboardData.totalTasks,
                  icon: Briefcase,
                  color: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400',
                },
              ].map((card) => (
                <div
                  key={card.label}
                  className="bg-white dark:bg-slate-800 rounded-xl p-5 border border-slate-200 dark:border-slate-700 hover:shadow-md transition"
                >
                  <div className={`p-2 rounded-lg ${card.color} w-fit mb-3`}>
                    <card.icon size={20} />
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mb-1">
                    {card.label}
                  </p>
                  <p className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white">
                    {card.value.toLocaleString()}
                  </p>
                </div>
              ))}
            </div>

            {/* Messages Per Day Chart */}
            {dashboardData.messagesPerDay && (
              <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-slate-700">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
                  Messages Per Day (Last 7 Days)
                </h2>
                <div className="flex items-end gap-2 h-48">
                  {dashboardData.messagesPerDay.map((item: any) => {
                    const maxCount = Math.max(...dashboardData.messagesPerDay.map((d: any) => d.count));
                    const height = maxCount > 0 ? (item.count / maxCount) * 100 : 0;
                    const date = new Date(item.date);
                    const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });

                    return (
                      <div key={item.date} className="flex-1 flex flex-col items-center gap-2">
                        <div
                          className="w-full bg-blue-500 rounded-t-lg transition hover:bg-blue-600"
                          style={{ height: `${height || 20}px`, minHeight: '20px' }}
                          title={`${item.count} messages`}
                        />
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {dayName}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Most Active Members */}
            {dashboardData.mostActiveMembers && (
              <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-slate-700">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
                  Most Active Members
                </h2>
                <div className="space-y-3">
                  {dashboardData.mostActiveMembers.map((member: any, idx: number) => (
                    <div key={member.userId} className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-slate-400 w-6 text-right">
                        #{idx + 1}
                      </span>
                      <Avatar name={member.name} src={member.avatarUrl} size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                          {member.name}
                        </p>
                      </div>
                      <p className="text-sm font-semibold text-blue-600 dark:text-blue-400 flex-shrink-0">
                        {member.messageCount} messages
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Active Conversations */}
            {dashboardData.activeConversations && (
              <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-slate-700">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
                  Active Conversations
                </h2>
                <div className="space-y-3">
                  {dashboardData.activeConversations.slice(0, 5).map((conv: any) => (
                    <div
                      key={conv.id}
                      className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-700 rounded-lg"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                          {conv.name || 'Unnamed Conversation'}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Type: {conv.type}
                        </p>
                      </div>
                      <p className="text-sm font-semibold text-slate-600 dark:text-slate-400 flex-shrink-0">
                        {conv._count.messages} messages
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Members Tab */}
        {activeTab === 'members' && (
          <div className="space-y-4">
            {/* Search Bar + Add Member button */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative flex-1 min-w-64">
                <Search
                  size={18}
                  className="absolute left-3 top-2.5 text-slate-400 dark:text-slate-500"
                />
                <input
                  type="text"
                  placeholder="Search members..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setPage(1);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') loadMembers(1);
                  }}
                  className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button
                onClick={() => setAddMemberOpen(true)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold flex items-center gap-2 transition"
              >
                <UserPlus size={16} /> Add Member
              </button>
            </div>

            {/* Members List */}
            {membersData && (
              <>
                <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-slate-50 dark:bg-slate-700 border-b border-slate-200 dark:border-slate-600">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300">
                            Name
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300">
                            Email
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300">
                            Role
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300">
                            Status
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 dark:text-slate-300">
                            Messages
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 dark:text-slate-300">
                            Tasks
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300">
                            Action
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                        {membersData.members.map((member: any) => (
                          <tr
                            key={member.id}
                            className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition"
                          >
                            <td className="px-4 py-3 text-sm">
                              <div className="flex items-center gap-2">
                                <Avatar name={member.displayName} src={member.avatarUrl} size="sm" />
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                                    {member.displayName}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400 truncate">
                              {member.email}
                            </td>
                            <td className="px-4 py-3 text-sm">
                              <span
                                className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                                  member.role === 'OWNER'
                                    ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                                    : member.role === 'ADMIN'
                                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                                    : 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-400'
                                }`}
                              >
                                {member.role}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm">
                              <span
                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                                  member.isOnline
                                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                    : 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-400'
                                }`}
                              >
                                <div
                                  className={`w-2 h-2 rounded-full ${
                                    member.isOnline ? 'bg-green-500' : 'bg-slate-400'
                                  }`}
                                />
                                {member.isOnline ? 'Online' : 'Offline'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-right text-slate-600 dark:text-slate-400 font-medium">
                              {member.messagesToday}
                            </td>
                            <td className="px-4 py-3 text-sm text-right text-slate-600 dark:text-slate-400 font-medium">
                              {member.taskCount}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2 flex-wrap">
                                <button
                                  onClick={() => loadMemberActivity(member.id)}
                                  className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
                                >
                                  View
                                </button>
                                <select
                                  value={member.role}
                                  onChange={(e) =>
                                    handleChangeRole(
                                      member.id,
                                      e.target.value as 'OWNER' | 'ADMIN' | 'MEMBER'
                                    )
                                  }
                                  className="text-xs bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded px-1 py-1 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                  title="Change role"
                                >
                                  <option value="OWNER">OWNER</option>
                                  <option value="ADMIN">ADMIN</option>
                                  <option value="MEMBER">MEMBER</option>
                                </select>
                                <button
                                  onClick={() =>
                                    handleRemoveMember(member.id, member.displayName)
                                  }
                                  className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 hover:text-red-600 transition"
                                  title="Remove from organization"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Pagination */}
                {membersData.totalPages > 1 && (
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => loadMembers(page - 1)}
                      disabled={page === 1}
                      className="px-3 py-1.5 text-sm rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
                    >
                      Previous
                    </button>
                    <span className="text-sm text-slate-600 dark:text-slate-400">
                      Page {page} of {membersData.totalPages}
                    </span>
                    <button
                      onClick={() => loadMembers(page + 1)}
                      disabled={page === membersData.totalPages}
                      className="px-3 py-1.5 text-sm rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
                    >
                      Next
                    </button>
                  </div>
                )}

                {/* Member Activity Detail Panel */}
                {selectedMember && memberActivityData && (
                  <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-slate-700">
                    <div className="flex items-center justify-between mb-6">
                      <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                        Member Activity Details
                      </h3>
                      <button
                        onClick={() => setSelectedMember(null)}
                        className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition"
                      >
                        <X size={18} className="text-slate-500" />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Conversations */}
                      <div>
                        <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
                          Conversations ({memberActivityData.conversations.length})
                        </h4>
                        <div className="space-y-2">
                          {memberActivityData.conversations.slice(0, 5).map((conv: any) => (
                            <div
                              key={conv.id}
                              className="p-2 bg-slate-50 dark:bg-slate-700 rounded text-xs"
                            >
                              <p className="font-medium text-slate-900 dark:text-white truncate">
                                {conv.name}
                              </p>
                              <p className="text-slate-500 dark:text-slate-400">
                                {conv.messageCount} messages
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Tasks */}
                      <div>
                        <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
                          Assigned Tasks ({memberActivityData.tasks.length})
                        </h4>
                        <div className="space-y-2">
                          {memberActivityData.tasks.slice(0, 5).map((task: any) => (
                            <div
                              key={task.id}
                              className="p-2 bg-slate-50 dark:bg-slate-700 rounded text-xs"
                            >
                              <p className="font-medium text-slate-900 dark:text-white truncate">
                                {task.title}
                              </p>
                              <p className="text-slate-500 dark:text-slate-400">
                                Status: {task.status}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Messages Tab */}
        {activeTab === 'messages' && (
          <div className="space-y-4">
            {/* Filters */}
            <div className="flex gap-4 items-center flex-wrap">
              <div className="flex-1 min-w-64">
                <div className="relative">
                  <Search
                    size={18}
                    className="absolute left-3 top-2.5 text-slate-400 dark:text-slate-500"
                  />
                  <input
                    type="text"
                    placeholder="Search messages..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <button
                onClick={() => setShowFullContent(!showFullContent)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                  showFullContent
                    ? 'bg-blue-500 text-white'
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                }`}
              >
                {showFullContent ? 'Full Content: On' : 'Metadata Only'}
              </button>
            </div>

            {/* Messages List */}
            {messagesData && (
              <>
                <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 dark:bg-slate-700 border-b border-slate-200 dark:border-slate-600">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300">
                            Sender
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300">
                            Conversation
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300">
                            {showFullContent ? 'Message' : 'Char Count'}
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300">
                            Time
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                        {messagesData.messages.map((msg: any) => (
                          <tr
                            key={msg.id}
                            className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition"
                          >
                            <td className="px-4 py-3 text-sm font-medium text-slate-900 dark:text-white">
                              {msg.senderName}
                            </td>
                            <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
                              {msg.conversationName}
                            </td>
                            <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400 max-w-xs truncate">
                              {showFullContent ? msg.content : `${msg.characterCount} chars`}
                            </td>
                            <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400 whitespace-nowrap">
                              {new Date(msg.timestamp).toLocaleTimeString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Pagination */}
                {messagesData.totalPages > 1 && (
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => {
                        setPage(page - 1);
                        loadMessages();
                      }}
                      disabled={page === 1}
                      className="px-3 py-1.5 text-sm rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
                    >
                      Previous
                    </button>
                    <span className="text-sm text-slate-600 dark:text-slate-400">
                      Page {page} of {messagesData.totalPages}
                    </span>
                    <button
                      onClick={() => {
                        setPage(page + 1);
                        loadMessages();
                      }}
                      disabled={page === messagesData.totalPages}
                      className="px-3 py-1.5 text-sm rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
                    >
                      Next
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Tasks Tab */}
        {activeTab === 'tasks' && tasksData && (
          <div className="space-y-6">
            {/* Status Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { status: 'NOT_STARTED', label: 'Not Started', icon: Circle, color: 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400' },
                { status: 'IN_PROGRESS', label: 'In Progress', icon: Activity, color: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400' },
                { status: 'COMPLETED', label: 'Completed', icon: CheckCircle, color: 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400' },
                { status: 'BLOCKED', label: 'Blocked', icon: AlertCircle, color: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' },
              ].map((item) => (
                <div
                  key={item.status}
                  className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700"
                >
                  <div className={`p-2 rounded-lg ${item.color} w-fit mb-2`}>
                    <item.icon size={18} />
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">{item.label}</p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">
                    {tasksData.statusCounts[item.status] || 0}
                  </p>
                </div>
              ))}
            </div>

            {/* Tasks Table */}
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-700 border-b border-slate-200 dark:border-slate-600">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300">
                        Title
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300">
                        Assignee
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300">
                        Status
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300">
                        Priority
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300">
                        Due Date
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                    {tasksData.tasks.slice(0, 20).map((task: any) => (
                      <tr
                        key={task.id}
                        className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition"
                      >
                        <td className="px-4 py-3 font-medium text-slate-900 dark:text-white max-w-xs truncate">
                          {task.title}
                        </td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                          {task.assignee}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                              task.status === 'COMPLETED'
                                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                : task.status === 'IN_PROGRESS'
                                ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                                : task.status === 'BLOCKED'
                                ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                : 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-400'
                            }`}
                          >
                            {task.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                              task.priority === 'HIGH'
                                ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                : task.priority === 'MEDIUM'
                                ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                                : 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-400'
                            }`}
                          >
                            {task.priority}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                          {task.dueDate
                            ? new Date(task.dueDate).toLocaleDateString()
                            : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Reports Tab */}
        {activeTab === 'reports' && (
          <div className="space-y-6">
            {/* Date Picker */}
            <div className="flex items-center gap-4">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Report Date:
              </label>
              <input
                type="date"
                value={reportDate}
                onChange={(e) => {
                  setReportDate(e.target.value);
                }}
                className="px-4 py-2 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={loadReports}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 transition"
              >
                Load Report
              </button>
              <button className="px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-600 transition flex items-center gap-2">
                <Download size={16} />
                Export
              </button>
            </div>

            {/* Report Table */}
            {reportsData && (
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-700 border-b border-slate-200 dark:border-slate-600">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300">
                          Name
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 dark:text-slate-300">
                          Messages Sent
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 dark:text-slate-300">
                          Time Online (min)
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 dark:text-slate-300">
                          Tasks Completed
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                      {reportsData.report.map((item: any) => (
                        <tr
                          key={item.userId}
                          className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition"
                        >
                          <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">
                            {item.name}
                          </td>
                          <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-400">
                            {item.messagesSent}
                          </td>
                          <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-400">
                            {item.timeOnline}
                          </td>
                          <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-400">
                            {item.tasksCompleted}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add Member Modal */}
      {addMemberOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <UserPlus size={18} /> Add Member
              </h3>
              <button
                onClick={closeAddMemberModal}
                className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500"
              >
                <X size={18} />
              </button>
            </div>

            {addMemberSuccess ? (
              <div className="p-6 space-y-4">
                <div className="flex items-start gap-3 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                  <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
                  <div className="text-sm text-green-800 dark:text-green-300">
                    <p className="font-semibold mb-1">Member added successfully</p>
                    <p>{addMemberSuccess.email} is now part of this organization.</p>
                  </div>
                </div>
                {addMemberSuccess.tempPassword && (
                  <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                    <p className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-2">
                      Temporary password
                    </p>
                    <p className="text-xs text-amber-700 dark:text-amber-400 mb-2">
                      Share this password with the new member. They can change it after logging in.
                      This is the only time it will be shown.
                    </p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 px-3 py-2 bg-white dark:bg-slate-900 rounded border border-amber-300 dark:border-amber-700 text-sm font-mono text-slate-900 dark:text-white break-all">
                        {addMemberSuccess.tempPassword}
                      </code>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(addMemberSuccess.tempPassword || '');
                        }}
                        className="p-2 rounded bg-amber-100 dark:bg-amber-800/40 text-amber-800 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-800/60 transition"
                        title="Copy password"
                      >
                        <Copy size={14} />
                      </button>
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setAddMemberSuccess(null)}
                    className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold transition"
                  >
                    Add another
                  </button>
                  <button
                    onClick={closeAddMemberModal}
                    className="flex-1 px-4 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg text-sm font-semibold transition"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleAddMember} className="p-6 space-y-4">
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Adds an existing user to <strong>{currentOrg?.name || 'this organization'}</strong>,
                  or creates a brand new account if the email isn't registered yet.
                </p>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Email address <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    value={addMemberEmail}
                    onChange={(e) => setAddMemberEmail(e.target.value)}
                    placeholder="person@company.com"
                    required
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Display name <span className="text-slate-400">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={addMemberDisplayName}
                    onChange={(e) => setAddMemberDisplayName(e.target.value)}
                    placeholder="Jane Doe"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Role
                  </label>
                  <select
                    value={addMemberRole}
                    onChange={(e) => setAddMemberRole(e.target.value as 'OWNER' | 'ADMIN' | 'MEMBER')}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="MEMBER">Member — basic access</option>
                    <option value="ADMIN">Admin — can manage members</option>
                    <option value="OWNER">Owner — full control</option>
                  </select>
                </div>

                {addMemberError && (
                  <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-300">
                    {addMemberError}
                  </div>
                )}

                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={closeAddMemberModal}
                    className="flex-1 px-4 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg text-sm font-semibold transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={addMemberLoading}
                    className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-lg text-sm font-semibold transition"
                  >
                    {addMemberLoading ? 'Adding...' : 'Add member'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Create Organization Modal */}
      {createOrgOpen && (
        <CreateOrgModal
          name={createOrgName}
          setName={setCreateOrgName}
          description={createOrgDescription}
          setDescription={setCreateOrgDescription}
          loading={createOrgLoading}
          error={createOrgError}
          onClose={() => {
            setCreateOrgOpen(false);
            setCreateOrgError(null);
          }}
          onSubmit={handleCreateOrganization}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create Organization Modal (extracted so it can be rendered from the
// main dashboard and from the "no org" fallback screen)
// ---------------------------------------------------------------------------
interface CreateOrgModalProps {
  name: string;
  setName: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
}

function CreateOrgModal({
  name,
  setName,
  description,
  setDescription,
  loading,
  error,
  onClose,
  onSubmit,
}: CreateOrgModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <Building2 size={18} /> Create Organization
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500"
          >
            <X size={18} />
          </button>
        </div>
        <form onSubmit={onSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Acme Corp"
              required
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Description <span className="text-slate-400">(optional)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Internal communication for Acme Corp."
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-300">
              {error}
            </div>
          )}
          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg text-sm font-semibold transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-lg text-sm font-semibold transition"
            >
              {loading ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
