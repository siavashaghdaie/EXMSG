import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useChatStore } from '@/store/chatStore';
import { usePresenceStore } from '@/store/presenceStore';
import { useAuthStore } from '@/store/authStore';
import { ChatStackParamList } from '@/navigation/ChatNavigator';

type NavProp = NativeStackNavigationProp<ChatStackParamList, 'ConversationList'>;

const COLORS = {
  primary: '#7C3AED',
  bg: '#FFFFFF',
  text: '#1E293B',
  secondary: '#64748B',
  muted: '#94A3B8',
  border: '#F1F5F9',
  inputBg: '#F1F5F9',
  green: '#10B981',
  white: '#FFFFFF',
};

const AVATAR_COLORS = [
  '#7C3AED', '#3B82F6', '#10B981', '#F59E0B', '#EF4444',
  '#EC4899', '#8B5CF6', '#06B6D4', '#84CC16', '#F97316',
];

function getAvatarColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function formatTime(dateStr: string | undefined): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'now';
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return date.toLocaleDateString(undefined, { weekday: 'short' });
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

interface ConversationItemData {
  id: string;
  name: string;
  avatarLetter: string;
  avatarColor: string;
  lastMessage: string;
  lastMessageTime: string;
  unread: number;
  isOnline: boolean;
  isTyping: boolean;
  typingUser: string;
  isGroup: boolean;
  isLinda: boolean;
  otherUserId: string | null;
}

