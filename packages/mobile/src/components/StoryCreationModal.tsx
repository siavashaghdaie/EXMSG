import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Image,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { api } from '@/services/api';

const COLORS = {
  primary: '#7C3AED',
  bg: '#FFFFFF',
  text: '#1E293B',
  secondary: '#64748B',
  muted: '#94A3B8',
  border: '#F1F5F9',
  inputBg: '#F1F5F9',
  white: '#FFFFFF',
};

const STORY_COLORS = [
  '#FF6B6B',
  '#4ECDC4',
  '#45B7D1',
  '#FFA07A',
  '#98D8C8',
  '#F7DC6F',
];

interface Props {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function StoryCreationModal({ visible, onClose, onSuccess }: Props) {
  const [activeTab, setActiveTab] = useState<'text' | 'photo'>('text');
  const [textContent, setTextContent] = useState('');
  const [selectedColor, setSelectedColor] = useState(STORY_COLORS[0]);
  const [selectedImage, setSelectedImage] = useState<{
    uri: string;
    fileName: string;
    mimeType: string;
  } | null>(null);
  const [photoCaption, setPhotoCaption] = useState('');
  const [loading, setLoading] = useState(false);

  const resetState = useCallback(() => {
    setTextContent('');
    setSelectedColor(STORY_COLORS[0]);
    setSelectedImage(null);
    setPhotoCaption('');
    setActiveTab('text');
  }, []);

  const handleClose = useCallback(() => {
    resetState();
    onClose();
  }, [onClose, resetState]);

