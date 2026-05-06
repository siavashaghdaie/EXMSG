import { useRef, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
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
  const reactBtnRef = useRef<HTMLButtonElement>(null);
  const [pickerPos, setPickerPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (showEmojiPicker && reactBtnRef.current) {
      const rect = reactBtnRef.current.getBoundingClientRect();
      // Position picker above the react button, right-aligned
      const left = Math.max(8, Math.min(rect.right - 320, window.innerWidth - 328));
      const top = Math.max(8, rect.top - 340);
      setPickerPos({ top, left });
    }
  }, [showEmojiPicker]);

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
          ref={reactBtnRef}
          onClick={onReact}
          className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition"
          title="React"
        >
          <Smile size={16} className="text-slate-600 dark:text-slate-300" />
        </button>
        {showEmojiPicker && pickerPos && createPortal(
          <div className="fixed z-[200]" style={{ top: pickerPos.top, left: pickerPos.left }}>
            <EmojiPicker onSelect={onAddReaction} onClose={onReact} />
          </div>,
          document.body
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
