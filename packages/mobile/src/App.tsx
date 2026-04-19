import React, { useEffect } from 'react';
import { StatusBar } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { useAuthStore } from '@/store/authStore';
import { setupPresenceSocketListeners } from '@/store/presenceStore';
import { setupChatSocketListeners } from '@/store/chatStore';
import { useSettingsStore } from '@/store/settingsStore';
import RootNavigator from '@/navigation/RootNavigator';

export default function App() {
  const checkAuth = useAuthStore((s) => s.checkAuth);
  const effectiveTheme = useSettingsStore((s) => s.effectiveTheme);

  useEffect(() => {
    // Check authentication status on mount
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    // Setup socket listeners for presence and chat events.
    // These return cleanup functions that remove all listeners on unmount.
    const cleanupPresence = setupPresenceSocketListeners();
    const cleanupChat = setupChatSocketListeners();

    return () => {
      cleanupPresence();
      cleanupChat();
    };
  }, []);

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
