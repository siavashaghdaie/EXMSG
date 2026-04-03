import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Send, Paperclip, Smile, X } from 'lucide-react';
import { useChatStore } from '@/store/chatStore';
import { socket } from '@/services/socket';

interface MessageComposerProps {
  conversationId: string;
  disabled?: boolean;
}

export default function MessageComposer({
  conversationId,
  disabled,
}: MessageComposerProps) {
  const [message, setMessage] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout>();
  const { sendMessage } = useChatStore();
  const [replyingTo, setReplyingTo] = useState<{ id: string; senderName: string; content: string } | null>(null);

  // Focus input on mount
  useEffect(() => {
    if (textareaRef.current && !disabled) {
      textareaRef.current.focus();
    }
  }, [disabled, conversationId]);

  // Auto-grow textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollHeight = Math.min(textareaRef.current.scrollHeight, 144); // max 6 lines (~24px each)
      textareaRef.current.style.height = `${scrollHeight}px`;
    }
  }, [message]);

  // Handle typing indicator
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setMessage(value);

    // Emit typing:start
    if (value.trim() && conversationId) {
      socket.emitTypingStart(conversationId);
    }

    // Reset typing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Emit typing:stop after 2s of inactivity
    typingTimeoutRef.current = setTimeout(() => {
      if (conversationId) {
        socket.emitTypingStop(conversationId);
      }
    }, 2000);
  };

  const handleSendMessage = useCallback(() => {
    if (message.trim() && conversationId && !disabled) {
      sendMessage(conversationId, message.trim());
      setMessage('');
      setReplyingTo(null);

      // Emit typing:stop
      socket.emitTypingStop(conversationId);

      // Focus back to input
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 0);
    }
  }, [message, conversationId, disabled, sendMessage, replyingTo?.id]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Send on Enter, newline on Shift+Enter
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const isMessageEmpty = !message.trim();

  return (
    <div className="border-t border-slate-200 bg-white p-4">
      {/* Reply preview */}
      {replyingTo && (
        <div className="mb-3 flex items-center gap-2 bg-blue-50 px-3 py-2 rounded-lg border border-blue-200">
          <div className="flex-1 flex items-center gap-2 min-w-0">
            <div className="flex-shrink-0 w-1 h-8 bg-blue-500 rounded-full" />
            <div className="min-w-0">
              <p className="text-xs font-medium text-blue-700">
                {replyingTo.senderName}
              </p>
              <p className="text-xs text-blue-600 truncate">
                {replyingTo.content}
              </p>
            </div>
          </div>
          <button
            onClick={() => setReplyingTo(null)}
            className="flex-shrink-0 p-1 hover:bg-blue-200 rounded transition"
          >
            <X size={16} className="text-blue-600" />
          </button>
        </div>
      )}

      {/* Input area */}
      <div
        className={`flex items-end gap-3 px-4 py-3 bg-slate-50 rounded-2xl transition ${
          isFocused ? 'ring-2 ring-blue-500 bg-white' : ''
        }`}
      >
        {/* Attachment button */}
        <button
          disabled={disabled}
          className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
          title="Attach file"
        >
          <Paperclip size={20} />
        </button>

        {/* Text input */}
        <textarea
          ref={textareaRef}
          value={message}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder="Type a message..."
          disabled={disabled}
          className="flex-1 resize-none bg-transparent text-slate-900 placeholder-slate-400 outline-none max-h-36 scrollbar-hide"
          rows={1}
        />

        {/* Emoji button */}
        <button
          disabled={disabled}
          className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
          title="Add emoji"
        >
          <Smile size={20} />
        </button>

        {/* Send button */}
        <button
          onClick={handleSendMessage}
          disabled={isMessageEmpty || disabled}
          className={`p-2.5 rounded-lg transition flex-shrink-0 ${
            isMessageEmpty || disabled
              ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
              : 'bg-blue-500 text-white hover:bg-blue-600 active:scale-95'
          }`}
          title="Send message"
        >
          <Send size={20} />
        </button>
      </div>

      {/* Helper text */}
      {!disabled && (
        <p className="text-xs text-slate-500 mt-2">
          Press <kbd className="px-1 py-0.5 bg-slate-200 rounded">Enter</kbd> to
          send, <kbd className="px-1 py-0.5 bg-slate-200 rounded">Shift+Enter</kbd>{' '}
          for new line
        </p>
      )}
    </div>
  );
}
