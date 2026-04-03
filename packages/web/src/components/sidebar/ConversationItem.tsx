import React from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { ConversationResponse } from '@/services/api';
import Avatar from '@/components/common/Avatar';
import { useAuthStore } from '@/store/authStore';

interface ConversationItemProps {
  conversation: ConversationResponse;
  isActive: boolean;
  isOnline?: boolean;
}

const getConversationName = (
  conversation: ConversationResponse,
  currentUserId: string
): string => {
  // For DMs, show the other user's name
  if (conversation.participants.length === 2) {
    const otherParticipant = conversation.participants.find((p) => p.id !== currentUserId);
    return otherParticipant?.username || 'Unknown User';
  }
  // For groups/channels, use the conversation name or participant names
  return conversation.name || conversation.participants.map((p) => p.username).join(', ');
};

const getConversationAvatar = (conversation: ConversationResponse, currentUserId: string) => {
  // For DMs, use the other user's avatar
  if (conversation.participants.length === 2) {
    const otherParticipant = conversation.participants.find((p) => p.id !== currentUserId);
    return {
      src: otherParticipant?.avatar,
      name: otherParticipant?.username || 'Unknown User',
    };
  }
  // For groups, use the conversation name or first participant
  const name = conversation.name || conversation.participants[0]?.username || 'Group';
  return {
    src: undefined,
    name,
  };
};

const getLastMessagePreview = (conversation: ConversationResponse): string => {
  if (!conversation.lastMessage) {
    return 'No messages yet';
  }
  return conversation.lastMessage.content.slice(0, 50);
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
}) => {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);

  if (!user) return null;

  const conversationName = getConversationName(conversation, user.id);
  const { src, name } = getConversationAvatar(conversation, user.id);
  const lastMessagePreview = getLastMessagePreview(conversation);
  const lastMessageTime = getLastMessageTime(conversation);
  const unreadCount = conversation.unreadCount || 0;

  const handleClick = () => {
    navigate(`/chat/${conversation.id}`);
  };

  return (
    <button
      onClick={handleClick}
      className={`w-full px-3 py-3 rounded-lg transition-all duration-200 ease-out flex items-start gap-3 hover:bg-gray-100 dark:hover:bg-surface-800 ${
        isActive
          ? 'bg-primary-50 dark:bg-primary-900/20 shadow-sm'
          : ''
      }`}
    >
      {/* Avatar with online indicator */}
      <Avatar
        src={src}
        name={name}
        size="md"
        online={isOnline}
        className="flex-shrink-0 mt-1"
      />

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

        {/* Last message preview and unread badge */}
        <div className="flex items-center justify-between gap-2">
          <p
            className={`text-xs truncate ${
              unreadCount > 0
                ? 'text-gray-700 dark:text-gray-300 font-medium'
                : 'text-gray-500 dark:text-gray-400'
            }`}
          >
            {lastMessagePreview}
          </p>

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
    </button>
  );
};

export default ConversationItem;
