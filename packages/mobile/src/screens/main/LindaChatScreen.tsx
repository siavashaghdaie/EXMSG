import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  ActivityIndicator,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { api, RNFileDescriptor } from '@/services/api';
import { useAuthStore } from '@/store/authStore';

// ─── Types ───────────────────────────────────────────────────────────────────

interface LindaMessageData {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  hasAttachment?: boolean;
  attachmentName?: string;
  createdAt: string;
}

interface LindaConversationSummary {
  id: string;
  title?: string;
  lastMessage?: string | { content: string; role: string; createdAt: string };
  updatedAt: string;
}

interface LindaAction {
  type: string;
  label: string;
  [key: string]: unknown;
}

interface LindaGeneratedFile {
  name: string;
  url: string;
  [key: string]: unknown;
}

interface ChatMessage extends LindaMessageData {
  actions?: LindaAction[];
  generatedFiles?: LindaGeneratedFile[];
}

// ─── Constants ───────────────────────────────────────────────────────────────

const PURPLE = '#6C47FF';
const PURPLE_LIGHT = '#EDE8FF';
const GRAY_BG = '#f0f0f0';

// ─── Typing Dots Component ───────────────────────────────────────────────────

function TypingIndicator() {
  const [dotCount, setDotCount] = useState(1);

  useEffect(() => {
    const interval = setInterval(() => {
      setDotCount((prev) => (prev % 3) + 1);
    }, 400);
    return () => clearInterval(interval);
  }, []);

  return (
    <View style={styles.typingContainer}>
      <View style={styles.assistantBubble}>
        <Text style={styles.typingText}>
          Linda is thinking{'.'.repeat(dotCount)}
        </Text>
      </View>
    </View>
  );
}

// ─── Suggestion Chip ─────────────────────────────────────────────────────────

