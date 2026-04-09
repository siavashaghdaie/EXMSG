import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { setupPresenceSocketListeners } from '@/store/presenceStore';
import { LoginPage } from '@/components/auth/LoginPage';
import { RegisterPage } from '@/components/auth/RegisterPage';
import { VerifyOtpPage } from '@/components/auth/VerifyOtpPage';
import ChatLayout from '@/components/layout/ChatLayout';
import ChatView from '@/components/chat/ChatView';

function App() {
  const { checkAuth, isAuthenticated, isLoading } = useAuthStore();

  // Check auth status on app startup
  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Initialize presence socket listeners
  useEffect(() => {
    if (isAuthenticated) {
      const unsubscribe = setupPresenceSocketListeners();
      return unsubscribe;
    }
  }, [isAuthenticated]);

  // Show loading spinner while checking auth
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-surface-950">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-2 border-primary-600 border-t-transparent mx-auto mb-4" />
          <p className="text-gray-500 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      {/* Public routes */}
      <Route
        path="/login"
        element={isAuthenticated ? <Navigate to="/chat" replace /> : <LoginPage />}
      />
      <Route
        path="/register"
        element={isAuthenticated ? <Navigate to="/chat" replace /> : <RegisterPage />}
      />
      <Route
        path="/verify"
        element={isAuthenticated ? <Navigate to="/chat" replace /> : <VerifyOtpPage />}
      />

      {/* Protected chat routes */}
      <Route
        path="/chat"
        element={isAuthenticated && !isLoading ? <ChatLayout /> : <Navigate to="/login" replace />}
      >
        <Route index element={<ChatEmptyState />} />
        <Route path=":conversationId" element={<ChatView />} />
      </Route>

      {/* Catch-all redirect */}
      <Route path="*" element={<Navigate to={isAuthenticated ? '/chat' : '/login'} replace />} />
    </Routes>
  );
}

function ChatEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full bg-gray-50 dark:bg-surface-950">
      <div className="text-center">
        <div className="w-24 h-24 bg-primary-100 dark:bg-primary-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg
            className="w-12 h-12 text-primary-600 dark:text-primary-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-2">
          OMNILINK
        </h2>
        <p className="text-gray-500 dark:text-gray-400 max-w-sm">
          Select a conversation from the sidebar or start a new chat to begin messaging.
        </p>
      </div>
    </div>
  );
}

export default App;
