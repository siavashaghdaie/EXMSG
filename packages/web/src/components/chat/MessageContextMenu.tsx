import React, { useEffect, useRef } from 'react';
import {
  Reply,
  Pencil,
  Share2,
  Copy,
  Info,
  Star,
  Trash2,
  Pin,
  Languages,
  MoreHorizontal,
} from 'lucide-react';
import { MessageResponse } from '@/services/api';

interface MessageContextMenuProps {
  message: MessageResponse;
  isOwnMessage: boolean;
  isEditable: boolean;
  position: { x: number; y: number };
  onReply: () => void;
  onEdit: () => void;
  onForward: () => void;
  onCopy: () => void;
  onPin: () => void;
  onStar: () => void;
  onDelete: () => void;
  onClose: () => void;
}

interface MenuItem {
  icon: React.ReactNode;
  label: string;
  action: () => void;
  danger?: boolean;
  divider?: boolean;
}

export default function MessageContextMenu({
  message: _message,
  isOwnMessage,
  isEditable,
  position,
  onReply,
  onEdit,
  onForward,
  onCopy,
  onPin,
  onStar,
  onDelete,
  onClose,
}: MessageContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [showMore, setShowMore] = React.useState(false);

  // Position the menu so it doesn't overflow the viewport
  useEffect(() => {
    if (!menuRef.current) return;
    const menu = menuRef.current;
    const rect = menu.getBoundingClientRect();
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;

    if (rect.right > viewportW) {
      menu.style.left = `${viewportW - rect.width - 8}px`;
    }
    if (rect.bottom > viewportH) {
      menu.style.top = `${viewportH - rect.height - 8}px`;
    }
    if (rect.left < 0) {
      menu.style.left = '8px';
    }
    if (rect.top < 0) {
      menu.style.top = '8px';
    }
  }, [position, showMore]);

  const primaryItems: MenuItem[] = [
    {
      icon: <Reply size={18} />,
      label: 'Reply',
      action: onReply,
    },
    ...(isOwnMessage && isEditable
      ? [{
          icon: <Pencil size={18} />,
          label: 'Edit',
          action: onEdit,
        }]
      : []),
    {
      icon: <Share2 size={18} />,
      label: 'Forward',
      action: onForward,
    },
    {
      icon: <Copy size={18} />,
      label: 'Copy',
      action: onCopy,
    },
    {
      icon: <Info size={18} />,
      label: 'Info',
      action: () => {
        // Show message info (timestamp, read receipts, etc.)
        onClose();
      },
    },
    {
      icon: <Pin size={18} />,
      label: 'Pin',
      action: onPin,
    },
    {
      icon: <Star size={18} />,
      label: 'Star',
      action: onStar,
    },
    ...(isOwnMessage
      ? [{
          icon: <Trash2 size={18} />,
          label: 'Delete',
          action: onDelete,
          danger: true,
        }]
      : []),
  ];

  const moreItems: MenuItem[] = [
    {
      icon: <Languages size={18} />,
      label: 'Translate',
      action: () => {
        // Translate feature (placeholder)
        onClose();
      },
    },
  ];

  const displayItems = showMore ? [...primaryItems, ...moreItems] : primaryItems;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[100] bg-black/20 backdrop-blur-[1px]"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        onTouchStart={(e) => {
          e.stopPropagation();
          onClose();
        }}
      />

      {/* Menu */}
      <div
        ref={menuRef}
        className="fixed z-[101] min-w-[200px] bg-white dark:bg-surface-800 rounded-xl shadow-2xl border border-gray-200 dark:border-surface-700 overflow-hidden py-1"
        style={{ left: position.x, top: position.y }}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
      >
        {displayItems.map((item, index) => (
          <button
            key={index}
            onClick={(e) => {
              e.stopPropagation();
              item.action();
            }}
            className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
              item.danger
                ? 'text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20'
                : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-surface-700'
            }`}
          >
            <span className={`flex-shrink-0 ${item.danger ? 'text-red-500' : 'text-gray-500 dark:text-gray-400'}`}>
              {item.icon}
            </span>
            <span className="font-medium">{item.label}</span>
          </button>
        ))}

        {/* More button */}
        {!showMore && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowMore(true);
            }}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-surface-700 transition-colors border-t border-gray-100 dark:border-surface-700"
          >
            <span className="flex-shrink-0"><MoreHorizontal size={18} /></span>
            <span className="font-medium">More</span>
          </button>
        )}
      </div>
    </>
  );
}
