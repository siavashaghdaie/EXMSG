import React from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useAuthStore } from '@/store/authStore';
import AuthNavigator from './AuthNavigator';
import MainNavigator from './MainNavigator';

export default function RootNavigator() {
  const hasCheckedAuth = useAuthStore((s) => s.hasCheckedAuth);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

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

  return <MainNavigator />;
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
});
