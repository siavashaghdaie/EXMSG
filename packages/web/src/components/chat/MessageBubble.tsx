import React, { useState, useRef, useCallback, useEffect } from 'react';
import { format } from 'date-fns';
import { Check, CheckCheck, Volume2, Globe, Timer, Eye } from 'lucide-react';
import { useChatStore } from '@/store/chatStore';
import { useAuthStore } from '@/store/authStore';
import { MessageResponse, api } from '@/services/api';
import MessageActions from './MessageActions';
import MessageContextMenu from './MessageContextMenu';
import FileCard from './FileCard';
import LinkPreview from './LinkPreview';
import VoiceMessagePlayer from './VoiceMessagePlayer';
import ForwardModal from './ForwardModal';
import { extractUrls, linkifyText } from '@/utils/urlDetector';

/** Render markdown-style formatting (bold, italic, strikethrough, code, line breaks) as HTML */
function formatMarkdown(text: string): React.ReactNode[] {
  return text.split('\n').map((line, i) => {
    const html = line
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/~~(.*?)~~/g, '<del>$1</del>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code class="bg-slate-200 dark:bg-slate-600 px-1 rounded text-xs font-mono">$1</code>')
      // Render ─── lines as visual dividers
      .replace(/^[─]{3,}$/g, '<hr class="border-slate-300 dark:border-slate-600 my-1" />')
      // Render progress bars with monospace
      .replace(/([█░]{2,}\s*\d+%)/g, '<span class="font-mono text-xs">$1</span>');
    return (
      <span key={i}>
        {i > 0 && <br />}
        <span dangerouslySetInnerHTML={{ __html: html }} />
      </span>
    );
  });
}

interface MessageBubbleProps {
  message: MessageResponse;
  isOwnMessage: boolean;
  showAvatar?: boolean;
}

