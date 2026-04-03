import { Reply, Smile, Pencil, Trash2 } from 'lucide-react';
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
}: MessageActionsProps) {
  return (
    <div className="absolute -top-12 right-0 flex items-center gap-1 bg-white rounded-full shadow-lg border border-slate-200 p-2 z-50">
      {/* Reply button */}
      <button
        onClick={onReply}
        className="p-2 hover:bg-slate-100 rounded-full transition"
        title="Reply"
      >
        <Reply size={18} className="text-slate-600" />
      </button>

      {/* React button with emoji picker */}
      <div className="relative">
        <button
          onClick={onReact}
          className="p-2 hover:bg-slate-100 rounded-full transition"
          title="Add reaction"
        >
          <Smile size={18} className="text-slate-600" />
        </button>
        {showEmojiPicker && (
          <div className="absolute bottom-full right-0 mb-2 z-50">
            <EmojiPicker onEmojiSelect={onAddReaction} />
          </div>
        )}
      </div>

      {/* Edit button (own messages only) */}
      {isOwnMessage && (
        <button
          onClick={onEdit}
          className="p-2 hover:bg-slate-100 rounded-full transition"
          title="Edit"
        >
          <Pencil size={18} className="text-slate-600" />
        </button>
      )}

      {/* Delete button (own messages only) */}
      {isOwnMessage && (
        <button
          onClick={onDelete}
          className="p-2 hover:bg-red-50 rounded-full transition"
          title="Delete"
        >
          <Trash2 size={18} className="text-red-600" />
        </button>
      )}
    </div>
  );
}
