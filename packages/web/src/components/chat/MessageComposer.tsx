import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Send, Paperclip, Smile, X, Mic, Camera } from 'lucide-react';
import { useChatStore } from '@/store/chatStore';
import { socket } from '@/services/socket';
import { api } from '@/services/api';
import EmojiPicker from './EmojiPicker';
import VoiceRecorder from './VoiceRecorder';

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
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [mobileToggleMode, setMobileToggleMode] = useState<'mic' | 'camera'>('mic');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaFileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout>();
  const longPressTimeoutRef = useRef<NodeJS.Timeout>();
  const { sendMessage, replyingTo, setReplyingTo } = useChatStore();
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Handle responsive behavior
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Focus input on mount
  useEffect(() => {
    if (textareaRef.current && !disabled) {
      textareaRef.current.focus();
    }
  }, [disabled, conversationId]);

  // Auto-grow textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = '40px'; // reset to single-line height
      const scrollHeight = textareaRef.current.scrollHeight;
      if (scrollHeight > 40) {
        textareaRef.current.style.height = `${Math.min(scrollHeight, 144)}px`; // max 6 lines
      }
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

  // Track sending state to prevent blur from dismissing keyboard
  const isSendingRef = useRef(false);

  const handleSendMessage = useCallback(() => {
    if (message.trim() && conversationId && !disabled) {
      // Mark as sending so blur handler won't dismiss
      isSendingRef.current = true;

      sendMessage(conversationId, message.trim(), replyingTo?.messageId);
      setMessage('');
      setReplyingTo(null);

      // Emit typing:stop
      socket.emitTypingStop(conversationId);

      // Immediately re-focus before React re-render can blur
      textareaRef.current?.focus({ preventScroll: true });

      // Multiple follow-up focus calls to survive re-renders and scroll animations
      requestAnimationFrame(() => {
        textareaRef.current?.focus({ preventScroll: true });
      });
      setTimeout(() => {
        textareaRef.current?.focus({ preventScroll: true });
      }, 50);
      setTimeout(() => {
        textareaRef.current?.focus({ preventScroll: true });
      }, 150);
      setTimeout(() => {
        textareaRef.current?.focus({ preventScroll: true });
        isSendingRef.current = false;
      }, 400);
    }
  }, [message, conversationId, disabled, sendMessage, replyingTo?.messageId, setReplyingTo]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Send on Enter, newline on Shift+Enter
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      handleSendMessage();
      // Keep focus on this element — don't let the event bubble
      textareaRef.current?.focus({ preventScroll: true });
    }
  };

  const handleEmojiSelect = useCallback((emoji: string) => {
    setMessage(prev => prev + emoji);
    textareaRef.current?.focus();
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 100MB limit
    if (file.size > 100 * 1024 * 1024) {
      alert('File exceeds the maximum allowed size of 100MB.');
      return;
    }

    setAttachedFile(file);
  };

  const handleMediaFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 100MB limit
    if (file.size > 100 * 1024 * 1024) {
      alert('File exceeds the maximum allowed size of 100MB.');
      return;
    }

    setAttachedFile(file);
  };

  const handleMobileRightButtonToggle = () => {
    if (!message.trim() && !attachedFile) {
      // Single click: toggle between mic and camera
      setMobileToggleMode(prev => prev === 'mic' ? 'camera' : 'mic');
    }
  };

  const handleMobileRightButtonMouseDown = () => {
    if (!message.trim() && !attachedFile && !disabled) {
      // Long press (500ms) to activate the current mode
      longPressTimeoutRef.current = setTimeout(() => {
        if (mobileToggleMode === 'mic') {
          setIsRecordingVoice(true);
        } else {
          mediaFileInputRef.current?.click();
        }
      }, 500);
    }
  };

  const handleMobileRightButtonMouseUp = () => {
    if (longPressTimeoutRef.current) {
      clearTimeout(longPressTimeoutRef.current);
    }
  };

  const handleRemoveFile = () => {
    setAttachedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const getFileIcon = (mimeType: string): string => {
    if (mimeType.startsWith('image/')) return '🖼️';
    if (mimeType.startsWith('video/')) return '🎬';
    if (mimeType.startsWith('audio/')) return '🎵';
    if (mimeType.includes('pdf')) return '📄';
    if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return '📊';
    if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return '📑';
    if (mimeType.includes('document') || mimeType.includes('word')) return '📝';
    if (mimeType.includes('zip') || mimeType.includes('compress')) return '📦';
    return '📎';
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const handleSendFile = useCallback(async () => {
    if (!attachedFile || !conversationId || disabled) return;

    setIsUploading(true);
    setUploadProgress(0);

    try {
      await api.uploadFile(conversationId, attachedFile, (progress) => {
        setUploadProgress(progress);
      });

      // Clear file and reset
      setAttachedFile(null);
      setUploadProgress(0);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      // Focus back to input
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 0);
    } catch (error) {
      console.error('File upload failed:', error);
      alert('Failed to upload file. Please try again.');
    } finally {
      setIsUploading(false);
    }
  }, [attachedFile, conversationId, disabled]);

  const handleVoiceSend = useCallback(async (blob: Blob) => {
    if (!conversationId || disabled) return;

    setIsRecordingVoice(false);
    setIsUploading(true);

    try {
      // Create a File from the Blob
      const file = new File([blob], `voice-${Date.now()}.webm`, { type: 'audio/webm' });
      // Upload as a file message (reuse file upload)
      await api.uploadFile(conversationId, file, (progress) => {
        setUploadProgress(progress);
      });

      // Clear and reset
      setUploadProgress(0);

      // Focus back to input
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 0);
    } catch (err) {
      console.error('Failed to send voice message:', err);
      alert('Failed to send voice message. Please try again.');
    } finally {
      setIsUploading(false);
    }
  }, [conversationId, disabled]);

  const isMessageEmpty = !message.trim() && !attachedFile;

  // Show voice recorder instead of regular input
  if (isRecordingVoice) {
    return (
      <div className="border-t border-slate-200 dark:border-surface-700 bg-white dark:bg-surface-900 p-4">
        <VoiceRecorder
          onSend={handleVoiceSend}
          onCancel={() => setIsRecordingVoice(false)}
        />
      </div>
    );
  }

  return (
    <div className="border-t border-slate-200 dark:border-surface-700 bg-white dark:bg-surface-900 px-4 py-2 md:py-4">
      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        onChange={handleFileSelect}
        className="hidden"
        accept="*/*"
      />
      <input
        ref={mediaFileInputRef}
        type="file"
        onChange={handleMediaFileSelect}
        className="hidden"
        accept="image/*,video/*"
      />

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

      {/* File attachment preview */}
      {attachedFile && (
        <div className="mb-3 flex items-center gap-3 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200">
          <span className="text-2xl">{getFileIcon(attachedFile.type)}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-700 truncate">{attachedFile.name}</p>
            <p className="text-xs text-slate-500">{formatFileSize(attachedFile.size)}</p>
          </div>
          {isUploading ? (
            <div className="w-20 h-1.5 bg-slate-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          ) : (
            <button
              onClick={handleRemoveFile}
              className="flex-shrink-0 p-1 hover:bg-slate-200 rounded transition"
            >
              <X size={16} className="text-slate-500" />
            </button>
          )}
        </div>
      )}

      {/* Input area */}
      {isMobile ? (
        <div
          className={`flex items-center gap-2 px-3 py-2 bg-slate-50 dark:bg-surface-800 rounded-2xl transition ${
            isFocused ? 'ring-2 ring-blue-500 bg-white dark:bg-surface-700' : ''
          }`}
        >
          {/* Left: Attach button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || isUploading}
            className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
            title="Attach file"
          >
            <Paperclip size={20} />
          </button>

          {/* Center: Text input */}
          <textarea
            ref={textareaRef}
            value={message}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => { if (!isSendingRef.current) setIsFocused(false); }}
            placeholder="Type a message..."
            disabled={disabled}
            className="flex-1 resize-none bg-transparent text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-gray-500 outline-none max-h-24 scrollbar-hide leading-10"
            rows={1}
            style={{ height: '40px' }}
          />

          {/* Right: Send or Toggle button */}
          {!isMessageEmpty ? (
            // Show Send button when message or file is present
            <button
              onClick={() => attachedFile ? handleSendFile() : handleSendMessage()}
              disabled={disabled || isUploading}
              className={`p-2 rounded-xl transition flex-shrink-0 min-w-[36px] min-h-[36px] flex items-center justify-center ${
                disabled || isUploading
                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  : 'bg-blue-500 text-white hover:bg-blue-600 active:scale-95'
              }`}
              title={attachedFile ? 'Send file' : 'Send message'}
            >
              <Send size={18} />
            </button>
          ) : (
            // Show Mic/Camera toggle when message is empty
            <button
              onClick={handleMobileRightButtonToggle}
              onMouseDown={handleMobileRightButtonMouseDown}
              onMouseUp={handleMobileRightButtonMouseUp}
              onMouseLeave={handleMobileRightButtonMouseUp}
              onTouchStart={handleMobileRightButtonMouseDown}
              onTouchEnd={handleMobileRightButtonMouseUp}
              disabled={disabled}
              className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
              title={mobileToggleMode === 'mic' ? 'Click to toggle to camera, hold to record voice' : 'Click to toggle to mic, hold to select media'}
            >
              {mobileToggleMode === 'mic' ? (
                <Mic size={20} />
              ) : (
                <Camera size={20} />
              )}
            </button>
          )}
        </div>
      ) : (
        <div
          className={`flex items-center gap-3 px-4 py-3 bg-slate-50 dark:bg-surface-800 rounded-2xl transition ${
            isFocused ? 'ring-2 ring-blue-500 bg-white dark:bg-surface-700' : ''
          }`}
        >
          {/* Attachment button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || isUploading}
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
            onBlur={() => { if (!isSendingRef.current) setIsFocused(false); }}
            placeholder="Type a message..."
            disabled={disabled}
            className="flex-1 resize-none bg-transparent text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-gray-500 outline-none max-h-36 scrollbar-hide leading-10"
            rows={1}
            style={{ height: '40px' }}
          />

          {/* Voice message button */}
          <button
            onClick={() => setIsRecordingVoice(true)}
            disabled={disabled}
            className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
            title="Record voice message"
          >
            <Mic size={20} />
          </button>

          {/* Emoji button */}
          <div className="relative flex-shrink-0">
            <button
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              disabled={disabled}
              className={`p-2 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed ${
                showEmojiPicker
                  ? 'text-blue-500 bg-blue-50'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200'
              }`}
              title="Add emoji"
            >
              <Smile size={20} />
            </button>
            {showEmojiPicker && (
              <EmojiPicker
                onSelect={handleEmojiSelect}
                onClose={() => setShowEmojiPicker(false)}
              />
            )}
          </div>

          {/* Send button */}
          <button
            onClick={() => attachedFile ? handleSendFile() : handleSendMessage()}
            disabled={isMessageEmpty || disabled || isUploading}
            className={`p-2 rounded-xl transition flex-shrink-0 min-w-[36px] min-h-[36px] flex items-center justify-center ${
              isMessageEmpty || disabled || isUploading
                ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                : 'bg-blue-500 text-white hover:bg-blue-600 active:scale-95'
            }`}
            title={attachedFile ? 'Send file' : 'Send message'}
          >
            <Send size={20} />
          </button>
        </div>
      )}

      {/* Helper text - hidden on mobile */}
      {!disabled && !isMobile && (
        <p className="text-xs text-slate-500 mt-2">
          Press <kbd className="px-1 py-0.5 bg-slate-200 rounded">Enter</kbd> to
          send, <kbd className="px-1 py-0.5 bg-slate-200 rounded">Shift+Enter</kbd>{' '}
          for new line
        </p>
      )}
    </div>
  );
}
