import { create } from 'zustand';
import {
  api,
  ConversationResponse,
  MessageResponse,
  PaginatedMessages,
} from '../services/api';
import {
  socket,
  MessageEvent,
  MessageEditedEvent,
  MessageDeletedEvent,
  ReactionEvent,
  TypingEvent,
} from '../services/socket';
import { useAuthStore } from './authStore';

interface TypingIndicator {
  userId: string;
  username: string;
  startedAt: number;
}

interface ChatState {
  // State
  conversations: ConversationResponse[];
  activeConversation: ConversationResponse | null;
  messages: Map<string, MessageResponse[]>;
  messageCursors: Map<string, string | undefined>;
  isLoadingConversations: boolean;
  isLoadingMessages: boolean;
  isSending: boolean;
  error: string | null;
  typingIndicators: Map<string, TypingIndicator[]>;
  unreadCounts: Map<string, number>;
  buzzActive: Map<string, { senderId: string; senderName: string; timestamp: number }>;
  replyingTo: { messageId: string; content: string; senderName: string } | null;
  pinnedMessages: Map<string, MessageResponse[]>;
  isLoadingPins: boolean;

  // Conversation Actions
  fetchConversations: (skip?: number, limit?: number) => Promise<void>;
  setActiveConversation: (conversation: ConversationResponse | null) => void;
  createConversation: (participantIds: string[], name?: string) => Promise<ConversationResponse>;

  removeConversation: (conversationId: string) => Promise<void>;

  // Message Actions
  fetchMessages: (conversationId: string, cursor?: string) => Promise<void>;
  sendMessage: (conversationId: string, content: string, replyToId?: string) => Promise<MessageResponse>;
  editMessage: (conversationId: string, messageId: string, content: string) => Promise<void>;
  deleteMessage: (conversationId: string, messageId: string) => Promise<void>;
  setReplyingTo: (data: { messageId: string; content: string; senderName: string } | null) => void;

  // Reaction Actions
  addReaction: (
    conversationId: string,
    messageId: string,
    emoji: string
  ) => Promise<void>;
  removeReaction: (
    conversationId: string,
    messageId: string,
    emoji: string
  ) => Promise<void>;

  // Socket Event Handlers
  handleNewMessage: (message: MessageEvent) => void;
  handleMessageEdited: (message: MessageEditedEvent) => void;
  handleMessageDeleted: (message: MessageDeletedEvent) => void;
  handleReactionAdded: (reaction: ReactionEvent) => void;
  handleReactionRemoved: (reaction: ReactionEvent) => void;
  handleTypingStart: (typing: TypingEvent) => void;
  handleTypingStop: (typing: TypingEvent) => void;
  handleBuzzReceived: (data: { senderId: string; senderName: string; conversationId: string }) => void;
  handleMessagesRead: (data: { conversationId: string; readByUserId: string; messageIds: string[] }) => void;
  sendBuzz: (conversationId: string, targetUserId?: string) => void;

  // Pin Actions
  fetchPinnedMessages: (conversationId: string) => Promise<void>;
  pinMessage: (conversationId: string, messageId: string) => Promise<void>;
  unpinMessage: (conversationId: string, messageId: string) => Promise<void>;

  // Utility Actions
  clearError: () => void;
  resetChat: () => void;
  markConversationAsRead: (conversationId: string) => Promise<void>;
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  activeConversation: null,
  messages: new Map(),
  messageCursors: new Map(),
  isLoadingConversations: false,
  isLoadingMessages: false,
  isSending: false,
  error: null,
  typingIndicators: new Map(),
  unreadCounts: new Map(),
  buzzActive: new Map(),
  replyingTo: null,
  pinnedMessages: new Map(),
  isLoadingPins: false,

  // Conversation Actions
  fetchConversations: async (skip = 0, limit = 20) => {
    set({ isLoadingConversations: true, error: null });
    try {
      const conversations = await api.getConversations(skip, limit);
      set({ conversations, isLoadingConversations: false });

      // Initialize unread counts
      const unreadCounts = new Map<string, number>();
      conversations.forEach((conv) => {
        unreadCounts.set(conv.id, conv.unreadCount);
      });
      set({ unreadCounts });

      // Join ALL conversation rooms so we receive real-time events
      conversations.forEach((conv) => {
        socket.joinConversation(conv.id);
      });
    } catch (error: any) {
      const errorMessage =
        error.response?.data?.message || error.message || 'Failed to fetch conversations';
      set({ error: errorMessage, isLoadingConversations: false });
    }
  },

