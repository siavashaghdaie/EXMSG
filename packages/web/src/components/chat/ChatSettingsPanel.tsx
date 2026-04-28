import React, { useEffect, useState } from 'react';
import {
  X, Bell, BellOff, Clock, Lock, Star, Image, FileText,
  Download, Shield, UserPlus, Heart, Languages,
  ChevronRight, Volume2, Palette, Save, Ban, Flag, MessageSquareOff
} from 'lucide-react';
import { api } from '@/services/api';
import Avatar from '@/components/common/Avatar';
import PresenceIndicator from '@/components/common/PresenceIndicator';

interface ChatSettingsPanelProps {
  conversationId: string;
  onClose: () => void;
  onNavigateToChat?: (conversationId: string) => void;
}

type MediaTab = 'media' | 'docs' | 'links';

export default function ChatSettingsPanel({ conversationId, onClose, onNavigateToChat }: ChatSettingsPanelProps) {
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
  const [reportReason, setReportReason] = useState('');
  const [reportDetails, setReportDetails] = useState('');

  useEffect(() => {
    loadChatInfo();
  }, [conversationId]);

  const loadChatInfo = async () => {
    try {
      setLoading(true);
      const info = await api.getChatInfo(conversationId);
      setChatInfo(info);
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
      setChatInfo((prev: any) => ({
        ...prev,
        settings: { ...prev.settings, [key]: value },
      }));
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

  if (loading) {
    return (
      <div className="w-80 border-l border-slate-200 dark:border-surface-700 bg-white dark:bg-surface-900 flex items-center justify-center">
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

  // Sub-panels
  if (showStarred) {
    return (
      <div className="w-80 border-l border-slate-200 dark:border-surface-700 bg-white dark:bg-surface-900 flex flex-col h-full">
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
      <div className="w-80 border-l border-slate-200 dark:border-surface-700 bg-white dark:bg-surface-900 flex flex-col h-full">
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

  // Main settings panel
  return (
    <div className="w-80 border-l border-slate-200 dark:border-surface-700 bg-white dark:bg-surface-900 flex flex-col h-full">
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
            subtitle={settings.customNotificationSound || 'Default'}
            onClick={() => {/* TODO: notification sound picker */}}
          />

          {/* Chat Wallpaper */}
          <SettingRow
            icon={<Palette size={18} className="text-slate-500" />}
            label="Chat Wallpaper"
            subtitle={settings.chatWallpaper || 'Default'}
            onClick={() => {
              const color = prompt('Enter wallpaper color (e.g. #f0f0f0) or "default":');
              if (color) updateSetting('chatWallpaper', color === 'default' ? null : color);
            }}
          />

          {/* Save Media */}
          <SettingRow
            icon={<Save size={18} className="text-slate-500" />}
            label="Save Media"
            subtitle={settings.saveMedia === 'default' ? 'Default' : settings.saveMedia === 'always' ? 'Always' : 'Never'}
            onClick={() => {
              const next = settings.saveMedia === 'default' ? 'always' : settings.saveMedia === 'always' ? 'never' : 'default';
              updateSetting('saveMedia', next);
            }}
          />

          {/* Auto-Translate */}
          <SettingRow
            icon={<Languages size={18} className={settings.autoTranslate ? 'text-blue-500' : 'text-slate-500'} />}
            label="Auto-Translate"
            subtitle={settings.autoTranslate ? `Translating to ${settings.translateLang || 'English'}` : 'Off'}
            trailing={
              <ToggleSwitch
                value={settings.autoTranslate}
                onChange={(v) => {
                  updateSetting('autoTranslate', v);
                  if (v && !settings.translateLang) {
                    const lang = prompt('Translate messages to which language?', 'English');
                    if (lang) updateSetting('translateLang', lang);
                  }
                }}
              />
            }
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
            subtitle="Lock and hide this chat"
            trailing={
              <ToggleSwitch
                value={settings.isLocked}
                onChange={(v) => updateSetting('isLocked', v)}
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
              className={`w-full text-left px-4 py-3 rounded-lg mb-1 text-sm transition ${
                conversation?.disappearingSeconds === opt.value
                  ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 font-medium'
                  : 'hover:bg-slate-50 dark:hover:bg-surface-800 text-slate-700 dark:text-slate-300'
              }`}
            >
              {opt.label}
            </button>
          ))}
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
  icon, label, subtitle, trailing, onClick, labelClass,
}: {
  icon: React.ReactNode;
  label: string;
  subtitle?: string;
  trailing?: React.ReactNode;
  onClick?: () => void;
  labelClass?: string;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-surface-800 transition text-left"
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
