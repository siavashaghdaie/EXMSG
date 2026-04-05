import { useEffect } from 'react';
import { X } from 'lucide-react';
import { useChatStore } from '@/store/chatStore';
import { MessageResponse } from '@/services/api';
import { format } from 'date-fns';

interface PinnedMessagesPanelProps {
  conversationId: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function PinnedMessagesPanel({
  conversationId,
  isOpen,
  onClose,
}: PinnedMessagesPanelProps) {
  const { pinnedMessages, fetchPinnedMessages, unpinMessage, isLoadingPins } = useChatStore();
  const pins = pinnedMessages.get(conversationId) || [];

  useEffect(() => {
    if (isOpen && conversationId) {
      fetchPinnedMessages(conversationId);
    }
  }, [isOpen, conversationId, fetchPinnedMessages]);

  const handleUnpin = (messageId: string) => {
    unpinMessage(conversationId, messageId).catch((error) => {
      console.error('Failed to unpin message:', error);
    });
  };

  return (
    <>
      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Panel */}
      <div
        className={`fixed right-0 top-0 bottom-0 w-80 bg-white border-l border-slate-200 shadow-lg transform transition-transform z-50 ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        } lg:relative lg:translate-x-0 lg:w-72 lg:shadow-none lg:border-l lg:border-slate-200`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 sticky top-0 bg-white">
          <h2 className="font-semibold text-slate-900">Pinned Messages</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-100 rounded-lg transition lg:hidden"
          >
            <X size={20} className="text-slate-600" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto h-[calc(100vh-56px)] lg:h-[calc(100%-56px)]">
          {isLoadingPins ? (
            <div className="flex items-center justify-center h-32">
              <div className="text-slate-500">Loading...</div>
            </div>
          ) : pins.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-slate-500 p-4 text-center">
              <p className="text-sm">No pinned messages yet</p>
            </div>
          ) : (
            <div className="space-y-2 p-3">
              {pins.map((message: MessageResponse) => (
                <div
                  key={message.id}
                  className="p-3 bg-slate-50 rounded-lg border border-slate-200 hover:border-slate-300 transition group"
                >
                  {/* Message preview */}
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-slate-600">
                        {message.sender?.displayName || 'Unknown'}
                      </p>
                      <p className="text-sm text-slate-700 break-words mt-1">
                        {message.content}
                      </p>
                    </div>
                    <button
                      onClick={() => handleUnpin(message.id)}
                      className="flex-shrink-0 p-1 text-slate-400 hover:text-slate-600 opacity-0 group-hover:opacity-100 transition"
                      title="Unpin"
                    >
                      <X size={14} />
                    </button>
                  </div>

                  {/* Timestamp */}
                  <p className="text-xs text-slate-500">
                    {format(new Date(message.createdAt), 'MMM d, yyyy HH:mm')}
                  </p>

                  {/* Reply context if exists */}
                  {message.replyTo && (
                    <div className="mt-2 pt-2 border-t border-slate-200">
                      <p className="text-xs text-slate-500 mb-1">Replying to:</p>
                      <p className="text-xs text-slate-600 italic truncate">
                        {message.replyTo.sender?.displayName}: {message.replyTo.content}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
