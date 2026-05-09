import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert,
  Switch, Image, FlatList, Modal, TextInput, Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as SecureStore from 'expo-secure-store';
import { api } from '@/services/api';
import { useAuthStore } from '@/store/authStore';
import { useTheme } from '@/theme/ThemeContext';
import { getFullUrl } from '@/utils/imageUrl';
import ChatLockModal from '@/components/ChatLockModal';

export default function ChatSettingsScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { conversationId, name: chatName } = route.params;
  const { user } = useAuthStore();
  const { colors, isDark } = useTheme();

  const [loading, setLoading] = useState(true);
  const [chatInfo, setChatInfo] = useState<any>(null);
  const [showDisappearing, setShowDisappearing] = useState(false);
  const [showLockModal, setShowLockModal] = useState(false);
  const [lockStep, setLockStep] = useState<'set' | 'confirm'>('set');
  const [lockPinTemp, setLockPinTemp] = useState('');
  const [lockError, setLockError] = useState<string | null>(null);
  const [showTranslateSettings, setShowTranslateSettings] = useState(false);
  const [showMuteOptions, setShowMuteOptions] = useState(false);
  const [showLangPicker, setShowLangPicker] = useState<{ field: string; title: string; includeAll?: boolean; includeNone?: boolean } | null>(null);
  const [showReport, setShowReport] = useState(false);
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

  const handleBlock = () => {
    if (!chatInfo?.otherUser) return;
    const action = chatInfo.isBlocked ? 'unblock' : 'block';
    Alert.alert(
      `${action.charAt(0).toUpperCase() + action.slice(1)} Contact`,
      `Are you sure you want to ${action} ${chatInfo.otherUser.displayName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: action.charAt(0).toUpperCase() + action.slice(1),
          style: 'destructive',
          onPress: async () => {
            try {
              if (chatInfo.isBlocked) {
                await api.unblockUser(chatInfo.otherUser.id);
              } else {
                await api.blockUser(chatInfo.otherUser.id);
              }
              setChatInfo((prev: any) => ({ ...prev, isBlocked: !prev.isBlocked }));
            } catch (err) {
              console.error('Failed to block/unblock:', err);
            }
          },
        },
      ]
    );
  };

  const handleClearChat = () => {
    Alert.alert(
      'Clear Chat',
      'Are you sure you want to clear all messages? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.clearChat(conversationId);
              Alert.alert('Done', 'Chat cleared successfully.');
            } catch (err) {
              console.error('Failed to clear:', err);
            }
          },
        },
      ]
    );
  };

  const handleExport = async () => {
    try {
      const text = await api.exportChat(conversationId);
      await Share.share({ message: typeof text === 'string' ? text : 'Chat exported' });
    } catch (err) {
      console.error('Failed to export:', err);
    }
  };

  const handleReport = async () => {
    if (!chatInfo?.otherUser || !reportReason) return;
    try {
      await api.reportUser(chatInfo.otherUser.id, reportReason, reportDetails);
      setShowReport(false);
      setReportReason('');
      setReportDetails('');
      Alert.alert('Report Submitted', 'Thank you for your report. We will review it.');
    } catch (err) {
      console.error('Failed to report:', err);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.loadingContainer}>
          <Text style={{ color: colors.textSecondary }}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!chatInfo) return null;

  const { conversation, settings, mediaCounts, starredCount, otherUser, isBlocked, commonGroups } = chatInfo;
  const isDM = conversation?.type === 'DIRECT';
  const displayName = isDM && otherUser ? (otherUser.displayName || otherUser.username) : conversation?.name;
  const avatarUrl = isDM && otherUser ? otherUser.avatarUrl : conversation?.avatarUrl;
  const subtitle = isDM && otherUser ? (otherUser.bio || otherUser.status || otherUser.email) : `${conversation?.members?.length || 0} members`;
  const totalMedia = (mediaCounts?.media || 0) + (mediaCounts?.docs || 0) + (mediaCounts?.links || 0);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Chat Info</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Profile Section */}
        <View style={styles.profileSection}>
          <View style={styles.avatarContainer}>
            {avatarUrl ? (
              <Image source={{ uri: getFullUrl(avatarUrl) }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder, { backgroundColor: colors.primary + '30' }]}>
                <Text style={{ fontSize: 32, color: colors.primary }}>
                  {displayName?.[0]?.toUpperCase() || '?'}
                </Text>
              </View>
            )}
            {isDM && otherUser?.isOnline && <View style={styles.onlineDot} />}
          </View>
          <Text style={[styles.profileName, { color: colors.text }]}>{displayName}</Text>
          <Text style={[styles.profileSubtitle, { color: colors.textSecondary }]}>{subtitle}</Text>
          {isDM && otherUser?.lastSeenAt && !otherUser?.isOnline && (
            <Text style={[styles.lastSeen, { color: colors.textSecondary }]}>
              Last seen {new Date(otherUser.lastSeenAt).toLocaleString()}
            </Text>
          )}
        </View>

        {/* Settings Sections */}
        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <SettingItem
            icon="heart-outline"
            label="Add to Favorites"
            colors={colors}
            trailing={
              <Switch
                value={settings.isFavorite}
                onValueChange={(v) => updateSetting('isFavorite', v)}
                trackColor={{ false: '#ccc', true: colors.primary + '80' }}
                thumbColor={settings.isFavorite ? colors.primary : '#f4f3f4'}
              />
            }
          />
          <SettingItem
            icon={settings.isMuted ? 'notifications-off-outline' : 'notifications-outline'}
            label="Mute Notifications"
            subtitle={settings.isMuted
              ? (settings.muteUntil
                ? `Until ${new Date(settings.muteUntil).toLocaleDateString()}`
                : 'Always')
              : undefined}
            colors={colors}
            onPress={() => {
              if (settings.isMuted) {
                updateSetting('isMuted', false);
                updateSetting('muteUntil', null);
                setShowMuteOptions(false);
              } else {
                setShowMuteOptions(true);
              }
            }}
            trailing={
              <Switch
                value={settings.isMuted}
                onValueChange={(v) => {
                  if (!v) {
                    updateSetting('isMuted', false);
                    updateSetting('muteUntil', null);
                    setShowMuteOptions(false);
                  } else {
                    setShowMuteOptions(true);
                  }
                }}
                trackColor={{ false: '#ccc', true: colors.primary + '80' }}
                thumbColor={settings.isMuted ? colors.primary : '#f4f3f4'}
              />
            }
          />
          {showMuteOptions && (
            <View style={{ marginLeft: 40, marginBottom: 8, gap: 2 }}>
              {[
                { label: '1 hour', hours: 1 },
                { label: '8 hours', hours: 8 },
                { label: '1 day', hours: 24 },
                { label: '1 week', hours: 168 },
                { label: 'Always', hours: 0 },
              ].map((opt) => (
                <TouchableOpacity
                  key={opt.label}
                  onPress={() => {
                    const muteUntil = opt.hours > 0
                      ? new Date(Date.now() + opt.hours * 60 * 60 * 1000).toISOString()
                      : null;
                    updateSetting('isMuted', true);
                    updateSetting('muteUntil', muteUntil);
                    setShowMuteOptions(false);
                  }}
                  style={{
                    paddingVertical: 10,
                    paddingHorizontal: 16,
                    borderRadius: 8,
                    backgroundColor: settings.isMuted && (
                      (opt.hours === 0 && !settings.muteUntil) ||
                      (opt.hours > 0 && settings.muteUntil)
                    ) ? colors.primary + '15' : 'transparent',
                  }}
                >
                  <Text style={{
                    fontSize: 14,
                    color: settings.isMuted && (
                      (opt.hours === 0 && !settings.muteUntil) ||
                      (opt.hours > 0 && settings.muteUntil)
                    ) ? colors.primary : colors.text,
                  }}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          <SettingItem
            icon="language-outline"
            label="Auto-Translate"
            subtitle={settings.autoTranslate ? `To ${settings.translateLang || 'English'}` : 'Off'}
            colors={colors}
            onPress={() => setShowTranslateSettings(true)}
          />
        </View>

        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <SettingItem
            icon="time-outline"
            label="Disappearing Messages"
            subtitle={conversation?.disappearingSeconds ? formatDuration(conversation.disappearingSeconds) : 'Off'}
            colors={colors}
            onPress={() => setShowDisappearing(true)}
          />
          <SettingItem
            icon="lock-closed-outline"
            label="Lock Chat"
            subtitle="Lock and hide this chat"
            colors={colors}
            trailing={
              <Switch
                value={settings.isLocked}
                onValueChange={(v) => {
                  if (v) {
                    // Start PIN set flow
                    setLockStep('set');
                    setLockPinTemp('');
                    setLockError(null);
                    setShowLockModal(true);
                  } else {
                    // Unlock — remove PIN and disable lock
                    SecureStore.deleteItemAsync(`chat_lock_${conversationId}`).catch(() => {});
                    updateSetting('isLocked', false);
                  }
                }}
                trackColor={{ false: '#ccc', true: colors.primary + '80' }}
                thumbColor={settings.isLocked ? colors.primary : '#f4f3f4'}
              />
            }
          />
          <SettingItem
            icon="color-palette-outline"
            label="Chat Wallpaper"
            subtitle={settings.wallpaper ? 'Custom' : 'Default'}
            colors={colors}
            onPress={() => {
              Alert.alert('Chat Wallpaper', 'Choose a wallpaper color', [
                { text: 'Default', onPress: () => updateSetting('wallpaper', null) },
                { text: 'Light Blue', onPress: () => updateSetting('wallpaper', '#E0F2FE') },
                { text: 'Light Green', onPress: () => updateSetting('wallpaper', '#DCFCE7') },
                { text: 'Light Purple', onPress: () => updateSetting('wallpaper', '#F3E8FF') },
                { text: 'Light Pink', onPress: () => updateSetting('wallpaper', '#FCE7F3') },
                { text: 'Cancel', style: 'cancel' },
              ]);
            }}
          />
          <SettingItem
            icon="eye-off-outline"
            label="One-time Media"
            subtitle={settings.oneTimeMedia ? 'Enabled' : 'Disabled'}
            colors={colors}
            trailing={
              <Switch
                value={settings.oneTimeMedia}
                onValueChange={(v) => updateSetting('oneTimeMedia', v)}
                trackColor={{ false: '#ccc', true: colors.primary + '80' }}
                thumbColor={settings.oneTimeMedia ? colors.primary : '#f4f3f4'}
              />
            }
          />
          <SettingItem
            icon="shield-checkmark-outline"
            label="End-to-End Encryption"
            subtitle={conversation?.isE2EE ? 'Messages are end-to-end encrypted' : 'Messages are encrypted in transit'}
            colors={colors}
            trailing={
              <Switch
                value={!!conversation?.isE2EE}
                onValueChange={async (val) => {
                  try {
                    if (val) {
                      await api.enableE2EE(conversationId);
                    } else {
                      await api.disableE2EE(conversationId);
                    }
                    setChatInfo((prev: any) => ({
                      ...prev,
                      conversation: { ...prev.conversation, isE2EE: val },
                    }));
                  } catch (err: any) {
                    Alert.alert('Error', err?.response?.data?.error || 'Failed to toggle E2EE');
                  }
                }}
                trackColor={{ false: '#ccc', true: colors.primary + '60' }}
                thumbColor={conversation?.isE2EE ? colors.primary : '#f4f3f4'}
              />
            }
          />
        </View>

        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <SettingItem
            icon="images-outline"
            label="Media, Links & Docs"
            subtitle={`${totalMedia} items`}
            colors={colors}
            onPress={() => {}}
          />
          <SettingItem
            icon="star-outline"
            label="Starred Messages"
            subtitle={starredCount > 0 ? `${starredCount} messages` : 'None'}
            colors={colors}
            onPress={() => {}}
          />
        </View>

        {/* Groups in Common */}
        {isDM && commonGroups && commonGroups.length > 0 && (
          <View style={[styles.section, { backgroundColor: colors.card }]}>
            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
              {commonGroups.length} Group{commonGroups.length !== 1 ? 's' : ''} in Common
            </Text>
            {commonGroups.map((group: any) => (
              <TouchableOpacity
                key={group.id}
                style={styles.groupRow}
                onPress={() => navigation.navigate('Chat', { conversationId: group.id, name: group.name })}
              >
                <View style={[styles.groupAvatar, { backgroundColor: colors.primary + '30' }]}>
                  <Ionicons name="people" size={18} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.groupName, { color: colors.text }]}>{group.name}</Text>
                  <Text style={[styles.groupMembers, { color: colors.textSecondary }]} numberOfLines={1}>
                    {group.members?.map((m: any) => m.user.displayName).join(', ')}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Actions */}
        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <SettingItem
            icon="download-outline"
            label="Export Chat"
            colors={colors}
            onPress={handleExport}
          />
          <SettingItem
            icon="trash-outline"
            label="Clear Chat"
            colors={colors}
            labelColor="#ef4444"
            onPress={handleClearChat}
          />
        </View>

        {isDM && otherUser && (
          <View style={[styles.section, { backgroundColor: colors.card }]}>
            <SettingItem
              icon="ban-outline"
              label={isBlocked ? 'Unblock Contact' : 'Block Contact'}
              colors={colors}
              labelColor="#ef4444"
              onPress={handleBlock}
            />
            <SettingItem
              icon="flag-outline"
              label="Report Contact"
              colors={colors}
              labelColor="#ef4444"
              onPress={() => setShowReport(true)}
            />
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Lock Chat PIN Modal */}
      <ChatLockModal
        visible={showLockModal}
        mode={lockStep}
        error={lockError}
        onCancel={() => setShowLockModal(false)}
        onSubmit={async (pin) => {
          if (lockStep === 'set') {
            setLockPinTemp(pin);
            setLockStep('confirm');
            setLockError(null);
          } else {
            // confirm step
            if (pin !== lockPinTemp) {
              setLockError('PINs do not match. Try again.');
              setLockStep('set');
              setLockPinTemp('');
            } else {
              // Save PIN and enable lock
              try {
                await SecureStore.setItemAsync(`chat_lock_${conversationId}`, pin);
                await updateSetting('isLocked', true);
                setShowLockModal(false);
              } catch (err) {
                setLockError('Failed to save PIN.');
              }
            }
          }
        }}
      />

      {/* Disappearing Messages Modal */}
      <Modal visible={showDisappearing} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Disappearing Messages</Text>
            <Text style={[styles.modalDesc, { color: colors.textSecondary }]}>
              New messages will disappear after the selected time.
            </Text>
            {[
              { label: 'Off', value: null },
              { label: '24 Hours', value: 86400 },
              { label: '7 Days', value: 604800 },
              { label: '90 Days', value: 7776000 },
            ].map(opt => (
              <TouchableOpacity
                key={opt.label}
                style={[
                  styles.modalOption,
                  conversation?.disappearingSeconds === opt.value && { backgroundColor: colors.primary + '20' },
                ]}
                onPress={() => handleDisappearing(opt.value)}
              >
                <Text style={[
                  styles.modalOptionText,
                  { color: conversation?.disappearingSeconds === opt.value ? colors.primary : colors.text },
                ]}>
                  {opt.label}
                </Text>
                {conversation?.disappearingSeconds === opt.value && (
                  <Ionicons name="checkmark" size={20} color={colors.primary} />
                )}
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.modalCancel} onPress={() => setShowDisappearing(false)}>
              <Text style={{ color: colors.primary, fontWeight: '600' }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Auto-Translate Settings Modal */}
      <Modal visible={showTranslateSettings} animationType="slide">
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <TouchableOpacity onPress={() => setShowTranslateSettings(false)} style={{ marginRight: 12 }}>
              <Ionicons name="arrow-back" size={24} color={colors.text} />
            </TouchableOpacity>
            <Ionicons name="language-outline" size={20} color={colors.primary} style={{ marginRight: 8 }} />
            <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text }}>Auto-Translate</Text>
          </View>
          <ScrollView style={{ flex: 1, padding: 16 }}>
            {/* Master Toggle */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.card, borderRadius: 12, padding: 16, marginBottom: 20 }}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text }}>Enable Auto-Translate</Text>
                <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>
                  {settings.autoTranslate ? 'Translation is active' : 'Translation is off'}
                </Text>
              </View>
              <Switch
                value={settings.autoTranslate}
                onValueChange={(v) => {
                  updateSetting('autoTranslate', v);
                  if (v && !settings.translateLang) updateSetting('translateLang', 'English');
                }}
                trackColor={{ false: '#ccc', true: colors.primary + '80' }}
                thumbColor={settings.autoTranslate ? colors.primary : '#f4f3f4'}
              />
            </View>

            {settings.autoTranslate && (
              <>
                {/* Show messages in */}
                <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase', marginBottom: 8 }}>
                  Show me all messages in
                </Text>
                <TouchableOpacity
                  style={{ backgroundColor: colors.card, borderRadius: 12, padding: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}
                  onPress={() => setShowLangPicker({ field: 'translateLang', title: 'Show Messages In' })}
                >
                  <Text style={{ fontSize: 15, color: colors.text }}>{settings.translateLang || 'English'}</Text>
                  <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                </TouchableOpacity>
                <Text style={{ fontSize: 11, color: colors.textSecondary, marginBottom: 20 }}>
                  Incoming messages will be translated to this language
                </Text>

                {/* Translate my messages */}
                <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 16, marginBottom: 8 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase', marginBottom: 4 }}>
                    Translate my messages (optional)
                  </Text>
                  <Text style={{ fontSize: 11, color: colors.textSecondary, marginBottom: 12 }}>
                    If enabled, your outgoing messages will be translated before sending.
                  </Text>
                </View>

                <Text style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 4 }}>From</Text>
                <TouchableOpacity
                  style={{ backgroundColor: colors.card, borderRadius: 12, padding: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}
                  onPress={() => setShowLangPicker({ field: 'translateMyFrom', title: 'Translate From', includeAll: true, includeNone: true })}
                >
                  <Text style={{ fontSize: 15, color: settings.translateMyFrom ? colors.text : colors.textSecondary }}>
                    {settings.translateMyFrom === 'all' ? 'All Languages (auto-detect)' : settings.translateMyFrom || "Don't translate my messages"}
                  </Text>
                  <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                </TouchableOpacity>

                {settings.translateMyFrom && (
                  <>
                    <Text style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 4 }}>To</Text>
                    <TouchableOpacity
                      style={{ backgroundColor: colors.card, borderRadius: 12, padding: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}
                      onPress={() => setShowLangPicker({ field: 'translateMyTo', title: 'Translate To' })}
                    >
                      <Text style={{ fontSize: 15, color: settings.translateMyTo ? colors.text : colors.textSecondary }}>
                        {settings.translateMyTo || 'Select language...'}
                      </Text>
                      <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                    </TouchableOpacity>
                  </>
                )}
              </>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Language Picker Modal */}
      <Modal visible={!!showLangPicker} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card, maxHeight: '70%' }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>{showLangPicker?.title}</Text>
            <ScrollView style={{ maxHeight: 400 }}>
              {showLangPicker?.includeNone && (
                <TouchableOpacity
                  style={[styles.modalOption, !settings[showLangPicker.field] && { backgroundColor: colors.primary + '20' }]}
                  onPress={() => { updateSetting(showLangPicker!.field, null); setShowLangPicker(null); }}
                >
                  <Text style={{ color: !settings[showLangPicker.field] ? colors.primary : colors.text }}>
                    Don't translate my messages
                  </Text>
                  {!settings[showLangPicker.field] && <Ionicons name="checkmark" size={20} color={colors.primary} />}
                </TouchableOpacity>
              )}
              {showLangPicker?.includeAll && (
                <TouchableOpacity
                  style={[styles.modalOption, settings[showLangPicker.field] === 'all' && { backgroundColor: colors.primary + '20' }]}
                  onPress={() => { updateSetting(showLangPicker!.field, 'all'); setShowLangPicker(null); }}
                >
                  <Text style={{ color: settings[showLangPicker.field] === 'all' ? colors.primary : colors.text }}>
                    All Languages (auto-detect)
                  </Text>
                  {settings[showLangPicker.field] === 'all' && <Ionicons name="checkmark" size={20} color={colors.primary} />}
                </TouchableOpacity>
              )}
              {['English', 'Spanish', 'French', 'German', 'Italian', 'Portuguese', 'Russian',
                'Chinese', 'Japanese', 'Korean', 'Arabic', 'Hindi', 'Turkish', 'Dutch',
                'Swedish', 'Polish', 'Thai', 'Vietnamese', 'Indonesian', 'Malay', 'Filipino',
                'Hebrew', 'Czech', 'Romanian', 'Hungarian', 'Greek', 'Danish', 'Finnish',
                'Norwegian', 'Ukrainian', 'Persian', 'Bengali', 'Urdu', 'Swahili'].map(lang => {
                const isActive = showLangPicker && settings[showLangPicker.field] === lang;
                return (
                  <TouchableOpacity
                    key={lang}
                    style={[styles.modalOption, isActive && { backgroundColor: colors.primary + '20' }]}
                    onPress={() => { updateSetting(showLangPicker!.field, lang); setShowLangPicker(null); }}
                  >
                    <Text style={{ color: isActive ? colors.primary : colors.text }}>{lang}</Text>
                    {isActive && <Ionicons name="checkmark" size={20} color={colors.primary} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity style={styles.modalCancel} onPress={() => setShowLangPicker(null)}>
              <Text style={{ color: colors.primary, fontWeight: '600' }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Report Modal */}
      <Modal visible={showReport} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Report Contact</Text>
            {['Spam', 'Harassment', 'Inappropriate Content', 'Impersonation', 'Other'].map(reason => (
              <TouchableOpacity
                key={reason}
                style={[
                  styles.modalOption,
                  reportReason === reason.toLowerCase() && { backgroundColor: colors.primary + '20' },
                ]}
                onPress={() => setReportReason(reason.toLowerCase())}
              >
                <Text style={{ color: reportReason === reason.toLowerCase() ? colors.primary : colors.text }}>
                  {reason}
                </Text>
              </TouchableOpacity>
            ))}
            <TextInput
              placeholder="Additional details (optional)"
              placeholderTextColor={colors.textSecondary}
              value={reportDetails}
              onChangeText={setReportDetails}
              style={[styles.reportInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              multiline
            />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity
                style={[styles.reportBtn, { backgroundColor: colors.background }]}
                onPress={() => { setShowReport(false); setReportReason(''); setReportDetails(''); }}
              >
                <Text style={{ color: colors.text }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.reportBtn, { backgroundColor: '#ef4444', opacity: reportReason ? 1 : 0.5 }]}
                onPress={handleReport}
                disabled={!reportReason}
              >
                <Text style={{ color: '#fff', fontWeight: '600' }}>Submit</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ============================================
// Helper Components
// ============================================

function SettingItem({
  icon, label, subtitle, trailing, onPress, colors, labelColor,
}: {
  icon: string;
  label: string;
  subtitle?: string;
  trailing?: React.ReactNode;
  onPress?: () => void;
  colors: any;
  labelColor?: string;
}) {
  return (
    <TouchableOpacity
      style={styles.settingItem}
      onPress={onPress}
      disabled={!onPress && !trailing}
      activeOpacity={0.7}
    >
      <View style={styles.settingIcon}>
        <Ionicons name={icon as any} size={20} color={labelColor || colors.textSecondary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.settingLabel, { color: labelColor || colors.text }]}>{label}</Text>
        {subtitle && <Text style={[styles.settingSubtitle, { color: colors.textSecondary }]}>{subtitle}</Text>}
      </View>
      {trailing || (onPress && <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />)}
    </TouchableOpacity>
  );
}

function formatDuration(seconds: number): string {
  if (seconds < 3600) return `${Math.round(seconds / 60)} minutes`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} hours`;
  if (seconds < 604800) return `${Math.round(seconds / 86400)} days`;
  return `${Math.round(seconds / 604800)} weeks`;
}

// ============================================
// Styles
// ============================================

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: 1,
  },
  backBtn: { width: 40, alignItems: 'flex-start' },
  headerTitle: { fontSize: 17, fontWeight: '600' },
  scroll: { flex: 1 },
  profileSection: { alignItems: 'center', paddingVertical: 24 },
  avatarContainer: { position: 'relative', marginBottom: 12 },
  avatar: { width: 80, height: 80, borderRadius: 40 },
  avatarPlaceholder: { justifyContent: 'center', alignItems: 'center' },
  onlineDot: {
    position: 'absolute', bottom: 2, right: 2,
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: '#22c55e', borderWidth: 3, borderColor: '#fff',
  },
  profileName: { fontSize: 20, fontWeight: '700' },
  profileSubtitle: { fontSize: 14, marginTop: 4, textAlign: 'center', paddingHorizontal: 32 },
  lastSeen: { fontSize: 12, marginTop: 4 },
  section: { marginTop: 8, marginHorizontal: 0, borderRadius: 0 },
  sectionTitle: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  settingItem: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16,
    paddingVertical: 14, gap: 12,
  },
  settingIcon: { width: 28, alignItems: 'center' },
  settingLabel: { fontSize: 15 },
  settingSubtitle: { fontSize: 12, marginTop: 1 },
  groupRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 12 },
  groupAvatar: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  groupName: { fontSize: 14, fontWeight: '600' },
  groupMembers: { fontSize: 12, marginTop: 1 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { width: '85%', borderRadius: 16, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  modalDesc: { fontSize: 13, marginBottom: 16 },
  modalOption: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 14, paddingHorizontal: 16, borderRadius: 10, marginBottom: 4,
  },
  modalOptionText: { fontSize: 15 },
  modalCancel: { alignItems: 'center', paddingVertical: 14, marginTop: 8 },
  reportInput: {
    borderWidth: 1, borderRadius: 10, padding: 12,
    fontSize: 14, minHeight: 80, textAlignVertical: 'top',
    marginVertical: 12,
  },
  reportBtn: {
    flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 10,
  },
});
