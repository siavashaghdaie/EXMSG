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

  // Conversation Actions
  fetchConversations: (skip?: number, limit?: number) => Promise<void>;
  setActiveConversation: (conversation: ConversationResponse | null) => void;
  createConversation: (participantIds: string[], name?: string) => Promise<ConversationResponse>;

  // Message Actions
  fetchMessages: (conversationId: string, cursor?: string) => Promise<void>;
  sendMessage: (conversationId: string, content: string) => Promise<MessageResponse>;
  editMessage: (conversationId: string, messageId: string, content: string) => Promise<void>;
  deleteMessage: (conversationId: string, messageId: string) => Promise<void>;

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
      return conversation;
    } catch (error: any) {
      const errorMessage =
        error.response?.data?.message || error.message || 'Failed to create conversation';
      set({ error: errorMessage, isLoadingConversations: false });
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
        const allMessages = cursor
          ? [...newMessages, ...existingMessages] // Prepend older messages
          : [...existingMessages, ...newMessages]; // Append new messages

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

  sendMessage: async (conversationId: string, content: string) => {
    set({ isSending: true, error: null });
    try {
      const message = await api.sendMessage(conversationId, content);
      // Message will be added via socket event
      set({ isSending: false });
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
      messages.set(message.conversationId, [...conversationMessages, message]);
      return { messages };
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

  // Return function to cleanup all listeners
  return () => {
    unsubscribe.forEach((fn) => fn());
  };
}
