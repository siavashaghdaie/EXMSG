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
import LindaChat from '@/components/linda/LindaChat';
import AdminDashboard from '@/components/admin/AdminDashboard';
import AnnouncementBoard from '@/components/announcements/AnnouncementBoard';
import AgentsPage from '@/components/agents/AgentsPage';

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
  const [showLinda, setShowLinda] = useState(false);
  const [showTaskWall, setShowTaskWall] = useState(false);
  const [showAdminDashboard, setShowAdminDashboard] = useState(false);
  const [showAnnouncements, setShowAnnouncements] = useState(false);
  const [showAgents, setShowAgents] = useState(false);
  const [, setAnnouncementCount] = useState(0);
  const [taskCount, setTaskCount] = useState(0);

  // Reusable function to refresh task count
  const refreshTaskCount = async () => {
    try {
      const tasks = await api.getTasks();
      const incomplete = tasks?.filter((t: any) => !t.completed && t.assignedToId === user?.id) || [];
      setTaskCount(incomplete.length);
    } catch {}
  };

  // Load announcement and task counts for mobile badges + poll tasks
  useEffect(() => {
    if (!isAuthenticated || !user) return;
    const loadCounts = async () => {
      try {
        const annResult = await api.getAnnouncements();
        setAnnouncementCount((annResult?.announcements || []).length);
      } catch {}
      refreshTaskCount();
    };
    loadCounts();

    // Poll task count every 15 seconds for real-time badge updates
    const interval = setInterval(refreshTaskCount, 15000);
    return () => clearInterval(interval);
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

  return (
    <div className="h-[100dvh] bg-gray-50 dark:bg-surface-950 flex overflow-hidden flex-col md:flex-row">
      {/* Sidebar/Conversation List - Full screen on mobile when visible */}
      {shouldShowSidebar && (
        <div className={isMobile ? 'w-full h-full' : ''}>
          <Sidebar
            isMobile={isMobile}
            onNavigateChat={() => {
              setShowSettings(false);
              setShowLinda(false);
              setShowTaskWall(false);
              setShowAdminDashboard(false);
              setShowAnnouncements(false);
              setShowAgents(false);
              if (isMobile) setShowSidebar(false);
            }}
            onSettingsClick={() => {
              setShowSettings(true);
              setShowLinda(false);
              setShowTaskWall(false);
              setShowAdminDashboard(false);
              setShowAnnouncements(false);
              setShowAgents(false);
              if (isMobile) setShowSidebar(false);
            }}
            onDashboardClick={() => {
              setShowAdminDashboard(true);
              setShowSettings(false);
              setShowLinda(false);
              setShowTaskWall(false);
              setShowAnnouncements(false);
              setShowAgents(false);
              if (isMobile) setShowSidebar(false);
            }}
            onLindaClick={() => {
              setShowLinda(true);
              setShowSettings(false);
              setShowTaskWall(false);
              setShowAdminDashboard(false);
              setShowAnnouncements(false);
              setShowAgents(false);
              if (isMobile) setShowSidebar(false);
            }}
            onAnnouncementsClick={() => {
              setShowAnnouncements(true);
              setShowSettings(false);
              setShowLinda(false);
              setShowTaskWall(false);
              setShowAdminDashboard(false);
              if (isMobile) setShowSidebar(false);
            }}
            onTasksClick={() => {
              setShowTaskWall(true);
              setShowSettings(false);
              setShowLinda(false);
              setShowAdminDashboard(false);
              setShowAnnouncements(false);
              setShowAgents(false);
              if (isMobile) setShowSidebar(false);
            }}
          />
        </div>
      )}

      {/* Main content area - shown on desktop always, on mobile only when in chat */}
      {shouldShowContent && (
        <div className="flex-1 flex flex-col overflow-hidden">
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
            ) : showLinda ? (
              <LindaChat onClose={() => {
                setShowLinda(false);
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

      {/* Bottom Navigation - only show on mobile when sidebar is visible */}
      {isMobile && shouldShowSidebar && (
        <BottomNav
          visible={true}
          taskCount={taskCount}
          onAgentsClick={() => {
            setShowAgents(true);
            setShowSettings(false);
            setShowLinda(false);
            setShowTaskWall(false);
            setShowAdminDashboard(false);
            setShowAnnouncements(false);
            setShowSidebar(false);
          }}
          onTasksClick={() => {
            setShowTaskWall(true);
            setShowSettings(false);
            setShowLinda(false);
            setShowAdminDashboard(false);
            setShowAnnouncements(false);
            setShowAgents(false);
            setShowSidebar(false);
          }}
          onSettingsClick={() => {
            setShowSettings(true);
            setShowLinda(false);
            setShowTaskWall(false);
            setShowAdminDashboard(false);
            setShowAnnouncements(false);
            setShowAgents(false);
            setShowSidebar(false);
          }}
          onChatsClick={() => {
            setShowSettings(false);
            setShowLinda(false);
            setShowTaskWall(false);
            setShowAdminDashboard(false);
            setShowAnnouncements(false);
            setShowAgents(false);
            setShowSidebar(true);
          }}
          onContactsClick={() => {
            setShowSettings(false);
            setShowLinda(false);
            setShowTaskWall(false);
            setShowAdminDashboard(false);
            setShowAnnouncements(false);
            setShowAgents(false);
            navigate('/contacts');
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
