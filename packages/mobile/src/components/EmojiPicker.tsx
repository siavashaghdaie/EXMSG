import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Pressable,
} from 'react-native';

const COLORS = {
  primary: '#7C3AED',
  bg: '#FFFFFF',
  text: '#1E293B',
  secondary: '#64748B',
  muted: '#94A3B8',
  border: '#E2E8F0',
};

// Quick-access emoji grid (most popular reactions)
const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

const EMOJI_CATEGORIES: { label: string; emojis: string[] }[] = [
  {
    label: 'Smileys',
    emojis: ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😙', '🥲', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🫡', '🤐', '🤨', '😐', '😑', '😶', '🫥', '😏', '😒', '🙄', '😬', '🤥', '😌', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕', '🤢', '🤮', '🤧', '🥵', '🥶', '🥴', '😵', '🤯'],
  },
  {
    label: 'Gestures',
    emojis: ['👋', '🤚', '🖐️', '✋', '🖖', '🫱', '🫲', '🫳', '🫴', '👌', '🤌', '🤏', '✌️', '🤞', '🫰', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '🫵', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '🫶', '👐', '🤲', '🤝', '🙏'],
  },
  {
    label: 'Hearts',
    emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❤️‍🔥', '❤️‍🩹', '💕', '💞', '💓', '💗', '💖', '💘', '💝'],
  },
  {
    label: 'Objects',
    emojis: ['🎉', '🎊', '🎈', '🎁', '🏆', '🥇', '🥈', '🥉', '⭐', '🌟', '✨', '💡', '🔥', '💯', '✅', '❌', '⚡', '💪', '🎯', '🚀', '💰', '📌', '🔗', '📎', '🗓️', '📝', '📋', '📊'],
  },
];

interface EmojiPickerProps {
  visible: boolean;
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

export default function EmojiPicker({ visible, onSelect, onClose }: EmojiPickerProps) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.container} onPress={(e) => e.stopPropagation()}>
          {/* Quick emojis row */}
          <View style={styles.quickRow}>
            {QUICK_EMOJIS.map((emoji) => (
              <TouchableOpacity
                key={emoji}
                style={styles.quickEmoji}
                onPress={() => onSelect(emoji)}
              >
                <Text style={styles.quickEmojiText}>{emoji}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Full emoji grid */}
          <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
            {EMOJI_CATEGORIES.map((cat) => (
              <View key={cat.label} style={styles.category}>
                <Text style={styles.categoryLabel}>{cat.label}</Text>
                <View style={styles.emojiGrid}>
                  {cat.emojis.map((emoji) => (
                    <TouchableOpacity
                      key={emoji}
                      style={styles.emojiCell}
                      onPress={() => onSelect(emoji)}
                    >
                      <Text style={styles.emojiText}>{emoji}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// Inline quick-reaction bar (shown on long press before full picker)
export function QuickReactionBar({
  onSelect,
  onMore,
}: {
  onSelect: (emoji: string) => void;
  onMore: () => void;
}) {
  return (
    <View style={styles.quickBar}>
      {QUICK_EMOJIS.map((emoji) => (
        <TouchableOpacity key={emoji} style={styles.quickBarItem} onPress={() => onSelect(emoji)}>
          <Text style={styles.quickBarEmoji}>{emoji}</Text>
        </TouchableOpacity>
      ))}
      <TouchableOpacity style={styles.quickBarItem} onPress={onMore}>
        <Text style={styles.quickBarPlus}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: COLORS.bg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '60%',
    paddingBottom: 40,
  },
  quickRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  quickEmoji: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  quickEmojiText: { fontSize: 24 },
  scrollArea: {
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  category: {
    marginBottom: 16,
  },
  categoryLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.secondary,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  emojiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  emojiCell: {
    width: '12.5%',
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emojiText: { fontSize: 26 },

  // Quick reaction bar (inline above context menu)
  quickBar: {
    flexDirection: 'row',
    backgroundColor: COLORS.bg,
    borderRadius: 28,
    paddingHorizontal: 8,
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
    gap: 4,
  },
  quickBarItem: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quickBarEmoji: { fontSize: 22 },
  quickBarPlus: {
    fontSize: 20,
    color: COLORS.secondary,
    fontWeight: '600',
  },
});
