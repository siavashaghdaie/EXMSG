import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useChatStore } from '@/store/chatStore';
import { useAuthStore } from '@/store/authStore';
import { usePresenceStore } from '@/store/presenceStore';
import { socket } from '@/services/socket';
import { ChatStackParamList } from '@/navigation/ChatNavigator';

type ChatRouteProp = RouteProp<ChatStackParamList, 'Chat'>;

const COLORS = {
  primary: '#7C3AED',
  bg: '#FFFFFF',
  chatBg: '#F8FAFC',
  text: '#1E293B',
  secondary: '#64748B',
  muted: '#94A3B8',
  border: '#E2E8F0',
  myBubble: '#7C3AED',
  myBubbleText: '#FFFFFF',
  otherBubble: '#F1F5F9',
  otherBubbleText: '#1E293B',
  green: '#10B981',
  white: '#FFFFFF',
  inputBg: '#F1F5F9',
  red: '#EF4444',
};

function formatMessageTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDateHeader(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / 86400000);

  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return date.toLocaleDateString(undefined, { weekday: 'long' });
  return date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}

export default function ChatScreen() {
  const navigation = useNavigation();
  const route = useRoute<ChatRouteProp>();
  const { conversationId, name } = route.params;

  const currentUser = useAuthStore((s) => s.user);
  const {
    messages: allMessages,
    fetchMessages,
    sendMessage,
    editMessage,
    deleteMessage,
    isLoadingMessages,
    isSending,
    replyingTo,
    setReplyingTo,
    setActiveConversationId,
    typingIndicators,
  } = useChatStore();

  const onlineUsers = usePresenceStore((s) => s.onlineUsers);

  const [inputText, setInputText] = useState('');
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const messages = allMessages.get(conversationId) || [];

  useEffect(() => {
    setActiveConversationId(conversationId);
    socket.joinConversation(conversationId);
    fetchMessages(conversationId);

    return () => {
      socket.leaveConversation(conversationId);
      setActiveConversationId(null);
    };
  }, [conversationId]);

  // Typing indicator logic
  const handleTextChange = (text: string) => {
    setInputText(text);
    if (text.trim()) {
      socket.emitTypingStart(conversationId);
    }
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emitTypingStop(conversationId);
    }, 2000);
  };

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text) return;

    setInputText('');
    socket.emitTypingStop(conversationId);

    try {
      if (editingMessageId) {
        await editMessage(conversationId, editingMessageId, text);
        setEditingMessageId(null);
      } else {
        await sendMessage(conversationId, text, replyingTo?.messageId);
        setReplyingTo(null);
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to send message');
    }
  };

  const handleLongPress = (msg: any) => {
    if (msg.senderId !== currentUser?.id) return;

    Alert.alert('Message Options', undefined, [
      {
        text: 'Edit',
        onPress: () => {
          setEditingMessageId(msg.id);
          setInputText(msg.content || '');
        },
      },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          Alert.alert('Delete Message', 'Are you sure?', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: () => deleteMessage(conversationId, msg.id),
            },
          ]);
        },
      },
      {
        text: 'Reply',
        onPress: () => {
          setReplyingTo({
            messageId: msg.id,
            content: msg.content || '',
            senderName: msg.sender?.displayName || 'Unknown',
          });
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  // Typing indicator display
  const conversationTyping = typingIndicators.get(conversationId) || [];
  const typingNames = conversationTyping
    .filter((t: any) => t.userId !== currentUser?.id)
    .map((t: any) => t.username);

  // Group messages by date for headers
  const renderItem = ({ item, index }: { item: any; index: number }) => {
    const isOwn = item.senderId === currentUser?.id;
    const isDeleted = item.isDeleted;

    // Date header
    const prevMsg = index < messages.length - 1 ? messages[index + 1] : null;
    const showDateHeader = !prevMsg ||
      new Date(item.createdAt).toDateString() !== new Date(prevMsg.createdAt).toDateString();

    return (
      <View>
        {showDateHeader && (
          <View style={styles.dateHeaderContainer}>
            <Text style={styles.dateHeaderText}>{formatDateHeader(item.createdAt)}</Text>
          </View>
        )}

        {/* Reply reference */}
        {item.replyTo && (
          <View style={[styles.replyRef, isOwn ? styles.replyRefOwn : styles.replyRefOther]}>
            <View style={styles.replyBar} />
            <View style={styles.replyContent}>
              <Text style={styles.replyName}>{item.replyTo.sender?.displayName || 'Unknown'}</Text>
              <Text style={styles.replyText} numberOfLines={1}>{item.replyTo.content}</Text>
            </View>
          </View>
        )}

        <TouchableOpacity
          onLongPress={() => handleLongPress(item)}
          activeOpacity={0.8}
          style={[styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleOther]}
        >
          {!isOwn && (
            <Text style={styles.senderName}>
              {item.sender?.displayName || 'Unknown'}
            </Text>
          )}

          {isDeleted ? (
            <Text style={[styles.messageText, styles.deletedText]}>
              This message was deleted
            </Text>
          ) : (
            <>
              <Text style={[styles.messageText, isOwn ? styles.messageTextOwn : styles.messageTextOther]}>
                {item.content}
              </Text>

              {/* Attachments */}
              {item.attachments && item.attachments.length > 0 && (
                <View style={styles.attachmentContainer}>
                  {item.attachments.map((att: any) => (
                    <View key={att.id} style={styles.attachmentItem}>
                      <Text style={styles.attachmentIcon}>
                        {att.mimeType?.startsWith('image/') ? '🖼' : att.mimeType?.startsWith('audio/') ? '🎤' : '📎'}
                      </Text>
                      <Text style={[styles.attachmentName, isOwn && { color: '#E0D5FF' }]} numberOfLines={1}>
                        {att.fileName}
                      </Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Reactions */}
              {item.reactions && item.reactions.length > 0 && (
                <View style={styles.reactionsRow}>
                  {item.reactions.map((r: any, i: number) => (
                    <Text key={i} style={styles.reactionEmoji}>{r.emoji}</Text>
                  ))}
                </View>
              )}
            </>
          )}

          <View style={styles.messageFooter}>
            <Text style={[styles.messageTime, isOwn ? styles.messageTimeOwn : styles.messageTimeOther]}>
              {formatMessageTime(item.createdAt)}
            </Text>
            {item.isEdited && (
              <Text style={[styles.editedLabel, isOwn ? styles.messageTimeOwn : styles.messageTimeOther]}>
                edited
              </Text>
            )}
          </View>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backArrow}>‹</Text>
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.headerName} numberOfLines={1}>{name}</Text>
          {typingNames.length > 0 ? (
            <Text style={styles.headerTyping}>{typingNames.join(', ')} typing...</Text>
          ) : (
            <Text style={styles.headerStatus}>Online</Text>
          )}
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        {/* Messages */}
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          inverted
          contentContainerStyle={styles.messagesList}
          ListEmptyComponent={
            isLoadingMessages ? (
              <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 40 }} />
            ) : (
              <View style={styles.emptyChat}>
                <Text style={styles.emptyChatText}>No messages yet. Say hello!</Text>
              </View>
            )
          }
        />

        {/* Reply preview */}
        {replyingTo && (
          <View style={styles.replyPreview}>
            <View style={styles.replyPreviewBar} />
            <View style={styles.replyPreviewContent}>
              <Text style={styles.replyPreviewName}>{replyingTo.senderName}</Text>
              <Text style={styles.replyPreviewText} numberOfLines={1}>{replyingTo.content}</Text>
            </View>
            <TouchableOpacity onPress={() => setReplyingTo(null)}>
              <Text style={styles.replyPreviewClose}>✕</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Edit indicator */}
        {editingMessageId && (
          <View style={styles.editIndicator}>
            <Text style={styles.editIndicatorText}>Editing message</Text>
            <TouchableOpacity onPress={() => { setEditingMessageId(null); setInputText(''); }}>
              <Text style={styles.editIndicatorClose}>✕</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Composer */}
        <View style={styles.composerContainer}>
          <View style={styles.composer}>
            <TextInput
              style={styles.composerInput}
              placeholder="Type a message..."
              placeholderTextColor={COLORS.muted}
              value={inputText}
              onChangeText={handleTextChange}
              multiline
              maxLength={10000}
            />
            <TouchableOpacity
              style={[styles.sendButton, !inputText.trim() && styles.sendButtonDisabled]}
              onPress={handleSend}
              disabled={!inputText.trim() || isSending}
            >
              {isSending ? (
                <ActivityIndicator size="small" color={COLORS.white} />
              ) : (
                <Text style={styles.sendIcon}>▶</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  flex: { flex: 1 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  backButton: { padding: 4, marginRight: 8 },
  backArrow: { fontSize: 32, color: COLORS.primary, fontWeight: '300' },
  headerInfo: { flex: 1 },
  headerName: { fontSize: 17, fontWeight: '600', color: COLORS.text },
  headerStatus: { fontSize: 12, color: COLORS.green },
  headerTyping: { fontSize: 12, color: COLORS.green, fontStyle: 'italic' },

  // Messages list
  messagesList: { paddingHorizontal: 12, paddingVertical: 8 },
  emptyChat: { alignItems: 'center', paddingTop: 40, transform: [{ scaleY: -1 }] },
  emptyChatText: { fontSize: 14, color: COLORS.muted },

  // Date header
  dateHeaderContainer: {
    alignItems: 'center',
    marginVertical: 12,
    transform: [{ scaleY: -1 }],
  },
  dateHeaderText: {
    fontSize: 12,
    color: COLORS.secondary,
    backgroundColor: COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 10,
    overflow: 'hidden',
  },

  // Bubbles
  bubble: {
    maxWidth: '78%',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    marginVertical: 2,
    transform: [{ scaleY: -1 }],
  },
  bubbleOwn: {
    alignSelf: 'flex-end',
    backgroundColor: COLORS.myBubble,
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.otherBubble,
    borderBottomLeftRadius: 4,
  },
  senderName: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.primary,
    marginBottom: 2,
  },
  messageText: { fontSize: 15, lineHeight: 20 },
  messageTextOwn: { color: COLORS.myBubbleText },
  messageTextOther: { color: COLORS.otherBubbleText },
  deletedText: { fontStyle: 'italic', color: COLORS.muted },

  // Attachments
  attachmentContainer: { marginTop: 6 },
  attachmentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.1)',
    borderRadius: 8,
    padding: 6,
    marginTop: 4,
  },
  attachmentIcon: { fontSize: 16, marginRight: 6 },
  attachmentName: { fontSize: 12, color: COLORS.secondary, flex: 1 },

  // Reactions
  reactionsRow: { flexDirection: 'row', marginTop: 4, gap: 2 },
  reactionEmoji: { fontSize: 16 },

  // Message footer
  messageFooter: { flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 4 },
  messageTime: { fontSize: 10 },
  messageTimeOwn: { color: 'rgba(255,255,255,0.7)' },
  messageTimeOther: { color: COLORS.muted },
  editedLabel: { fontSize: 10, fontStyle: 'italic' },

  // Reply reference (in bubble)
  replyRef: { marginBottom: 4, marginHorizontal: 12, transform: [{ scaleY: -1 }] },
  replyRefOwn: { alignSelf: 'flex-end' },
  replyRefOther: { alignSelf: 'flex-start' },
  replyBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    backgroundColor: COLORS.primary,
    borderRadius: 2,
  },
  replyContent: { paddingLeft: 10 },
  replyName: { fontSize: 11, fontWeight: '600', color: COLORS.primary },
  replyText: { fontSize: 11, color: COLORS.secondary },

  // Reply preview (above composer)
  replyPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0EAFF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  replyPreviewBar: { width: 3, height: 32, backgroundColor: COLORS.primary, borderRadius: 2, marginRight: 8 },
  replyPreviewContent: { flex: 1 },
  replyPreviewName: { fontSize: 12, fontWeight: '600', color: COLORS.primary },
  replyPreviewText: { fontSize: 12, color: COLORS.secondary },
  replyPreviewClose: { fontSize: 18, color: COLORS.muted, paddingLeft: 8 },

  // Edit indicator
  editIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFF7ED',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  editIndicatorText: { fontSize: 12, color: '#F59E0B', fontWeight: '500' },
  editIndicatorClose: { fontSize: 18, color: COLORS.muted },

  // Composer
  composerContainer: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.white,
    paddingHorizontal: 12,
    paddingVertical: 8,
    paddingBottom: Platform.OS === 'ios' ? 8 : 8,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: COLORS.inputBg,
    borderRadius: 24,
    paddingLeft: 16,
    paddingRight: 4,
    paddingVertical: 4,
  },
  composerInput: {
    flex: 1,
    fontSize: 16,
    color: COLORS.text,
    maxHeight: 100,
    paddingVertical: 8,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 2,
  },
  sendButtonDisabled: { backgroundColor: COLORS.muted },
  sendIcon: { color: COLORS.white, fontSize: 14 },
});
