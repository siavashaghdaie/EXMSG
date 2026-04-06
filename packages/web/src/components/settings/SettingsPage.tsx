import React, { useState, useRef, useEffect } from 'react';
import { X, User, Bell, Shield, Palette, Bot, Info, LogOut, Check, Plus, BarChart3 } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { api } from '@/services/api';
import Avatar from '@/components/common/Avatar';
import AvatarCropModal from './AvatarCropModal';
import AgentsPage from '@/components/agents/AgentsPage';
import AdminDashboard from '@/components/admin/AdminDashboard';

interface SettingsPageProps {
  onBack: () => void;
}

type SettingsTab = 'profile' | 'notifications' | 'privacy' | 'appearance' | 'agents' | 'dashboard' | 'about';

export default function SettingsPage({ onBack }: SettingsPageProps) {
  const { user, updateUser } = useAuthStore();
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [selectedTab, setSelectedTab] = useState<SettingsTab | null>(isMobile ? null : 'profile');
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');
  const [username, setUsername] = useState(user?.username || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [showAvatarPreview, setShowAvatarPreview] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Appearance settings
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>(() => {
    const saved = localStorage.getItem('theme');
    return (saved as 'light' | 'dark' | 'system') || 'system';
  });
  const [fontSize, setFontSize] = useState<'small' | 'medium' | 'large'>('medium');

  // Notification settings
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [desktopNotifications, setDesktopNotifications] = useState(true);

  // Privacy settings
  const [showOnlineStatus, setShowOnlineStatus] = useState(true);
  const [showReadReceipts, setShowReadReceipts] = useState(true);
  const [showLastSeen, setShowLastSeen] = useState(true);

  // Apply theme to DOM
  const applyTheme = (themeValue: 'light' | 'dark' | 'system') => {
    const root = document.documentElement;
    if (themeValue === 'dark') {
      root.classList.add('dark');
    } else if (themeValue === 'light') {
      root.classList.remove('dark');
    } else {
      // System preference
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (prefersDark) {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
    }
  };

  // Initialize theme on mount
  useEffect(() => {
    applyTheme(theme);
  }, []);

  // Handle theme change
  const handleThemeChange = (newTheme: 'light' | 'dark' | 'system') => {
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    applyTheme(newTheme);
  };

  // Handle responsive behavior
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      // On mobile, show tab menu by default; on desktop, show content
      if (!mobile && selectedTab === null) {
        setSelectedTab('profile');
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [selectedTab]);

  const handleSaveProfile = async () => {
    setIsSaving(true);
    setSaveMessage('');
    try {
      const updated = await api.updateProfile({ username, bio });
      if (updateUser) updateUser(updated);
      setSaveMessage('Profile saved successfully!');
      setTimeout(() => setSaveMessage(''), 3000);
    } catch (error: any) {
      setSaveMessage('Failed to save profile.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file size (5MB limit)
    if (file.size > 5 * 1024 * 1024) {
      setSaveMessage('Image must be under 5MB');
      setTimeout(() => setSaveMessage(''), 3000);
      return;
    }

    // Open crop modal instead of uploading directly
    setCropFile(file);
  };

  const handleCropSave = async (croppedBlob: Blob) => {
    setIsUploadingAvatar(true);
    setSaveMessage('');
    try {
      const { avatarUrl } = await api.uploadAvatar(croppedBlob as File);
      if (updateUser && user) {
        updateUser({ ...user, avatar: avatarUrl });
      }
      setSaveMessage('Avatar uploaded successfully!');
      setTimeout(() => setSaveMessage(''), 3000);
    } catch (err) {
      console.error('Avatar upload failed:', err);
      setSaveMessage('Failed to upload avatar.');
      setTimeout(() => setSaveMessage(''), 3000);
    } finally {
      setIsUploadingAvatar(false);
      // Reset input
      if (avatarInputRef.current) {
        avatarInputRef.current.value = '';
      }
    }
  };

  const tabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
    { id: 'profile', label: 'Profile', icon: <User size={18} /> },
    { id: 'notifications', label: 'Notifications', icon: <Bell size={18} /> },
    { id: 'privacy', label: 'Privacy', icon: <Shield size={18} /> },
    { id: 'appearance', label: 'Appearance', icon: <Palette size={18} /> },
    { id: 'agents', label: 'Agents Management', icon: <Bot size={18} /> },
    { id: 'dashboard', label: 'Admin Dashboard', icon: <BarChart3 size={18} /> },
    { id: 'about', label: 'About', icon: <Info size={18} /> },
  ];

  const ToggleSwitch = ({ enabled, onChange }: { enabled: boolean; onChange: (v: boolean) => void }) => (
    <button
      onClick={() => onChange(!enabled)}
      className={`relative w-11 h-6 min-w-[44px] min-h-[24px] flex-shrink-0 rounded-full transition-colors ${
        enabled ? 'bg-blue-500' : 'bg-slate-300'
      }`}
    >
      <div
        className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
          enabled ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );

  // On mobile, show either the tab menu or the content
  if (isMobile && selectedTab === null) {
    return (
      <div className="flex flex-col h-full bg-white dark:bg-slate-900">
        {/* Header */}
        <div className="border-b border-slate-200 dark:border-slate-700 p-4 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Settings</h1>
          <button
            onClick={onBack}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
          >
            <X size={20} className="text-slate-600 dark:text-slate-300" />
          </button>
        </div>

        {/* Tab menu - full screen on mobile */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setSelectedTab(tab.id);
                setActiveTab(tab.id);
              }}
              className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition ${
                activeTab === tab.id
                  ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </nav>

        {/* Footer */}
        <div className="border-t border-slate-200 dark:border-slate-700 p-3">
          <button
            onClick={() => {
              useAuthStore.getState().logout();
            }}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition"
          >
            <LogOut size={18} />
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900">
      {/* Header */}
      <div className="border-b border-slate-200 dark:border-slate-700 p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {!isMobile && (
            <button
              onClick={onBack}
              className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
            >
              <X size={20} className="text-slate-600 dark:text-slate-300" />
            </button>
          )}
          <h1 className="text-lg font-semibold text-slate-900 dark:text-white">
            {isMobile && selectedTab !== null
              ? tabs.find(t => t.id === activeTab)?.label || 'Settings'
              : 'Settings'
            }
          </h1>
        </div>
        {isMobile && selectedTab !== null && (
          <button
            onClick={() => setSelectedTab(null)}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
          >
            <X size={20} className="text-slate-600 dark:text-slate-300" />
          </button>
        )}
      </div>

      <div className={`flex flex-1 overflow-hidden ${isMobile ? 'flex-col' : 'flex-row'}`}>
        {/* Tab sidebar - only show on desktop */}
        {!isMobile && (
          <div className="w-56 border-r border-slate-200 dark:border-slate-700 p-3 flex-shrink-0">
            <nav className="space-y-1">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                    activeTab === tab.id
                      ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </nav>

            <div className="mt-auto pt-4 border-t border-slate-200 dark:border-slate-700">
              <button
                onClick={() => {
                  useAuthStore.getState().logout();
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition"
              >
                <LogOut size={18} />
                Sign Out
              </button>
            </div>
          </div>
        )}

        {/* Content */}
        <div className={`flex-1 overflow-y-auto ${isMobile ? 'p-4' : 'p-6'}`}>
          {activeTab === 'profile' && (
            <div className="max-w-lg">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-6">Profile Settings</h2>

              {/* Avatar */}
              <div className="flex items-center gap-4 mb-8">
                <div className="relative">
                  <div
                    className="cursor-pointer"
                    onClick={() => {
                      const avatarSrc = user?.avatar || (user as any)?.avatarUrl;
                      if (avatarSrc) {
                        setShowAvatarPreview(true);
                      } else if (!isUploadingAvatar) {
                        avatarInputRef.current?.click();
                      }
                    }}
                  >
                    <Avatar src={user?.avatar || (user as any)?.avatarUrl} name={user?.username || user?.email || 'User'} size="xl" />
                  </div>
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarUpload}
                    className="hidden"
                  />
                  <span
                    className="absolute -bottom-1.5 -right-1.5 w-5 h-5 flex items-center justify-center bg-blue-500 text-white rounded-full shadow-lg border-2 border-white dark:border-slate-900 cursor-pointer z-10"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!isUploadingAvatar) avatarInputRef.current?.click();
                    }}
                  >
                    <Plus size={10} />
                  </span>
                </div>
                <div>
                  <p className="font-medium text-slate-900 dark:text-white">{user?.username}</p>
                  <p className="text-sm text-slate-500">{user?.email}</p>
                </div>
              </div>

              {/* Avatar Preview Modal */}
              {showAvatarPreview && (user?.avatar || (user as any)?.avatarUrl) && (
                <div
                  className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50"
                  onClick={() => setShowAvatarPreview(false)}
                >
                  <div className="relative" onClick={(e) => e.stopPropagation()}>
                    <div className="w-64 h-64 md:w-80 md:h-80 rounded-full overflow-hidden border-4 border-white shadow-2xl">
                      <img
                        src={user?.avatar || (user as any)?.avatarUrl}
                        alt={user?.username || 'Profile'}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <button
                      onClick={() => setShowAvatarPreview(false)}
                      className="absolute -top-2 -right-2 w-8 h-8 bg-white dark:bg-slate-800 rounded-full flex items-center justify-center shadow-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition"
                    >
                      <X size={16} className="text-slate-600 dark:text-slate-300" />
                    </button>
                  </div>
                </div>
              )}

              {/* Username */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Display Name
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition"
                />
              </div>

              {/* Bio */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Bio
                </label>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  rows={3}
                  maxLength={200}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition resize-none"
                  placeholder="Tell others about yourself..."
                />
                <p className="text-xs text-slate-500 mt-1">{bio.length}/200</p>
              </div>

              {/* Email (read-only) */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Email
                </label>
                <input
                  type="email"
                  value={user?.email || ''}
                  disabled
                  className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-500 cursor-not-allowed"
                />
              </div>

              <button
                onClick={handleSaveProfile}
                disabled={isSaving}
                className="px-6 py-2.5 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 disabled:opacity-50 transition flex items-center gap-2"
              >
                {isSaving ? 'Saving...' : 'Save Changes'}
                {saveMessage && <Check size={16} />}
              </button>
              {saveMessage && (
                <p className={`mt-2 text-sm ${saveMessage.includes('success') ? 'text-green-600' : 'text-red-500'}`}>
                  {saveMessage}
                </p>
              )}
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className="max-w-lg">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-6">Notification Settings</h2>

              <div className="space-y-4">
                <div className="flex items-center justify-between py-3 border-b border-slate-100 dark:border-slate-800">
                  <div>
                    <p className="font-medium text-slate-900 dark:text-white">Enable Notifications</p>
                    <p className="text-sm text-slate-500">Receive notifications for new messages</p>
                  </div>
                  <ToggleSwitch enabled={notificationsEnabled} onChange={setNotificationsEnabled} />
                </div>

                <div className="flex items-center justify-between py-3 border-b border-slate-100 dark:border-slate-800">
                  <div>
                    <p className="font-medium text-slate-900 dark:text-white">Sound</p>
                    <p className="text-sm text-slate-500">Play sound for incoming messages</p>
                  </div>
                  <ToggleSwitch enabled={soundEnabled} onChange={setSoundEnabled} />
                </div>

                <div className="flex items-center justify-between py-3 border-b border-slate-100 dark:border-slate-800">
                  <div>
                    <p className="font-medium text-slate-900 dark:text-white">Desktop Notifications</p>
                    <p className="text-sm text-slate-500">Show browser desktop notifications</p>
                  </div>
                  <ToggleSwitch enabled={desktopNotifications} onChange={setDesktopNotifications} />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'privacy' && (
            <div className="max-w-lg">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-6">Privacy Settings</h2>

              <div className="space-y-4">
                <div className="flex items-center justify-between py-3 border-b border-slate-100 dark:border-slate-800">
                  <div>
                    <p className="font-medium text-slate-900 dark:text-white">Online Status</p>
                    <p className="text-sm text-slate-500">Show when you're online</p>
                  </div>
                  <ToggleSwitch enabled={showOnlineStatus} onChange={setShowOnlineStatus} />
                </div>

                <div className="flex items-center justify-between py-3 border-b border-slate-100 dark:border-slate-800">
                  <div>
                    <p className="font-medium text-slate-900 dark:text-white">Read Receipts</p>
                    <p className="text-sm text-slate-500">Let others know when you've read their messages</p>
                  </div>
                  <ToggleSwitch enabled={showReadReceipts} onChange={setShowReadReceipts} />
                </div>

                <div className="flex items-center justify-between py-3 border-b border-slate-100 dark:border-slate-800">
                  <div>
                    <p className="font-medium text-slate-900 dark:text-white">Last Seen</p>
                    <p className="text-sm text-slate-500">Show your last seen time to others</p>
                  </div>
                  <ToggleSwitch enabled={showLastSeen} onChange={setShowLastSeen} />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'appearance' && (
            <div className="max-w-lg">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-6">Appearance Settings</h2>

              {/* Theme */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">Theme</label>
                <div className="grid grid-cols-3 gap-3">
                  {(['light', 'dark', 'system'] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => handleThemeChange(t)}
                      className={`flex flex-col items-center justify-center px-3 py-4 rounded-lg border-2 text-sm font-medium capitalize transition min-h-[72px] ${
                        theme === t
                          ? 'border-blue-500 bg-blue-50 text-blue-600 dark:bg-blue-900/30'
                          : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                      }`}
                    >
                      <span className="text-lg mb-1">{t === 'light' ? '☀️' : t === 'dark' ? '🌙' : '💻'}</span>
                      <span>{t}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Font size */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">Font Size</label>
                <div className="grid grid-cols-3 gap-3">
                  {(['small', 'medium', 'large'] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => setFontSize(s)}
                      className={`flex flex-col items-center justify-center px-3 py-4 rounded-lg border-2 text-sm font-medium capitalize transition min-h-[72px] ${
                        fontSize === s
                          ? 'border-blue-500 bg-blue-50 text-blue-600 dark:bg-blue-900/30'
                          : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                      }`}
                    >
                      <span className={`mb-1 ${s === 'small' ? 'text-xs' : s === 'large' ? 'text-lg' : 'text-sm'}`}>Aa</span>
                      <span>{s}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'agents' && (
            <AgentsPage isEmbedded={true} />
          )}

          {activeTab === 'dashboard' && (
            <AdminDashboard isEmbedded={true} />
          )}

          {activeTab === 'about' && (
            <div className="max-w-lg">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-6">About OmniLink</h2>

              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-slate-800 dark:to-slate-800 rounded-xl p-6 mb-6">
                <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">OMNISYS GLOBAL</h3>
                <h4 className="text-lg font-semibold text-blue-600 dark:text-blue-400 mb-3">OmniLink Messenger</h4>
                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  OmniLink Messenger is an exclusive enterprise communications platform developed by OMNISYS GLOBAL UAE.
                  Built to give organizations complete control over their internal communications, combining the speed of
                  modern messaging with the governance, security, and intelligence that businesses demand.
                </p>
              </div>

              <div className="space-y-3 text-sm text-slate-600 dark:text-slate-400">
                <div className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-800">
                  <span>Version</span>
                  <span className="font-medium text-slate-900 dark:text-white">1.0.0</span>
                </div>
                <div className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-800">
                  <span>Developer</span>
                  <span className="font-medium text-slate-900 dark:text-white">OMNISYS GLOBAL UAE</span>
                </div>
                <div className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-800">
                  <span>Website</span>
                  <a href="https://www.omnisysco.com" target="_blank" rel="noopener noreferrer" className="font-medium text-blue-500 hover:underline">www.omnisysco.com</a>
                </div>
                <p className="text-xs text-slate-400 pt-4">
                  Copyright 2026 OMNISYS GLOBAL. All Rights Reserved.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Avatar Crop Modal */}
      {cropFile && (
        <AvatarCropModal
          file={cropFile}
          isOpen={true}
          onClose={() => setCropFile(null)}
          onSave={handleCropSave}
        />
      )}
    </div>
  );
}
