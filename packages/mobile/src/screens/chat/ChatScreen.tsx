import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
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
  Pressable,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useChatStore } from '@/store/chatStore';
import { useAuthStore } from '@/store/authStore';
import { usePresenceStore } from '@/store/presenceStore';
import { socket } from '@/services/socket';
import { api } from '@/services/api';
import { ChatStackParamList } from '@/navigation/ChatNavigator';
import { callService } from '@/services/callService';

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
  lindaPurple: '#8B5CF6',
  green: '#10B981',
  white: '#FFFFFF',
  inputBg: '#F1F5F9',
  red: '#EF4444',
};

// Strip Linda action tags from message content
function stripActionTags(content: string): string {
  if (!content) return '';
  return content
    .replace(/\[SEND_MESSAGE\][\s\S]*?\[\/SEND_MESSAGE\]/g, '')
    .replace(/\[ASSIGN_TASK\][\s\S]*?\[\/ASSIGN_TASK\]/g, '')
    .replace(/\[UPDATE_TASK\][\s\S]*?\[\/UPDATE_TASK\]/g, '')
    .replace(/\[CREATE_ANNOUNCEMENT\][\s\S]*?\[\/CREATE_ANNOUNCEMENT\]/g, '')
    .trim();
}

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

// Suggestion chips for Linda
const LINDA_SUGGESTIONS = [
  'What are my tasks?',
  'Summarize today\'s activity',
  'Create a new task',
  'Who is online?',
];

