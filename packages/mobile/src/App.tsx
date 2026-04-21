import React, { useEffect, useRef } from 'react';
import { StatusBar } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { useAuthStore } from '@/store/authStore';
import { setupPresenceSocketListeners } from '@/store/presenceStore';
import { setupChatSocketListeners, useChatStore } from '@/store/chatStore';
import { useSettingsStore } from '@/store/settingsStore';
import { notificationService } from '@/services/notifications';
import { socket } from '@/services/socket';
import { secureStorage } from '@/services/secureStorage';
import RootNavigator from '@/navigation/RootNavigator';

export default function App() {
  const checkAuth = useAuthStore((s) => s.checkAuth);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const effectiveTheme = useSettingsStore((s) => s.effectiveTheme);
  const fetchConversations = useChatStore((s) => s.fetchConversations);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    // Check authentication status on mount
    checkAuth();
    // Initialize notifications
    notificationService.initialize();
  }, [checkAuth]);

  // Setup socket + listeners AFTER authentication, matching the web's ChatLayout pattern.
  // Re-runs on login/logout so listeners are always fresh.
  useEffect(() => {
    if (!isAuthenticated || !user) {
      // Not authenticated — clean up any existing listeners
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
      return;
    }

    const initializeRealtime = async () => {
      try {
        // Ensure socket is connected before setting up listeners
        const token = await secureStorage.getAccessToken();
        if (token && !socket.isConnected()) {
          try {
            await socket.connect(token);
          } catch (err) {
            console.warn('[App] Socket connection failed, will retry:', err);
          }
        }

        // Setup socket listeners for chat and presence events
        const cleanupChat = setupChatSocketListeners();
        const cleanupPresence = setupPresenceSocketListeners();

        // Fetch conversations (this also joins all conversation rooms for real-time events)
        await fetchConversations();

        // Store cleanup function
        cleanupRef.current = () => {
          cleanupChat();
          cleanupPresence();
        };

        console.log('[App] Real-time listeners initialized');
      } catch (error) {
        console.error('[App] Failed to initialize real-time:', error);
      }
    };

    initializeRealtime();

    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
    };
  }, [isAuthenticated, user, fetchConversations]);

  return (
    <NavigationContainer>
      <StatusBar
        barStyle={effectiveTheme === 'dark' ? 'light-content' : 'dark-content'}
        backgroundColor={effectiveTheme === 'dark' ? '#000' : '#fff'}
      />
      <RootNavigator />
    </NavigationContainer>
  );
}
