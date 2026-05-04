import React, { useEffect, useState } from 'react';
import {
  X, Bell, BellOff, Clock, Lock, Star, Image, FileText,
  Download, Shield, UserPlus, Heart, Languages,
  ChevronRight, Volume2, Palette, Save, Ban, Flag, MessageSquareOff,
  Check, Globe, Sparkles
} from 'lucide-react';
import { api } from '@/services/api';
import Avatar from '@/components/common/Avatar';
import PresenceIndicator from '@/components/common/PresenceIndicator';
import { useChatStore, setTranslationSettings } from '@/store/chatStore';

interface ChatSettingsPanelProps {
  conversationId: string;
  onClose: () => void;
  onNavigateToChat?: (conversationId: string) => void;
  onNavigateToAgents?: (agentSlug?: string) => void;
}

type MediaTab = 'media' | 'docs' | 'links';

// Preset wallpaper colors
const WALLPAPER_PRESETS = [
  { name: 'Default', value: null, color: '#ffffff' },
  { name: 'Soft Blue', value: '#e3f2fd', color: '#e3f2fd' },
  { name: 'Mint', value: '#e8f5e9', color: '#e8f5e9' },
  { name: 'Lavender', value: '#ede7f6', color: '#ede7f6' },
  { name: 'Peach', value: '#fce4ec', color: '#fce4ec' },
  { name: 'Sand', value: '#fff8e1', color: '#fff8e1' },
  { name: 'Sky', value: '#e0f7fa', color: '#e0f7fa' },
  { name: 'Rose', value: '#fbe9e7', color: '#fbe9e7' },
  { name: 'Slate', value: '#eceff1', color: '#eceff1' },
  { name: 'Cream', value: '#fffde7', color: '#fffde7' },
  { name: 'Cool Gray', value: '#f5f5f5', color: '#f5f5f5' },
  { name: 'Ocean', value: '#b3e5fc', color: '#b3e5fc' },
  { name: 'Forest', value: '#c8e6c9', color: '#c8e6c9' },
  { name: 'Sunset', value: '#ffccbc', color: '#ffccbc' },
  { name: 'Night', value: '#263238', color: '#263238' },
  { name: 'Dark Blue', value: '#1a237e', color: '#1a237e' },
  { name: 'Dark Teal', value: '#004d40', color: '#004d40' },
  { name: 'Dark Purple', value: '#311b92', color: '#311b92' },
];

// Notification sound options
const NOTIFICATION_SOUNDS = [
  { label: 'Default', value: null },
  { label: 'Chime', value: 'chime' },
  { label: 'Bell', value: 'bell' },
  { label: 'Pop', value: 'pop' },
  { label: 'Ding', value: 'ding' },
  { label: 'Swoosh', value: 'swoosh' },
  { label: 'None', value: 'none' },
];

const LANGUAGES = [
  'English', 'Spanish', 'French', 'German', 'Italian', 'Portuguese', 'Russian',
  'Chinese', 'Japanese', 'Korean', 'Arabic', 'Hindi', 'Turkish', 'Dutch',
  'Swedish', 'Polish', 'Thai', 'Vietnamese', 'Indonesian', 'Malay', 'Filipino',
  'Hebrew', 'Czech', 'Romanian', 'Hungarian', 'Greek', 'Danish', 'Finnish',
  'Norwegian', 'Ukrainian', 'Persian', 'Bengali', 'Urdu', 'Swahili',
];

