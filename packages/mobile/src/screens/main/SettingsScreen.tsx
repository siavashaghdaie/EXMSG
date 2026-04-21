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

const PRIMARY = '#6C47FF';
const DANGER = '#E53935';
const SECTION_BG = '#f5f5f5';
const BORDER = '#e0e0e0';
const TEXT_PRIMARY = '#1a1a1a';
const TEXT_SECONDARY = '#666';
const APP_VERSION = '1.0.0';

type ThemeMode = 'light' | 'dark' | 'system';

export default function SettingsScreen() {
  const { user, logout: authLogout, updateUser } = useAuthStore();
  const {
    themeMode,
    notificationsEnabled,
    soundEnabled,
    vibrationEnabled,
    setThemeMode,
    setNotificationsEnabled,
    setSoundEnabled,
    setVibrationEnabled,
  } = useSettingsStore();

  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [bio, setBio] = useState(user?.bio ?? '');
  const [status, setStatus] = useState(user?.status ?? '');
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

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

  const avatarUrl = user?.avatarUrl || user?.avatar;
  const initials = (user?.displayName || user?.username || user?.email || '?')[0].toUpperCase();

  const hasChanges =
    displayName !== (user?.displayName ?? '') ||
    bio !== (user?.bio ?? '') ||
    status !== (user?.status ?? '');

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <Text style={styles.screenTitle}>Settings</Text>

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
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Profile</Text>
          <View style={styles.sectionContent}>
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
                <Text style={styles.usernameText}>@{user?.username || 'user'}</Text>
                <Text style={styles.emailText}>{user?.email || ''}</Text>
                {!!user?.orgRole && (
                  <View style={styles.roleBadge}>
                    <Text style={styles.roleBadgeText}>{user.orgRole}</Text>
                  </View>
                )}
              </View>
            </View>

            {/* Display Name */}
            <Text style={styles.fieldLabel}>Display Name</Text>
            <TextInput
              style={styles.textInput}
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Your display name"
              placeholderTextColor="#aaa"
              maxLength={50}
              autoCapitalize="words"
            />

            {/* Bio */}
            <Text style={styles.fieldLabel}>Bio</Text>
            <TextInput
              style={[styles.textInput, styles.textArea]}
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
            <Text style={styles.fieldLabel}>Status</Text>
            <TextInput
              style={styles.textInput}
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
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Preferences</Text>
          <View style={styles.sectionContent}>
            {/* Theme Toggle */}
            <Text style={styles.fieldLabel}>Theme</Text>
            <View style={styles.segmentedControl}>
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
                <Text style={styles.switchLabel}>Notifications</Text>
                <Text style={styles.switchDescription}>Receive push notifications</Text>
              </View>
              <Switch
                value={notificationsEnabled}
                onValueChange={setNotificationsEnabled}
                trackColor={{ false: '#ccc', true: `${PRIMARY}80` }}
                thumbColor={notificationsEnabled ? PRIMARY : '#f4f3f4'}
                ios_backgroundColor="#ccc"
              />
            </View>

            <View style={styles.divider} />

            <View style={styles.switchRow}>
              <View style={styles.switchInfo}>
                <Text style={styles.switchLabel}>Sound</Text>
                <Text style={styles.switchDescription}>Play notification sounds</Text>
              </View>
              <Switch
                value={soundEnabled}
                onValueChange={setSoundEnabled}
                trackColor={{ false: '#ccc', true: `${PRIMARY}80` }}
                thumbColor={soundEnabled ? PRIMARY : '#f4f3f4'}
                ios_backgroundColor="#ccc"
              />
            </View>

            <View style={styles.divider} />

            <View style={styles.switchRow}>
              <View style={styles.switchInfo}>
                <Text style={styles.switchLabel}>Vibration</Text>
                <Text style={styles.switchDescription}>Vibrate on notifications</Text>
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

        {/* Account Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <View style={styles.sectionContent}>
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
        <Text style={styles.versionText}>Exclusive Messenger v{APP_VERSION}</Text>

        <View style={{ height: 40 }} />
      </ScrollView>
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
