import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Search, Settings, Plus, Bell, ClipboardList, LayoutDashboard, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useChatStore } from '@/store/chatStore';
import { useAuthStore } from '@/store/authStore';
import { usePresenceStore } from '@/store/presenceStore';
import { api, UserStatusGroup } from '@/services/api';
import Avatar from '@/components/common/Avatar';
import ConversationItem from '@/components/sidebar/ConversationItem';
import NewConversationModal from '@/components/sidebar/NewConversationModal';
import StoryViewerModal from '@/components/common/StoryViewerModal';

interface SidebarProps {
  isMobile?: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  onNavigateChat?: () => void;
  onSettingsClick?: () => void;
  onDashboardClick?: () => void;
  onClose?: () => void;
  onAnnouncementsClick?: () => void;
  onPlannerClick?: () => void;
  onInterPanelClick?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isMobile = false,
  collapsed = false,
  onToggleCollapse,
  onNavigateChat,
  onSettingsClick,
  onDashboardClick,
  onClose,
  onAnnouncementsClick,
  onPlannerClick,
  onInterPanelClick,
}) => {
  const navigate = useNavigate();
  const { conversationId } = useParams<{ conversationId?: string }>();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'dms' | 'tasks' | 'projects' | 'favorites'>('dms');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());

  // Story-related state
  const [hasActiveStory, setHasActiveStory] = useState(false);
  const [showStoryCreation, setShowStoryCreation] = useState(false);
  const [showStoryViewer, setShowStoryViewer] = useState(false);
  const [storyViewUserId, setStoryViewUserId] = useState<string | null>(null);
  const [contactStories, setContactStories] = useState<UserStatusGroup[]>([]);
  const [announcementCount, setAnnouncementCount] = useState(0);
  const [taskCount, setTaskCount] = useState(0);
  const [dashboardBlink, setDashboardBlink] = useState(false);

  const {
    conversations,
    fetchConversations,
    isLoadingConversations,
    typingIndicators,
    unreadCounts,
  } = useChatStore();
  const { user } = useAuthStore();

  // Check if user is an admin/owner (show dashboard button)
  const isOrgAdmin = user?.role === 'SUPER_ADMIN' || user?.orgRole === 'OWNER' || user?.orgRole === 'ADMIN';

  // Blink the dashboard button if the user hasn't dismissed it yet
  useEffect(() => {
    if (isOrgAdmin && user?.id) {
      const key = `omnilink_dashboard_seen_${user.id}`;
      if (!localStorage.getItem(key)) {
        setDashboardBlink(true);
      }
    }
  }, [isOrgAdmin, user?.id]);

  const handleDashboardClick = () => {
    // Mark as seen so it stops blinking
    if (user?.id) {
      localStorage.setItem(`omnilink_dashboard_seen_${user.id}`, '1');
    }
    setDashboardBlink(false);
    if (onDashboardClick) onDashboardClick();
  };

  // Subscribe to presence store updates
  const presenceOnlineUsers = usePresenceStore((s) => s.onlineUsers);

  // Fetch conversations on mount
  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Track online status from presence store
  useEffect(() => {
    setOnlineUsers(new Set(presenceOnlineUsers));
  }, [presenceOnlineUsers]);

  // Reusable refresh functions for counts
  const refreshCounts = async () => {
    try {
      const result = await api.getUnnotedAnnouncementCount();
      setAnnouncementCount(result?.count || 0);
    } catch (_e) {
      // Fallback: count un-noted from full list
      try {
        const annResult = await api.getAnnouncements();
        const announcements = annResult?.announcements || [];
        const unnoted = announcements.filter((a: any) => !a.noted);
        setAnnouncementCount(unnoted.length);
      } catch (_e2) { /* ignore */ }
    }

    try {
      const tasks = await api.getTasks();
      const uid = user?.id;
      const incompleteTasks = tasks?.filter((task: any) => {
        if (task.status === 'COMPLETED' || task.deleted || task.archived) return false;
        // Primary assignee
        if (task.assignedToId === uid) return true;
        // Creator
        if (task.createdById === uid) return true;
        // Co-assignee
        if (Array.isArray(task.coAssigneeIds) && task.coAssigneeIds.includes(uid)) return true;
        // Checklist item assignee
        if (Array.isArray(task.checklists)) {
          for (const cl of task.checklists) {
            if (Array.isArray(cl.items)) {
              for (const item of cl.items) {
                if (Array.isArray(item.assigneeIds) && item.assigneeIds.includes(uid)) return true;
              }
            }
          }
        }
        return false;
      }) || [];
      setTaskCount(incompleteTasks.length);
    } catch (_e) { /* ignore */ }
  };

  // Load my statuses, announcements, and tasks on mount + poll counts every 15s
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const result = await api.getMyStatuses();
        const statuses = result?.statuses || [];
        setHasActiveStory(statuses.length > 0);
      } catch (error) {
        console.error('[Sidebar] Error loading statuses:', error);
      }

      // Load contact stories
      try {
        const contactResult = await api.getContactStatuses();
        setContactStories(contactResult?.users || []);
      } catch (_e) { /* ignore */ }

      refreshCounts();
    };

    if (user?.id) {
      loadInitialData();

      // Poll task/announcement counts every 15 seconds and stories every 30s
      const interval = setInterval(refreshCounts, 15000);
      const storyInterval = setInterval(async () => {
        try {
          const r = await api.getContactStatuses();
          setContactStories(r?.users || []);
          const myR = await api.getMyStatuses();
          setHasActiveStory((myR?.statuses || []).length > 0);
        } catch (_e) { /* ignore */ }
      }, 30000);

      // Listen for instant badge refresh events from AnnouncementBoard / TaskWall
      const handleBadgeRefresh = () => refreshCounts();
      window.addEventListener('badges:refresh', handleBadgeRefresh);

      // Listen for conversation list refresh (e.g., after creating a task chat)
      const handleConversationsRefresh = () => fetchConversations();
      window.addEventListener('conversations:refresh', handleConversationsRefresh);

      return () => {
        clearInterval(interval);
        clearInterval(storyInterval);
        window.removeEventListener('badges:refresh', handleBadgeRefresh);
        window.removeEventListener('conversations:refresh', handleConversationsRefresh);
      };
    }
  }, [user?.id]);

  const handleSettingsClick = () => {
    if (onSettingsClick) {
      onSettingsClick();
    } else {
      navigate('/settings');
    }
  };

  const handleAvatarClick = () => {
    if (hasActiveStory) {
      setShowStoryViewer(true);
      setStoryViewUserId(user?.id || null);
    } else {
      handleSettingsClick();
    }
  };

  const handleAddStory = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowStoryCreation(true);
  };

  // Helper to determine conversation category
  const getConvCategory = (conv: any): 'dms' | 'tasks' | 'projects' | 'groups' => {
    if (conv.linkedTask) return 'tasks';
    if (conv.linkedProject) return 'projects';
    if (conv.type === 'DIRECT' || conv.participants.length <= 2) return 'dms';
    return 'groups';
  };

  // Sort conversations by most recent activity, then filter by search query
  const sortedConversations = [...conversations].sort((a, b) => {
    const aTime = a.lastMessage?.createdAt || a.updatedAt || a.createdAt;
    const bTime = b.lastMessage?.createdAt || b.updatedAt || b.createdAt;
    return new Date(bTime).getTime() - new Date(aTime).getTime();
  });

  // Category counts for tab badges
  const categoryCounts = sortedConversations.reduce((acc, conv: any) => {
    const cat = getConvCategory(conv);
    const unread = unreadCounts.get(conv.id) ?? conv.unreadCount ?? 0;
    if (unread > 0) acc[cat] = (acc[cat] || 0) + unread;
    if (conv.isFavorite) {
      const favUnread = unreadCounts.get(conv.id) ?? conv.unreadCount ?? 0;
      if (favUnread > 0) acc['favorites'] = (acc['favorites'] || 0) + favUnread;
    }
    return acc;
  }, {} as Record<string, number>);

  const filteredConversations = sortedConversations.filter((conv: any) => {
    // Apply tab filter
    if (activeTab === 'favorites') {
      if (!conv.isFavorite) return false;
    } else if (activeTab !== 'all' && getConvCategory(conv) !== activeTab) return false;

    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();

    // Search by conversation name or participant names
    const convName =
      conv.name ||
      conv.participants
        .filter((p: any) => p.id !== user?.id)
        .map((p: any) => p.displayName || p.username)
        .join(', ');

    return convName.toLowerCase().includes(query);
  });

  if (!user) {
    return null;
  }

  const isConversationActive = (convId: string) => {
    return convId === conversationId;
  };

  const handleNavigateChat = () => {
    if (onNavigateChat) {
      onNavigateChat();
    } else if (isMobile && onClose) {
      onClose();
    }
  };

  // ─── Collapsed Icon Rail (desktop only) ───
  if (collapsed && !isMobile) {
    return (
      <>
        <div className="relative bg-white dark:bg-surface-900 border-r border-gray-200 dark:border-surface-700 flex flex-col w-16 h-screen items-center py-3 gap-1 flex-shrink-0">
          {/* Expand button */}
          <button
            onClick={onToggleCollapse}
            className="p-2 hover:bg-gray-100 dark:hover:bg-surface-800 rounded-lg transition-colors mb-2"
            title="Expand sidebar"
          >
            <PanelLeftOpen className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          </button>

          {/* Avatar */}
          <button
            onClick={handleAvatarClick}
            className="relative mb-2"
            title={user?.displayName || user?.username || 'Profile'}
          >
            <Avatar src={user?.avatar || (user as any)?.avatarUrl} name={user?.displayName || user?.username || user?.email || 'User'} username={user?.username || user?.email || 'User'} size="md" />
            {hasActiveStory && (
              <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-amber-400 rounded-full border-2 border-white dark:border-surface-900" />
            )}
          </button>

          <div className="w-8 border-t border-gray-200 dark:border-surface-700 my-1" />

          {/* Dashboard (admin only) */}
          {isOrgAdmin && (
            <button
              onClick={handleDashboardClick}
              className={`p-2 hover:bg-gray-100 dark:hover:bg-surface-800 rounded-lg transition-colors relative ${dashboardBlink ? 'animate-pulse' : ''}`}
              title="Admin Dashboard"
            >
              <LayoutDashboard className={`w-5 h-5 ${dashboardBlink ? 'text-primary-600 dark:text-primary-400' : 'text-gray-500 dark:text-gray-400'}`} />
              {dashboardBlink && (
                <span className="absolute top-0.5 right-0.5 w-2 h-2 bg-primary-500 rounded-full" />
              )}
            </button>
          )}

          {/* Announcements */}
          <button
            onClick={() => onAnnouncementsClick?.()}
            className="p-2 hover:bg-gray-100 dark:hover:bg-surface-800 rounded-lg transition-colors relative"
            title="Announcements"
          >
            <Bell className="w-5 h-5 text-gray-500 dark:text-gray-400" />
            {announcementCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] flex items-center justify-center bg-red-500 text-white text-[9px] font-bold rounded-full px-1 leading-none shadow-sm border-2 border-white dark:border-surface-900">
                {announcementCount > 9 ? '9+' : announcementCount}
              </span>
            )}
          </button>

          {/* Planner (Tasks + Projects) */}
          <button
            onClick={() => onPlannerClick?.()}
            className="p-2 hover:bg-gray-100 dark:hover:bg-surface-800 rounded-lg transition-colors relative"
            title="Planner"
          >
            <ClipboardList className="w-5 h-5 text-gray-500 dark:text-gray-400" />
            {taskCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] flex items-center justify-center bg-red-500 text-white text-[9px] font-bold rounded-full px-1 leading-none shadow-sm border-2 border-white dark:border-surface-900">
                {taskCount > 9 ? '9+' : taskCount}
              </span>
            )}
          </button>

          {/* Search — opens full sidebar */}
          <button
            onClick={onToggleCollapse}
            className="p-2 hover:bg-gray-100 dark:hover:bg-surface-800 rounded-lg transition-colors"
            title="Search conversations"
          >
            <Search className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>

          {/* Spacer */}
          <div className="flex-1" />

          {/* + NEW */}
          <button
            onClick={() => setIsModalOpen(true)}
            className="p-2 bg-primary-600 dark:bg-primary-500 text-white rounded-lg hover:bg-primary-700 dark:hover:bg-primary-600 transition-colors shadow-md"
            title="New conversation"
          >
            <Plus className="w-5 h-5" />
          </button>

          {/* Settings */}
          <button
            onClick={handleSettingsClick}
            className="p-2 hover:bg-gray-100 dark:hover:bg-surface-800 rounded-lg transition-colors mt-1"
            title="Settings"
          >
            <Settings className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        {/* Modals still need to render */}
        {showStoryCreation && (
          <StoryCreationModal
            isOpen={showStoryCreation}
            onClose={() => setShowStoryCreation(false)}
            onStoryCreated={() => {
              setHasActiveStory(true);
              setShowStoryCreation(false);
              api.getContactStatuses().then(r => setContactStories(r?.users || [])).catch(() => {});
            }}
          />
        )}
        {showStoryViewer && storyViewUserId && (
          <StoryViewerModal
            isOpen={showStoryViewer}
            userId={storyViewUserId}
            onClose={() => {
              setShowStoryViewer(false);
              setStoryViewUserId(null);
              api.getContactStatuses().then(r => setContactStories(r?.users || [])).catch(() => {});
            }}
            onStoryDeleted={() => setHasActiveStory(false)}
          />
        )}
        <NewConversationModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onPanelsClick={() => onInterPanelClick?.()}
        />
      </>
    );
  }

  // ─── Full (expanded) sidebar ───
  return (
    <>
      <div className={`relative bg-white dark:bg-surface-900 border-r border-gray-200 dark:border-surface-700 flex flex-col ${isMobile ? 'w-full h-full' : 'w-80 h-screen'}`}>
        {/* Header */}
        <div className="p-4 border-b border-gray-200 dark:border-surface-700 flex-shrink-0">
          <div className={`flex items-center justify-between ${isMobile ? '' : 'mb-4'}`}>
            {isMobile ? (
              <></>
            ) : (
              <>
                <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                  OMNILINK
                </h1>
                <div className="flex items-center gap-1">
                  {isOrgAdmin && (
                    <button
                      onClick={handleDashboardClick}
                      className={`p-1.5 hover:bg-gray-100 dark:hover:bg-surface-800 rounded-lg transition-colors relative ${dashboardBlink ? 'animate-pulse' : ''}`}
                      title="Admin Dashboard"
                    >
                      <LayoutDashboard className={`w-4 h-4 ${dashboardBlink ? 'text-primary-600 dark:text-primary-400' : 'text-gray-600 dark:text-gray-400'}`} />
                      {dashboardBlink && (
                        <span className="absolute top-0.5 right-0.5 w-2 h-2 bg-primary-500 rounded-full animate-ping" />
                      )}
                      {dashboardBlink && (
                        <span className="absolute top-0.5 right-0.5 w-2 h-2 bg-primary-500 rounded-full" />
                      )}
                    </button>
                  )}
                  <button
                    onClick={() => {
                      if (onAnnouncementsClick) {
                        onAnnouncementsClick();
                      }
                    }}
                    className="p-1.5 hover:bg-gray-100 dark:hover:bg-surface-800 rounded-lg transition-colors relative"
                    title="Announcements"
                  >
                    <Bell className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                    {announcementCount > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] flex items-center justify-center bg-red-500 text-white text-[8px] font-bold rounded-full px-0.5 leading-none shadow-sm border border-white dark:border-surface-900">
                        {announcementCount > 9 ? '9+' : announcementCount}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => onPlannerClick?.()}
                    className="p-1.5 hover:bg-gray-100 dark:hover:bg-surface-800 rounded-lg transition-colors relative"
                    title="Planner"
                  >
                    <ClipboardList className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                    {taskCount > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] flex items-center justify-center bg-red-500 text-white text-[8px] font-bold rounded-full px-0.5 leading-none shadow-sm border border-white dark:border-surface-900">
                        {taskCount > 9 ? '9+' : taskCount}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={handleSettingsClick}
                    className="p-1.5 hover:bg-gray-100 dark:hover:bg-surface-800 rounded-lg transition-colors"
                    title="Settings"
                  >
                    <Settings className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                  </button>
                  {onToggleCollapse && (
                    <button
                      onClick={onToggleCollapse}
                      className="p-1.5 hover:bg-gray-100 dark:hover:bg-surface-800 rounded-lg transition-colors"
                      title="Collapse sidebar"
                    >
                      <PanelLeftClose className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                    </button>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Mobile: Profile row matching web view — avatar + name/email + icons */}
          {isMobile ? (
            <div className="flex items-center gap-3 py-1 px-2">
              {/* Owner avatar — perfect circle with story indicator + add badge */}
              <div className="relative flex-shrink-0 cursor-pointer" onClick={(e) => { e.stopPropagation(); handleAvatarClick(); }}>
                <div className="relative w-[62px] h-[62px] flex items-center justify-center">
                  {/* Spinning dashed story ring — only when story is active */}
                  {hasActiveStory && (
                    <svg
                      className="absolute inset-0 w-[62px] h-[62px] animate-spin pointer-events-none"
                      style={{ animationDuration: '12s' }}
                      viewBox="0 0 62 62"
                    >
                      <circle
                        cx="31"
                        cy="31"
                        r="29"
                        fill="none"
                        stroke="#f59e0b"
                        strokeWidth="3"
                        strokeDasharray="6 4"
                        strokeLinecap="round"
                      />
                    </svg>
                  )}
                  <div className="w-[54px] h-[54px] rounded-full overflow-hidden flex items-center justify-center" style={{aspectRatio: '1 / 1'}}>
                    {(user.avatar || (user as any).avatarUrl) ? (
                      <img src={user.avatar || (user as any).avatarUrl} alt={user.displayName || 'User'} className="w-full h-full object-cover rounded-full" />
                    ) : (
                      <div className="w-full h-full rounded-full bg-blue-500 flex items-center justify-center">
                        <span className="text-white font-semibold text-lg leading-none">{(user.displayName || user.username || user.email || 'U').charAt(0).toUpperCase()}</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="absolute -bottom-0.5 -right-0.5 w-[25px] h-[25px] bg-primary-500 rounded-full border-[2px] border-white dark:border-surface-900 flex items-center justify-center cursor-pointer z-10" onClick={(e) => { e.stopPropagation(); handleAddStory(e); }}>
                  <Plus className="w-3.5 h-3.5 text-white" />
                </div>
              </div>

              {/* Owner name + email — matches web view */}
              <div className="flex-1 text-left min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                  {user.displayName || user.username || user.email?.split('@')[0] || 'User'}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  {user.email || ''}
                </p>
              </div>

              {/* Action icons — top-aligned with small margin, 15% smaller */}
              <div className="flex items-center gap-0.5 flex-shrink-0 mt-1">
                {isOrgAdmin && (
                  <button
                    onClick={handleDashboardClick}
                    className={`p-1.5 hover:bg-gray-100 dark:hover:bg-surface-800 rounded-lg transition-colors relative ${dashboardBlink ? 'animate-pulse' : ''}`}
                    title="Admin Dashboard"
                  >
                    <LayoutDashboard className={`w-[17px] h-[17px] ${dashboardBlink ? 'text-primary-600 dark:text-primary-400' : 'text-gray-600 dark:text-gray-400'}`} />
                    {dashboardBlink && (
                      <span className="absolute top-0.5 right-0.5 w-2 h-2 bg-primary-500 rounded-full animate-ping" />
                    )}
                    {dashboardBlink && (
                      <span className="absolute top-0.5 right-0.5 w-2 h-2 bg-primary-500 rounded-full" />
                    )}
                  </button>
                )}
                <button
                  onClick={() => { if (onAnnouncementsClick) onAnnouncementsClick(); }}
                  className="p-1.5 hover:bg-gray-100 dark:hover:bg-surface-800 rounded-lg transition-colors relative"
                  title="Announcements"
                >
                  <Bell className="w-[17px] h-[17px] text-gray-600 dark:text-gray-400" />
                  {announcementCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] flex items-center justify-center bg-red-500 text-white text-[8px] font-bold rounded-full px-0.5 leading-none shadow-sm border border-white dark:border-surface-900">
                      {announcementCount > 9 ? '9+' : announcementCount}
                    </span>
                  )}
                </button>
              </div>
            </div>
          ) : (
            <div
              onClick={handleAvatarClick}
              className="w-full flex items-center gap-3 p-2 rounded-lg transition-colors group cursor-pointer hover:bg-gray-100 dark:hover:bg-surface-800"
            >
              <div className="relative flex-shrink-0 w-[58px] h-[58px] flex items-center justify-center">
                {/* Story dashed ring - SVG for guaranteed visibility */}
                {hasActiveStory && (
                  <svg
                    className="absolute inset-0 w-[58px] h-[58px] animate-spin pointer-events-none"
                    style={{ animationDuration: '12s' }}
                    viewBox="0 0 58 58"
                  >
                    <circle
                      cx="29"
                      cy="29"
                      r="26.5"
                      fill="none"
                      stroke="#f59e0b"
                      strokeWidth="3"
                      strokeDasharray="6 4"
                      strokeLinecap="round"
                    />
                  </svg>
                )}
                <Avatar src={user.avatar || (user as any).avatarUrl} name={user.displayName || user.username || user.email || 'User'} username={user.username || user.email || 'User'} size="lg" />
              </div>
              <div className="flex-1 text-left min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                  {user.displayName || user.username || user.email?.split('@')[0] || 'User'}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  {user.email || ''}
                </p>
              </div>
              <button
                onClick={handleAddStory}
                className="flex-shrink-0 w-10 h-10 flex items-center justify-center bg-primary-600 dark:bg-primary-500 text-white rounded-full hover:bg-primary-700 dark:hover:bg-primary-600 transition-colors shadow-md relative"
                title="Add story"
                style={{ outline: 'none' }}
              >
                <div className="absolute inset-[-3px] rounded-full border-2 border-dashed border-primary-400 dark:border-primary-300 animate-spin" style={{ animationDuration: '8s' }} />
                <Plus className="w-4 h-4 relative z-10" />
              </button>
            </div>
          )}

        </div>

        {/* Search bar */}
        <div className="px-4 py-3 pb-0 flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search conversations..."
              className="w-full pl-9 pr-3 py-2 border border-gray-300 dark:border-surface-700 rounded-lg bg-gray-50 dark:bg-surface-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400 transition-colors"
            />
          </div>
        </div>

        {/* Category Tabs */}
        <div className="px-3 pt-2 pb-1 flex-shrink-0">
          <div className="flex gap-1.5 overflow-x-auto" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
            {([
              { key: 'all', label: 'All' },
              { key: 'favorites', label: '★ Favs' },
              { key: 'dms', label: 'DMs' },
              { key: 'tasks', label: 'Tasks' },
              { key: 'projects', label: 'Projects' },
            ] as const).map(({ key, label }) => {
              const isActive = activeTab === key;
              const count = key === 'all' ? 0 : (categoryCounts[key] || 0);
              return (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-all whitespace-nowrap ${
                    isActive
                      ? 'bg-primary-600 dark:bg-primary-500 text-white shadow-sm'
                      : 'bg-gray-100 dark:bg-surface-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-surface-700'
                  }`}
                >
                  {label}
                  {count > 0 && !isActive && (
                    <span className="ml-1 inline-flex items-center justify-center min-w-[16px] h-[16px] bg-red-500 text-white text-[9px] font-bold rounded-full px-0.5 leading-none">
                      {count > 9 ? '9+' : count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Conversations list */}
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {isLoadingConversations && conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary-600 dark:border-primary-400 border-t-transparent mb-2" />
              <p className="text-sm text-gray-500 dark:text-gray-400">Loading chats...</p>
            </div>
          ) : filteredConversations.length === 0 && searchQuery ? (
            <div className="flex flex-col items-center justify-center h-32 text-center px-4">
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                No conversations found
              </p>
            </div>
          ) : (
            <div className="space-y-0">
              {/* Conversations */}
              {filteredConversations.length === 0 && !searchQuery ? (
                <div className="flex flex-col items-center justify-center h-32 text-center px-4">
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    No chats with human beings!
                  </p>
                </div>
              ) : (
                filteredConversations.map((conversation) => {
                  // Check if any participant (except current user) is online
                  const otherParticipant = conversation.participants.find(
                    (p) => p.id !== user.id
                  );
                  const otherUserId = otherParticipant?.id;
                  // Linda bot is always online
                  const isLindaBot = otherParticipant?.username === 'linda' || (otherParticipant?.email && otherParticipant.email === 'linda@omnilink.system');
                  const isOnline = isLindaBot ? true : (otherUserId ? onlineUsers.has(otherUserId) : false);

                  // Get typing users for this conversation (exclude current user)
                  const convTyping = typingIndicators.get(conversation.id) || [];
                  const typingUserNames = convTyping
                    .filter(t => t.userId !== user.id)
                    .map(t => t.username);

                  // Check if the other user has an active story
                  const otherUserStory = otherUserId
                    ? contactStories.find(cs => cs.userId === otherUserId)
                    : undefined;

                  // Use real-time unread count from store (overrides stale API value)
                  const liveUnreadCount = unreadCounts.get(conversation.id) ?? conversation.unreadCount ?? 0;
                  const conversationWithUnread = { ...conversation, unreadCount: liveUnreadCount };

                  return (
                    <React.Fragment key={conversation.id}>
                      <ConversationItem
                        conversation={conversationWithUnread}
                        isActive={isConversationActive(conversation.id)}
                        isOnline={conversation.participants.length === 2 ? isOnline : undefined}
                        onNavigate={handleNavigateChat}
                        typingUsers={typingUserNames.length > 0 ? typingUserNames : undefined}
                        hasStory={!!otherUserStory}
                        hasUnviewedStory={otherUserStory?.hasUnviewed}
                        onStoryClick={otherUserStory ? () => {
                          setStoryViewUserId(otherUserId!);
                          setShowStoryViewer(true);
                        } : undefined}
                      />
                      <div className="mx-3 border-b border-gray-100 dark:border-surface-700/50" />
                    </React.Fragment>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* New Chat button - bottom */}
        <div className={`px-4 flex-shrink-0 border-t border-gray-200 dark:border-surface-700 ${isMobile ? 'py-2 pb-3' : 'py-2'}`}>
          <button
            onClick={() => setIsModalOpen(true)}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-primary-600 dark:bg-primary-500 text-white rounded-lg hover:bg-primary-700 dark:hover:bg-primary-600 transition-colors font-medium"
          >
            <Plus className="w-5 h-5" />
            NEW
          </button>
        </div>

      </div>

      {/* Story Creation Modal */}
      {showStoryCreation && (
        <StoryCreationModal
          isOpen={showStoryCreation}
          onClose={() => setShowStoryCreation(false)}
          onStoryCreated={() => {
            setHasActiveStory(true);
            setShowStoryCreation(false);
            // Refresh contact stories so the new story appears
            api.getContactStatuses().then(r => setContactStories(r?.users || [])).catch(() => {});
          }}
        />
      )}

      {/* Story Viewer Modal */}
      {showStoryViewer && storyViewUserId && (
        <StoryViewerModal
          isOpen={showStoryViewer}
          userId={storyViewUserId}
          onClose={() => {
            setShowStoryViewer(false);
            setStoryViewUserId(null);
            // Refresh contact stories so viewed rings update
            api.getContactStatuses().then(r => setContactStories(r?.users || [])).catch(() => {});
          }}
          onStoryDeleted={() => {
            setHasActiveStory(false);
          }}
        />
      )}

      {/* New Conversation Modal */}
      <NewConversationModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onPanelsClick={() => onInterPanelClick?.()}
      />
    </>
  );
};

// Story Creation Modal Component
interface StoryCreationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStoryCreated: () => void;
}

const StoryCreationModal: React.FC<StoryCreationModalProps> = ({ isOpen, onClose, onStoryCreated }) => {
  const [activeTab, setActiveTab] = useState<'text' | 'photo'>('text');
  const [textContent, setTextContent] = useState('');
  const [backgroundColor, setBackgroundColor] = useState('#FF6B6B');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoCaption, setPhotoCaption] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F'];

  if (!isOpen) return null;

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      if (activeTab === 'text') {
        if (textContent.trim()) {
          await api.createTextStatus(textContent, backgroundColor);
          onStoryCreated();
        }
      } else {
        if (photoFile) {
          // Compress image before uploading
          const { compressMedia } = await import('@/utils/mediaCompressor');
          const compressed = await compressMedia(photoFile);
          await api.createMediaStatus(compressed, photoCaption);
          onStoryCreated();
        }
      }
    } catch (err: any) {
      console.error('Error creating story:', err);
      const msg =
        err?.response?.data?.error ||
        (err?.code === 'ERR_NETWORK' ? 'Network error. Please try again.' : 'Failed to create story. Please try again.');
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-3">
      <div className="bg-white dark:bg-surface-800 rounded-2xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Add Story</h2>

        {/* Tabs */}
        <div className="flex gap-2 mb-4 border-b border-gray-200 dark:border-surface-700">
          <button
            onClick={() => setActiveTab('text')}
            className={`px-4 py-2 font-medium transition-colors ${
              activeTab === 'text'
                ? 'text-primary-600 dark:text-primary-400 border-b-2 border-primary-600 dark:border-primary-400'
                : 'text-gray-600 dark:text-gray-400'
            }`}
          >
            Text
          </button>
          <button
            onClick={() => setActiveTab('photo')}
            className={`px-4 py-2 font-medium transition-colors ${
              activeTab === 'photo'
                ? 'text-primary-600 dark:text-primary-400 border-b-2 border-primary-600 dark:border-primary-400'
                : 'text-gray-600 dark:text-gray-400'
            }`}
          >
            Photo
          </button>
        </div>

        {/* Text Tab */}
        {activeTab === 'text' && (
          <div className="space-y-4">
            <textarea
              value={textContent}
              onChange={(e) => setTextContent(e.target.value)}
              placeholder="Write your story..."
              className="w-full p-3 border border-gray-300 dark:border-surface-700 rounded-lg bg-white dark:bg-surface-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400 resize-none h-24"
            />

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Background Color
              </label>
              <div className="flex gap-2">
                {colors.map((color) => (
                  <button
                    key={color}
                    onClick={() => setBackgroundColor(color)}
                    className={`w-8 h-8 rounded-full border-2 transition-transform ${
                      backgroundColor === color
                        ? 'border-gray-900 dark:border-white scale-110'
                        : 'border-gray-300 dark:border-surface-600'
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>

            <div
              className="w-full h-32 rounded-lg flex items-center justify-center text-white font-medium text-center px-4 mb-4"
              style={{ backgroundColor }}
            >
              {textContent || 'Preview'}
            </div>
          </div>
        )}

        {/* Photo Tab */}
        {activeTab === 'photo' && (
          <div className="space-y-4">
            <div className="border-2 border-dashed border-gray-300 dark:border-surface-600 rounded-lg p-6 text-center">
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setPhotoFile(e.target.files?.[0] || null)}
                className="w-full"
              />
              {photoFile && (
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                  Selected: {photoFile.name}
                </p>
              )}
            </div>

            <textarea
              value={photoCaption}
              onChange={(e) => setPhotoCaption(e.target.value)}
              placeholder="Add a caption (optional)..."
              className="w-full p-3 border border-gray-300 dark:border-surface-700 rounded-lg bg-white dark:bg-surface-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400 resize-none h-16"
            />
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-300 dark:border-surface-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-surface-700 transition-colors font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || (activeTab === 'text' ? !textContent.trim() : !photoFile)}
            className="flex-1 px-4 py-2 bg-primary-600 dark:bg-primary-500 text-white rounded-lg hover:bg-primary-700 dark:hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
          >
            {isSubmitting ? 'Creating...' : 'Post Story'}
          </button>
        </div>
        {error && (
          <p className="text-sm text-red-600 dark:text-red-400 text-center">{error}</p>
        )}
      </div>
    </div>
  );
};


// Story Viewer Modal Component — extracted to @/components/common/StoryViewerModal

export default Sidebar;
