import React, { useEffect, useState } from 'react';
import { useNavigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { useChatStore, setupChatSocketListeners } from '@/store/chatStore';
import { socket } from '@/services/socket';
import Sidebar from '@/components/sidebar/Sidebar';

export const ChatLayout: React.FC = () => {
  const navigate = useNavigate();
  const { isAuthenticated, user, isLoading } = useAuthStore();
  const { fetchConversations } = useChatStore();
  const [, setIsInitialized] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [showSidebar, setShowSidebar] = useState(!isMobile);

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
        // Fetch conversations
        await fetchConversations();

        // Setup socket listeners
        const unsubscribeListeners = setupChatSocketListeners();

        // Store cleanup function
        const cleanup = () => {
          unsubscribeListeners();
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
      // Show sidebar by default on desktop
      if (!mobile) {
        setShowSidebar(true);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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

  return (
    <div className="h-screen bg-gray-50 dark:bg-surface-950 flex overflow-hidden">
      {/* Sidebar - Hidden on mobile unless explicitly shown */}
      {isMobile ? (
        showSidebar && (
          <div className="absolute inset-0 z-40 md:relative md:z-auto">
            <Sidebar
              onNavigateChat={() => {
                setShowSidebar(false);
              }}
            />
          </div>
        )
      ) : (
        <Sidebar />
      )}

      {/* Main content area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile header with sidebar toggle */}
        {isMobile && (
          <div className="h-14 bg-white dark:bg-surface-900 border-b border-gray-200 dark:border-surface-700 flex items-center px-4 gap-3">
            <button
              onClick={() => setShowSidebar(true)}
              className="p-2 hover:bg-gray-100 dark:hover:bg-surface-800 rounded-lg transition-colors"
            >
              <svg
                className="w-6 h-6 text-gray-600 dark:text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            </button>
            <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
              Exclusive Messenger
            </h1>
          </div>
        )}

        {/* Content outlet */}
        <div className="flex-1 overflow-hidden">
          <Outlet />
        </div>
      </div>
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
