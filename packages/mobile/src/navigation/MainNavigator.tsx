import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import ChatNavigator from '@/navigation/ChatNavigator';
import LindaChatScreen from '@/screens/main/LindaChatScreen';
import CallsScreen from '@/screens/main/CallsScreen';
import TasksScreen from '@/screens/main/TasksScreen';
import SettingsScreen from '@/screens/main/SettingsScreen';

export type MainTabParamList = {
  Chats: undefined;
  Linda: undefined;
  Calls: undefined;
  Tasks: undefined;
  Settings: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

/** Simple text-based tab icon until lucide-react-native or a custom icon set is configured. */
function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  return (
    <Text style={[styles.icon, focused && styles.iconFocused]}>{label}</Text>
  );
}

export default function MainNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#6C47FF',
        tabBarInactiveTintColor: '#999',
        tabBarStyle: {
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: '#e0e0e0',
        },
      }}
    >
      <Tab.Screen
        name="Chats"
        component={ChatNavigator}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon label="C" focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="Linda"
        component={LindaChatScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon label="L" focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="Calls"
        component={CallsScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon label="P" focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="Tasks"
        component={TasksScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon label="T" focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon label="S" focused={focused} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  icon: {
    fontSize: 16,
    fontWeight: '700',
    color: '#999',
  },
  iconFocused: {
    color: '#6C47FF',
  },
});