  setActiveConversation: (conversation: ConversationResponse | null) => {
    set({ activeConversation: conversation });
    if (conversation) {
      // Join the conversation room
      socket.joinConversation(conversation.id);
      // Mark as read
      get().markConversationAsRead(conversation.id);
    }
  },

  createConversation: async (participantIds: string[], name?: string) => {
    set({ isLoadingConversations: true, error: null });
    try {
      const conversation = await api.createConversation(participantIds, name);
      set((state) => ({
        conversations: [conversation, ...state.conversations],
        isLoadingConversations: false,
      }));
      // Join the new conversation room for real-time events
      socket.joinConversation(conversation.id);
      return conversation;
    } catch (error: any) {
      const errorMessage =
        error.response?.data?.message || error.message || 'Failed to create conversation';
      set({ error: errorMessage, isLoadingConversations: false });
      throw error;
    }
  },

  removeConversation: async (conversationId: string) => {
    set({ error: null });
    try {
      await api.deleteConversation(conversationId);
      set((state) => ({
        conversations: state.conversations.filter((c) => c.id !== conversationId),
        activeConversation: state.activeConversation?.id === conversationId ? null : state.activeConversation,
      }));
    } catch (error: any) {
      const errorMessage =
        error.response?.data?.message || error.message || 'Failed to remove conversation';
      set({ error: errorMessage });
      throw error;
    }
  },

  // Message Actions
  fetchMessages: async (conversationId: string, cursor?: string) => {
    set({ isLoadingMessages: true, error: null });
    try {
      const response: PaginatedMessages = await api.getMessages(conversationId, cursor, 50);
      const { messages: newMessages, cursor: nextCursor } = response;

      set((state) => {
        const existingMessages = state.messages.get(conversationId) || [];
        let allMessages: MessageResponse[];
        if (cursor) {
          // Loading older messages — prepend, dedup by id
          const existingIds = new Set(existingMessages.map(m => m.id));
          const unique = newMessages.filter(m => !existingIds.has(m.id));
          allMessages = [...unique, ...existingMessages];
        } else {
          // Initial load — replace with fresh data
          allMessages = newMessages;
        }

        const updated = new Map(state.messages);
        updated.set(conversationId, allMessages);

        const cursors = new Map(state.messageCursors);
        cursors.set(conversationId, nextCursor);

        return {
          messages: updated,
          messageCursors: cursors,
          isLoadingMessages: false,
        };
      });
    } catch (error: any) {
      const errorMessage =
        error.response?.data?.message || error.message || 'Failed to fetch messages';
      set({ error: errorMessage, isLoadingMessages: false });
    }
  },

  sendMessage: async (conversationId: string, content: string, replyToId?: string) => {
    set({ isSending: true, error: null });
    try {
      const message = await api.sendMessage(conversationId, content, replyToId);
      // Add message to store and update conversation list immediately
      set((state) => {
        const messages = new Map(state.messages);
        const conversationMessages = messages.get(conversationId) || [];
        // Avoid duplicates (in case socket event also fires)
        if (!conversationMessages.some((m) => m.id === message.id)) {
          messages.set(conversationId, [...conversationMessages, message]);
        }

        // Move conversation to top and update lastMessage preview
        const conversations = [...state.conversations];
        const convIndex = conversations.findIndex((c) => c.id === conversationId);
        if (convIndex >= 0) {
          const conv = { ...conversations[convIndex] };
          conv.lastMessage = {
            id: message.id,
            content: message.content,
            senderId: message.senderId,
            conversationId: message.conversationId,
            createdAt: message.createdAt,
            reactions: {},
          };
          conv.updatedAt = message.createdAt;
          conversations.splice(convIndex, 1);
          conversations.unshift(conv);
        }

        return { messages, conversations, isSending: false };
      });
      return message;
    } catch (error: any) {
      const errorMessage =
        error.response?.data?.message || error.message || 'Failed to send message';
      set({ error: errorMessage, isSending: false });
      throw error;
    }
  },

  editMessage: async (conversationId: string, messageId: string, content: string) => {
    set({ error: null });
    try {
      await api.editMessage(conversationId, messageId, content);
      // Message will be updated via socket event
    } catch (error: any) {
      const errorMessage =
        error.response?.data?.message || error.message || 'Failed to edit message';
      set({ error: errorMessage });
      throw error;
    }
  },

