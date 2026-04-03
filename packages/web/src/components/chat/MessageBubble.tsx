import React, { useState } from 'react';
import { format } from 'date-fns';
import { Check, CheckCheck, X } from 'lucide-react';
import { useChatStore } from '@/store/chatStore';
import { useAuthStore } from '@/store/authStore';
import MessageActions from './MessageActions';
import EmojiPicker from './EmojiPicker';

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

interface MessageBubbleProps {
  message: Message;
  isOwnMessage: boolean;
  showAvatar?: boolean;
}

export default function MessageBubble({
  message,
  isOwnMessage,
  showAvatar,
}: MessageBubbleProps) {
  const [showActions, setShowActions] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(message.content);
  const { editMessage, deleteMessage, setReplyingTo } = useChatStore();
  const { user } = useAuthStore();

  const handleEdit = () => {
    if (editedContent.trim()) {
      editMessage(message.id, editedContent);
      setIsEditing(false);
    }
  };

  const handleDelete = () => {
    if (window.confirm('Delete this message?')) {
      deleteMessage(message.id);
    }
  };

  const handleReply = () => {
    setReplyingTo({
      id: message.id,
      senderName: message.senderName,
      content: message.content,
    });
  };

  const handleAddReaction = (emoji: string) => {
    const { addReaction } = useChatStore();
    addReaction(message.id, emoji);
    setShowEmojiPicker(false);
  };

  // Check if message is fully read by all recipients
  const isFullyRead =
    message.readBy &&
    Object.keys(message.readBy).length > 0;

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
      {/* Reply preview */}
      {message.replyTo && (
        <div className="mb-2 text-xs">
          <div
            className={`${
              isOwnMessage
                ? 'bg-blue-50 border-l-2 border-blue-300'
                : 'bg-slate-100 border-l-2 border-slate-300'
            } px-3 py-2 rounded`}
          >
            <p className="font-medium text-slate-700">
              {message.replyTo.senderName}
            </p>
            <p className="text-slate-600 truncate">{message.replyTo.content}</p>
          </div>
        </div>
      )}

      {/* Message content */}
      <div className="flex items-end gap-2">
        {/* Message bubble */}
        <div
          className={`flex-1 relative ${
            isOwnMessage ? 'flex justify-end' : 'flex justify-start'
          }`}
        >
          <div
            className={`max-w-xs px-4 py-2 rounded-2xl relative ${
              isOwnMessage
                ? 'bg-blue-500 text-white rounded-br-none'
                : 'bg-slate-100 text-slate-900 rounded-bl-none'
            }`}
          >
            {isEditing ? (
              <div className="flex gap-2">
                <textarea
                  autoFocus
                  value={editedContent}
                  onChange={(e) => setEditedContent(e.target.value)}
                  className="flex-1 px-3 py-1 bg-slate-800 text-white rounded border border-slate-600 resize-none"
                  rows={2}
                />
                <div className="flex gap-1">
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
                <p className="break-words text-sm leading-relaxed">
                  {message.content}
                </p>
                {message.editedAt && (
                  <span className="text-xs opacity-70 mt-1 block">edited</span>
                )}
              </>
            )}
          </div>
        </div>

        {/* Timestamp & read receipt */}
        {isOwnMessage && (
          <div className="flex flex-col items-center gap-1">
            <span className="text-xs text-slate-500">
              {format(new Date(message.createdAt), 'HH:mm')}
            </span>
            {isFullyRead ? (
              <CheckCheck size={14} className="text-blue-500" />
            ) : (
              <Check size={14} className="text-slate-400" />
            )}
          </div>
        )}

        {!isOwnMessage && (
          <span className="text-xs text-slate-500">
            {format(new Date(message.createdAt), 'HH:mm')}
          </span>
        )}
      </div>

      {/* Reactions */}
      {reactionGroups.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2 ml-0">
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
        />
      )}
    </div>
  );
}
