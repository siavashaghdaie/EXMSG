import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { format, isToday, isYesterday } from 'date-fns';
import { ArrowDown, ChevronLeft, Phone, Video, Eye, SlidersHorizontal, MessageSquare, ClipboardList, Megaphone, ArrowUpDown, RefreshCw, CheckCircle2, XCircle, Sparkles, Bot, X, Settings2, Globe, Pin, Timer, TrendingUp, Zap, Calendar, Camera } from 'lucide-react';
import { useChatStore, setTranslationSettings } from '@/store/chatStore';
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
import ChatSettingsPanel from './ChatSettingsPanel';
import AgentPanel from './AgentPanel';

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
    fetchPinnedMessages,
    pinnedMessages,
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
  const [lindaLanguage, setLindaLanguage] = useState(() =>
    localStorage.getItem('linda_languagePreference') || 'English'
  );

  // Chat settings panel
  const [showChatSettings, setShowChatSettings] = useState(false);
  const [showAgentPanel, setShowAgentPanel] = useState(false);

  // Translation active indicator
  const [translationActive, setTranslationActive] = useState(false);
  const [translateLangName, setTranslateLangName] = useState('');

  // Chat wallpaper
  const [chatWallpaper, setChatWallpaper] = useState<string | null>(null);

  // Pinned messages banner
  const [pinnedIndex, setPinnedIndex] = useState(0);

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

  // iOS Safari fix: use position:fixed + visualViewport to prevent the browser
  // from scrolling the page when the keyboard opens (which pushes the header off-screen).
  // We track the visual viewport height and offset, then apply them as inline styles
  // on the outer container so it always matches exactly the visible screen area.
  const [viewportStyle, setViewportStyle] = useState<React.CSSProperties>({});

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    // Only apply the fixed-position hack on mobile
    const isMobileDevice = window.innerWidth < 768;
    if (!isMobileDevice) return;

    const onViewportResize = () => {
      setViewportStyle({
        position: 'fixed',
        top: vv.offsetTop,
        left: 0,
        right: 0,
        height: vv.height,
        // Prevent any overflow that iOS could scroll
        overflow: 'hidden',
      });

      requestAnimationFrame(() => {
        scrollToBottom();
      });
    };

    // Set initial fixed style
    setViewportStyle({
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      height: vv.height,
      overflow: 'hidden',
    });

    vv.addEventListener('resize', onViewportResize);
    vv.addEventListener('scroll', onViewportResize);
    return () => {
      vv.removeEventListener('resize', onViewportResize);
      vv.removeEventListener('scroll', onViewportResize);
    };
  }, [scrollToBottom]);

  // Set active conversation and fetch messages when conversation changes
  useEffect(() => {
    if (conversationId) {
      fetchMessages(conversationId);
      fetchPinnedMessages(conversationId);
      // Preload translation settings for real-time message translation
      api.getChatSettings(conversationId).then((settings: any) => {
        if (settings) {
          setTranslationSettings(
            conversationId,
            settings.autoTranslate,
            settings.translateLang,
            settings.translateMyFrom,
            settings.translateMyTo,
          );
          setTranslationActive(settings.autoTranslate === true && !!settings.translateLang);
          setTranslateLangName(settings.translateLang || '');
          setChatWallpaper(settings.chatWallpaper || null);
        }
      }).catch(() => {/* ignore — settings not available yet */});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  // Keep active conversation in sync with conversations list
  useEffect(() => {
    if (conversationId) {
      const conv = conversations.find(c => c.id === conversationId);
      if (conv) {
        setActiveConversation(conv);
      }
    }
  }, [conversationId, conversations, setActiveConversation]);

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

  // Detect agent participants (email ending with @omnilink.system)
  const agentParticipants = (conversation?.participants || []).filter(
    (p) => p.id !== user?.id && (p.email?.endsWith('@omnilink.system') || false)
  );
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
          <div className="flex justify-center my-3">
            <span className="px-3 py-1 bg-white/80 dark:bg-surface-800/80 backdrop-blur-sm text-[11px] text-slate-600 dark:text-slate-400 font-medium rounded-lg shadow-sm">
              {currentDate}
            </span>
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
                  <span
                    className="text-xs font-semibold px-3 pt-1"
                    style={{ color: `hsl(${Math.abs(firstMessage.senderId.split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % 360}, 60%, 45%)` }}
                  >
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
    <div className={`flex ${!viewportStyle.position ? 'h-[100dvh]' : ''} md:h-full bg-white dark:bg-surface-900 overflow-hidden w-full max-w-full ${activeBuzz ? 'animate-buzz-shake' : ''}`} style={{ overscrollBehavior: 'none', ...viewportStyle }}>
      <div className="flex flex-col h-full flex-1 min-w-0 overflow-hidden relative">
      {/* Header — flex-shrink-0 keeps it pinned when keyboard opens */}
      <div className="border-b border-slate-200 dark:border-surface-700 bg-white dark:bg-surface-900 flex-shrink-0 z-10">
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
                    <h2 className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                      {displayName}
                      {conversation.disappearingSeconds && (
                        <span className="text-emerald-500" title={`Disappearing messages: ${conversation.disappearingSeconds >= 86400 ? Math.floor(conversation.disappearingSeconds / 86400) + 'd' : conversation.disappearingSeconds >= 3600 ? Math.floor(conversation.disappearingSeconds / 3600) + 'h' : Math.floor(conversation.disappearingSeconds / 60) + 'm'}`}>
                          <Timer size={14} />
                        </span>
                      )}
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
            {/* Agent robot button — always shown */}
            <button
              onClick={() => setShowAgentPanel(!showAgentPanel)}
              className={`p-1.5 sm:p-2 rounded-lg transition relative ${showAgentPanel ? 'bg-violet-100 dark:bg-violet-900/30' : 'hover:bg-slate-100 dark:hover:bg-slate-700'}`}
              title="AI Agents"
            >
              <Bot size={18} className={showAgentPanel ? 'text-violet-500' : 'text-slate-600 dark:text-slate-400'} />
              {agentParticipants.length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-violet-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                  {agentParticipants.length}
                </span>
              )}
            </button>
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
            {/* TransGuy translation indicator */}
            {translationActive && (
              <div
                className="flex items-center gap-1 px-2 py-1 bg-emerald-50 dark:bg-emerald-900/30 rounded-lg border border-emerald-200 dark:border-emerald-700/50"
                title={`TransGuy is translating to ${translateLangName.toUpperCase()}`}
              >
                <Globe size={14} className="text-emerald-500" />
                <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase hidden sm:inline">
                  {translateLangName}
                </span>
              </div>
            )}
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
              className="p-1.5 sm:p-2 hover:bg-slate-100 dark:hover:bg-surface-700 rounded-lg transition"
              title="Video call"
            >
              <Video size={18} className="text-slate-600 dark:text-slate-300" />
            </button>
            <button
              onClick={() => setShowChatSettings(!showChatSettings)}
              className={`p-1.5 sm:p-2 rounded-lg transition ${showChatSettings ? 'bg-blue-100 dark:bg-blue-900/30' : 'hover:bg-slate-100 dark:hover:bg-surface-700'}`}
              title="Chat settings"
            >
              <Settings2 size={18} className={showChatSettings ? 'text-blue-500' : 'text-slate-600 dark:text-slate-300'} />
            </button>
          </div>
        </div>
      </div>

      {/* Agent Panel */}
      {showAgentPanel && conversationId && (
        <AgentPanel
          agentParticipants={agentParticipants}
          conversationId={conversationId}
          onClose={() => setShowAgentPanel(false)}
          onViewActivities={(username) => {
            setShowAgentPanel(false);
            if (username === 'linda') {
              loadLindaActivities();
              setLindaPanel('activities');
            }
          }}
          onOpenSettings={(username) => {
            setShowAgentPanel(false);
            if (username === 'linda') {
              setLindaPanel('settings');
            }
          }}
        />
      )}

      {/* Linda Activities Panel */}
      {isLindaConversation && lindaPanel === 'activities' && (() => {
        const getActivityIcon = (type: string) => {
          switch (type) {
            case 'send_message': return <MessageSquare size={16} className="text-blue-500" />;
            case 'assign_task': return <ClipboardList size={16} className="text-amber-500" />;
            case 'create_announcement': return <Megaphone size={16} className="text-purple-500" />;
            case 'update_task': return <ArrowUpDown size={16} className="text-green-500" />;
            case 'post_story': return <Camera size={16} className="text-pink-500" />;
            default: return <Bot size={16} className="text-slate-400" />;
          }
        };
        const getActivityLabel = (type: string) => {
          switch (type) {
            case 'send_message': return 'Message Delivered';
            case 'assign_task': return 'Task Assigned';
            case 'create_announcement': return 'Announcement Created';
            case 'update_task': return 'Task Updated';
            case 'post_story': return 'Story Posted';
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
        // Compute stats
        const totalActions = lindaActivities.length;
        const completedActions = lindaActivities.filter(a => a.status === 'completed').length;
        const successRate = totalActions > 0 ? Math.round((completedActions / totalActions) * 100) : 0;
        const msgCount = lindaActivities.filter(a => a.actionType === 'send_message').length;
        const taskCount = lindaActivities.filter(a => a.actionType === 'assign_task' || a.actionType === 'update_task').length;
        const announceCount = lindaActivities.filter(a => a.actionType === 'create_announcement').length;
        // Unique active days
        const activeDays = new Set(lindaActivities.map(a => new Date(a.createdAt).toDateString())).size;

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
                <>
                  {/* ─── Stats Dashboard ─── */}
                  <div className="px-4 pt-4 pb-2 space-y-3 border-b border-slate-100 dark:border-slate-800">
                    {/* Success gauge */}
                    <div className="flex items-center gap-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-xl p-3">
                      <div className="relative w-14 h-14 flex-shrink-0">
                        <svg viewBox="0 0 36 36" className="w-14 h-14 -rotate-90">
                          <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" strokeWidth="3" className="text-slate-200 dark:text-slate-700" />
                          <circle cx="18" cy="18" r="15.5" fill="none" stroke="url(#gaugeGrad)" strokeWidth="3" strokeLinecap="round"
                            strokeDasharray={`${successRate * 0.975} 100`}
                          />
                          <defs>
                            <linearGradient id="gaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                              <stop offset="0%" stopColor="#3b82f6" />
                              <stop offset="100%" stopColor="#8b5cf6" />
                            </linearGradient>
                          </defs>
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-xs font-bold text-slate-800 dark:text-white">{successRate}%</span>
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 dark:text-white">Success Rate</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {completedActions} of {totalActions} actions completed
                        </p>
                      </div>
                      <TrendingUp size={18} className="text-green-500 flex-shrink-0" />
                    </div>

                    {/* Stat cards grid */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3 flex flex-col items-center text-center">
                        <div className="w-8 h-8 bg-blue-100 dark:bg-blue-800/40 rounded-full flex items-center justify-center mb-1.5">
                          <MessageSquare size={14} className="text-blue-600 dark:text-blue-400" />
                        </div>
                        <span className="text-lg font-bold text-blue-700 dark:text-blue-300">{msgCount}</span>
                        <span className="text-[10px] text-blue-500 dark:text-blue-400 font-medium">Messages Sent</span>
                      </div>
                      <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-3 flex flex-col items-center text-center">
                        <div className="w-8 h-8 bg-amber-100 dark:bg-amber-800/40 rounded-full flex items-center justify-center mb-1.5">
                          <ClipboardList size={14} className="text-amber-600 dark:text-amber-400" />
                        </div>
                        <span className="text-lg font-bold text-amber-700 dark:text-amber-300">{taskCount}</span>
                        <span className="text-[10px] text-amber-500 dark:text-amber-400 font-medium">Tasks Managed</span>
                      </div>
                      <div className="bg-purple-50 dark:bg-purple-900/20 rounded-xl p-3 flex flex-col items-center text-center">
                        <div className="w-8 h-8 bg-purple-100 dark:bg-purple-800/40 rounded-full flex items-center justify-center mb-1.5">
                          <Megaphone size={14} className="text-purple-600 dark:text-purple-400" />
                        </div>
                        <span className="text-lg font-bold text-purple-700 dark:text-purple-300">{announceCount}</span>
                        <span className="text-[10px] text-purple-500 dark:text-purple-400 font-medium">Announcements</span>
                      </div>
                      <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-3 flex flex-col items-center text-center">
                        <div className="w-8 h-8 bg-emerald-100 dark:bg-emerald-800/40 rounded-full flex items-center justify-center mb-1.5">
                          <Calendar size={14} className="text-emerald-600 dark:text-emerald-400" />
                        </div>
                        <span className="text-lg font-bold text-emerald-700 dark:text-emerald-300">{activeDays}</span>
                        <span className="text-[10px] text-emerald-500 dark:text-emerald-400 font-medium">Active Days</span>
                      </div>
                    </div>

                    {/* Streak / badge row */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {totalActions >= 10 && (
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-gradient-to-r from-amber-100 to-yellow-100 dark:from-amber-900/30 dark:to-yellow-900/30 rounded-full text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                          <Zap size={10} /> Power User
                        </span>
                      )}
                      {successRate === 100 && totalActions > 0 && (
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-gradient-to-r from-green-100 to-emerald-100 dark:from-green-900/30 dark:to-emerald-900/30 rounded-full text-[10px] font-semibold text-green-700 dark:text-green-300">
                          <CheckCircle2 size={10} /> Perfect Score
                        </span>
                      )}
                      {activeDays >= 7 && (
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-gradient-to-r from-blue-100 to-cyan-100 dark:from-blue-900/30 dark:to-cyan-900/30 rounded-full text-[10px] font-semibold text-blue-700 dark:text-blue-300">
                          <Calendar size={10} /> Week Streak
                        </span>
                      )}
                      {taskCount >= 5 && (
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-gradient-to-r from-violet-100 to-purple-100 dark:from-violet-900/30 dark:to-purple-900/30 rounded-full text-[10px] font-semibold text-violet-700 dark:text-violet-300">
                          <ClipboardList size={10} /> Task Master
                        </span>
                      )}
                    </div>
                  </div>

                  {/* ─── Activity Timeline ─── */}
                  <div className="px-4 pt-3 pb-1">
                    <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Recent Activity</p>
                  </div>
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
                </>
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

      {/* Pinned Messages Banner (WhatsApp-style) */}
      {(() => {
        const pins = conversationId ? pinnedMessages.get(conversationId) : undefined;
        if (!pins || pins.length === 0) return null;
        const currentPin = pins[pinnedIndex % pins.length];
        const pinSender = currentPin?.sender?.displayName || currentPin?.sender?.username || 'Unknown';
        return (
          <div className="flex-shrink-0 border-b border-slate-200 dark:border-surface-700 bg-white dark:bg-surface-900 z-10">
            <button
              className="w-full flex items-center gap-2.5 px-4 py-2 hover:bg-slate-50 dark:hover:bg-surface-800 transition text-left"
              onClick={() => {
                // Scroll to the pinned message
                const el = document.getElementById(`msg-${currentPin.id}`);
                if (el) {
                  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  el.classList.add('animate-pulse');
                  setTimeout(() => el.classList.remove('animate-pulse'), 2000);
                }
                // If multiple pins, cycle through them
                if (pins.length > 1) {
                  setPinnedIndex((prev) => (prev + 1) % pins.length);
                }
              }}
            >
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <Pin size={14} className="text-green-600 dark:text-green-400" style={{ transform: 'rotate(45deg)' }} />
                {pins.length > 1 && (
                  <div className="flex flex-col items-center">
                    {pins.map((_, i) => (
                      <div
                        key={i}
                        className={`w-[3px] rounded-full ${
                          i === pinnedIndex % pins.length
                            ? 'h-2.5 bg-green-500'
                            : 'h-1.5 bg-slate-300 dark:bg-slate-600'
                        }`}
                        style={{ marginTop: i > 0 ? 1 : 0 }}
                      />
                    ))}
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0 border-l-2 border-green-500 pl-2.5">
                <p className="text-[11px] font-semibold text-green-700 dark:text-green-400 leading-none mb-0.5">{pinSender}</p>
                <p className="text-xs text-slate-600 dark:text-slate-400 truncate leading-tight">
                  {currentPin.content || (currentPin.attachments?.length ? 'Media' : 'Pinned message')}
                </p>
              </div>
              {pins.length > 1 && (
                <span className="text-[10px] text-slate-400 flex-shrink-0">{(pinnedIndex % pins.length) + 1}/{pins.length}</span>
              )}
            </button>
          </div>
        );
      })()}

      {/* Messages Container */}
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-hide"
        style={chatWallpaper
          ? { backgroundColor: chatWallpaper }
          : { backgroundColor: document.documentElement.classList.contains('dark') ? '#0b141a' : '#efeae2', backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23d5d0c8\' fill-opacity=\'0.08\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")' }
        }
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

      {/* Scroll to bottom button — WhatsApp-style */}
      {showScrollButton && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-24 right-4 w-10 h-10 bg-white dark:bg-surface-800 text-slate-600 dark:text-slate-300 rounded-full shadow-lg hover:shadow-xl transition flex items-center justify-center border border-slate-200 dark:border-surface-600"
        >
          <ArrowDown size={18} />
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

      {/* Chat Settings Panel */}
      {showChatSettings && conversationId && (
        <ChatSettingsPanel
          conversationId={conversationId}
          onClose={() => setShowChatSettings(false)}
          onWallpaperChange={(color) => setChatWallpaper(color)}
          onNavigateToChat={(id) => {
            setShowChatSettings(false);
            navigate(`/chat/${id}`);
          }}
          onNavigateToAgents={(agentSlug) => {
            setShowChatSettings(false);
            // Dispatch custom event that ChatLayout listens for
            window.dispatchEvent(new CustomEvent('navigate-to-agent', { detail: { agentSlug } }));
          }}
        />
      )}
    </div>
  );
}