  deleteMessage: async (conversationId: string, messageId: string) => {
    set({ error: null });
    try {
      await api.deleteMessage(conversationId, messageId);
      // Message will be removed via socket event
    } catch (error: any) {
      const errorMessage =
        error.response?.data?.message || error.message || 'Failed to delete message';
      set({ error: errorMessage });
      throw error;
    }
  },

  // Reaction Actions
  addReaction: async (conversationId: string, messageId: string, emoji: string) => {
    set({ error: null });
    try {
      await api.addReaction(conversationId, messageId, emoji);
      // Reaction will be updated via socket event
    } catch (error: any) {
      const errorMessage =
        error.response?.data?.message || error.message || 'Failed to add reaction';
      set({ error: errorMessage });
      throw error;
    }
  },

  removeReaction: async (conversationId: string, messageId: string, emoji: string) => {
    set({ error: null });
    try {
      await api.removeReaction(conversationId, messageId, emoji);
      // Reaction will be updated via socket event
    } catch (error: any) {
      const errorMessage =
        error.response?.data?.message || error.message || 'Failed to remove reaction';
      set({ error: errorMessage });
      throw error;
    }
  },

  // Socket Event Handlers
  handleNewMessage: (message: MessageEvent) => {
    set((state) => {
      const messages = new Map(state.messages);
      const conversationMessages = messages.get(message.conversationId) || [];
      // Deduplicate — sender already added via API response
      if (conversationMessages.some((m) => m.id === message.id)) {
        return state;
      }
      messages.set(message.conversationId, [...conversationMessages, message]);

      // Update conversation list — move this conversation to top and update lastMessage
      const conversations = [...state.conversations];
      const convIndex = conversations.findIndex((c) => c.id === message.conversationId);
      if (convIndex >= 0) {
        const conv = { ...conversations[convIndex] };
        conv.lastMessage = {
          id: message.id,
          content: message.content,
          senderId: message.senderId,
          conversationId: message.conversationId,
          createdAt: message.createdAt,
          reactions: {},
        };
        conv.updatedAt = message.createdAt;
        conversations.splice(convIndex, 1);
        conversations.unshift(conv);
      }

      // Increment unread count if not the active conversation AND not our own message
      const unreadCounts = new Map(state.unreadCounts);
      const activeConvId = state.activeConversation?.id;
      const currentUserId = useAuthStore.getState().user?.id;
      if (message.conversationId !== activeConvId && message.senderId !== currentUserId) {
        const current = unreadCounts.get(message.conversationId) || 0;
        unreadCounts.set(message.conversationId, current + 1);
      }

      return { messages, conversations, unreadCounts };
    });
  },

  handleMessageEdited: (message: MessageEditedEvent) => {
    set((state) => {
      const messages = new Map(state.messages);
      const conversationMessages = messages.get(message.conversationId) || [];
      const updated = conversationMessages.map((msg) =>
        msg.id === message.id
          ? {
              ...msg,
              content: message.content,
              editedAt: message.editedAt,
            }
          : msg
      );
      messages.set(message.conversationId, updated);
      return { messages };
    });
  },

  handleMessageDeleted: (message: MessageDeletedEvent) => {
    set((state) => {
      const messages = new Map(state.messages);
      const conversationMessages = messages.get(message.conversationId) || [];
      const filtered = conversationMessages.filter((msg) => msg.id !== message.id);
      messages.set(message.conversationId, filtered);
      return { messages };
    });
  },

  handleReactionAdded: (reaction: ReactionEvent) => {
    set((state) => {
      const messages = new Map(state.messages);
      const conversationMessages = messages.get(reaction.conversationId) || [];
      const updated = conversationMessages.map((msg) => {
        if (msg.id === reaction.messageId) {
          const reactions = { ...msg.reactions };
          if (!reactions[reaction.emoji]) {
            reactions[reaction.emoji] = [];
          }
          if (!reactions[reaction.emoji].includes(reaction.userId)) {
            reactions[reaction.emoji] = [...reactions[reaction.emoji], reaction.userId];
          }
          return { ...msg, reactions };
        }
        return msg;
      });
      messages.set(reaction.conversationId, updated);
      return { messages };
    });
  },

