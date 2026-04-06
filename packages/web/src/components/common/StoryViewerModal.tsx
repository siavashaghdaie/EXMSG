import React, { useState, useEffect, useRef } from 'react';
import { Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { api, StatusItem } from '@/services/api';
import { useAuthStore } from '@/store/authStore';

export interface StoryViewerModalProps {
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
  const replyInputRef = useRef<HTMLInputElement>(null);
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

        // Send heart reaction as story reply in DM
        try {
          const conversations = await api.getConversations();
          let dmConversationId: string | null = null;
          for (const conv of conversations) {
            const participants = conv.participants || [];
            if (participants.length === 2) {
              const other = participants.find((p) => p.id !== user?.id);
              if (other?.id === userId) {
                dmConversationId = conv.id;
                break;
              }
            }
          }
          if (dmConversationId) {
            await api.sendMessage(dmConversationId, '❤️', undefined, {
              storyId: story.id,
              storyContent: story.content,
              storyType: story.type,
              storyBgColor: story.bgColor,
            });
          }
        } catch (err) {
          console.error('Error sending story like to DM:', err);
        }
      }
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

    try {
      const conversations = await api.getConversations();
      let conversationId: string | null = null;

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

  // Auto-advance timer
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

  // Reset progress + load likes on index change + mark as viewed
  useEffect(() => {
    setProgress(0);
    setReplyText('');
    if (stories[currentIndex]) {
      loadLikes(stories[currentIndex].id);
      if (userId !== user?.id) {
        api.viewStatus(stories[currentIndex].id).catch(() => {});
      }
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
            const userGroup = result?.users?.find((u: any) => u.userId === userId);
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

  const handleStoryTap = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isMobileView) return;
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

  let lastTap = 0;
  const handleDoubleTap = (_e: React.MouseEvent<HTMLDivElement>) => {
    const now = Date.now();
    if (now - lastTap < 300) {
      if (!isOwnStory) {
        handleLike();
      }
    }
    lastTap = now;
  };

  return (
    <div className="fixed inset-0 bg-black z-50 flex items-center justify-center">
      <div
        className={`relative ${isMobileView ? 'w-full h-full' : 'w-full max-w-sm mx-auto'}`}
        style={!isMobileView ? { aspectRatio: '9/16', maxHeight: '90vh' } : undefined}
      >
        {/* Progress bars */}
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

        {/* Top gradient */}
        <div className={`absolute top-0 left-0 right-0 h-24 bg-gradient-to-b from-black/50 to-transparent z-20 pointer-events-none ${isMobileView ? '' : 'rounded-t-2xl'}`} />

        {/* Top bar */}
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

        {/* Animated like heart */}
        {showLikeHeart && (
          <div className="absolute inset-0 flex items-center justify-center z-40 pointer-events-none">
            <svg className="w-24 h-24 text-red-500 animate-ping" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
            </svg>
          </div>
        )}

        {/* Web arrow navigation */}
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

          {!isOwnStory && (
            <div className="flex items-center gap-2">
              <div className="flex-1 relative">
                <input
                  ref={replyInputRef}
                  type="text"
                  placeholder="Reply to story..."
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
            </div>
          )}
        </div>
      </div>

      {/* Backdrop click to close (web only) */}
      {!isMobileView && (
        <div className="absolute inset-0 -z-10" onClick={onClose} />
      )}
    </div>
  );
};

export default StoryViewerModal;
