import { Reply, Smile, Pencil, Trash2, Pin, Share2 } from 'lucide-react';
import EmojiPicker from './EmojiPicker';

interface MessageActionsProps {
  message: { id: string; createdAt?: string };
  isOwnMessage: boolean;
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onReact: () => void;
  showEmojiPicker: boolean;
  onAddReaction: (emoji: string) => void;
  onPin: () => void;
  onForward?: () => void;
}

export default function MessageActions({
  message: _message,
  isOwnMessage,
  onReply,
  onEdit,
  onDelete,
  onReact,
  showEmojiPicker,
  onAddReaction,
  onPin,
  onForward,
}: MessageActionsProps) {
  return (
    <div className="absolute -top-10 right-0 flex items-center gap-0.5 bg-white dark:bg-slate-800 rounded-full shadow-lg border border-slate-200 dark:border-slate-700 px-1.5 py-1 z-50">
      {/* Reply */}
      <button
        onClick={onReply}
        className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition"
        title="Reply"
      >
        <Reply size={16} className="text-slate-600 dark:text-slate-300" />
      </button>

      {/* React */}
      <div className="relative">
        <button
          onClick={onReact}
          className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition"
          title="React"
        >
          <Smile size={16} className="text-slate-600 dark:text-slate-300" />
        </button>
        {showEmojiPicker && (
          <div className="absolute bottom-full right-0 mb-2 z-50">
            <EmojiPicker onSelect={onAddReaction} onClose={() => {}} />
          </div>
        )}
      </div>

      {/* Forward */}
      {onForward && (
        <button
          onClick={onForward}
          className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition"
          title="Forward"
        >
          <Share2 size={16} className="text-slate-600 dark:text-slate-300" />
        </button>
      )}

      {/* Pin */}
      <button
        onClick={onPin}
        className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition"
        title="Pin"
      >
        <Pin size={16} className="text-slate-600 dark:text-slate-300" />
      </button>

      {/* Edit (own messages only) */}
      {isOwnMessage && (
        <button
          onClick={onEdit}
          className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition"
          title="Edit (within 10 min)"
        >
          <Pencil size={16} className="text-slate-600 dark:text-slate-300" />
        </button>
      )}

      {/* Delete (own messages only) */}
      {isOwnMessage && (
        <button
          onClick={onDelete}
          className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full transition"
          title="Delete"
        >
          <Trash2 size={16} className="text-red-500" />
        </button>
      )}
    </div>
  );
}
