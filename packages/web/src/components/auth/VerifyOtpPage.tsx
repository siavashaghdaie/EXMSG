import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, ArrowLeft } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { Button } from '../common/Button';
import { Toast } from '../common/Toast';

export const VerifyOtpPage: React.FC = () => {
  const navigate = useNavigate();
  const {
    pendingVerificationEmail,
    pendingOtpPurpose,
    verifyOtp,
    verifyLoginOtp,
    resendOtp,
    isLoading,
    error,
    clearError,
    clearPendingVerification,
  } = useAuthStore();

  const isLoginFlow = pendingOtpPurpose === 'login';

  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendMessage, setResendMessage] = useState('');
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Redirect if no pending email — send the user back to the right starting page
  useEffect(() => {
    if (!pendingVerificationEmail) {
      navigate(isLoginFlow ? '/login' : '/register');
    }
  }, [pendingVerificationEmail, isLoginFlow, navigate]);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  // Focus first input on mount
  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  const handleDigitChange = (index: number, value: string) => {
    // Only allow single digits
    if (value && !/^\d$/.test(value)) return;

    const newDigits = [...digits];
    newDigits[index] = value;
    setDigits(newDigits);

    // Auto-advance to next input
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all 6 digits are filled
    if (value && index === 5) {
      const code = newDigits.join('');
      if (code.length === 6) {
        handleVerify(code);
      }
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length > 0) {
      const newDigits = [...digits];
      for (let i = 0; i < pasted.length && i < 6; i++) {
        newDigits[i] = pasted[i];
      }
      setDigits(newDigits);
      // Focus appropriate input
      const focusIdx = Math.min(pasted.length, 5);
      inputRefs.current[focusIdx]?.focus();
      // Auto-submit if complete
      if (pasted.length === 6) {
        handleVerify(pasted);
      }
    }
  };

  const handleVerify = async (code?: string) => {
    const otpCode = code || digits.join('');
    if (otpCode.length !== 6 || !pendingVerificationEmail) return;

    try {
      if (isLoginFlow) {
        await verifyLoginOtp(pendingVerificationEmail, otpCode);
        navigate('/chat');
      } else {
        const result = await verifyOtp(pendingVerificationEmail, otpCode);
        // Panel Owner flow: spec 2.3.5 says newcomers return to /login after
        // verifying their email. verifyOtp() in the store already set the
        // justVerified* flags and skipped authentication.
        if (result?.requiresLogin) {
          navigate('/login');
        } else {
          navigate('/chat');
        }
      }
    } catch {
      // Error is set in store
      setDigits(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || !pendingVerificationEmail) return;

    try {
      await resendOtp(pendingVerificationEmail, isLoginFlow ? 'login' : 'register');
      setResendCooldown(60);
      setResendMessage('A new code has been sent to your email.');
      setTimeout(() => setResendMessage(''), 5000);
    } catch {
      // Error handled by store
    }
  };

  const handleBack = () => {
    clearPendingVerification();
    navigate(isLoginFlow ? '/login' : '/register');
  };

  const maskedEmail = pendingVerificationEmail
    ? pendingVerificationEmail.replace(/^(.{2})(.*)(@.*)$/, (_, a, b, c) => a + '*'.repeat(b.length) + c)
    : '';

  if (!pendingVerificationEmail) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 flex items-start justify-center py-8 px-4">
      {/* Background decoration */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-blue-200 dark:bg-blue-900/20 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob"></div>
        <div className="absolute top-40 right-10 w-72 h-72 bg-green-200 dark:bg-green-900/20 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-2000"></div>
        <div className="absolute -bottom-8 left-20 w-72 h-72 bg-purple-200 dark:bg-purple-900/20 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-4000"></div>
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Logo and Title */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="p-3 bg-gradient-to-br from-green-500 to-green-600 rounded-xl shadow-lg">
              <ShieldCheck className="h-8 w-8 text-white" />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            {isLoginFlow ? 'Two-Step Sign In' : 'Verify Your Email'}
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            {isLoginFlow
              ? 'Enter the code we just emailed you to finish signing in.'
              : <>We sent a 6-digit code to <strong className="text-gray-800 dark:text-gray-200">{maskedEmail}</strong></>}
          </p>
          {isLoginFlow && (
            <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
              Sent to <strong className="text-gray-700 dark:text-gray-300">{maskedEmail}</strong>
            </p>
          )}
        </div>

        {/* Error/Success Toast */}
        {error && <Toast message={error} type="error" onClose={clearError} />}
        {resendMessage && <Toast message={resendMessage} type="success" onClose={() => setResendMessage('')} />}

        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl p-8 space-y-6 border border-gray-200 dark:border-gray-800">
          {/* OTP Input Grid */}
          <div className="flex justify-center gap-3">
            {digits.map((digit, i) => (
              <input
                key={i}
                ref={(el) => { inputRefs.current[i] = el; }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleDigitChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                onPaste={i === 0 ? handlePaste : undefined}
                disabled={isLoading}
                className={`
                  w-12 h-14 text-center text-2xl font-bold rounded-lg border-2 transition-all
                  focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                  disabled:opacity-50 disabled:cursor-not-allowed
                  ${digit
                    ? 'border-blue-400 dark:border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                    : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white'
                  }
                `}
              />
            ))}
          </div>

          {/* Timer hint */}
          <p className="text-center text-sm text-gray-500 dark:text-gray-400">
            Code expires in 10 minutes
          </p>

          {/* Verify Button */}
          <Button
            type="button"
            fullWidth
            size="lg"
            isLoading={isLoading}
            disabled={isLoading || digits.join('').length !== 6}
            onClick={() => handleVerify()}
          >
            {isLoading ? 'Verifying...' : 'Verify & Continue'}
          </Button>

          {/* Resend */}
          <div className="text-center">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
              Didn't receive the code?
            </p>
            <button
              onClick={handleResend}
              disabled={resendCooldown > 0 || isLoading}
              className={`text-sm font-semibold transition-colors ${
                resendCooldown > 0
                  ? 'text-gray-400 dark:text-gray-500 cursor-not-allowed'
                  : 'text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 cursor-pointer'
              }`}
            >
              {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
            </button>
          </div>

          {/* Back link */}
          <button
            onClick={handleBack}
            className="flex items-center justify-center gap-2 w-full text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            {isLoginFlow ? 'Back to sign in' : 'Back to registration'}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes blob {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(30px, -50px) scale(1.1); }
          66% { transform: translate(-20px, 20px) scale(0.9); }
        }
        .animate-blob { animation: blob 7s infinite; }
        .animation-delay-2000 { animation-delay: 2s; }
        .animation-delay-4000 { animation-delay: 4s; }
      `}</style>
    </div>
  );
};
