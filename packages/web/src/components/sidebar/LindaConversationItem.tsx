import React from 'react';
import { Bot, Sparkles } from 'lucide-react';

interface LindaConversationItemProps {
  isActive: boolean;
  onClick: () => void;
}

export const LindaConversationItem: React.FC<LindaConversationItemProps> = ({
  isActive,
  onClick,
}) => {
  return (
    <button
      onClick={onClick}
      className={`w-full px-3 py-3 rounded-lg transition-all duration-200 ease-out flex items-start gap-3 hover:bg-gray-100 dark:hover:bg-surface-800 ${
        isActive
          ? 'bg-primary-50 dark:bg-primary-900/20 shadow-sm'
          : ''
      }`}
    >
      {/* Avatar with Linda AI styling */}
      <div className="relative inline-block flex-shrink-0 mt-1">
        <div className="w-10 h-10 rounded-full flex items-center justify-center font-semibold overflow-hidden bg-gradient-to-br from-violet-500 to-blue-500">
          <Bot size={20} className="text-white" />
        </div>
        {/* Online indicator */}
        <div className="w-2.5 h-2.5 absolute bottom-0 right-0 bg-green-500 rounded-full border-2 border-white dark:border-surface-900" />
      </div>

      {/* Conversation info */}
      <div className="flex-1 min-w-0 text-left">
        {/* Name and badge row */}
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="flex items-center gap-2">
            <h3
              className={`font-medium text-sm truncate ${
                isActive
                  ? 'text-gray-900 dark:text-white'
                  : 'text-gray-700 dark:text-gray-200'
              }`}
            >
              Linda
            </h3>
            <div className="flex items-center gap-1 px-2 py-0.5 bg-violet-100 dark:bg-violet-900/30 rounded-full">
              <Sparkles size={12} className="text-violet-600 dark:text-violet-400 flex-shrink-0" />
              <span className="text-xs font-medium text-violet-600 dark:text-violet-400">
                AI
              </span>
            </div>
          </div>
        </div>

        {/* Status text */}
        <p
          className={`text-xs truncate ${
            isActive
              ? 'text-gray-700 dark:text-gray-300 font-medium'
              : 'text-gray-500 dark:text-gray-400'
          }`}
        >
          AI Secretary
        </p>
      </div>
    </button>
  );
};

export default LindaConversationItem;
