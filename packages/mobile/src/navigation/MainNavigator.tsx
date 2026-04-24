import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import ChatNavigator from '@/navigation/ChatNavigator';
import ContactsScreen from '@/screens/main/ContactsScreen';
import AgentsScreen from '@/screens/main/AgentsScreen';
import TasksScreen from '@/screens/main/TasksScreen';
import ProjectsScreen from '@/screens/main/ProjectsScreen';
import SettingsScreen from '@/screens/main/SettingsScreen';

export type MainTabParamList = {
  Chats: undefined;
  Contacts: undefined;
  Agents: undefined;
  Tasks: undefined;
  Projects: undefined;
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
        tabBarLabelStyle: {
          fontSize: 10,
        },
      }}
    >
      <Tab.Screen
        name="Chats"
        component={ChatNavigator}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon label="💬" focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="Contacts"
        component={ContactsScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon label="👥" focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="Agents"
        component={AgentsScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon label="🤖" focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="Tasks"
        component={TasksScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon label="📋" focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="Projects"
        component={ProjectsScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon label="📂" focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon label="⚙️" focused={focused} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  icon: {
    fontSize: 18,
    fontWeight: '700',
    color: '#999',
  },
  iconFocused: {
    color: '#6C47FF',
  },
});