export default function ChatSettingsPanel({ conversationId, onClose, onNavigateToChat, onNavigateToAgents }: ChatSettingsPanelProps) {
  const [loading, setLoading] = useState(true);
  const [chatInfo, setChatInfo] = useState<any>(null);
  const [activeMediaTab, setActiveMediaTab] = useState<MediaTab>('media');
  const [mediaMessages, setMediaMessages] = useState<any[]>([]);
  const [starredMessages, setStarredMessages] = useState<any[]>([]);
  const [showStarred, setShowStarred] = useState(false);
  const [showMedia, setShowMedia] = useState(false);
  const [showDisappearing, setShowDisappearing] = useState(false);
  const [showBlockConfirm, setShowBlockConfirm] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showWallpaperPicker, setShowWallpaperPicker] = useState(false);
  const [showNotificationSound, setShowNotificationSound] = useState(false);
  const [showSaveMedia, setShowSaveMedia] = useState(false);
  const [showTranslateSettings, setShowTranslateSettings] = useState(false);
  const [showTransGuyWizard, setShowTransGuyWizard] = useState(false);
  const [isTransGuyHired, setIsTransGuyHired] = useState(false);

  const [showLockChat, setShowLockChat] = useState(false);
  const [lockPin, setLockPin] = useState('');
  const [lockPinConfirm, setLockPinConfirm] = useState('');
  const [lockStep, setLockStep] = useState<'set' | 'confirm' | 'unlock'>('set');
  const [lockError, setLockError] = useState('');
  const [customColor, setCustomColor] = useState('#e3f2fd');
  const [reportReason, setReportReason] = useState('');
  const [reportDetails, setReportDetails] = useState('');
  const { fetchConversations } = useChatStore();

  useEffect(() => {
    loadChatInfo();
  }, [conversationId]);

  const loadChatInfo = async () => {
    try {
      setLoading(true);
      const [info, hiredAgents] = await Promise.all([
        api.getChatInfo(conversationId),
        api.getHiredAgents().catch(() => []),
      ]);
      setChatInfo(info);
      // Check if TransGuy is hired
      const transGuyHired = hiredAgents.some((ha: any) => ha.agent?.slug === 'transguy' && ha.isEnabled);
      setIsTransGuyHired(transGuyHired);
      // Cache translation settings for real-time message translation
      if (info?.settings) {
        setTranslationSettings(
          conversationId,
          info.settings.autoTranslate,
          info.settings.translateLang,
          info.settings.translateMyFrom,
          info.settings.translateMyTo,
        );
      }
    } catch (err) {
      console.error('Failed to load chat info:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadMedia = async (tab: MediaTab) => {
    try {
      const data = await api.getChatMedia(conversationId, tab);
      setMediaMessages(data.messages || []);
    } catch (err) {
      console.error('Failed to load media:', err);
    }
  };

  const loadStarred = async () => {
    try {
      const stars = await api.getStarredMessages(conversationId);
      setStarredMessages(stars);
    } catch (err) {
      console.error('Failed to load starred:', err);
    }
  };

  const updateSetting = async (key: string, value: any) => {
    try {
      await api.updateChatSettings(conversationId, { [key]: value });
      const newSettings = { ...chatInfo?.settings, [key]: value };
      setChatInfo((prev: any) => ({
        ...prev,
        settings: newSettings,
      }));
      // Refresh sidebar conversations when favorite/mute/pin changes
      if (key === 'isFavorite' || key === 'isMuted' || key === 'isPinned') {
        fetchConversations();
      }
      // Update translation cache when translation settings change
      if (['autoTranslate', 'translateLang', 'translateMyFrom', 'translateMyTo'].includes(key)) {
        setTranslationSettings(
          conversationId,
          newSettings.autoTranslate,
          newSettings.translateLang,
          newSettings.translateMyFrom,
          newSettings.translateMyTo,
        );
      }
    } catch (err) {
      console.error('Failed to update setting:', err);
    }
  };

  const handleDisappearing = async (seconds: number | null) => {
    try {
      await api.setDisappearingMessages(conversationId, seconds);
      setChatInfo((prev: any) => ({
        ...prev,
        conversation: { ...prev.conversation, disappearingSeconds: seconds },
      }));
      setShowDisappearing(false);
    } catch (err) {
      console.error('Failed to set disappearing:', err);
    }
  };

  const handleBlock = async () => {
    if (!chatInfo?.otherUser) return;
    try {
      if (chatInfo.isBlocked) {
        await api.unblockUser(chatInfo.otherUser.id);
        setChatInfo((prev: any) => ({ ...prev, isBlocked: false }));
      } else {
        await api.blockUser(chatInfo.otherUser.id);
        setChatInfo((prev: any) => ({ ...prev, isBlocked: true }));
      }
      setShowBlockConfirm(false);
    } catch (err) {
      console.error('Failed to block/unblock:', err);
    }
  };

  const handleClearChat = async () => {
    try {
      await api.clearChat(conversationId);
      setShowClearConfirm(false);
    } catch (err) {
      console.error('Failed to clear chat:', err);
    }
  };

  const handleExport = async () => {
    try {
      const blob = await api.exportChat(conversationId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `chat_export_${new Date().toISOString().slice(0, 10)}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export:', err);
    }
  };

  const handleReport = async () => {
    if (!chatInfo?.otherUser || !reportReason) return;
    try {
      await api.reportUser(chatInfo.otherUser.id, reportReason, reportDetails);
      setShowReportModal(false);
      setReportReason('');
      setReportDetails('');
    } catch (err) {
      console.error('Failed to report:', err);
    }
  };

  const handleLockToggle = () => {
    if (settings.isLocked) {
      // Unlock — ask for PIN
      setLockStep('unlock');
      setLockPin('');
      setLockError('');
      setShowLockChat(true);
    } else {
      // Lock — set a PIN
      setLockStep('set');
      setLockPin('');
      setLockPinConfirm('');
      setLockError('');
      setShowLockChat(true);
    }
  };

  const handleLockSubmit = () => {
    if (lockStep === 'set') {
      if (lockPin.length < 4) {
        setLockError('PIN must be at least 4 digits');
        return;
      }
      setLockStep('confirm');
      setLockPinConfirm('');
      setLockError('');
    } else if (lockStep === 'confirm') {
      if (lockPinConfirm !== lockPin) {
        setLockError('PINs do not match. Try again.');
        setLockPinConfirm('');
        return;
      }
      // Save the PIN locally and lock the chat
      localStorage.setItem(`chat_lock_${conversationId}`, lockPin);
      updateSetting('isLocked', true);
      setShowLockChat(false);
    } else if (lockStep === 'unlock') {
      const savedPin = localStorage.getItem(`chat_lock_${conversationId}`);
      if (savedPin && lockPin !== savedPin) {
        setLockError('Incorrect PIN');
        setLockPin('');
        return;
      }
      // Unlock
      localStorage.removeItem(`chat_lock_${conversationId}`);
      updateSetting('isLocked', false);
      setShowLockChat(false);
    }
  };

  if (loading) {
    return (
      <div className="absolute inset-0 z-30 md:relative md:inset-auto md:z-auto w-full md:w-80 md:border-l border-slate-200 dark:border-surface-700 bg-white dark:bg-surface-900 flex items-center justify-center">
        <div className="animate-spin w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!chatInfo) return null;

  const { conversation, settings, mediaCounts, starredCount, otherUser, isBlocked, commonGroups } = chatInfo;
  const isDM = conversation?.type === 'DIRECT';
  const chatName = isDM && otherUser ? (otherUser.displayName || otherUser.username) : conversation?.name;
  const chatAvatar = isDM && otherUser ? otherUser.avatarUrl : conversation?.avatarUrl;
  const chatSubtitle = isDM && otherUser ? (otherUser.bio || otherUser.status || otherUser.email) : `${conversation?.members?.length || 0} members`;

  // ============================================
  // Sub-panels
  // ============================================

  if (showStarred) {
    return (
      <div className="absolute inset-0 z-30 md:relative md:inset-auto md:z-auto w-full md:w-80 md:border-l border-slate-200 dark:border-surface-700 bg-white dark:bg-surface-900 flex flex-col h-full">
        <div className="flex items-center gap-2 p-4 border-b border-slate-200 dark:border-surface-700">
          <button onClick={() => setShowStarred(false)} className="p-1 hover:bg-slate-100 dark:hover:bg-surface-700 rounded">
            <ChevronRight size={18} className="rotate-180 text-slate-600 dark:text-slate-400" />
          </button>
          <h3 className="font-semibold text-slate-900 dark:text-white">Starred Messages</h3>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {starredMessages.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-8">No starred messages</p>
          ) : starredMessages.map((star: any) => (
            <div key={star.id} className="p-3 bg-slate-50 dark:bg-surface-800 rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300">{star.message?.sender?.displayName}</span>
                <span className="text-xs text-slate-400">{new Date(star.message?.createdAt).toLocaleDateString()}</span>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-3">{star.message?.content || `[${star.message?.type}]`}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (showMedia) {
    return (
      <div className="absolute inset-0 z-30 md:relative md:inset-auto md:z-auto w-full md:w-80 md:border-l border-slate-200 dark:border-surface-700 bg-white dark:bg-surface-900 flex flex-col h-full">
        <div className="flex items-center gap-2 p-4 border-b border-slate-200 dark:border-surface-700">
          <button onClick={() => setShowMedia(false)} className="p-1 hover:bg-slate-100 dark:hover:bg-surface-700 rounded">
            <ChevronRight size={18} className="rotate-180 text-slate-600 dark:text-slate-400" />
          </button>
          <h3 className="font-semibold text-slate-900 dark:text-white">Media, Links & Docs</h3>
        </div>
        <div className="flex border-b border-slate-200 dark:border-surface-700">
          {(['media', 'docs', 'links'] as MediaTab[]).map(tab => (
            <button
              key={tab}
              onClick={() => { setActiveMediaTab(tab); loadMedia(tab); }}
              className={`flex-1 py-2 text-xs font-medium capitalize transition ${
                activeMediaTab === tab
                  ? 'text-primary-600 border-b-2 border-primary-600'
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              {tab} ({mediaCounts?.[tab] || 0})
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {activeMediaTab === 'media' ? (
            <div className="grid grid-cols-3 gap-1">
              {mediaMessages.map((msg: any) => (
                <div key={msg.id} className="aspect-square bg-slate-100 dark:bg-surface-800 rounded overflow-hidden">
                  {msg.attachments?.[0] && (
                    <img src={msg.attachments[0].url} alt="" className="w-full h-full object-cover" />
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {mediaMessages.map((msg: any) => (
                <div key={msg.id} className="p-2 bg-slate-50 dark:bg-surface-800 rounded-lg">
                  <p className="text-xs text-slate-600 dark:text-slate-400 truncate">
                    {activeMediaTab === 'links' ? msg.content : msg.attachments?.[0]?.fileName}
                  </p>
                  <span className="text-xs text-slate-400">{new Date(msg.createdAt).toLocaleDateString()}</span>
                </div>
              ))}
            </div>
          )}
          {mediaMessages.length === 0 && (
            <p className="text-sm text-slate-500 text-center py-8">No {activeMediaTab} found</p>
          )}
        </div>
      </div>
    );
  }

  // ============================================
  // Wallpaper Picker Sub-panel
  // ============================================
  if (showWallpaperPicker) {
    return (
      <div className="absolute inset-0 z-30 md:relative md:inset-auto md:z-auto w-full md:w-80 md:border-l border-slate-200 dark:border-surface-700 bg-white dark:bg-surface-900 flex flex-col h-full">
        <div className="flex items-center gap-2 p-4 border-b border-slate-200 dark:border-surface-700">
          <button onClick={() => setShowWallpaperPicker(false)} className="p-1 hover:bg-slate-100 dark:hover:bg-surface-700 rounded">
            <ChevronRight size={18} className="rotate-180 text-slate-600 dark:text-slate-400" />
          </button>
          <h3 className="font-semibold text-slate-900 dark:text-white">Chat Wallpaper</h3>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {/* Preview */}
          <div
            className="w-full h-32 rounded-xl mb-4 border-2 border-slate-200 dark:border-surface-600 flex items-center justify-center overflow-hidden"
            style={{ backgroundColor: settings.chatWallpaper || '#ffffff' }}
          >
            <div className="bg-white/80 dark:bg-surface-800/80 backdrop-blur-sm rounded-lg px-3 py-2 shadow-sm">
              <p className="text-xs text-slate-600 dark:text-slate-300">Preview</p>
            </div>
          </div>

          {/* Preset Colors Grid */}
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-3">Preset Colors</p>
          <div className="grid grid-cols-6 gap-2 mb-5">
            {WALLPAPER_PRESETS.map((preset) => {
              const isActive = (preset.value === null && !settings.chatWallpaper) || settings.chatWallpaper === preset.value;
              return (
                <button
                  key={preset.name}
                  onClick={() => updateSetting('chatWallpaper', preset.value)}
                  className={`relative w-10 h-10 rounded-lg border-2 transition-all ${
                    isActive
                      ? 'border-primary-500 ring-2 ring-primary-200 dark:ring-primary-800 scale-110'
                      : 'border-slate-200 dark:border-surface-600 hover:border-slate-400 dark:hover:border-surface-500'
                  }`}
                  style={{ backgroundColor: preset.color }}
                  title={preset.name}
                >
                  {isActive && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Check size={14} className={preset.value && isLightColor(preset.value) ? 'text-slate-700' : 'text-white'} />
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Custom Color Picker */}
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-3">Custom Color</p>
          <div className="flex items-center gap-3 mb-4">
            <input
              type="color"
              value={customColor}
              onChange={(e) => setCustomColor(e.target.value)}
              className="w-10 h-10 rounded-lg cursor-pointer border border-slate-200 dark:border-surface-600"
              style={{ padding: 0 }}
            />
            <span className="text-sm text-slate-600 dark:text-slate-400 font-mono">{customColor}</span>
            <button
              onClick={() => updateSetting('chatWallpaper', customColor)}
              className="px-3 py-1.5 text-xs font-medium bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition"
            >
              Apply
            </button>
          </div>

          {/* Reset */}
          <button
            onClick={() => updateSetting('chatWallpaper', null)}
            className="w-full py-2.5 text-sm text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-surface-800 rounded-lg hover:bg-slate-100 dark:hover:bg-surface-700 transition"
          >
            Reset to Default
          </button>
        </div>
      </div>
    );
  }

  // ============================================
  // Notification Sound Picker Sub-panel
  // ============================================
  if (showNotificationSound) {
    return (
      <div className="absolute inset-0 z-30 md:relative md:inset-auto md:z-auto w-full md:w-80 md:border-l border-slate-200 dark:border-surface-700 bg-white dark:bg-surface-900 flex flex-col h-full">
        <div className="flex items-center gap-2 p-4 border-b border-slate-200 dark:border-surface-700">
          <button onClick={() => setShowNotificationSound(false)} className="p-1 hover:bg-slate-100 dark:hover:bg-surface-700 rounded">
            <ChevronRight size={18} className="rotate-180 text-slate-600 dark:text-slate-400" />
          </button>
          <h3 className="font-semibold text-slate-900 dark:text-white">Notification Sound</h3>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {NOTIFICATION_SOUNDS.map((sound) => {
            const isActive = (sound.value === null && !settings.customNotificationSound) || settings.customNotificationSound === sound.value;
            return (
              <button
                key={sound.label}
                onClick={() => updateSetting('customNotificationSound', sound.value)}
                className={`w-full text-left px-4 py-3 rounded-lg mb-1 text-sm transition flex items-center justify-between ${
                  isActive
                    ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 font-medium'
                    : 'hover:bg-slate-50 dark:hover:bg-surface-800 text-slate-700 dark:text-slate-300'
                }`}
              >
                <span>{sound.label}</span>
                {isActive && <Check size={16} className="text-primary-600 dark:text-primary-400" />}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ============================================
  // Save Media Picker Sub-panel
  // ============================================
  if (showSaveMedia) {
    const saveOptions = [
      { label: 'Default (Follow global setting)', value: 'default', desc: 'Use your account default' },
      { label: 'Always Save', value: 'always', desc: 'Auto-save all media from this chat' },
      { label: 'Never Save', value: 'never', desc: 'Don\'t auto-save media from this chat' },
    ];
    return (
      <div className="absolute inset-0 z-30 md:relative md:inset-auto md:z-auto w-full md:w-80 md:border-l border-slate-200 dark:border-surface-700 bg-white dark:bg-surface-900 flex flex-col h-full">
        <div className="flex items-center gap-2 p-4 border-b border-slate-200 dark:border-surface-700">
          <button onClick={() => setShowSaveMedia(false)} className="p-1 hover:bg-slate-100 dark:hover:bg-surface-700 rounded">
            <ChevronRight size={18} className="rotate-180 text-slate-600 dark:text-slate-400" />
          </button>
          <h3 className="font-semibold text-slate-900 dark:text-white">Save Media</h3>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          <p className="px-4 py-2 text-xs text-slate-500 dark:text-slate-400">
            Choose how media (images, videos, files) from this chat is saved.
          </p>
          {saveOptions.map((opt) => {
            const isActive = settings.saveMedia === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => { updateSetting('saveMedia', opt.value); setShowSaveMedia(false); }}
                className={`w-full text-left px-4 py-3 rounded-lg mb-1 transition ${
                  isActive
                    ? 'bg-primary-50 dark:bg-primary-900/30 border border-primary-200 dark:border-primary-800'
                    : 'hover:bg-slate-50 dark:hover:bg-surface-800'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className={`text-sm font-medium ${isActive ? 'text-primary-700 dark:text-primary-400' : 'text-slate-700 dark:text-slate-300'}`}>
                    {opt.label}
                  </span>
                  {isActive && <Check size={16} className="text-primary-600 dark:text-primary-400" />}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{opt.desc}</p>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ============================================
  // Auto-Translate Settings Sub-page
  // ============================================
  if (showTranslateSettings) {
    return (
      <div className="absolute inset-0 z-30 md:relative md:inset-auto md:z-auto w-full md:w-80 md:border-l border-slate-200 dark:border-surface-700 bg-white dark:bg-surface-900 flex flex-col h-full">
        <div className="flex items-center gap-2 p-4 border-b border-slate-200 dark:border-surface-700">
          <button onClick={() => setShowTranslateSettings(false)} className="p-1 hover:bg-slate-100 dark:hover:bg-surface-700 rounded">
            <ChevronRight size={18} className="rotate-180 text-slate-600 dark:text-slate-400" />
          </button>
          <Languages size={18} className="text-blue-500" />
          <h3 className="font-semibold text-slate-900 dark:text-white">Auto-Translate</h3>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* Master Toggle */}
          <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-surface-800 rounded-xl">
            <div>
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200">Enable Auto-Translate</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {settings.autoTranslate ? 'Translation is active' : 'Translation is off'}
              </p>
            </div>
            <ToggleSwitch
              value={settings.autoTranslate}
              onChange={(v) => {
                if (v && !isTransGuyHired) {
                  // Show wizard when trying to enable without TransGuy hired
                  setShowTransGuyWizard(true);
                  return;
                }
                updateSetting('autoTranslate', v);
                if (v && !settings.translateLang) {
                  updateSetting('translateLang', 'English');
                }
              }}
            />
          </div>

          {/* TransGuy Hiring Wizard Modal */}
          {showTransGuyWizard && (
            <div className="rounded-xl border-2 border-emerald-200 dark:border-emerald-800 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 p-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'linear-gradient(135deg, #10B981, #059669)' }}>
                  <Globe size={24} className="text-white" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">Meet TransGuy!</h4>
                  <p className="text-xs text-emerald-600 dark:text-emerald-400">Your AI Translation Agent</p>
                </div>
              </div>
              <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                To use Auto-Translate, you need to hire <strong>TransGuy</strong> — an AI Agent who speaks all living
                (and even some dead!) languages. He&apos;ll translate your messages in real-time across 50+ languages.
              </p>
              <div className="flex items-center gap-2 p-2.5 bg-white/60 dark:bg-surface-800/60 rounded-lg">
                <Sparkles size={14} className="text-amber-500 flex-shrink-0" />
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  TransGuy offers a <strong>free one-day trial</strong> so you can test his abilities!
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setShowTransGuyWizard(false);
                    if (onNavigateToAgents) {
                      onNavigateToAgents('transguy');
                    }
                  }}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-semibold transition shadow-sm"
                >
                  <Globe size={16} />
                  Meet TransGuy
                </button>
                <button
                  onClick={() => setShowTransGuyWizard(false)}
                  className="px-4 py-2.5 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-surface-700 rounded-xl text-sm transition"
                >
                  Later
                </button>
              </div>
            </div>
          )}

          {/* Requires Agent Notice (when not hired) */}
          {!isTransGuyHired && !showTransGuyWizard && (
            <div className="flex items-center gap-2 p-2.5 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-lg">
              <Globe size={14} className="text-amber-500 flex-shrink-0" />
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Requires <strong>TransGuy</strong> agent hiring
              </p>
            </div>
          )}

          {settings.autoTranslate && (
            <>
              {/* Show all messages in language */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-2">
                  Show me all messages in
                </label>
                <select
                  value={settings.translateLang || 'English'}
                  onChange={(e) => updateSetting('translateLang', e.target.value)}
                  className="w-full px-3 py-2.5 bg-white dark:bg-surface-800 border border-slate-200 dark:border-surface-600 rounded-xl text-sm text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                >
                  {LANGUAGES.map((lang) => (
                    <option key={lang} value={lang}>{lang}</option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1.5">
                  Incoming messages will be translated to this language
                </p>
              </div>

              {/* Translate my messages (optional) */}
              <div className="border-t border-slate-200 dark:border-surface-700 pt-4">
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-2">
                  Translate my messages (optional)
                </label>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mb-3">
                  If enabled, your outgoing messages will be translated before sending. Leave "from" as "All Languages" for auto-detection.
                </p>
                <div className="space-y-3">
                  <div>
                    <span className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">From</span>
                    <select
                      value={settings.translateMyFrom || ''}
                      onChange={(e) => updateSetting('translateMyFrom', e.target.value || null)}
                      className="w-full px-3 py-2.5 bg-white dark:bg-surface-800 border border-slate-200 dark:border-surface-600 rounded-xl text-sm text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    >
                      <option value="">Don't translate my messages</option>
                      <option value="all">All Languages (auto-detect)</option>
                      {LANGUAGES.map((lang) => (
                        <option key={lang} value={lang}>{lang}</option>
                      ))}
                    </select>
                  </div>
                  {settings.translateMyFrom && (
                    <div>
                      <span className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">To</span>
                      <select
                        value={settings.translateMyTo || ''}
                        onChange={(e) => updateSetting('translateMyTo', e.target.value || null)}
                        className="w-full px-3 py-2.5 bg-white dark:bg-surface-800 border border-slate-200 dark:border-surface-600 rounded-xl text-sm text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                      >
                        <option value="">Select language...</option>
                        {LANGUAGES.map((lang) => (
                          <option key={lang} value={lang}>{lang}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // ============================================
  // Main settings panel
  // ============================================
  return (
    <div className="absolute inset-0 z-30 md:relative md:inset-auto md:z-auto w-full md:w-80 md:border-l border-slate-200 dark:border-surface-700 bg-white dark:bg-surface-900 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-surface-700">
        <h3 className="font-semibold text-slate-900 dark:text-white">Chat Settings</h3>
        <button onClick={onClose} className="p-1 hover:bg-slate-100 dark:hover:bg-surface-700 rounded">
          <X size={18} className="text-slate-600 dark:text-slate-400" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Profile Section */}
        <div className="flex flex-col items-center py-6 px-4 border-b border-slate-200 dark:border-surface-700">
          <div className="relative mb-3">
            <Avatar
              src={chatAvatar}
              name={chatName}
              size="xl"
            />
            {isDM && otherUser && (
              <div className="absolute bottom-0 right-0">
                <PresenceIndicator userId={otherUser.id} size="lg" />
              </div>
            )}
          </div>
          <h4 className="text-lg font-semibold text-slate-900 dark:text-white">{chatName}</h4>
          <p className="text-sm text-slate-500 dark:text-slate-400 text-center mt-1">{chatSubtitle}</p>
          {isDM && otherUser?.lastSeenAt && !otherUser?.isOnline && (
            <p className="text-xs text-slate-400 mt-1">
              Last seen {new Date(otherUser.lastSeenAt).toLocaleString()}
            </p>
          )}
        </div>

        {/* Quick Actions */}
        {isDM && otherUser && (
          <div className="flex justify-center gap-4 py-4 border-b border-slate-200 dark:border-surface-700">
            <button className="flex flex-col items-center gap-1" title="Search">
              <div className="w-10 h-10 flex items-center justify-center bg-slate-100 dark:bg-surface-800 rounded-full">
                <FileText size={18} className="text-slate-600 dark:text-slate-400" />
              </div>
              <span className="text-xs text-slate-500">Search</span>
            </button>
          </div>
        )}

        {/* Settings List */}
        <div className="divide-y divide-slate-100 dark:divide-surface-700">

          {/* Favorite */}
          <SettingRow
            icon={<Heart size={18} className={settings.isFavorite ? 'text-red-500 fill-red-500' : 'text-slate-500'} />}
            label="Add to Favorites"
            trailing={
              <ToggleSwitch
                value={settings.isFavorite}
                onChange={(v) => updateSetting('isFavorite', v)}
              />
            }
          />

          {/* Notifications / Mute */}
          <SettingRow
            icon={settings.isMuted ? <BellOff size={18} className="text-slate-500" /> : <Bell size={18} className="text-slate-500" />}
            label="Mute Notifications"
            trailing={
              <ToggleSwitch
                value={settings.isMuted}
                onChange={(v) => updateSetting('isMuted', v)}
              />
            }
          />

          {/* Custom Notification Sound */}
          <SettingRow
            icon={<Volume2 size={18} className="text-slate-500" />}
            label="Notification Sound"
            subtitle={settings.customNotificationSound ? capitalize(settings.customNotificationSound) : 'Default'}
            onClick={() => setShowNotificationSound(true)}
          />

          {/* Chat Wallpaper */}
          <SettingRow
            icon={<Palette size={18} className="text-slate-500" />}
            label="Chat Wallpaper"
            subtitle={settings.chatWallpaper ? '' : 'Default'}
            trailing={
              settings.chatWallpaper ? (
                <div className="flex items-center gap-2">
                  <div
                    className="w-5 h-5 rounded border border-slate-300 dark:border-surface-600"
                    style={{ backgroundColor: settings.chatWallpaper }}
                  />
                  <ChevronRight size={16} className="text-slate-400" />
                </div>
              ) : undefined
            }
            onClick={() => setShowWallpaperPicker(true)}
          />

          {/* Save Media */}
          <SettingRow
            icon={<Save size={18} className="text-slate-500" />}
            label="Save Media"
            subtitle={settings.saveMedia === 'default' ? 'Default' : settings.saveMedia === 'always' ? 'Always Save' : 'Never Save'}
            onClick={() => setShowSaveMedia(true)}
          />

          {/* Auto-Translate — glow animation to attract attention */}
          <SettingRow
            icon={<Languages size={18} className={settings.autoTranslate ? 'text-blue-500' : 'text-slate-500'} />}
            label="Auto-Translate"
            subtitle={
              settings.autoTranslate
                ? `Translating to ${settings.translateLang || 'English'}`
                : !isTransGuyHired
                ? 'Requires Translation Agent'
                : 'Off'
            }
            onClick={() => setShowTranslateSettings(true)}
            className="relative overflow-hidden animate-glow-pulse"
          />

          {/* Disappearing Messages */}
          <SettingRow
            icon={<Clock size={18} className="text-slate-500" />}
            label="Disappearing Messages"
            subtitle={conversation?.disappearingSeconds ? formatDuration(conversation.disappearingSeconds) : 'Off'}
            onClick={() => setShowDisappearing(true)}
          />

          {/* Lock Chat */}
          <SettingRow
            icon={<Lock size={18} className={settings.isLocked ? 'text-amber-500' : 'text-slate-500'} />}
            label="Lock Chat"
            subtitle={settings.isLocked ? 'Chat is locked with PIN' : 'Lock and hide this chat'}
            trailing={
              <ToggleSwitch
                value={settings.isLocked}
                onChange={handleLockToggle}
              />
            }
          />

          {/* Encryption */}
          <SettingRow
            icon={<Shield size={18} className="text-green-500" />}
            label="Encryption"
            subtitle="Messages are encrypted in transit"
            onClick={() => {}}
          />
        </div>

        {/* Media, Links & Docs */}
        <div className="border-t border-slate-200 dark:border-surface-700">
          <SettingRow
            icon={<Image size={18} className="text-slate-500" />}
            label="Media, Links & Docs"
            subtitle={`${(mediaCounts?.media || 0) + (mediaCounts?.docs || 0) + (mediaCounts?.links || 0)} items`}
            onClick={() => { setShowMedia(true); loadMedia('media'); }}
          />
        </div>

        {/* Starred Messages */}
        <div className="border-t border-slate-200 dark:border-surface-700">
          <SettingRow
            icon={<Star size={18} className="text-amber-500" />}
            label="Starred Messages"
            subtitle={starredCount > 0 ? `${starredCount} messages` : 'None'}
            onClick={() => { setShowStarred(true); loadStarred(); }}
          />
        </div>

        {/* Groups in Common (DM only) */}
        {isDM && commonGroups && commonGroups.length > 0 && (
          <div className="border-t border-slate-200 dark:border-surface-700 py-2">
            <p className="px-4 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">
              {commonGroups.length} Group{commonGroups.length !== 1 ? 's' : ''} in Common
            </p>
            {isDM && otherUser && (
              <SettingRow
                icon={<UserPlus size={18} className="text-slate-500" />}
                label={`Create group with ${otherUser.displayName}`}
                onClick={() => {}}
              />
            )}
            {commonGroups.map((group: any) => (
              <button
                key={group.id}
                onClick={() => onNavigateToChat?.(group.id)}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-surface-800 transition"
              >
                <Avatar src={group.avatarUrl} name={group.name} size="md" />
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{group.name}</p>
                  <p className="text-xs text-slate-500 truncate">
                    {group.members?.map((m: any) => m.user.displayName).join(', ')}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Danger Zone */}
        <div className="border-t border-slate-200 dark:border-surface-700 py-2">
          <SettingRow
            icon={<Download size={18} className="text-slate-500" />}
            label="Export Chat"
            onClick={handleExport}
          />
          <SettingRow
            icon={<MessageSquareOff size={18} className="text-red-500" />}
            label="Clear Chat"
            labelClass="text-red-500"
            onClick={() => setShowClearConfirm(true)}
          />
          {isDM && otherUser && (
            <>
              <SettingRow
                icon={<Ban size={18} className="text-red-500" />}
                label={isBlocked ? 'Unblock Contact' : 'Block Contact'}
                labelClass="text-red-500"
                onClick={() => setShowBlockConfirm(true)}
              />
              <SettingRow
                icon={<Flag size={18} className="text-red-500" />}
                label="Report Contact"
                labelClass="text-red-500"
                onClick={() => setShowReportModal(true)}
              />
            </>
          )}
        </div>
      </div>

      {/* ============================================ */}
      {/* Modals                                       */}
      {/* ============================================ */}

      {/* Disappearing Messages Modal */}
      {showDisappearing && (
        <Modal onClose={() => setShowDisappearing(false)} title="Disappearing Messages">
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
            When enabled, new messages will disappear after the selected time.
          </p>
          {[
            { label: 'Off', value: null },
            { label: '24 Hours', value: 86400 },
            { label: '7 Days', value: 604800 },
            { label: '90 Days', value: 7776000 },
          ].map(opt => (
            <button
              key={opt.label}
              onClick={() => handleDisappearing(opt.value)}
              className={`w-full text-left px-4 py-3 rounded-lg mb-1 text-sm transition flex items-center justify-between ${
                conversation?.disappearingSeconds === opt.value
                  ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 font-medium'
                  : 'hover:bg-slate-50 dark:hover:bg-surface-800 text-slate-700 dark:text-slate-300'
              }`}
            >
              <span>{opt.label}</span>
              {conversation?.disappearingSeconds === opt.value && <Check size={16} className="text-primary-600" />}
            </button>
          ))}
        </Modal>
      )}

      {/* Lock Chat Modal */}
      {showLockChat && (
        <Modal onClose={() => setShowLockChat(false)} title={settings.isLocked ? 'Unlock Chat' : 'Lock Chat'}>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
            {lockStep === 'set' && 'Set a PIN to lock this chat. You\'ll need it to unlock.'}
            {lockStep === 'confirm' && 'Confirm your PIN to lock this chat.'}
            {lockStep === 'unlock' && 'Enter your PIN to unlock this chat.'}
          </p>
          <div className="flex justify-center gap-2 mb-4">
            {[0, 1, 2, 3].map((i) => {
              const pin = lockStep === 'confirm' ? lockPinConfirm : lockPin;
              return (
                <div
                  key={i}
                  className={`w-10 h-10 rounded-lg border-2 flex items-center justify-center text-lg font-bold transition ${
                    pin.length > i
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400'
                      : 'border-slate-300 dark:border-surface-600 bg-slate-50 dark:bg-surface-800'
                  }`}
                >
                  {pin.length > i ? '•' : ''}
                </div>
              );
            })}
          </div>
          <input
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            autoFocus
            value={lockStep === 'confirm' ? lockPinConfirm : lockPin}
            onChange={(e) => {
              const val = e.target.value.replace(/\D/g, '');
              if (lockStep === 'confirm') setLockPinConfirm(val);
              else setLockPin(val);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleLockSubmit();
            }}
            className="w-full px-3 py-2 text-sm text-center tracking-[0.5em] bg-slate-50 dark:bg-surface-800 border border-slate-200 dark:border-surface-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 mb-3"
            placeholder="Enter PIN"
          />
          {lockError && (
            <p className="text-xs text-red-500 text-center mb-3">{lockError}</p>
          )}
          <button
            onClick={handleLockSubmit}
            disabled={(lockStep === 'confirm' ? lockPinConfirm : lockPin).length < 4}
            className="w-full px-4 py-2 text-sm bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {lockStep === 'set' ? 'Next' : lockStep === 'confirm' ? 'Lock Chat' : 'Unlock Chat'}
          </button>
        </Modal>
      )}

      {/* Block Confirm */}
      {showBlockConfirm && (
        <Modal onClose={() => setShowBlockConfirm(false)} title={isBlocked ? 'Unblock Contact' : 'Block Contact'}>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
            {isBlocked
              ? `Are you sure you want to unblock ${otherUser?.displayName}?`
              : `Are you sure you want to block ${otherUser?.displayName}? They won't be able to message you.`}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setShowBlockConfirm(false)}
              className="flex-1 px-4 py-2 text-sm bg-slate-100 dark:bg-surface-800 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-200 dark:hover:bg-surface-700"
            >
              Cancel
            </button>
            <button
              onClick={handleBlock}
              className="flex-1 px-4 py-2 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600"
            >
              {isBlocked ? 'Unblock' : 'Block'}
            </button>
          </div>
        </Modal>
      )}

      {/* Clear Chat Confirm */}
      {showClearConfirm && (
        <Modal onClose={() => setShowClearConfirm(false)} title="Clear Chat">
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
            Are you sure you want to clear all messages? This action cannot be undone.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setShowClearConfirm(false)}
              className="flex-1 px-4 py-2 text-sm bg-slate-100 dark:bg-surface-800 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-200 dark:hover:bg-surface-700"
            >
              Cancel
            </button>
            <button
              onClick={handleClearChat}
              className="flex-1 px-4 py-2 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600"
            >
              Clear
            </button>
          </div>
        </Modal>
      )}

      {/* Report Modal */}
      {showReportModal && (
        <Modal onClose={() => setShowReportModal(false)} title="Report Contact">
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Reason</label>
              <select
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-surface-800 border border-slate-200 dark:border-surface-700 rounded-lg text-slate-900 dark:text-white"
              >
                <option value="">Select a reason...</option>
                <option value="spam">Spam</option>
                <option value="harassment">Harassment</option>
                <option value="inappropriate">Inappropriate Content</option>
                <option value="impersonation">Impersonation</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Details (optional)</label>
              <textarea
                value={reportDetails}
                onChange={(e) => setReportDetails(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-surface-800 border border-slate-200 dark:border-surface-700 rounded-lg text-slate-900 dark:text-white resize-none"
                rows={3}
                placeholder="Provide more details..."
              />
            </div>
            <button
              onClick={handleReport}
              disabled={!reportReason}
              className="w-full px-4 py-2 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Submit Report
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ============================================
// Helper Components
// ============================================

function SettingRow({
  icon, label, subtitle, trailing, onClick, labelClass, className,
}: {
  icon: React.ReactNode;
  label: string;
  subtitle?: string;
  trailing?: React.ReactNode;
  onClick?: () => void;
  labelClass?: string;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-surface-800 transition text-left ${className || ''}`}
    >
      <div className="flex-shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${labelClass || 'text-slate-900 dark:text-white'}`}>{label}</p>
        {subtitle && <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{subtitle}</p>}
      </div>
      {trailing || (onClick && <ChevronRight size={16} className="text-slate-400 flex-shrink-0" />)}
    </button>
  );
}

function ToggleSwitch({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onChange(!value); }}
      className={`relative w-10 h-5 rounded-full transition-colors ${
        value ? 'bg-primary-500' : 'bg-slate-300 dark:bg-surface-600'
      }`}
    >
      <div
        className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
          value ? 'translate-x-5' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

function Modal({ onClose, title, children }: { onClose: () => void; title: string; children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-surface-800 rounded-xl p-5 w-72 shadow-xl">
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-semibold text-slate-900 dark:text-white">{title}</h4>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 dark:hover:bg-surface-700 rounded">
            <X size={16} className="text-slate-500" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function formatDuration(seconds: number): string {
  if (seconds < 3600) return `${Math.round(seconds / 60)} minutes`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} hours`;
  if (seconds < 604800) return `${Math.round(seconds / 86400)} days`;
  return `${Math.round(seconds / 604800)} weeks`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function isLightColor(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5;
}
