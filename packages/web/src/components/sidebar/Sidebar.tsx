import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Search, Settings, Plus } from 'lucide-react';
import { useChatStore } from '@/store/chatStore';
import { useAuthStore } from '@/store/authStore';
import Avatar from '@/components/common/Avatar';
import ConversationItem from '@/components/sidebar/ConversationItem';
import NewConversationModal from '@/components/sidebar/NewConversationModal';
import { socket } from '@/services/socket';

interface SidebarProps {
  onNavigateChat?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ onNavigateChat: _onNavigateChat }) => {
  const navigate = useNavigate();
  const { conversationId } = useParams<{ conversationId?: string }>();
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());

  const {
    conversations,
    fetchConversations,
    isLoadingConversations,
  } = useChatStore();
  const { user, logout } = useAuthStore();

  // Fetch conversations on mount
  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Track online status from socket
  useEffect(() => {
    const unsubscribe = socket.on('user:status', (data: { userId: string; status: 'online' | 'offline' }) => {
      if (data.status === 'online') {
        setOnlineUsers((prev) => new Set([...prev, data.userId]));
      } else {
        setOnlineUsers((prev) => {
          const next = new Set(prev);
          next.delete(data.userId);
          return next;
        });
      }
    });

    return unsubscribe;
  }, []);

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const handleSettingsClick = () => {
    navigate('/settings');
  };

  // Filter conversations based on search query
  const filteredConversations = conversations.filter((conv) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();

    // Search by conversation name or participant names
    const convName =
      conv.name ||
      conv.participants
        .filter((p) => p.id !== user?.id)
        .map((p) => p.username)
        .join(', ');

    return convName.toLowerCase().includes(query);
  });

  if (!user) {
    return null;
  }

  const isConversationActive = (convId: string) => {
    return convId === conversationId;
  };

  return (
    <>
      <div className="h-screen w-80 bg-white dark:bg-surface-900 border-r border-gray-200 dark:border-surface-700 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 dark:border-surface-700 flex-shrink-0">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">
              Exclusive Messenger
            </h1>
            <div className="flex items-center gap-2">
              <button
                onClick={handleSettingsClick}
                className="p-2 hover:bg-gray-100 dark:hover:bg-surface-800 rounded-lg transition-colors"
                title="Settings"
              >
                <Settings className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              </button>
            </div>
          </div>

          {/* User profile mini */}
          <button
            onClick={handleSettingsClick}
            className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-surface-800 transition-colors group"
          >
            <Avatar src={user.avatar} name={user.username} size="sm" />
            <div className="flex-1 text-left min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                {user.username}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                {user.email}
              </p>
            </div>
          </button>
        </div>

        {/* Search bar */}
        <div className="px-4 py-3 flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search conversations..."
              className="w-full pl-9 pr-3 py-2 border border-gray-300 dark:border-surface-700 rounded-lg bg-gray-50 dark:bg-surface-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400 transition-colors"
            />
          </div>
        </div>

        {/* New Chat button */}
        <div className="px-4 py-2 flex-shrink-0">
          <button
            onClick={() => setIsModalOpen(true)}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-primary-600 dark:bg-primary-500 text-white rounded-lg hover:bg-primary-700 dark:hover:bg-primary-600 transition-colors font-medium"
          >
            <Plus className="w-5 h-5" />
            New Chat
          </button>
        </div>

        {/* Conversations list */}
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {isLoadingConversations && conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary-600 dark:border-primary-400 border-t-transparent mb-2" />
              <p className="text-sm text-gray-500 dark:text-gray-400">Loading chats...</p>
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-center px-4">
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                {searchQuery ? 'No conversations found' : 'No chats yet'}
              </p>
              {!searchQuery && (
                <button
                  onClick={() => setIsModalOpen(true)}
                  className="text-primary-600 dark:text-primary-400 text-sm font-medium hover:underline"
                >
                  Start a new chat
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-1">
              {filteredConversations.map((conversation) => {
                // Check if any participant (except current user) is online
                const otherUserId = conversation.participants.find(
                  (p) => p.id !== user.id
                )?.id;
                const isOnline = otherUserId ? onlineUsers.has(otherUserId) : false;

                return (
                  <ConversationItem
                    key={conversation.id}
                    conversation={conversation}
                    isActive={isConversationActive(conversation.id)}
                    isOnline={conversation.participants.length === 2 ? isOnline : undefined}
                  />
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-gray-200 dark:border-surface-700 flex-shrink-0">
          <button
            onClick={handleLogout}
            className="w-full px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-surface-800 rounded-lg transition-colors text-sm font-medium"
          >
            Logout
          </button>
        </div>
      </div>

      {/* New Conversation Modal */}
      <NewConversationModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </>
  );
};

export default Sidebar;
