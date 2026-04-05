import React, { useState, useRef, useCallback, useEffect } from 'react';
import { format } from 'date-fns';
import { Check, CheckCheck } from 'lucide-react';
import { useChatStore } from '@/store/chatStore';
import { useAuthStore } from '@/store/authStore';
import { MessageResponse } from '@/services/api';
import MessageActions from './MessageActions';
import MessageContextMenu from './MessageContextMenu';
import FileCard from './FileCard';
import LinkPreview from './LinkPreview';
import VoiceMessagePlayer from './VoiceMessagePlayer';
import ForwardModal from './ForwardModal';
import { extractUrls, linkifyText } from '@/utils/urlDetector';

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
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const { editMessage, deleteMessage, addReaction } = useChatStore();
  const { user } = useAuthStore();
  const [isMobile] = useState(window.innerWidth < 768);

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

  const handlePin = () => {
    const { pinMessage } = useChatStore.getState();
    pinMessage(message.conversationId, message.id).catch((error) => {
      console.error('Failed to pin message:', error);
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

  // Determine the read receipt status
  const getReadReceiptStatus = () => {
    if (!isOwnMessage) return null;
    if (message.readBy && Object.keys(message.readBy).length > 0) {
      return 'read';
    }
    if (message.deliveredAt) {
      return 'delivered';
    }
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

  // Tick component inline
  const TickIcon = () => {
    if (!isOwnMessage || !readReceiptStatus) return null;
    if (readReceiptStatus === 'read') {
      return <CheckCheck size={14} className="text-blue-400 inline ml-1 flex-shrink-0" />;
    } else if (readReceiptStatus === 'delivered') {
      return <CheckCheck size={14} className="text-white/60 inline ml-1 flex-shrink-0" />;
    }
    return <Check size={14} className="text-white/60 inline ml-1 flex-shrink-0" />;
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

  return (
    <div
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
            className={`px-3 py-1.5 rounded-2xl relative max-w-[80vw] sm:max-w-sm ${
              isOwnMessage
                ? 'bg-blue-500 text-white rounded-br-none'
                : 'bg-slate-100 dark:bg-surface-700 text-slate-900 dark:text-white rounded-bl-none'
            }`}
            style={{ overflowWrap: 'break-word', wordBreak: 'break-word' }}
          >
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
                {message.content && (
                  <>
                    <p className="break-words text-sm leading-relaxed">
                      {linkifyText(message.content).map((part, i) =>
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
                    </p>
                    {extractUrls(message.content).length > 0 && (
                      <LinkPreview url={extractUrls(message.content)[0]} />
                    )}
                  </>
                )}

                {/* Timestamp + edited + ticks INSIDE the bubble */}
                <div className={`flex items-center justify-end gap-1 mt-0.5 -mb-0.5 ${
                  isOwnMessage ? 'text-blue-100/70' : 'text-slate-400 dark:text-gray-500'
                }`}>
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

      {/* File attachments */}
      {message.attachments && message.attachments.length > 0 && (
        <div className={`mt-1 flex flex-col gap-2 ${isOwnMessage ? 'items-end' : 'items-start'}`}>
          {message.attachments.map((attachment) => {
            if (attachment.mimeType.startsWith('audio/')) {
              return (
                <VoiceMessagePlayer
                  key={attachment.id}
                  url={attachment.url}
                />
              );
            }
            return (
              <FileCard
                key={attachment.id}
                fileName={attachment.fileName}
                fileSize={attachment.fileSize}
                mimeType={attachment.mimeType}
                url={attachment.url}
              />
            );
          })}
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
