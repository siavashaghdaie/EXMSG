import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Image,
  Dimensions,
  ActivityIndicator,
  Alert,
  Animated,
  TouchableWithoutFeedback,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, StatusItem } from '@/services/api';
import { useAuthStore } from '@/store/authStore';
import { getFullUrl } from '@/utils/url';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const STORY_DURATION = 7000; // 7 seconds per story
const TICK_INTERVAL = 50; // update progress every 50ms

const COLORS = {
  white: '#FFFFFF',
  black: '#000000',
  overlay: 'rgba(0,0,0,0.9)',
  muted: 'rgba(255,255,255,0.6)',
  progress: 'rgba(255,255,255,0.3)',
  progressFill: '#FFFFFF',
  heart: '#EF4444',
  primary: '#7C3AED',
};

interface Props {
  visible: boolean;
  userId: string;
  userName?: string;
  onClose: () => void;
  onStoryDeleted?: () => void;
}

export default function StoryViewerModal({ visible, userId, userName, onClose, onStoryDeleted }: Props) {
  const [stories, setStories] = useState<StatusItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [showLikeHeart, setShowLikeHeart] = useState(false);
  const [isLiking, setIsLiking] = useState(false);
  const progressRef = useRef(0);
  const progressAnims = useRef<Animated.Value[]>([]);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const { user } = useAuthStore();
  const isOwnStory = userId === user?.id;

  const heartScale = useRef(new Animated.Value(0)).current;

  // Load stories when modal opens
  useEffect(() => {
    if (!visible) return;
    setIsLoading(true);
    setCurrentIndex(0);
    progressRef.current = 0;

    const loadStories = async () => {
      try {
        let loadedStories: StatusItem[] = [];
        if (isOwnStory) {
          const result = await api.getMyStatuses();
          loadedStories = result?.statuses || [];
        } else {
          const result = await api.getContactStatuses();
          const userGroup = (result?.users || []).find((u: any) => u.userId === userId);
          loadedStories = userGroup?.statuses || [];
        }
        setStories(loadedStories);
        // Initialize progress animations
        progressAnims.current = loadedStories.map(() => new Animated.Value(0));
      } catch (error) {
        console.error('[StoryViewer] Error loading stories:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadStories();
  }, [visible, userId, isOwnStory]);

  // Mark story as viewed
  useEffect(() => {
    if (!visible || stories.length === 0 || isOwnStory) return;
    const story = stories[currentIndex];
    if (story) {
      api.viewStatus(story.id).catch(() => {});
    }
  }, [currentIndex, stories, visible, isOwnStory]);

  // Auto-advance timer
  useEffect(() => {
    if (!visible || stories.length === 0 || isPaused || isDeleting || isLoading) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    progressRef.current = 0;
    if (progressAnims.current[currentIndex]) {
      progressAnims.current[currentIndex].setValue(0);
    }

    intervalRef.current = setInterval(() => {
      progressRef.current += (100 / (STORY_DURATION / TICK_INTERVAL));
      if (progressAnims.current[currentIndex]) {
        progressAnims.current[currentIndex].setValue(Math.min(progressRef.current, 100));
      }
      if (progressRef.current >= 100) {
        // Go to next story or close
        if (currentIndex < stories.length - 1) {
          setCurrentIndex((prev) => prev + 1);
        } else {
          handleClose();
        }
      }
    }, TICK_INTERVAL);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [visible, currentIndex, stories.length, isPaused, isDeleting, isLoading]);

  // Set completed stories' progress to 100
  useEffect(() => {
    progressAnims.current.forEach((anim, i) => {
      if (i < currentIndex) {
        anim.setValue(100);
      } else if (i > currentIndex) {
        anim.setValue(0);
      }
    });
  }, [currentIndex]);

  const handleClose = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setStories([]);
    setCurrentIndex(0);
    onClose();
  }, [onClose]);

  const goNext = useCallback(() => {
    if (currentIndex < stories.length - 1) {
      setCurrentIndex((prev) => prev + 1);
      progressRef.current = 0;
    } else {
      handleClose();
    }
  }, [currentIndex, stories.length, handleClose]);

  const goPrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
      progressRef.current = 0;
    }
  }, [currentIndex]);

  const handleTap = useCallback((evt: any) => {
    const x = evt.nativeEvent.locationX;
    if (x < SCREEN_WIDTH * 0.3) {
      goPrev();
    } else {
      goNext();
    }
  }, [goNext, goPrev]);

  const handleDoubleTap = useCallback(async () => {
    if (isOwnStory || isLiking) return;
    const story = stories[currentIndex];
    if (!story) return;

    setIsLiking(true);
    try {
      const result = await api.likeStatus(story.id);
      if (result.liked) {
        setShowLikeHeart(true);
        Animated.sequence([
          Animated.spring(heartScale, { toValue: 1, friction: 3, useNativeDriver: true }),
          Animated.timing(heartScale, { toValue: 0, duration: 400, delay: 600, useNativeDriver: true }),
        ]).start(() => setShowLikeHeart(false));
      }
      // Update story state
      const updated = [...stories];
      updated[currentIndex] = {
        ...updated[currentIndex],
        likedByMe: result.liked,
        likeCount: (updated[currentIndex].likeCount || 0) + (result.liked ? 1 : -1),
      };
      setStories(updated);
    } catch (error) {
      console.error('[StoryViewer] Error liking story:', error);
    } finally {
      setIsLiking(false);
    }
  }, [currentIndex, stories, isOwnStory, isLiking, heartScale]);

  const handleDelete = useCallback(() => {
    const story = stories[currentIndex];
    if (!story) return;

    Alert.alert('Delete Story', 'Are you sure you want to delete this story?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setIsDeleting(true);
          try {
            await api.deleteStatus(story.id);
            const remaining = stories.filter((_, i) => i !== currentIndex);
            setStories(remaining);
            progressAnims.current = remaining.map(() => new Animated.Value(0));
            if (remaining.length === 0) {
              onStoryDeleted?.();
              handleClose();
            } else if (currentIndex >= remaining.length) {
              setCurrentIndex(Math.max(0, remaining.length - 1));
            }
          } catch (error) {
            console.error('[StoryViewer] Error deleting story:', error);
            Alert.alert('Error', 'Failed to delete story.');
          } finally {
            setIsDeleting(false);
          }
        },
      },
    ]);
  }, [currentIndex, stories, handleClose, onStoryDeleted]);

  // Tap handling with double-tap detection
  const lastTapRef = useRef(0);
  const tapTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handlePress = useCallback((evt: any) => {
    const now = Date.now();
    const DOUBLE_TAP_DELAY = 300;

    if (now - lastTapRef.current < DOUBLE_TAP_DELAY) {
      // Double tap
      if (tapTimeoutRef.current) clearTimeout(tapTimeoutRef.current);
      handleDoubleTap();
    } else {
      // Wait to see if it's a double tap
      const x = evt.nativeEvent.locationX;
      tapTimeoutRef.current = setTimeout(() => {
        if (x < SCREEN_WIDTH * 0.3) {
          goPrev();
        } else {
          goNext();
        }
      }, DOUBLE_TAP_DELAY);
    }
    lastTapRef.current = now;
  }, [goNext, goPrev, handleDoubleTap]);

  if (!visible) return null;

  const currentStory = stories[currentIndex];

  const renderStoryContent = () => {
    if (isLoading) {
      return (
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={COLORS.white} />
        </View>
      );
    }

    if (!currentStory) {
      return (
        <View style={styles.centerContent}>
          <Text style={styles.noStoriesText}>No stories available</Text>
        </View>
      );
    }

    if (currentStory.type === 'text') {
      return (
        <View style={[styles.textStoryContainer, { backgroundColor: currentStory.bgColor || '#7C3AED' }]}>
          <Text style={styles.textStoryContent}>{currentStory.content}</Text>
        </View>
      );
    }

    // Image/video story
    const imageUrl = getFullUrl(currentStory.content);
    return (
      <View style={styles.imageStoryContainer}>
        {imageUrl && (
          <Image
            source={{ uri: imageUrl }}
            style={styles.storyImage}
            resizeMode="contain"
          />
        )}
        {currentStory.caption && (
          <View style={styles.captionContainer}>
            <Text style={styles.captionText}>{currentStory.caption}</Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      presentationStyle="fullScreen"
      onRequestClose={handleClose}
    >
      <View style={styles.container}>
        <TouchableWithoutFeedback
          onPress={handlePress}
          onLongPress={() => setIsPaused(true)}
          onPressOut={() => setIsPaused(false)}
        >
          <View style={styles.storyArea}>
            {/* Story content */}
            {renderStoryContent()}

            {/* Progress bars */}
            <SafeAreaView edges={['top']} style={styles.progressContainer}>
              <View style={styles.progressRow}>
                {stories.map((_, i) => (
                  <View key={i} style={styles.progressBarBg}>
                    <Animated.View
                      style={[
                        styles.progressBarFill,
                        {
                          width: progressAnims.current[i]
                            ? progressAnims.current[i].interpolate({
                                inputRange: [0, 100],
                                outputRange: ['0%', '100%'],
                                extrapolate: 'clamp',
                              })
                            : i < currentIndex ? '100%' : '0%',
                        },
                      ]}
                    />
                  </View>
                ))}
              </View>

              {/* Header */}
              <View style={styles.header}>
                <View style={styles.headerLeft}>
                  <View style={styles.headerAvatar}>
                    <Text style={styles.headerAvatarText}>
                      {(userName || 'U').charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View>
                    <Text style={styles.headerName}>{userName || 'User'}</Text>
                    {currentStory && (
                      <Text style={styles.headerTime}>
                        {formatStoryTime(currentStory.createdAt)}
                      </Text>
                    )}
                  </View>
                </View>
                <View style={styles.headerRight}>
                  {isOwnStory && (
                    <TouchableOpacity onPress={handleDelete} style={styles.headerButton}>
                      <Text style={styles.deleteIcon}>{'\uD83D\uDDD1'}</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity onPress={handleClose} style={styles.headerButton}>
                    <Text style={styles.closeIcon}>{'\u2715'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </SafeAreaView>

            {/* Like heart animation */}
            {showLikeHeart && (
              <View style={styles.heartContainer} pointerEvents="none">
                <Animated.Text
                  style={[
                    styles.heartEmoji,
                    { transform: [{ scale: heartScale }] },
                  ]}
                >
                  {'\u2764\uFE0F'}
                </Animated.Text>
              </View>
            )}

            {/* Bottom info */}
            {currentStory && !isOwnStory && (
              <SafeAreaView edges={['bottom']} style={styles.bottomBar}>
                <View style={styles.bottomContent}>
                  <TouchableOpacity
                    style={[styles.likeButton, currentStory.likedByMe && styles.likeButtonActive]}
                    onPress={handleDoubleTap}
                  >
                    <Text style={styles.likeEmoji}>
                      {currentStory.likedByMe ? '\u2764\uFE0F' : '\uD83E\uDD0D'}
                    </Text>
                    {(currentStory.likeCount || 0) > 0 && (
                      <Text style={styles.likeCount}>{currentStory.likeCount}</Text>
                    )}
                  </TouchableOpacity>
                  <Text style={styles.storyCounter}>
                    {currentIndex + 1} / {stories.length}
                  </Text>
                </View>
              </SafeAreaView>
            )}

            {/* Own story bottom info */}
            {currentStory && isOwnStory && (
              <SafeAreaView edges={['bottom']} style={styles.bottomBar}>
                <View style={styles.bottomContent}>
                  <View style={styles.viewCount}>
                    <Text style={styles.viewCountIcon}>{'\uD83D\uDC41'}</Text>
                    <Text style={styles.viewCountText}>
                      {currentStory.viewCount || 0} views
                    </Text>
                  </View>
                  {(currentStory.likeCount || 0) > 0 && (
                    <View style={styles.viewCount}>
                      <Text style={styles.likeEmoji}>{'\u2764\uFE0F'}</Text>
                      <Text style={styles.viewCountText}>{currentStory.likeCount} likes</Text>
                    </View>
                  )}
                  <Text style={styles.storyCounter}>
                    {currentIndex + 1} / {stories.length}
                  </Text>
                </View>
              </SafeAreaView>
            )}
          </View>
        </TouchableWithoutFeedback>
      </View>
    </Modal>
  );
}

function formatStoryTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.black,
  },
  storyArea: {
    flex: 1,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  noStoriesText: {
    color: COLORS.muted,
    fontSize: 16,
  },

  // Text stories
  textStoryContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  textStoryContent: {
    color: COLORS.white,
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
    lineHeight: 38,
  },

  // Image stories
  imageStoryContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.black,
  },
  storyImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.75,
  },
  captionContainer: {
    position: 'absolute',
    bottom: 100,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 12,
    padding: 12,
  },
  captionText: {
    color: COLORS.white,
    fontSize: 16,
    textAlign: 'center',
  },

  // Progress bars
  progressContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    paddingHorizontal: 8,
  },
  progressRow: {
    flexDirection: 'row',
    gap: 4,
    paddingTop: 8,
  },
  progressBarBg: {
    flex: 1,
    height: 3,
    backgroundColor: COLORS.progress,
    borderRadius: 1.5,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: COLORS.progressFill,
    borderRadius: 1.5,
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerAvatarText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '700',
  },
  headerName: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: '600',
  },
  headerTime: {
    color: COLORS.muted,
    fontSize: 12,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteIcon: {
    fontSize: 20,
    color: COLORS.white,
  },
  closeIcon: {
    fontSize: 20,
    color: COLORS.white,
    fontWeight: '600',
  },

  // Heart animation
  heartContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 20,
  },
  heartEmoji: {
    fontSize: 80,
  },

  // Bottom bar
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  bottomContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  likeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  likeButtonActive: {
    backgroundColor: 'rgba(239,68,68,0.2)',
  },
  likeEmoji: {
    fontSize: 18,
  },
  likeCount: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: '600',
  },
  storyCounter: {
    color: COLORS.muted,
    fontSize: 13,
  },
  viewCount: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  viewCountIcon: {
    fontSize: 16,
  },
  viewCountText: {
    color: COLORS.muted,
    fontSize: 13,
  },
});
