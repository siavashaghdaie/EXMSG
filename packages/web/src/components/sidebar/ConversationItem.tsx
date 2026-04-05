import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { Trash2 } from 'lucide-react';
import { ConversationResponse } from '@/services/api';
import Avatar from '@/components/common/Avatar';
import { useAuthStore } from '@/store/authStore';
import { useChatStore } from '@/store/chatStore';

interface ConversationItemProps {
  conversation: ConversationResponse;
  isActive: boolean;
  isOnline?: boolean;
  onNavigate?: () => void;
  typingUsers?: string[];
  hasStory?: boolean;
  hasUnviewedStory?: boolean;
  onStoryClick?: () => void;
}

const getConversationName = (
  conversation: ConversationResponse,
  currentUserId: string
): string => {
  // For DMs, show the other user's name
  if (conversation.participants.length === 2) {
    const otherParticipant = conversation.participants.find((p) => p.id !== currentUserId);
    return otherParticipant?.username || otherParticipant?.email?.split('@')[0] || 'Unknown User';
  }
  // For groups/channels, use the conversation name or participant names
  return conversation.name || conversation.participants.map((p) => p.username || p.email?.split('@')[0] || 'User').join(', ');
};

const getConversationAvatar = (conversation: ConversationResponse, currentUserId: string) => {
  // For DMs, use the other user's avatar
  if (conversation.participants.length === 2) {
    const otherParticipant = conversation.participants.find((p) => p.id !== currentUserId);
    const displayName = otherParticipant?.username || otherParticipant?.email?.split('@')[0] || 'Unknown User';
    return {
      src: otherParticipant?.avatar,
      name: displayName,
      username: otherParticipant?.username || otherParticipant?.email,
    };
  }
  // For groups, use the conversation name or first participant
  const name = conversation.name || conversation.participants[0]?.username || conversation.participants[0]?.email?.split('@')[0] || 'Group';
  return {
    src: undefined,
    name,
    username: conversation.participants[0]?.username || conversation.participants[0]?.email,
  };
};

const getLastMessagePreview = (conversation: ConversationResponse): string => {
  if (!conversation.lastMessage) {
    return 'No messages yet';
  }
  return (conversation.lastMessage.content || '').slice(0, 50) || 'Attachment';
};

const getLastMessageTime = (conversation: ConversationResponse): string => {
  if (!conversation.lastMessage) {
    return '';
  }
  try {
    return formatDistanceToNow(new Date(conversation.lastMessage.createdAt), {
      addSuffix: false,
    });
  } catch {
    return '';
  }
};

