import { useState } from 'react';

interface EmojiPickerProps {
  onEmojiSelect: (emoji: string) => void;
}

const COMMON_EMOJIS = [
  '👍',
  '❤️',
  '😂',
  '😢',
  '😡',
  '🔥',
  '👏',
  '💯',
  '🎉',
  '✨',
  '😮',
  '🤔',
  '😎',
  '🚀',
  '💪',
  '🙏',
];

export default function EmojiPicker({ onEmojiSelect }: EmojiPickerProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  return (
    <div className="bg-white rounded-lg shadow-xl border border-slate-200 p-3">
      <div className="grid grid-cols-4 gap-2">
        {COMMON_EMOJIS.map((emoji, index) => (
          <button
            key={emoji}
            onClick={() => onEmojiSelect(emoji)}
            onMouseEnter={() => setHoveredIndex(index)}
            onMouseLeave={() => setHoveredIndex(null)}
            className={`w-10 h-10 flex items-center justify-center text-xl rounded-lg transition ${
              hoveredIndex === index
                ? 'bg-slate-100 scale-110'
                : 'hover:bg-slate-50'
            }`}
            title={emoji}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