export default function MessageBubble({
  message,
  isOwnMessage,
}: MessageBubbleProps) {
  const [showActions, setShowActions] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(message.content);
  const [showForwardModal, setShowForwardModal] = useState(false);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 });
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [viewOnceRevealed, setViewOnceRevealed] = useState(false);
  const [viewOnceExpired, setViewOnceExpired] = useState(!!message.viewedAt && !isOwnMessage);
  const [expiresIn, setExpiresIn] = useState<string | null>(null);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const { editMessage, deleteMessage, addReaction, pinnedMessages } = useChatStore();
  const { user } = useAuthStore();
  const [isMobile] = useState(window.innerWidth < 768);
  const isPinned = (pinnedMessages.get(message.conversationId) || []).some(p => p.id === message.id);

  // Disappearing message countdown timer
  useEffect(() => {
    if (!message.expiresAt) return;
    const updateTimer = () => {
      const remaining = new Date(message.expiresAt!).getTime() - Date.now();
      if (remaining <= 0) {
        setExpiresIn('expired');
        return;
      }
      const hours = Math.floor(remaining / 3600000);
      const mins = Math.floor((remaining % 3600000) / 60000);
      if (hours > 24) {
        const days = Math.floor(hours / 24);
        setExpiresIn(`${days}d`);
      } else if (hours > 0) {
        setExpiresIn(`${hours}h ${mins}m`);
      } else {
        const secs = Math.floor((remaining % 60000) / 1000);
        setExpiresIn(`${mins}:${secs.toString().padStart(2, '0')}`);
      }
    };
    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [message.expiresAt]);

  // Handle view-once media click
  const handleViewOnce = async () => {
    if (!message.isViewOnce || isOwnMessage) return;
    if (viewOnceExpired) return;
    try {
      const result = await api.markViewOnce(message.id);
      if (result.alreadyViewed) {
        setViewOnceExpired(true);
      } else {
        setViewOnceRevealed(true);
        // Auto-hide after 5 seconds
        setTimeout(() => {
          setViewOnceRevealed(false);
          setViewOnceExpired(true);
        }, 5000);
      }
    } catch (err) {
      console.error('Failed to mark view-once:', err);
    }
  };

  // Check if message is editable (within 10 minutes)
  const isEditable = useCallback(() => {
    if (!isOwnMessage) return false;
    const createdAt = new Date(message.createdAt).getTime();
    const now = Date.now();
    const tenMinutes = 10 * 60 * 1000;
    return (now - createdAt) < tenMinutes;
  }, [isOwnMessage, message.createdAt]);

  const handleEdit = () => {
    if (editedContent.trim()) {
      editMessage(message.conversationId, message.id, editedContent);
      setIsEditing(false);
    }
  };

  const handleDelete = () => {
    if (window.confirm('Delete this message?')) {
      deleteMessage(message.conversationId, message.id);
    }
  };

  const handleReply = () => {
    const { setReplyingTo } = useChatStore.getState();
    setReplyingTo({
      messageId: message.id,
      content: message.content,
      senderName: message.sender?.displayName || 'Unknown',
    });
    setShowContextMenu(false);
  };

  const showFeedback = (text: string) => {
    setActionFeedback(text);
    setTimeout(() => setActionFeedback(null), 2000);
  };

  const handlePin = () => {
    const { pinMessage, unpinMessage, pinnedMessages } = useChatStore.getState();
    const pins = pinnedMessages.get(message.conversationId) || [];
    const isPinned = pins.some(p => p.id === message.id);

    if (isPinned) {
      unpinMessage(message.conversationId, message.id)
        .then(() => showFeedback('Unpinned'))
        .catch((error) => {
          console.error('Failed to unpin message:', error);
          showFeedback('Failed to unpin');
        });
    } else {
      pinMessage(message.conversationId, message.id)
        .then(() => showFeedback('📌 Pinned'))
        .catch((error) => {
          console.error('Failed to pin message:', error);
          showFeedback('Failed to pin');
        });
    }
    setShowContextMenu(false);
  };

  const handleStar = () => {
    api.starMessage(message.conversationId, message.id)
      .then(() => showFeedback('⭐ Starred'))
      .catch((error) => {
        console.error('Failed to star message:', error);
        showFeedback('Failed to star');
      });
    setShowContextMenu(false);
  };

  const handleCopy = () => {
    if (message.content) {
      navigator.clipboard.writeText(message.content).catch(() => {});
    }
    setShowContextMenu(false);
  };

  const handleAddReaction = (emoji: string) => {
    addReaction(message.conversationId, message.id, emoji);
    setShowEmojiPicker(false);
  };

  // Long press handler for mobile context menu
  const handleTouchStart = (e: React.TouchEvent) => {
    longPressTimerRef.current = setTimeout(() => {
      const touch = e.touches[0];
      setContextMenuPos({ x: touch.clientX, y: touch.clientY });
      setShowContextMenu(true);
    }, 500);
  };

  const handleTouchEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleTouchMove = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  // Right-click context menu for desktop
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenuPos({ x: e.clientX, y: e.clientY });
    setShowContextMenu(true);
  };

  // Close context menu when clicking outside
  useEffect(() => {
    if (!showContextMenu) return;
    const handleClickOutside = () => setShowContextMenu(false);
    document.addEventListener('click', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [showContextMenu]);

  // Determine the read receipt status (WhatsApp-style)
  // Single tick = sent to server, double grey tick = delivered, double blue tick = read
  const getReadReceiptStatus = () => {
    if (!isOwnMessage) return null;
    // Check if any OTHER user has read the message
    if (message.readBy) {
      const readByOthers = Object.keys(message.readBy).filter(uid => uid !== user?.id);
      if (readByOthers.length > 0) return 'read';
    }
    // Message exists on server = delivered (server stores it, recipient can fetch)
    if (message.id) return 'delivered';
    // Optimistic/pending message = sent
    return 'sent';
  };

  const readReceiptStatus = getReadReceiptStatus();

  // Group reactions
  const reactionGroups = React.useMemo(() => {
    if (!message.reactions) return [];
    return Object.entries(message.reactions).map(([emoji, userIds]) => ({
      emoji,
      count: userIds.length,
      userReacted: userIds.includes(user?.id || ''),
    }));
  }, [message.reactions, user?.id]);

  // Tick component inline (WhatsApp-style: single grey=sent, double grey=delivered, double bright=read)
  const TickIcon = () => {
    if (!isOwnMessage || !readReceiptStatus) return null;
    if (readReceiptStatus === 'read') {
      // Bright green for read — maximum contrast against blue bubble
      return <CheckCheck size={16} className="inline ml-1 flex-shrink-0" style={{ color: '#00FF88' }} />;
    } else if (readReceiptStatus === 'delivered') {
      return <CheckCheck size={14} className="text-white/50 inline ml-1 flex-shrink-0" />;
    }
    return <Check size={14} className="text-white/50 inline ml-1 flex-shrink-0" />;
  };

  // Tick for received messages (no tick, just timestamp)
  const TickIconOther = () => null;

  // Render buzz messages as centered system messages
  if (message.type === 'buzz') {
    return (
      <div className="flex justify-center my-2">
        <div className="px-4 py-1.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded-full text-xs font-medium animate-pulse">
          {message.content}
        </div>
      </div>
    );
  }

  // Render SYSTEM messages (calls, etc.) as centered info messages
  if (message.type === 'SYSTEM') {
    return (
      <div className="flex justify-center my-2">
        <div className="px-4 py-1.5 bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 rounded-full text-xs font-medium">
          {message.content}
        </div>
      </div>
    );
  }

  // Render deleted/expired messages
  if (message.isDeleted || expiresIn === 'expired') {
    return (
      <div
        id={`msg-${message.id}`}
        className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'} my-0.5`}
      >
        <div className={`px-3 py-1.5 rounded-2xl italic text-xs ${
          isOwnMessage
            ? 'bg-blue-500/30 text-blue-200 rounded-br-none'
            : 'bg-slate-100/50 dark:bg-surface-700/50 text-slate-400 dark:text-gray-500 rounded-bl-none'
        }`}>
          <Timer size={12} className="inline mr-1" />
          This message has disappeared
        </div>
      </div>
    );
  }

  return (
    <div
      id={`msg-${message.id}`}
      ref={bubbleRef}
      className="group relative flex flex-col"
      onMouseEnter={() => !isMobile && setShowActions(true)}
      onMouseLeave={() => {
        setShowActions(false);
        setShowEmojiPicker(false);
      }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchMove}
      onContextMenu={handleContextMenu}
    >
      {/* Message content */}
      <div className="flex items-end gap-1">
        <div
          className={`flex-1 relative ${
            isOwnMessage ? 'flex justify-end' : 'flex justify-start'
          }`}
        >
          <div
            className={`px-3 py-1.5 rounded-2xl relative max-w-[75vw] sm:max-w-md ${
              isOwnMessage
                ? 'bg-blue-500 text-white rounded-br-none'
                : 'bg-slate-100 dark:bg-surface-700 text-slate-900 dark:text-white rounded-bl-none'
            }`}
            style={{ overflowWrap: 'break-word', wordBreak: 'break-word' }}
          >
            {/* Story reply thumbnail */}
            {message.type === 'STORY_REPLY' && message.metadata && (() => {
              try {
                const story = JSON.parse(message.metadata);
                return (
                  <div className="mb-2 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-600">
                    <div className="flex items-center gap-1.5 px-2 py-1 bg-slate-100 dark:bg-slate-700 text-[10px] text-slate-500 dark:text-slate-400">
                      <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>
                      Replied to story
                    </div>
                    {story.storyType === 'text' ? (
                      <div
                        className="px-3 py-2 text-xs text-white font-medium leading-snug"
                        style={{ backgroundColor: story.storyBgColor || '#6366f1', minHeight: 48 }}
                      >
                        {story.storyContent?.substring(0, 100)}{story.storyContent?.length > 100 ? '...' : ''}
                      </div>
                    ) : (
                      <div className="relative" style={{ maxHeight: 120 }}>
                        <img
                          src={story.storyContent}
                          alt="Story"
                          className="w-full h-full object-cover"
                          style={{ maxHeight: 120 }}
                        />
                      </div>
                    )}
                  </div>
                );
              } catch {
                return null;
              }
            })()}

            {/* Reply context */}
            {message.replyTo && (
              <div className={`mb-1.5 pb-1.5 border-l-2 pl-2 ${
                isOwnMessage
                  ? 'border-blue-300 bg-blue-600/30 rounded-r-lg px-2 py-1'
                  : 'border-primary-400 bg-slate-200/50 dark:bg-surface-600/50 rounded-r-lg px-2 py-1'
              }`}>
                <p className={`font-semibold text-[11px] ${
                  isOwnMessage ? 'text-blue-100' : 'text-primary-600 dark:text-primary-400'
                }`}>
                  {message.replyTo.sender?.displayName || 'Unknown'}
                </p>
                <p className={`text-xs truncate ${
                  isOwnMessage ? 'text-blue-50/80' : 'text-slate-500 dark:text-gray-400'
                }`}>
                  {message.replyTo.content}
                </p>
              </div>
            )}

            {/* Forwarded label */}
            {(message as any).isForwarded && (
              <p className={`text-[10px] italic mb-0.5 ${isOwnMessage ? 'text-blue-200' : 'text-slate-400'}`}>
                Forwarded
              </p>
            )}

            {/* Voice message attachments rendered INSIDE the bubble */}
            {message.attachments && message.attachments.some(a => a.mimeType.startsWith('audio/')) && (
              <div className="mt-1 mb-1">
                {message.attachments.filter(a => a.mimeType.startsWith('audio/')).map((attachment) => (
                  <VoiceMessagePlayer
                    key={attachment.id}
                    url={attachment.url}
                  />
                ))}
                {/* Voice translation — translated transcript shown below voice player */}
                {message.translatedContent && (
                  <div className="mt-1.5">
                    <div className="break-words text-[12px] leading-snug">
                      {message.translatedContent}
                    </div>
                    <div className={`flex items-center gap-1 mt-1 pt-1 border-t ${
                      isOwnMessage ? 'border-blue-400/30' : 'border-slate-200 dark:border-slate-600'
                    }`}>
                      <Globe size={10} className={isOwnMessage ? 'text-blue-200/60' : 'text-emerald-500/60'} />
                      <span className={`text-[10px] uppercase font-medium ${
                        isOwnMessage ? 'text-blue-200/60' : 'text-emerald-500/60'
                      }`}>
                        {message.translatedFrom || 'auto'} → {message.translatedTo || ''}
                      </span>
                    </div>
                    {(message as any).voiceTranscript && (
                      <div className={`break-words text-[10px] leading-snug mt-0.5 italic ${
                        isOwnMessage ? 'text-blue-100/40' : 'text-slate-400/60 dark:text-slate-500/60'
                      }`}>
                        {(message as any).voiceTranscript}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {isEditing ? (
              <div className="flex flex-col gap-2">
                <textarea
                  autoFocus
                  value={editedContent}
                  onChange={(e) => setEditedContent(e.target.value)}
                  className="w-full px-3 py-1 bg-slate-800 text-white rounded border border-slate-600 resize-none text-sm"
                  rows={2}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleEdit();
                    }
                    if (e.key === 'Escape') {
                      setIsEditing(false);
                      setEditedContent(message.content);
                    }
                  }}
                />
                <div className="flex gap-1 justify-end">
                  <button
                    onClick={handleEdit}
                    className="px-2 py-1 bg-green-500 text-white rounded text-xs hover:bg-green-600"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => {
                      setIsEditing(false);
                      setEditedContent(message.content);
                    }}
                    className="px-2 py-1 bg-slate-600 text-white rounded text-xs hover:bg-slate-700"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                {message.content && !(message.attachments && message.attachments.length > 0) && (
                  <>
                    <div className="flex items-end gap-1">
                      <div className="flex-1">
                        {/* Translated content (shown first when available) */}
                        {message.translatedContent && (
                          <>
                            <div className="break-words text-[13px] leading-snug">
                              {linkifyText(message.translatedContent).map((part, i) =>
                                typeof part === 'string'
                                  ? part
                                  : (
                                    <a
                                      key={i}
                                      href={part.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className={`underline transition ${
                                        isOwnMessage
                                          ? 'text-blue-100 hover:text-white'
                                          : 'text-blue-500 hover:text-blue-600'
                                      }`}
                                    >
                                      {part.url}
                                    </a>
                                  )
                              )}
                            </div>
                            {/* Language badge + original text */}
                            <div className={`flex items-center gap-1 mt-1 pt-1 border-t ${
                              isOwnMessage ? 'border-blue-400/30' : 'border-slate-200 dark:border-slate-600'
                            }`}>
                              <Globe size={10} className={isOwnMessage ? 'text-blue-200/60' : 'text-emerald-500/60'} />
                              <span className={`text-[10px] uppercase font-medium ${
                                isOwnMessage ? 'text-blue-200/60' : 'text-emerald-500/60'
                              }`}>
                                {message.translatedFrom || 'auto'}
                              </span>
                            </div>
                            <div className={`break-words text-[11px] leading-snug mt-0.5 ${
                              isOwnMessage ? 'text-blue-100/50' : 'text-slate-400 dark:text-slate-500'
                            }`}>
                              {message.content}
                            </div>
                          </>
                        )}
                        {/* Original content (shown when no translation) */}
                        {!message.translatedContent && (
                          <div className="break-words text-[13px] leading-snug">
                            {message.sender?.username === 'linda'
                              ? formatMarkdown(message.content)
                              : linkifyText(message.content).map((part, i) =>
                                  typeof part === 'string'
                                    ? part
                                    : (
                                      <a
                                        key={i}
                                        href={part.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className={`underline transition ${
                                          isOwnMessage
                                            ? 'text-blue-100 hover:text-white'
                                            : 'text-blue-500 hover:text-blue-600'
                                        }`}
                                      >
                                        {part.url}
                                      </a>
                                    )
                                )
                            }
                          </div>
                        )}
                      </div>
                      {/* Voice button for Linda's messages */}
                      {message.sender?.username === 'linda' && message.content && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const utterance = new SpeechSynthesisUtterance(message.content);
                            utterance.rate = 1.0;
                            utterance.pitch = 1.0;
                            // Try to find a female voice
                            const voices = window.speechSynthesis.getVoices();
                            const femaleVoice = voices.find(v => v.name.includes('Female') || v.name.includes('Samantha') || v.name.includes('Victoria') || v.name.includes('Karen'));
                            if (femaleVoice) utterance.voice = femaleVoice;
                            window.speechSynthesis.cancel(); // Stop any current speech
                            window.speechSynthesis.speak(utterance);
                          }}
                          className="inline-flex items-center justify-center w-6 h-6 rounded-full hover:bg-white/30 dark:hover:bg-slate-600/50 transition ml-1 flex-shrink-0"
                          title="Listen to Linda's message"
                        >
                          <Volume2 size={12} className="text-slate-500 dark:text-slate-400" />
                        </button>
                      )}
                    </div>
                    {extractUrls(message.content).length > 0 && (
                      <LinkPreview url={extractUrls(message.content)[0]} />
                    )}
                  </>
                )}

                {/* Timestamp + edited + disappearing timer + view-once + ticks INSIDE the bubble */}
                <div className={`flex items-center justify-end gap-1 mt-0.5 -mb-0.5 ${
                  isOwnMessage ? 'text-blue-100/70' : 'text-slate-400 dark:text-gray-500'
                }`}>
                  {message.isViewOnce && (
                    <span className="text-[10px] flex items-center gap-0.5" title="View once">
                      <Eye size={10} />
                    </span>
                  )}
                  {expiresIn && expiresIn !== 'expired' && (
                    <span className="text-[10px] flex items-center gap-0.5" title="Disappearing message">
                      <Timer size={10} />
                      {expiresIn}
                    </span>
                  )}
                  {message.editedAt && (
                    <span className="text-[10px] italic">edited</span>
                  )}
                  <span className="text-[10px]">
                    {format(new Date(message.createdAt), 'HH:mm')}
                  </span>
                  {isOwnMessage && <TickIcon />}
                  {!isOwnMessage && <TickIconOther />}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* File attachments (non-audio only — voice messages are rendered inside the bubble) */}
      {message.attachments && message.attachments.filter(a => !a.mimeType.startsWith('audio/')).length > 0 && (
        <div className={`mt-1 flex flex-col gap-2 ${isOwnMessage ? 'items-end' : 'items-start'}`}>
          {message.isViewOnce && !isOwnMessage && !viewOnceRevealed ? (
            // View-once overlay
            <button
              onClick={handleViewOnce}
              className={`relative flex items-center gap-2 px-4 py-3 rounded-xl transition ${
                viewOnceExpired
                  ? 'bg-slate-200 dark:bg-surface-700 text-slate-400 dark:text-gray-500 cursor-not-allowed'
                  : 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-200 dark:hover:bg-emerald-900/50 cursor-pointer'
              }`}
              disabled={viewOnceExpired}
            >
              <Eye size={20} />
              <span className="text-sm font-medium">
                {viewOnceExpired ? 'Opened' : 'View once photo'}
              </span>
            </button>
          ) : (
            message.attachments.filter(a => !a.mimeType.startsWith('audio/')).map((attachment) => (
              <FileCard
                key={attachment.id}
                fileName={attachment.fileName}
                fileSize={attachment.fileSize}
                mimeType={attachment.mimeType}
                url={attachment.url}
              />
            ))
          )}
          {/* View-once countdown */}
          {message.isViewOnce && viewOnceRevealed && (
            <div className="text-[10px] text-amber-500 dark:text-amber-400 flex items-center gap-1">
              <Eye size={10} /> Disappears in 5 seconds...
            </div>
          )}
        </div>
      )}

      {/* Action Feedback Toast */}
      {actionFeedback && (
        <div className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'} mt-1`}>
          <div className="px-2.5 py-1 bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-800 text-xs font-medium rounded-full shadow-lg animate-pulse">
            {actionFeedback}
          </div>
        </div>
      )}

      {/* Reactions */}
      {reactionGroups.length > 0 && (
        <div className={`flex flex-wrap gap-1 mt-1 ${isOwnMessage ? 'justify-end' : 'justify-start'}`}>
          {reactionGroups.map((reaction, idx) => (
            <button
              key={`${reaction.emoji}-${idx}`}
              className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition ${
                reaction.userReacted
                  ? isOwnMessage
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-300 dark:bg-surface-600 text-slate-900 dark:text-white'
                  : isOwnMessage
                    ? 'bg-blue-600 bg-opacity-30 text-white hover:bg-opacity-50'
                    : 'bg-slate-200 dark:bg-surface-700 text-slate-700 dark:text-gray-300 hover:bg-slate-300'
              }`}
              onClick={() => handleAddReaction(reaction.emoji)}
            >
              <span>{reaction.emoji}</span>
              <span>{reaction.count}</span>
            </button>
          ))}
        </div>
      )}

      {/* Desktop hover actions toolbar */}
      {showActions && !isMobile && (
        <MessageActions
          message={message}
          isOwnMessage={isOwnMessage}
          isPinned={isPinned}
          onReply={handleReply}
          onEdit={() => {
            if (isEditable()) {
              setIsEditing(true);
            } else {
              alert('Messages can only be edited within 10 minutes of sending.');
            }
          }}
          onDelete={handleDelete}
          onReact={() => setShowEmojiPicker(!showEmojiPicker)}
          showEmojiPicker={showEmojiPicker}
          onAddReaction={handleAddReaction}
          onPin={handlePin}
          onForward={() => setShowForwardModal(true)}
        />
      )}

      {/* Mobile/Desktop context menu (long press or right-click) */}
      {showContextMenu && (
        <MessageContextMenu
          message={message}
          isOwnMessage={isOwnMessage}
          isEditable={isEditable()}
          position={contextMenuPos}
          onReply={handleReply}
          onEdit={() => {
            if (isEditable()) {
              setIsEditing(true);
              setShowContextMenu(false);
            }
          }}
          onForward={() => {
            setShowForwardModal(true);
            setShowContextMenu(false);
          }}
          onCopy={handleCopy}
          onPin={handlePin}
          onStar={handleStar}
          onDelete={() => {
            handleDelete();
            setShowContextMenu(false);
          }}
          onClose={() => setShowContextMenu(false)}
        />
      )}

      {/* Forward modal */}
      {showForwardModal && (
        <ForwardModal
          messageId={message.id}
          messagePreview={message.content || ''}
          onClose={() => setShowForwardModal(false)}
        />
      )}
    </div>
  );
}
