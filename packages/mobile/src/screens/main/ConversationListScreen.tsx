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
  Modal,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useChatStore } from '@/store/chatStore';
import { usePresenceStore } from '@/store/presenceStore';
import { useAuthStore } from '@/store/authStore';
import * as SecureStore from 'expo-secure-store';
import { api, SearchUsersResponse } from '@/services/api';
import { ChatStackParamList } from '@/navigation/ChatNavigator';
import StoryCreationModal from '@/components/StoryCreationModal';
import StoryViewerModal from '@/components/StoryViewerModal';
import ChatLockModal from '@/components/ChatLockModal';
import { getFullUrl } from '@/utils/url';

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
  lindaPurple: '#8B5CF6',
  amber: '#F59E0B',
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

function formatLastSeen(dateStr: string | undefined): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Last seen just now';
  if (diffMins < 60) return `Last seen ${diffMins}m ago`;
  if (diffHours < 24) return `Last seen ${diffHours}h ago`;
  if (diffDays === 1) return 'Last seen yesterday';
  return `Last seen ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}

type ConvCategory = 'all' | 'favorites' | 'dms' | 'tasks' | 'projects' | 'groups';

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
  lastSeen: string | undefined;
  category: ConvCategory;
  isTaskChat: boolean;
  isProjectChat: boolean;
  isFavorite: boolean;
  isLocked: boolean;
}

export default function ConversationListScreen() {
  const navigation = useNavigation<NavProp>();
  const { conversations, fetchConversations, isLoadingConversations, typingIndicators, unreadCounts, createConversation } = useChatStore();
  const onlineUsers = usePresenceStore((s) => s.onlineUsers);
  const lastSeenMap = usePresenceStore((s) => s.lastSeen);
  const currentUser = useAuthStore((s) => s.user);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<ConvCategory>('all');
  const [refreshing, setRefreshing] = useState(false);

  // New chat modal state
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [newChatSearch, setNewChatSearch] = useState('');
  const [newChatUsers, setNewChatUsers] = useState<SearchUsersResponse[]>([]);
  const [newChatLoading, setNewChatLoading] = useState(false);
  const [startingDm, setStartingDm] = useState<string | null>(null);
  const [showStoryModal, setShowStoryModal] = useState(false);

  // Story viewer state
  const [showStoryViewer, setShowStoryViewer] = useState(false);
  const [storyViewUserId, setStoryViewUserId] = useState('');
  const [storyViewUserName, setStoryViewUserName] = useState('');
  const [hasOwnStory, setHasOwnStory] = useState(false);
  const [contactStories, setContactStories] = useState<any[]>([]);
  const [showLockModal, setShowLockModal] = useState(false);
  const [lockTargetItem, setLockTargetItem] = useState<ConversationItemData | null>(null);
  const [lockError, setLockError] = useState<string | null>(null);

  // Fetch own stories status
  const refreshStoryStatus = useCallback(async () => {
    try {
      const result = await api.getMyStatuses();
      setHasOwnStory((result?.statuses || []).length > 0);
    } catch { /* ignore */ }
    try {
      const result = await api.getContactStatuses();
      setContactStories(result?.users || []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchConversations();
    refreshStoryStatus();
  }, [fetchConversations, refreshStoryStatus]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchConversations(), refreshStoryStatus()]);
    setRefreshing(false);
  }, [fetchConversations, refreshStoryStatus]);

  // Fetch users for new chat modal
  const fetchNewChatUsers = useCallback(async (query: string) => {
    setNewChatLoading(true);
    try {
      const isAdmin = currentUser?.orgRole === 'OWNER' || currentUser?.orgRole === 'ADMIN';
      let users: SearchUsersResponse[] = [];
      if (isAdmin) {
        try {
          const result = await api.getOrgAdminMembers(query || undefined);
          const members = result?.members || result || [];
          users = members.map((m: any) => ({
            id: m.userId || m.id,
            email: m.email || m.user?.email || '',
            username: m.username || m.user?.username || '',
            displayName: m.displayName || m.user?.displayName || m.username || m.user?.username || '',
            avatar: m.avatar || m.user?.avatar,
          }));
        } catch {
          users = await api.searchUsers(query);
        }
      } else {
        users = await api.searchUsers(query);
      }
      if (currentUser) {
        users = users.filter((u) => u.id !== currentUser.id);
      }
      setNewChatUsers(users);
    } catch (err) {
      console.error('[ConversationList] Failed to fetch users:', err);
    }
    setNewChatLoading(false);
  }, [currentUser]);

  const openNewChatModal = useCallback(() => {
    setShowNewChatModal(true);
    setNewChatSearch('');
    fetchNewChatUsers('');
  }, [fetchNewChatUsers]);

  const handleNewChatUserPress = useCallback(async (user: SearchUsersResponse) => {
    if (startingDm) return;
    setStartingDm(user.id);
    try {
      const conversation = await createConversation([user.id]);
      setShowNewChatModal(false);
      navigation.navigate('Chat', {
        conversationId: conversation.id,
        name: (user as any).displayName || user.username || user.email,
      });
    } catch (err: any) {
      console.error('[ConversationList] Failed to create DM:', err);
      Alert.alert('Error', 'Failed to start conversation.');
    } finally {
      setStartingDm(null);
    }
  }, [createConversation, navigation, startingDm]);

  const conversationItems: ConversationItemData[] = useMemo(() => {
    if (!conversations || !currentUser) return [];

    return conversations.map((conv: any) => {
      const participants = conv.participants || conv.members || [];
      const isDm = participants.length === 2 && !conv.name;
      const otherUser = isDm
        ? participants.find((p: any) => p.id !== currentUser.id)
        : null;
      const isLinda = !!(otherUser?.username === 'linda' || otherUser?.email === 'linda@omnilink.system');
      const displayName = isDm
        ? (otherUser?.displayName || otherUser?.username || 'Unknown')
        : (conv.name || 'Group Chat');
      const avatarLetter = isLinda ? 'AI' : displayName.charAt(0).toUpperCase();
      const avatarColor = isLinda ? COLORS.lindaPurple : getAvatarColor(conv.id);

      let lastMessage = '';
      let lastMessageTime = '';
      if (conv.lastMessage) {
        const isOwn = conv.lastMessage.senderId === currentUser.id;
        const prefix = isOwn ? 'You: ' : '';
        const content = conv.lastMessage.content || (conv.lastMessage.type === 'IMAGE' ? 'Photo' : 'Attachment');
        lastMessage = prefix + content;
        lastMessageTime = conv.lastMessage.createdAt;
      }

      const typing = typingIndicators instanceof Map
        ? typingIndicators.get(conv.id)
        : (typingIndicators as any)?.[conv.id];
      const isTyping = Array.isArray(typing) ? typing.length > 0
        : (!!typing && typeof typing === 'object' && Object.keys(typing).length > 0);
      let typingUser = 'Someone';
      if (isTyping) {
        if (Array.isArray(typing) && typing.length > 0) {
          typingUser = typing[0]?.username || 'Someone';
        } else if (typeof typing === 'object') {
          typingUser = Object.values(typing)[0] as string || 'Someone';
        }
      }

      const unread = unreadCounts instanceof Map
        ? (unreadCounts.get(conv.id) || 0)
        : ((unreadCounts as any)?.[conv.id] || 0);
      const isOnline = isLinda ? true : (otherUser ? onlineUsers.has(otherUser.id) : false);
      const lastSeen = otherUser && !isOnline
        ? (lastSeenMap instanceof Map ? lastSeenMap.get(otherUser.id) : undefined)
        : undefined;

      const isTaskChat = !!conv.linkedTask;
      const isProjectChat = !!conv.linkedProject;
      let category: ConvCategory = 'dms';
      if (isTaskChat) category = 'tasks';
      else if (isProjectChat) category = 'projects';
      else if (!isDm) category = 'groups';

      return {
        id: conv.id,
        name: displayName,
        avatarLetter,
        avatarColor,
        lastMessage,
        lastMessageTime,
        unread,
        isOnline: isDm ? isOnline : false,
        isTyping,
        typingUser,
        isGroup: !isDm,
        isLinda,
        otherUserId: otherUser?.id || null,
        lastSeen,
        category,
        isTaskChat,
        isProjectChat,
        isFavorite: !!conv.isFavorite,
        isLocked: !!(conv.settings?.isLocked),
      };
    });
  }, [conversations, currentUser, typingIndicators, unreadCounts, onlineUsers, lastSeenMap]);

  const filtered = useMemo(() => {
    let items = conversationItems;
    // Apply tab filter
    if (activeTab === 'favorites') {
      items = items.filter((c) => c.isFavorite);
    } else if (activeTab !== 'all') {
      items = items.filter((c) => c.category === activeTab);
    }
    if (!searchQuery.trim()) return items;
    const q = searchQuery.toLowerCase();
    return items.filter((c) =>
      c.name.toLowerCase().includes(q) || c.lastMessage.toLowerCase().includes(q)
    );
  }, [conversationItems, searchQuery, activeTab]);

  const handlePress = async (item: ConversationItemData) => {
    if (item.isLocked) {
      // Check if there's a PIN stored
      const savedPin = await SecureStore.getItemAsync(`chat_lock_${item.id}`);
      if (savedPin) {
        setLockTargetItem(item);
        setLockError(null);
        setShowLockModal(true);
        return;
      }
    }
    navigation.navigate('Chat', {
      conversationId: item.id,
      name: item.name,
      isLinda: item.isLinda,
    });
  };

  const handleLockUnlock = async (pin: string) => {
    if (!lockTargetItem) return;
    const savedPin = await SecureStore.getItemAsync(`chat_lock_${lockTargetItem.id}`);
    if (savedPin && pin === savedPin) {
      setShowLockModal(false);
      navigation.navigate('Chat', {
        conversationId: lockTargetItem.id,
        name: lockTargetItem.name,
        isLinda: lockTargetItem.isLinda,
      });
      setLockTargetItem(null);
    } else {
      setLockError('Incorrect PIN');
    }
  };

  // User avatar URL
  const userAvatarUrl = getFullUrl(currentUser?.avatarUrl || currentUser?.avatar);
  const userDisplayName = currentUser?.displayName || currentUser?.username || currentUser?.email || '';
  const userAvatarLetter = userDisplayName.charAt(0).toUpperCase();

  const renderItem = ({ item }: { item: ConversationItemData }) => {
    const contactStory = getContactStory(item.otherUserId);
    const hasStory = !!contactStory && (contactStory.statuses?.length || 0) > 0;
    const hasUnviewedStory = hasStory && contactStory.hasUnviewed;

    return (
    <TouchableOpacity
      style={styles.item}
      onPress={() => handlePress(item)}
      activeOpacity={0.6}
    >
      {/* Avatar — with story ring if contact has stories */}
      <TouchableOpacity
        style={styles.avatarContainer}
        activeOpacity={hasStory ? 0.7 : 1}
        disabled={!hasStory}
        onPress={() => {
          if (hasStory && item.otherUserId) {
            setStoryViewUserId(item.otherUserId);
            setStoryViewUserName(item.name);
            setShowStoryViewer(true);
          }
        }}
      >
        <View style={[
          styles.avatarStoryWrap,
          hasStory && (hasUnviewedStory ? styles.avatarStoryRingUnviewed : styles.avatarStoryRingViewed),
        ]}>
          <View style={[styles.avatar, { backgroundColor: item.avatarColor }]}>
            <Text style={styles.avatarText}>{item.avatarLetter}</Text>
          </View>
        </View>
        {item.isOnline && <View style={styles.onlineDot} />}
      </TouchableOpacity>

      {/* Content */}
      <View style={styles.itemContent}>
        <View style={styles.itemTopRow}>
          <View style={styles.nameRow}>
            {item.isGroup && (
              <Text style={styles.groupIcon}>{'\uD83D\uDC65'} </Text>
            )}
            <Text style={[styles.itemName, item.unread > 0 && styles.itemNameUnread]} numberOfLines={1}>
              {item.name}
            </Text>
            {item.isLinda && (
              <View style={styles.aiBadge}>
                <Text style={styles.aiBadgeText}>AI</Text>
              </View>
            )}
            {item.isTaskChat && (
              <View style={[styles.aiBadge, { backgroundColor: '#FEF3C7' }]}>
                <Text style={[styles.aiBadgeText, { color: '#D97706' }]}>Task</Text>
              </View>
            )}
            {item.isProjectChat && (
              <View style={[styles.aiBadge, { backgroundColor: '#DBEAFE' }]}>
                <Text style={[styles.aiBadgeText, { color: '#2563EB' }]}>Project</Text>
              </View>
            )}
            {item.isLocked && (
              <Text style={styles.lockIcon}>{'🔒'}</Text>
            )}
          </View>
          <Text style={[styles.itemTime, item.unread > 0 && styles.itemTimeUnread]}>
            {formatTime(item.lastMessageTime)}
          </Text>
        </View>
        {/* Last seen for offline DMs */}
        {!item.isGroup && !item.isOnline && !item.isLinda && !!item.lastSeen && (
          <Text style={styles.lastSeenText} numberOfLines={1}>
            {formatLastSeen(item.lastSeen)}
          </Text>
        )}
        {/* Online indicator for DMs */}
        {!item.isGroup && item.isOnline && !item.isLinda && (
          <Text style={styles.onlineText} numberOfLines={1}>
            Online
          </Text>
        )}
        <View style={styles.itemBottomRow}>
          {item.isTyping ? (
            <Text style={styles.typingText} numberOfLines={1}>
              {item.typingUser} is typing...
            </Text>
          ) : (
            <Text style={[styles.itemPreview, item.unread > 0 && styles.itemPreviewUnread]} numberOfLines={1}>
              {item.lastMessage || 'No messages yet'}
            </Text>
          )}
          {item.unread > 0 && (
            <View style={[styles.badge, item.isLinda && styles.badgeLinda]}>
              <Text style={styles.badgeText}>
                {item.unread > 99 ? '99+' : item.unread}
              </Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
  };

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
        <Text style={styles.emptyIcon}>{'\uD83D\uDCAC'}</Text>
        <Text style={styles.emptyTitle}>No conversations yet</Text>
        <Text style={styles.emptySubtitle}>
          Start chatting by tapping the + button
        </Text>
      </View>
    );
  };

  // Check if a conversation's other user has a story
  const getContactStory = useCallback((otherUserId: string | null) => {
    if (!otherUserId) return null;
    return contactStories.find((s: any) => s.userId === otherUserId);
  }, [contactStories]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        {/* Top row: W3LINK logo + bell */}
        <View style={styles.headerButtonsRow}>
          <Text style={styles.headerTitle}>W3LINK</Text>
          <View style={styles.headerButtons}>
            {/* Announcements bell */}
            <TouchableOpacity
              style={styles.headerButton}
              onPress={() => navigation.navigate('Announcements')}
            >
              <Text style={styles.headerButtonIcon}>{'\uD83D\uDD14'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Profile row with story ring */}
        <View style={styles.profileRow}>
          {/* User avatar — tap to view own stories */}
          <TouchableOpacity
            style={styles.profileAvatarContainer}
            activeOpacity={0.7}
            onPress={() => {
              if (hasOwnStory && currentUser) {
                setStoryViewUserId(currentUser.id);
                setStoryViewUserName(userDisplayName);
                setShowStoryViewer(true);
              }
            }}
          >
            <View style={[styles.storyRing, hasOwnStory && styles.storyRingActive]}>
              {userAvatarUrl ? (
                <Image source={{ uri: userAvatarUrl }} style={styles.profileAvatar} />
              ) : (
                <View style={[styles.profileAvatar, styles.profileAvatarFallback]}>
                  <Text style={styles.profileAvatarText}>{userAvatarLetter}</Text>
                </View>
              )}
            </View>
          </TouchableOpacity>

          {/* User info */}
          <View style={styles.profileInfo}>
            <Text style={styles.profileName} numberOfLines={1}>{userDisplayName}</Text>
            <Text style={styles.profileEmail} numberOfLines={1}>{currentUser?.email || ''}</Text>
          </View>

          {/* Add Story button */}
          <TouchableOpacity
            style={styles.addStoryButton}
            activeOpacity={0.7}
            onPress={() => setShowStoryModal(true)}
          >
            <Text style={styles.addStoryIcon}>+</Text>
          </TouchableOpacity>
        </View>
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

      {/* Category Tabs */}
      <View style={styles.tabsContainer}>
        {([
          { key: 'all' as ConvCategory, label: 'All' },
          { key: 'favorites' as ConvCategory, label: '★ Favs' },
          { key: 'dms' as ConvCategory, label: 'DMs' },
          { key: 'tasks' as ConvCategory, label: 'Tasks' },
          { key: 'projects' as ConvCategory, label: 'Projects' },
          { key: 'groups' as ConvCategory, label: 'Groups' },
        ]).map(({ key, label }) => (
          <TouchableOpacity
            key={key}
            onPress={() => setActiveTab(key)}
            style={[
              styles.tabButton,
              activeTab === key && styles.tabButtonActive,
            ]}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === key && styles.tabTextActive,
              ]}
            >
              {label}
            </Text>
          </TouchableOpacity>
        ))}
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

      {/* Floating New Chat button at bottom */}
      <View style={styles.newChatButtonContainer}>
        <TouchableOpacity
          style={styles.newChatButton}
          onPress={openNewChatModal}
          activeOpacity={0.8}
        >
          <Text style={styles.newChatIcon}>+</Text>
          <Text style={styles.newChatText}>NEW</Text>
        </TouchableOpacity>
      </View>

      {/* Story Creation Modal */}
      <StoryCreationModal
        visible={showStoryModal}
        onClose={() => setShowStoryModal(false)}
        onSuccess={() => {
          fetchConversations();
          refreshStoryStatus();
        }}
      />

      {/* Story Viewer Modal */}
      <StoryViewerModal
        visible={showStoryViewer}
        userId={storyViewUserId}
        userName={storyViewUserName}
        onClose={() => setShowStoryViewer(false)}
        onStoryDeleted={refreshStoryStatus}
      />

      {/* New Chat Modal */}
      <Modal
        visible={showNewChatModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowNewChatModal(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowNewChatModal(false)}>
              <Text style={styles.modalCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>New Chat</Text>
            <View style={{ width: 60 }} />
          </View>

          <View style={styles.modalSearchContainer}>
            <TextInput
              style={styles.modalSearchInput}
              placeholder="Search people..."
              placeholderTextColor={COLORS.muted}
              value={newChatSearch}
              onChangeText={(text) => {
                setNewChatSearch(text);
                fetchNewChatUsers(text);
              }}
              autoCorrect={false}
              autoFocus
            />
          </View>

          {newChatLoading ? (
            <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 40 }} />
          ) : (
            <FlatList
              data={newChatUsers}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => {
                const displayName = (item as any).displayName || item.username || item.email;
                const letter = displayName.charAt(0).toUpperCase();
                const color = getAvatarColor(item.id);
                const isOnline = onlineUsers.has(item.id);
                return (
                  <TouchableOpacity
                    style={styles.modalUserItem}
                    onPress={() => handleNewChatUserPress(item)}
                    activeOpacity={0.6}
                    disabled={startingDm === item.id}
                  >
                    <View style={styles.modalAvatarContainer}>
                      <View style={[styles.modalAvatar, { backgroundColor: color }]}>
                        <Text style={styles.modalAvatarText}>{letter}</Text>
                      </View>
                      {isOnline && <View style={styles.modalOnlineDot} />}
                    </View>
                    <View style={styles.modalUserInfo}>
                      <Text style={styles.modalUserName}>{displayName}</Text>
                      <Text style={styles.modalUserUsername}>@{item.username}</Text>
                    </View>
                    {startingDm === item.id && (
                      <ActivityIndicator size="small" color={COLORS.primary} />
                    )}
                  </TouchableOpacity>
                );
              }}
              ItemSeparatorComponent={() => <View style={styles.modalSeparator} />}
              ListEmptyComponent={
                <View style={styles.modalEmptyContainer}>
                  <Text style={styles.modalEmptyText}>No users found</Text>
                </View>
              }
            />
          )}
        </SafeAreaView>
      </Modal>

      {/* Lock Chat PIN Modal */}
      <ChatLockModal
        visible={showLockModal}
        mode="unlock"
        error={lockError}
        onCancel={() => { setShowLockModal(false); setLockTargetItem(null); }}
        onSubmit={handleLockUnlock}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },

  // Header + Profile
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  profileAvatarContainer: {
    marginRight: 12,
  },
  storyRing: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2.5,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 2,
  },
  storyRingActive: {
    borderColor: COLORS.amber,
  },
  profileAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
  },
  profileAvatarFallback: {
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileAvatarText: {
    color: COLORS.white,
    fontSize: 18,
    fontWeight: '700',
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 1,
  },
  profileEmail: {
    fontSize: 12,
    color: COLORS.secondary,
  },
  addStoryButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.white,
    borderStyle: 'dashed',
  },
  addStoryIcon: {
    fontSize: 20,
    color: COLORS.white,
    fontWeight: '600',
    marginTop: -1,
  },

  // Header buttons row (top)
  headerButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.primary,
    letterSpacing: 1.5,
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.inputBg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerButtonIcon: {
    fontSize: 18,
  },
  // Floating New Chat button
  newChatButtonContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  newChatButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    backgroundColor: COLORS.primary,
    borderRadius: 12,
  },
  newChatIcon: {
    fontSize: 20,
    color: COLORS.white,
    fontWeight: '700',
  },
  newChatText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.white,
  },

  // Search
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  searchInput: {
    backgroundColor: COLORS.inputBg,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 16,
    color: COLORS.text,
  },

  // Category tabs
  tabsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingBottom: 8,
    gap: 6,
  },
  tabButton: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: COLORS.inputBg,
  },
  tabButtonActive: {
    backgroundColor: COLORS.primary,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.secondary,
  },
  tabTextActive: {
    color: COLORS.white,
  },

  // Conversation item
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
  avatarStoryWrap: {
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 2.5,
    borderColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 2,
  },
  avatarStoryRingUnviewed: {
    borderColor: COLORS.amber,
    borderStyle: 'dashed',
  },
  avatarStoryRingViewed: {
    borderColor: COLORS.muted,
    borderStyle: 'dashed',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
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
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  groupIcon: {
    fontSize: 14,
    marginRight: 2,
  },
  itemName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    flexShrink: 1,
  },
  itemNameUnread: {
    fontWeight: '800',
    color: '#000000',
  },
  aiBadge: {
    backgroundColor: COLORS.lindaPurple,
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 1,
    marginLeft: 6,
  },
  aiBadgeText: {
    color: COLORS.white,
    fontSize: 10,
    fontWeight: '700',
  },
  lockIcon: {
    fontSize: 12,
    marginLeft: 4,
  },
  itemTime: {
    fontSize: 12,
    color: COLORS.muted,
  },
  lastSeenText: {
    fontSize: 12,
    color: COLORS.muted,
    marginBottom: 2,
  },
  onlineText: {
    fontSize: 12,
    color: COLORS.green,
    fontWeight: '500',
    marginBottom: 2,
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
  itemPreviewUnread: {
    fontWeight: '700',
    color: COLORS.text,
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
  badgeLinda: {
    backgroundColor: COLORS.lindaPurple,
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

  // New Chat Modal
  modalContainer: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  modalCancel: {
    fontSize: 16,
    color: COLORS.primary,
    fontWeight: '500',
    width: 60,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
  },
  modalSearchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  modalSearchInput: {
    backgroundColor: COLORS.inputBg,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 16,
    color: COLORS.text,
  },
  modalUserItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  modalAvatarContainer: {
    position: 'relative',
    marginRight: 12,
  },
  modalAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalAvatarText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '700',
  },
  modalOnlineDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.green,
    borderWidth: 2,
    borderColor: COLORS.white,
  },
  modalUserInfo: {
    flex: 1,
  },
  modalUserName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 2,
  },
  modalUserUsername: {
    fontSize: 13,
    color: COLORS.secondary,
  },
  modalSeparator: {
    height: 1,
    backgroundColor: COLORS.border,
    marginLeft: 72,
  },
  modalEmptyContainer: {
    alignItems: 'center',
    paddingTop: 60,
  },
  modalEmptyText: {
    fontSize: 15,
    color: COLORS.muted,
  },
});
