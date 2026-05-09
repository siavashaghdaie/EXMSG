import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  Image,
  Switch,
  SafeAreaView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { api } from '@/services/api';
import { useAuthStore } from '@/store/authStore';
import { useSettingsStore } from '@/store/settingsStore';
import { getFullUrl } from '@/utils/url';
import OrgOnboardingModal from './OrgOnboardingModal';

const PRIMARY = '#6C47FF';
const DANGER = '#E53935';
const APP_VERSION = '1.0.0';
const TEXT_PRIMARY = '#1a1a1a';
const TEXT_SECONDARY = '#666';
const SECTION_BG = '#f5f5f5';
const BORDER = '#e0e0e0';

type ThemeMode = 'light' | 'dark' | 'system';

const THEME_COLORS = {
  light: {
    bg: '#FFFFFF',
    sectionBg: '#f5f5f5',
    border: '#e0e0e0',
    textPrimary: '#1a1a1a',
    textSecondary: '#666',
    inputBg: '#fff',
    cardBg: '#fff',
  },
  dark: {
    bg: '#0F172A',
    sectionBg: '#1E293B',
    border: '#334155',
    textPrimary: '#F1F5F9',
    textSecondary: '#94A3B8',
    inputBg: '#1E293B',
    cardBg: '#1E293B',
  },
};

