import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import ChatNavigator from '@/navigation/ChatNavigator';
import CallsScreen from '@/screens/main/CallsScreen';
import PlannerScreen from '@/screens/main/PlannerScreen';
import OfficeScreen from '@/screens/main/OfficeScreen';
import SettingsScreen from '@/screens/main/SettingsScreen';

export type MainTabParamList = {
  Chats: undefined;
  Calls: undefined;
  Planner: undefined;
  Office: undefined;
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
        name="Calls"
        component={CallsScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon label="📞" focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="Planner"
        component={PlannerScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon label="📋" focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="Office"
        component={OfficeScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon label="🏢" focused={focused} />
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
