import React, { useState } from 'react';
import { format } from 'date-fns';
import { Check, CheckCheck } from 'lucide-react';
import { useChatStore } from '@/store/chatStore';
import { useAuthStore } from '@/store/authStore';
import { MessageResponse } from '@/services/api';
import MessageActions from './MessageActions';
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
  const { editMessage, deleteMessage, addReaction } = useChatStore();
  const { user } = useAuthStore();

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
  };

  const handlePin = () => {
    const { pinMessage } = useChatStore.getState();
    pinMessage(message.conversationId, message.id).catch((error) => {
      console.error('Failed to pin message:', error);
      alert('Failed to pin message');
    });
  };

  const handleAddReaction = (emoji: string) => {
    addReaction(message.conversationId, message.id, emoji);
    setShowEmojiPicker(false);
  };

  // Determine the read receipt status
  const getReadReceiptStatus = () => {
    if (!isOwnMessage) return null;

    // Blue double tick: message read/seen by other user
    if (message.readBy && Object.keys(message.readBy).length > 0) {
      return 'read';
    }

    // Gray double tick: message delivered/received by other user
    if (message.deliveredAt) {
      return 'delivered';
    }

    // Single gray tick: message sent to server
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

  return (
    <div
      className="group relative flex flex-col"
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => {
        setShowActions(false);
        setShowEmojiPicker(false);
      }}
    >
      {/* Message content */}
      <div className="flex items-end gap-2">
        <div
          className={`flex-1 relative ${
            isOwnMessage ? 'flex justify-end' : 'flex justify-start'
          }`}
        >
          <div
            className={`px-4 py-2 rounded-2xl relative max-w-[85vw] sm:max-w-sm ${
              isOwnMessage
                ? 'bg-blue-500 text-white rounded-br-none'
                : 'bg-slate-100 text-slate-900 rounded-bl-none'
            }`}
          >
            {/* Reply context */}
            {message.replyTo && (
              <div className={`mb-2 pb-2 border-l-2 pl-2 ${
                isOwnMessage
                  ? 'border-blue-400 opacity-90'
                  : 'border-slate-300 opacity-70'
              }`}>
                <p className={`font-medium text-[11px] ${
                  isOwnMessage ? 'text-blue-100' : 'text-slate-600'
                }`}>
                  {message.replyTo.sender?.displayName || 'Unknown'}
                </p>
                <p className={`text-xs truncate ${
                  isOwnMessage ? 'text-blue-50' : 'text-slate-600'
                }`}>
                  {message.replyTo.content}
                </p>
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
                              className="text-blue-400 dark:text-blue-300 underline hover:text-blue-300 dark:hover:text-blue-200 transition"
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
                {message.editedAt && (
                  <span className="text-xs opacity-70 mt-1 block">edited</span>
                )}
              </>
            )}
          </div>
        </div>

        {/* Timestamp & read receipt */}
        {isOwnMessage && (
          <div className="flex flex-col items-center gap-1 flex-shrink-0">
            <span className="text-xs text-slate-500">
              {format(new Date(message.createdAt), 'HH:mm')}
            </span>
            {readReceiptStatus === 'read' ? (
              /* Blue double tick: message read */
              <CheckCheck size={14} className="text-blue-500" />
            ) : readReceiptStatus === 'delivered' ? (
              /* Gray double tick: message delivered */
              <CheckCheck size={14} className="text-slate-400" />
            ) : (
              /* Single gray tick: message sent */
              <Check size={14} className="text-slate-400" />
            )}
          </div>
        )}

        {!isOwnMessage && (
          <span className="text-xs text-slate-500 flex-shrink-0">
            {format(new Date(message.createdAt), 'HH:mm')}
          </span>
        )}
      </div>

      {/* File attachments */}
      {message.attachments && message.attachments.length > 0 && (
        <div className="mt-2 flex flex-col gap-2">
          {message.attachments.map((attachment) => {
            // Check if it's an audio file (voice message)
            if (attachment.mimeType.startsWith('audio/')) {
              return (
                <VoiceMessagePlayer
                  key={attachment.id}
                  url={attachment.url}
                />
              );
            }
            // Regular file card for other file types
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
        <div className="flex flex-wrap gap-1 mt-2">
          {reactionGroups.map((reaction, idx) => (
            <button
              key={`${reaction.emoji}-${idx}`}
              className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium transition ${
                reaction.userReacted
                  ? isOwnMessage
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-300 text-slate-900'
                  : isOwnMessage
                    ? 'bg-blue-600 bg-opacity-30 text-white hover:bg-opacity-50'
                    : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
              }`}
              onClick={() => handleAddReaction(reaction.emoji)}
            >
              <span>{reaction.emoji}</span>
              <span>{reaction.count}</span>
            </button>
          ))}
        </div>
      )}

      {/* Message actions toolbar */}
      {showActions && (
        <MessageActions
          message={message}
          isOwnMessage={isOwnMessage}
          onReply={handleReply}
          onEdit={() => setIsEditing(true)}
          onDelete={handleDelete}
          onReact={() => setShowEmojiPicker(!showEmojiPicker)}
          showEmojiPicker={showEmojiPicker}
          onAddReaction={handleAddReaction}
          onPin={handlePin}
          onForward={() => setShowForwardModal(true)}
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
