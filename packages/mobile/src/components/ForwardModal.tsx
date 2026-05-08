import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  FlatList,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useChatStore } from '@/store/chatStore';
import { api } from '@/services/api';

const COLORS = {
  primary: '#7C3AED',
  bg: '#FFFFFF',
  text: '#1E293B',
  secondary: '#64748B',
  muted: '#94A3B8',
  border: '#E2E8F0',
  green: '#10B981',
  white: '#FFFFFF',
  inputBg: '#F1F5F9',
};

interface ForwardModalProps {
  visible: boolean;
  messageId: string;
  onClose: () => void;
}

export default function ForwardModal({ visible, messageId, onClose }: ForwardModalProps) {
  const conversations = useChatStore((s) => s.conversations);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [sending, setSending] = useState(false);

  const filtered = useMemo(() => {
    if (!search.trim()) return conversations;
    const q = search.toLowerCase();
    return conversations.filter((c: any) =>
      (c.name || '').toLowerCase().includes(q) ||
      (c.participants || []).some((p: any) =>
        (p.displayName || p.username || '').toLowerCase().includes(q)
      )
    );
  }, [conversations, search]);

  const toggleSelection = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleForward = async () => {
    if (selected.size === 0) return;
    setSending(true);
    try {
      await api.forwardMessage(messageId, Array.from(selected));
      Alert.alert('Forwarded', `Message sent to ${selected.size} conversation(s)`);
      setSelected(new Set());
      setSearch('');
      onClose();
    } catch (err) {
      Alert.alert('Error', 'Failed to forward message');
    } finally {
      setSending(false);
    }
  };

  const handleClose = () => {
    setSelected(new Set());
    setSearch('');
    onClose();
  };

  const getConversationName = (conv: any) => {
    if (conv.name) return conv.name;
    const participants = conv.participants || [];
    if (participants.length <= 2) {
      const other = participants.find((p: any) => p.id !== conv.creatorId);
      return other?.displayName || other?.username || 'Unknown';
    }
    return participants.map((p: any) => p.displayName || p.username).join(', ');
  };

  const getInitials = (name: string) => {
    return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2) || '?';
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={handleClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.title}>Forward To</Text>
            <TouchableOpacity
              onPress={handleForward}
              disabled={selected.size === 0 || sending}
            >
              {sending ? (
                <ActivityIndicator size="small" color={COLORS.primary} />
              ) : (
                <Text style={[styles.sendText, selected.size === 0 && styles.sendTextDisabled]}>
                  Send {selected.size > 0 ? `(${selected.size})` : ''}
                </Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Search */}
          <View style={styles.searchContainer}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search conversations..."
              placeholderTextColor={COLORS.muted}
              value={search}
              onChangeText={setSearch}
            />
          </View>

          {/* Conversation List */}
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => {
              const convName = getConversationName(item);
              const isSelected = selected.has(item.id);
              return (
                <TouchableOpacity
                  style={[styles.convItem, isSelected && styles.convItemSelected]}
                  onPress={() => toggleSelection(item.id)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.avatar, isSelected && styles.avatarSelected]}>
                    <Text style={[styles.avatarText, isSelected && styles.avatarTextSelected]}>
                      {getInitials(convName)}
                    </Text>
                  </View>
                  <Text style={styles.convName} numberOfLines={1}>{convName}</Text>
                  <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                    {isSelected && <Text style={styles.checkmark}>{'✓'}</Text>}
                  </View>
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              <Text style={styles.emptyText}>No conversations found</Text>
            }
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: COLORS.bg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  cancelText: { fontSize: 16, color: COLORS.secondary },
  title: { fontSize: 17, fontWeight: '600', color: COLORS.text },
  sendText: { fontSize: 16, fontWeight: '600', color: COLORS.primary },
  sendTextDisabled: { color: COLORS.muted },
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  searchInput: {
    backgroundColor: COLORS.inputBg,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: COLORS.text,
  },
  convItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.border,
  },
  convItemSelected: {
    backgroundColor: '#F0EAFF',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.inputBg,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarSelected: {
    backgroundColor: COLORS.primary,
  },
  avatarText: { fontSize: 14, fontWeight: '600', color: COLORS.secondary },
  avatarTextSelected: { color: COLORS.white },
  convName: { flex: 1, fontSize: 15, color: COLORS.text },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  checkmark: { color: COLORS.white, fontSize: 14, fontWeight: '700' },
  emptyText: {
    textAlign: 'center',
    color: COLORS.muted,
    fontSize: 14,
    paddingVertical: 40,
  },
});
