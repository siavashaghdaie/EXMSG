import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import ConversationListScreen from '@/screens/main/ConversationListScreen';
import ChatScreen from '@/screens/chat/ChatScreen';
import AnnouncementScreen from '@/screens/main/AnnouncementScreen';

export type ChatStackParamList = {
  ConversationList: undefined;
  Chat: { conversationId: string; name: string; isLinda?: boolean };
  Announcements: undefined;
};

const Stack = createNativeStackNavigator<ChatStackParamList>();

export default function ChatNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="ConversationList" component={ConversationListScreen} />
      <Stack.Screen name="Chat" component={ChatScreen} />
      <Stack.Screen name="Announcements" component={AnnouncementScreen} />
    </Stack.Navigator>
  );
}