export default function ChatScreen() {
  const navigation = useNavigation();
  const route = useRoute<ChatRouteProp>();
  const { conversationId, name, isLinda } = route.params;

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
  const [lindaThinking, setLindaThinking] = useState(false);
  const [rightButtonMode, setRightButtonMode] = useState<'mic' | 'camera'>('mic');
  const [attachedFile, setAttachedFile] = useState<any>(null);
  const flatListRef = useRef<FlatList>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);

  const messagesAsc = allMessages.get(conversationId) || [];
  // Store keeps messages in ASC order (oldest first, same as web).
  // Inverted FlatList needs DESC order (newest at index 0 = bottom of screen).
  const messages = useMemo(() => [...messagesAsc].reverse(), [messagesAsc]);

  // Load Linda messages from Linda API, or regular messages from messaging API
  const loadLindaMessages = useCallback(async () => {
    try {
      const result = await api.getLindaConversations();
      const conversations = result?.conversations || [];
      const ownConv = conversations.find((c: any) => c.isOwn) || conversations[0];
      if (ownConv) {
        const data = await api.getLindaConversationMessages(ownConv.id);
        const lindaMsgs = (data.messages || []).map((m: any) => ({
          id: m.id,
          conversationId,
          senderId: m.role === 'user' ? (currentUser?.id || 'user') : 'linda',
          content: m.role === 'assistant' ? stripActionTags(m.content) : m.content,
          type: 'TEXT',
          reactions: {},
          createdAt: m.createdAt,
          sender: m.role === 'user'
            ? { id: currentUser?.id || '', username: currentUser?.username || '', displayName: currentUser?.displayName || '' }
            : { id: 'linda', username: 'linda', displayName: 'Linda' },
        }));
        const store = useChatStore.getState();
        const updated = new Map(store.messages);
        updated.set(conversationId, lindaMsgs);
        useChatStore.setState({ messages: updated, isLoadingMessages: false });
      }
    } catch (err) {
      console.error('[ChatScreen] Failed to load Linda messages:', err);
      // Fall back to regular messages
      fetchMessages(conversationId);
    }
  }, [conversationId, currentUser]);

  useEffect(() => {
    setActiveConversationId(conversationId);
    if (!isLinda) {
      socket.joinConversation(conversationId);
    }
    if (isLinda) {
      useChatStore.setState({ isLoadingMessages: true });
      loadLindaMessages();
    } else {
      fetchMessages(conversationId);
    }

    return () => {
      if (!isLinda) {
        socket.leaveConversation(conversationId);
      }
      setActiveConversationId(null);
    };
  }, [conversationId, isLinda]);

  // Typing indicator logic (not for Linda conversations)
  const handleTextChange = (text: string) => {
    setInputText(text);
    if (!isLinda && text.trim()) {
      socket.emitTypingStart(conversationId);
    }
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    if (!isLinda) {
      typingTimeoutRef.current = setTimeout(() => {
        socket.emitTypingStop(conversationId);
      }, 2000);
    }
  };

  // Attachment (paperclip) handler
  const handleAttachment = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const file = result.assets[0];
        setAttachedFile({
          uri: file.uri,
          name: file.name,
          mimeType: file.mimeType || 'application/octet-stream',
          size: file.size,
        });
      }
    } catch (err) {
      console.error('[ChatScreen] Document picker error:', err);
    }
  }, []);

  // Right button press: toggle between mic and camera
  const handleRightButtonPress = useCallback(() => {
    setRightButtonMode((prev) => (prev === 'mic' ? 'camera' : 'mic'));
  }, []);

  // Right button long press: activate mic or camera mode
  const handleRightButtonLongPress = useCallback(async () => {
    if (rightButtonMode === 'camera') {
      try {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission needed', 'Please grant access to your photo library.');
          return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images', 'videos'],
          quality: 0.8,
          allowsEditing: false,
        });
        if (!result.canceled && result.assets && result.assets.length > 0) {
          const asset = result.assets[0];
          const fileName = asset.uri.split('/').pop() || 'media';
          setAttachedFile({
            uri: asset.uri,
            name: fileName,
            mimeType: asset.type === 'video' ? 'video/mp4' : 'image/jpeg',
            size: asset.fileSize,
          });
        }
      } catch (err) {
        console.error('[ChatScreen] Image picker error:', err);
      }
    } else {
      // Mic mode - placeholder for voice recording
      Alert.alert('Voice Message', 'Voice recording coming soon. Long press to record.');
    }
  }, [rightButtonMode]);

  const handleRemoveAttachment = useCallback(() => {
    setAttachedFile(null);
  }, []);

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text) return;

    setInputText('');
    setAttachedFile(null);
    if (!isLinda) {
      socket.emitTypingStop(conversationId);
    }

    try {
      if (editingMessageId) {
        await editMessage(conversationId, editingMessageId, text);
        setEditingMessageId(null);
      } else if (isLinda) {
        // For Linda conversations, use Linda API directly (not regular messaging)
        // to avoid action-generated messages being re-fetched into the conversation
        setLindaThinking(true);
        try {
          // Add user message locally
          const userMsgId = `user-${Date.now()}`;
          const userMsg = {
            id: userMsgId,
            conversationId,
            senderId: currentUser?.id || '',
            content: text,
            type: 'TEXT',
            reactions: {},
            createdAt: new Date().toISOString(),
            sender: {
              id: currentUser?.id || '',
              username: currentUser?.username || '',
              displayName: currentUser?.displayName || currentUser?.username || '',
            },
          };
          // Add to store (ASC order = append)
          const store = useChatStore.getState();
          const currentMsgs = store.messages.get(conversationId) || [];
          const updatedMsgs = new Map(store.messages);
          updatedMsgs.set(conversationId, [...currentMsgs, userMsg]);
          useChatStore.setState({ messages: updatedMsgs });

          // Call Linda's AI API
          const response = await api.chatWithLinda(text, conversationId);

          // Add Linda's response locally (don't re-fetch entire conversation)
          const lindaResponse = stripActionTags(response.response || '');
          if (lindaResponse) {
            const lindaMsgId = `linda-${Date.now()}`;
            const lindaMsg = {
              id: lindaMsgId,
              conversationId,
              senderId: 'linda',
              content: lindaResponse,
              type: 'TEXT',
              reactions: {},
              createdAt: new Date().toISOString(),
              sender: {
                id: 'linda',
                username: 'linda',
                displayName: 'Linda',
              },
            };
            const storeNow = useChatStore.getState();
            const msgsNow = storeNow.messages.get(conversationId) || [];
            const updatedNow = new Map(storeNow.messages);
            updatedNow.set(conversationId, [...msgsNow, lindaMsg]);
            useChatStore.setState({ messages: updatedNow });
          }
          setLindaThinking(false);
        } catch (err) {
          setLindaThinking(false);
          Alert.alert('Error', 'Linda could not respond. Please try again.');
        }
      } else {
        await sendMessage(conversationId, text, replyingTo?.messageId);
        setReplyingTo(null);
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to send message');
    }
  };

  const handleSuggestionPress = (suggestion: string) => {
    setInputText(suggestion);
  };

  const handleLongPress = (msg: any) => {
    // For Linda conversations, only allow reply (no edit/delete on Linda messages)
    if (isLinda) {
      if (msg.senderId === currentUser?.id) {
        Alert.alert('Message Options', undefined, [
          {
            text: 'Reply',
            onPress: () => {
              setReplyingTo({
                messageId: msg.id,
                content: msg.content || '',
                senderName: 'You',
              });
            },
          },
          { text: 'Cancel', style: 'cancel' },
        ]);
      }
      return;
    }

    if (msg.senderId !== currentUser?.id) {
      // Allow reply on other people's messages too
      Alert.alert('Message Options', undefined, [
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
      return;
    }

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

    // For Linda messages, strip action tags
    const displayContent = isLinda && !isOwn
      ? stripActionTags(item.content)
      : item.content;

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
          style={[
            styles.bubble,
            isOwn ? styles.bubbleOwn : styles.bubbleOther,
            isLinda && !isOwn && styles.bubbleLinda,
          ]}
        >
          {!isOwn && !isLinda && (
            <Text style={styles.senderName}>
              {item.sender?.displayName || 'Unknown'}
            </Text>
          )}
          {!isOwn && isLinda && (
            <View style={styles.lindaSenderRow}>
              <View style={styles.lindaMiniAvatar}>
                <Text style={styles.lindaMiniAvatarText}>AI</Text>
              </View>
              <Text style={styles.lindaSenderName}>Linda</Text>
            </View>
          )}

          {isDeleted ? (
            <Text style={[styles.messageText, styles.deletedText]}>
              This message was deleted
            </Text>
          ) : (
            <>
              <Text style={[styles.messageText, isOwn ? styles.messageTextOwn : styles.messageTextOther]}>
                {displayContent}
              </Text>

              {/* Attachments */}
              {item.attachments && item.attachments.length > 0 && (
                <View style={styles.attachmentContainer}>
                  {item.attachments.map((att: any) => (
                    <View key={att.id} style={styles.attachmentItem}>
                      <Text style={styles.attachmentIcon}>
                        {att.mimeType?.startsWith('image/') ? '\uD83D\uDDBC' : att.mimeType?.startsWith('audio/') ? '\uD83C\uDFA4' : '\uD83D\uDCCE'}
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

  // Linda thinking indicator component
  const renderLindaThinking = () => {
    if (!lindaThinking) return null;
    return (
      <View style={[styles.bubble, styles.bubbleOther, styles.bubbleLinda]}>
        <View style={styles.lindaSenderRow}>
          <View style={styles.lindaMiniAvatar}>
            <Text style={styles.lindaMiniAvatarText}>AI</Text>
          </View>
          <Text style={styles.lindaSenderName}>Linda is thinking...</Text>
        </View>
        <ActivityIndicator size="small" color={COLORS.lindaPurple} style={{ marginTop: 4 }} />
      </View>
    );
  };

  // Find the other user in DM conversations for online status
  const conversations = useChatStore((s) => s.conversations);
  const lastSeenMap = usePresenceStore((s) => s.lastSeen);
  const otherUserId = useMemo(() => {
    if (isLinda || !currentUser) return null;
    const conv = conversations.find((c: any) => c.id === conversationId);
    if (!conv) return null;
    const participants = (conv as any).participants || (conv as any).members || [];
    if (participants.length !== 2) return null; // group chat
    const other = participants.find((p: any) => p.id !== currentUser.id);
    return other?.id || null;
  }, [conversations, conversationId, currentUser, isLinda]);

  const isOtherOnline = otherUserId ? onlineUsers.has(otherUserId) : false;

  // Get other user details for call initiation
  const otherUser = useMemo(() => {
    if (isLinda || !currentUser) return null;
    const conv = conversations.find((c: any) => c.id === conversationId);
    if (!conv) return null;
    const participants = (conv as any).participants || (conv as any).members || [];
    if (participants.length !== 2) return null;
    return participants.find((p: any) => p.id !== currentUser.id) || null;
  }, [conversations, conversationId, currentUser, isLinda]);

  const handleCall = (callType: 'audio' | 'video') => {
    if (!otherUser) return;
    callService.initiateCall(
      conversationId,
      otherUser.id,
      otherUser.displayName || otherUser.username || name,
      callType,
      otherUser.avatar || otherUser.avatarUrl || null,
    );
  };
  const otherLastSeen = otherUserId && !isOtherOnline
    ? (lastSeenMap instanceof Map ? lastSeenMap.get(otherUserId) : undefined)
    : undefined;

  // Header subtitle
  const getHeaderSubtitle = () => {
    if (typingNames.length > 0) {
      return <Text style={styles.headerTyping}>{typingNames.join(', ')} typing...</Text>;
    }
    if (isLinda) {
      return <Text style={styles.headerStatusLinda}>AI Secretary</Text>;
    }
    if (isOtherOnline) {
      return <Text style={styles.headerStatus}>Online</Text>;
    }
    if (otherLastSeen) {
      const date = new Date(otherLastSeen);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);
      let lastSeenStr = '';
      if (diffMins < 1) lastSeenStr = 'Last seen just now';
      else if (diffMins < 60) lastSeenStr = `Last seen ${diffMins}m ago`;
      else if (diffHours < 24) lastSeenStr = `Last seen ${diffHours}h ago`;
      else if (diffDays === 1) lastSeenStr = 'Last seen yesterday';
      else lastSeenStr = `Last seen ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
      return <Text style={styles.headerStatusOffline}>{lastSeenStr}</Text>;
    }
    // Group chat or no info
    return <Text style={styles.headerStatusOffline}>Offline</Text>;
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backArrow}>{'\u2039'}</Text>
        </TouchableOpacity>
        {isLinda && (
          <View style={styles.headerLindaAvatar}>
            <Text style={styles.headerLindaAvatarText}>AI</Text>
          </View>
        )}
        <TouchableOpacity
          style={styles.headerInfo}
          activeOpacity={isLinda ? 1 : 0.6}
          onPress={() => {
            if (!isLinda) {
              navigation.navigate('ChatSettings' as any, { conversationId, name });
            }
          }}
        >
          <View style={styles.headerNameRow}>
            <Text style={styles.headerName} numberOfLines={1}>
              {isLinda ? 'Linda' : name}
            </Text>
            {isLinda && (
              <View style={styles.headerAiBadge}>
                <Text style={styles.headerAiBadgeText}>AI</Text>
              </View>
            )}
          </View>
          {getHeaderSubtitle()}
        </TouchableOpacity>

        {/* Call buttons — only for DM chats (not Linda, not group) */}
        {otherUser && !isLinda && (
          <View style={styles.headerCallButtons}>
            <TouchableOpacity
              style={styles.headerCallBtn}
              onPress={() => handleCall('audio')}
              activeOpacity={0.6}
            >
              <Text style={styles.headerCallIcon}>📞</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerCallBtn}
              onPress={() => handleCall('video')}
              activeOpacity={0.6}
            >
              <Text style={styles.headerCallIcon}>📹</Text>
            </TouchableOpacity>
          </View>
        )}
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
          ListHeaderComponent={renderLindaThinking}
          ListEmptyComponent={
            isLoadingMessages ? (
              <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 40 }} />
            ) : (
              <View style={styles.emptyChat}>
                {isLinda ? (
                  <View style={styles.lindaGreeting}>
                    <View style={styles.lindaGreetingAvatar}>
                      <Text style={styles.lindaGreetingAvatarText}>AI</Text>
                    </View>
                    <Text style={styles.lindaGreetingTitle}>Hi! I'm Linda</Text>
                    <Text style={styles.lindaGreetingSubtitle}>
                      Your AI secretary. I can help with tasks, announcements, messages, and more.
                    </Text>
                    <View style={styles.suggestionsContainer}>
                      {LINDA_SUGGESTIONS.map((s, i) => (
                        <TouchableOpacity
                          key={i}
                          style={styles.suggestionChip}
                          onPress={() => handleSuggestionPress(s)}
                        >
                          <Text style={styles.suggestionText}>{s}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                ) : (
                  <Text style={styles.emptyChatText}>No messages yet. Say hello!</Text>
                )}
              </View>
            )
          }
        />

        {/* Linda suggestion chips (when messages exist but few) */}
        {isLinda && messages.length > 0 && messages.length < 3 && (
          <View style={styles.inlineSuggestions}>
            {LINDA_SUGGESTIONS.slice(0, 2).map((s, i) => (
              <TouchableOpacity
                key={i}
                style={styles.inlineSuggestionChip}
                onPress={() => handleSuggestionPress(s)}
              >
                <Text style={styles.inlineSuggestionText}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Reply preview */}
        {replyingTo && (
          <View style={styles.replyPreview}>
            <View style={styles.replyPreviewBar} />
            <View style={styles.replyPreviewContent}>
              <Text style={styles.replyPreviewName}>{replyingTo.senderName}</Text>
              <Text style={styles.replyPreviewText} numberOfLines={1}>{replyingTo.content}</Text>
            </View>
            <TouchableOpacity onPress={() => setReplyingTo(null)}>
              <Text style={styles.replyPreviewClose}>{'\u2715'}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Edit indicator */}
        {editingMessageId && (
          <View style={styles.editIndicator}>
            <Text style={styles.editIndicatorText}>Editing message</Text>
            <TouchableOpacity onPress={() => { setEditingMessageId(null); setInputText(''); }}>
              <Text style={styles.editIndicatorClose}>{'\u2715'}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Attached file preview */}
        {attachedFile && (
          <View style={styles.attachmentPreview}>
            <Text style={styles.attachmentPreviewIcon}>
              {attachedFile.mimeType?.startsWith('image/') ? '\uD83D\uDDBC' :
               attachedFile.mimeType?.startsWith('video/') ? '\uD83C\uDFA5' :
               attachedFile.mimeType?.startsWith('audio/') ? '\uD83C\uDFA4' : '\uD83D\uDCCE'}
            </Text>
            <Text style={styles.attachmentPreviewName} numberOfLines={1}>{attachedFile.name}</Text>
            <TouchableOpacity onPress={handleRemoveAttachment} style={styles.attachmentPreviewClose}>
              <Text style={styles.attachmentPreviewCloseText}>{'\u2715'}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Composer */}
        <View style={styles.composerContainer}>
          <View style={styles.composer}>
            {/* Attachment (paperclip) button */}
            <TouchableOpacity
              style={styles.composerActionButton}
              onPress={handleAttachment}
              activeOpacity={0.6}
            >
              <Text style={styles.composerActionIcon}>{'\uD83D\uDCCE'}</Text>
            </TouchableOpacity>

            <TextInput
              style={styles.composerInput}
              placeholder={isLinda ? 'Ask Linda anything...' : 'Type a message...'}
              placeholderTextColor={COLORS.muted}
              value={inputText}
              onChangeText={handleTextChange}
              multiline
              maxLength={10000}
            />

            {/* Right side: Send button (when text/file present) or Mic/Camera toggle */}
            {(inputText.trim() || attachedFile) ? (
              <TouchableOpacity
                style={[styles.sendButton]}
                onPress={handleSend}
                disabled={isSending || lindaThinking}
                activeOpacity={0.7}
              >
                {(isSending || lindaThinking) ? (
                  <ActivityIndicator size="small" color={COLORS.white} />
                ) : (
                  <Text style={styles.sendIcon}>{'\u25B6'}</Text>
                )}
              </TouchableOpacity>
            ) : (
              <Pressable
                style={styles.composerActionButton}
                onPress={handleRightButtonPress}
                onLongPress={handleRightButtonLongPress}
                delayLongPress={500}
              >
                <Text style={styles.composerActionIcon}>
                  {rightButtonMode === 'mic' ? '\uD83C\uDFA4' : '\uD83D\uDCF7'}
                </Text>
              </Pressable>
            )}
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
  headerLindaAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.lindaPurple,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  headerLindaAvatarText: { color: COLORS.white, fontSize: 12, fontWeight: '700' },
  headerInfo: { flex: 1 },
  headerNameRow: { flexDirection: 'row', alignItems: 'center' },
  headerName: { fontSize: 17, fontWeight: '600', color: COLORS.text },
  headerAiBadge: {
    backgroundColor: COLORS.lindaPurple,
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 1,
    marginLeft: 6,
  },
  headerAiBadgeText: { color: COLORS.white, fontSize: 9, fontWeight: '700' },
  headerStatus: { fontSize: 12, color: COLORS.green },
  headerStatusOffline: { fontSize: 12, color: COLORS.muted },
  headerStatusLinda: { fontSize: 12, color: COLORS.lindaPurple },
  headerCallButtons: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 8 },
  headerCallBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: COLORS.inputBg, justifyContent: 'center', alignItems: 'center' },
  headerCallIcon: { fontSize: 18 },
  headerTyping: { fontSize: 12, color: COLORS.green, fontStyle: 'italic' },

  // Messages list
  messagesList: { paddingHorizontal: 12, paddingVertical: 8 },
  emptyChat: { alignItems: 'center', paddingTop: 40, transform: [{ scaleY: -1 }] },
  emptyChatText: { fontSize: 14, color: COLORS.muted },

  // Linda greeting
  lindaGreeting: { alignItems: 'center', paddingHorizontal: 20 },
  lindaGreetingAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.lindaPurple,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  lindaGreetingAvatarText: { color: COLORS.white, fontSize: 22, fontWeight: '700' },
  lindaGreetingTitle: { fontSize: 20, fontWeight: '700', color: COLORS.text, marginBottom: 6 },
  lindaGreetingSubtitle: { fontSize: 14, color: COLORS.secondary, textAlign: 'center', marginBottom: 16 },
  suggestionsContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  suggestionChip: {
    backgroundColor: '#F0EAFF',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: COLORS.lindaPurple + '30',
  },
  suggestionText: { fontSize: 13, color: COLORS.lindaPurple, fontWeight: '500' },

  // Inline suggestions
  inlineSuggestions: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 8,
  },
  inlineSuggestionChip: {
    backgroundColor: '#F0EAFF',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: COLORS.lindaPurple + '30',
  },
  inlineSuggestionText: { fontSize: 12, color: COLORS.lindaPurple, fontWeight: '500' },

  // Date header
  dateHeaderContainer: {
    alignItems: 'center',
    marginVertical: 12,

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
  bubbleLinda: {
    backgroundColor: '#F5F0FF',
    borderLeftWidth: 3,
    borderLeftColor: COLORS.lindaPurple,
  },
  lindaSenderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  lindaMiniAvatar: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: COLORS.lindaPurple,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 6,
  },
  lindaMiniAvatarText: { color: COLORS.white, fontSize: 8, fontWeight: '700' },
  lindaSenderName: { fontSize: 12, fontWeight: '600', color: COLORS.lindaPurple },
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

  // Attachment preview
  attachmentPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0EAFF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    gap: 8,
  },
  attachmentPreviewIcon: { fontSize: 18 },
  attachmentPreviewName: { flex: 1, fontSize: 13, color: COLORS.text },
  attachmentPreviewClose: { padding: 4 },
  attachmentPreviewCloseText: { fontSize: 16, color: COLORS.muted },

  // Composer
  composerContainer: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.white,
    paddingHorizontal: 8,
    paddingVertical: 8,
    paddingBottom: Platform.OS === 'ios' ? 8 : 8,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: COLORS.inputBg,
    borderRadius: 24,
    paddingLeft: 4,
    paddingRight: 4,
    paddingVertical: 4,
    gap: 4,
  },
  composerActionButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 2,
  },
  composerActionIcon: {
    fontSize: 20,
  },
  composerInput: {
    flex: 1,
    fontSize: 16,
    color: COLORS.text,
    maxHeight: 100,
    paddingVertical: 8,
    paddingHorizontal: 4,
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
  sendIcon: { color: COLORS.white, fontSize: 14 },
});