function SuggestionChip({
  text,
  onPress,
}: {
  text: string;
  onPress: (text: string) => void;
}) {
  return (
    <TouchableOpacity
      style={styles.suggestionChip}
      onPress={() => onPress(text)}
      activeOpacity={0.7}
    >
      <Text style={styles.suggestionChipText}>{text}</Text>
    </TouchableOpacity>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function LindaChatScreen() {
  const user = useAuthStore((s) => s.user);

  // Conversation state
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversations, setConversations] = useState<LindaConversationSummary[]>([]);

  // Greeting state
  const [greeting, setGreeting] = useState<string>('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showGreeting, setShowGreeting] = useState(true);

  // Input state
  const [inputText, setInputText] = useState('');
  const [pendingFile, setPendingFile] = useState<RNFileDescriptor | null>(null);

  // Loading / UI state
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const flatListRef = useRef<FlatList>(null);

  // ─── Load initial data ──────────────────────────────────────────────

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [greetingRes, conversationsRes] = await Promise.all([
        api.getLindaGreeting().catch(() => null),
        api.getLindaConversations().catch(() => null),
      ]);

      if (greetingRes) {
        setGreeting(greetingRes.greeting);
        setSuggestions(greetingRes.suggestions ?? []);
      }

      if (conversationsRes?.conversations?.length) {
        setConversations(conversationsRes.conversations);

        // Load the most recent conversation
        const mostRecent = conversationsRes.conversations[0];
        await loadConversation(mostRecent.id);
      }
    } catch (err: any) {
      setError('Failed to connect to Linda. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const loadConversation = async (convId: string) => {
    try {
      const res = await api.getLindaConversationMessages(convId);
      if (res?.messages) {
        setMessages(res.messages as ChatMessage[]);
        setConversationId(convId);
        setShowGreeting(false);
      }
    } catch {
      Alert.alert('Error', 'Failed to load conversation.');
    }
  };

  // ─── New conversation ───────────────────────────────────────────────

  const handleNewConversation = () => {
    setConversationId(null);
    setMessages([]);
    setShowGreeting(true);
    setPendingFile(null);
    setInputText('');
  };

  // ─── File picker ────────────────────────────────────────────────────

  const handlePickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets?.length) {
        const asset = result.assets[0];
        setPendingFile({
          uri: asset.uri,
          name: asset.name,
          type: asset.mimeType ?? 'application/octet-stream',
        });
      }
    } catch {
      Alert.alert('Error', 'Could not pick a file.');
    }
  };

  const clearPendingFile = () => setPendingFile(null);

  // ─── Send message ──────────────────────────────────────────────────

  const handleSend = useCallback(
    async (overrideText?: string) => {
      const text = (overrideText ?? inputText).trim();
      if (!text && !pendingFile) return;
      if (isSending) return;

      setIsSending(true);
      setError(null);
      setShowGreeting(false);

      // Optimistic user message
      const userMsg: ChatMessage = {
        id: `temp-${Date.now()}`,
        role: 'user',
        content: text || (pendingFile ? `📎 ${pendingFile.name}` : ''),
        hasAttachment: !!pendingFile,
        attachmentName: pendingFile?.name,
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [userMsg, ...prev]);
      setInputText('');

      const fileToSend = pendingFile;
      setPendingFile(null);

      try {
        let response: any;

        if (fileToSend) {
          response = await api.chatWithLindaFile(
            fileToSend,
            text || undefined,
            conversationId ?? undefined,
          );
        } else {
          response = await api.chatWithLinda(
            text,
            conversationId ?? undefined,
          );
        }

        if (response.conversationId) {
          setConversationId(response.conversationId);
        }

        const assistantMsg: ChatMessage = {
          id: `resp-${Date.now()}`,
          role: 'assistant',
          content: response.response,
          createdAt: response.timestamp ?? new Date().toISOString(),
          actions: response.actions,
          generatedFiles: response.generatedFiles,
        };

        setMessages((prev) => [assistantMsg, ...prev]);
      } catch (err: any) {
        const errMsg =
          err?.response?.data?.message ??
          err?.message ??
          'Failed to send message. Please try again.';
        setError(errMsg);

        // Remove the optimistic user message on failure
        setMessages((prev) => prev.filter((m) => m.id !== userMsg.id));
      } finally {
        setIsSending(false);
      }
    },
    [inputText, pendingFile, conversationId, isSending],
  );

  const handleSuggestionPress = (text: string) => {
    handleSend(text);
  };

  // ─── Timestamp formatting ──────────────────────────────────────────

  const formatTime = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  // ─── Render helpers ────────────────────────────────────────────────

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isUser = item.role === 'user';

    return (
      <View
        style={[
          styles.messageRow,
          isUser ? styles.messageRowUser : styles.messageRowAssistant,
        ]}
      >
        <View
          style={[
            styles.messageBubble,
            isUser ? styles.userBubble : styles.assistantBubble,
          ]}
        >
          <Text
            style={[
              styles.messageText,
              isUser ? styles.userMessageText : styles.assistantMessageText,
            ]}
          >
            {item.content}
          </Text>

          {/* Attachment badge */}
          {item.hasAttachment && item.attachmentName && (
            <View style={styles.attachmentBadge}>
              <Text style={styles.attachmentBadgeText}>
                📄 {item.attachmentName}
              </Text>
            </View>
          )}

          {/* Actions */}
          {item.actions && item.actions.length > 0 && (
            <View style={styles.actionsRow}>
              {item.actions.map((action, idx) => (
                <View key={idx} style={styles.actionBadge}>
                  <Text style={styles.actionBadgeText}>{action.label}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Generated files */}
          {item.generatedFiles && item.generatedFiles.length > 0 && (
            <View style={styles.generatedFilesContainer}>
              <Text style={styles.generatedFilesTitle}>Generated Files:</Text>
              {item.generatedFiles.map((file, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={styles.generatedFileLink}
                  onPress={() =>
                    Alert.alert('Download', `Download ${file.name}?`, [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'OK' },
                    ])
                  }
                >
                  <Text style={styles.generatedFileLinkText}>
                    📄 {file.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <Text
            style={[
              styles.timestamp,
              isUser ? styles.userTimestamp : styles.assistantTimestamp,
            ]}
          >
            {formatTime(item.createdAt)}
          </Text>
        </View>
      </View>
    );
  };

  const renderGreeting = () => (
    <View style={styles.greetingContainer}>
      <View style={styles.greetingIconWrapper}>
        <Text style={styles.greetingIcon}>🤖</Text>
      </View>
      <Text style={styles.greetingText}>
        {greeting || `Hi${user?.username ? ` ${user.username}` : ''}! I'm Linda, your AI assistant.`}
      </Text>
      {suggestions.length > 0 && (
        <View style={styles.suggestionsContainer}>
          <Text style={styles.suggestionsLabel}>Try asking:</Text>
          {suggestions.map((s, idx) => (
            <SuggestionChip key={idx} text={s} onPress={handleSuggestionPress} />
          ))}
        </View>
      )}
    </View>
  );

  // ─── Loading screen ────────────────────────────────────────────────

  if (isLoading) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>🤖 Linda AI</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={PURPLE} />
          <Text style={styles.loadingText}>Connecting to Linda...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ─── Main render ───────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.screen}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>🤖 Linda AI</Text>
        <TouchableOpacity
          style={styles.newChatButton}
          onPress={handleNewConversation}
          activeOpacity={0.7}
        >
          <Text style={styles.newChatButtonText}>💬 New</Text>
        </TouchableOpacity>
      </View>

      {/* Error banner */}
      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={() => setError(null)}>
            <Text style={styles.errorDismiss}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      <KeyboardAvoidingView
        style={styles.flex1}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        {/* Chat area */}
        {showGreeting && messages.length === 0 ? (
          <View style={styles.greetingWrapper}>{renderGreeting()}</View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            renderItem={renderMessage}
            keyExtractor={(item) => item.id}
            inverted
            contentContainerStyle={styles.messagesList}
            ListHeaderComponent={isSending ? <TypingIndicator /> : null}
            showsVerticalScrollIndicator={false}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
          />
        )}

        {/* Pending file indicator */}
        {pendingFile && (
          <View style={styles.pendingFileBar}>
            <Text style={styles.pendingFileName} numberOfLines={1}>
              📎 {pendingFile.name}
            </Text>
            <TouchableOpacity onPress={clearPendingFile}>
              <Text style={styles.pendingFileRemove}>✕</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Input bar */}
        <View style={styles.inputBar}>
          <TouchableOpacity
            style={styles.attachButton}
            onPress={handlePickFile}
            disabled={isSending}
            activeOpacity={0.6}
          >
            <Text style={[styles.attachIcon, isSending && styles.disabledText]}>
              📎
            </Text>
          </TouchableOpacity>

          <TextInput
            style={styles.textInput}
            value={inputText}
            onChangeText={setInputText}
            placeholder="Message Linda..."
            placeholderTextColor="#999"
            multiline
            maxLength={4000}
            editable={!isSending}
            onSubmitEditing={() => handleSend()}
            blurOnSubmit={false}
          />

          <TouchableOpacity
            style={[
              styles.sendButton,
              (!inputText.trim() && !pendingFile) || isSending
                ? styles.sendButtonDisabled
                : null,
            ]}
            onPress={() => handleSend()}
            disabled={(!inputText.trim() && !pendingFile) || isSending}
            activeOpacity={0.7}
          >
            {isSending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.sendButtonText}>Send</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#fff',
  },
  flex1: {
    flex: 1,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e0e0e0',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: PURPLE,
  },
  newChatButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: PURPLE_LIGHT,
  },
  newChatButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: PURPLE,
  },

  // Error banner
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF0F0',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ffcccc',
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    color: '#cc0000',
  },
  errorDismiss: {
    fontSize: 16,
    color: '#cc0000',
    paddingLeft: 12,
    fontWeight: '700',
  },

  // Loading
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 15,
    color: '#666',
  },

  // Greeting
  greetingWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  greetingContainer: {
    alignItems: 'center',
    maxWidth: 340,
  },
  greetingIconWrapper: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: PURPLE_LIGHT,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  greetingIcon: {
    fontSize: 36,
  },
  greetingText: {
    fontSize: 17,
    color: '#333',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
  },
  suggestionsContainer: {
    alignItems: 'center',
    width: '100%',
  },
  suggestionsLabel: {
    fontSize: 13,
    color: '#888',
    marginBottom: 10,
    fontWeight: '600',
  },
  suggestionChip: {
    backgroundColor: PURPLE_LIGHT,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: PURPLE,
    width: '100%',
    alignItems: 'center',
  },
  suggestionChipText: {
    color: PURPLE,
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },

  // Messages list
  messagesList: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  messageRow: {
    marginVertical: 3,
    maxWidth: '82%',
  },
  messageRowUser: {
    alignSelf: 'flex-end',
  },
  messageRowAssistant: {
    alignSelf: 'flex-start',
  },
  messageBubble: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  userBubble: {
    backgroundColor: PURPLE,
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    backgroundColor: GRAY_BG,
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 21,
  },
  userMessageText: {
    color: '#fff',
  },
  assistantMessageText: {
    color: '#222',
  },
  timestamp: {
    fontSize: 11,
    marginTop: 4,
  },
  userTimestamp: {
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'right',
  },
  assistantTimestamp: {
    color: '#999',
  },

  // Attachment badge inside bubble
  attachmentBadge: {
    backgroundColor: 'rgba(0,0,0,0.08)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginTop: 6,
    alignSelf: 'flex-start',
  },
  attachmentBadgeText: {
    fontSize: 12,
    color: '#555',
  },

  // Actions
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
    gap: 6,
  },
  actionBadge: {
    backgroundColor: PURPLE_LIGHT,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  actionBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: PURPLE,
  },

  // Generated files
  generatedFilesContainer: {
    marginTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#ddd',
    paddingTop: 6,
  },
  generatedFilesTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginBottom: 4,
  },
  generatedFileLink: {
    paddingVertical: 4,
  },
  generatedFileLinkText: {
    fontSize: 13,
    color: PURPLE,
    fontWeight: '500',
    textDecorationLine: 'underline',
  },

  // Typing indicator
  typingContainer: {
    alignSelf: 'flex-start',
    marginVertical: 3,
    marginHorizontal: 0,
  },
  typingText: {
    fontSize: 14,
    color: '#888',
    fontStyle: 'italic',
  },

  // Pending file bar
  pendingFileBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: PURPLE_LIGHT,
    marginHorizontal: 12,
    marginBottom: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  pendingFileName: {
    flex: 1,
    fontSize: 13,
    color: PURPLE,
    fontWeight: '500',
  },
  pendingFileRemove: {
    fontSize: 16,
    color: PURPLE,
    fontWeight: '700',
    paddingLeft: 8,
  },

  // Input bar
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e0e0e0',
    backgroundColor: '#fff',
  },
  attachButton: {
    padding: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  attachIcon: {
    fontSize: 22,
  },
  disabledText: {
    opacity: 0.4,
  },
  textInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    backgroundColor: '#f5f5f5',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 10 : 8,
    paddingBottom: Platform.OS === 'ios' ? 10 : 8,
    fontSize: 15,
    color: '#222',
    marginHorizontal: 6,
  },
  sendButton: {
    backgroundColor: PURPLE,
    borderRadius: 20,
    paddingHorizontal: 18,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#ccc',
  },
  sendButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
});
