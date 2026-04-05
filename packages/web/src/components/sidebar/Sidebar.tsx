import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Search, Settings, Plus, BarChart3, Bell, Clipboard, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { useChatStore } from '@/store/chatStore';
import { useAuthStore } from '@/store/authStore';
import { usePresenceStore } from '@/store/presenceStore';
import { api, StatusItem } from '@/services/api';
import Avatar from '@/components/common/Avatar';
import ConversationItem from '@/components/sidebar/ConversationItem';
import LindaConversationItem from '@/components/sidebar/LindaConversationItem';
import NewConversationModal from '@/components/sidebar/NewConversationModal';

interface SidebarProps {
  isMobile?: boolean;
  onNavigateChat?: () => void;
  onSettingsClick?: () => void;
  onDashboardClick?: () => void;
  onClose?: () => void;
  onLindaClick?: () => void;
  onAnnouncementsClick?: () => void;
  onTasksClick?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isMobile = false,
  onNavigateChat,
  onSettingsClick,
  onDashboardClick,
  onClose,
  onLindaClick,
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
  const [announcementCount, setAnnouncementCount] = useState(0);
  const [taskCount, setTaskCount] = useState(0);

  const {
    conversations,
    fetchConversations,
    isLoadingConversations,
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
      const incompleteTasks = tasks?.filter((task: any) => !task.completed && task.assignedToId === user?.id) || [];
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

  const handleNavigateChat = () => {
    if (onNavigateChat) {
      onNavigateChat();
    } else if (isMobile && onClose) {
      onClose();
    }
  };

  return (
    <>
      <div className={`relative bg-white dark:bg-surface-900 border-r border-gray-200 dark:border-surface-700 flex flex-col ${isMobile ? 'w-full h-full pb-14' : 'w-80 h-screen'}`}>
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
                    <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-3.5 flex items-center justify-center bg-red-500 text-white text-[9px] font-bold rounded-full px-0.5 leading-none shadow-sm border border-white dark:border-surface-900">
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
                    onClick={onDashboardClick}
                    className="p-2 hover:bg-gray-100 dark:hover:bg-surface-800 rounded-lg transition-colors"
                    title="Admin Dashboard"
                  >
                    <BarChart3 className="w-5 h-5 text-gray-600 dark:text-gray-400" />
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
            <div className="space-y-1">
              {/* Linda AI - Always shown unless searching */}
              {!searchQuery && (
                <LindaConversationItem
                  isActive={conversationId === 'linda'}
                  onClick={() => {
                    if (onLindaClick) {
                      onLindaClick();
                    } else if (isMobile && onClose) {
                      onClose();
                    }
                  }}
                />
              )}

              {/* Regular conversations */}
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

                  return (
                    <ConversationItem
                      key={conversation.id}
                      conversation={conversation}
                      isActive={isConversationActive(conversation.id)}
                      isOnline={conversation.participants.length === 2 ? isOnline : undefined}
                      onNavigate={handleNavigateChat}
                    />
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* New Chat button - bottom */}
        <div className={`px-4 flex-shrink-0 border-t border-gray-200 dark:border-surface-700 ${isMobile ? 'py-1.5 pb-2' : 'py-2'}`} style={isMobile ? { marginBottom: '10px' } : undefined}>
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

// Story Viewer Modal Component
interface StoryViewerModalProps {
  isOpen: boolean;
  userId: string;
  onClose: () => void;
  onStoryDeleted?: () => void;
}

const StoryViewerModal: React.FC<StoryViewerModalProps> = ({ isOpen, userId, onClose, onStoryDeleted }) => {
  const [stories, setStories] = useState<StatusItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [isLiking, setIsLiking] = useState(false);
  const [likedAvatars, setLikedAvatars] = useState<Array<{ id: string; username: string; avatarUrl?: string }>>([]);
  const [showLikeHeart, setShowLikeHeart] = useState(false);
  const replyInputRef = React.useRef<HTMLInputElement>(null);
  const { user } = useAuthStore();
  const [isMobileView] = useState(window.innerWidth < 768);
  const STORY_DURATION = 7000; // 7 seconds per story

  const handleDeleteStory = async () => {
    const story = stories[currentIndex];
    if (!story || !confirm('Delete this story?')) return;
    setIsDeleting(true);
    try {
      await api.deleteStatus(story.id);
      const remaining = stories.filter((_, i) => i !== currentIndex);
      setStories(remaining);
      if (currentIndex >= remaining.length) {
        setCurrentIndex(Math.max(0, remaining.length - 1));
      }
      if (remaining.length === 0) {
        onStoryDeleted?.();
        onClose();
      }
    } catch (error) {
      console.error('Error deleting story:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleLike = async () => {
    const story = stories[currentIndex];
    if (!story || isLiking) return;
    setIsLiking(true);
    try {
      const result = await api.likeStatus(story.id);
      // Update local state
      const updated = [...stories];
      updated[currentIndex] = {
        ...updated[currentIndex],
        likedByMe: result.liked,
        likeCount: (updated[currentIndex].likeCount || 0) + (result.liked ? 1 : -1),
      };
      setStories(updated);
      if (result.liked) {
        setShowLikeHeart(true);
        setTimeout(() => setShowLikeHeart(false), 1000);
      }
      // Refresh liked avatars
      loadLikes(story.id);
    } catch (error) {
      console.error('Error liking story:', error);
    } finally {
      setIsLiking(false);
    }
  };

  const loadLikes = async (statusId: string) => {
    try {
      const result = await api.getStatusLikes(statusId);
      setLikedAvatars(result.likes || []);
    } catch {
      setLikedAvatars([]);
    }
  };

  const handleReply = async () => {
    if (!replyText.trim()) return;
    const story = stories[currentIndex];
    if (!story) return;

    // For story replies we need to find/create a conversation with the story owner
    // and send the message with story metadata
    try {
      // Get conversations to find existing one with this user
      const conversations = await api.getConversations();
      let conversationId: string | null = null;

      // Find direct conversation with story owner (direct = 2 participants)
      for (const conv of conversations) {
        const participants = conv.participants || [];
        if (participants.length === 2) {
          const other = participants.find((p) => p.id !== user?.id);
          if (other?.id === userId) {
            conversationId = conv.id;
            break;
          }
        }
      }

      if (conversationId) {
        await api.sendMessage(conversationId, replyText.trim(), undefined, {
          storyId: story.id,
          storyContent: story.content,
          storyType: story.type,
          storyBgColor: story.bgColor,
        });
        setReplyText('');
        // Brief visual feedback
        setIsPaused(false);
      }
    } catch (error) {
      console.error('Error sending story reply:', error);
    }
  };

  const goNext = () => {
    if (currentIndex < stories.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setProgress(0);
    } else {
      onClose();
    }
  };

  const goPrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      setProgress(0);
    }
  };

  // Auto-advance timer (paused when reply input focused)
  useEffect(() => {
    if (!isOpen || stories.length === 0 || isPaused || isDeleting) return;
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          goNext();
          return 0;
        }
        return prev + (100 / (STORY_DURATION / 50));
      });
    }, 50);
    return () => clearInterval(interval);
  }, [isOpen, currentIndex, stories.length, isPaused, isDeleting]);

  // Reset progress + load likes on index change
  useEffect(() => {
    setProgress(0);
    setReplyText('');
    if (stories[currentIndex]) {
      loadLikes(stories[currentIndex].id);
    }
  }, [currentIndex, stories.length]);

  useEffect(() => {
    if (isOpen) {
      const loadStories = async () => {
        try {
          if (userId === user?.id) {
            const result = await api.getMyStatuses();
            setStories(result?.statuses || []);
          } else {
            const result = await api.getContactStatuses();
            const userGroup = result?.users?.find((u: any) => u.user?.id === userId);
            setStories(userGroup?.statuses || []);
          }
          setCurrentIndex(0);
          setProgress(0);
        } catch (error) {
          console.error('Error loading stories:', error);
        } finally {
          setIsLoading(false);
        }
      };
      loadStories();
    }
  }, [isOpen, userId, user?.id]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      // Don't navigate if typing in reply input
      if (document.activeElement === replyInputRef.current) {
        if (e.key === 'Escape') {
          replyInputRef.current?.blur();
          setIsPaused(false);
        }
        return;
      }
      if (e.key === 'ArrowRight') goNext();
      else if (e.key === 'ArrowLeft') goPrev();
      else if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, currentIndex, stories.length]);

  if (!isOpen) return null;

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center z-50">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-white border-t-transparent" />
      </div>
    );
  }

  if (stories.length === 0) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center z-50">
        <div className="text-center">
          <p className="text-white/70 mb-4">No stories available</p>
          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-white/10 text-white rounded-full hover:bg-white/20 transition font-medium"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  const currentStory = stories[currentIndex];
  const isOwnStory = userId === user?.id;

  // Handle tap on story for mobile (Instagram-style: left half = prev, right half = next)
  const handleStoryTap = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isMobileView) return;
    // Don't navigate if tapping near the bottom (reply/like area)
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    if (y > rect.height * 0.85) return;

    const x = e.clientX - rect.left;
    const width = rect.width;
    if (x < width * 0.3) {
      goPrev();
    } else {
      goNext();
    }
  };

  // Double tap to like
  let lastTap = 0;
  const handleDoubleTap = (_e: React.MouseEvent<HTMLDivElement>) => {
    const now = Date.now();
    if (now - lastTap < 300) {
      // Double tap — like
      if (!isOwnStory) {
        handleLike();
      }
    }
    lastTap = now;
  };

  return (
    <div className="fixed inset-0 bg-black z-50 flex items-center justify-center">
      {/* Story container */}
      <div
        className={`relative ${isMobileView ? 'w-full h-full' : 'w-full max-w-sm mx-auto'}`}
        style={!isMobileView ? { aspectRatio: '9/16', maxHeight: '90vh' } : undefined}
      >
        {/* Progress bars (Instagram/Telegram style) */}
        <div className="absolute top-0 left-0 right-0 z-30 flex gap-1 px-2 pt-2">
          {stories.map((_, i) => (
            <div key={i} className="flex-1 h-[3px] rounded-full bg-white/30 overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: i < currentIndex ? '100%' : i === currentIndex ? `${progress}%` : '0%',
                  backgroundColor: 'white',
                  transition: i === currentIndex ? 'none' : 'width 0.2s ease',
                }}
              />
            </div>
          ))}
        </div>

        {/* Top gradient overlay */}
        <div className={`absolute top-0 left-0 right-0 h-24 bg-gradient-to-b from-black/50 to-transparent z-20 pointer-events-none ${isMobileView ? '' : 'rounded-t-2xl'}`} />

        {/* Top bar: user info + actions */}
        <div className="absolute top-6 left-0 right-0 z-30 flex items-center px-3 gap-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="w-8 h-8 rounded-full overflow-hidden border-2 border-white/50 flex-shrink-0">
              <img
                src={user?.avatar || (user as any)?.avatarUrl || ''}
                alt=""
                className="w-full h-full object-cover"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            </div>
            <span className="text-white text-sm font-medium truncate">
              {user?.displayName || user?.username || 'You'}
            </span>
            <span className="text-white/50 text-xs">
              {currentStory.createdAt ? new Date(currentStory.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {isOwnStory && (
              <button
                onClick={(e) => { e.stopPropagation(); handleDeleteStory(); }}
                disabled={isDeleting}
                className="p-2 rounded-full text-white/80 hover:text-red-400 hover:bg-white/10 transition disabled:opacity-50"
                title="Delete story"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); onClose(); }}
              className="p-2 rounded-full text-white/80 hover:text-white hover:bg-white/10 transition"
              title="Close"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Story content */}
        <div
          className={`w-full h-full ${isMobileView ? '' : 'rounded-2xl'} overflow-hidden ${isMobileView ? '' : 'shadow-2xl'}`}
          style={{
            ...(currentStory.type === 'text' ? { backgroundColor: currentStory.bgColor || '#FF6B6B' } : { backgroundColor: '#000' }),
          }}
          onClick={(e) => { handleStoryTap(e); handleDoubleTap(e); }}
          onMouseDown={() => { if (!replyInputRef.current || document.activeElement !== replyInputRef.current) setIsPaused(true); }}
          onMouseUp={() => { if (!replyInputRef.current || document.activeElement !== replyInputRef.current) setIsPaused(false); }}
          onMouseLeave={() => setIsPaused(false)}
          onTouchStart={() => { if (!replyInputRef.current || document.activeElement !== replyInputRef.current) setIsPaused(true); }}
          onTouchEnd={() => { if (!replyInputRef.current || document.activeElement !== replyInputRef.current) setIsPaused(false); }}
        >
          {currentStory.type === 'text' ? (
            <div className="w-full h-full flex items-center justify-center text-white text-center px-8 py-20">
              <p className="text-2xl md:text-3xl font-medium leading-relaxed">{currentStory.content}</p>
            </div>
          ) : (
            <div className="w-full h-full bg-black flex items-center justify-center">
              {currentStory.content && (
                <img src={currentStory.content} alt="Story" className="w-full h-full object-cover" />
              )}
            </div>
          )}
        </div>

        {/* Animated like heart (double-tap feedback) */}
        {showLikeHeart && (
          <div className="absolute inset-0 flex items-center justify-center z-40 pointer-events-none">
            <svg className="w-24 h-24 text-red-500 animate-ping" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
            </svg>
          </div>
        )}

        {/* Web view: arrow navigation INSIDE the story frame */}
        {!isMobileView && stories.length > 1 && (
          <>
            {currentIndex > 0 && (
              <button
                onClick={(e) => { e.stopPropagation(); goPrev(); }}
                className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center bg-black/30 hover:bg-black/50 backdrop-blur-sm rounded-full text-white/80 hover:text-white transition z-30"
              >
                <ChevronLeft size={22} />
              </button>
            )}
            {currentIndex < stories.length - 1 && (
              <button
                onClick={(e) => { e.stopPropagation(); goNext(); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center bg-black/30 hover:bg-black/50 backdrop-blur-sm rounded-full text-white/80 hover:text-white transition z-30"
              >
                <ChevronRight size={22} />
              </button>
            )}
          </>
        )}

        {/* Bottom gradient */}
        <div className={`absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-black/60 to-transparent z-20 pointer-events-none ${isMobileView ? '' : 'rounded-b-2xl'}`} />

        {/* Bottom section: likes + reply */}
        <div className="absolute bottom-0 left-0 right-0 z-30 px-3 pb-3 space-y-2" style={isMobileView ? { paddingBottom: '12px' } : undefined}>
          {/* Liked avatars row */}
          {likedAvatars.length > 0 && (
            <div className="flex items-center gap-1.5 px-1">
              <div className="flex -space-x-2">
                {likedAvatars.slice(0, 5).map((u) => (
                  <div key={u.id} className="w-6 h-6 rounded-full border-2 border-black overflow-hidden flex-shrink-0">
                    {u.avatarUrl ? (
                      <img src={u.avatarUrl} alt={u.username} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-primary-500 flex items-center justify-center text-white text-[8px] font-bold">
                        {u.username?.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <span className="text-white/70 text-[11px]">
                {likedAvatars.length === 1
                  ? `${likedAvatars[0].username} liked`
                  : `${likedAvatars.length} likes`}
              </span>
            </div>
          )}

          {/* Own story: show view count + like count */}
          {isOwnStory && (
            <div className="flex items-center gap-4 px-1 py-1">
              <div className="flex items-center gap-1.5 text-white/60 text-xs">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                {currentStory.viewCount || 0}
              </div>
              <div className="flex items-center gap-1.5 text-white/60 text-xs">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                </svg>
                {currentStory.likeCount || 0}
              </div>
            </div>
          )}

          {/* Reply input + like button (always visible) */}
          <div className="flex items-center gap-2">
            <div className="flex-1 relative">
              <input
                ref={replyInputRef}
                type="text"
                placeholder={isOwnStory ? "Send a message..." : "Reply to story..."}
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                onFocus={() => setIsPaused(true)}
                onBlur={() => { if (!replyText) setIsPaused(false); }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && replyText.trim()) {
                    e.preventDefault();
                    handleReply();
                  }
                }}
                className="w-full px-4 py-2.5 bg-white/15 backdrop-blur-sm border border-white/20 rounded-full text-sm text-white placeholder-white/50 focus:outline-none focus:ring-1 focus:ring-white/40 focus:bg-white/20"
              />
              {replyText.trim() && (
                <button
                  onClick={handleReply}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center bg-primary-600 rounded-full text-white hover:bg-primary-700 transition"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </button>
              )}
            </div>
            {!isOwnStory && (
              <button
                onClick={(e) => { e.stopPropagation(); handleLike(); }}
                disabled={isLiking}
                className="p-2.5 rounded-full transition flex-shrink-0"
                title={currentStory.likedByMe ? 'Unlike' : 'Like'}
              >
                <svg
                  className={`w-6 h-6 transition-all ${currentStory.likedByMe ? 'text-red-500 scale-110' : 'text-white/70 hover:text-red-400'}`}
                  fill={currentStory.likedByMe ? 'currentColor' : 'none'}
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Backdrop click to close (web only, outside the story card) */}
      {!isMobileView && (
        <div className="absolute inset-0 -z-10" onClick={onClose} />
      )}
    </div>
  );
};

export default Sidebar;
