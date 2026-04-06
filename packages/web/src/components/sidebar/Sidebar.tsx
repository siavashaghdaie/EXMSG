import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Search, Settings, Plus, Bell, Clipboard } from 'lucide-react';
import { useChatStore } from '@/store/chatStore';
import { useAuthStore } from '@/store/authStore';
import { usePresenceStore } from '@/store/presenceStore';
import { api, UserStatusGroup } from '@/services/api';
import Avatar from '@/components/common/Avatar';
import ConversationItem from '@/components/sidebar/ConversationItem';
import NewConversationModal from '@/components/sidebar/NewConversationModal';
import StoryViewerModal from '@/components/common/StoryViewerModal';

interface SidebarProps {
  isMobile?: boolean;
  onNavigateChat?: () => void;
  onSettingsClick?: () => void;
  onDashboardClick?: () => void;
  onClose?: () => void;
  onAnnouncementsClick?: () => void;
  onTasksClick?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isMobile = false,
  onNavigateChat,
  onSettingsClick,
  onDashboardClick,
  onClose,
  onAnnouncementsClick,
  onTasksClick
}) => {
  const navigate = useNavigate();
  const { conversationId } = useParams<{ conversationId?: string }>();
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());

  // Story-related state
  const [hasActiveStory, setHasActiveStory] = useState(false);
  const [showStoryCreation, setShowStoryCreation] = useState(false);
  const [showStoryViewer, setShowStoryViewer] = useState(false);
  const [storyViewUserId, setStoryViewUserId] = useState<string | null>(null);
  const [contactStories, setContactStories] = useState<UserStatusGroup[]>([]);
  const [announcementCount, setAnnouncementCount] = useState(0);
  const [taskCount, setTaskCount] = useState(0);

  const {
    conversations,
    fetchConversations,
    isLoadingConversations,
    typingIndicators,
    unreadCounts,
  } = useChatStore();
  const { user } = useAuthStore();

  // Subscribe to presence store updates
  const presenceOnlineUsers = usePresenceStore((s) => s.onlineUsers);

  // Fetch conversations on mount
  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Track online status from presence store
  useEffect(() => {
    setOnlineUsers(new Set(presenceOnlineUsers));
  }, [presenceOnlineUsers]);

  // Reusable refresh functions for counts
  const refreshCounts = async () => {
    try {
      const annResult = await api.getAnnouncements();
      const announcements = annResult?.announcements || [];
      setAnnouncementCount(announcements.length);
    } catch (_e) { /* ignore */ }

    try {
      const tasks = await api.getTasks();
      const incompleteTasks = tasks?.filter((task: any) => task.status !== 'COMPLETED' && task.assignedToId === user?.id) || [];
      setTaskCount(incompleteTasks.length);
    } catch (_e) { /* ignore */ }
  };

  // Load my statuses, announcements, and tasks on mount + poll counts every 15s
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const result = await api.getMyStatuses();
        const statuses = result?.statuses || [];
        setHasActiveStory(statuses.length > 0);
      } catch (error) {
        console.error('[Sidebar] Error loading statuses:', error);
      }

      // Load contact stories
      try {
        const contactResult = await api.getContactStatuses();
        setContactStories(contactResult?.users || []);
      } catch (_e) { /* ignore */ }

      refreshCounts();
    };

    if (user?.id) {
      loadInitialData();

      // Poll task and announcement counts every 15 seconds
      const interval = setInterval(refreshCounts, 15000);
      return () => clearInterval(interval);
    }
  }, [user?.id]);

  const handleSettingsClick = () => {
    if (onSettingsClick) {
      onSettingsClick();
    } else {
      navigate('/settings');
    }
  };

  const handleAvatarClick = () => {
    if (hasActiveStory) {
      setShowStoryViewer(true);
      setStoryViewUserId(user?.id || null);
    } else {
      handleSettingsClick();
    }
  };

  const handleAddStory = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowStoryCreation(true);
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
        .map((p) => p.displayName || p.username)
        .join(', ');

    return convName.toLowerCase().includes(query);
  });

  if (!user) {
    return null;
  }

  const isConversationActive = (convId: string) => {
    return convId === conversationId;
  };

  const handleNavigateChat = () => {
    if (onNavigateChat) {
      onNavigateChat();
    } else if (isMobile && onClose) {
      onClose();
    }
  };

  return (
    <>
      <div className={`relative bg-white dark:bg-surface-900 border-r border-gray-200 dark:border-surface-700 flex flex-col ${isMobile ? 'w-full h-full' : 'w-80 h-screen'}`}>
        {/* Header */}
        <div className="p-4 border-b border-gray-200 dark:border-surface-700 flex-shrink-0">
          <div className="flex items-center justify-between mb-4">
            {isMobile ? (
              <>
                <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                  OMNILINK
                </h1>
                <button
                  onClick={() => {
                    if (onAnnouncementsClick) {
                      onAnnouncementsClick();
                    }
                  }}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-surface-800 rounded-lg transition-colors relative"
                  title="Announcements"
                >
                  <Bell className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                  {announcementCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] flex items-center justify-center bg-red-500 text-white text-[9px] font-bold rounded-full px-1 leading-none shadow-sm border-2 border-white dark:border-surface-900">
                      {announcementCount > 9 ? '9+' : announcementCount}
                    </span>
                  )}
                </button>
              </>
            ) : (
              <>
                <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                  OMNILINK
                </h1>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      if (onAnnouncementsClick) {
                        onAnnouncementsClick();
                      }
                    }}
                    className="p-2 hover:bg-gray-100 dark:hover:bg-surface-800 rounded-lg transition-colors relative"
                    title="Announcements"
                  >
                    <Bell className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                    {announcementCount > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] flex items-center justify-center bg-red-500 text-white text-[9px] font-bold rounded-full px-1 leading-none shadow-sm border-2 border-white dark:border-surface-900">
                        {announcementCount > 9 ? '9+' : announcementCount}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={onTasksClick}
                    className="p-2 hover:bg-gray-100 dark:hover:bg-surface-800 rounded-lg transition-colors relative"
                    title="Tasks"
                  >
                    <Clipboard className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                    {taskCount > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] flex items-center justify-center bg-red-500 text-white text-[9px] font-bold rounded-full px-1 leading-none shadow-sm border-2 border-white dark:border-surface-900">
                        {taskCount > 9 ? '9+' : taskCount}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={handleSettingsClick}
                    className="p-2 hover:bg-gray-100 dark:hover:bg-surface-800 rounded-lg transition-colors"
                    title="Settings"
                  >
                    <Settings className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                  </button>
                </div>
              </>
            )}
          </div>

          {/* User profile mini with story ring and add button */}
          <div
            onClick={handleAvatarClick}
            className={`w-full flex items-center gap-3 p-2 rounded-lg transition-colors group ${
              isMobile ? '' : 'cursor-pointer hover:bg-gray-100 dark:hover:bg-surface-800'
            }`}
          >
            <div className="relative flex-shrink-0 w-[58px] h-[58px] flex items-center justify-center">
              {/* Story dashed ring - SVG for guaranteed visibility */}
              {hasActiveStory && (
                <svg
                  className="absolute inset-0 w-[58px] h-[58px] animate-spin pointer-events-none"
                  style={{ animationDuration: '12s' }}
                  viewBox="0 0 58 58"
                >
                  <circle
                    cx="29"
                    cy="29"
                    r="26.5"
                    fill="none"
                    stroke="#f59e0b"
                    strokeWidth="3"
                    strokeDasharray="6 4"
                    strokeLinecap="round"
                  />
                </svg>
              )}
              <Avatar src={user.avatar || (user as any).avatarUrl} name={user.displayName || user.username || user.email || 'User'} username={user.username || user.email || 'User'} size="lg" />
            </div>
            <div className="flex-1 text-left min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                {user.displayName || user.username || user.email?.split('@')[0] || 'User'}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                {user.email || ''}
              </p>
            </div>
            <button
              onClick={handleAddStory}
              className="flex-shrink-0 w-10 h-10 flex items-center justify-center bg-primary-600 dark:bg-primary-500 text-white rounded-full hover:bg-primary-700 dark:hover:bg-primary-600 transition-colors shadow-md relative"
              title="Add story"
              style={{ outline: 'none' }}
            >
              <div className="absolute inset-[-3px] rounded-full border-2 border-dashed border-primary-400 dark:border-primary-300 animate-spin" style={{ animationDuration: '8s' }} />
              <Plus className="w-4 h-4 relative z-10" />
            </button>
          </div>

          {/* Contact stories are shown as rings on conversation avatars — no separate row needed */}
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

        {/* Conversations list */}
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {isLoadingConversations && conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary-600 dark:border-primary-400 border-t-transparent mb-2" />
              <p className="text-sm text-gray-500 dark:text-gray-400">Loading chats...</p>
            </div>
          ) : filteredConversations.length === 0 && searchQuery ? (
            <div className="flex flex-col items-center justify-center h-32 text-center px-4">
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                No conversations found
              </p>
            </div>
          ) : (
            <div className="space-y-0">
              {/* Conversations */}
              {filteredConversations.length === 0 && !searchQuery ? (
                <div className="flex flex-col items-center justify-center h-32 text-center px-4">
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    No chats with human beings!
                  </p>
                </div>
              ) : (
                filteredConversations.map((conversation) => {
                  // Check if any participant (except current user) is online
                  const otherUserId = conversation.participants.find(
                    (p) => p.id !== user.id
                  )?.id;
                  const isOnline = otherUserId ? onlineUsers.has(otherUserId) : false;

                  // Get typing users for this conversation (exclude current user)
                  const convTyping = typingIndicators.get(conversation.id) || [];
                  const typingUserNames = convTyping
                    .filter(t => t.userId !== user.id)
                    .map(t => t.username);

                  // Check if the other user has an active story
                  const otherUserStory = otherUserId
                    ? contactStories.find(cs => cs.userId === otherUserId)
                    : undefined;

                  // Use real-time unread count from store (overrides stale API value)
                  const liveUnreadCount = unreadCounts.get(conversation.id) ?? conversation.unreadCount ?? 0;
                  const conversationWithUnread = { ...conversation, unreadCount: liveUnreadCount };

                  return (
                    <ConversationItem
                      key={conversation.id}
                      conversation={conversationWithUnread}
                      isActive={isConversationActive(conversation.id)}
                      isOnline={conversation.participants.length === 2 ? isOnline : undefined}
                      onNavigate={handleNavigateChat}
                      typingUsers={typingUserNames.length > 0 ? typingUserNames : undefined}
                      hasStory={!!otherUserStory}
                      hasUnviewedStory={otherUserStory?.hasUnviewed}
                      onStoryClick={otherUserStory ? () => {
                        setStoryViewUserId(otherUserId!);
                        setShowStoryViewer(true);
                      } : undefined}
                    />
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* New Chat button - bottom */}
        <div className={`px-4 flex-shrink-0 border-t border-gray-200 dark:border-surface-700 ${isMobile ? 'py-2 pb-3' : 'py-2'}`}>
          <button
            onClick={() => setIsModalOpen(true)}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-primary-600 dark:bg-primary-500 text-white rounded-lg hover:bg-primary-700 dark:hover:bg-primary-600 transition-colors font-medium"
          >
            <Plus className="w-5 h-5" />
            New Chat
          </button>
        </div>

      </div>

      {/* Story Creation Modal */}
      {showStoryCreation && (
        <StoryCreationModal
          isOpen={showStoryCreation}
          onClose={() => setShowStoryCreation(false)}
          onStoryCreated={() => {
            setHasActiveStory(true);
            setShowStoryCreation(false);
          }}
        />
      )}

      {/* Story Viewer Modal */}
      {showStoryViewer && storyViewUserId && (
        <StoryViewerModal
          isOpen={showStoryViewer}
          userId={storyViewUserId}
          onClose={() => {
            setShowStoryViewer(false);
            setStoryViewUserId(null);
            // Refresh contact stories so viewed rings update
            api.getContactStatuses().then(r => setContactStories(r?.users || [])).catch(() => {});
          }}
          onStoryDeleted={() => {
            setHasActiveStory(false);
          }}
        />
      )}

      {/* New Conversation Modal */}
      <NewConversationModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </>
  );
};

// Story Creation Modal Component
interface StoryCreationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStoryCreated: () => void;
}

const StoryCreationModal: React.FC<StoryCreationModalProps> = ({ isOpen, onClose, onStoryCreated }) => {
  const [activeTab, setActiveTab] = useState<'text' | 'photo'>('text');
  const [textContent, setTextContent] = useState('');
  const [backgroundColor, setBackgroundColor] = useState('#FF6B6B');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoCaption, setPhotoCaption] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F'];

  if (!isOpen) return null;

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      if (activeTab === 'text') {
        if (textContent.trim()) {
          await api.createTextStatus(textContent, backgroundColor);
          onStoryCreated();
        }
      } else {
        if (photoFile) {
          await api.createMediaStatus(photoFile, photoCaption);
          onStoryCreated();
        }
      }
    } catch (error) {
      console.error('Error creating story:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-3">
      <div className="bg-white dark:bg-surface-800 rounded-2xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Add Story</h2>

        {/* Tabs */}
        <div className="flex gap-2 mb-4 border-b border-gray-200 dark:border-surface-700">
          <button
            onClick={() => setActiveTab('text')}
            className={`px-4 py-2 font-medium transition-colors ${
              activeTab === 'text'
                ? 'text-primary-600 dark:text-primary-400 border-b-2 border-primary-600 dark:border-primary-400'
                : 'text-gray-600 dark:text-gray-400'
            }`}
          >
            Text
          </button>
          <button
            onClick={() => setActiveTab('photo')}
            className={`px-4 py-2 font-medium transition-colors ${
              activeTab === 'photo'
                ? 'text-primary-600 dark:text-primary-400 border-b-2 border-primary-600 dark:border-primary-400'
                : 'text-gray-600 dark:text-gray-400'
            }`}
          >
            Photo
          </button>
        </div>

        {/* Text Tab */}
        {activeTab === 'text' && (
          <div className="space-y-4">
            <textarea
              value={textContent}
              onChange={(e) => setTextContent(e.target.value)}
              placeholder="Write your story..."
              className="w-full p-3 border border-gray-300 dark:border-surface-700 rounded-lg bg-white dark:bg-surface-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400 resize-none h-24"
            />

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Background Color
              </label>
              <div className="flex gap-2">
                {colors.map((color) => (
                  <button
                    key={color}
                    onClick={() => setBackgroundColor(color)}
                    className={`w-8 h-8 rounded-full border-2 transition-transform ${
                      backgroundColor === color
                        ? 'border-gray-900 dark:border-white scale-110'
                        : 'border-gray-300 dark:border-surface-600'
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>

            <div
              className="w-full h-32 rounded-lg flex items-center justify-center text-white font-medium text-center px-4 mb-4"
              style={{ backgroundColor }}
            >
              {textContent || 'Preview'}
            </div>
          </div>
        )}

        {/* Photo Tab */}
        {activeTab === 'photo' && (
          <div className="space-y-4">
            <div className="border-2 border-dashed border-gray-300 dark:border-surface-600 rounded-lg p-6 text-center">
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setPhotoFile(e.target.files?.[0] || null)}
                className="w-full"
              />
              {photoFile && (
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                  Selected: {photoFile.name}
                </p>
              )}
            </div>

            <textarea
              value={photoCaption}
              onChange={(e) => setPhotoCaption(e.target.value)}
              placeholder="Add a caption (optional)..."
              className="w-full p-3 border border-gray-300 dark:border-surface-700 rounded-lg bg-white dark:bg-surface-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400 resize-none h-16"
            />
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-300 dark:border-surface-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-surface-700 transition-colors font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || (activeTab === 'text' ? !textContent.trim() : !photoFile)}
            className="flex-1 px-4 py-2 bg-primary-600 dark:bg-primary-500 text-white rounded-lg hover:bg-primary-700 dark:hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
          >
            {isSubmitting ? 'Creating...' : 'Post Story'}
          </button>
        </div>
      </div>
    </div>
  );
};


// Story Viewer Modal Component — extracted to @/components/common/StoryViewerModal

export default Sidebar;
