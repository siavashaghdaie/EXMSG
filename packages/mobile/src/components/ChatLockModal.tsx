import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  TouchableOpacity,
  Animated,
  Keyboard,
  Platform,
} from 'react-native';

const COLORS = {
  primary: '#7C3AED',
  bg: '#FFFFFF',
  text: '#1E293B',
  secondary: '#64748B',
  muted: '#94A3B8',
  border: '#E2E8F0',
  red: '#EF4444',
  amber: '#F59E0B',
};

interface Props {
  visible: boolean;
  mode: 'unlock' | 'set' | 'confirm';
  onSubmit: (pin: string) => void;
  onCancel: () => void;
  error?: string | null;
}

export default function ChatLockModal({ visible, mode, onSubmit, onCancel, error }: Props) {
  const [pin, setPin] = useState('');
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) {
      setPin('');
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [visible]);

  useEffect(() => {
    if (error) {
      // Shake animation on error
      Animated.sequence([
        Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
      ]).start();
      setPin('');
    }
  }, [error]);

  const getTitle = () => {
    switch (mode) {
      case 'set': return 'Set Lock PIN';
      case 'confirm': return 'Confirm PIN';
      case 'unlock': return 'Enter PIN';
    }
  };

  const getSubtitle = () => {
    switch (mode) {
      case 'set': return 'Create a 4+ digit PIN to lock this chat';
      case 'confirm': return 'Re-enter your PIN to confirm';
      case 'unlock': return 'This chat is locked. Enter your PIN to access.';
    }
  };

  const handleSubmit = () => {
    if (pin.length >= 4) {
      onSubmit(pin);
    }
  };

  const dots = [];
  for (let i = 0; i < Math.max(pin.length, 4); i++) {
    dots.push(
      <View
        key={i}
        style={[
          styles.dot,
          i < pin.length ? styles.dotFilled : styles.dotEmpty,
        ]}
      />
    );
  }

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <Animated.View style={[styles.modal, { transform: [{ translateX: shakeAnim }] }]}>
          <View style={styles.lockIconContainer}>
            <Text style={styles.lockIcon}>{'🔒'}</Text>
          </View>

          <Text style={styles.title}>{getTitle()}</Text>
          <Text style={styles.subtitle}>{getSubtitle()}</Text>

          {error && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* PIN dots display */}
          <View style={styles.dotsRow}>{dots}</View>

          {/* Hidden text input */}
          <TextInput
            ref={inputRef}
            style={styles.hiddenInput}
            value={pin}
            onChangeText={(text) => {
              const cleaned = text.replace(/[^0-9]/g, '');
              setPin(cleaned);
            }}
            keyboardType="number-pad"
            maxLength={8}
            autoFocus
            caretHidden
          />

          {/* Tap to focus the hidden input */}
          <TouchableOpacity
            style={styles.tapArea}
            onPress={() => inputRef.current?.focus()}
            activeOpacity={1}
          >
            <Text style={styles.tapHint}>Tap to enter PIN</Text>
          </TouchableOpacity>

          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.submitBtn, pin.length < 4 && styles.submitBtnDisabled]}
              onPress={handleSubmit}
              disabled={pin.length < 4}
            >
              <Text style={styles.submitText}>
                {mode === 'unlock' ? 'Unlock' : mode === 'set' ? 'Next' : 'Confirm'}
              </Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modal: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: COLORS.bg,
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
  },
  lockIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#F5F3FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  lockIcon: { fontSize: 28 },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.secondary,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },
  errorContainer: {
    backgroundColor: '#FEF2F2',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginBottom: 16,
    width: '100%',
  },
  errorText: {
    fontSize: 13,
    color: COLORS.red,
    textAlign: 'center',
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  dotFilled: {
    backgroundColor: COLORS.amber,
  },
  dotEmpty: {
    backgroundColor: '#E2E8F0',
  },
  hiddenInput: {
    position: 'absolute',
    opacity: 0,
    height: 1,
    width: 1,
  },
  tapArea: {
    marginBottom: 20,
  },
  tapHint: {
    fontSize: 12,
    color: COLORS.muted,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.secondary,
  },
  submitBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
  },
  submitBtnDisabled: {
    opacity: 0.5,
  },
  submitText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
