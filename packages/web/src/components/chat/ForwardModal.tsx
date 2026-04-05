import { useState } from 'react';
import { X, Send, Search } from 'lucide-react';
import { useChatStore } from '@/store/chatStore';
import { useAuthStore } from '@/store/authStore';
import { api } from '@/services/api';
import Avatar from '@/components/common/Avatar';

interface ForwardModalProps {
  messageId: string;
  messagePreview: string;
  onClose: () => void;
}

export default function ForwardModal({ messageId, messagePreview, onClose }: ForwardModalProps) {
  const { conversations } = useChatStore();
  const { user } = useAuthStore();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [isSending, setIsSending] = useState(false);

  const filteredConversations = conversations.filter(c => {
    if (!search) return true;
    const name = c.name || c.participants.map(p => p.username).join(', ');
    return name.toLowerCase().includes(search.toLowerCase());
  });

  const toggleSelect = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const handleForward = async () => {
    if (selected.size === 0) return;
    setIsSending(true);
    try {
      await api.forwardMessage(messageId, Array.from(selected));
      onClose();
    } catch (err) {
      console.error('Forward failed:', err);
      alert('Failed to forward message');
    } finally {
      setIsSending(false);
    }
  };

  const getConversationName = (conv: any) => {
    if (conv.name) return conv.name;
    const others = conv.participants.filter((p: any) => p.id !== user?.id);
    return others.map((p: any) => p.username).join(', ');
  };

  return (
    <div className="fixed inset-0 z-[80] bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl w-full max-w-sm shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
          <h3 className="font-semibold text-slate-900 dark:text-white">Forward Message</h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded">
            <X size={18} className="text-slate-500" />
          </button>
        </div>

        {/* Message preview */}
        <div className="px-4 py-2 bg-slate-50 dark:bg-slate-700/50 border-b border-slate-200 dark:border-slate-700">
          <p className="text-xs text-slate-500 line-clamp-2">{messagePreview || '(No message content)'}</p>
        </div>

        {/* Search */}
        <div className="p-3 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-700 rounded-lg px-3 py-1.5">
            <Search size={14} className="text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search conversations..."
              className="flex-1 bg-transparent text-sm outline-none text-slate-900 dark:text-white"
            />
          </div>
        </div>

        {/* Conversation list */}
        <div className="max-h-64 overflow-y-auto">
          {filteredConversations.length === 0 ? (
            <div className="p-4 text-center text-sm text-slate-500">
              No conversations found
            </div>
          ) : (
            filteredConversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => toggleSelect(conv.id)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-700 transition ${
                  selected.has(conv.id) ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                }`}
              >
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                  selected.has(conv.id)
                    ? 'border-blue-500 bg-blue-500'
                    : 'border-slate-300 dark:border-slate-600'
                }`}>
                  {selected.has(conv.id) && <div className="w-2 h-2 bg-white rounded-full" />}
                </div>
                <Avatar name={getConversationName(conv)} size="sm" />
                <span className="text-sm text-slate-700 dark:text-slate-300 truncate">{getConversationName(conv)}</span>
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-700">
          <button
            onClick={handleForward}
            disabled={selected.size === 0 || isSending}
            className="w-full py-2.5 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
          >
            <Send size={16} />
            {isSending ? 'Sending...' : `Forward to ${selected.size} conversation${selected.size !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}
