import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useAuthStore } from '@/store/authStore';
import AuthNavigator from './AuthNavigator';
import MainNavigator from './MainNavigator';
import CallScreen from '@/screens/call/CallScreen';
import { callService } from '@/services/callService';

export default function RootNavigator() {
  const hasCheckedAuth = useAuthStore((s) => s.hasCheckedAuth);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [callActive, setCallActive] = useState(false);

  useEffect(() => {
    return callService.subscribe((state) => {
      setCallActive(state.status !== 'idle');
    });
  }, []);

  // Show splash / loading while checking stored auth
  if (!hasCheckedAuth) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator size="large" color="#6C47FF" />
      </View>
    );
  }

  // Route to auth or main flow
  if (!isAuthenticated) {
    return <AuthNavigator />;
  }

  return (
    <View style={{ flex: 1 }}>
      <MainNavigator />
      {callActive && <CallScreen />}
    </View>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
});
