import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  SafeAreaView,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AuthStackParamList } from '@/navigation/AuthNavigator';
import { useAuthStore } from '@/store/authStore';

type Props = NativeStackScreenProps<AuthStackParamList, 'VerifyOtp'>;

const CODE_LENGTH = 6;
const RESEND_COOLDOWN = 60;

export default function VerifyOtpScreen({ navigation, route }: Props) {
  const { email, purpose } = route.params;

  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN);
  const [resendLoading, setResendLoading] = useState(false);

  const inputRefs = useRef<(TextInput | null)[]>([]);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const {
    verifyOtp,
    verifyLoginOtp,
    resendOtp,
    isLoading,
    error,
    clearError,
  } = useAuthStore();

  // Start cooldown timer on mount
  useEffect(() => {
    cooldownRef.current = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          if (cooldownRef.current) clearInterval(cooldownRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (cooldownRef.current) clearInterval(cooldownRef.current);
    };
  }, []);

  // Focus first input on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      inputRefs.current[0]?.focus();
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  const handleDigitChange = useCallback(
    (text: string, index: number) => {
      if (error) clearError();

      // Handle paste of full code
      if (text.length > 1) {
        const pasted = text.replace(/[^0-9]/g, '').slice(0, CODE_LENGTH);
        if (pasted.length > 0) {
          const newDigits = Array(CODE_LENGTH).fill('');
          for (let i = 0; i < pasted.length; i++) {
            newDigits[i] = pasted[i];
          }
          setDigits(newDigits);
          // Focus the next empty field or the last filled field
          const focusIndex = Math.min(pasted.length, CODE_LENGTH - 1);
          inputRefs.current[focusIndex]?.focus();
          return;
        }
      }

      const digit = text.replace(/[^0-9]/g, '');
      const newDigits = [...digits];
      newDigits[index] = digit.slice(-1);
      setDigits(newDigits);

      // Auto-advance to next input
      if (digit && index < CODE_LENGTH - 1) {
        inputRefs.current[index + 1]?.focus();
      }
    },
    [digits, error, clearError]
  );

  const handleKeyPress = useCallback(
    (key: string, index: number) => {
      if (key === 'Backspace' && !digits[index] && index > 0) {
        const newDigits = [...digits];
        newDigits[index - 1] = '';
        setDigits(newDigits);
        inputRefs.current[index - 1]?.focus();
      }
    },
    [digits]
  );

  const handleVerify = async () => {
    const code = digits.join('');
    if (code.length !== CODE_LENGTH) return;
    clearError();

    try {
      if (purpose === 'login') {
        await verifyLoginOtp(email, code);
        // On success, store sets isAuthenticated = true, navigator will switch
      } else {
        const result = await verifyOtp(email, code);
        if (result.requiresLogin) {
          // Navigate back to Login; the store has set justVerifiedRequiresLogin
          navigation.navigate('Login');
        }
        // Otherwise auto-authenticated, navigator will switch
      }
    } catch {
      // error is set in store; clear digits so user can retry
      setDigits(Array(CODE_LENGTH).fill(''));
      inputRefs.current[0]?.focus();
    }
  };

  const handleResend = async () => {
    if (cooldown > 0 || resendLoading) return;
    setResendLoading(true);
    clearError();
    try {
      await resendOtp(email, purpose);
      setCooldown(RESEND_COOLDOWN);
      if (cooldownRef.current) clearInterval(cooldownRef.current);
      cooldownRef.current = setInterval(() => {
        setCooldown((prev) => {
          if (prev <= 1) {
            if (cooldownRef.current) clearInterval(cooldownRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch {
      // error set in store
    } finally {
      setResendLoading(false);
    }
  };

  const code = digits.join('');
  const isCodeComplete = code.length === CODE_LENGTH;
  const isLogin = purpose === 'login';

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Back Arrow */}
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Text style={styles.backArrow}>{'\u2190'}</Text>
          </TouchableOpacity>

          {/* Title */}
          <Text style={styles.title}>
            {isLogin ? 'Enter Login Code' : 'Verify Your Email'}
          </Text>
          <Text style={styles.subtitle}>
            We sent a 6-digit code to{'\n'}
            <Text style={styles.emailHighlight}>{email}</Text>
          </Text>

          {/* Error */}
          {error && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* OTP Digit Inputs */}
          <View style={styles.otpContainer}>
            {digits.map((digit, index) => (
              <TextInput
                key={index}
                ref={(ref) => {
                  inputRefs.current[index] = ref;
                }}
                style={[
                  styles.otpInput,
                  digit ? styles.otpInputFilled : null,
                ]}
                value={digit}
                onChangeText={(text) => handleDigitChange(text, index)}
                onKeyPress={({ nativeEvent }) =>
                  handleKeyPress(nativeEvent.key, index)
                }
                keyboardType="number-pad"
                maxLength={index === 0 ? CODE_LENGTH : 1}
                selectTextOnFocus
                editable={!isLoading}
              />
            ))}
          </View>

          {/* Verify Button */}
          <TouchableOpacity
            style={[
              styles.button,
              (!isCodeComplete || isLoading) && styles.buttonDisabled,
            ]}
            onPress={handleVerify}
            disabled={!isCodeComplete || isLoading}
            activeOpacity={0.8}
          >
            {isLoading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.buttonText}>Verify</Text>
            )}
          </TouchableOpacity>

          {/* Resend Code */}
          <View style={styles.resendContainer}>
            {cooldown > 0 ? (
              <Text style={styles.resendCooldown}>
                Resend code in {cooldown}s
              </Text>
            ) : (
              <TouchableOpacity
                onPress={handleResend}
                disabled={resendLoading}
              >
                {resendLoading ? (
                  <ActivityIndicator color="#7C3AED" size="small" />
                ) : (
                  <Text style={styles.resendAction}>Resend Code</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 32,
  },
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: 20,
    paddingVertical: 4,
    paddingRight: 8,
  },
  backArrow: {
    fontSize: 28,
    color: '#1E293B',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: '#64748B',
    lineHeight: 22,
    marginBottom: 32,
  },
  emailHighlight: {
    fontWeight: '600',
    color: '#1E293B',
  },
  errorContainer: {
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  errorText: {
    fontSize: 14,
    color: '#EF4444',
    textAlign: 'center',
  },
  otpContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 32,
  },
  otpInput: {
    width: 48,
    height: 56,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    fontSize: 22,
    fontWeight: '700',
    color: '#1E293B',
    textAlign: 'center',
  },
  otpInputFilled: {
    borderColor: '#7C3AED',
    backgroundColor: '#F5F3FF',
  },
  button: {
    backgroundColor: '#7C3AED',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  resendContainer: {
    alignItems: 'center',
    marginTop: 24,
    minHeight: 24,
  },
  resendCooldown: {
    fontSize: 15,
    color: '#64748B',
  },
  resendAction: {
    fontSize: 15,
    fontWeight: '600',
    color: '#7C3AED',
  },
});
