import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { Trash2, Archive, VolumeX, Pin, Sparkles } from 'lucide-react';
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
  if (conversation.participants.length === 2) {
    const otherParticipant = conversation.participants.find((p) => p.id !== currentUserId);
    return otherParticipant?.displayName || otherParticipant?.username || otherParticipant?.email?.split('@')[0] || 'Unknown User';
  }
  return conversation.name || conversation.participants.map((p) => p.displayName || p.username || p.email?.split('@')[0] || 'User').join(', ');
};

const getConversationAvatar = (conversation: ConversationResponse, currentUserId: string) => {
  if (conversation.participants.length === 2) {
    const otherParticipant = conversation.participants.find((p) => p.id !== currentUserId);
    const name = otherParticipant?.displayName || otherParticipant?.username || otherParticipant?.email?.split('@')[0] || 'Unknown User';
    return {
      src: otherParticipant?.avatar,
      name,
      username: otherParticipant?.username || otherParticipant?.email,
    };
  }
  const name = conversation.name || conversation.participants[0]?.displayName || conversation.participants[0]?.username || conversation.participants[0]?.email?.split('@')[0] || 'Group';
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
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (!user) return null;

  const conversationName = getConversationName(conversation, user.id);
  const { src, name, username } = getConversationAvatar(conversation, user.id);
  const lastMessagePreview = getLastMessagePreview(conversation);
  const lastMessageTime = getLastMessageTime(conversation);
  const unreadCount = conversation.unreadCount || 0;

  const isLindaConversation = conversation.participants.some(
    (p) => p.id !== user.id && (p.username === 'linda' || (p.email && p.email === 'linda@omnilink.system'))
  );

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [contextMenu]);

  const handleClick = () => {
    if (contextMenu) {
      setContextMenu(null);
      return;
    }
    navigate(`/chat/${conversation.id}`);
    onNavigate?.();
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Position menu relative to viewport, clamped to stay on screen
    const x = Math.min(e.clientX, window.innerWidth - 180);
    const y = Math.min(e.clientY, window.innerHeight - 160);
    setContextMenu({ x, y });
  };

  // Long-press for mobile
  const handleTouchStart = () => {
    longPressTimer.current = setTimeout(() => {
      // Use center of element for mobile menu position
      setContextMenu({ x: 100, y: 200 });
    }, 500);
  };

  const handleTouchEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handleDelete = async () => {
    setContextMenu(null);
    if (!window.confirm(`Delete "${conversationName}" chat?`)) return;
    setIsDeleting(true);
    try {
      await removeConversation(conversation.id);
      navigate('/chat');
    } catch {
      setIsDeleting(false);
    }
  };

  const otherParticipantId = conversation.participants.length === 2
    ? conversation.participants.find((p) => p.id !== user.id)?.id
    : undefined;

  return (
    <>
      <div
        className="relative"
        onContextMenu={handleContextMenu}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchMove={handleTouchEnd}
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
              <div className="flex items-center gap-1.5 min-w-0">
                <h3
                  className={`text-sm truncate ${
                    unreadCount > 0
                      ? 'font-bold text-gray-900 dark:text-white'
                      : isActive
                        ? 'font-medium text-gray-900 dark:text-white'
                        : 'font-medium text-gray-700 dark:text-gray-200'
                  }`}
                >
                  {conversationName}
                </h3>
                {isLindaConversation && (
                  <div className="flex items-center gap-0.5 px-1.5 py-0.5 bg-violet-100 dark:bg-violet-900/30 rounded-full flex-shrink-0">
                    <Sparkles size={10} className="text-violet-600 dark:text-violet-400" />
                    <span className="text-[10px] font-medium text-violet-600 dark:text-violet-400">AI</span>
                  </div>
                )}
              </div>
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
                      ? 'text-gray-900 dark:text-gray-100 font-semibold'
                      : 'text-gray-500 dark:text-gray-400'
                  }`}
                >
                  {lastMessagePreview}
                </p>
              )}

              {/* Unread badge */}
              {unreadCount > 0 && (
                <div className="flex-shrink-0 min-w-[20px] h-5 px-1 rounded-full bg-primary-600 dark:bg-primary-500 flex items-center justify-center">
                  <span className="text-[11px] font-bold text-white leading-none">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Context menu — WhatsApp-style dropdown on right-click / long-press */}
      {contextMenu && (
        <div
          ref={menuRef}
          className="fixed z-50 bg-white dark:bg-surface-800 rounded-lg shadow-lg border border-gray-200 dark:border-surface-700 py-1 min-w-[160px] animate-in fade-in zoom-in-95 duration-100"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            onClick={() => { setContextMenu(null); /* TODO: archive */ }}
            className="w-full px-4 py-2.5 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-surface-700 flex items-center gap-3"
          >
            <Archive size={16} className="text-gray-500 dark:text-gray-400" />
            Archive chat
          </button>
          <button
            onClick={() => { setContextMenu(null); /* TODO: mute */ }}
            className="w-full px-4 py-2.5 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-surface-700 flex items-center gap-3"
          >
            <VolumeX size={16} className="text-gray-500 dark:text-gray-400" />
            Mute notifications
          </button>
          <button
            onClick={() => { setContextMenu(null); /* TODO: pin */ }}
            className="w-full px-4 py-2.5 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-surface-700 flex items-center gap-3"
          >
            <Pin size={16} className="text-gray-500 dark:text-gray-400" />
            Pin chat
          </button>
          <div className="border-t border-gray-200 dark:border-surface-700 my-1" />
          <button
            onClick={handleDelete}
            className="w-full px-4 py-2.5 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-3"
          >
            <Trash2 size={16} />
            Delete chat
          </button>
        </div>
      )}
    </>
  );
};

export default ConversationItem;
