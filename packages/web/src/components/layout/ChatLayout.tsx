import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { useChatStore, setupChatSocketListeners } from '@/store/chatStore';
import { setupPresenceSocketListeners } from '@/store/presenceStore';
import { socket } from '@/services/socket';
import { api } from '@/services/api';
import Sidebar from '@/components/sidebar/Sidebar';
import SettingsPage from '@/components/settings/SettingsPage';
import TaskWall from '@/components/tasks/TaskWall';
import BottomNav from '@/components/layout/BottomNav';
import AdminDashboard from '@/components/admin/AdminDashboard';
import AnnouncementBoard from '@/components/announcements/AnnouncementBoard';
import AgentsPage from '@/components/agents/AgentsPage';
import PanelOwnerWizard from '@/components/auth/PanelOwnerWizard';
import OrgAdminDashboard from '@/components/org-admin/OrgAdminDashboard';
import InterPanelPage from '@/components/inter-panel/InterPanelPage';

export const ChatLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, user, isLoading } = useAuthStore();
  const { fetchConversations } = useChatStore();
  const [, setIsInitialized] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  // On mobile: true = show sidebar/conversation list, false = show chat. On desktop: always show sidebar
  const [showSidebar, setShowSidebar] = useState(!isMobile);
  const [showSettings, setShowSettings] = useState(false);
  const [showTaskWall, setShowTaskWall] = useState(false);
  const [showAdminDashboard, setShowAdminDashboard] = useState(false);
  const [showAnnouncements, setShowAnnouncements] = useState(false);
  const [showAgents, setShowAgents] = useState(false);
  const [showOrgDashboard, setShowOrgDashboard] = useState(false);
  const [showInterPanel, setShowInterPanel] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [, setAnnouncementCount] = useState(0);
  const [taskCount, setTaskCount] = useState(0);

  // Helper: close ALL sub-pages so that <Outlet/> (ChatView) can render.
  // Call this before opening any sub-page or navigating to a chat.
  const closeAllSubPages = () => {
    setShowSettings(false);
    setShowTaskWall(false);
    setShowAdminDashboard(false);
    setShowAnnouncements(false);
    setShowAgents(false);
    setShowOrgDashboard(false);
    setShowInterPanel(false);
  };

  // Check whether to show the welcome wizard on first login (ALL users)
  useEffect(() => {
    if (!user?.id) return;
    const wizardKey = `omnilink_wizard_completed_${user.id}`;
    if (!localStorage.getItem(wizardKey)) {
      setShowWizard(true);
    }
  }, [user?.id]);

  // Reusable function to refresh task count
  const refreshTaskCount = async () => {
    try {
      const tasks = await api.getTasks();
      const incomplete = tasks?.filter((t: any) => t.status !== 'COMPLETED' && t.assignedToId === user?.id) || [];
      setTaskCount(incomplete.length);
    } catch {}
  };

  // Load announcement and task counts for mobile badges + poll tasks
  useEffect(() => {
    if (!isAuthenticated || !user) return;
    const loadCounts = async () => {
      try {
        const result = await api.getUnnotedAnnouncementCount();
        setAnnouncementCount(result?.count || 0);
      } catch {
        try {
          const annResult = await api.getAnnouncements();
          const unnoted = (annResult?.announcements || []).filter((a: any) => !a.noted);
          setAnnouncementCount(unnoted.length);
        } catch {}
      }
      refreshTaskCount();
    };
    loadCounts();

    // Poll counts every 15 seconds for real-time badge updates
    const interval = setInterval(loadCounts, 15000);

    // Listen for instant badge refresh events
    const handleBadgeRefresh = () => loadCounts();
    window.addEventListener('badges:refresh', handleBadgeRefresh);

    return () => {
      clearInterval(interval);
      window.removeEventListener('badges:refresh', handleBadgeRefresh);
    };
  }, [isAuthenticated, user]);

  // Check authentication on mount
  useEffect(() => {
    if (!isAuthenticated && !isLoading) {
      navigate('/login', { replace: true });
      return;
    }
  }, [isAuthenticated, isLoading, navigate]);

  // Initialize chat on mount
  useEffect(() => {
    if (!isAuthenticated || !user) {
      return;
    }

    const initializeChat = async () => {
      try {
        // Ensure socket is connected before setting up listeners
        const token = localStorage.getItem('accessToken');
        if (token && !socket.isConnected()) {
          try {
            await socket.connect(token);
          } catch (err) {
            console.warn('[ChatLayout] Socket connection failed, retrying...', err);
          }
        }

        // Setup socket listeners for chat and presence
        const unsubscribeChatListeners = setupChatSocketListeners();
        const unsubscribePresenceListeners = setupPresenceSocketListeners();

        // Fetch conversations (this also joins all conversation rooms)
        await fetchConversations();

        // Store cleanup function
        const cleanup = () => {
          unsubscribeChatListeners();
          unsubscribePresenceListeners();
          socket.disconnect();
        };

        window.__chatCleanup = cleanup;
        setIsInitialized(true);
      } catch (error) {
        console.error('Failed to initialize chat:', error);
      }
    };

    initializeChat();

    return () => {
      if (window.__chatCleanup) {
        window.__chatCleanup();
      }
    };
  }, [isAuthenticated, user, fetchConversations]);

  // Handle responsive behavior
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      // On desktop, show sidebar by default
      if (!mobile) {
        setShowSidebar(true);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // On mobile, when navigating back to /chat (no conversation selected), show the sidebar
  useEffect(() => {
    if (isMobile && location.pathname === '/chat') {
      setShowSidebar(true);
    }
  }, [location.pathname, isMobile]);

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    return null;
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-surface-950">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-2 border-primary-600 dark:border-primary-400 border-t-transparent mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  // On mobile: show sidebar if showSidebar is true. On desktop: always show sidebar
  const shouldShowSidebar = isMobile ? showSidebar : true;
  // On mobile: show content only if not showing sidebar. On desktop: always show content
  const shouldShowContent = isMobile ? !showSidebar : true;

  // Determine if a sub-page (settings, agents, tasks, etc.) is open — these should keep BottomNav visible
  const isSubPageOpen = showSettings || showAgents || showTaskWall || showAdminDashboard || showAnnouncements || showOrgDashboard || showInterPanel;
  // On mobile, show BottomNav when: sidebar is visible OR a sub-page is open (not in a conversation)
  const showBottomNav = isMobile && (shouldShowSidebar || isSubPageOpen);

  // Determine the active BottomNav tab based on which sub-page is open
  const getActiveBottomTab = (): string | undefined => {
    if (showSettings) return 'settings';
    if (showAgents) return 'agents';
    if (showTaskWall) return 'tasks';
    return undefined; // let BottomNav auto-detect from URL
  };

  return (
    <div className="h-[100dvh] bg-gray-50 dark:bg-surface-950 flex overflow-hidden flex-col md:flex-row">
      {/* Sidebar/Conversation List - Full screen on mobile when visible */}
      {shouldShowSidebar && !(isMobile && isSubPageOpen) && (
        <div className={isMobile ? 'w-full' : ''} style={isMobile && showBottomNav ? { height: 'calc(100% - 59px)' } : isMobile ? { height: '100%' } : undefined}>
          <Sidebar
            isMobile={isMobile}
            onNavigateChat={() => {
              closeAllSubPages();
              if (isMobile) setShowSidebar(false);
            }}
            onSettingsClick={() => {
              closeAllSubPages();
              setShowSettings(true);
              if (isMobile) setShowSidebar(false);
            }}
            onDashboardClick={() => {
              closeAllSubPages();
              setShowOrgDashboard(true);
              if (isMobile) setShowSidebar(false);
            }}
            onAnnouncementsClick={() => {
              closeAllSubPages();
              setShowAnnouncements(true);
              if (isMobile) setShowSidebar(false);
            }}
            onTasksClick={() => {
              closeAllSubPages();
              setShowTaskWall(true);
              if (isMobile) setShowSidebar(false);
            }}
            onInterPanelClick={() => {
              closeAllSubPages();
              setShowInterPanel(true);
              if (isMobile) setShowSidebar(false);
            }}
          />
        </div>
      )}

      {/* Main content area - shown on desktop always, on mobile only when in chat/sub-page */}
      {(shouldShowContent || (isMobile && isSubPageOpen)) && (
        <div className={`flex-1 flex flex-col overflow-hidden ${showBottomNav ? 'pb-[90px]' : ''}`}>
          {/* Note: ChatView has its own back button in its header */}

          {/* Content outlet */}
          <div className="flex-1 overflow-hidden">
            {showSettings ? (
              <SettingsPage onBack={() => {
                setShowSettings(false);
                if (isMobile) {
                  setShowSidebar(true);
                }
              }} />
            ) : showAdminDashboard ? (
              <AdminDashboard onBack={() => {
                setShowAdminDashboard(false);
                if (isMobile) {
                  setShowSidebar(true);
                }
              }} />
            ) : showTaskWall ? (
              <TaskWall onClose={() => {
                setShowTaskWall(false);
                refreshTaskCount();
                if (isMobile) {
                  setShowSidebar(true);
                }
              }} />
            ) : showAnnouncements ? (
              <AnnouncementBoard onClose={() => {
                setShowAnnouncements(false);
                if (isMobile) {
                  setShowSidebar(true);
                }
              }} />
            ) : showOrgDashboard ? (
              <OrgAdminDashboard onBack={() => {
                setShowOrgDashboard(false);
                if (isMobile) {
                  setShowSidebar(true);
                }
              }} />
            ) : showInterPanel ? (
              <InterPanelPage onBack={() => {
                setShowInterPanel(false);
                if (isMobile) {
                  setShowSidebar(true);
                }
              }} />
            ) : showAgents ? (
              <AgentsPage onClose={() => {
                setShowAgents(false);
                if (isMobile) {
                  setShowSidebar(true);
                }
              }} />
            ) : (
              <Outlet />
            )}
          </div>
        </div>
      )}

      {/* Bottom Navigation - show on mobile when sidebar is visible or sub-page is open */}
      {showBottomNav && (
        <BottomNav
          visible={true}
          taskCount={taskCount}
          activeTab={getActiveBottomTab()}
          onAgentsClick={() => {
            closeAllSubPages();
            setShowAgents(true);
            setShowSidebar(false);
          }}
          onTasksClick={() => {
            closeAllSubPages();
            setShowTaskWall(true);
            setShowSidebar(false);
          }}
          onSettingsClick={() => {
            closeAllSubPages();
            setShowSettings(true);
            setShowSidebar(false);
          }}
          onChatsClick={() => {
            closeAllSubPages();
            setShowSidebar(true);
          }}
          onContactsClick={() => {
            closeAllSubPages();
            navigate('/contacts');
          }}
        />
      )}

      {/* Welcome Wizard — shown once on first login for ALL users */}
      {showWizard && user && (
        <PanelOwnerWizard
          displayName={user.displayName || user.username || user.email?.split('@')[0] || ''}
          isAdmin={user.role === 'SUPER_ADMIN' || user.orgRole === 'OWNER' || user.orgRole === 'ADMIN'}
          onComplete={() => {
            if (user.id) {
              localStorage.setItem(`omnilink_wizard_completed_${user.id}`, '1');
            }
            setShowWizard(false);
          }}
          onOpenDashboard={() => {
            closeAllSubPages();
            setShowOrgDashboard(true);
            if (isMobile) setShowSidebar(false);
            // Also mark dashboard button as seen
            if (user.id) {
              localStorage.setItem(`omnilink_dashboard_seen_${user.id}`, '1');
            }
          }}
        />
      )}
    </div>
  );
};

// Type declaration for cleanup function
declare global {
  interface Window {
    __chatCleanup?: () => void;
  }
}

export default ChatLayout;
