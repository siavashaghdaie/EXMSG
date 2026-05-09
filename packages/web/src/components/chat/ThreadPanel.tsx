import React, { useEffect, useState, useRef, useCallback } from 'react';
import { X, ArrowLeft, MessageSquare, Send, Loader2 } from 'lucide-react';
import { MessageResponse, api } from '@/services/api';
import { useAuthStore } from '@/store/authStore';
import { useChatStore } from '@/store/chatStore';
import Avatar from '@/components/common/Avatar';
import { format } from 'date-fns';

interface ThreadPanelProps {
  messageId: string;
  conversationId: string;
  onClose: () => void;
}

export default function ThreadPanel({ messageId, conversationId, onClose }: ThreadPanelProps) {
  const { user } = useAuthStore();
  const { sendMessage } = useChatStore();
  const [parentMessage, setParentMessage] = useState<MessageResponse | null>(null);
  const [replies, setReplies] = useState<MessageResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const repliesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    repliesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const fetchThread = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.getThreadReplies(messageId);
      setParentMessage(data.parent);
      setReplies(data.replies || []);
    } catch (err) {
      console.error('Failed to fetch thread:', err);
    } finally {
      setLoading(false);
    }
  }, [messageId]);

  useEffect(() => {
    fetchThread();
  }, [fetchThread]);

  useEffect(() => {
    if (!loading) {
      scrollToBottom();
    }
  }, [loading, replies.length, scrollToBottom]);

  // Focus input when panel opens
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 300);
  }, []);

  const handleSendReply = async () => {
    if (!replyText.trim() || sending) return;
    setSending(true);
    try {
      await sendMessage(conversationId, replyText.trim(), messageId);
      setReplyText('');
      // Refresh thread to show new reply
      await fetchThread();
    } catch (err) {
      console.error('Failed to send reply:', err);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendReply();
    }
  };

  const getSenderName = (msg: MessageResponse): string => {
    return (msg.sender as any)?.displayName || (msg.sender as any)?.username || (msg.sender as any)?.email?.split('@')[0] || 'Unknown';
  };

  const getSenderAvatar = (msg: MessageResponse): string | undefined => {
    return (msg.sender as any)?.avatar;
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-surface-900 border-l border-slate-200 dark:border-surface-700">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 dark:border-surface-700 bg-white dark:bg-surface-900 flex-shrink-0">
        <button
          onClick={onClose}
          className="p-1.5 hover:bg-slate-100 dark:hover:bg-surface-700 rounded-lg transition"
        >
          <ArrowLeft size={18} className="text-slate-600 dark:text-slate-300" />
        </button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <MessageSquare size={18} className="text-blue-500 flex-shrink-0" />
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Thread</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 hover:bg-slate-100 dark:hover:bg-surface-700 rounded-lg transition"
        >
          <X size={18} className="text-slate-500" />
        </button>
      </div>

      {/* Thread content */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="animate-spin text-blue-500" />
          </div>
        ) : (
          <div className="py-3">
            {/* Parent message */}
            {parentMessage && (
              <div className="px-4 pb-3 mb-3 border-b border-slate-100 dark:border-surface-700">
                <div className="flex items-start gap-3">
                  <Avatar
                    name={getSenderName(parentMessage)}
                    src={getSenderAvatar(parentMessage)}
                    size="md"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-semibold text-slate-900 dark:text-white">
                        {getSenderName(parentMessage)}
                      </span>
                      <span className="text-xs text-slate-400 dark:text-slate-500">
                        {format(new Date(parentMessage.createdAt), 'MMM d, h:mm a')}
                      </span>
                    </div>
                    <div className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-words">
                      {parentMessage.content}
                    </div>
                    {parentMessage.attachments && parentMessage.attachments.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {parentMessage.attachments.map((att: any, i: number) => (
                          <div key={i} className="text-xs text-blue-500 bg-blue-50 dark:bg-blue-900/20 px-2 py-1 rounded">
                            {att.originalName || att.filename || 'Attachment'}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500">
                  <div className="flex-1 border-t border-slate-100 dark:border-surface-700" />
                  <span>{replies.length} {replies.length === 1 ? 'reply' : 'replies'}</span>
                  <div className="flex-1 border-t border-slate-100 dark:border-surface-700" />
                </div>
              </div>
            )}

            {/* Replies */}
            {replies.map((reply) => {
              const isOwn = reply.senderId === user?.id;
              return (
                <div key={reply.id} className="px-4 py-1.5">
                  <div className={`flex items-start gap-2.5 ${isOwn ? 'flex-row-reverse' : ''}`}>
                    <Avatar
                      name={getSenderName(reply)}
                      src={getSenderAvatar(reply)}
                      size="sm"
                    />
                    <div className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'} max-w-[80%]`}>
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                          {getSenderName(reply)}
                        </span>
                        <span className="text-[10px] text-slate-400 dark:text-slate-500">
                          {format(new Date(reply.createdAt), 'h:mm a')}
                        </span>
                      </div>
                      <div
                        className={`px-3 py-2 rounded-2xl text-sm ${
                          isOwn
                            ? 'bg-blue-500 text-white rounded-tr-sm'
                            : 'bg-slate-100 dark:bg-surface-700 text-slate-800 dark:text-slate-200 rounded-tl-sm'
                        }`}
                      >
                        <span className="whitespace-pre-wrap break-words">{reply.content}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={repliesEndRef} />
          </div>
        )}
      </div>

      {/* Reply composer */}
      <div className="border-t border-slate-200 dark:border-surface-700 p-3 flex-shrink-0 bg-white dark:bg-surface-900">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Reply in thread..."
            rows={1}
            className="flex-1 resize-none rounded-xl border border-slate-200 dark:border-surface-600 bg-slate-50 dark:bg-surface-800 px-3 py-2 text-sm text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            style={{ maxHeight: 120 }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = 'auto';
              target.style.height = Math.min(target.scrollHeight, 120) + 'px';
            }}
          />
          <button
            onClick={handleSendReply}
            disabled={!replyText.trim() || sending}
            className="p-2.5 rounded-xl bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition flex-shrink-0"
          >
            {sending ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <Send size={18} />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