export default function SettingsScreen() {
  const { user, logout: authLogout, updateUser } = useAuthStore();
  const {
    themeMode,
    effectiveTheme,
    notificationsEnabled,
    soundEnabled,
    vibrationEnabled,
    setThemeMode,
    setNotificationsEnabled,
    setSoundEnabled,
    setVibrationEnabled,
  } = useSettingsStore();

  const isDark = effectiveTheme === 'dark';
  const C = THEME_COLORS[isDark ? 'dark' : 'light'];

  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [bio, setBio] = useState(user?.bio ?? '');
  const [status, setStatus] = useState(user?.status ?? '');
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Privacy settings (synced with backend)
  const [readReceiptsEnabled, setReadReceiptsEnabled] = useState(true);
  const [lastSeenPrivacy, setLastSeenPrivacy] = useState<'everyone' | 'contacts' | 'nobody'>('everyone');
  const [privacyLoading, setPrivacyLoading] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName ?? '');
      setBio(user.bio ?? '');
      setStatus(user.status ?? '');
    }
  }, [user]);

  const showFeedback = useCallback((type: 'success' | 'error', message: string) => {
    if (type === 'success') {
      setSuccessMessage(message);
      setErrorMessage('');
      setTimeout(() => setSuccessMessage(''), 3000);
    } else {
      setErrorMessage(message);
      setSuccessMessage('');
      setTimeout(() => setErrorMessage(''), 5000);
    }
  }, []);

  // Load privacy settings from backend on mount
  useEffect(() => {
    (async () => {
      try {
        const settings = await api.getPrivacySettings();
        setReadReceiptsEnabled(settings.readReceiptsEnabled);
        setLastSeenPrivacy(settings.lastSeenPrivacy as 'everyone' | 'contacts' | 'nobody');
      } catch {}
    })();
  }, []);

  const handlePrivacyUpdate = useCallback(async (field: 'readReceiptsEnabled' | 'lastSeenPrivacy', value: boolean | string) => {
    setPrivacyLoading(true);
    try {
      const updated = await api.updatePrivacySettings({ [field]: value });
      setReadReceiptsEnabled(updated.readReceiptsEnabled);
      setLastSeenPrivacy(updated.lastSeenPrivacy as 'everyone' | 'contacts' | 'nobody');
      showFeedback('success', 'Privacy settings updated');
    } catch {
      showFeedback('error', 'Failed to update privacy settings');
    } finally {
      setPrivacyLoading(false);
    }
  }, [showFeedback]);

  const handleSaveProfile = useCallback(async () => {
    setSaving(true);
    setErrorMessage('');
    setSuccessMessage('');
    try {
      const updates: { displayName?: string; bio?: string; status?: string } = {};
      if (displayName !== (user?.displayName ?? '')) updates.displayName = displayName;
      if (bio !== (user?.bio ?? '')) updates.bio = bio;
      if (status !== (user?.status ?? '')) updates.status = status;

      if (Object.keys(updates).length === 0) {
        showFeedback('success', 'No changes to save');
        setSaving(false);
        return;
      }

      const updated = await api.updateProfile(updates);
      updateUser(updated);
      showFeedback('success', 'Profile updated successfully');
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || 'Failed to update profile';
      showFeedback('error', msg);
    } finally {
      setSaving(false);
    }
  }, [displayName, bio, status, user, updateUser, showFeedback]);

  const handlePickAvatar = useCallback(async () => {
    try {
      const { status: permStatus } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (permStatus !== 'granted') {
        Alert.alert('Permission Required', 'Please allow access to your photo library to change your avatar.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      const uri = asset.uri;
      const fileName = uri.split('/').pop() || 'avatar.jpg';
      const fileType = asset.mimeType || 'image/jpeg';

      setUploadingAvatar(true);
      setErrorMessage('');

      const response = await api.uploadAvatar({ uri, name: fileName, type: fileType });
      updateUser({ avatarUrl: response.avatarUrl, avatar: response.avatarUrl });
      showFeedback('success', 'Avatar updated');
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || 'Failed to upload avatar';
      showFeedback('error', msg);
    } finally {
      setUploadingAvatar(false);
    }
  }, [updateUser, showFeedback]);

  const handleLogout = useCallback(() => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            try {
              await authLogout();
            } catch {
              // logout clears state even on error
            }
          },
        },
      ],
    );
  }, [authLogout]);

  const avatarUrl = getFullUrl(user?.avatarUrl || user?.avatar);
  const initials = (user?.displayName || user?.username || user?.email || '?')[0].toUpperCase();

  const hasChanges =
    displayName !== (user?.displayName ?? '') ||
    bio !== (user?.bio ?? '') ||
    status !== (user?.status ?? '');

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: C.bg }]}>
      <ScrollView
        style={[styles.container, { backgroundColor: C.bg }]}
        contentContainerStyle={styles.contentContainer}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <Text style={[styles.screenTitle, { color: C.textPrimary }]}>Settings</Text>

        {/* Feedback messages */}
        {!!successMessage && (
          <View style={styles.successBanner}>
            <Text style={styles.successText}>{successMessage}</Text>
          </View>
        )}
        {!!errorMessage && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        )}

        {/* Profile Section */}
        <View style={[styles.section, { backgroundColor: C.sectionBg }]}>
          <Text style={[styles.sectionTitle, { color: C.textPrimary }]}>Profile</Text>
          <View style={[styles.sectionContent, { backgroundColor: C.cardBg, borderColor: C.border }]}>
            {/* Avatar */}
            <View style={styles.avatarRow}>
              <TouchableOpacity
                style={styles.avatarContainer}
                onPress={handlePickAvatar}
                disabled={uploadingAvatar}
                activeOpacity={0.7}
              >
                {avatarUrl ? (
                  <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
                ) : (
                  <View style={styles.avatarPlaceholder}>
                    <Text style={styles.avatarInitial}>{initials}</Text>
                  </View>
                )}
                <View style={styles.cameraOverlay}>
                  {uploadingAvatar ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.cameraEmoji}>📷</Text>
                  )}
                </View>
              </TouchableOpacity>

              <View style={styles.avatarInfo}>
                <Text style={[styles.usernameText, { color: C.textPrimary }]}>@{user?.username || 'user'}</Text>
                <Text style={[styles.emailText, { color: C.textSecondary }]}>{user?.email || ''}</Text>
                {!!user?.orgRole && (
                  <View style={styles.roleBadge}>
                    <Text style={styles.roleBadgeText}>{user.orgRole}</Text>
                  </View>
                )}
              </View>
            </View>

            {/* Display Name */}
            <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>Display Name</Text>
            <TextInput
              style={[styles.textInput, { backgroundColor: C.inputBg, color: C.textPrimary, borderColor: C.border }]}
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Your display name"
              placeholderTextColor="#aaa"
              maxLength={50}
              autoCapitalize="words"
            />

            {/* Bio */}
            <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>Bio</Text>
            <TextInput
              style={[styles.textInput, styles.textArea, { backgroundColor: C.inputBg, color: C.textPrimary, borderColor: C.border }]}
              value={bio}
              onChangeText={setBio}
              placeholder="Tell us about yourself..."
              placeholderTextColor="#aaa"
              maxLength={200}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />

            {/* Status */}
            <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>Status</Text>
            <TextInput
              style={[styles.textInput, { backgroundColor: C.inputBg, color: C.textPrimary, borderColor: C.border }]}
              value={status}
              onChangeText={setStatus}
              placeholder="What are you up to?"
              placeholderTextColor="#aaa"
              maxLength={100}
            />

            {/* Save Button */}
            <TouchableOpacity
              style={[
                styles.saveButton,
                (!hasChanges || saving) && styles.saveButtonDisabled,
              ]}
              onPress={handleSaveProfile}
              disabled={!hasChanges || saving}
              activeOpacity={0.7}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.saveButtonText}>Save Changes</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Preferences Section */}
        <View style={[styles.section, { backgroundColor: C.sectionBg }]}>
          <Text style={[styles.sectionTitle, { color: C.textPrimary }]}>Preferences</Text>
          <View style={[styles.sectionContent, { backgroundColor: C.cardBg, borderColor: C.border }]}>
            {/* Theme Toggle */}
            <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>Theme</Text>
            <View style={[styles.segmentedControl, { backgroundColor: C.inputBg, borderColor: C.border }]}>
              {(['light', 'dark', 'system'] as ThemeMode[]).map((mode) => (
                <TouchableOpacity
                  key={mode}
                  style={[
                    styles.segmentButton,
                    themeMode === mode && styles.segmentButtonActive,
                  ]}
                  onPress={() => setThemeMode(mode)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.segmentButtonText,
                      themeMode === mode && styles.segmentButtonTextActive,
                    ]}
                  >
                    {mode === 'light' ? '☀️ Light' : mode === 'dark' ? '🌙 Dark' : '⚙️ System'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Notification Switches */}
            <View style={styles.switchRow}>
              <View style={styles.switchInfo}>
                <Text style={[styles.switchLabel, { color: C.textPrimary }]}>Notifications</Text>
                <Text style={[styles.switchDescription, { color: C.textSecondary }]}>Receive push notifications</Text>
              </View>
              <Switch
                value={notificationsEnabled}
                onValueChange={setNotificationsEnabled}
                trackColor={{ false: '#ccc', true: `${PRIMARY}80` }}
                thumbColor={notificationsEnabled ? PRIMARY : '#f4f3f4'}
                ios_backgroundColor="#ccc"
              />
            </View>

            <View style={[styles.divider, { backgroundColor: C.border }]} />

            <View style={styles.switchRow}>
              <View style={styles.switchInfo}>
                <Text style={[styles.switchLabel, { color: C.textPrimary }]}>Sound</Text>
                <Text style={[styles.switchDescription, { color: C.textSecondary }]}>Play notification sounds</Text>
              </View>
              <Switch
                value={soundEnabled}
                onValueChange={setSoundEnabled}
                trackColor={{ false: '#ccc', true: `${PRIMARY}80` }}
                thumbColor={soundEnabled ? PRIMARY : '#f4f3f4'}
                ios_backgroundColor="#ccc"
              />
            </View>

            <View style={[styles.divider, { backgroundColor: C.border }]} />

            <View style={styles.switchRow}>
              <View style={styles.switchInfo}>
                <Text style={[styles.switchLabel, { color: C.textPrimary }]}>Vibration</Text>
                <Text style={[styles.switchDescription, { color: C.textSecondary }]}>Vibrate on notifications</Text>
              </View>
              <Switch
                value={vibrationEnabled}
                onValueChange={setVibrationEnabled}
                trackColor={{ false: '#ccc', true: `${PRIMARY}80` }}
                thumbColor={vibrationEnabled ? PRIMARY : '#f4f3f4'}
                ios_backgroundColor="#ccc"
              />
            </View>
          </View>
        </View>

        {/* Privacy Section */}
        <View style={[styles.section, { backgroundColor: C.sectionBg }]}>
          <Text style={[styles.sectionTitle, { color: C.textPrimary }]}>Privacy</Text>
          <View style={[styles.sectionContent, { backgroundColor: C.cardBg, borderColor: C.border }]}>
            <View style={styles.switchRow}>
              <View style={styles.switchInfo}>
                <Text style={[styles.switchLabel, { color: C.textPrimary }]}>Read Receipts</Text>
                <Text style={[styles.switchDescription, { color: C.textSecondary }]}>Let others know when you've read their messages</Text>
              </View>
              <Switch
                value={readReceiptsEnabled}
                onValueChange={(v) => {
                  setReadReceiptsEnabled(v);
                  handlePrivacyUpdate('readReceiptsEnabled', v);
                }}
                disabled={privacyLoading}
                trackColor={{ false: '#ccc', true: `${PRIMARY}80` }}
                thumbColor={readReceiptsEnabled ? PRIMARY : '#f4f3f4'}
                ios_backgroundColor="#ccc"
              />
            </View>

            <View style={[styles.divider, { backgroundColor: C.border }]} />

            <View style={{ paddingVertical: 8 }}>
              <Text style={[styles.switchLabel, { color: C.textPrimary, marginBottom: 4 }]}>Last Seen</Text>
              <Text style={[styles.switchDescription, { color: C.textSecondary, marginBottom: 10 }]}>Who can see when you were last active</Text>
              <View style={[styles.segmentedControl, { backgroundColor: C.inputBg, borderColor: C.border }]}>
                {(['everyone', 'contacts', 'nobody'] as const).map((opt) => (
                  <TouchableOpacity
                    key={opt}
                    style={[
                      styles.segmentButton,
                      lastSeenPrivacy === opt && styles.segmentButtonActive,
                    ]}
                    onPress={() => {
                      setLastSeenPrivacy(opt);
                      handlePrivacyUpdate('lastSeenPrivacy', opt);
                    }}
                    disabled={privacyLoading}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.segmentButtonText,
                        lastSeenPrivacy === opt && styles.segmentButtonTextActive,
                      ]}
                    >
                      {opt.charAt(0).toUpperCase() + opt.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        </View>

        {/* Organization Setup (admin only) */}
        {(user?.orgRole === 'OWNER' || user?.orgRole === 'ADMIN' || (user as any)?.role === 'SUPER_ADMIN') && (
          <View style={[styles.section, { backgroundColor: C.sectionBg }]}>
            <Text style={[styles.sectionTitle, { color: C.textPrimary }]}>Organization</Text>
            <View style={[styles.sectionContent, { backgroundColor: C.cardBg, borderColor: C.border }]}>
              <TouchableOpacity
                style={[styles.saveButton, { backgroundColor: PRIMARY }]}
                onPress={() => setShowOnboarding(true)}
                activeOpacity={0.7}
              >
                <Text style={styles.saveButtonText}>Organization Setup Wizard</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Account Section */}
        <View style={[styles.section, { backgroundColor: C.sectionBg }]}>
          <Text style={[styles.sectionTitle, { color: C.textPrimary }]}>Account</Text>
          <View style={[styles.sectionContent, { backgroundColor: C.cardBg, borderColor: C.border }]}>
            <TouchableOpacity
              style={styles.logoutButton}
              onPress={handleLogout}
              activeOpacity={0.7}
            >
              <Text style={styles.logoutButtonText}>Sign Out</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* App Version */}
        <Text style={[styles.versionText, { color: C.textSecondary }]}>Exclusive Messenger v{APP_VERSION}</Text>

        <View style={{ height: 40 }} />
      </ScrollView>

      <OrgOnboardingModal
        visible={showOnboarding}
        onClose={() => setShowOnboarding(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fff',
  },
  container: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 48 : 16,
    paddingBottom: 40,
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: TEXT_PRIMARY,
    marginBottom: 16,
  },

  // Feedback banners
  successBanner: {
    backgroundColor: '#E8F5E9',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#4CAF50',
  },
  successText: {
    color: '#2E7D32',
    fontSize: 14,
    fontWeight: '500',
  },
  errorBanner: {
    backgroundColor: '#FFEBEE',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: DANGER,
  },
  errorText: {
    color: '#C62828',
    fontSize: 14,
    fontWeight: '500',
  },

  // Section
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: TEXT_SECONDARY,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
    paddingLeft: 4,
  },
  sectionContent: {
    backgroundColor: SECTION_BG,
    borderRadius: 14,
    padding: 16,
  },

  // Avatar
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  avatarContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    position: 'relative',
  },
  avatarImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  avatarPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: PRIMARY,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: {
    fontSize: 32,
    fontWeight: '700',
    color: '#fff',
  },
  cameraOverlay: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  cameraEmoji: {
    fontSize: 13,
  },
  avatarInfo: {
    marginLeft: 16,
    flex: 1,
  },
  usernameText: {
    fontSize: 16,
    fontWeight: '600',
    color: TEXT_PRIMARY,
    marginBottom: 2,
  },
  emailText: {
    fontSize: 13,
    color: TEXT_SECONDARY,
    marginBottom: 6,
  },
  roleBadge: {
    alignSelf: 'flex-start',
    backgroundColor: `${PRIMARY}18`,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: `${PRIMARY}40`,
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: PRIMARY,
    letterSpacing: 0.5,
  },

  // Fields
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: TEXT_SECONDARY,
    marginBottom: 6,
    marginTop: 4,
  },
  textInput: {
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    fontSize: 15,
    color: TEXT_PRIMARY,
    marginBottom: 12,
  },
  textArea: {
    minHeight: 72,
    paddingTop: 12,
  },

  // Save
  saveButton: {
    backgroundColor: PRIMARY,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },

  // Segmented Control
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: 'hidden',
    marginBottom: 16,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentButtonActive: {
    backgroundColor: PRIMARY,
  },
  segmentButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: TEXT_SECONDARY,
  },
  segmentButtonTextActive: {
    color: '#fff',
  },

  // Switches
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  switchInfo: {
    flex: 1,
    marginRight: 12,
  },
  switchLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: TEXT_PRIMARY,
  },
  switchDescription: {
    fontSize: 12,
    color: TEXT_SECONDARY,
    marginTop: 1,
  },
  divider: {
    height: 1,
    backgroundColor: BORDER,
    marginVertical: 4,
  },

  // Logout
  logoutButton: {
    backgroundColor: DANGER,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },

  // Version
  versionText: {
    textAlign: 'center',
    color: '#aaa',
    fontSize: 12,
    marginTop: 8,
  },
});
