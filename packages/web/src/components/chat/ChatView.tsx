import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { format, isToday, isYesterday } from 'date-fns';
import { ArrowDown, ChevronLeft, Phone, Video } from 'lucide-react';
import { useChatStore } from '@/store/chatStore';
import { useAuthStore } from '@/store/authStore';
import { MessageResponse, ConversationResponse } from '@/services/api';
import MessageBubble from './MessageBubble';
import MessageComposer from './MessageComposer';
import TypingIndicator from './TypingIndicator';
import BuzzButton from './BuzzButton';
import BuzzOverlay from './BuzzOverlay';
import Avatar from '@/components/common/Avatar';
import CallModal from '@/components/call/CallModal';
import PresenceIndicator from '@/components/common/PresenceIndicator';
import TaskReminderBell from '@/components/tasks/TaskReminderBell';
import { callService } from '@/services/callService';

export default function ChatView() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const {
    messages,
    conversations,
    activeConversation,
    setActiveConversation,
    fetchMessages,
    typingIndicators,
    buzzActive,
    sendBuzz,
  } = useChatStore();
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const scrollPositionRef = useRef<number>(0);

  const activeBuzz = conversationId ? buzzActive.get(conversationId) : undefined;

  // Scroll to bottom on new messages — use scrollTop instead of scrollIntoView
  // to avoid stealing focus from the message input on mobile
  const scrollToBottom = useCallback(() => {
    const container = messagesContainerRef.current;
    if (container) {
      container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages.get(conversationId || '')?.length, scrollToBottom]);

  // Handle responsive behavior
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Set active conversation and fetch messages when conversation changes
  useEffect(() => {
    if (conversationId) {
      fetchMessages(conversationId);
      // Find conversation in list and set as active
      const conv = conversations.find(c => c.id === conversationId);
      if (conv) {
        setActiveConversation(conv);
      }
    }
  }, [conversationId, fetchMessages, conversations, setActiveConversation]);

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
  const conversation = activeConversation as ConversationResponse | null;

  // Group messages by sender and time
  const groupedMessages = conversationMessages.reduce<Array<{ messages: MessageResponse[] }>>(
    (groups, message) => {
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
  // Helper to find sender info from conversation participants
  const getSenderName = (senderId: string): string => {
    const participant = conversation?.participants.find(p => p.id === senderId);
    return participant?.username || participant?.email?.split('@')[0] || 'Unknown';
  };

  const getSenderAvatar = (senderId: string): string | undefined => {
    const participant = conversation?.participants.find(p => p.id === senderId);
    return participant?.avatar;
  };

  const getSenderUsername = (senderId: string): string | undefined => {
    const participant = conversation?.participants.find(p => p.id === senderId);
    return participant?.username || participant?.email;
  };

  let lastDate: string | null = null;
  const messagesToRender = groupedMessages.map((group: { messages: MessageResponse[] }, idx: number) => {
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
                  name={getSenderName(firstMessage.senderId)}
                  username={getSenderUsername(firstMessage.senderId)}
                  src={getSenderAvatar(firstMessage.senderId)}
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
                    {getSenderName(firstMessage.senderId)}
                  </span>
                )}
              <div className="flex flex-col gap-2">
                {group.messages.map((msg: MessageResponse) => (
                  <MessageBubble
                    key={msg.id}
                    message={msg}
                    isOwnMessage={msg.senderId === user?.id}
                    showAvatar={conversation ? conversation.participants.length > 2 : false}
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
    <div className={`flex h-full bg-white dark:bg-surface-900 ${activeBuzz ? 'animate-buzz-shake' : ''}`}>
      <div className="flex flex-col h-full flex-1">
      {/* Header */}
      <div className="border-b border-slate-200 dark:border-surface-700 bg-white dark:bg-surface-900 sticky top-0 z-10">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1">
            {isMobile && (
              <button
                onClick={() => navigate('/chat')}
                className="p-2 hover:bg-slate-100 rounded-lg transition"
                title="Back to chats"
              >
                <ChevronLeft size={20} className="text-slate-600" />
              </button>
            )}
            {conversation && (() => {
              const isGroup = conversation.participants.length > 2;
              const otherParticipants = conversation.participants.filter(p => p.id !== user?.id);
              const getParticipantName = (p: typeof otherParticipants[0]) =>
                p?.username || p?.email?.split('@')[0] || 'User';
              const displayName = conversation.name || otherParticipants.map(getParticipantName).join(', ');
              const avatarSrc = !isGroup && otherParticipants.length === 1
                ? otherParticipants[0]?.avatar
                : undefined;
              return (
                <>
                  <Avatar
                    name={displayName}
                    username={otherParticipants[0]?.username || otherParticipants[0]?.email}
                    src={avatarSrc}
                    size="md"
                  />
                  <div className="flex-1">
                    <h2 className="font-semibold text-slate-900 dark:text-white">
                      {displayName}
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                      {isGroup
                        ? `${conversation.participants.length} members`
                        : otherParticipants.length > 0 && (
                            <PresenceIndicator userId={otherParticipants[0]?.id} showText />
                          )}
                    </p>
                  </div>
                </>
              );
            })()}
          </div>
          <div className="flex items-center gap-2">
            <BuzzButton
              conversationId={conversationId}
              onBuzz={sendBuzz}
            />
            <TaskReminderBell />
            <button
              onClick={() => {
                if (conversation) {
                  const otherParticipants = conversation.participants.filter(p => p.id !== user?.id);
                  if (otherParticipants.length > 0) {
                    callService.initiateCall(
                      conversationId!,
                      otherParticipants[0].id,
                      otherParticipants[0].username,
                      'audio'
                    );
                  }
                }
              }}
              className="p-2 hover:bg-slate-100 rounded-lg transition"
              title="Voice call"
            >
              <Phone size={20} className="text-slate-600" />
            </button>
            <button
              onClick={() => {
                if (conversation) {
                  const otherParticipants = conversation.participants.filter(p => p.id !== user?.id);
                  if (otherParticipants.length > 0) {
                    callService.initiateCall(
                      conversationId!,
                      otherParticipants[0].id,
                      otherParticipants[0].username,
                      'video'
                    );
                  }
                }
              }}
              className="p-2 hover:bg-slate-100 rounded-lg transition"
              title="Video call"
            >
              <Video size={20} className="text-slate-600" />
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

      {/* BUZZ Overlay */}
      {activeBuzz && (
        <BuzzOverlay
          senderName={activeBuzz.senderName}
          onComplete={() => {}}
        />
      )}

      {/* Call Modal */}
      <CallModal />
      </div>
    </div>
  );
}