export default function ConversationListScreen() {
  const navigation = useNavigation<NavProp>();
  const { conversations, fetchConversations, isLoadingConversations, typingIndicators, unreadCounts } = useChatStore();
  const onlineUsers = usePresenceStore((s) => s.onlineUsers);
  const currentUser = useAuthStore((s) => s.user);
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchConversations();
    setRefreshing(false);
  }, [fetchConversations]);

  const conversationItems: ConversationItemData[] = useMemo(() => {
    if (!conversations || !currentUser) return [];

    return conversations.map((conv) => {
      const isDm = conv.type === 'DIRECT';
      const otherMember = isDm
        ? conv.members?.find((m: any) => m.userId !== currentUser.id)
        : null;
      const otherUser = otherMember?.user;
      const isLinda = otherUser?.username === 'linda' || otherUser?.email === 'linda@omnilink.system';

      const name = isDm
        ? (otherUser?.displayName || otherUser?.username || 'Unknown')
        : (conv.name || 'Group');

      const avatarLetter = name.charAt(0).toUpperCase();
      const avatarColor = isLinda ? '#8B5CF6' : getAvatarColor(conv.id);

      // Last message
      let lastMessage = '';
      let lastMessageTime = '';
      if (conv.lastMessage) {
        const isOwn = conv.lastMessage.sender?.id === currentUser.id;
        const prefix = isOwn ? 'You: ' : '';
        const content = conv.lastMessage.content || (conv.lastMessage.type === 'IMAGE' ? 'Photo' : 'Attachment');
        lastMessage = prefix + content;
        lastMessageTime = conv.lastMessage.createdAt;
      }

      // Typing
      const typing = typingIndicators?.[conv.id];
      const isTyping = !!typing && Object.keys(typing).length > 0;
      const typingUser = isTyping ? Object.values(typing)[0] as string || 'Someone' : '';

      // Unread
      const unread = unreadCounts?.[conv.id] || 0;

      // Online
      const isOnline = isLinda ? true : (otherUser ? onlineUsers.has(otherUser.id) : false);

      return {
        id: conv.id,
        name,
        avatarLetter,
        avatarColor,
        lastMessage,
        lastMessageTime,
        unread,
        isOnline: isDm ? isOnline : false,
        isTyping,
        typingUser,
        isGroup: !isDm,
        isLinda: !!isLinda,
        otherUserId: otherUser?.id || null,
      };
    });
  }, [conversations, currentUser, typingIndicators, unreadCounts, onlineUsers]);

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return conversationItems;
    const q = searchQuery.toLowerCase();
    return conversationItems.filter((c) =>
      c.name.toLowerCase().includes(q) || c.lastMessage.toLowerCase().includes(q)
    );
  }, [conversationItems, searchQuery]);

  const handlePress = (item: ConversationItemData) => {
    navigation.navigate('Chat', { conversationId: item.id, name: item.name });
  };

  const renderItem = ({ item }: { item: ConversationItemData }) => (
    <TouchableOpacity
      style={styles.item}
      onPress={() => handlePress(item)}
      activeOpacity={0.6}
    >
      {/* Avatar */}
      <View style={styles.avatarContainer}>
        <View style={[styles.avatar, { backgroundColor: item.avatarColor }]}>
          {item.isLinda ? (
            <Text style={styles.avatarText}>AI</Text>
          ) : (
            <Text style={styles.avatarText}>{item.avatarLetter}</Text>
          )}
        </View>
        {item.isOnline && <View style={styles.onlineDot} />}
      </View>

      {/* Content */}
      <View style={styles.itemContent}>
        <View style={styles.itemTopRow}>
          <Text style={styles.itemName} numberOfLines={1}>
            {item.isLinda ? 'Linda AI' : item.name}
            {item.isGroup && ' (Group)'}
          </Text>
          <Text style={[styles.itemTime, item.unread > 0 && styles.itemTimeUnread]}>
            {formatTime(item.lastMessageTime)}
          </Text>
        </View>
        <View style={styles.itemBottomRow}>
          {item.isTyping ? (
            <Text style={styles.typingText} numberOfLines={1}>
              {item.typingUser} is typing...
            </Text>
          ) : (
            <Text style={styles.itemPreview} numberOfLines={1}>
              {item.lastMessage || 'No messages yet'}
            </Text>
          )}
          {item.unread > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {item.unread > 99 ? '99+' : item.unread}
              </Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderEmpty = () => {
    if (isLoadingConversations) {
      return (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      );
    }
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyIcon}>💬</Text>
        <Text style={styles.emptyTitle}>No conversations yet</Text>
        <Text style={styles.emptySubtitle}>
          Start chatting by tapping the + button
        </Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Chats</Text>
        <TouchableOpacity
          style={styles.composeButton}
          onPress={() => Alert.alert('New Chat', 'New conversation screen coming soon')}
        >
          <Text style={styles.composeIcon}>+</Text>
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search conversations..."
          placeholderTextColor={COLORS.muted}
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCorrect={false}
        />
      </View>

      {/* Conversation List */}
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListEmptyComponent={renderEmpty}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
            colors={[COLORS.primary]}
          />
        }
        contentContainerStyle={filtered.length === 0 ? styles.emptyList : undefined}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.text,
  },
  composeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  composeIcon: {
    fontSize: 22,
    color: COLORS.white,
    fontWeight: '600',
    marginTop: -1,
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  searchInput: {
    backgroundColor: COLORS.inputBg,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 16,
    color: COLORS.text,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 12,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: COLORS.white,
    fontSize: 18,
    fontWeight: '700',
  },
  onlineDot: {
    position: 'absolute',
    bottom: 1,
    right: 1,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: COLORS.green,
    borderWidth: 2.5,
    borderColor: COLORS.white,
  },
  itemContent: {
    flex: 1,
    justifyContent: 'center',
  },
  itemTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  itemName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    flex: 1,
    marginRight: 8,
  },
  itemTime: {
    fontSize: 12,
    color: COLORS.muted,
  },
  itemTimeUnread: {
    color: COLORS.primary,
    fontWeight: '600',
  },
  itemBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemPreview: {
    fontSize: 14,
    color: COLORS.secondary,
    flex: 1,
    marginRight: 8,
  },
  typingText: {
    fontSize: 14,
    color: COLORS.green,
    fontStyle: 'italic',
    flex: 1,
    marginRight: 8,
  },
  badge: {
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  badgeText: {
    color: COLORS.white,
    fontSize: 11,
    fontWeight: '700',
  },
  separator: {
    height: 1,
    backgroundColor: COLORS.border,
    marginLeft: 80,
  },
  emptyList: {
    flexGrow: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingTop: 80,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: COLORS.secondary,
    textAlign: 'center',
  },
});