  handleReactionRemoved: (reaction: ReactionEvent) => {
    set((state) => {
      const messages = new Map(state.messages);
      const conversationMessages = messages.get(reaction.conversationId) || [];
      const updated = conversationMessages.map((msg) => {
        if (msg.id === reaction.messageId) {
          const reactions = { ...msg.reactions };
          if (reactions[reaction.emoji]) {
            reactions[reaction.emoji] = reactions[reaction.emoji].filter(
              (id) => id !== reaction.userId
            );
            if (reactions[reaction.emoji].length === 0) {
              delete reactions[reaction.emoji];
            }
          }
          return { ...msg, reactions };
        }
        return msg;
      });
      messages.set(reaction.conversationId, updated);
      return { messages };
    });
  },

  handleTypingStart: (typing: TypingEvent) => {
    set((state) => {
      const indicators = new Map(state.typingIndicators);
      const conversationIndicators = indicators.get(typing.conversationId) || [];
      const filtered = conversationIndicators.filter((t) => t.userId !== typing.userId);
      const updated = [
        ...filtered,
        {
          userId: typing.userId,
          username: typing.username,
          startedAt: Date.now(),
        },
      ];
      indicators.set(typing.conversationId, updated);
      return { typingIndicators: indicators };
    });
  },

  handleTypingStop: (typing: TypingEvent) => {
    set((state) => {
      const indicators = new Map(state.typingIndicators);
      const conversationIndicators = indicators.get(typing.conversationId) || [];
      const updated = conversationIndicators.filter((t) => t.userId !== typing.userId);
      indicators.set(typing.conversationId, updated);
      return { typingIndicators: indicators };
    });
  },

  handleBuzzReceived: (data) => {
    set((state) => {
      const buzzActive = new Map(state.buzzActive);
      buzzActive.set(data.conversationId, {
        senderId: data.senderId,
        senderName: data.senderName,
        timestamp: Date.now(),
      });

      // Also inject a buzz system message into the conversation
      const messages = new Map(state.messages);
      const conversationMessages = messages.get(data.conversationId) || [];
      const buzzMessage = {
        id: `buzz-${data.conversationId}-${Date.now()}`,
        conversationId: data.conversationId,
        senderId: data.senderId,
        content: `⚡ ${data.senderName} sent a buzz!`,
        type: 'buzz',
        reactions: {},
        createdAt: new Date().toISOString(),
        sender: {
          id: data.senderId,
          username: data.senderName,
          displayName: data.senderName,
        },
      };
      messages.set(data.conversationId, [...conversationMessages, buzzMessage]);

      return { buzzActive, messages };
    });

    // Auto-clear buzz after 3 seconds
    setTimeout(() => {
      set((state) => {
        const buzzActive = new Map(state.buzzActive);
        buzzActive.delete(data.conversationId);
        return { buzzActive };
      });
    }, 3000);
  },

  handleMessagesRead: (data) => {
    set((state) => {
      const messages = new Map(state.messages);
      const conversationMessages = messages.get(data.conversationId);
      if (!conversationMessages) return state;

      const updatedMessages = conversationMessages.map((msg) => {
        if (data.messageIds.includes(msg.id)) {
          const readBy = { ...(msg.readBy || {}) };
          readBy[data.readByUserId] = new Date().toISOString();
          return { ...msg, readBy };
        }
        return msg;
      });
      messages.set(data.conversationId, updatedMessages);
      return { messages };
    });
  },

  sendBuzz: (conversationId: string, targetUserId?: string) => {
    socket.sendBuzz(conversationId, targetUserId);

    // Add a local buzz message for the sender too
    set((state) => {
      const messages = new Map(state.messages);
      const conversationMessages = messages.get(conversationId) || [];
      const user = useAuthStore.getState().user;
      const buzzMessage = {
        id: `buzz-${conversationId}-${Date.now()}`,
        conversationId: conversationId,
        senderId: user?.id || '',
        content: `⚡ You sent a buzz!`,
        type: 'buzz',
        reactions: {},
        createdAt: new Date().toISOString(),
        sender: {
          id: user?.id || '',
          username: user?.username || 'You',
          displayName: user?.displayName || user?.username || 'You',
        },
      };
      messages.set(conversationId, [...conversationMessages, buzzMessage]);
      return { messages };
    });
  },

  // Pin Actions
  fetchPinnedMessages: async (conversationId: string) => {
    set({ isLoadingPins: true, error: null });
    try {
      const pins = await api.getPinnedMessages(conversationId);
      set((state) => {
        const pinnedMessages = new Map(state.pinnedMessages);
        pinnedMessages.set(conversationId, pins);
        return { pinnedMessages, isLoadingPins: false };
      });
    } catch (error: any) {
      const errorMessage =
        error.response?.data?.message || error.message || 'Failed to fetch pinned messages';
      set({ error: errorMessage, isLoadingPins: false });
    }
  },

