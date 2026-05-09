import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { Trash2, Archive, VolumeX, Volume2, Pin, Sparkles, ClipboardList, FolderKanban, Users, Lock, Timer, Fingerprint } from 'lucide-react';
import { ConversationResponse, api } from '@/services/api';
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
  const msg = conversation.lastMessage as any;
  if (msg.content?.trim()) {
    return msg.content.slice(0, 50);
  }
  // Check attachments for specific preview labels
  const attachments = msg.attachments || [];
  if (attachments.length > 0) {
    const first = attachments[0];
    const mime = first.mimeType || '';
    if (mime.startsWith('audio/')) return '🎤 Voice message';
    if (mime.startsWith('image/')) return '📷 Photo';
    if (mime.startsWith('video/')) return '🎥 Video';
    return '📎 ' + (first.fileName || 'File');
  }
  return 'Attachment';
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
  const [showLockPrompt, setShowLockPrompt] = useState(false);
  const [lockPinInput, setLockPinInput] = useState('');
  const [lockError, setLockError] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Check if this chat is locked
  const isLockedChat = !!localStorage.getItem(`chat_lock_${conversation.id}`);
  const hasBiometric = !!localStorage.getItem(`chat_biometric_${conversation.id}`);

  // Biometric unlock via WebAuthn
  const handleBiometricUnlock = useCallback(async () => {
    const credentialIdB64 = localStorage.getItem(`chat_biometric_${conversation.id}`);
    if (!credentialIdB64) return;

    try {
      const credentialId = Uint8Array.from(atob(credentialIdB64), (c) => c.charCodeAt(0));
      const challenge = crypto.getRandomValues(new Uint8Array(32));

      const assertion = await navigator.credentials.get({
        publicKey: {
          challenge,
          allowCredentials: [{ id: credentialId, type: 'public-key', transports: ['internal'] }],
          userVerification: 'required',
          timeout: 60000,
        },
      });

      if (assertion) {
        setShowLockPrompt(false);
        navigate(`/chat/${conversation.id}`);
        onNavigate?.();
      }
    } catch {
      setLockError('Biometric failed. Use PIN instead.');
    }
  }, [conversation.id, navigate, onNavigate]);

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
    // Check if chat is locked — require PIN
    if (isLockedChat) {
      setShowLockPrompt(true);
      setLockPinInput('');
      setLockError('');
      return;
    }
    navigate(`/chat/${conversation.id}`);
    onNavigate?.();
  };

  const handleLockUnlock = () => {
    const savedPin = localStorage.getItem(`chat_lock_${conversation.id}`);
    if (savedPin && lockPinInput === savedPin) {
      setShowLockPrompt(false);
      navigate(`/chat/${conversation.id}`);
      onNavigate?.();
    } else {
      setLockError('Incorrect PIN');
      setLockPinInput('');
    }
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
          className={`w-full px-3 py-2 rounded-lg transition-all duration-200 ease-out flex items-center gap-3 hover:bg-gray-100 dark:hover:bg-surface-800 cursor-pointer ${
            isActive
              ? 'bg-primary-50 dark:bg-primary-900/20 shadow-sm'
              : ''
          } ${isDeleting ? 'opacity-50 pointer-events-none' : ''}`}
        >
          {/* Avatar with online indicator and optional story ring */}
          <div
            className="relative flex-shrink-0"
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
                {conversation.linkedTask && (
                  <div className="flex items-center gap-0.5 px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/30 rounded-full flex-shrink-0">
                    <ClipboardList size={10} className="text-amber-600 dark:text-amber-400" />
                    <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400">Task</span>
                  </div>
                )}
                {conversation.linkedProject && (
                  <div className="flex items-center gap-0.5 px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 rounded-full flex-shrink-0">
                    <FolderKanban size={10} className="text-blue-600 dark:text-blue-400" />
                    <span className="text-[10px] font-medium text-blue-600 dark:text-blue-400">Project</span>
                  </div>
                )}
                {!isLindaConversation && !conversation.linkedTask && !conversation.linkedProject && conversation.participants.length > 2 && (
                  <div className="flex items-center gap-0.5 px-1.5 py-0.5 bg-green-100 dark:bg-green-900/30 rounded-full flex-shrink-0">
                    <Users size={10} className="text-green-600 dark:text-green-400" />
                    <span className="text-[10px] font-medium text-green-600 dark:text-green-400">Group</span>
                  </div>
                )}
                {isLockedChat && (
                  <Lock size={12} className="text-amber-500 flex-shrink-0" />
                )}
                {conversation.disappearingSeconds && (
                  <Timer size={12} className="text-emerald-500 flex-shrink-0" />
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
                  {isLockedChat ? 'Chat locked' : lastMessagePreview}
                </p>
              )}

              {/* Muted indicator */}
              {conversation.isMuted && (
                <VolumeX size={14} className="flex-shrink-0 text-slate-400 dark:text-slate-500" />
              )}
              {/* Unread badge */}
              {unreadCount > 0 && (
                <div className={`flex-shrink-0 min-w-[20px] h-5 px-1 rounded-full flex items-center justify-center ${
                  conversation.isMuted
                    ? 'bg-slate-400 dark:bg-slate-500'
                    : 'bg-primary-600 dark:bg-primary-500'
                }`}>
                  <span className="text-[11px] font-bold text-white leading-none">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Lock prompt modal */}
      {showLockPrompt && (
        <div
          className="fixed inset-0 z-[999] flex items-center justify-center bg-black/50"
          onClick={(e) => { if (e.target === e.currentTarget) setShowLockPrompt(false); }}
        >
          <div className="bg-white dark:bg-surface-800 rounded-2xl shadow-xl p-6 w-80 mx-4">
            <div className="flex flex-col items-center mb-4">
              <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mb-3">
                <Lock size={24} className="text-amber-600 dark:text-amber-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Chat Locked</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 text-center">Enter PIN to open this chat</p>
            </div>
            {/* PIN dots */}
            <div className="flex justify-center gap-3 mb-4">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className={`w-3 h-3 rounded-full transition ${
                    lockPinInput.length > i ? 'bg-amber-500' : 'bg-gray-200 dark:bg-surface-600'
                  }`}
                />
              ))}
            </div>
            <input
              type="password"
              inputMode="numeric"
              autoFocus
              value={lockPinInput}
              onChange={(e) => setLockPinInput(e.target.value.replace(/\D/g, ''))}
              onKeyDown={(e) => { if (e.key === 'Enter') handleLockUnlock(); }}
              placeholder="Enter PIN"
              className="w-full px-4 py-2 text-center text-lg tracking-widest bg-gray-50 dark:bg-surface-700 border border-gray-200 dark:border-surface-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 mb-3"
              maxLength={8}
            />
            {lockError && (
              <p className="text-xs text-red-500 text-center mb-3">{lockError}</p>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => setShowLockPrompt(false)}
                className="flex-1 px-4 py-2 text-sm text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-surface-700 rounded-lg hover:bg-gray-200 dark:hover:bg-surface-600"
              >
                Cancel
              </button>
              <button
                onClick={handleLockUnlock}
                disabled={lockPinInput.length < 4}
                className="flex-1 px-4 py-2 text-sm text-white bg-amber-500 rounded-lg hover:bg-amber-600 disabled:opacity-50"
              >
                Unlock
              </button>
            </div>
            {hasBiometric && (
              <button
                onClick={handleBiometricUnlock}
                className="w-full mt-3 px-4 py-2.5 text-sm text-white bg-emerald-500 rounded-lg hover:bg-emerald-600 transition flex items-center justify-center gap-2"
              >
                <Fingerprint size={16} />
                Unlock with Fingerprint / Face ID
              </button>
            )}
          </div>
        </div>
      )}

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
            onClick={async () => {
              setContextMenu(null);
              try {
                const isMuted = conversation.isMuted;
                await api.updateChatSettings(conversation.id, {
                  isMuted: !isMuted,
                  muteUntil: null,
                });
                // Refresh conversations
                const { fetchConversations } = useChatStore.getState();
                fetchConversations();
              } catch (err) {
                console.error('Failed to toggle mute:', err);
              }
            }}
            className="w-full px-4 py-2.5 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-surface-700 flex items-center gap-3"
          >
            {conversation.isMuted ? (
              <>
                <Volume2 size={16} className="text-gray-500 dark:text-gray-400" />
                Unmute notifications
              </>
            ) : (
              <>
                <VolumeX size={16} className="text-gray-500 dark:text-gray-400" />
                Mute notifications
              </>
            )}
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