export const ConversationItem: React.FC<ConversationItemProps> = ({
  conversation,
  isActive,
  isOnline,
  onNavigate,
  typingUsers,
  hasStory,
  hasUnviewedStory,
  onStoryClick,
}) => {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const { removeConversation } = useChatStore();
  const [showDelete, setShowDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  if (!user) return null;

  const conversationName = getConversationName(conversation, user.id);
  const { src, name, username } = getConversationAvatar(conversation, user.id);
  const lastMessagePreview = getLastMessagePreview(conversation);
  const lastMessageTime = getLastMessageTime(conversation);
  const unreadCount = conversation.unreadCount || 0;

  const handleClick = () => {
    if (showDelete) {
      setShowDelete(false);
      return;
    }
    navigate(`/chat/${conversation.id}`);
    onNavigate?.();
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(`Remove "${conversationName}" from your chat list?`)) return;
    setIsDeleting(true);
    try {
      await removeConversation(conversation.id);
      navigate('/chat');
    } catch {
      setIsDeleting(false);
    }
  };

  // Get the userId for presence indicator (for DMs)
  const otherParticipantId = conversation.participants.length === 2
    ? conversation.participants.find((p) => p.id !== user.id)?.id
    : undefined;

  return (
    <div
      className="relative group"
      onContextMenu={(e) => {
        e.preventDefault();
        setShowDelete(!showDelete);
      }}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleClick(); }}
        className={`w-full px-3 py-3 rounded-lg transition-all duration-200 ease-out flex items-start gap-3 hover:bg-gray-100 dark:hover:bg-surface-800 cursor-pointer ${
          isActive
            ? 'bg-primary-50 dark:bg-primary-900/20 shadow-sm'
            : ''
        } ${isDeleting ? 'opacity-50 pointer-events-none' : ''}`}
      >
        {/* Avatar with online indicator and optional story ring */}
        <div
          className="relative flex-shrink-0 mt-1"
          style={hasStory ? { width: 46, height: 46 } : undefined}
          onClick={hasStory ? (e) => { e.stopPropagation(); onStoryClick?.(); } : undefined}
        >
          {hasStory && (
            <svg
              className={`absolute inset-0 pointer-events-none ${hasUnviewedStory ? 'animate-spin' : ''}`}
              style={hasUnviewedStory ? { animationDuration: '12s' } : undefined}
              width="46"
              height="46"
              viewBox="0 0 46 46"
            >
              <circle
                cx="23"
                cy="23"
                r="21"
                fill="none"
                stroke={hasUnviewedStory ? '#f59e0b' : '#9ca3af'}
                strokeWidth="2.5"
                strokeDasharray="5 3"
                strokeLinecap="round"
              />
            </svg>
          )}
          <div style={hasStory ? { position: 'absolute', top: 3, left: 3 } : undefined}>
            <Avatar
              src={src}
              name={name}
              username={username}
              size="md"
              userId={otherParticipantId}
              showPresence={true}
              online={isOnline}
            />
          </div>
        </div>

        {/* Conversation info */}
        <div className="flex-1 min-w-0 text-left">
          {/* Name and time row */}
          <div className="flex items-center justify-between gap-2 mb-1">
            <h3
              className={`font-medium text-sm truncate ${
                isActive
                  ? 'text-gray-900 dark:text-white'
                  : 'text-gray-700 dark:text-gray-200'
              }`}
            >
              {conversationName}
            </h3>
            {lastMessageTime && (
              <span
                className={`text-xs flex-shrink-0 ${
                  unreadCount > 0
                    ? 'text-primary-600 dark:text-primary-400 font-medium'
                    : 'text-gray-400 dark:text-gray-500'
                }`}
              >
                {lastMessageTime.replace(' ago', '')}m
              </span>
            )}
          </div>

          {/* Last message preview / typing indicator and unread badge */}
          <div className="flex items-center justify-between gap-2">
            {typingUsers && typingUsers.length > 0 ? (
              <p className="text-xs truncate text-green-600 dark:text-green-400 font-medium italic flex items-center gap-1">
                <span className="flex gap-0.5">
                  <span className="w-1 h-1 bg-green-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1 h-1 bg-green-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1 h-1 bg-green-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </span>
                {typingUsers.length === 1 ? `${typingUsers[0]} is typing` : `${typingUsers.length} people typing`}
              </p>
            ) : (
              <p
                className={`text-xs truncate ${
                  unreadCount > 0
                    ? 'text-gray-700 dark:text-gray-300 font-medium'
                    : 'text-gray-500 dark:text-gray-400'
                }`}
              >
                {lastMessagePreview}
              </p>
            )}

            {/* Unread badge */}
            {unreadCount > 0 && (
              <div className="flex-shrink-0 w-5 h-5 rounded-full bg-primary-600 dark:bg-primary-500 flex items-center justify-center">
                <span className="text-xs font-bold text-white">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Delete button — visible on hover (desktop) or after right-click */}
        <button
          onClick={handleDelete}
          className={`absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-all ${
            showDelete ? 'opacity-100 scale-100' : 'opacity-0 scale-75 group-hover:opacity-100 group-hover:scale-100'
          }`}
          title="Remove conversation"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
};

export default ConversationItem;