  pinMessage: async (conversationId: string, messageId: string) => {
    set({ error: null });
    try {
      await api.pinMessage(conversationId, messageId);
      // Update local pinned messages
      set((state) => {
        const messages = state.messages.get(conversationId) || [];
        const message = messages.find((m) => m.id === messageId);
        if (message) {
          const pinnedMessages = new Map(state.pinnedMessages);
          const existing = pinnedMessages.get(conversationId) || [];
          if (!existing.some((m) => m.id === messageId)) {
            pinnedMessages.set(conversationId, [message, ...existing]);
          }
          return { pinnedMessages };
        }
        return state;
      });
    } catch (error: any) {
      const errorMessage =
        error.response?.data?.message || error.message || 'Failed to pin message';
      set({ error: errorMessage });
      throw error;
    }
  },

  unpinMessage: async (conversationId: string, messageId: string) => {
    set({ error: null });
    try {
      await api.unpinMessage(conversationId, messageId);
      // Update local pinned messages
      set((state) => {
        const pinnedMessages = new Map(state.pinnedMessages);
        const existing = pinnedMessages.get(conversationId) || [];
        pinnedMessages.set(conversationId, existing.filter((m) => m.id !== messageId));
        return { pinnedMessages };
      });
    } catch (error: any) {
      const errorMessage =
        error.response?.data?.message || error.message || 'Failed to unpin message';
      set({ error: errorMessage });
      throw error;
    }
  },

  setReplyingTo: (data) => {
    set({ replyingTo: data });
  },

  // Utility Actions
  clearError: () => {
    set({ error: null });
  },

  resetChat: () => {
    set({
      conversations: [],
      activeConversation: null,
      messages: new Map(),
      messageCursors: new Map(),
      isLoadingConversations: false,
      isLoadingMessages: false,
      isSending: false,
      error: null,
      typingIndicators: new Map(),
      unreadCounts: new Map(),
      buzzActive: new Map(),
      replyingTo: null,
      pinnedMessages: new Map(),
      isLoadingPins: false,
    });
  },

  markConversationAsRead: async (conversationId: string) => {
    try {
      await api.markAsRead(conversationId);
      set((state) => {
        const unreadCounts = new Map(state.unreadCounts);
        unreadCounts.set(conversationId, 0);
        return { unreadCounts };
      });
      socket.markAsRead(conversationId);
    } catch (error) {
      console.error('Failed to mark conversation as read:', error);
    }
  },
}));

// Setup socket event listeners
export function setupChatSocketListeners() {
  const unsubscribe: (() => void)[] = [];

  unsubscribe.push(
    socket.on<MessageEvent>('message:new', (message) => {
      useChatStore.getState().handleNewMessage(message);
    })
  );

  unsubscribe.push(
    socket.on<MessageEditedEvent>('message:edited', (message) => {
      useChatStore.getState().handleMessageEdited(message);
    })
  );

  unsubscribe.push(
    socket.on<MessageDeletedEvent>('message:deleted', (message) => {
      useChatStore.getState().handleMessageDeleted(message);
    })
  );

  unsubscribe.push(
    socket.on<ReactionEvent>('reaction:added', (reaction) => {
      useChatStore.getState().handleReactionAdded(reaction);
    })
  );

  unsubscribe.push(
    socket.on<ReactionEvent>('reaction:removed', (reaction) => {
      useChatStore.getState().handleReactionRemoved(reaction);
    })
  );

  unsubscribe.push(
    socket.on<TypingEvent>('typing:start', (typing) => {
      useChatStore.getState().handleTypingStart(typing);
    })
  );

  unsubscribe.push(
    socket.on<TypingEvent>('typing:stop', (typing) => {
      useChatStore.getState().handleTypingStop(typing);
    })
  );

  unsubscribe.push(
    socket.on<any>('buzz:received', (data) => {
      useChatStore.getState().handleBuzzReceived(data);
    })
  );

  unsubscribe.push(
    socket.on<any>('messagesRead', (data) => {
      useChatStore.getState().handleMessagesRead(data);
    })
  );

  // Return function to cleanup all listeners
  return () => {
    unsubscribe.forEach((fn) => fn());
  };
}
