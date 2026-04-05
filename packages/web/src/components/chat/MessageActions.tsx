import { Reply, Smile, Pencil, Trash2, Pin, Share2 } from 'lucide-react';
import EmojiPicker from './EmojiPicker';

interface MessageActionsProps {
  message: { id: string };
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
    <div className="absolute -top-12 right-0 flex items-center gap-1 bg-white dark:bg-slate-800 rounded-full shadow-lg border border-slate-200 dark:border-slate-700 p-2 z-50">
      {/* Reply button */}
      <button
        onClick={onReply}
        className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition"
        title="Reply"
      >
        <Reply size={18} className="text-slate-600 dark:text-slate-300" />
      </button>

      {/* React button with emoji picker */}
      <div className="relative">
        <button
          onClick={onReact}
          className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition"
          title="Add reaction"
        >
          <Smile size={18} className="text-slate-600 dark:text-slate-300" />
        </button>
        {showEmojiPicker && (
          <div className="absolute bottom-full right-0 mb-2 z-50">
            <EmojiPicker onSelect={onAddReaction} onClose={() => {}} />
          </div>
        )}
      </div>

      {/* Forward button */}
      {onForward && (
        <button
          onClick={onForward}
          className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition"
          title="Forward"
        >
          <Share2 size={18} className="text-slate-600 dark:text-slate-300" />
        </button>
      )}

      {/* Pin button */}
      <button
        onClick={onPin}
        className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition"
        title="Pin message"
      >
        <Pin size={18} className="text-slate-600 dark:text-slate-300" />
      </button>

      {/* Edit button (own messages only) */}
      {isOwnMessage && (
        <button
          onClick={onEdit}
          className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition"
          title="Edit"
        >
          <Pencil size={18} className="text-slate-600 dark:text-slate-300" />
        </button>
      )}

      {/* Delete button (own messages only) */}
      {isOwnMessage && (
        <button
          onClick={onDelete}
          className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full transition"
          title="Delete"
        >
          <Trash2 size={18} className="text-red-600" />
        </button>
      )}
    </div>
  );
}