  const handlePickImage = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Please grant access to your photo library.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        allowsEditing: true,
        aspect: [9, 16],
      });
      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        setSelectedImage({
          uri: asset.uri,
          fileName: asset.uri.split('/').pop() || 'photo.jpg',
          mimeType: asset.mimeType || 'image/jpeg',
        });
      }
    } catch (err) {
      console.error('[StoryCreation] Image picker error:', err);
    }
  }, []);

  const handleSubmit = useCallback(async () => {
    if (loading) return;

    if (activeTab === 'text') {
      if (!textContent.trim()) {
        Alert.alert('Empty Story', 'Please write something for your story.');
        return;
      }
      setLoading(true);
      try {
        await api.createTextStatus(textContent.trim(), selectedColor);
        handleClose();
        onSuccess?.();
      } catch (err: any) {
        console.error('[StoryCreation] Text story error:', err);
        Alert.alert('Error', 'Failed to create story. Please try again.');
      } finally {
        setLoading(false);
      }
    } else {
      if (!selectedImage) {
        Alert.alert('No Photo', 'Please select a photo for your story.');
        return;
      }
      setLoading(true);
      try {
        const file = {
          uri: selectedImage.uri,
          name: selectedImage.fileName,
          type: selectedImage.mimeType,
        };
        await api.createMediaStatus(file, photoCaption.trim() || undefined);
        handleClose();
        onSuccess?.();
      } catch (err: any) {
        console.error('[StoryCreation] Photo story error:', err);
        Alert.alert('Error', 'Failed to create story. Please try again.');
      } finally {
        setLoading(false);
      }
    }
  }, [activeTab, textContent, selectedColor, selectedImage, photoCaption, loading, handleClose, onSuccess]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={handleClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Add Story</Text>
            <TouchableOpacity onPress={handleSubmit} disabled={loading}>
              {loading ? (
                <ActivityIndicator size="small" color={COLORS.primary} />
              ) : (
                <Text style={styles.postText}>Post</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Tabs */}
          <View style={styles.tabs}>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'text' && styles.tabActive]}
              onPress={() => setActiveTab('text')}
            >
              <Text style={[styles.tabText, activeTab === 'text' && styles.tabTextActive]}>
                Text
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'photo' && styles.tabActive]}
              onPress={() => setActiveTab('photo')}
            >
              <Text style={[styles.tabText, activeTab === 'photo' && styles.tabTextActive]}>
                Photo
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content} contentContainerStyle={styles.contentInner}>
            {activeTab === 'text' ? (
              <>
                {/* Text Preview */}
                <View style={[styles.textPreview, { backgroundColor: selectedColor }]}>
                  <Text style={styles.textPreviewContent}>
                    {textContent || 'Your story text...'}
                  </Text>
                </View>

                {/* Text Input */}
                <TextInput
                  style={styles.textInput}
                  placeholder="Write your story..."
                  placeholderTextColor={COLORS.muted}
                  value={textContent}
                  onChangeText={setTextContent}
                  multiline
                  maxLength={500}
                  autoFocus
                />

                {/* Color Picker */}
                <Text style={styles.sectionLabel}>Background Color</Text>
                <View style={styles.colorPicker}>
                  {STORY_COLORS.map((color) => (
                    <TouchableOpacity
                      key={color}
                      style={[
                        styles.colorSwatch,
                        { backgroundColor: color },
                        selectedColor === color && styles.colorSwatchSelected,
                      ]}
                      onPress={() => setSelectedColor(color)}
                    />
                  ))}
                </View>
              </>
            ) : (
              <>
                {/* Photo selection */}
                {selectedImage ? (
                  <View style={styles.imagePreviewContainer}>
                    <Image source={{ uri: selectedImage.uri }} style={styles.imagePreview} />
                    <TouchableOpacity
                      style={styles.changeImageButton}
                      onPress={handlePickImage}
                    >
                      <Text style={styles.changeImageText}>Change Photo</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity style={styles.pickImageButton} onPress={handlePickImage}>
                    <Text style={styles.pickImageIcon}>{'\uD83D\uDCF7'}</Text>
                    <Text style={styles.pickImageText}>Choose Photo</Text>
                    <Text style={styles.pickImageSubtext}>Tap to select from library</Text>
                  </TouchableOpacity>
                )}

                {/* Caption */}
                <TextInput
                  style={styles.captionInput}
                  placeholder="Add a caption (optional)..."
                  placeholderTextColor={COLORS.muted}
                  value={photoCaption}
                  onChangeText={setPhotoCaption}
                  multiline
                  maxLength={200}
                />
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  flex: { flex: 1 },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  cancelText: {
    fontSize: 16,
    color: COLORS.secondary,
    width: 60,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
  },
  postText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.primary,
    width: 60,
    textAlign: 'right',
  },

  // Tabs
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: COLORS.primary,
  },
  tabText: {
    fontSize: 15,
    fontWeight: '500',
    color: COLORS.muted,
  },
  tabTextActive: {
    color: COLORS.primary,
    fontWeight: '600',
  },

  // Content
  content: {
    flex: 1,
  },
  contentInner: {
    padding: 16,
  },

  // Text story
  textPreview: {
    height: 200,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    marginBottom: 16,
  },
  textPreviewContent: {
    color: COLORS.white,
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  textInput: {
    backgroundColor: COLORS.inputBg,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: COLORS.text,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  colorPicker: {
    flexDirection: 'row',
    gap: 12,
  },
  colorSwatch: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  colorSwatchSelected: {
    borderWidth: 3,
    borderColor: COLORS.text,
    transform: [{ scale: 1.1 }],
  },

  // Photo story
  pickImageButton: {
    height: 220,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    backgroundColor: COLORS.inputBg,
  },
  pickImageIcon: {
    fontSize: 40,
    marginBottom: 8,
  },
  pickImageText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 4,
  },
  pickImageSubtext: {
    fontSize: 13,
    color: COLORS.muted,
  },
  imagePreviewContainer: {
    marginBottom: 16,
    alignItems: 'center',
  },
  imagePreview: {
    width: '100%',
    height: 300,
    borderRadius: 16,
    marginBottom: 10,
  },
  changeImageButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: COLORS.inputBg,
  },
  changeImageText: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.primary,
  },
  captionInput: {
    backgroundColor: COLORS.inputBg,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: COLORS.text,
    minHeight: 60,
    textAlignVertical: 'top',
  },
});
