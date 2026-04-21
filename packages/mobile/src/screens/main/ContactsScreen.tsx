import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { api, SearchUsersResponse } from '@/services/api';
import { useChatStore } from '@/store/chatStore';
import { usePresenceStore } from '@/store/presenceStore';
import { useAuthStore } from '@/store/authStore';

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

interface ContactItem {
  id: string;
  displayName: string;
  username: string;
  avatarLetter: string;
  avatarColor: string;
  isOnline: boolean;
}

export default function ContactsScreen() {
  const navigation = useNavigation<any>();
  const { createConversation } = useChatStore();
  const onlineUsers = usePresenceStore((s) => s.onlineUsers);
  const currentUser = useAuthStore((s) => s.user);

  const [contacts, setContacts] = useState<SearchUsersResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [startingDm, setStartingDm] = useState<string | null>(null);

  const isAdmin = currentUser?.orgRole === 'OWNER' || currentUser?.orgRole === 'ADMIN';

  const fetchContacts = useCallback(async () => {
    try {
      let users: SearchUsersResponse[] = [];
      if (isAdmin) {
        try {
          const result = await api.getOrgAdminMembers();
          // The org admin endpoint returns { members: [...], total, page, ... }
          const members = result?.members || result || [];
          users = members.map((m: any) => ({
            id: m.userId || m.id,
            email: m.email || m.user?.email || '',
            username: m.username || m.user?.username || '',
            displayName: m.displayName || m.user?.displayName || m.username || m.user?.username || '',
            avatar: m.avatar || m.user?.avatar,
            bio: m.bio || m.user?.bio,
          }));
        } catch {
          // Fall back to searchUsers if org admin endpoint fails
          users = await api.searchUsers('');
        }
      } else {
        users = await api.searchUsers('');
      }
      // Filter out current user
      if (currentUser) {
        users = users.filter((u) => u.id !== currentUser.id);
      }
      setContacts(users);
    } catch (err) {
      console.error('[ContactsScreen] Failed to fetch contacts:', err);
      Alert.alert('Error', 'Failed to load contacts. Please try again.');
    }
  }, [isAdmin, currentUser]);

  useEffect(() => {
    setLoading(true);
    fetchContacts().finally(() => setLoading(false));
  }, [fetchContacts]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchContacts();
    setRefreshing(false);
  }, [fetchContacts]);

  const contactItems: ContactItem[] = useMemo(() => {
    return contacts.map((user) => {
      const name = (user as any).displayName || user.username || user.email;
      return {
        id: user.id,
        displayName: name,
        username: user.username,
        avatarLetter: name.charAt(0).toUpperCase(),
        avatarColor: getAvatarColor(user.id),
        isOnline: onlineUsers.has(user.id),
      };
    });
  }, [contacts, onlineUsers]);

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return contactItems;
    const q = searchQuery.toLowerCase();
    return contactItems.filter(
      (c) =>
        c.displayName.toLowerCase().includes(q) ||
        c.username.toLowerCase().includes(q),
    );
  }, [contactItems, searchQuery]);

  const handleContactPress = useCallback(
    async (contact: ContactItem) => {
      if (startingDm) return;
      setStartingDm(contact.id);
      try {
        const conversation = await createConversation([contact.id]);
        // Navigate to the Chat screen inside the Chats tab
        navigation.navigate('Chats', {
          screen: 'Chat',
          params: { conversationId: conversation.id, name: contact.displayName },
        });
      } catch (err: any) {
        console.error('[ContactsScreen] Failed to create DM:', err);
        Alert.alert('Error', 'Failed to start conversation. Please try again.');
      } finally {
        setStartingDm(null);
      }
    },
    [createConversation, navigation, startingDm],
  );

  const renderItem = ({ item }: { item: ContactItem }) => (
    <TouchableOpacity
      style={styles.item}
      onPress={() => handleContactPress(item)}
      activeOpacity={0.6}
      disabled={startingDm === item.id}
    >
      {/* Avatar */}
      <View style={styles.avatarContainer}>
        <View style={[styles.avatar, { backgroundColor: item.avatarColor }]}>
          <Text style={styles.avatarText}>{item.avatarLetter}</Text>
        </View>
        {item.isOnline && <View style={styles.onlineDot} />}
      </View>

      {/* Info */}
      <View style={styles.itemContent}>
        <Text style={styles.itemName} numberOfLines={1}>
          {item.displayName}
        </Text>
        <Text style={styles.itemUsername} numberOfLines={1}>
          @{item.username}
        </Text>
      </View>

      {/* Loading indicator when starting DM */}
      {startingDm === item.id && (
        <ActivityIndicator size="small" color={COLORS.primary} />
      )}
    </TouchableOpacity>
  );

  const renderEmpty = () => {
    if (loading) {
      return (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      );
    }
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyIcon}>👥</Text>
        <Text style={styles.emptyTitle}>No contacts found</Text>
        <Text style={styles.emptySubtitle}>
          {searchQuery
            ? 'Try a different search term'
            : 'Organization members will appear here'}
        </Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Contacts</Text>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search contacts..."
          placeholderTextColor={COLORS.muted}
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCorrect={false}
        />
      </View>

      {/* Contact List */}
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
  itemName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 2,
  },
  itemUsername: {
    fontSize: 14,
    color: COLORS.secondary,
  },
  separator: {
    height: 1,
    backgroundColor: COLORS.border,
    marginLeft: 76,
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
