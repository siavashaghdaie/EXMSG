import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { format, isToday, isYesterday } from 'date-fns';
import { ArrowDown, ChevronLeft } from 'lucide-react';
import { useChatStore } from '@/store/chatStore';
import { useAuthStore } from '@/store/authStore';
import MessageBubble from './MessageBubble';
import MessageComposer from './MessageComposer';
import TypingIndicator from './TypingIndicator';
import Avatar from '@/components/common/Avatar';

interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  content: string;
  createdAt: Date;
  editedAt?: Date;
  readBy?: Record<string, Date>;
  reactions?: Record<string, string[]>;
  replyTo?: {
    id: string;
    senderName: string;
    content: string;
  };
}

// Matches ConversationResponse from api.ts
interface Conversation {
  id: string;
  name?: string;
  participants: Array<{ id: string; email: string; username: string; avatar?: string }>;
  lastMessage?: any;
  unreadCount: number;
  createdAt: string;
  updatedAt: string;
}

export default function ChatView() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const { user } = useAuthStore();
  const {
    messages,
    activeConversation,
    fetchMessages,
    typingIndicators,
  } = useChatStore();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const scrollPositionRef = useRef<number>(0);

  // Scroll to bottom on new messages
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages.get(conversationId || '')?.length, scrollToBottom]);

  // Fetch messages when conversation changes
  useEffect(() => {
    if (conversationId) {
      fetchMessages(conversationId);
      // Join socket room would happen here
    }
  }, [conversationId, fetchMessages]);

  // Handle scroll detection
  const handleScroll = () => {
    if (!messagesContainerRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
    const isNearBottom = scrollHeight - (scrollTop + clientHeight) > 100;

    setShowScrollButton(isNearBottom);
    scrollPositionRef.current = scrollTop;

    // Load more messages when scrolling to top
    if (scrollTop === 0 && !isLoadingMore && conversationId) {
      setIsLoadingMore(true);
      // Load older messages here
      setTimeout(() => setIsLoadingMore(false), 500);
    }
  };

  if (!conversationId) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-gradient-to-b from-slate-50 to-slate-100">
        <div className="text-center">
          <div className="mb-4 text-6xl">💬</div>
          <h2 className="text-2xl font-bold text-slate-800 mb-2">
            Select a conversation
          </h2>
          <p className="text-slate-600">
            Choose a conversation from the sidebar to start messaging
          </p>
        </div>
      </div>
    );
  }

  const conversationMessages = messages.get(conversationId) || [];
  const conversation = activeConversation as Conversation | null;

  // Group messages by sender and time
  const groupedMessages = conversationMessages.reduce(
    (groups: any[], message: Message) => {
      const lastGroup = groups[groups.length - 1];
      const isSameSender =
        lastGroup && lastGroup.messages[0].senderId === message.senderId;
      const timeDiff =
        lastGroup &&
        new Date(message.createdAt).getTime() -
          new Date(lastGroup.messages[0].createdAt).getTime() <
          300000; // 5 minutes

      if (isSameSender && timeDiff) {
        lastGroup.messages.push(message);
      } else {
        groups.push({ messages: [message] });
      }
      return groups;
    },
    []
  );

  // Get date separator text
  const getDateSeparator = (date: Date): string => {
    if (isToday(date)) return 'Today';
    if (isYesterday(date)) return 'Yesterday';
    return format(date, 'MMMM d, yyyy');
  };

  // Render date separators between different days
  let lastDate: string | null = null;
  const messagesToRender = groupedMessages.map((group, idx) => {
    const firstMessage = group.messages[0];
    const currentDate = getDateSeparator(new Date(firstMessage.createdAt));
    const showDateSeparator = lastDate !== currentDate;
    lastDate = currentDate;

    return (
      <React.Fragment key={`group-${idx}`}>
        {showDateSeparator && (
          <div className="flex items-center gap-3 my-4 px-4">
            <div className="flex-1 h-px bg-slate-200" />
            <span className="text-xs text-slate-500 font-medium">
              {currentDate}
            </span>
            <div className="flex-1 h-px bg-slate-200" />
          </div>
        )}
        <div
          className={`flex ${
            firstMessage.senderId === user?.id
              ? 'justify-end'
              : 'justify-start'
          } px-4 mb-1`}
        >
          <div
            className={`flex gap-2 max-w-xs ${
              firstMessage.senderId === user?.id
                ? 'flex-row-reverse'
                : 'flex-row'
            }`}
          >
            {conversation && conversation.participants.length > 2 &&
              firstMessage.senderId !== user?.id && (
                <Avatar
                  name={firstMessage.senderName}
                  src={firstMessage.senderAvatar}
                  size="sm"
                />
              )}
            <div
              className={`flex flex-col ${
                firstMessage.senderId === user?.id
                  ? 'items-end'
                  : 'items-start'
              } gap-1`}
            >
              {conversation && conversation.participants.length > 2 &&
                firstMessage.senderId !== user?.id && (
                  <span className="text-xs text-slate-500 px-3 pt-1">
                    {firstMessage.senderName}
                  </span>
                )}
              <div className="flex flex-col gap-2">
                {group.messages.map((msg: Message) => (
                  <MessageBubble
                    key={msg.id}
                    message={msg}
                    isOwnMessage={msg.senderId === user?.id}
                    showAvatar={conversation && conversation.participants.length > 2}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </React.Fragment>
    );
  });

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white sticky top-0 z-10">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1">
            <button className="lg:hidden p-2 hover:bg-slate-100 rounded-lg transition">
              <ChevronLeft size={20} className="text-slate-600" />
            </button>
            {conversation && (() => {
              const isGroup = conversation.participants.length > 2;
              const otherParticipants = conversation.participants.filter(p => p.id !== user?.id);
              const displayName = conversation.name || otherParticipants.map(p => p.username).join(', ');
              return (
                <>
                  <Avatar
                    name={displayName}
                    size="md"
                  />
                  <div className="flex-1">
                    <h2 className="font-semibold text-slate-900">
                      {displayName}
                    </h2>
                    <p className="text-xs text-slate-500">
                      {isGroup
                        ? `${conversation.participants.length} members`
                        : 'Direct message'}
                    </p>
                  </div>
                </>
              );
            })()}
          </div>
          <div className="flex items-center gap-2">
            <button className="p-2 hover:bg-slate-100 rounded-lg transition">
              <svg
                className="w-5 h-5 text-slate-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Messages Container */}
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto scrollbar-hide"
      >
        <div className="py-4">
          {conversationMessages.length === 0 ? (
            <div className="flex items-center justify-center h-full text-slate-500">
              <p>No messages yet. Start the conversation!</p>
            </div>
          ) : (
            messagesToRender
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Scroll to bottom button */}
      {showScrollButton && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-24 right-6 p-3 bg-blue-500 text-white rounded-full shadow-lg hover:bg-blue-600 transition animate-bounce"
        >
          <ArrowDown size={20} />
        </button>
      )}

      {/* Typing Indicator */}
      {typingIndicators.get(conversationId)?.length ? (
        <div className="px-4 py-2">
          <TypingIndicator users={typingIndicators.get(conversationId)!.map(t => t.username)} />
        </div>
      ) : null}

      {/* Message Composer */}
      <MessageComposer
        conversationId={conversationId}
        disabled={!conversationId}
      />
    </div>
  );
}
