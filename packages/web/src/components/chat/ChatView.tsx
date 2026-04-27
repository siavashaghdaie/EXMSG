import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { format, isToday, isYesterday } from 'date-fns';
import { ArrowDown, ChevronLeft, Phone, Video, Eye, SlidersHorizontal, MessageSquare, ClipboardList, Megaphone, ArrowUpDown, RefreshCw, CheckCircle2, XCircle, Sparkles, Bot, X } from 'lucide-react';
import { useChatStore } from '@/store/chatStore';
import { useAuthStore } from '@/store/authStore';
import { MessageResponse, ConversationResponse, api, UserStatusGroup, LindaActivity } from '@/services/api';
import MessageBubble from './MessageBubble';
import MessageComposer from './MessageComposer';
import TypingIndicator from './TypingIndicator';
import BuzzButton from './BuzzButton';
import BuzzOverlay from './BuzzOverlay';
import Avatar from '@/components/common/Avatar';
import StoryViewerModal from '@/components/common/StoryViewerModal';
import PresenceIndicator from '@/components/common/PresenceIndicator';
import { callService } from '@/services/callService';

export default function ChatView() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const {
    messages,
    conversations,
    activeConversation,
    setActiveConversation,
    fetchMessages,
    typingIndicators,
    buzzActive,
    sendBuzz,
  } = useChatStore();
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const scrollPositionRef = useRef<number>(0);

  const activeBuzz = conversationId ? buzzActive.get(conversationId) : undefined;

  // Linda-specific state
  const [lindaPanel, setLindaPanel] = useState<'none' | 'activities' | 'settings'>('none');
  const [lindaActivities, setLindaActivities] = useState<LindaActivity[]>([]);
  const [loadingActivities, setLoadingActivities] = useState(false);
  const [lindaResponseStyle, setLindaResponseStyle] = useState<'Professional' | 'Casual' | 'Concise'>(() =>
    (localStorage.getItem('linda_responseStyle') as any) || 'Professional'
  );
  const [lindaAutoTranslate, setLindaAutoTranslate] = useState(() =>
    localStorage.getItem('linda_autoTranslate') === 'true'
  );
  const [lindaLanguage, setLindaLanguage] = useState(() =>
    localStorage.getItem('linda_languagePreference') || 'English'
  );

  // Contact stories for header story ring
  const [contactStories, setContactStories] = useState<UserStatusGroup[]>([]);
  const [showStoryViewer, setShowStoryViewer] = useState(false);
  const [storyViewUserId, setStoryViewUserId] = useState<string>('');

  useEffect(() => {
    const loadContactStories = async () => {
      try {
        const result = await api.getContactStatuses();
        setContactStories(result?.users || []);
      } catch {
        // silently fail
      }
    };
    loadContactStories();
  }, [conversationId]);

  // Close Linda panel when switching conversations
  useEffect(() => {
    setLindaPanel('none');
  }, [conversationId]);

  const loadLindaActivities = async () => {
    setLoadingActivities(true);
    try {
      const data = await api.getLindaActivities();
      setLindaActivities(data.activities || []);
    } catch (err) {
      console.error('Failed to load Linda activities:', err);
    } finally {
      setLoadingActivities(false);
    }
  };

  const saveLindaSetting = (key: string, value: string) => {
    localStorage.setItem(`linda_${key}`, value);
  };

  // Scroll to bottom on new messages — use scrollTop instead of scrollIntoView
  // to avoid stealing focus from the message input on mobile.
  // Use 'auto' (instant) scroll to prevent mobile browsers from dismissing
  // the virtual keyboard during smooth scroll animations.
  const scrollToBottom = useCallback(() => {
    const container = messagesContainerRef.current;
    if (container) {
      container.scrollTo({ top: container.scrollHeight, behavior: 'auto' });
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages.get(conversationId || '')?.length, scrollToBottom]);

  // Handle responsive behavior
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Mobile keyboard: scroll to bottom when virtual keyboard opens/closes
  // The visualViewport API fires a resize event when the software keyboard appears.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    let prevHeight = vv.height;
    const onViewportResize = () => {
      const currentHeight = vv.height;
      // Keyboard opened (viewport shrank) or closed (viewport grew)
      if (currentHeight !== prevHeight) {
        prevHeight = currentHeight;
        // Small delay to let the browser finish layout
        requestAnimationFrame(() => {
          scrollToBottom();
        });
      }
    };

    vv.addEventListener('resize', onViewportResize);
    return () => vv.removeEventListener('resize', onViewportResize);
  }, [scrollToBottom]);

  // Set active conversation and fetch messages when conversation changes
  useEffect(() => {
    if (conversationId) {
      fetchMessages(conversationId);
      // Find conversation in list and set as active
      const conv = conversations.find(c => c.id === conversationId);
      if (conv) {
        setActiveConversation(conv);
      }
    }
  }, [conversationId, fetchMessages, conversations, setActiveConversation]);

  // Handle scroll detection
  const handleScroll = () => {
    if (!messagesContainerRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
    const isNearBottom = scrollHeight - (scrollTop + clientHeight) > 100;

    setShowScrollButton(isNearBottom);
    scrollPositionRef.current = scrollTop;

    // Load more messages when scrolling to top
    if (scrollTop === 0 && !isLoadingMore && conversationId) {
      setIsLoadingMore(true);
      // Load older messages here
      setTimeout(() => setIsLoadingMore(false), 500);
    }
  };

  if (!conversationId) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-gradient-to-b from-slate-50 to-slate-100">
        <div className="text-center">
          <div className="mb-4 text-6xl">💬</div>
          <h2 className="text-2xl font-bold text-slate-800 mb-2">
            Select a conversation
          </h2>
          <p className="text-slate-600">
            Choose a conversation from the sidebar to start messaging
          </p>
        </div>
      </div>
    );
  }

  const conversationMessages = messages.get(conversationId) || [];
  const conversation = activeConversation as ConversationResponse | null;

  // Detect if this is a Linda conversation
  const isLindaConversation = conversation?.participants.some(
    (p) => p.id !== user?.id && (p.username === 'linda' || (p.email && p.email === 'linda@omnilink.system'))
  ) ?? false;

  // Group messages by sender and time
  const groupedMessages = conversationMessages.reduce<Array<{ messages: MessageResponse[] }>>(
    (groups, message) => {
      const lastGroup = groups[groups.length - 1];
      const isSameSender =
        lastGroup && lastGroup.messages[0].senderId === message.senderId;
      const timeDiff =
        lastGroup &&
        new Date(message.createdAt).getTime() -
          new Date(lastGroup.messages[0].createdAt).getTime() <
          300000; // 5 minutes

      if (isSameSender && timeDiff) {
        lastGroup.messages.push(message);
      } else {
        groups.push({ messages: [message] });
      }
      return groups;
    },
    []
  );

  // Get date separator text
  const getDateSeparator = (date: Date): string => {
    if (isToday(date)) return 'Today';
    if (isYesterday(date)) return 'Yesterday';
    return format(date, 'MMMM d, yyyy');
  };

  // Render date separators between different days
  // Helper to find sender info from conversation participants
  const getSenderName = (senderId: string): string => {
    const participant = conversation?.participants.find(p => p.id === senderId);
    return participant?.username || participant?.email?.split('@')[0] || 'Unknown';
  };

  const getSenderAvatar = (senderId: string): string | undefined => {
    const participant = conversation?.participants.find(p => p.id === senderId);
    return participant?.avatar;
  };

  const getSenderUsername = (senderId: string): string | undefined => {
    const participant = conversation?.participants.find(p => p.id === senderId);
    return participant?.username || participant?.email;
  };

  let lastDate: string | null = null;
  const messagesToRender = groupedMessages.map((group: { messages: MessageResponse[] }, idx: number) => {
    const firstMessage = group.messages[0];
    const currentDate = getDateSeparator(new Date(firstMessage.createdAt));
    const showDateSeparator = lastDate !== currentDate;
    lastDate = currentDate;

    return (
      <React.Fragment key={`group-${idx}`}>
        {showDateSeparator && (
          <div className="flex items-center gap-3 my-4 px-4">
            <div className="flex-1 h-px bg-slate-200" />
            <span className="text-xs text-slate-500 font-medium">
              {currentDate}
            </span>
            <div className="flex-1 h-px bg-slate-200" />
          </div>
        )}
        <div
          className={`flex ${
            firstMessage.senderId === user?.id
              ? 'justify-end'
              : 'justify-start'
          } px-4 mb-1`}
        >
          <div
            className={`flex gap-2 max-w-xs ${
              firstMessage.senderId === user?.id
                ? 'flex-row-reverse'
                : 'flex-row'
            }`}
          >
            {conversation && conversation.participants.length > 2 &&
              firstMessage.senderId !== user?.id && (
                <Avatar
                  name={getSenderName(firstMessage.senderId)}
                  username={getSenderUsername(firstMessage.senderId)}
                  src={getSenderAvatar(firstMessage.senderId)}
                  size="sm"
                />
              )}
            <div
              className={`flex flex-col ${
                firstMessage.senderId === user?.id
                  ? 'items-end'
                  : 'items-start'
              } gap-1`}
            >
              {conversation && conversation.participants.length > 2 &&
                firstMessage.senderId !== user?.id && (
                  <span className="text-xs text-slate-500 px-3 pt-1">
                    {getSenderName(firstMessage.senderId)}
                  </span>
                )}
              <div className="flex flex-col gap-2">
                {group.messages.map((msg: MessageResponse) => (
                  <MessageBubble
                    key={msg.id}
                    message={msg}
                    isOwnMessage={msg.senderId === user?.id}
                    showAvatar={conversation ? conversation.participants.length > 2 : false}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </React.Fragment>
    );
  });

  return (
    <div className={`flex h-full bg-white dark:bg-surface-900 overflow-hidden w-full max-w-full ${activeBuzz ? 'animate-buzz-shake' : ''}`}>
      <div className="flex flex-col h-full flex-1 min-w-0 overflow-hidden relative">
      {/* Header */}
      <div className="border-b border-slate-200 dark:border-surface-700 bg-white dark:bg-surface-900 sticky top-0 z-10">
        <div className="px-2 sm:px-4 py-3 flex items-center justify-between gap-1 overflow-hidden">
          <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0 overflow-hidden">
            {isMobile && (
              <button
                onClick={() => navigate('/chat')}
                className="p-2 hover:bg-slate-100 rounded-lg transition"
                title="Back to chats"
              >
                <ChevronLeft size={20} className="text-slate-600" />
              </button>
            )}
            {conversation && (() => {
              const isGroup = conversation.participants.length > 2;
              const otherParticipants = conversation.participants.filter(p => p.id !== user?.id);
              const getParticipantName = (p: typeof otherParticipants[0]) =>
                p?.username || p?.email?.split('@')[0] || 'User';
              const displayName = conversation.name || otherParticipants.map(getParticipantName).join(', ');
              const avatarSrc = !isGroup && otherParticipants.length === 1
                ? otherParticipants[0]?.avatar
                : undefined;
              // Story ring for DM partner
              const otherUserId = !isGroup && otherParticipants.length === 1
                ? otherParticipants[0]?.id : undefined;
              const otherUserStory = otherUserId
                ? contactStories.find(cs => cs.userId === otherUserId) : undefined;
              const hasStory = !!otherUserStory;
              const hasUnviewedStory = otherUserStory?.hasUnviewed ?? false;
              return (
                <>
                  <div
                    className="relative flex-shrink-0"
                    style={hasStory ? { width: 46, height: 46 } : undefined}
                    onClick={hasStory ? (e) => {
                      e.stopPropagation();
                      setStoryViewUserId(otherUserId!);
                      setShowStoryViewer(true);
                    } : undefined}
                  >
                    {hasStory && (
                      <svg
                        className={`absolute inset-0 pointer-events-none ${hasUnviewedStory ? 'animate-spin' : ''}`}
                        style={hasUnviewedStory ? { animationDuration: '12s' } : undefined}
                        width="46"
                        height="46"
                        viewBox="0 0 46 46"
                      >
                        <circle
                          cx="23"
                          cy="23"
                          r="21"
                          fill="none"
                          stroke={hasUnviewedStory ? '#f59e0b' : '#9ca3af'}
                          strokeWidth="2.5"
                          strokeDasharray="5 3"
                          strokeLinecap="round"
                        />
                      </svg>
                    )}
                    <div style={hasStory ? { position: 'absolute', top: 3, left: 3 } : undefined}>
                      <Avatar
                        name={displayName}
                        username={otherParticipants[0]?.username || otherParticipants[0]?.email}
                        src={avatarSrc}
                        size="md"
                      />
                    </div>
                  </div>
                  <div className="flex-1">
                    <h2 className="font-semibold text-slate-900 dark:text-white">
                      {displayName}
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                      {isGroup
                        ? (
                          <span className="flex items-center gap-1">
                            <span className="flex -space-x-1.5">
                              {otherParticipants.slice(0, 5).map((p) => (
                                <span key={p.id} className="inline-block" title={p.username || p.email}>
                                  <Avatar name={p.username || p.email || ''} src={p.avatar} size="sm" />
                                </span>
                              ))}
                            </span>
                            <span>{conversation.participants.length} members</span>
                          </span>
                        )
                        : otherParticipants.length > 0 && (
                            <PresenceIndicator userId={otherParticipants[0]?.id} showText forceOnline={isLindaConversation} />
                          )}
                    </p>
                  </div>
                </>
              );
            })()}
          </div>
          <div className="flex items-center gap-0.5 sm:gap-2 flex-shrink-0">
            {isLindaConversation && (
              <button
                onClick={() => {
                  if (lindaPanel === 'activities') {
                    setLindaPanel('none');
                  } else {
                    loadLindaActivities();
                    setLindaPanel('activities');
                  }
                }}
                className={`p-1.5 sm:p-2 rounded-lg transition ${lindaPanel === 'activities' ? 'bg-blue-100 dark:bg-blue-900/30' : 'hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                title="Linda's Activities"
              >
                <Eye size={18} className={lindaPanel === 'activities' ? 'text-blue-500' : 'text-slate-600 dark:text-slate-400'} />
              </button>
            )}
            {isLindaConversation && (
              <button
                onClick={() => setLindaPanel(lindaPanel === 'settings' ? 'none' : 'settings')}
                className={`p-1.5 sm:p-2 rounded-lg transition ${lindaPanel === 'settings' ? 'bg-blue-100 dark:bg-blue-900/30' : 'hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                title="Linda Settings"
              >
                <SlidersHorizontal size={18} className={lindaPanel === 'settings' ? 'text-blue-500' : 'text-slate-600 dark:text-slate-400'} />
              </button>
            )}
            <BuzzButton
              conversationId={conversationId}
              onBuzz={sendBuzz}
            />
            <button
              onClick={() => {
                if (conversation) {
                  const otherParticipants = conversation.participants.filter(p => p.id !== user?.id);
                  if (otherParticipants.length > 0) {
                    const target = otherParticipants[0];
                    callService.initiateCall(
                      conversationId!,
                      target.id,
                      target.displayName || target.username,
                      'audio',
                      target.avatar
                    );
                  }
                }
              }}
              className="p-1.5 sm:p-2 hover:bg-slate-100 dark:hover:bg-surface-700 rounded-lg transition"
              title="Voice call"
            >
              <Phone size={18} className="text-slate-600 dark:text-slate-300" />
            </button>
            <button
              onClick={() => {
                if (conversation) {
                  const otherParticipants = conversation.participants.filter(p => p.id !== user?.id);
                  if (otherParticipants.length > 0) {
                    const target = otherParticipants[0];
                    callService.initiateCall(
                      conversationId!,
                      target.id,
                      target.displayName || target.username,
                      'video',
                      target.avatar
                    );
                  }
                }
              }}
              className="p-1.5 sm:p-2 hover:bg-slate-100 rounded-lg transition"
              title="Video call"
            >
              <Video size={18} className="text-slate-600" />
            </button>
          </div>
        </div>
      </div>

      {/* Linda Activities Panel */}
      {isLindaConversation && lindaPanel === 'activities' && (() => {
        const getActivityIcon = (type: string) => {
          switch (type) {
            case 'send_message': return <MessageSquare size={16} className="text-blue-500" />;
            case 'assign_task': return <ClipboardList size={16} className="text-amber-500" />;
            case 'create_announcement': return <Megaphone size={16} className="text-purple-500" />;
            case 'update_task': return <ArrowUpDown size={16} className="text-green-500" />;
            default: return <Bot size={16} className="text-slate-400" />;
          }
        };
        const getActivityLabel = (type: string) => {
          switch (type) {
            case 'send_message': return 'Message Delivered';
            case 'assign_task': return 'Task Assigned';
            case 'create_announcement': return 'Announcement Created';
            case 'update_task': return 'Task Updated';
            default: return 'Action';
          }
        };
        const timeAgo = (dateStr: string) => {
          const diff = Date.now() - new Date(dateStr).getTime();
          const mins = Math.floor(diff / 60000);
          if (mins < 1) return 'just now';
          if (mins < 60) return `${mins}m ago`;
          const hours = Math.floor(mins / 60);
          if (hours < 24) return `${hours}h ago`;
          const days = Math.floor(hours / 24);
          return `${days}d ago`;
        };
        return (
          <div className="absolute inset-0 top-[57px] z-20 bg-white dark:bg-surface-900 flex flex-col overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-gradient-to-r from-slate-50 to-blue-50 dark:from-slate-800 dark:to-blue-900/20 flex-shrink-0">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center">
                <Eye size={14} className="text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Linda's Activities</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">What Linda did for you</p>
              </div>
              <button
                onClick={loadLindaActivities}
                className="p-2 hover:bg-white/50 dark:hover:bg-slate-700 rounded-lg transition"
                title="Refresh"
              >
                <RefreshCw size={14} className={`text-slate-400 ${loadingActivities ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={() => setLindaPanel('none')}
                className="p-2 hover:bg-white/50 dark:hover:bg-slate-700 rounded-lg transition"
              >
                <X size={16} className="text-slate-500" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {loadingActivities ? (
                <div className="flex items-center justify-center py-16">
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <RefreshCw size={16} className="animate-spin" />
                    Loading activities...
                  </div>
                </div>
              ) : lindaActivities.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center px-6">
                  <div className="w-16 h-16 bg-gradient-to-br from-blue-100 to-purple-100 dark:from-blue-900/30 dark:to-purple-900/30 rounded-full flex items-center justify-center mb-3">
                    <Eye size={28} className="text-blue-400" />
                  </div>
                  <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">No Activities Yet</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs">
                    When you ask Linda to send messages, create tasks, or make announcements, you'll see her progress here.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {lindaActivities.map((activity) => (
                    <div key={activity.id} className="px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                      <div className="flex items-start gap-3">
                        <div className="relative flex-shrink-0">
                          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center">
                            <Sparkles size={16} className="text-white" />
                          </div>
                          {activity.targetUser && (
                            <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-slate-200 dark:bg-slate-600 border-2 border-white dark:border-slate-900 flex items-center justify-center overflow-hidden">
                              {activity.targetUser.avatarUrl ? (
                                <img src={activity.targetUser.avatarUrl} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <span className="text-[8px] font-bold text-slate-600 dark:text-slate-300">
                                  {(activity.targetUser.displayName || activity.targetUser.username || '?')[0].toUpperCase()}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            {getActivityIcon(activity.actionType)}
                            <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                              {getActivityLabel(activity.actionType)}
                            </span>
                            {activity.status === 'completed' ? (
                              <CheckCircle2 size={12} className="text-green-500" />
                            ) : (
                              <XCircle size={12} className="text-red-500" />
                            )}
                          </div>
                          <p className="text-sm text-slate-800 dark:text-slate-200 leading-snug">{activity.summary}</p>
                          {activity.details?.message && (
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2 italic">
                              "{activity.details.message}"
                            </p>
                          )}
                          <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">{timeAgo(activity.createdAt)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Linda Settings Panel */}
      {isLindaConversation && lindaPanel === 'settings' && (
        <div className="absolute inset-0 top-[57px] z-20 bg-white dark:bg-surface-900 flex flex-col overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-gradient-to-r from-slate-50 to-violet-50 dark:from-slate-800 dark:to-violet-900/20 flex-shrink-0">
            <div className="w-8 h-8 bg-gradient-to-br from-violet-500 to-purple-500 rounded-full flex items-center justify-center">
              <SlidersHorizontal size={14} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Linda Settings</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Customize your AI secretary</p>
            </div>
            <button
              onClick={() => setLindaPanel('none')}
              className="p-2 hover:bg-white/50 dark:hover:bg-slate-700 rounded-lg transition"
            >
              <X size={16} className="text-slate-500" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-5">
            {/* Response Style */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">Response Style</label>
              <div className="flex gap-2">
                {(['Professional', 'Casual', 'Concise'] as const).map((style) => (
                  <button
                    key={style}
                    onClick={() => {
                      setLindaResponseStyle(style);
                      saveLindaSetting('responseStyle', style);
                    }}
                    className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium transition ${
                      lindaResponseStyle === style
                        ? 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 ring-1 ring-violet-300 dark:ring-violet-700'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    {style}
                  </button>
                ))}
              </div>
            </div>

            {/* Auto-Translate */}
            <div className="flex items-center justify-between">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Auto-Translate</label>
                <p className="text-[10px] text-slate-500 dark:text-slate-400">Translate responses to your language</p>
              </div>
              <button
                onClick={() => {
                  const newVal = !lindaAutoTranslate;
                  setLindaAutoTranslate(newVal);
                  saveLindaSetting('autoTranslate', String(newVal));
                }}
                className={`relative w-10 h-5 rounded-full transition-colors ${
                  lindaAutoTranslate ? 'bg-violet-500' : 'bg-slate-300 dark:bg-slate-600'
                }`}
              >
                <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                  lindaAutoTranslate ? 'translate-x-5' : 'translate-x-0'
                }`} />
              </button>
            </div>

            {/* Language Preference */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">Preferred Language</label>
              <select
                value={lindaLanguage}
                onChange={(e) => {
                  setLindaLanguage(e.target.value);
                  saveLindaSetting('languagePreference', e.target.value);
                }}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-violet-500"
              >
                {['English', 'Spanish', 'French', 'German', 'Chinese', 'Japanese', 'Korean', 'Arabic', 'Portuguese', 'Russian', 'Farsi'].map((lang) => (
                  <option key={lang} value={lang}>{lang}</option>
                ))}
              </select>
            </div>

            {/* Info */}
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3">
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                These settings customize how Linda communicates with you. Changes are saved automatically and take effect on your next message.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Messages Container */}
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-hide"
      >
        <div className="py-4 px-2 sm:px-4 max-w-full overflow-hidden">
          {conversationMessages.length === 0 ? (
            <div className="flex items-center justify-center h-full text-slate-500">
              <p>No messages yet. Start the conversation!</p>
            </div>
          ) : (
            messagesToRender
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Scroll to bottom button */}
      {showScrollButton && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-24 right-6 p-3 bg-blue-500 text-white rounded-full shadow-lg hover:bg-blue-600 transition animate-bounce"
        >
          <ArrowDown size={20} />
        </button>
      )}

      {/* Typing Indicator */}
      {typingIndicators.get(conversationId)?.length ? (
        <div className="px-4 py-2">
          <TypingIndicator users={typingIndicators.get(conversationId)!.map(t => t.username)} />
        </div>
      ) : null}

      {/* Message Composer */}
      <MessageComposer
        conversationId={conversationId}
        disabled={!conversationId}
      />

      {/* BUZZ Overlay */}
      {activeBuzz && (
        <BuzzOverlay
          senderName={activeBuzz.senderName}
          onComplete={() => {}}
        />
      )}

      {/* Story Viewer Modal */}
      {showStoryViewer && storyViewUserId && (
        <StoryViewerModal
          isOpen={showStoryViewer}
          userId={storyViewUserId}
          onClose={() => {
            setShowStoryViewer(false);
            setStoryViewUserId('');
            // Refresh contact stories to update viewed state
            api.getContactStatuses().then(r => setContactStories(r?.users || [])).catch(() => {});
          }}
        />
      )}
      </div>
    </div>
  );
}
