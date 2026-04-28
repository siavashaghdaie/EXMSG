import { useState, useRef, useEffect } from 'react';
import { Send, Bot, Sparkles, X, Paperclip, Mic, Image as ImageIcon, ChevronLeft, Users, Eye, SlidersHorizontal, MessageSquare, ClipboardList, Megaphone, RefreshCw, CheckCircle2, XCircle, ArrowUpDown } from 'lucide-react';
import { api, LindaConversationSummary, LindaMessageData, LindaActivity } from '@/services/api';
import VoiceRecorder from '@/components/chat/VoiceRecorder';

interface LindaAttachment {
  name: string;
  type: string;
  url?: string;
  size: number;
}

interface LindaMessage {
  id: string;
  content: string;
  sender: 'user' | 'linda';
  timestamp: Date;
  attachment?: LindaAttachment;
}

interface LindaChatProps {
  onClose: () => void;
}

type ViewMode = 'chat' | 'monitor' | 'all-conversations' | 'settings' | 'activities';

export default function LindaChat({ onClose }: LindaChatProps) {
  // View state — default is direct chat
  const [viewMode, setViewMode] = useState<ViewMode>('chat');

  // Monitor conversations state
  const [conversations] = useState<LindaConversationSummary[]>([]);
  const [allConversations, setAllConversations] = useState<LindaConversationSummary[]>([]);
  const [isManager, setIsManager] = useState(false);
  const [loadingConversations, setLoadingConversations] = useState(false);

  // Active chat state
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [viewingConversationOwner, setViewingConversationOwner] = useState('');
  const [isOwnConversation, setIsOwnConversation] = useState(true);
  const [messages, setMessages] = useState<LindaMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [greeting, setGreeting] = useState<{ greeting: string; suggestions: string[] } | null>(null);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [attachedPreview, setAttachedPreview] = useState<string | null>(null);

  // Activities state
  const [activities, setActivities] = useState<LindaActivity[]>([]);
  const [loadingActivities, setLoadingActivities] = useState(false);

  // Settings state
  const [responseStyle, setResponseStyle] = useState(() => {
    return (localStorage.getItem('linda_responseStyle') as 'Professional' | 'Casual' | 'Concise') || 'Professional';
  });
  const [languagePreference, setLanguagePreference] = useState(() => {
    return localStorage.getItem('linda_languagePreference') || 'English';
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Start direct chat on mount — load greeting immediately
  useEffect(() => {
    loadGreeting();
    checkManagerStatus();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    return () => {
      if (attachedPreview) URL.revokeObjectURL(attachedPreview);
    };
  }, [attachedPreview]);

  // Persist settings to localStorage
  useEffect(() => {
    localStorage.setItem('linda_responseStyle', responseStyle);
  }, [responseStyle]);

  useEffect(() => {
    localStorage.setItem('linda_languagePreference', languagePreference);
  }, [languagePreference]);

  const loadGreeting = async () => {
    try {
      const data = await api.getLindaGreeting();
      setGreeting(data);
      setMessages([{
        id: 'greeting',
        content: data.greeting,
        sender: 'linda',
        timestamp: new Date(),
      }]);
    } catch {
      setMessages([{
        id: 'greeting',
        content: "Hello! I'm Linda, your AI secretary. How can I help you today?",
        sender: 'linda',
        timestamp: new Date(),
      }]);
    }
  };

  const loadAllConversations = async () => {
    setLoadingConversations(true);
    try {
      const data = await api.getAllLindaConversations();
      setAllConversations(data.conversations);
    } catch (err) {
      console.error('Failed to load all Linda conversations:', err);
    } finally {
      setLoadingConversations(false);
    }
  };

  const loadActivities = async () => {
    setLoadingActivities(true);
    try {
      const data = await api.getLindaActivities();
      setActivities(data.activities || []);
    } catch (err) {
      console.error('Failed to load Linda activities:', err);
    } finally {
      setLoadingActivities(false);
    }
  };

  const checkManagerStatus = async () => {
    try {
      const data = await api.checkLindaManager();
      setIsManager(data.isManager);
    } catch {
      setIsManager(false);
    }
  };

  const openMonitorConversation = async (conv: LindaConversationSummary) => {
    setViewingConversationOwner(conv.ownerName);
    setIsOwnConversation(false);
    setViewMode('chat');

    try {
      const data = await api.getLindaConversationMessages(conv.id);
      setMessages(data.messages.map((m: LindaMessageData) => ({
        id: m.id,
        content: m.content,
        sender: m.role === 'user' ? 'user' : 'linda',
        timestamp: new Date(m.createdAt),
        attachment: m.hasAttachment && m.attachmentName
          ? { name: m.attachmentName, type: '', size: 0 }
          : undefined,
      })));
    } catch {
      setMessages([]);
    }
  };

  const goBackToDirectChat = () => {
    setIsOwnConversation(true);
    setViewingConversationOwner('');
    setViewMode('chat');
    // Reload own conversation
    if (activeConversationId) {
      // Reload messages for own conversation
      api.getLindaConversationMessages(activeConversationId).then(data => {
        setMessages(data.messages.map((m: LindaMessageData) => ({
          id: m.id,
          content: m.content,
          sender: m.role === 'user' ? 'user' : 'linda',
          timestamp: new Date(m.createdAt),
          attachment: m.hasAttachment && m.attachmentName
            ? { name: m.attachmentName, type: '', size: 0 }
            : undefined,
        })));
      }).catch(() => {
        loadGreeting();
      });
    } else {
      loadGreeting();
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      alert('File size must be under 20MB for Linda.');
      return;
    }
    setAttachedFile(file);
    if (file.type.startsWith('image/')) {
      setAttachedPreview(URL.createObjectURL(file));
    } else {
      setAttachedPreview(null);
    }
  };

  const clearAttachment = () => {
    if (attachedPreview) URL.revokeObjectURL(attachedPreview);
    setAttachedFile(null);
    setAttachedPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const sendMessage = async (content?: string) => {
    const text = content || input.trim();
    const file = attachedFile;

    if (!text && !file) return;
    if (!isOwnConversation) return;

    const userMsg: LindaMessage = {
      id: `user-${Date.now()}`,
      content: text || (file ? `Sent: ${file.name}` : ''),
      sender: 'user',
      timestamp: new Date(),
      attachment: file ? { name: file.name, type: file.type, url: attachedPreview || undefined, size: file.size } : undefined,
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    clearAttachment();
    setIsLoading(true);
    requestAnimationFrame(() => inputRef.current?.focus());

    try {
      let data: { response: string; timestamp: string; conversationId: string; actions?: Array<{ type: string; target: string; status: string }>; generatedFiles?: Array<{ fileName: string; fileSize: number; mimeType: string; url: string }> };
      if (file) {
        data = await api.chatWithLindaFile(file, text, activeConversationId || undefined);
      } else {
        data = await api.chatWithLinda(text, activeConversationId || undefined);
      }

      if (!activeConversationId && data.conversationId) {
        setActiveConversationId(data.conversationId);
      }

      // Safety strip any residual action blocks from display
      const cleanContent = data.response
        .replace(/\[SEND_MESSAGE\][\s\S]*?\[\/SEND_MESSAGE\]/gi, '')
        .replace(/\[ASSIGN_TASK\][\s\S]*?\[\/ASSIGN_TASK\]/gi, '')
        .replace(/\[UPDATE_TASK\][\s\S]*?\[\/UPDATE_TASK\]/gi, '')
        .replace(/\[CREATE_ANNOUNCEMENT\][\s\S]*?\[\/CREATE_ANNOUNCEMENT\]/gi, '')
        .replace(/\[ANNOUNCE\][\s\S]*?\[\/ANNOUNCE\]/gi, '')
        .trim();

      const lindaMsg: LindaMessage = {
        id: `linda-${Date.now()}`,
        content: cleanContent,
        sender: 'linda',
        timestamp: new Date(data.timestamp),
      };
      setMessages(prev => [...prev, lindaMsg]);

      // Add file download messages if Linda generated files
      if (data.generatedFiles && data.generatedFiles.length > 0) {
        const fileMessages: LindaMessage[] = data.generatedFiles.map((f, i) => ({
          id: `linda-file-${Date.now()}-${i}`,
          content: `📎 Generated file ready for download:`,
          sender: 'linda' as const,
          timestamp: new Date(data.timestamp),
          attachment: { name: f.fileName, type: f.mimeType || 'application/octet-stream', url: f.url, size: f.fileSize || 0 },
        }));
        setMessages(prev => [...prev, ...fileMessages]);
      }
    } catch (err) {
      console.error('Linda chat error:', err);
      setMessages(prev => [...prev, {
        id: `error-${Date.now()}`,
        content: "I'm sorry, I'm having trouble responding right now. Please try again in a moment.",
        sender: 'linda',
        timestamp: new Date(),
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleVoiceSend = async (blob: Blob, _duration?: number, transcript?: string) => {
    setIsRecordingVoice(false);
    const file = new File([blob], `voice-${Date.now()}.webm`, { type: 'audio/webm' });

    const displayContent = transcript ? `Voice message: "${transcript}"` : 'Voice message';
    const userMsg: LindaMessage = {
      id: `user-${Date.now()}`,
      content: displayContent,
      sender: 'user',
      timestamp: new Date(),
      attachment: { name: file.name, type: 'audio/webm', size: file.size },
    };
    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);

    try {
      // If we have a transcript, send it as context so Linda understands the voice note
      const voiceContext = transcript
        ? `The user sent a voice message. Here is the transcript of what they said: "${transcript}". Please respond to their message.`
        : 'The user sent a voice message. Please acknowledge it.';
      const data = await api.chatWithLindaFile(file, voiceContext, activeConversationId || undefined);
      if (!activeConversationId && data.conversationId) {
        setActiveConversationId(data.conversationId);
      }

      // Handle generated files from response
      const lindaMsg: LindaMessage = {
        id: `linda-${Date.now()}`,
        content: data.response,
        sender: 'linda',
        timestamp: new Date(data.timestamp),
      };
      setMessages(prev => [...prev, lindaMsg]);

      // Add file download messages if Linda generated files
      if (data.generatedFiles && data.generatedFiles.length > 0) {
        const fileMessages: LindaMessage[] = data.generatedFiles.map((f: any, i: number) => ({
          id: `linda-file-${Date.now()}-${i}`,
          content: `📎 Generated file ready for download:`,
          sender: 'linda' as const,
          timestamp: new Date(data.timestamp),
          attachment: { name: f.fileName, type: f.mimeType || 'application/octet-stream', url: f.url, size: f.fileSize || 0 },
        }));
        setMessages(prev => [...prev, ...fileMessages]);
      }
    } catch {
      setMessages(prev => [...prev, {
        id: `error-${Date.now()}`,
        content: "I couldn't process the voice message right now. Please try again.",
        sender: 'linda',
        timestamp: new Date(),
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const formatContent = (content: string) => {
    return content.split('\n').map((line, i) => {
      const formatted = line
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/~~(.*?)~~/g, '<del class="opacity-60">$1</del>')
        .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>')
        .replace(/`(.*?)`/g, '<code class="bg-slate-200 dark:bg-slate-600 px-1 rounded text-xs font-mono">$1</code>')
        // Render ─── lines as visual dividers
        .replace(/^[─]{3,}$/g, '<hr class="border-slate-300 dark:border-slate-600 my-1" />')
        // Render progress bars with monospace
        .replace(/([█░]{2,}\s*\d+%)/g, '<span class="font-mono text-xs tracking-tight">$1</span>');
      return (
        <span key={i}>
          {i > 0 && <br />}
          <span dangerouslySetInnerHTML={{ __html: formatted }} />
        </span>
      );
    });
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getFileEmoji = (type: string) => {
    if (type.startsWith('image/')) return '🖼';
    if (type.startsWith('video/')) return '🎬';
    if (type.startsWith('audio/')) return '🎤';
    if (type.includes('pdf')) return '📄';
    return '📎';
  };

  const formatTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'now';
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d`;
    return date.toLocaleDateString();
  };

  // ============ RENDER: Voice Recording ============
  if (isRecordingVoice) {
    return (
      <div className="flex flex-col h-full bg-white dark:bg-slate-900">
        <ChatHeader onClose={onClose} subtitle="Recording voice..." />
        <div className="flex-1" />
        <div className="p-4 border-t border-slate-200 dark:border-slate-700">
          <VoiceRecorder onSend={handleVoiceSend} onCancel={() => setIsRecordingVoice(false)} />
        </div>
      </div>
    );
  }

  // ============ RENDER: Settings View ============
  if (viewMode === 'settings') {
    return (
      <div className="flex flex-col h-full bg-white dark:bg-slate-900">
        {/* Header */}
        <div className="flex items-center gap-3 p-4 border-b border-slate-200 dark:border-slate-700 bg-gradient-to-r from-violet-50 to-blue-50 dark:from-violet-900/20 dark:to-blue-900/20">
          <div className="w-10 h-10 bg-gradient-to-br from-violet-500 to-blue-500 rounded-full flex items-center justify-center flex-shrink-0">
            <SlidersHorizontal size={20} className="text-white" />
          </div>
          <div className="flex-1">
            <h2 className="font-semibold text-slate-900 dark:text-white">Linda Settings</h2>
            <p className="text-xs text-slate-500">Customize your AI experience</p>
          </div>
          <button
            onClick={() => setViewMode('chat')}
            className="p-2 hover:bg-white/50 dark:hover:bg-slate-800 rounded-lg transition"
          >
            <X size={18} className="text-slate-500" />
          </button>
        </div>

        {/* Settings content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Response Style */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-900 dark:text-white">
              Response Style
            </label>
            <p className="text-xs text-slate-500 mb-3">How Linda communicates with you</p>
            <div className="space-y-2">
              {(['Professional', 'Casual', 'Concise'] as const).map((style) => (
                <button
                  key={style}
                  onClick={() => setResponseStyle(style)}
                  className={`w-full text-left px-4 py-3 rounded-lg border transition ${
                    responseStyle === style
                      ? 'bg-violet-50 dark:bg-violet-900/30 border-violet-300 dark:border-violet-600'
                      : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                        responseStyle === style
                          ? 'border-violet-500 bg-violet-500'
                          : 'border-slate-300 dark:border-slate-600'
                      }`}
                    >
                      {responseStyle === style && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-900 dark:text-white">{style}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {style === 'Professional' && 'Formal and business-like'}
                        {style === 'Casual' && 'Friendly and conversational'}
                        {style === 'Concise' && 'Brief and to the point'}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Language preference */}
          <div className="space-y-2 pt-4 border-t border-slate-200 dark:border-slate-700">
            <label className="block text-sm font-semibold text-slate-900 dark:text-white">
              Language Preference
            </label>
            <p className="text-xs text-slate-500 mb-3">Preferred language for responses</p>
            <input
              type="text"
              value={languagePreference}
              onChange={(e) => setLanguagePreference(e.target.value)}
              placeholder="e.g., English, Spanish, French, German..."
              className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
            <p className="text-[10px] text-slate-400 mt-1">
              Leave blank to use your system language
            </p>
          </div>

          {/* Settings summary */}
          <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg mt-6 border border-slate-200 dark:border-slate-700">
            <p className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-2">Current Settings</p>
            <div className="space-y-1 text-xs text-slate-500 dark:text-slate-400">
              <p>Style: <span className="font-medium text-slate-700 dark:text-slate-300">{responseStyle}</span></p>
              <p>Language: <span className="font-medium text-slate-700 dark:text-slate-300">{languagePreference || 'System default'}</span></p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ============ RENDER: Activities View ============
  if (viewMode === 'activities') {
    const getActivityIcon = (type: string) => {
      switch (type) {
        case 'send_message': return <MessageSquare size={18} className="text-blue-500" />;
        case 'assign_task': return <ClipboardList size={18} className="text-amber-500" />;
        case 'create_announcement': return <Megaphone size={18} className="text-purple-500" />;
        case 'update_task': return <ArrowUpDown size={18} className="text-green-500" />;
        default: return <Bot size={18} className="text-slate-400" />;
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
      <div className="flex flex-col h-full bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-700">
        {/* Header */}
        <div className="flex items-center gap-3 p-4 border-b border-slate-200 dark:border-slate-700 bg-gradient-to-r from-slate-50 to-blue-50 dark:from-slate-800 dark:to-blue-900/20 flex-shrink-0">
          <button
            onClick={() => setViewMode('chat')}
            className="p-1 hover:bg-white/50 dark:hover:bg-slate-700 rounded-lg transition"
          >
            <ChevronLeft size={20} className="text-slate-500" />
          </button>
          <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center">
            <Eye size={16} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Linda's Activities</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">What Linda did for you</p>
          </div>
          <button
            onClick={loadActivities}
            className="p-2 hover:bg-white/50 dark:hover:bg-slate-700 rounded-lg transition"
            title="Refresh"
          >
            <RefreshCw size={14} className={`text-slate-400 ${loadingActivities ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={onClose} className="p-2 hover:bg-white/50 dark:hover:bg-slate-800 rounded-lg transition">
            <X size={18} className="text-slate-500" />
          </button>
        </div>

        {/* Activities List */}
        <div className="flex-1 overflow-y-auto">
          {loadingActivities ? (
            <div className="flex items-center justify-center h-full">
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <RefreshCw size={16} className="animate-spin" />
                Loading activities...
              </div>
            </div>
          ) : activities.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-6">
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
              {activities.map((activity) => (
                <div
                  key={activity.id}
                  className="px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    {/* Linda avatar + action icon */}
                    <div className="relative flex-shrink-0">
                      <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center">
                        <Sparkles size={16} className="text-white" />
                      </div>
                      {/* Target user avatar overlay */}
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

                    {/* Content */}
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
                      <p className="text-sm text-slate-800 dark:text-slate-200 leading-snug">
                        {activity.summary}
                      </p>
                      {/* Details snippet */}
                      {activity.details?.message && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2 italic">
                          "{activity.details.message}"
                        </p>
                      )}
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
                        {timeAgo(activity.createdAt)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ============ RENDER: Monitor / All Conversations List ============
  if (viewMode === 'monitor' || viewMode === 'all-conversations') {
    const isAllView = viewMode === 'all-conversations';
    const displayConversations = isAllView ? allConversations : conversations;

    return (
      <div className="flex flex-col h-full bg-white dark:bg-slate-900">
        {/* Header */}
        <div className="flex items-center gap-3 p-4 border-b border-slate-200 dark:border-slate-700 bg-gradient-to-r from-violet-50 to-blue-50 dark:from-violet-900/20 dark:to-blue-900/20">
          <button
            onClick={goBackToDirectChat}
            className="p-1.5 hover:bg-white/50 dark:hover:bg-slate-800 rounded-lg transition"
          >
            <ChevronLeft size={20} className="text-slate-500" />
          </button>
          <div className="w-10 h-10 bg-gradient-to-br from-violet-500 to-blue-500 rounded-full flex items-center justify-center flex-shrink-0">
            <Eye size={20} className="text-white" />
          </div>
          <div className="flex-1">
            <h2 className="font-semibold text-slate-900 dark:text-white">
              {isAllView ? 'All Team Conversations' : 'Linda Activity'}
            </h2>
            <p className="text-xs text-slate-500">
              {isAllView ? 'Manager view — all users' : 'Conversations related to you'}
            </p>
          </div>
          {isManager && !isAllView && (
            <button
              onClick={() => {
                loadAllConversations();
                setViewMode('all-conversations');
              }}
              className="p-2 hover:bg-white/50 dark:hover:bg-slate-800 rounded-lg transition"
              title="View all team conversations"
            >
              <Users size={18} className="text-slate-500" />
            </button>
          )}
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto">
          {loadingConversations ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-6 w-6 border-2 border-violet-500 border-t-transparent" />
            </div>
          ) : displayConversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 px-6 text-center">
              <Eye size={36} className="text-slate-300 dark:text-slate-600 mb-3" />
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">
                {isAllView ? 'No team conversations yet' : 'No related conversations'}
              </p>
              <p className="text-xs text-slate-400 dark:text-slate-500">
                {isAllView
                  ? 'When team members chat with Linda, their conversations appear here'
                  : 'When Linda mentions you in other conversations, they appear here'
                }
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {displayConversations
                .filter(conv => !conv.isOwn) // Hide conversations between logged-in user and Linda
                .map(conv => (
                <button
                  key={conv.id}
                  onClick={() => openMonitorConversation(conv)}
                  className="w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 bg-gradient-to-br from-violet-500 to-blue-500 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-white text-xs font-bold">
                        {(conv.ownerName || '?')[0].toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                          {conv.ownerName}
                        </p>
                        <span className="text-[10px] text-slate-400 flex-shrink-0">
                          {formatTimeAgo(conv.updatedAt)}
                        </span>
                      </div>
                      {conv.relatedUsers && conv.relatedUsers.length > 0 && (
                        <p className="text-[10px] text-violet-500 dark:text-violet-400 mt-0.5">
                          Mentions: {conv.relatedUsers.map(u => u.name).join(', ')}
                        </p>
                      )}
                      {conv.lastMessage && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                          {conv.lastMessage.role === 'assistant' ? 'Linda: ' : `${conv.ownerName}: `}
                          {conv.lastMessage.content}
                        </p>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded-full flex-shrink-0">
                      {conv.messageCount}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ============ RENDER: Direct Chat View (default) ============
  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900">
      {/* Chat header */}
      <div className="flex items-center gap-3 p-4 border-b border-slate-200 dark:border-slate-700 bg-gradient-to-r from-violet-50 to-blue-50 dark:from-violet-900/20 dark:to-blue-900/20 flex-shrink-0">
        {!isOwnConversation && (
          <button
            onClick={goBackToDirectChat}
            className="p-1.5 hover:bg-white/50 dark:hover:bg-slate-800 rounded-lg transition"
          >
            <ChevronLeft size={20} className="text-slate-500" />
          </button>
        )}
        <div className="w-9 h-9 bg-gradient-to-br from-violet-500 to-blue-500 rounded-full flex items-center justify-center flex-shrink-0">
          <Bot size={18} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5 text-sm truncate">
            Linda
            <Sparkles size={12} className="text-violet-500 flex-shrink-0" />
          </h2>
          <p className="text-[10px] text-slate-500 truncate">
            {!isOwnConversation
              ? `Viewing ${viewingConversationOwner}'s conversation`
              : 'AI Secretary'
            }
          </p>
        </div>
        {/* Activities button — eye icon */}
        {isOwnConversation && (
          <button
            onClick={() => {
              loadActivities();
              setViewMode('activities');
            }}
            className={`p-2 hover:bg-white/50 dark:hover:bg-slate-800 rounded-lg transition ${(viewMode as ViewMode) === 'activities' ? 'bg-white/30 dark:bg-slate-700' : ''}`}
            title="Linda's Activities"
          >
            <Eye size={16} className={(viewMode as ViewMode) === 'activities' ? 'text-blue-500' : 'text-slate-400'} />
          </button>
        )}
        {/* Settings button — tuning/faders icon */}
        {isOwnConversation && (
          <button
            onClick={() => setViewMode('settings')}
            className={`p-2 hover:bg-white/50 dark:hover:bg-slate-800 rounded-lg transition ${(viewMode as ViewMode) === 'settings' ? 'bg-white/30 dark:bg-slate-700' : ''}`}
            title="Linda settings"
          >
            <SlidersHorizontal size={16} className={(viewMode as ViewMode) === 'settings' ? 'text-blue-500' : 'text-slate-400'} />
          </button>
        )}
        <button
          onClick={onClose}
          className="p-2 hover:bg-white/50 dark:hover:bg-slate-800 rounded-lg transition"
        >
          <X size={18} className="text-slate-500" />
        </button>
      </div>

      {/* Read-only notice for monitored conversations */}
      {!isOwnConversation && (
        <div className="px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-100 dark:border-amber-900/30 flex-shrink-0">
          <p className="text-xs text-amber-700 dark:text-amber-400">
            Viewing {viewingConversationOwner}'s conversation with Linda (read-only)
          </p>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
                msg.sender === 'user'
                  ? 'bg-blue-500 text-white rounded-br-md'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-bl-md'
              }`}
            >
              {msg.sender === 'linda' && (
                <div className="flex items-center gap-1.5 mb-1">
                  <Bot size={12} className="text-violet-500" />
                  <span className="text-[10px] font-medium text-violet-500">Linda</span>
                </div>
              )}

              {msg.attachment && (
                <div className="mb-2">
                  {msg.attachment.url && msg.attachment.type.startsWith('image/') ? (
                    <img src={msg.attachment.url} alt={msg.attachment.name} className="max-w-full max-h-48 rounded-lg object-cover" />
                  ) : msg.attachment.url && msg.sender === 'linda' ? (
                    <a
                      href={msg.attachment.url}
                      download={msg.attachment.name}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 p-2.5 rounded-lg text-xs bg-violet-100 dark:bg-violet-900/40 border border-violet-200 dark:border-violet-700 hover:bg-violet-200 dark:hover:bg-violet-900/60 transition cursor-pointer"
                    >
                      <span className="text-base">{getFileEmoji(msg.attachment.type)}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-violet-700 dark:text-violet-300 truncate">{msg.attachment.name}</p>
                        {msg.attachment.size > 0 && <p className="text-violet-500 dark:text-violet-400 opacity-70">{formatFileSize(msg.attachment.size)}</p>}
                      </div>
                      <span className="text-violet-500 dark:text-violet-400 font-medium">Download</span>
                    </a>
                  ) : (
                    <div className={`flex items-center gap-2 p-2 rounded-lg text-xs ${
                      msg.sender === 'user' ? 'bg-blue-600/50' : 'bg-slate-200 dark:bg-slate-700'
                    }`}>
                      <span>{getFileEmoji(msg.attachment.type)}</span>
                      <span className="truncate flex-1">{msg.attachment.name}</span>
                      {msg.attachment.size > 0 && <span className="opacity-70">{formatFileSize(msg.attachment.size)}</span>}
                    </div>
                  )}
                </div>
              )}

              <div className="text-sm leading-relaxed whitespace-pre-wrap">
                {formatContent(msg.content)}
              </div>
              <p className={`text-[10px] mt-1 ${msg.sender === 'user' ? 'text-blue-200' : 'text-slate-400'}`}>
                {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-slate-100 dark:bg-slate-800 rounded-2xl rounded-bl-md px-4 py-3">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggestions */}
      {greeting?.suggestions && messages.length <= 1 && isOwnConversation && (
        <div className="px-4 pb-2 flex flex-wrap gap-2 flex-shrink-0">
          {greeting.suggestions.map((suggestion, i) => (
            <button
              key={i}
              onClick={() => sendMessage(suggestion)}
              className="px-3 py-1.5 text-xs bg-violet-50 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400 rounded-full hover:bg-violet-100 dark:hover:bg-violet-900/50 transition"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}

      {/* File preview */}
      {attachedFile && isOwnConversation && (
        <div className="mx-3 mb-1 flex items-center gap-2 bg-slate-50 dark:bg-slate-800 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 flex-shrink-0">
          {attachedPreview ? (
            <img src={attachedPreview} alt="" className="w-10 h-10 rounded object-cover" />
          ) : (
            <span className="text-xl">{getFileEmoji(attachedFile.type)}</span>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate">{attachedFile.name}</p>
            <p className="text-[10px] text-slate-500">{formatFileSize(attachedFile.size)}</p>
          </div>
          <button onClick={clearAttachment} className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded">
            <X size={14} className="text-slate-500" />
          </button>
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        onChange={handleFileSelect}
        className="hidden"
        accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
      />

      {/* Input area */}
      {isOwnConversation ? (
        <div className="p-3 border-t border-slate-200 dark:border-slate-700 flex-shrink-0">
          <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 rounded-xl px-3 py-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg transition disabled:opacity-40"
              title="Attach file"
            >
              <Paperclip size={16} />
            </button>
            <button
              onClick={() => {
                if (fileInputRef.current) {
                  fileInputRef.current.accept = 'image/*';
                  fileInputRef.current.click();
                  setTimeout(() => {
                    if (fileInputRef.current) fileInputRef.current.accept = 'image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt';
                  }, 100);
                }
              }}
              disabled={isLoading}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg transition disabled:opacity-40"
              title="Send photo"
            >
              <ImageIcon size={16} />
            </button>
            <button
              onClick={() => setIsRecordingVoice(true)}
              disabled={isLoading}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg transition disabled:opacity-40"
              title="Voice message"
            >
              <Mic size={16} />
            </button>
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask Linda anything..."
              className="flex-1 bg-transparent text-sm outline-none text-slate-900 dark:text-white placeholder-slate-400"
              disabled={isLoading}
              autoFocus
            />
            <button
              onClick={() => sendMessage()}
              disabled={(!input.trim() && !attachedFile) || isLoading}
              className="p-1.5 bg-violet-500 text-white rounded-lg hover:bg-violet-600 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              <Send size={14} />
            </button>
          </div>
        </div>
      ) : (
        <div className="p-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex-shrink-0">
          <p className="text-xs text-center text-slate-400">
            Read-only view of {viewingConversationOwner}'s conversation
          </p>
        </div>
      )}
    </div>
  );
}

// ============ Shared Header for recording view ============
function ChatHeader({ onClose, subtitle }: { onClose: () => void; subtitle: string }) {
  return (
    <div className="flex items-center gap-3 p-4 border-b border-slate-200 dark:border-slate-700 bg-gradient-to-r from-violet-50 to-blue-50 dark:from-violet-900/20 dark:to-blue-900/20">
      <div className="w-10 h-10 bg-gradient-to-br from-violet-500 to-blue-500 rounded-full flex items-center justify-center flex-shrink-0">
        <Bot size={20} className="text-white" />
      </div>
      <div className="flex-1">
        <h2 className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
          Linda <Sparkles size={14} className="text-violet-500" />
        </h2>
        <p className="text-xs text-slate-500">{subtitle}</p>
      </div>
      <button onClick={onClose} className="p-2 hover:bg-white/50 dark:hover:bg-slate-800 rounded-lg transition">
        <X size={18} className="text-slate-500" />
      </button>
    </div>
  );
}
