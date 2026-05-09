import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/store/authStore';
import { useChatStore } from '@/store/chatStore';
import { api, MessageResponse } from '@/services/api';
import { ChatStackParamList } from '@/navigation/ChatNavigator';
import { format } from 'date-fns';

type ThreadRouteProp = RouteProp<ChatStackParamList, 'Thread'>;

const COLORS = {
  primary: '#7C3AED',
  bg: '#FFFFFF',
  text: '#1E293B',
  secondary: '#64748B',
  muted: '#94A3B8',
  border: '#E2E8F0',
  myBubble: '#7C3AED',
  myBubbleText: '#FFFFFF',
  otherBubble: '#F1F5F9',
  otherBubbleText: '#1E293B',
};

export default function ThreadScreen() {
  const navigation = useNavigation();
  const route = useRoute<ThreadRouteProp>();
  const { messageId, conversationId } = route.params;
  const { user } = useAuthStore();
  const { sendMessage } = useChatStore();

  const [parentMessage, setParentMessage] = useState<MessageResponse | null>(null);
  const [replies, setReplies] = useState<MessageResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const fetchThread = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.getThreadReplies(messageId);
      setParentMessage(data.parent);
      setReplies(data.replies || []);
    } catch (err) {
      console.error('Failed to fetch thread:', err);
    } finally {
      setLoading(false);
    }
  }, [messageId]);

  useEffect(() => {
    fetchThread();
  }, [fetchThread]);

  const handleSend = async () => {
    if (!replyText.trim() || sending) return;
    setSending(true);
    try {
      await sendMessage(conversationId, replyText.trim(), messageId);
      setReplyText('');
      await fetchThread();
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 300);
    } catch (err) {
      console.error('Failed to send reply:', err);
    } finally {
      setSending(false);
    }
  };

  const getSenderName = (msg: MessageResponse): string => {
    return msg.sender?.displayName || msg.sender?.username || 'Unknown';
  };

  const getInitial = (name: string) => (name[0] || '?').toUpperCase();

  const renderParent = () => {
    if (!parentMessage) return null;
    const name = getSenderName(parentMessage);
    return (
      <View style={styles.parentContainer}>
        <View style={styles.parentRow}>
          <View style={[styles.avatar, { backgroundColor: COLORS.primary }]}>
            <Text style={styles.avatarText}>{getInitial(name)}</Text>
          </View>
          <View style={styles.parentContent}>
            <View style={styles.parentHeader}>
              <Text style={styles.parentName}>{name}</Text>
              <Text style={styles.parentTime}>
                {format(new Date(parentMessage.createdAt), 'MMM d, h:mm a')}
              </Text>
            </View>
            <Text style={styles.parentText}>{parentMessage.content}</Text>
          </View>
        </View>
        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>
            {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
          </Text>
          <View style={styles.dividerLine} />
        </View>
      </View>
    );
  };

  const renderReply = ({ item }: { item: MessageResponse }) => {
    const isOwn = item.senderId === user?.id;
    const name = getSenderName(item);
    return (
      <View style={[styles.replyRow, isOwn && styles.replyRowOwn]}>
        {!isOwn && (
          <View style={[styles.avatarSm, { backgroundColor: '#94A3B8' }]}>
            <Text style={styles.avatarSmText}>{getInitial(name)}</Text>
          </View>
        )}
        <View style={[styles.replyBubble, isOwn ? styles.ownBubble : styles.otherBubble]}>
          {!isOwn && <Text style={styles.replyBubbleName}>{name}</Text>}
          <Text style={[styles.replyBubbleText, isOwn && { color: COLORS.myBubbleText }]}>
            {item.content}
          </Text>
          <Text style={[styles.replyTime, isOwn && { color: 'rgba(255,255,255,0.7)' }]}>
            {format(new Date(item.createdAt), 'h:mm a')}
          </Text>
        </View>
        {isOwn && (
          <View style={[styles.avatarSm, { backgroundColor: COLORS.primary }]}>
            <Text style={styles.avatarSmText}>{getInitial(name)}</Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Ionicons name="chatbubbles-outline" size={20} color={COLORS.primary} />
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>Thread</Text>
          <Text style={styles.headerSub}>
            {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
          </Text>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={COLORS.primary} />
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={replies}
            keyExtractor={(item) => item.id}
            renderItem={renderReply}
            ListHeaderComponent={renderParent}
            contentContainerStyle={styles.listContent}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
          />
        )}

        {/* Composer */}
        <View style={styles.composer}>
          <TextInput
            style={styles.input}
            value={replyText}
            onChangeText={setReplyText}
            placeholder="Reply in thread..."
            placeholderTextColor={COLORS.muted}
            multiline
            maxLength={5000}
          />
          <TouchableOpacity
            onPress={handleSend}
            disabled={!replyText.trim() || sending}
            style={[styles.sendBtn, (!replyText.trim() || sending) && styles.sendBtnDisabled]}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Ionicons name="send" size={18} color="#FFF" />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backBtn: { padding: 4 },
  headerText: { flex: 1 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  headerSub: { fontSize: 12, color: COLORS.secondary },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { paddingBottom: 16 },
  parentContainer: { padding: 16, borderBottomWidth: 0 },
  parentRow: { flexDirection: 'row', gap: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: '#FFF', fontWeight: '700', fontSize: 16 },
  parentContent: { flex: 1 },
  parentHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  parentName: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  parentTime: { fontSize: 11, color: COLORS.muted },
  parentText: { fontSize: 15, color: COLORS.text, lineHeight: 22 },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16 },
  dividerLine: { flex: 1, height: 1, backgroundColor: COLORS.border },
  dividerText: { fontSize: 12, color: COLORS.muted },
  replyRow: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 4, gap: 8, alignItems: 'flex-end' },
  replyRowOwn: { flexDirection: 'row-reverse' },
  avatarSm: { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  avatarSmText: { color: '#FFF', fontWeight: '600', fontSize: 12 },
  replyBubble: { maxWidth: '75%', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16 },
  ownBubble: { backgroundColor: COLORS.myBubble, borderBottomRightRadius: 4 },
  otherBubble: { backgroundColor: COLORS.otherBubble, borderBottomLeftRadius: 4 },
  replyBubbleName: { fontSize: 12, fontWeight: '600', color: COLORS.primary, marginBottom: 2 },
  replyBubbleText: { fontSize: 15, color: COLORS.otherBubbleText, lineHeight: 20 },
  replyTime: { fontSize: 10, color: COLORS.muted, marginTop: 4, alignSelf: 'flex-end' },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.bg,
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: COLORS.text,
    maxHeight: 100,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtnDisabled: { opacity: 0.5 },
});
