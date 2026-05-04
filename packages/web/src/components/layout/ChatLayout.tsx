import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { Bell, X } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useChatStore, setupChatSocketListeners } from '@/store/chatStore';
import { setupPresenceSocketListeners } from '@/store/presenceStore';
import { initializePushNotifications } from '@/services/pushService';
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
import ProjectsPage from '@/components/projects/ProjectsPage';
import CallsPage from '@/components/calls/CallsPage';
import PlannerPage from '@/components/planner/PlannerPage';
import OfficePage from '@/components/office/OfficePage';

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
  const [agentSlugToOpen, setAgentSlugToOpen] = useState<string | undefined>(undefined);
  const [showOrgDashboard, setShowOrgDashboard] = useState(false);
  const [showInterPanel, setShowInterPanel] = useState(false);
  const [showProjects, setShowProjects] = useState(false);
  const [showCalls, setShowCalls] = useState(false);
  const [showPlanner, setShowPlanner] = useState(false);
  const [showOffice, setShowOffice] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [showPushBanner, setShowPushBanner] = useState(false);
  const [, setAnnouncementCount] = useState(0);
  const [taskCount, setTaskCount] = useState(0);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return localStorage.getItem('omnilink_sidebar_collapsed') === 'true';
  });

  const toggleSidebarCollapsed = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('omnilink_sidebar_collapsed', String(next));
      return next;
    });
  };

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
    setShowProjects(false);
    setShowCalls(false);
    setShowPlanner(false);
    setShowOffice(false);
  };

  // Listen for 'navigate-to-agent' custom events dispatched from ChatView/ChatSettingsPanel
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const slug = detail?.agentSlug as string | undefined;
      closeAllSubPages();
      setAgentSlugToOpen(slug);
      setShowAgents(true);
      if (isMobile) setShowSidebar(false);
    };
    window.addEventListener('navigate-to-agent', handler);
    return () => window.removeEventListener('navigate-to-agent', handler);
  }, [isMobile]);

  // Check whether to show the welcome wizard on first login (ALL users)
  useEffect(() => {
    if (!user?.id) return;
    const wizardKey = `omnilink_wizard_completed_${user.id}`;
    if (!localStorage.getItem(wizardKey)) {
      setShowWizard(true);
    }
  }, [user?.id]);

  // Show push notification banner if permission not yet granted
  useEffect(() => {
    if (!isAuthenticated || !('Notification' in window) || !('PushManager' in window)) return;
    const dismissed = localStorage.getItem('omnilink_push_banner_dismissed');
    if (!dismissed && Notification.permission === 'default') {
      setShowPushBanner(true);
    }
  }, [isAuthenticated]);

  const handleEnablePush = async () => {
    setShowPushBanner(false);
    try {
      await initializePushNotifications();
    } catch (err) {
      console.warn('[ChatLayout] Push init failed:', err);
    }
  };

  const handleDismissPushBanner = () => {
    setShowPushBanner(false);
    localStorage.setItem('omnilink_push_banner_dismissed', 'true');
  };

  // Reusable function to refresh task count
  const refreshTaskCount = async () => {
    try {
      const tasks = await api.getTasks();
      const uid = user?.id;
      const incomplete = tasks?.filter((t: any) => {
        if (t.status === 'COMPLETED' || t.deleted || t.archived) return false;
        if (t.assignedToId === uid) return true;
        if (t.createdById === uid) return true;
        if (Array.isArray(t.coAssigneeIds) && t.coAssigneeIds.includes(uid)) return true;
        if (Array.isArray(t.checklists)) {
          for (const cl of t.checklists) {
            if (Array.isArray(cl.items)) {
              for (const item of cl.items) {
                if (Array.isArray(item.assigneeIds) && item.assigneeIds.includes(uid)) return true;
              }
            }
          }
        }
        return false;
      }) || [];
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
        // Setup socket listeners BEFORE connecting so no events are missed
        // between the connect moment and listener registration
        const unsubscribeChatListeners = setupChatSocketListeners();
        const unsubscribePresenceListeners = setupPresenceSocketListeners();

        // Now connect the socket
        const token = localStorage.getItem('accessToken');
        if (token && !socket.isConnected()) {
          try {
            await socket.connect(token);
          } catch (err) {
            console.warn('[ChatLayout] Socket connection failed, retrying...', err);
          }
        }

        // Fetch conversations (this also joins all conversation rooms)
        await fetchConversations();

        // Listen for socket reconnect — re-fetch conversations to pick up
        // any messages missed during the disconnect window
        const unsubscribeReconnect = socket.on('socket:reconnect', () => {
          console.log('[ChatLayout] Socket reconnected, refreshing conversations...');
          // Room re-joins are handled automatically by SocketService.rejoinRooms()
          // Re-fetch conversations to pick up any messages missed during disconnect
          fetchConversations();
        });

        // Store cleanup function
        const cleanup = () => {
          unsubscribeChatListeners();
          unsubscribePresenceListeners();
          unsubscribeReconnect();
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
  const isSubPageOpen = showSettings || showAgents || showTaskWall || showAdminDashboard || showAnnouncements || showOrgDashboard || showInterPanel || showProjects || showCalls || showPlanner || showOffice;
  // On mobile, show BottomNav when: sidebar is visible OR a sub-page is open (not in a conversation)
  const showBottomNav = isMobile && (shouldShowSidebar || isSubPageOpen);

  // Determine the active BottomNav tab based on which sub-page is open
  const getActiveBottomTab = (): string | undefined => {
    if (showSettings) return 'settings';
    if (showCalls) return 'calls';
    if (showPlanner || showTaskWall || showProjects) return 'planner';
    if (showOffice || showAgents) return 'office';
    return undefined; // let BottomNav auto-detect from URL
  };

  return (
    <div className="h-[100dvh] bg-gray-50 dark:bg-surface-950 flex overflow-hidden flex-col md:flex-row">
      {/* Push notification permission banner */}
      {showPushBanner && (
        <div className="absolute top-0 left-0 right-0 z-50 flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm">
          <Bell className="w-4 h-4 flex-shrink-0" />
          <span className="flex-1">Enable notifications to get alerts for calls and messages when this tab isn't active.</span>
          <button onClick={handleEnablePush} className="px-3 py-1 bg-white text-primary-700 rounded font-medium text-xs hover:bg-primary-50">
            Enable
          </button>
          <button onClick={handleDismissPushBanner} className="p-1 hover:bg-primary-700 rounded">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      {/* Sidebar/Conversation List - Full screen on mobile when visible */}
      {shouldShowSidebar && !(isMobile && isSubPageOpen) && (
        <div className={isMobile ? 'w-full' : ''} style={isMobile && showBottomNav ? { height: 'calc(100% - 59px)' } : isMobile ? { height: '100%' } : undefined}>
          <Sidebar
            isMobile={isMobile}
            collapsed={!isMobile && sidebarCollapsed}
            onToggleCollapse={toggleSidebarCollapsed}
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
            onPlannerClick={() => {
              closeAllSubPages();
              setShowPlanner(true);
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
            ) : showProjects ? (
              <ProjectsPage onClose={() => {
                setShowProjects(false);
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
              <AgentsPage
                initialAgentSlug={agentSlugToOpen}
                onClose={() => {
                  setShowAgents(false);
                  setAgentSlugToOpen(undefined);
                  if (isMobile) {
                    setShowSidebar(true);
                  }
                }}
              />
            ) : showCalls ? (
              <CallsPage onClose={() => {
                setShowCalls(false);
                if (isMobile) {
                  setShowSidebar(true);
                }
              }} />
            ) : showPlanner ? (
              <PlannerPage onClose={() => {
                setShowPlanner(false);
                refreshTaskCount();
                if (isMobile) {
                  setShowSidebar(true);
                }
              }} />
            ) : showOffice ? (
              <OfficePage onClose={() => {
                setShowOffice(false);
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
          onCallsClick={() => {
            closeAllSubPages();
            setShowCalls(true);
            setShowSidebar(false);
          }}
          onPlannerClick={() => {
            closeAllSubPages();
            setShowPlanner(true);
            setShowSidebar(false);
          }}
          onOfficeClick={() => {
            closeAllSubPages();
            setShowOffice(true);
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
